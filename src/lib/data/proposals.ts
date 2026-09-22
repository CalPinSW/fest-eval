import type { AppSupabaseClient } from "@/lib/supabase/types";
import { lineupChangeSchema, type LineupChange } from "@/lib/validation";
import { check, UserFacingError } from "./errors";
import { applyLineupChange } from "./lineup";

export interface Proposal {
  id: string;
  festivalId: string;
  proposerId: string;
  proposerUsername: string;
  change: LineupChange | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: Date;
}

export async function proposeLineupChange(
  client: AppSupabaseClient,
  userId: string,
  festivalId: string,
  change: LineupChange,
  note?: string | null,
): Promise<string> {
  const valid = lineupChangeSchema.parse(change);
  const row = check(
    await client
      .from("edit_proposals")
      .insert({ festival_id: festivalId, proposer_id: userId, kind: valid.kind, payload: valid, note: note?.trim() || null })
      .select("id")
      .single(),
    "submit the suggestion",
  );
  return row.id;
}

/** Proposals the client can see for a festival (own, or all if an editor). */
export async function listProposals(
  client: AppSupabaseClient,
  festivalId: string,
  status?: Proposal["status"],
): Promise<Proposal[]> {
  let query = client
    .from("edit_proposals")
    .select("id, festival_id, proposer_id, payload, note, status, review_note, created_at, profiles!edit_proposals_proposer_id_fkey(username)")
    .eq("festival_id", festivalId)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  return check(await query, "load suggestions").map((r) => {
    const parsed = lineupChangeSchema.safeParse(r.payload);
    return {
      id: r.id,
      festivalId: r.festival_id,
      proposerId: r.proposer_id,
      proposerUsername: r.profiles?.username ?? "unknown",
      change: parsed.success ? parsed.data : null,
      note: r.note,
      status: r.status,
      reviewNote: r.review_note,
      createdAt: new Date(r.created_at),
    };
  });
}

/**
 * Approve (applying the change) or reject a pending proposal. The reviewer's
 * own client is used, so RLS guarantees only festival editors get this far.
 */
export async function reviewProposal(
  client: AppSupabaseClient,
  reviewerId: string,
  proposalId: string,
  decision: "approve" | "reject",
  reviewNote?: string | null,
): Promise<void> {
  const proposal = check(
    await client.from("edit_proposals").select("id, festival_id, payload, status").eq("id", proposalId).maybeSingle(),
    "load the suggestion",
  );
  if (!proposal) throw new UserFacingError("Suggestion not found.");
  if (proposal.status !== "pending") throw new UserFacingError("That suggestion has already been reviewed.");

  // Claim the proposal first so two reviewers can't both apply it.
  const claimed = check(
    await client
      .from("edit_proposals")
      .update({
        status: decision === "approve" ? "approved" : "rejected",
        reviewer_id: reviewerId,
        review_note: reviewNote?.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", proposalId)
      .eq("status", "pending")
      .select("id"),
    "review the suggestion",
  );
  if (claimed.length === 0) throw new UserFacingError("You can't review that suggestion, or it was just reviewed.");
  if (decision === "reject") return;

  const change = lineupChangeSchema.safeParse(proposal.payload);
  try {
    if (!change.success) throw new UserFacingError("That suggestion is malformed and can't be applied.");
    await applyLineupChange(client, proposal.festival_id, change.data);
  } catch (error) {
    // Put it back in the queue rather than recording a change that never happened.
    await client
      .from("edit_proposals")
      .update({ status: "pending", reviewer_id: null, review_note: null, reviewed_at: null })
      .eq("id", proposalId);
    throw error;
  }
}
