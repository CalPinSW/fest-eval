import { z } from "zod";
import { isValidTimeZone } from "@/lib/domain/time";

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);
const isoInstant = z.iso.datetime({ offset: true });
const optionalStage = trimmed(1, 80).nullable().optional();

function timesInOrder(value: { startsAt?: string | null; endsAt?: string | null }) {
  if (value.endsAt && !value.startsAt) return false;
  if (value.startsAt && value.endsAt) return new Date(value.endsAt) > new Date(value.startsAt);
  return true;
}
const timeOrderMessage = { message: "The end time must be after the start time", path: ["endsAt"] };

/**
 * A single change to a festival lineup. Applied directly by festival editors
 * and stored as the payload of an edit proposal for everyone else.
 */
export const lineupChangeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("add_performance"),
      artistName: trimmed(1, 200),
      stageName: optionalStage,
      startsAt: isoInstant.nullable().optional(),
      endsAt: isoInstant.nullable().optional(),
    })
    .refine(timesInOrder, timeOrderMessage),
  z
    .object({
      kind: z.literal("update_performance"),
      performanceId: z.uuid(),
      stageName: optionalStage,
      startsAt: isoInstant.nullable().optional(),
      endsAt: isoInstant.nullable().optional(),
    })
    .refine(timesInOrder, timeOrderMessage),
  z.object({
    kind: z.literal("remove_performance"),
    performanceId: z.uuid(),
  }),
]);

export type LineupChange = z.infer<typeof lineupChangeSchema>;

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/;
export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_PATTERN, "Usernames are 3–24 letters, numbers or underscores");

export const signUpSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
  username: usernameSchema,
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

const optionalDate = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.iso.date().nullable());

export const festivalInputSchema = z
  .object({
    name: trimmed(2, 120),
    location: z
      .string()
      .trim()
      .max(120)
      .transform((v) => v || null),
    timezone: z.string().trim().refine(isValidTimeZone, "Unknown time zone"),
    startsOn: optionalDate,
    endsOn: optionalDate,
  })
  .refine((f) => !f.startsOn || !f.endsOn || f.endsOn >= f.startsOn, {
    message: "The festival must end on or after its first day",
    path: ["endsOn"],
  });

export type FestivalInput = z.infer<typeof festivalInputSchema>;

/** First validation message, for showing next to a form. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}
