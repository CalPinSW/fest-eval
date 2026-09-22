import { priorityWeight, type Priority } from "./priority";
import type { ScheduledPerformance } from "./types";

export interface PickedPerformance extends ScheduledPerformance {
  priority: Priority;
}

export interface PlanOptions {
  /** Minutes needed to get between two different stages. */
  changeoverMinutes?: number;
}

export interface DayPlan {
  /** Performances to attend, in time order. */
  chosen: PickedPerformance[];
  /** Picked performances left out, each with the chosen set it lost to. */
  skipped: { performance: PickedPerformance; lostTo: PickedPerformance | null }[];
}

export function overlaps(a: ScheduledPerformance, b: ScheduledPerformance, changeoverMinutes = 0): boolean {
  const gap = a.stageId !== b.stageId ? changeoverMinutes * 60_000 : 0;
  return a.startsAt.getTime() < b.endsAt.getTime() + gap && b.startsAt.getTime() < a.endsAt.getTime() + gap;
}

/** For each performance id, the ids of the other performances it clashes with. */
export function findClashes(
  performances: ScheduledPerformance[],
  changeoverMinutes = 0,
): Map<string, string[]> {
  const clashes = new Map<string, string[]>(performances.map((p) => [p.id, []]));
  const sorted = [...performances].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const gap = changeoverMinutes * 60_000;
      if (sorted[j].startsAt.getTime() >= sorted[i].endsAt.getTime() + gap) break;
      if (overlaps(sorted[i], sorted[j], changeoverMinutes)) {
        clashes.get(sorted[i].id)!.push(sorted[j].id);
        clashes.get(sorted[j].id)!.push(sorted[i].id);
      }
    }
  }
  return clashes;
}

/**
 * Choose the set of non-clashing performances with the greatest total
 * priority weight (weighted interval scheduling). Only the best-scoring
 * performance of an artist playing twice is kept. Ties favour the plan that
 * ends earliest, which keeps results deterministic.
 */
export function planDay(performances: PickedPerformance[], options: PlanOptions = {}): DayPlan {
  const changeover = options.changeoverMinutes ?? 0;
  const byEnd = [...performances].sort(
    (a, b) =>
      a.endsAt.getTime() - b.endsAt.getTime() ||
      a.startsAt.getTime() - b.startsAt.getTime() ||
      a.id.localeCompare(b.id),
  );

  // best[j]: highest weight of a valid sequence ending with byEnd[j].
  const best: number[] = [];
  const prev: number[] = [];
  for (let j = 0; j < byEnd.length; j++) {
    let bestPrev = -1;
    let bestPrevScore = 0;
    for (let i = 0; i < j; i++) {
      if (!overlaps(byEnd[i], byEnd[j], changeover) && byEnd[i].endsAt <= byEnd[j].startsAt) {
        if (best[i] > bestPrevScore) {
          bestPrevScore = best[i];
          bestPrev = i;
        }
      }
    }
    best[j] = priorityWeight(byEnd[j].priority) + bestPrevScore;
    prev[j] = bestPrev;
  }

  let end = -1;
  for (let j = 0; j < byEnd.length; j++) if (end === -1 || best[j] > best[end]) end = j;

  const sequence: PickedPerformance[] = [];
  for (let k = end; k !== -1; k = prev[k]) sequence.unshift(byEnd[k]);

  // An artist playing twice only needs seeing once: keep the first.
  const seenArtists = new Set<string>();
  const chosen = sequence.filter((p) => {
    if (seenArtists.has(p.artistId)) return false;
    seenArtists.add(p.artistId);
    return true;
  });

  const chosenIds = new Set(chosen.map((p) => p.id));
  const skipped = performances
    .filter((p) => !chosenIds.has(p.id))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((performance) => ({
      performance,
      lostTo:
        chosen.find((c) => overlaps(c, performance, changeover)) ??
        chosen.find((c) => c.artistId === performance.artistId) ??
        null,
    }));

  return { chosen, skipped };
}
