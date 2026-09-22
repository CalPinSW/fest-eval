import { TZDate } from "@date-fns/tz";

/**
 * Festivals publish times in local wall-clock time, and a "day" at a festival
 * runs past midnight (a 01:30 headliner belongs to the previous evening). These
 * helpers convert between wall-clock strings and instants, and bucket instants
 * into festival days, always in the festival's own time zone.
 */

/** Matches the festivals.day_boundary_hour column default. */
export const DEFAULT_DAY_BOUNDARY_HOUR = 6;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** "2026-06-26 23:30" in `timeZone` -> the UTC instant. Throws on bad input. */
export function localDateTimeToInstant(local: string, timeZone: string): Date {
  const m = LOCAL_DATE_TIME.exec(local.trim());
  if (!m) throw new Error(`Invalid local date-time: "${local}"`);
  const [, y, mo, d, h, mi, s] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) {
    throw new Error(`Invalid local date-time: "${local}"`);
  }
  const date = new TZDate(y, mo - 1, d, h, mi, s || 0, timeZone);
  if (Number.isNaN(date.getTime()) || date.getDate() !== d) {
    throw new Error(`Invalid local date-time: "${local}"`);
  }
  return new Date(date.getTime());
}

/** The wall-clock parts of an instant in `timeZone`. */
function localParts(instant: Date, timeZone: string) {
  const d = new TZDate(instant.getTime(), timeZone);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Instant -> "YYYY-MM-DDTHH:mm" in `timeZone` (the format of datetime-local inputs). */
export function instantToLocalInput(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Instant -> "HH:mm" in `timeZone`. */
export function formatLocalTime(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * The festival day an instant belongs to, as "YYYY-MM-DD". Anything before
 * `boundaryHour` local time counts as the previous day.
 */
export function festivalDayOf(instant: Date, timeZone: string, boundaryHour: number): string {
  const shifted = new Date(instant.getTime() - boundaryHour * 3_600_000);
  // Shifting the instant rather than the wall clock is exact except in the
  // hour a DST change happens, which festivals do not schedule around.
  const p = localParts(shifted, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Start and end instants of festival day `day` ("YYYY-MM-DD"). */
export function festivalDayWindow(
  day: string,
  timeZone: string,
  boundaryHour: number,
): { start: Date; end: Date } {
  const m = LOCAL_DATE.exec(day);
  if (!m) throw new Error(`Invalid day: "${day}"`);
  const [, y, mo, d] = m.map(Number);
  const start = new TZDate(y, mo - 1, d, boundaryHour, 0, 0, timeZone);
  const end = new TZDate(y, mo - 1, d + 1, boundaryHour, 0, 0, timeZone);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/** Sorted, de-duplicated festival days covering the given instants. */
export function festivalDays(instants: Date[], timeZone: string, boundaryHour: number): string[] {
  return [...new Set(instants.map((i) => festivalDayOf(i, timeZone, boundaryHour)))].sort();
}

/** "2026-06-26" -> "Fri 26 Jun". */
export function formatDayLabel(day: string): string {
  const m = LOCAL_DATE.exec(day);
  if (!m) return day;
  const [, y, mo, d] = m.map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, mo - 1, d)));
}
