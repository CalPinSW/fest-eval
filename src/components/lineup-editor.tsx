import { submitLineupChangeAction } from "@/app/actions/festivals";
import { ActionForm } from "@/components/action-form";
import { describePerformance } from "@/components/performance-summary";
import { SubmitButton } from "@/components/submit-button";
import { instantToLocalInput } from "@/lib/domain/time";
import type { LineupPerformance } from "@/lib/data/lineup";

function TimeFields({ timeZone, start, end, idPrefix }: { timeZone: string; start?: Date | null; end?: Date | null; idPrefix: string }) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-start`} className="label">Starts</label>
        <input id={`${idPrefix}-start`} name="startsAt" type="datetime-local" className="input" defaultValue={start ? instantToLocalInput(start, timeZone) : ""} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-end`} className="label">Ends</label>
        <input id={`${idPrefix}-end`} name="endsAt" type="datetime-local" className="input" defaultValue={end ? instantToLocalInput(end, timeZone) : ""} />
      </div>
    </>
  );
}

function NoteField({ show, idPrefix }: { show: boolean; idPrefix: string }) {
  if (!show) return null;
  return (
    <div className="sm:col-span-2">
      <label htmlFor={`${idPrefix}-note`} className="label">Source <span className="text-muted">(optional)</span></label>
      <input id={`${idPrefix}-note`} name="note" maxLength={500} className="input" placeholder="e.g. link to the announcement" />
    </div>
  );
}

export function AddPerformanceForm({
  slug,
  timeZone,
  stages,
  canEdit,
}: {
  slug: string;
  timeZone: string;
  stages: string[];
  canEdit: boolean;
}) {
  return (
    <ActionForm action={submitLineupChangeAction} resetOnSuccess className="grid gap-4 sm:grid-cols-2" aria-label="Add a performance">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="kind" value="add_performance" />
      <div>
        <label htmlFor="add-artist" className="label">Artist</label>
        <input id="add-artist" name="artistName" required maxLength={200} className="input" />
      </div>
      <div>
        <label htmlFor="add-stage" className="label">Stage <span className="text-muted">(optional)</span></label>
        <input id="add-stage" name="stageName" list="stage-names" maxLength={80} className="input" />
        <datalist id="stage-names">{stages.map((s) => <option key={s} value={s} />)}</datalist>
      </div>
      <TimeFields timeZone={timeZone} idPrefix="add" />
      <NoteField show={!canEdit} idPrefix="add" />
      <p className="text-xs text-muted sm:col-span-2">Times are local to the festival ({timeZone}). Leave them blank if not announced.</p>
      <div className="sm:col-span-2">
        <SubmitButton pendingText="Saving…">{canEdit ? "Add to lineup" : "Suggest this"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EditPerformanceRow({
  slug,
  timeZone,
  boundaryHour,
  performance: p,
  canEdit,
}: {
  slug: string;
  timeZone: string;
  boundaryHour: number;
  performance: LineupPerformance;
  canEdit: boolean;
}) {
  const id = p.id.slice(0, 8);
  return (
    <li className="px-4 py-3">
      <details>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
          <span>
            <span className="font-medium">{p.artistName}</span>{" "}
            <span className="text-sm text-muted">{describePerformance(p, timeZone, boundaryHour)}</span>
            {p.source === "clashfinder" && <span className="chip ml-2">{p.locallyModified ? "Clashfinder · edited" : "Clashfinder"}</span>}
          </span>
          <span className="text-sm text-accent">{canEdit ? "Edit" : "Suggest a fix"}</span>
        </summary>
        <div className="mt-3 space-y-3">
          <ActionForm action={submitLineupChangeAction} className="grid gap-3 sm:grid-cols-3" aria-label={`Edit ${p.artistName}`}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="kind" value="update_performance" />
            <input type="hidden" name="performanceId" value={p.id} />
            <div>
              <label htmlFor={`${id}-stage`} className="label">Stage</label>
              <input id={`${id}-stage`} name="stageName" defaultValue={p.stageName ?? ""} className="input" list="stage-names" />
            </div>
            <TimeFields timeZone={timeZone} start={p.startsAt} end={p.endsAt} idPrefix={id} />
            <NoteField show={!canEdit} idPrefix={id} />
            <div className="sm:col-span-3">
              <SubmitButton className="btn-secondary" pendingText="Saving…">{canEdit ? "Save" : "Suggest change"}</SubmitButton>
            </div>
          </ActionForm>
          <ActionForm action={submitLineupChangeAction} aria-label={`Remove ${p.artistName}`}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="kind" value="remove_performance" />
            <input type="hidden" name="performanceId" value={p.id} />
            <SubmitButton className="btn-danger" pendingText="Removing…">{canEdit ? "Remove from lineup" : "Suggest removing"}</SubmitButton>
          </ActionForm>
        </div>
      </details>
    </li>
  );
}
