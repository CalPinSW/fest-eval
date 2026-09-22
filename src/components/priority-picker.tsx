"use client";

import { useActionState, useOptimistic, useTransition } from "react";
import { setPickAction } from "@/app/actions/picks";
import type { ActionState } from "@/app/actions/result";
import { PRIORITIES, PRIORITY_LABELS, type Priority } from "@/lib/domain/priority";

export const PRIORITY_BG: Record<Priority, string> = {
  1: "bg-p1",
  2: "bg-p2",
  3: "bg-p3",
  4: "bg-p4",
  5: "bg-p5",
};

/**
 * Five-step "how much do you want to see them" control. Clicking the current
 * level again clears the pick. Updates optimistically.
 */
export function PriorityPicker({
  artistName,
  artistId,
  festivalId,
  slug,
  priority,
  action = setPickAction,
}: {
  artistName: string;
  artistId: string;
  festivalId: string;
  slug: string;
  priority: Priority | null;
  action?: (state: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [optimistic, setOptimistic] = useOptimistic(priority);
  const [state, formAction, saving] = useActionState(action, {});
  const [, startTransition] = useTransition();

  function choose(level: Priority) {
    const next = optimistic === level ? null : level;
    const form = new FormData();
    form.set("slug", slug);
    form.set("festivalId", festivalId);
    form.set("artistId", artistId);
    form.set("priority", next === null ? "" : String(next));
    startTransition(() => {
      setOptimistic(next);
      formAction(form);
    });
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={`How much do you want to see ${artistName}?`}
        aria-busy={saving}
        className="flex items-center gap-1"
      >
        {PRIORITIES.map((level) => {
          const active = optimistic !== null && level <= optimistic;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={optimistic === level}
              aria-label={PRIORITY_LABELS[level]}
              title={optimistic === level ? `${PRIORITY_LABELS[level]} (click to clear)` : PRIORITY_LABELS[level]}
              onClick={() => choose(level)}
              className={`h-7 w-7 rounded-full border text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active && optimistic ? `${PRIORITY_BG[optimistic]} border-transparent text-white` : "border-border bg-surface text-muted hover:bg-surface-2"
              }`}
            >
              {level}
            </button>
          );
        })}
        <span className={`ml-1 w-12 text-[11px] text-muted ${saving ? "" : "invisible"}`} aria-hidden>
          Saving…
        </span>
      </div>
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}
