import { describe, expect, it } from "vitest";
import { applyLineupChange, getLineup } from "@/lib/data/lineup";
import { listProposals, proposeLineupChange, reviewProposal } from "@/lib/data/proposals";
import { adminClient, anonClient, createFestival, createUser, uniq } from "./helpers";

async function setup() {
  const [owner, proposer, stranger, moderator] = await Promise.all([
    createUser(),
    createUser(),
    createUser(),
    createUser("moderator"),
  ]);
  const festival = await createFestival(owner);
  return { owner, proposer, stranger, moderator, festival };
}

describe("edit proposals", () => {
  it("lets anyone propose, and shows proposals only to the proposer and editors", async () => {
    const { owner, proposer, stranger, moderator, festival } = await setup();
    const id = await proposeLineupChange(
      proposer.client,
      proposer.id,
      festival.id,
      { kind: "add_performance", artistName: `Proposed ${uniq()}` },
      "Announced on their Instagram",
    );

    for (const viewer of [proposer, owner, moderator]) {
      const visible = await listProposals(viewer.client, festival.id);
      expect(visible.map((p) => p.id)).toEqual([id]);
    }
    expect(await listProposals(stranger.client, festival.id)).toEqual([]);

    const [proposal] = await listProposals(owner.client, festival.id, "pending");
    expect(proposal).toMatchObject({
      proposerUsername: proposer.username,
      note: "Announced on their Instagram",
      status: "pending",
      change: { kind: "add_performance" },
    });
  });

  it("applies an approved addition to the lineup", async () => {
    const { owner, proposer, festival } = await setup();
    const artist = `Approved ${uniq()}`;
    const id = await proposeLineupChange(proposer.client, proposer.id, festival.id, {
      kind: "add_performance",
      artistName: artist,
      stageName: "Tent",
      startsAt: "2026-06-26T18:00:00Z",
      endsAt: "2026-06-26T19:00:00Z",
    });

    await reviewProposal(owner.client, owner.id, id, "approve", "Thanks!");

    const lineup = await getLineup(anonClient(), festival.id);
    expect(lineup.performances.map((p) => [p.artistName, p.stageName])).toEqual([[artist, "Tent"]]);
    const [reviewed] = await listProposals(proposer.client, festival.id);
    expect(reviewed).toMatchObject({ status: "approved", reviewNote: "Thanks!" });
  });

  it("lets moderators approve set-time corrections on any festival", async () => {
    const { owner, proposer, moderator, festival } = await setup();
    const { performanceId } = await applyLineupChange(owner.client, festival.id, {
      kind: "add_performance",
      artistName: `Fix ${uniq()}`,
    });
    const id = await proposeLineupChange(proposer.client, proposer.id, festival.id, {
      kind: "update_performance",
      performanceId: performanceId!,
      startsAt: "2026-06-27T20:00:00Z",
      endsAt: "2026-06-27T21:30:00Z",
    });
    await reviewProposal(moderator.client, moderator.id, id, "approve");
    const [perf] = (await getLineup(anonClient(), festival.id)).performances;
    expect(perf.startsAt).toEqual(new Date("2026-06-27T20:00:00Z"));
    expect(perf.locallyModified).toBe(true);
  });

  it("leaves the lineup alone when a proposal is rejected", async () => {
    const { owner, proposer, festival } = await setup();
    const id = await proposeLineupChange(proposer.client, proposer.id, festival.id, {
      kind: "add_performance",
      artistName: `Rejected ${uniq()}`,
    });
    await reviewProposal(owner.client, owner.id, id, "reject", "Not confirmed");
    expect((await getLineup(anonClient(), festival.id)).performances).toEqual([]);
    await expect(reviewProposal(owner.client, owner.id, id, "approve")).rejects.toThrow(/already been reviewed/);
  });

  it("does not let proposers or strangers review", async () => {
    const { proposer, stranger, festival } = await setup();
    const id = await proposeLineupChange(proposer.client, proposer.id, festival.id, {
      kind: "add_performance",
      artistName: `Self ${uniq()}`,
    });
    await expect(reviewProposal(proposer.client, proposer.id, id, "approve")).rejects.toThrow(/can't review/);
    await expect(reviewProposal(stranger.client, stranger.id, id, "approve")).rejects.toThrow(/not found/);
    expect((await getLineup(anonClient(), festival.id)).performances).toEqual([]);
  });

  it("does not let users submit pre-approved proposals or edit them afterwards", async () => {
    const { proposer, festival } = await setup();
    const preApproved = await proposer.client.from("edit_proposals").insert({
      festival_id: festival.id,
      proposer_id: proposer.id,
      kind: "add_performance",
      payload: { kind: "add_performance", artistName: "x" },
      status: "approved",
    });
    expect(preApproved.error).not.toBeNull();

    const id = await proposeLineupChange(proposer.client, proposer.id, festival.id, {
      kind: "add_performance",
      artistName: `Edit ${uniq()}`,
    });
    await proposer.client.from("edit_proposals").update({ status: "approved" }).eq("id", id);
    const { data } = await adminClient().from("edit_proposals").select("status").eq("id", id).single();
    expect(data!.status).toBe("pending");
  });

  it("returns a proposal to the queue if applying it fails", async () => {
    const { owner, proposer, festival } = await setup();
    const { performanceId } = await applyLineupChange(owner.client, festival.id, {
      kind: "add_performance",
      artistName: `Gone ${uniq()}`,
    });
    const id = await proposeLineupChange(proposer.client, proposer.id, festival.id, {
      kind: "remove_performance",
      performanceId: performanceId!,
    });
    await applyLineupChange(owner.client, festival.id, { kind: "remove_performance", performanceId: performanceId! });

    await expect(reviewProposal(owner.client, owner.id, id, "approve")).rejects.toThrow(/no longer exists/);
    const [proposal] = await listProposals(owner.client, festival.id);
    expect(proposal.status).toBe("pending");
  });

  it("rejects malformed changes before they reach the database", async () => {
    const { proposer, festival } = await setup();
    await expect(
      proposeLineupChange(proposer.client, proposer.id, festival.id, {
        kind: "update_performance",
        performanceId: "not-a-uuid",
      } as never),
    ).rejects.toThrow();
  });
});
