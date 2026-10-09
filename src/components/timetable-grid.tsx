import { PRIORITY_LABELS, type Priority } from "@/lib/domain/priority";
import { formatLocalTime } from "@/lib/domain/time";
import type { TimetableLayout } from "@/lib/domain/timetable";
import type { ScheduledPerformance } from "@/lib/domain/types";
import { FriendBadges } from "./friend-badges";

const PX_PER_MINUTE = 1.6;

const TINT: Record<Priority, string> = {
  1: "border-l-p1 bg-p1/15",
  2: "border-l-p2 bg-p2/15",
  3: "border-l-p3 bg-p3/20",
  4: "border-l-p4 bg-p4/20",
  5: "border-l-p5 bg-p5/20",
};

export type PlanStatus = "chosen" | "skipped";

export function TimetableGrid({
  layout,
  timeZone,
  myPicks,
  friendPicks,
  planStatus,
}: {
  layout: TimetableLayout<ScheduledPerformance>;
  timeZone: string;
  myPicks: Map<string, Priority>;
  friendPicks: Map<string, { userId: string; username: string; priority: Priority }[]>;
  /** Present in plan mode: performance id -> whether the plan keeps it. */
  planStatus?: Map<string, PlanStatus>;
}) {
  const height = layout.totalMinutes * PX_PER_MINUTE;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface" role="region" aria-label="Timetable" tabIndex={0}>
      <div className="flex min-w-max">
        {/* Time axis */}
        <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-border bg-surface">
          <div className="h-10 border-b border-border" />
          <div className="relative" style={{ height }}>
            {layout.hours.map((hour, i) => (
              <span
                key={hour.toISOString()}
                className={`absolute right-2 text-[11px] tabular-nums text-muted ${
                  i === 0 ? "" : i === layout.hours.length - 1 ? "-translate-y-full" : "-translate-y-1/2"
                }`}
                style={{ top: i * 60 * PX_PER_MINUTE }}
              >
                {formatLocalTime(hour, timeZone)}
              </span>
            ))}
          </div>
        </div>

        {layout.columns.map((column) => (
          <section key={column.stageId ?? "tba"} className="w-40 shrink-0 border-r border-border last:border-r-0 sm:w-48" aria-label={column.stageName}>
            <h3 className="sticky top-0 flex h-10 items-center border-b border-border px-2 text-xs font-semibold uppercase tracking-wide">
              <span className="truncate">{column.stageName}</span>
            </h3>
            {/* Hour lines are a repeating background rather than one element per hour. */}
            <div
              className="relative"
              style={{
                height,
                backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                backgroundSize: `100% ${60 * PX_PER_MINUTE}px`,
              }}
            >
              {column.items.map(({ performance: p, offsetMinutes, durationMinutes, lane, laneCount }) => {
                const mine = myPicks.get(p.artistId);
                const friends = friendPicks.get(p.artistId) ?? [];
                const status = planStatus?.get(p.id);
                const tone = mine ? TINT[mine] : "border-l-border bg-surface-2";
                const planTone =
                  status === "chosen" ? "ring-2 ring-accent" : status === "skipped" ? "opacity-45 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,var(--border)_6px_7px)]" : "";
                const label = [
                  p.artistName,
                  `${formatLocalTime(p.startsAt, timeZone)}–${formatLocalTime(p.endsAt, timeZone)}`,
                  mine ? `your pick: ${PRIORITY_LABELS[mine]}` : null,
                  status === "chosen" ? "in your plan" : status === "skipped" ? "clashes with your plan" : null,
                  friends.length ? `${friends.length} friend${friends.length === 1 ? "" : "s"} want to go` : null,
                ]
                  .filter(Boolean)
                  .join(", ");

                return (
                  <article
                    key={p.id}
                    aria-label={label}
                    data-plan={status}
                    className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-xs shadow-sm ${tone} ${planTone}`}
                    style={{
                      top: offsetMinutes * PX_PER_MINUTE + 1,
                      height: Math.max(durationMinutes * PX_PER_MINUTE - 2, 18),
                      left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                      width: `calc(${100 / laneCount}% - 4px)`,
                    }}
                  >
                    <p className="truncate font-semibold leading-tight">{p.artistName}</p>
                    {durationMinutes >= 30 && (
                      <p className="truncate tabular-nums text-muted">
                        {formatLocalTime(p.startsAt, timeZone)}–{formatLocalTime(p.endsAt, timeZone)}
                      </p>
                    )}
                    {friends.length > 0 && durationMinutes >= 45 && (
                      <div className="mt-1">
                        <FriendBadges friends={friends} size="sm" max={3} />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
