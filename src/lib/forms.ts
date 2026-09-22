import { isPriority, type Priority } from "@/lib/domain/priority";
import { localDateTimeToInstant } from "@/lib/domain/time";
import { UserFacingError } from "@/lib/data/errors";
import { lineupChangeSchema, type LineupChange } from "@/lib/validation";

type FormLike = Pick<FormData, "get">;

const text = (form: FormLike, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

/** A datetime-local value in the festival's zone -> ISO instant, or null if blank. */
function instant(form: FormLike, name: string, timeZone: string): string | null {
  const value = text(form, name);
  if (!value) return null;
  try {
    return localDateTimeToInstant(value, timeZone).toISOString();
  } catch {
    throw new UserFacingError("Enter times as a date and time.");
  }
}

/**
 * Turn a lineup form submission into a validated change. Times are entered in
 * the festival's local time. For updates, blank fields clear the value.
 */
export function parseLineupForm(form: FormLike, timeZone: string): LineupChange {
  const kind = text(form, "kind");
  const stage = text(form, "stageName") || null;

  const raw =
    kind === "add_performance"
      ? {
          kind,
          artistName: text(form, "artistName"),
          stageName: stage,
          startsAt: instant(form, "startsAt", timeZone),
          endsAt: instant(form, "endsAt", timeZone),
        }
      : kind === "update_performance"
        ? {
            kind,
            performanceId: text(form, "performanceId"),
            stageName: stage,
            startsAt: instant(form, "startsAt", timeZone),
            endsAt: instant(form, "endsAt", timeZone),
          }
        : { kind, performanceId: text(form, "performanceId") };

  const parsed = lineupChangeSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "artistName") throw new UserFacingError("Enter the artist's name.");
    if (issue?.path[0] === "endsAt") throw new UserFacingError("The end time must be after the start time, and needs one.");
    throw new UserFacingError("That change doesn't look right. Check the fields and try again.");
  }
  return parsed.data;
}

/** "" or "0" clears a pick; "1"-"5" sets its priority. */
export function parsePriority(value: FormDataEntryValue | null): Priority | null {
  if (value === null || value === "" || value === "0") return null;
  const n = Number(value);
  if (!isPriority(n)) throw new UserFacingError("Priority must be between 1 and 5.");
  return n;
}
