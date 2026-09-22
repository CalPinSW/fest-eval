import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { UserFacingError } from "@/lib/data/errors";
import { firstIssue } from "@/lib/validation";

export interface ActionState {
  error?: string;
  message?: string;
}

/** Run an action body, turning expected failures into form-friendly state. */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? {};
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof UserFacingError) return { error: error.message };
    if (error instanceof ZodError) return { error: firstIssue(error) };
    console.error(error);
    return { error: "Something went wrong. Please try again." };
  }
}
