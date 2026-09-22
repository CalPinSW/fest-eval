import Link from "next/link";
import { FestivalCard } from "@/components/festival-card";
import { getCurrentUser } from "@/lib/auth";
import { listFestivals } from "@/lib/data/lineup";
import { listMyFestivals } from "@/lib/data/social";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [mine, all] = await Promise.all([user ? listMyFestivals(supabase, user.id) : [], listFestivals(supabase)]);
  const upcoming = all.filter((f) => !f.ends_on || f.ends_on >= today).slice(0, 6);

  return (
    <div className="space-y-10">
      {!user && (
        <section className="rounded-3xl bg-accent-soft px-6 py-10 sm:px-10 sm:py-14">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">
            Never miss the set you came for.
          </h1>
          <p className="mt-4 max-w-xl text-muted sm:text-lg">
            Rank who you want to see, spot the clashes, see who your friends are heading to, and take the lineup with you as a
            playlist.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary">
              Start planning
            </Link>
            <Link href="/festivals" className="btn-secondary">
              Browse festivals
            </Link>
          </div>
        </section>
      )}

      {user && (
        <section>
          <h1 className="page-title">Hi {user.displayName ?? user.username}</h1>
          <h2 className="mt-6 mb-3 text-lg font-semibold">Your festivals</h2>
          {mine.length === 0 ? (
            <p className="text-muted">
              You&apos;re not going to anything yet.{" "}
              <Link href="/festivals" className="link">
                Find a festival
              </Link>
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map((f) => (
                <FestivalCard key={f.id} festival={f} badge="Going" />
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Coming up</h2>
          <Link href="/festivals" className="link text-sm">
            All festivals
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-muted">No festivals yet. Be the first to add one.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((f) => (
              <FestivalCard key={f.id} festival={f} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
