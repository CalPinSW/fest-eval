import type { PostgrestError } from "@supabase/supabase-js";

/** An error safe to show to the user. */
export class UserFacingError extends Error {}

const UNIQUE_VIOLATION = "23505";
const RLS_VIOLATION = "42501";

export function isUniqueViolation(error: PostgrestError | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

export function isPermissionError(error: PostgrestError | null): boolean {
  return error?.code === RLS_VIOLATION;
}

type Result = { data: unknown; error: PostgrestError | null };

/** Throw on a Supabase error, translating permission failures. */
export function check<R extends Result>(result: R, action: string): Extract<R, { error: null }>["data"] {
  if (result.error) {
    if (isPermissionError(result.error)) throw new UserFacingError(`You don't have permission to ${action}.`);
    throw new Error(`Failed to ${action}: ${result.error.message}`);
  }
  return result.data as Extract<R, { error: null }>["data"];
}
