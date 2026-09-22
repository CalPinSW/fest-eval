import { cleanDisplayName, normalizeArtistName } from "@/lib/domain/artist-name";
import type { Database } from "@/lib/supabase/database.types";
import type { AppSupabaseClient, Tables } from "@/lib/supabase/types";
import { slugify, type FestivalInput, type LineupChange } from "@/lib/validation";
import { check, isUniqueViolation, UserFacingError } from "./errors";

export type Festival = Tables<"festivals">;

export interface LineupPerformance {
  id: string;
  artistId: string;
  artistName: string;
  normalizedName: string;
  stageId: string | null;
  stageName: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  source: "clashfinder" | "manual";
  externalKey: string | null;
  locallyModified: boolean;
}

export interface Lineup {
  stages: { id: string; name: string; sortOrder: number }[];
  performances: LineupPerformance[];
}

export async function listFestivals(client: AppSupabaseClient, search?: string): Promise<Festival[]> {
  let query = client.from("festivals").select("*").order("starts_on", { ascending: true, nullsFirst: false }).limit(100);
  if (search?.trim()) query = query.ilike("name", `%${search.trim().replace(/[%_]/g, "\\$&")}%`);
  return check(await query, "list festivals");
}

export async function getFestivalBySlug(client: AppSupabaseClient, slug: string): Promise<Festival | null> {
  return check(await client.from("festivals").select("*").eq("slug", slug).maybeSingle(), "load the festival");
}

export async function getLineup(client: AppSupabaseClient, festivalId: string): Promise<Lineup> {
  const [stages, performances] = await Promise.all([
    client.from("stages").select("id, name, sort_order").eq("festival_id", festivalId).order("sort_order"),
    client
      .from("performances")
      .select(
        "id, artist_id, stage_id, starts_at, ends_at, source, external_key, locally_modified, artists(name, normalized_name), stages(name)",
      )
      .eq("festival_id", festivalId)
      .order("starts_at", { ascending: true, nullsFirst: false }),
  ]);

  return {
    stages: check(stages, "load stages").map((s) => ({ id: s.id, name: s.name, sortOrder: s.sort_order })),
    performances: check(performances, "load the lineup").map((p) => ({
      id: p.id,
      artistId: p.artist_id,
      artistName: p.artists?.name ?? "Unknown",
      normalizedName: p.artists?.normalized_name ?? "",
      stageId: p.stage_id,
      stageName: p.stages?.name ?? null,
      startsAt: p.starts_at ? new Date(p.starts_at) : null,
      endsAt: p.ends_at ? new Date(p.ends_at) : null,
      source: p.source,
      externalKey: p.external_key,
      locallyModified: p.locally_modified,
    })),
  };
}

/** Distinct artists on a lineup, alphabetical. */
export function lineupArtists(lineup: Lineup) {
  const byId = new Map<string, { id: string; name: string; normalizedName: string; performances: LineupPerformance[] }>();
  for (const p of lineup.performances) {
    const entry = byId.get(p.artistId) ?? { id: p.artistId, name: p.artistName, normalizedName: p.normalizedName, performances: [] };
    entry.performances.push(p);
    byId.set(p.artistId, entry);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Find or create the catalogue artist for a display name. */
export async function ensureArtist(client: AppSupabaseClient, name: string): Promise<string> {
  const display = cleanDisplayName(name);
  const normalized = normalizeArtistName(display);
  if (!normalized) throw new UserFacingError("Artist name is empty");

  const existing = check(
    await client.from("artists").select("id").eq("normalized_name", normalized).maybeSingle(),
    "look up the artist",
  );
  if (existing) return existing.id;

  const inserted = await client.from("artists").insert({ name: display, normalized_name: normalized }).select("id").single();
  if (isUniqueViolation(inserted.error)) {
    // Someone created it between our read and write.
    const raced = check(
      await client.from("artists").select("id").eq("normalized_name", normalized).single(),
      "look up the artist",
    );
    return raced.id;
  }
  return check(inserted, "add the artist").id;
}

/** Find or create a stage by name. `null` name means no stage. */
export async function ensureStage(
  client: AppSupabaseClient,
  festivalId: string,
  name: string | null | undefined,
): Promise<string | null> {
  const display = name ? cleanDisplayName(name) : "";
  if (!display) return null;

  const existing = check(
    await client.from("stages").select("id").eq("festival_id", festivalId).eq("name", display).maybeSingle(),
    "look up the stage",
  );
  if (existing) return existing.id;

  const { data: last } = await client
    .from("stages")
    .select("sort_order")
    .eq("festival_id", festivalId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const inserted = await client
    .from("stages")
    .insert({ festival_id: festivalId, name: display, sort_order: (last?.sort_order ?? -1) + 1 })
    .select("id")
    .single();
  if (isUniqueViolation(inserted.error)) {
    return check(
      await client.from("stages").select("id").eq("festival_id", festivalId).eq("name", display).single(),
      "look up the stage",
    ).id;
  }
  return check(inserted, "add the stage").id;
}

/**
 * Apply one lineup change as the given client. RLS makes this fail unless
 * the client may edit the festival. Imported rows edited by a person are
 * flagged so the next Clashfinder sync leaves them alone.
 */
export async function applyLineupChange(
  client: AppSupabaseClient,
  festivalId: string,
  change: LineupChange,
): Promise<{ performanceId: string | null }> {
  switch (change.kind) {
    case "add_performance": {
      const artistId = await ensureArtist(client, change.artistName);
      const stageId = await ensureStage(client, festivalId, change.stageName);
      const row = check(
        await client
          .from("performances")
          .insert({
            festival_id: festivalId,
            artist_id: artistId,
            stage_id: stageId,
            starts_at: change.startsAt ?? null,
            ends_at: change.endsAt ?? null,
            source: "manual",
          })
          .select("id")
          .single(),
        "add the performance",
      );
      return { performanceId: row.id };
    }

    case "update_performance": {
      const updates: Database["public"]["Tables"]["performances"]["Update"] = { locally_modified: true };
      if (change.stageName !== undefined) updates.stage_id = await ensureStage(client, festivalId, change.stageName);
      if (change.startsAt !== undefined) updates.starts_at = change.startsAt;
      if (change.endsAt !== undefined) updates.ends_at = change.endsAt;
      const rows = check(
        await client
          .from("performances")
          .update(updates)
          .eq("id", change.performanceId)
          .eq("festival_id", festivalId)
          .select("id"),
        "update the performance",
      );
      if (rows.length === 0) throw new UserFacingError("That performance no longer exists, or you can't edit it.");
      return { performanceId: change.performanceId };
    }

    case "remove_performance": {
      const rows = check(
        await client.from("performances").delete().eq("id", change.performanceId).eq("festival_id", festivalId).select("id"),
        "remove the performance",
      );
      if (rows.length === 0) throw new UserFacingError("That performance no longer exists, or you can't edit it.");
      return { performanceId: null };
    }
  }
}

/** Create a community festival owned by the current user, with a unique slug. */
export async function createFestival(client: AppSupabaseClient, userId: string, input: FestivalInput): Promise<Festival> {
  const base = slugify(input.name) || "festival";
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base.slice(0, 55)}-${attempt + 1}`;
    const result = await client
      .from("festivals")
      .insert({
        slug,
        name: input.name,
        location: input.location,
        timezone: input.timezone,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        created_by: userId,
      })
      .select("*")
      .single();
    if (isUniqueViolation(result.error)) continue;
    return check(result, "create the festival");
  }
  throw new UserFacingError("Couldn't find a free web address for that festival name. Try a more specific name.");
}

export async function canEditFestival(client: AppSupabaseClient, userId: string | null, festivalId: string) {
  if (!userId) return false;
  const { data } = await client.rpc("can_edit_festival", { uid: userId, fid: festivalId });
  return data === true;
}
