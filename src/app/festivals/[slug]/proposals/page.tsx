import { reviewProposalAction } from "@/app/actions/proposals";
import { ActionForm } from "@/components/action-form";
import { describePerformance } from "@/components/performance-summary";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { loadFestivalView } from "@/lib/data/festival-view";
import { getPerformancesByIds } from "@/lib/data/lineup-queries";
import type { LineupPerformance } from "@/lib/data/lineup";
import { listProposals, type Proposal } from "@/lib/data/proposals";
import { createClient } from "@/lib/supabase/server";

function describeChange(
  proposal: Proposal,
  performances: Map<string, LineupPerformance>,
  timeZone: string,
  boundaryHour: number,
): string {
  const change = proposal.change;
  if (!change) return "Unreadable suggestion";
  const describe = (p: { startsAt: Date | null; endsAt: Date | null; stageName: string | null }) => describePerformance(p, timeZone, boundaryHour);
  switch (change.kind) {
    case "add_performance":
      return `Add ${change.artistName}: ${describe({
        startsAt: change.startsAt ? new Date(change.startsAt) : null,
        endsAt: change.endsAt ? new Date(change.endsAt) : null,
        stageName: change.stageName ?? null,
      })}`;
    case "update_performance": {
      const current = performances.get(change.performanceId);
      if (!current) return "Change a performance that has since been removed";
      return `Change ${current.artistName} from ${describe(current)} to ${describe({
        startsAt: change.startsAt ? new Date(change.startsAt) : null,
        endsAt: change.endsAt ? new Date(change.endsAt) : null,
        stageName: change.stageName ?? null,
      })}`;
    }
    case "remove_performance": {
      const current = performances.get(change.performanceId);
      return current ? `Remove ${current.artistName} (${describe(current)})` : "Remove a performance that is already gone";
    }
  }
}

const STATUS_CHIP = { pending: "chip", approved: "chip bg-success/15 text-success", rejected: "chip bg-danger/15 text-danger" };

export default async function ProposalsPage(props: PageProps<"/festivals/[slug]/proposals">) {
  const { slug } = await props.params;
  await requireUser(`/festivals/${slug}/proposals`);
  const { festival, canEdit } = await loadFestivalView(slug);
  const supabase = await createClient();
  const proposals = await listProposals(supabase, festival.id);
  // Only the performances these suggestions refer to.
  const referenced = proposals.flatMap((p) => (p.change && "performanceId" in p.change ? [p.change.performanceId] : []));
  const performances = await getPerformancesByIds(supabase, festival.id, [...new Set(referenced)]);
  const pending = proposals.filter((p) => p.status === "pending");
  const reviewed = proposals.filter((p) => p.status !== "pending").slice(0, 30);

  const row = (proposal: Proposal) => (
    <li key={proposal.id} className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{describeChange(proposal, performances, festival.timezone, festival.day_boundary_hour)}</p>
        <span className={STATUS_CHIP[proposal.status]}>{proposal.status}</span>
      </div>
      <p className="text-xs text-muted">
        Suggested by @{proposal.proposerUsername} on {proposal.createdAt.toLocaleDateString("en-GB")}
        {proposal.note && <> · &ldquo;{proposal.note}&rdquo;</>}
        {proposal.reviewNote && <> · Reviewer: &ldquo;{proposal.reviewNote}&rdquo;</>}
      </p>
      {canEdit && proposal.status === "pending" && (
        <ActionForm action={reviewProposalAction} className="flex flex-wrap items-center gap-2" aria-label="Review suggestion">
          <input type="hidden" name="slug" value={festival.slug} />
          <input type="hidden" name="proposalId" value={proposal.id} />
          <label htmlFor={`note-${proposal.id}`} className="sr-only">Note to the proposer</label>
          <input id={`note-${proposal.id}`} name="reviewNote" placeholder="Note (optional)" maxLength={500} className="input max-w-xs" />
          <SubmitButton name="decision" value="approve" className="btn-primary" pendingText="…">Approve</SubmitButton>
          <SubmitButton name="decision" value="reject" className="btn-secondary" pendingText="…">Reject</SubmitButton>
        </ActionForm>
      )}
    </li>
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 font-semibold">{canEdit ? "Waiting for review" : "Your pending suggestions"} ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">{pending.map(row)}</ul>
        )}
      </section>
      {reviewed.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Recently reviewed</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">{reviewed.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
