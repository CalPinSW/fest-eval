import { normalizeArtistName } from "./artist-name";

/** A performance already stored for the festival. */
export interface ExistingPerformance {
  id: string;
  source: "clashfinder" | "manual";
  externalKey: string | null;
  locallyModified: boolean;
  artistName: string;
  stageName: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** A performance as the upstream source currently lists it. */
export interface IncomingPerformance {
  externalKey: string;
  artistName: string;
  stageName: string;
  startsAt: Date;
  endsAt: Date;
}

export interface SyncPlan {
  inserts: IncomingPerformance[];
  updates: { id: string; incoming: IncomingPerformance }[];
  deletes: string[];
  /** Imported rows a person has edited: upstream changes are not applied. */
  keptLocalEdits: string[];
  /** Upstream acts that match a performance someone added by hand. */
  matchedManual: { id: string; incoming: IncomingPerformance }[];
  unchanged: number;
}

const sameTime = (a: Date | null, b: Date) => a !== null && a.getTime() === b.getTime();

function differs(existing: ExistingPerformance, incoming: IncomingPerformance): boolean {
  return (
    normalizeArtistName(existing.artistName) !== normalizeArtistName(incoming.artistName) ||
    existing.artistName !== incoming.artistName ||
    existing.stageName !== incoming.stageName ||
    !sameTime(existing.startsAt, incoming.startsAt) ||
    !sameTime(existing.endsAt, incoming.endsAt)
  );
}

/**
 * Work out how to bring a festival's lineup in line with the upstream feed.
 *
 * - Imported rows are matched on the upstream key; changed ones are updated
 *   and ones that vanished upstream are deleted.
 * - Imported rows someone has edited (`locallyModified`) are never touched:
 *   community corrections win over the feed.
 * - Hand-added rows are never touched. If the feed now lists the same artist
 *   at the same start time, the upstream act is recorded as `matchedManual`
 *   instead of being inserted twice.
 */
export function planLineupSync(existing: ExistingPerformance[], incoming: IncomingPerformance[]): SyncPlan {
  const plan: SyncPlan = { inserts: [], updates: [], deletes: [], keptLocalEdits: [], matchedManual: [], unchanged: 0 };

  const imported = new Map(
    existing.filter((e) => e.source === "clashfinder" && e.externalKey).map((e) => [e.externalKey!, e]),
  );
  const manual = existing.filter((e) => e.source === "manual");
  const claimedManual = new Set<string>();
  const incomingKeys = new Set(incoming.map((i) => i.externalKey));

  for (const act of incoming) {
    const current = imported.get(act.externalKey);
    if (current) {
      if (current.locallyModified) {
        if (differs(current, act)) plan.keptLocalEdits.push(current.id);
        else plan.unchanged++;
      } else if (differs(current, act)) {
        plan.updates.push({ id: current.id, incoming: act });
      } else {
        plan.unchanged++;
      }
      continue;
    }

    const handAdded = manual.find(
      (m) =>
        !claimedManual.has(m.id) &&
        normalizeArtistName(m.artistName) === normalizeArtistName(act.artistName) &&
        sameTime(m.startsAt, act.startsAt),
    );
    if (handAdded) {
      claimedManual.add(handAdded.id);
      plan.matchedManual.push({ id: handAdded.id, incoming: act });
      continue;
    }

    plan.inserts.push(act);
  }

  for (const [key, row] of imported) {
    if (incomingKeys.has(key)) continue;
    if (row.locallyModified) plan.keptLocalEdits.push(row.id);
    else plan.deletes.push(row.id);
  }

  return plan;
}
