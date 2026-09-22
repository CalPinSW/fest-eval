"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/app/actions/result";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/**
 * A form bound to a server action, showing its error or success message.
 * Works without JavaScript; with it, pending state and messages are live.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  "aria-label": ariaLabel,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  "aria-label"?: string;
}) {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const next = await action(prev, form);
    return next;
  }, {});

  return (
    <form
      action={formAction}
      className={className}
      aria-label={ariaLabel}
      aria-busy={pending}
      key={resetOnSuccess && state.message ? state.message : undefined}
    >
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="mt-2 text-sm text-success">
        {state.message}
      </p>
    );
  }
  return null;
}
