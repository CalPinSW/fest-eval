export const PRIORITIES = [1, 2, 3, 4, 5] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: "Maybe",
  2: "Would like",
  3: "Want to see",
  4: "Really want",
  5: "Must see",
};

export function isPriority(value: unknown): value is Priority {
  return typeof value === "number" && (PRIORITIES as readonly number[]).includes(value);
}

/**
 * Weight used when choosing between clashing sets. Exponential so that one
 * higher-priority set outweighs two sets one level below it: a "must see"
 * (81) beats two "really want"s (54).
 */
export function priorityWeight(priority: Priority): number {
  return 3 ** (priority - 1);
}

/** How many tracks an artist gets in a generated playlist. */
export function tracksForPriority(priority: Priority): number {
  return priority * 2;
}
