import { z } from "zod";
import { cleanDisplayName } from "@/lib/domain/artist-name";
import { isValidTimeZone, localDateTimeToInstant } from "@/lib/domain/time";

/**
 * Clashfinder event feed (https://clashfinder.com/data/event/<id>.json).
 *
 * The feed is licensed CC BY-NC 3.0: free for non-commercial use with
 * attribution. It is someone else's JSON, so every field is treated as
 * optional and bad entries are dropped (and reported) rather than failing the
 * whole import.
 */
const feedSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  timezone: z.string().optional(),
  tzOffset: z.number().optional(),
  auth: z.object({ result: z.string().optional() }).passthrough().optional(),
  locations: z
    .array(
      z
        .object({
          name: z.string().optional(),
          events: z
            .array(
              z
                .object({
                  name: z.string().optional(),
                  short: z.string().optional(),
                  start: z.string().optional(),
                  end: z.string().optional(),
                })
                .passthrough(),
            )
            .optional(),
        })
        .passthrough(),
    )
    .optional(),
});

export interface ClashfinderAct {
  externalKey: string;
  artistName: string;
  stageName: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ClashfinderEvent {
  id: string | null;
  name: string | null;
  timezone: string;
  stages: string[];
  acts: ClashfinderAct[];
  /** Entries that could not be imported, with the reason. */
  rejected: { entry: string; reason: string }[];
}

export class ClashfinderError extends Error {}

export function parseClashfinderEvent(json: unknown, fallbackTimeZone = "Europe/London"): ClashfinderEvent {
  const parsed = feedSchema.safeParse(json);
  if (!parsed.success) throw new ClashfinderError("Clashfinder returned an unexpected response");
  const feed = parsed.data;

  if (feed.auth?.result && feed.auth.result !== "pass") {
    throw new ClashfinderError(`Clashfinder authentication failed: ${feed.auth.result}`);
  }

  const timezone = feed.timezone && isValidTimeZone(feed.timezone) ? feed.timezone : fallbackTimeZone;
  const stages: string[] = [];
  const acts: ClashfinderAct[] = [];
  const rejected: ClashfinderEvent["rejected"] = [];
  const seenKeys = new Set<string>();

  for (const location of feed.locations ?? []) {
    const stageName = location.name?.trim();
    if (!stageName) continue;
    if (!stages.includes(stageName)) stages.push(stageName);

    for (const entry of location.events ?? []) {
      const artistName = entry.name ? cleanDisplayName(entry.name) : "";
      const label = artistName || entry.short || "(unnamed)";
      if (!artistName) {
        rejected.push({ entry: label, reason: "missing name" });
        continue;
      }
      if (!entry.start || !entry.end) {
        rejected.push({ entry: label, reason: "missing start or end time" });
        continue;
      }

      let startsAt: Date;
      let endsAt: Date;
      try {
        startsAt = localDateTimeToInstant(entry.start, timezone);
        endsAt = localDateTimeToInstant(entry.end, timezone);
      } catch {
        rejected.push({ entry: label, reason: "unreadable time" });
        continue;
      }
      if (endsAt <= startsAt) {
        rejected.push({ entry: label, reason: "ends before it starts" });
        continue;
      }

      const externalKey = entry.short?.trim() || `${stageName}|${artistName}|${entry.start}`;
      if (seenKeys.has(externalKey)) {
        rejected.push({ entry: label, reason: "duplicate entry" });
        continue;
      }
      seenKeys.add(externalKey);
      acts.push({ externalKey, artistName, stageName, startsAt, endsAt });
    }
  }

  return { id: feed.id ?? null, name: feed.name ?? null, timezone, stages, acts, rejected };
}
