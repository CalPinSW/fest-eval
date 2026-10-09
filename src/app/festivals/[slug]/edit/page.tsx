import { AddPerformanceForm, EditPerformanceRow } from "@/components/lineup-editor";
import { Pager, pageFromParams } from "@/components/pager";
import { requireUser } from "@/lib/auth";
import { loadFestivalView } from "@/lib/data/festival-view";
import { getLineupPage, getStages } from "@/lib/data/lineup-queries";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

export default async function EditLineupPage(props: PageProps<"/festivals/[slug]/edit">) {
  const { slug } = await props.params;
  const search = await props.searchParams;
  const q = typeof search.q === "string" ? search.q.trim() : "";
  const page = pageFromParams(search.page);
  await requireUser(`/festivals/${slug}/edit`);
  const { festival, canEdit } = await loadFestivalView(slug);
  const supabase = await createClient();
  const [lineup, stages] = await Promise.all([
    getLineupPage(supabase, festival.id, { search: q, page, pageSize: PAGE_SIZE }),
    getStages(supabase, festival.id),
  ]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        {canEdit
          ? "You can edit this lineup directly. Changes to imported sets stop them being overwritten by the next Clashfinder sync."
          : "Spotted something missing or wrong? Suggest a change and an editor will review it."}
      </p>
      <section className="card">
        <h2 className="mb-4 font-semibold">{canEdit ? "Add a performance" : "Suggest a performance"}</h2>
        <AddPerformanceForm slug={festival.slug} timeZone={festival.timezone} stages={stages.map((s) => s.name)} canEdit={canEdit} />
      </section>
      {(lineup.total > 0 || q) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Current lineup</h2>
            <form role="search" className="flex gap-2">
              <label htmlFor="edit-q" className="sr-only">Find an artist</label>
              <input id="edit-q" name="q" defaultValue={q} placeholder="Find an artist" className="input" />
            </form>
          </div>
          {lineup.artists.length === 0 ? (
            <p className="text-sm text-muted">Nothing matches.</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface" aria-label="Current lineup">
              {lineup.artists.flatMap((artist) =>
                artist.performances.map((p) => (
                  <EditPerformanceRow
                    key={p.id}
                    slug={festival.slug}
                    timeZone={festival.timezone}
                    boundaryHour={festival.day_boundary_hour}
                    performance={p}
                    canEdit={canEdit}
                  />
                )),
              )}
            </ul>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={lineup.total} params={q ? { q } : {}} />
        </section>
      )}
    </div>
  );
}
