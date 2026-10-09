import Link from "next/link";
import { TimetableGrid, type PlanStatus } from "@/components/timetable-grid";
import { loadFestivalView } from "@/lib/data/festival-view";
import { getDayPerformances, getFestivalDays, getStages, getUnscheduledArtistNames } from "@/lib/data/lineup-queries";
import { planDay, type PickedPerformance } from "@/lib/domain/planner";
import { PRIORITY_LABELS } from "@/lib/domain/priority";
import { festivalDayOf, formatDayLabel, formatLocalTime } from "@/lib/domain/time";
import { layoutTimetable, pageStages, performancesOnStagePage } from "@/lib/domain/timetable";
import { createClient } from "@/lib/supabase/server";

const VIEWS = [
  { value: "all", label: "All sets" },
  { value: "picks", label: "Picks only" },
  { value: "plan", label: "My plan" },
] as const;
type View = (typeof VIEWS)[number]["value"];

/** Stages per screen in the "All sets" view; big festivals have 100+. */
const STAGES_PER_PAGE = 12;

export default async function TimetablePage(props: PageProps<"/festivals/[slug]/timetable">) {
  const { slug } = await props.params;
  const search = await props.searchParams;
  const { festival, myPicks, friendPicks, user } = await loadFestivalView(slug);
  const tz = festival.timezone;
  const boundary = festival.day_boundary_hour;
  const supabase = await createClient();

  // Only the selected day is loaded: big festivals have thousands of sets.
  const [days, unscheduled] = await Promise.all([
    getFestivalDays(supabase, festival.id),
    getUnscheduledArtistNames(supabase, festival.id),
  ]);

  if (days.length === 0) {
    return (
      <div className="card text-center">
        <p className="font-medium">Set times haven&apos;t been announced yet.</p>
        <p className="mt-1 text-sm text-muted">
          The timetable appears here once they are. Pick artists on the{" "}
          <Link href={`/festivals/${slug}`} className="link">lineup</Link> in the meantime.
        </p>
      </div>
    );
  }

  const today = festivalDayOf(new Date(), tz, boundary);
  const day = typeof search.day === "string" && days.includes(search.day) ? search.day : days.includes(today) ? today : days[0];
  const requestedView = VIEWS.some((v) => v.value === search.view) ? (search.view as View) : "all";
  const view: View = !user && requestedView !== "all" ? "all" : requestedView;
  const changeover = Math.min(Math.max(Number(search.changeover) || 0, 0), 30);

  const [onDay, stages] = await Promise.all([getDayPerformances(supabase, festival, day), getStages(supabase, festival.id)]);
  const picked: PickedPerformance[] = onDay.flatMap((p) => {
    const priority = myPicks.get(p.artistId);
    return priority ? [{ ...p, priority }] : [];
  });
  const plan = view === "plan" ? planDay(picked, { changeoverMinutes: changeover }) : null;
  const planStatus = plan
    ? new Map<string, PlanStatus>([
        ...plan.chosen.map((p) => [p.id, "chosen"] as const),
        ...plan.skipped.map((s) => [s.performance.id, "skipped"] as const),
      ])
    : undefined;

  const shown =
    view === "all"
      ? onDay
      : view === "plan"
        ? picked
        : onDay.filter((p) => myPicks.has(p.artistId) || friendPicks.has(p.artistId));
  // Picks and plan views are small; the full day is paged by stage.
  const stagePage = view === "all" ? pageStages(shown, stages, Number(search.stages) || 1, STAGES_PER_PAGE) : null;
  const visible = stagePage ? performancesOnStagePage(shown, stages, stagePage) : shown;
  const layout = layoutTimetable(visible, stages);

  const href = (params: Record<string, string | number>) => {
    const q = new URLSearchParams({ day, view, ...(changeover ? { changeover: String(changeover) } : {}) });
    for (const [k, v] of Object.entries(params)) q.set(k, String(v));
    // Changing day or view starts from the first stages again.
    if (!("stages" in params)) q.delete("stages");
    return `?${q}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Days" className="flex flex-wrap gap-1">
          {days.map((d) => (
            <Link key={d} href={href({ day: d })} aria-current={d === day ? "page" : undefined} className={d === day ? "btn-primary px-3 py-1.5" : "btn-secondary px-3 py-1.5"}>
              {formatDayLabel(d)}
            </Link>
          ))}
        </nav>
        {user && (
          <nav aria-label="View" className="flex gap-1">
            {VIEWS.map((v) => (
              <Link key={v.value} href={href({ view: v.value })} aria-current={v.value === view ? "true" : undefined} className={v.value === view ? "chip bg-accent-soft text-accent" : "chip hover:text-text"}>
                {v.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {view === "plan" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>Time to walk between stages:</span>
          {[0, 5, 10, 15].map((m) => (
            <Link key={m} href={href({ changeover: m })} className={m === changeover ? "chip bg-accent-soft text-accent" : "chip"}>
              {m === 0 ? "none" : `${m} min`}
            </Link>
          ))}
        </div>
      )}

      {stagePage && stagePage.pages > 1 && (
        <nav aria-label="Stages" className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted">
            Stages {stagePage.firstIndex}–{stagePage.lastIndex} of {stagePage.totalStages}
          </p>
          <div className="flex gap-2">
            {stagePage.page > 1 ? (
              <Link href={href({ stages: stagePage.page - 1 })} className="btn-secondary px-3 py-1.5">Previous stages</Link>
            ) : (
              <span className="btn-secondary px-3 py-1.5 opacity-50" aria-disabled>Previous stages</span>
            )}
            {stagePage.page < stagePage.pages ? (
              <Link href={href({ stages: stagePage.page + 1 })} className="btn-secondary px-3 py-1.5">More stages</Link>
            ) : (
              <span className="btn-secondary px-3 py-1.5 opacity-50" aria-disabled>More stages</span>
            )}
          </div>
        </nav>
      )}

      {layout ? (
        <TimetableGrid
          layout={layout}
          timeZone={tz}
          myPicks={myPicks}
          friendPicks={friendPicks}
          planStatus={planStatus}
          now={day === today ? new Date() : undefined}
        />
      ) : (
        <p className="card text-center text-muted">
          {view === "all" ? "Nothing on this day." : "You haven't picked anyone playing this day."}
        </p>
      )}

      {plan && (plan.chosen.length > 0 || plan.skipped.length > 0) && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h2 className="font-semibold">Your plan for {formatDayLabel(day)}</h2>
            <ol className="mt-2 space-y-1 text-sm">
              {plan.chosen.map((p) => (
                <li key={p.id} className="flex gap-2">
                  <span className="w-24 shrink-0 tabular-nums text-muted">{formatLocalTime(p.startsAt, tz)}–{formatLocalTime(p.endsAt, tz)}</span>
                  <span><span className="font-medium">{p.artistName}</span> <span className="text-muted">· {p.stageName ?? "Stage TBA"}</span></span>
                </li>
              ))}
            </ol>
          </div>
          {plan.skipped.length > 0 && (
            <div className="card">
              <h2 className="font-semibold">Clashes you&apos;ll miss</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {plan.skipped.map(({ performance: p, lostTo }) => (
                  <li key={p.id}>
                    <span className="font-medium">{p.artistName}</span>{" "}
                    <span className="text-muted">({PRIORITY_LABELS[p.priority]}){lostTo ? ` loses to ${lostTo.artistName}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {unscheduled.length > 0 && (
        <p className="text-sm text-muted">
          <span className="font-medium text-text">Times not announced:</span>{" "}
          {unscheduled.slice(0, 40).join(", ")}
          {unscheduled.length > 40 && ` and ${unscheduled.length - 40} more`}
        </p>
      )}
    </div>
  );
}
