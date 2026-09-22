import type { ClashfinderEvent } from "@/lib/clashfinder/parse";
import { planLineupSync, type SyncPlan } from "@/lib/domain/lineup-sync";
import { DEFAULT_DAY_BOUNDARY_HOUR, festivalDays } from "@/lib/domain/time";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { slugify } from "@/lib/validation";
import { check, isUniqueViolation } from "./errors";
import { ensureArtist, ensureStage, getLineup } from "./lineup";

export interface SyncSummary {
  inserted: number;
  updated: number;
  deleted: number;
  keptLocalEdits: number;
  matchedManual: number;
  unchanged: number;
  rejected: ClashfinderEvent["rejected"];
}

/**
 * Bring a festival's imported lineup in line with a Clashfinder event. Runs
 * with the service-role client (cron) or a moderator's client (manual import).
 */
export async function applyClashfinderEvent(
  client: AppSupabaseClient,
  festivalId: string,
  event: ClashfinderEvent,
  now: Date = new Date(),
): Promise<SyncSummary> {
  const lineup = await getLineup(client, festivalId);
  const plan: SyncPlan = planLineupSync(
    lineup.performances.map((p) => ({
      id: p.id,
      source: p.source,
      externalKey: p.externalKey,
      locallyModified: p.locallyModified,
      artistName: p.artistName,
      stageName: p.stageName,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
    })),
    event.acts,
  );

  // Keep Clashfinder's stage order for stages it introduces.
  const stageIds = new Map<string, string | null>();
  for (const name of event.stages) stageIds.set(name, await ensureStage(client, festivalId, name));
  const stageId = async (name: string) => stageIds.get(name) ?? ensureStage(client, festivalId, name);

  for (const act of plan.inserts) {
    check(
      await client.from("performances").insert({
        festival_id: festivalId,
        artist_id: await ensureArtist(client, act.artistName),
        stage_id: await stageId(act.stageName),
        starts_at: act.startsAt.toISOString(),
        ends_at: act.endsAt.toISOString(),
        source: "clashfinder",
        external_key: act.externalKey,
      }),
      "import a performance",
    );
  }

  for (const { id, incoming } of plan.updates) {
    check(
      await client
        .from("performances")
        .update({
          artist_id: await ensureArtist(client, incoming.artistName),
          stage_id: await stageId(incoming.stageName),
          starts_at: incoming.startsAt.toISOString(),
          ends_at: incoming.endsAt.toISOString(),
        })
        .eq("id", id),
      "update an imported performance",
    );
  }

  if (plan.deletes.length > 0) {
    check(await client.from("performances").delete().in("id", plan.deletes), "remove cancelled performances");
  }

  // A hand-added set that Clashfinder now lists becomes an imported row, so
  // future upstream changes flow through (unless someone edits it again).
  for (const { id, incoming } of plan.matchedManual) {
    const adopted = await client
      .from("performances")
      .update({
        source: "clashfinder",
        external_key: incoming.externalKey,
        stage_id: await stageId(incoming.stageName),
        starts_at: incoming.startsAt.toISOString(),
        ends_at: incoming.endsAt.toISOString(),
      })
      .eq("id", id);
    // Leave the manual row alone if the key is somehow already taken.
    if (!isUniqueViolation(adopted.error)) check(adopted, "link a performance to Clashfinder");
  }

  check(await client.from("festivals").update({ last_synced_at: now.toISOString() }).eq("id", festivalId), "record the sync");

  return {
    inserted: plan.inserts.length,
    updated: plan.updates.length,
    deleted: plan.deletes.length,
    keptLocalEdits: plan.keptLocalEdits.length,
    matchedManual: plan.matchedManual.length,
    unchanged: plan.unchanged,
    rejected: event.rejected,
  };
}

/** Create a festival for a Clashfinder event (service role only). */
export async function createFestivalFromClashfinder(
  client: AppSupabaseClient,
  clashfinderId: string,
  event: ClashfinderEvent,
  createdBy: string | null,
): Promise<{ id: string; slug: string }> {
  const days = festivalDays(
    event.acts.map((a) => a.startsAt),
    event.timezone,
    DEFAULT_DAY_BOUNDARY_HOUR,
  );
  const name = event.name ?? clashfinderId;
  const base = slugify(name) || slugify(clashfinderId) || "festival";

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base.slice(0, 55)}-${attempt + 1}`;
    const result = await client
      .from("festivals")
      .insert({
        slug,
        name,
        timezone: event.timezone,
        starts_on: days[0] ?? null,
        ends_on: days.at(-1) ?? null,
        clashfinder_id: clashfinderId,
        created_by: createdBy,
      })
      .select("id, slug")
      .single();
    if (isUniqueViolation(result.error) && !result.error?.message.includes("clashfinder_id")) continue;
    return check(result, "create the festival");
  }
  throw new Error("Could not find a free slug for the imported festival");
}
