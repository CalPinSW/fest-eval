import { beforeAll, describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/data/errors";
import { applyLineupChange, ensureArtist } from "@/lib/data/lineup";
import {
  getFriendsAttending,
  getVisiblePicks,
  isAttending,
  listFriendships,
  listMyFestivals,
  removeFriendship,
  respondToFriendRequest,
  sendFriendRequest,
  setAttending,
  setPick,
} from "@/lib/data/social";
import { adminClient, createFestival, createUser, makeFriends, uniq, type TestUser } from "./helpers";

async function festivalWithArtists(count: number) {
  const owner = await createUser();
  const festival = await createFestival(owner);
  const artistIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const name = `Act ${i} ${uniq()}`;
    await applyLineupChange(owner.client, festival.id, { kind: "add_performance", artistName: name });
    artistIds.push(await ensureArtist(owner.client, name));
  }
  return { festival, artistIds };
}

describe("attendance and picks", () => {
  it("requires attending before picking", async () => {
    const { festival, artistIds } = await festivalWithArtists(1);
    const user = await createUser();
    await expect(setPick(user.client, user.id, festival.id, artistIds[0], 3)).rejects.toThrow(/Mark yourself as going/);

    await setAttending(user.client, user.id, festival.id, true);
    await setAttending(user.client, user.id, festival.id, true); // idempotent
    expect(await isAttending(user.client, user.id, festival.id)).toBe(true);
    expect((await listMyFestivals(user.client, user.id)).map((f) => f.id)).toEqual([festival.id]);

    await setPick(user.client, user.id, festival.id, artistIds[0], 3);
    await setPick(user.client, user.id, festival.id, artistIds[0], 5);
    expect(await getVisiblePicks(user.client, festival.id)).toEqual([{ userId: user.id, artistId: artistIds[0], priority: 5 }]);

    await setPick(user.client, user.id, festival.id, artistIds[0], null);
    expect(await getVisiblePicks(user.client, festival.id)).toEqual([]);
  });

  it("only allows picking artists on that festival's lineup", async () => {
    const { festival } = await festivalWithArtists(1);
    const user = await createUser();
    await setAttending(user.client, user.id, festival.id, true);
    const elsewhere = await ensureArtist(user.client, `Not Playing ${uniq()}`);
    await expect(setPick(user.client, user.id, festival.id, elsewhere, 3)).rejects.toBeInstanceOf(UserFacingError);
  });

  it("enforces the 1-5 priority range in the database", async () => {
    const { festival, artistIds } = await festivalWithArtists(1);
    const user = await createUser();
    await setAttending(user.client, user.id, festival.id, true);
    const result = await user.client
      .from("artist_picks")
      .insert({ user_id: user.id, festival_id: festival.id, artist_id: artistIds[0], priority: 6 });
    expect(result.error?.code).toBe("23514");
  });

  it("removes picks when a user stops attending", async () => {
    const { festival, artistIds } = await festivalWithArtists(2);
    const user = await createUser();
    await setAttending(user.client, user.id, festival.id, true);
    await setPick(user.client, user.id, festival.id, artistIds[0], 4);
    await setPick(user.client, user.id, festival.id, artistIds[1], 2);
    await setAttending(user.client, user.id, festival.id, false);
    const { data } = await adminClient().from("artist_picks").select("*").eq("user_id", user.id);
    expect(data).toEqual([]);
  });

  it("does not let users write picks for someone else", async () => {
    const { festival, artistIds } = await festivalWithArtists(1);
    const [victim, attacker] = await Promise.all([createUser(), createUser()]);
    await setAttending(victim.client, victim.id, festival.id, true);
    const forged = await attacker.client
      .from("artist_picks")
      .insert({ user_id: victim.id, festival_id: festival.id, artist_id: artistIds[0], priority: 1 });
    expect(forged.error).not.toBeNull();
    const forgedAttendance = await attacker.client.from("festival_attendees").insert({ user_id: victim.id, festival_id: festival.id });
    expect(forgedAttendance.error).not.toBeNull();
  });
});

describe("friends' picks visibility", () => {
  let festival: { id: string };
  let artistIds: string[];
  let me: TestUser, friend: TestUser, friendNotGoing: TestUser, stranger: TestUser, pendingFriend: TestUser;

  beforeAll(async () => {
    ({ festival, artistIds } = await festivalWithArtists(2));
    [me, friend, friendNotGoing, stranger, pendingFriend] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
      createUser(),
      createUser(),
    ]);
    await makeFriends(me, friend);
    await makeFriends(friendNotGoing, me);
    await pendingFriend.client.from("friendships").insert({ requester_id: pendingFriend.id, addressee_id: me.id });

    for (const u of [me, friend, stranger, pendingFriend]) {
      await setAttending(u.client, u.id, festival.id, true);
      await setPick(u.client, u.id, festival.id, artistIds[0], 4);
    }
  });

  it("shows my picks and accepted friends' picks, but not strangers' or pending friends'", async () => {
    const picks = await getVisiblePicks(me.client, festival.id);
    expect(picks.map((p) => p.userId).sort()).toEqual([me.id, friend.id].sort());
  });

  it("lists friends who are going", async () => {
    const going = await getFriendsAttending(me.client, me.id, festival.id);
    expect(going.map((g) => g.username)).toEqual([friend.username]);
  });

  it("hides friends' picks from festivals I'm not attending", async () => {
    // friendNotGoing is my friend but isn't attending; from their side, my picks are hidden.
    expect(await getVisiblePicks(friendNotGoing.client, festival.id)).toEqual([]);
  });

  it("stops sharing once the friendship ends", async () => {
    const { friends } = await listFriendships(me.client, me.id);
    const link = friends.find((f) => f.userId === friend.id)!;
    await removeFriendship(friend.client, link.friendshipId);
    const picks = await getVisiblePicks(me.client, festival.id);
    expect(picks.map((p) => p.userId)).toEqual([me.id]);
  });
});

describe("friend requests", () => {
  it("sends, lists and accepts requests", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    expect(await sendFriendRequest(alice.client, alice.id, bob.username)).toBe("sent");

    expect((await listFriendships(alice.client, alice.id)).outgoing.map((f) => f.username)).toEqual([bob.username]);
    const bobView = await listFriendships(bob.client, bob.id);
    expect(bobView.incoming.map((f) => f.username)).toEqual([alice.username]);

    await respondToFriendRequest(bob.client, bobView.incoming[0].friendshipId, true);
    expect((await listFriendships(alice.client, alice.id)).friends.map((f) => f.username)).toEqual([bob.username]);
    await expect(sendFriendRequest(alice.client, alice.id, bob.username)).rejects.toThrow(/already friends/);
  });

  it("accepts automatically when the other person already asked", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    await sendFriendRequest(alice.client, alice.id, bob.username);
    await expect(sendFriendRequest(alice.client, alice.id, bob.username)).rejects.toThrow(/already sent/);
    expect(await sendFriendRequest(bob.client, bob.id, alice.username.toUpperCase())).toBe("accepted");
    expect((await listFriendships(bob.client, bob.id)).friends).toHaveLength(1);
  });

  it("rejects unknown users and yourself", async () => {
    const alice = await createUser();
    await expect(sendFriendRequest(alice.client, alice.id, "nobody_by_this_name")).rejects.toThrow(/No one is called/);
    await expect(sendFriendRequest(alice.client, alice.id, alice.username)).rejects.toThrow(/add yourself/);
  });

  it("does not let requesters accept their own request", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    await sendFriendRequest(alice.client, alice.id, bob.username);
    const { outgoing } = await listFriendships(alice.client, alice.id);
    await expect(respondToFriendRequest(alice.client, outgoing[0].friendshipId, true)).rejects.toThrow(/no longer waiting/);
  });

  it("declining deletes the request", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    await sendFriendRequest(alice.client, alice.id, bob.username);
    const { incoming } = await listFriendships(bob.client, bob.id);
    await respondToFriendRequest(bob.client, incoming[0].friendshipId, false);
    expect(await listFriendships(alice.client, alice.id)).toEqual({ friends: [], incoming: [], outgoing: [] });
  });

  it("keeps friendships private to the two people involved", async () => {
    const [alice, bob, eve] = await Promise.all([createUser(), createUser(), createUser()]);
    await makeFriends(alice, bob);
    const { data } = await eve.client.from("friendships").select("id").or(`requester_id.eq.${alice.id},addressee_id.eq.${alice.id}`);
    expect(data).toEqual([]);
  });

  it("does not allow forging a request from someone else or a pre-accepted one", async () => {
    const [alice, bob, eve] = await Promise.all([createUser(), createUser(), createUser()]);
    const forged = await eve.client.from("friendships").insert({ requester_id: alice.id, addressee_id: bob.id });
    expect(forged.error).not.toBeNull();
    const preAccepted = await eve.client.from("friendships").insert({ requester_id: eve.id, addressee_id: bob.id, status: "accepted" });
    expect(preAccepted.error).not.toBeNull();
  });
});
