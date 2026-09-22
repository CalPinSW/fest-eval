import { AddPerformanceForm, EditPerformanceRow } from "@/components/lineup-editor";
import { requireUser } from "@/lib/auth";
import { loadFestivalView } from "@/lib/data/festival-view";

export default async function EditLineupPage(props: PageProps<"/festivals/[slug]/edit">) {
  const { slug } = await props.params;
  await requireUser(`/festivals/${slug}/edit`);
  const { festival, lineup, canEdit } = await loadFestivalView(slug);
  const performances = [...lineup.performances].sort((a, b) => a.artistName.localeCompare(b.artistName));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        {canEdit
          ? "You can edit this lineup directly. Changes to imported sets stop them being overwritten by the next Clashfinder sync."
          : "Spotted something missing or wrong? Suggest a change and an editor will review it."}
      </p>
      <section className="card">
        <h2 className="mb-4 font-semibold">{canEdit ? "Add a performance" : "Suggest a performance"}</h2>
        <AddPerformanceForm slug={festival.slug} timeZone={festival.timezone} stages={lineup.stages.map((s) => s.name)} canEdit={canEdit} />
      </section>
      {performances.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Current lineup ({performances.length})</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {performances.map((p) => (
              <EditPerformanceRow key={p.id} slug={festival.slug} timeZone={festival.timezone} boundaryHour={festival.day_boundary_hour} performance={p} canEdit={canEdit} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
