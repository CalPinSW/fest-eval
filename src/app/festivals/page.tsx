import type { Metadata } from "next";
import Link from "next/link";
import { FestivalCard } from "@/components/festival-card";
import { getCurrentUser } from "@/lib/auth";
import { listFestivals } from "@/lib/data/lineup";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Festivals" };

export default async function FestivalsPage(props: PageProps<"/festivals">) {
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q : "";
  const [user, festivals] = await Promise.all([getCurrentUser(), listFestivals(await createClient(), query)]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = festivals.filter((f) => !f.ends_on || f.ends_on >= today);
  const past = festivals.filter((f) => f.ends_on && f.ends_on < today).reverse();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Festivals</h1>
        {user && (
          <Link href="/festivals/new" className="btn-primary">
            Add a festival
          </Link>
        )}
      </div>

      <form role="search" className="flex max-w-md gap-2">
        <label htmlFor="q" className="sr-only">Search festivals</label>
        <input id="q" name="q" defaultValue={query} placeholder="Search festivals" className="input" />
        <button className="btn-secondary" type="submit">Search</button>
      </form>

      {festivals.length === 0 && <p className="text-muted">No festivals found.</p>}

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Upcoming</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((f) => <FestivalCard key={f.id} festival={f} />)}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Past</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((f) => <FestivalCard key={f.id} festival={f} />)}
          </div>
        </section>
      )}
    </div>
  );
}
