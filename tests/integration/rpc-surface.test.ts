import { describe, expect, it } from "vitest";
import { applyLineupChange, canEditFestival } from "@/lib/data/lineup";
import { anonClient, createFestival, createUser, makeFriends, uniq } from "./helpers";

/** Calls an RPC that is deliberately absent from the generated types. */
const rawRpc = (client: ReturnType<typeof anonClient>, fn: string, args: Record<string, unknown>) =>
  (client.rpc as unknown as (f: string, a: Record<string, unknown>) => ReturnType<typeof client.rpc>)(fn, args);

describe("RPC surface", () => {
  it("does not expose the friendship, attendance or moderator helpers", async () => {
    const [alice, bob, eve] = await Promise.all([createUser(), createUser(), createUser()]);
    await makeFriends(alice, bob);

    for (const client of [anonClient(), eve.client]) {
      for (const [fn, args] of [
        ["are_friends", { a: alice.id, b: bob.id }],
        ["attends", { uid: alice.id, fid: alice.id }],
        ["is_moderator", { uid: alice.id }],
        ["handle_new_user", {}],
      ] as const) {
        const { data, error } = await rawRpc(client, fn, args);
        expect(error, `${fn} should not be callable`).not.toBeNull();
        expect(data).toBeNull();
      }
    }
  });

  it("only answers can_edit_festival for the caller", async () => {
    const [owner, stranger] = await Promise.all([createUser(), createUser()]);
    const festival = await createFestival(owner);

    expect(await canEditFestival(owner.client, owner.id, festival.id)).toBe(true);
    // Asking about someone else returns false rather than revealing their rights.
    const { data } = await stranger.client.rpc("can_edit_festival", { uid: owner.id, fid: festival.id });
    expect(data).toBe(false);
    const anon = await anonClient().rpc("can_edit_festival", { uid: owner.id, fid: festival.id });
    expect(anon.error).not.toBeNull();
  });

  it("keeps the policies that use the helpers working", async () => {
    const [owner, moderator] = await Promise.all([createUser(), createUser("moderator")]);
    const festival = await createFestival(owner);
    await applyLineupChange(moderator.client, festival.id, { kind: "add_performance", artistName: `Still Works ${uniq()}` });
    expect(await canEditFestival(moderator.client, moderator.id, festival.id)).toBe(true);
  });
});
