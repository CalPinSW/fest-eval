import type { ScheduledPerformance, Stage } from "./types";

export interface TimetableItem<P extends ScheduledPerformance = ScheduledPerformance> {
  performance: P;
  /** Minutes from the start of the grid. */
  offsetMinutes: number;
  durationMinutes: number;
  /** Sub-column within the stage, for overlapping sets on one stage. */
  lane: number;
  laneCount: number;
}

export interface TimetableColumn<P extends ScheduledPerformance = ScheduledPerformance> {
  stageId: string | null;
  stageName: string;
  items: TimetableItem<P>[];
}

export interface TimetableLayout<P extends ScheduledPerformance = ScheduledPerformance> {
  start: Date;
  end: Date;
  totalMinutes: number;
  /** Instants of each whole hour inside the grid, for the time axis. */
  hours: Date[];
  columns: TimetableColumn<P>[];
}

export const UNASSIGNED_STAGE_NAME = "Stage TBA";
const HOUR = 3_600_000;

/**
 * Lay out one day's performances as a stage-by-time grid. The grid spans whole
 * hours from the earliest start to the latest end. Stages keep their configured
 * order; stages with nothing on are dropped unless `keepEmptyStages` is set.
 */
export function layoutTimetable<P extends ScheduledPerformance>(
  performances: P[],
  stages: Stage[],
  options: { keepEmptyStages?: boolean } = {},
): TimetableLayout<P> | null {
  if (performances.length === 0) return null;

  const startMs = Math.min(...performances.map((p) => p.startsAt.getTime()));
  const endMs = Math.max(...performances.map((p) => p.endsAt.getTime()));
  const start = new Date(Math.floor(startMs / HOUR) * HOUR);
  const end = new Date(Math.ceil(endMs / HOUR) * HOUR);

  const hours: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += HOUR) hours.push(new Date(t));

  const orderedStages = [...stages].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const byStage = new Map<string | null, P[]>();
  for (const p of performances) {
    const key = p.stageId && orderedStages.some((s) => s.id === p.stageId) ? p.stageId : null;
    byStage.set(key, [...(byStage.get(key) ?? []), p]);
  }

  const columns: TimetableColumn<P>[] = orderedStages
    .filter((s) => options.keepEmptyStages || byStage.has(s.id))
    .map((s) => ({ stageId: s.id, stageName: s.name, items: placeItems(byStage.get(s.id) ?? [], start) }));

  if (byStage.has(null)) {
    columns.push({ stageId: null, stageName: UNASSIGNED_STAGE_NAME, items: placeItems(byStage.get(null)!, start) });
  }

  return { start, end, totalMinutes: (end.getTime() - start.getTime()) / 60_000, hours, columns };
}

/** Position items and assign lanes so overlapping sets sit side by side. */
function placeItems<P extends ScheduledPerformance>(performances: P[], gridStart: Date): TimetableItem<P>[] {
  const sorted = [...performances].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.endsAt.getTime() - b.endsAt.getTime(),
  );

  const items: TimetableItem<P>[] = [];
  // Overlapping runs of sets share a lane count; lanes reset between runs.
  let cluster: TimetableItem<P>[] = [];
  let clusterEnd = -Infinity;
  const laneEnds: number[] = [];

  const closeCluster = () => {
    const laneCount = Math.max(1, ...cluster.map((i) => i.lane + 1));
    for (const item of cluster) item.laneCount = laneCount;
    cluster = [];
    laneEnds.length = 0;
  };

  for (const p of sorted) {
    const s = p.startsAt.getTime();
    const e = p.endsAt.getTime();
    if (s >= clusterEnd) closeCluster();

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= s);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = e;

    const item: TimetableItem<P> = {
      performance: p,
      offsetMinutes: (s - gridStart.getTime()) / 60_000,
      durationMinutes: (e - s) / 60_000,
      lane,
      laneCount: 1,
    };
    items.push(item);
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, e);
  }
  closeCluster();
  return items;
}
