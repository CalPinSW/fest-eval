import Link from "next/link";

export function formatDateRange(startsOn: string | null, endsOn: string | null): string | null {
  if (!startsOn) return null;
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  if (!endsOn || endsOn === startsOn) return fmt(startsOn, { day: "numeric", month: "short", year: "numeric" });
  const sameMonth = startsOn.slice(0, 7) === endsOn.slice(0, 7);
  return `${fmt(startsOn, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${fmt(endsOn, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export function FestivalCard({
  festival,
  badge,
}: {
  festival: { slug: string; name: string; location: string | null; starts_on: string | null; ends_on: string | null };
  badge?: string;
}) {
  const dates = formatDateRange(festival.starts_on, festival.ends_on);
  return (
    <Link
      href={`/festivals/${festival.slug}`}
      className="card group block transition-colors hover:border-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold group-hover:text-accent">{festival.name}</h3>
        {badge && <span className="chip bg-accent-soft text-accent">{badge}</span>}
      </div>
      <p className="mt-1 text-sm text-muted">
        {[dates, festival.location].filter(Boolean).join(" · ") || "Dates to be announced"}
      </p>
    </Link>
  );
}
