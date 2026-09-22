import { describe, expect, it } from "vitest";
import { isPriority, PRIORITIES, PRIORITY_LABELS, priorityWeight, tracksForPriority } from "./priority";

describe("priority", () => {
  it("labels every level", () => {
    for (const p of PRIORITIES) expect(PRIORITY_LABELS[p]).toBeTruthy();
  });

  it("validates values", () => {
    expect(isPriority(1)).toBe(true);
    expect(isPriority(5)).toBe(true);
    expect(isPriority(0)).toBe(false);
    expect(isPriority(6)).toBe(false);
    expect(isPriority(2.5)).toBe(false);
    expect(isPriority("3")).toBe(false);
  });

  it("weights grow fast enough that one level up beats two of the level below", () => {
    for (const p of [2, 3, 4, 5] as const) {
      expect(priorityWeight(p)).toBeGreaterThan(2 * priorityWeight((p - 1) as 1 | 2 | 3 | 4));
    }
  });

  it("gives higher priorities more playlist tracks, within Spotify's search page size", () => {
    expect(tracksForPriority(1)).toBe(2);
    expect(tracksForPriority(5)).toBe(10);
  });
});
