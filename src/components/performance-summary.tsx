import { festivalDayOf, formatDayLabel, formatLocalTime } from "@/lib/domain/time";

/** "Fri 26 Jun 21:00–22:30 · Pyramid", in the festival's own time zone. */
export function describePerformance(
  p: { startsAt: Date | null; endsAt: Date | null; stageName: string | null },
  timeZone: string,
  boundaryHour: number,
): string {
  const when = p.startsAt
    ? `${formatDayLabel(festivalDayOf(p.startsAt, timeZone, boundaryHour))} ${formatLocalTime(p.startsAt, timeZone)}${
        p.endsAt ? `–${formatLocalTime(p.endsAt, timeZone)}` : ""
      }`
    : "Time TBA";
  return p.stageName ? `${when} · ${p.stageName}` : when;
}
