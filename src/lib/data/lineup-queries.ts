import { festivalDayOf, festivalDayWindow } from "@/lib/domain/time";
import type { ScheduledPerformance, Stage } from "@/lib/domain/types";
import type { MusicProviderId } from "@/lib/music/types";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { check } from "./errors";
import { fetchAllRows, type LineupPerformance } from "./lineup";

/**
 * Page-sized lineup queries. Festival pages use these instead of loading the
 * whole lineup, which for a festival like Glastonbury is thousands of rows.
 */

export const LINEUP_PAGE_SIZE = 100;

export interface LineupArtist {
  id: string;
  name: string;
  normalizedName: string;
  performances: LineupPerformance[];
}

interface PerformanceJson {
  id: string;
  stageId: string | null;
  stageName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  source: "clashfinder" | "manual";
  externalKey: string | null;
  locallyModified: boolean;
}

/** Escape LIKE wildcards so a search for "100%" matches literally. */
export function escapeLikePattern(search: string): string {
  return search.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function getLineupPage(
  client: AppSupabaseClient,
  festivalId: string,
  options: { search?: string; onlyArtistIds?: string[]; page?: number; pageSize?: number } = {},
): Promise<{ artists: LineupArtist[]; total: number }> {
  if (options.onlyArtistIds && options.onlyArtistIds.length === 0) return { artists: [], total: 0 };
  const pageSize = options.pageSize ?? LINEUP_PAGE_SIZE;
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const search = options.search?.trim();

  const rows = check(
    await client.rpc("festival_lineup_page", {
      fid: festivalId,
      search: search ? escapeLikePattern(search) : undefined,
      only_artist_ids: options.onlyArtistIds,
      page_offset: (page - 1) * pageSize,
      page_limit: pageSize,
    }),
    "load the lineup",
  );

  return {
    total: Number(rows[0]?.total_count ?? 0),
    artists: rows.map((row) => ({
      id: row.artist_id,
      name: row.artist_name,
      normalizedName: row.normalized_name,
      performances: (row.performances as unknown as PerformanceJson[]).map((p) => ({
        id: p.id,
        artistId: row.artist_id,
        artistName: row.artist_name,
        normalizedName: row.normalized_name,
        stageId: p.stageId,
        stageName: p.stageName,
        startsAt: p.startsAt ? new Date(p.startsAt) : null,
        endsAt: p.endsAt ? new Date(p.endsAt) : null,
        source: p.source,
        externalKey: p.externalKey,
        locallyModified: p.locallyModified,
      })),
    })),
  };
}

/** Every artist in `artistIds` that plays the festival (e.g. a user's picks). */
export async function getLineupArtistsByIds(
  client: AppSupabaseClient,
  festivalId: string,
  artistIds: string[],
): Promise<LineupArtist[]> {
  const artists: LineupArtist[] = [];
  for (let page = 1; ; page++) {
    const result = await getLineupPage(client, festivalId, { onlyArtistIds: artistIds, page, pageSize: 500 });
    artists.push(...result.artists);
    if (artists.length >= result.total || result.artists.length === 0) return artists;
  }
}

export async function getStages(client: AppSupabaseClient, festivalId: string): Promise<Stage[]> {
  const rows = check(
    await client.from("stages").select("id, name, sort_order").eq("festival_id", festivalId).order("sort_order"),
    "load stages",
  );
  return rows.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sort_order }));
}

/** Festival days with scheduled sets, as "YYYY-MM-DD". */
export async function getFestivalDays(client: AppSupabaseClient, festivalId: string): Promise<string[]> {
  const rows = check(await client.rpc("festival_days", { fid: festivalId }), "load festival days");
  return rows.map((r) => r.day);
}

/** Scheduled performances on one festival day. */
export async function getDayPerformances(
  client: AppSupabaseClient,
  festival: { id: string; timezone: string; day_boundary_hour: number },
  day: string,
): Promise<ScheduledPerformance[]> {
  const { start, end } = festivalDayWindow(day, festival.timezone, festival.day_boundary_hour);
  const rows = await fetchAllRows(
    (from, to) =>
      client
        .from("performances")
        .select("id, artist_id, stage_id, starts_at, ends_at, artists(name), stages(name)")
        .eq("festival_id", festival.id)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .not("ends_at", "is", null)
        .order("starts_at")
        .order("id")
        .range(from, to),
    "load the timetable",
  );
  return rows
    .map((p) => ({
      id: p.id,
      artistId: p.artist_id,
      artistName: p.artists?.name ?? "Unknown",
      stageId: p.stage_id,
      stageName: p.stages?.name ?? null,
      startsAt: new Date(p.starts_at!),
      endsAt: new Date(p.ends_at!),
    }))
    .filter((p) => festivalDayOf(p.startsAt, festival.timezone, festival.day_boundary_hour) === day);
}

/** Names of artists whose set times haven't been announced. */
export async function getUnscheduledArtistNames(client: AppSupabaseClient, festivalId: string): Promise<string[]> {
  const rows = await fetchAllRows(
    (from, to) =>
      client
        .from("performances")
        .select("id, artists(name)")
        .eq("festival_id", festivalId)
        .or("starts_at.is.null,ends_at.is.null")
        .order("id")
        .range(from, to),
    "load unscheduled sets",
  );
  return [...new Set(rows.map((r) => r.artists?.name ?? "Unknown"))].sort((a, b) => a.localeCompare(b));
}

/** Lineup artists the signed-in user follows on a streaming service. */
export async function getLikedLineupArtists(client: AppSupabaseClient, festivalId: string) {
  const rows = check(await client.rpc("festival_liked_artists", { fid: festivalId }), "load suggestions");
  return rows.map((r) => ({
    artist: { id: r.artist_id, name: r.artist_name, normalizedName: r.normalized_name },
    providers: r.providers as MusicProviderId[],
  }));
}

/** Specific performances of a festival, keyed by id (e.g. ones named in proposals). */
export async function getPerformancesByIds(
  client: AppSupabaseClient,
  festivalId: string,
  ids: string[],
): Promise<Map<string, LineupPerformance>> {
  const result = new Map<string, LineupPerformance>();
  for (let i = 0; i < ids.length; i += 200) {
    const rows = check(
      await client
        .from("performances")
        .select(
          "id, artist_id, stage_id, starts_at, ends_at, source, external_key, locally_modified, artists(name, normalized_name), stages(name)",
        )
        .eq("festival_id", festivalId)
        .in("id", ids.slice(i, i + 200)),
      "load performances",
    );
    for (const p of rows) {
      result.set(p.id, {
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
      });
    }
  }
  return result;
}
