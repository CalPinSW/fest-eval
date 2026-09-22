import { isPriority, type Priority } from "@/lib/domain/priority";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { check, isUniqueViolation, UserFacingError } from "./errors";

// ---------------------------------------------------------------------------
// Attendance and picks
// ---------------------------------------------------------------------------

export async function setAttending(client: AppSupabaseClient, userId: string, festivalId: string, attending: boolean) {
  if (attending) {
    const result = await client.from("festival_attendees").insert({ user_id: userId, festival_id: festivalId });
    if (!isUniqueViolation(result.error)) check(result, "mark you as going");
  } else {
    // Picks cascade away with attendance.
    check(
      await client.from("festival_attendees").delete().eq("user_id", userId).eq("festival_id", festivalId),
      "remove you from the festival",
    );
  }
}

export async function isAttending(client: AppSupabaseClient, userId: string, festivalId: string): Promise<boolean> {
  const row = check(
    await client
      .from("festival_attendees")
      .select("user_id")
      .eq("user_id", userId)
      .eq("festival_id", festivalId)
      .maybeSingle(),
    "check attendance",
  );
  return row !== null;
}

/** Set a pick's priority, or remove the pick with `null`. */
export async function setPick(
  client: AppSupabaseClient,
  userId: string,
  festivalId: string,
  artistId: string,
  priority: Priority | null,
) {
  if (priority === null) {
    check(
      await client
        .from("artist_picks")
        .delete()
        .eq("user_id", userId)
        .eq("festival_id", festivalId)
        .eq("artist_id", artistId),
      "remove the pick",
    );
    return;
  }
  if (!isPriority(priority)) throw new UserFacingError("Priority must be between 1 and 5");

  // Update-then-insert rather than upsert: users may only update `priority`,
  // and ON CONFLICT DO UPDATE needs update rights on every supplied column.
  const updated = check(
    await client
      .from("artist_picks")
      .update({ priority })
      .eq("user_id", userId)
      .eq("festival_id", festivalId)
      .eq("artist_id", artistId)
      .select("artist_id"),
    "save the pick",
  );
  if (updated.length > 0) return;

  const inserted = await client
    .from("artist_picks")
    .insert({ user_id: userId, festival_id: festivalId, artist_id: artistId, priority });
  if (inserted.error?.code === "23503") throw new UserFacingError("Mark yourself as going before picking artists.");
  if (isUniqueViolation(inserted.error)) return setPick(client, userId, festivalId, artistId, priority);
  if (inserted.error?.code === "42501") throw new UserFacingError("That artist isn't on this festival's lineup.");
  check(inserted, "save the pick");
}

export interface PickRow {
  userId: string;
  artistId: string;
  priority: Priority;
}

/** Your picks plus any friends' picks RLS lets you see, for one festival. */
export async function getVisiblePicks(client: AppSupabaseClient, festivalId: string): Promise<PickRow[]> {
  const rows = check(
    await client.from("artist_picks").select("user_id, artist_id, priority").eq("festival_id", festivalId),
    "load picks",
  );
  return rows.map((r) => ({ userId: r.user_id, artistId: r.artist_id, priority: r.priority as Priority }));
}

export interface FriendAttendee {
  userId: string;
  username: string;
  displayName: string | null;
}

/** Friends (visible via RLS) who are going to the festival. */
export async function getFriendsAttending(
  client: AppSupabaseClient,
  userId: string,
  festivalId: string,
): Promise<FriendAttendee[]> {
  const rows = check(
    await client
      .from("festival_attendees")
      .select("user_id, profiles!festival_attendees_user_id_fkey(username, display_name)")
      .eq("festival_id", festivalId)
      .neq("user_id", userId),
    "load friends going",
  );
  return rows
    .map((r) => ({ userId: r.user_id, username: r.profiles?.username ?? "unknown", displayName: r.profiles?.display_name ?? null }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

export async function listMyFestivals(client: AppSupabaseClient, userId: string) {
  const rows = check(
    await client
      .from("festival_attendees")
      .select("festivals!festival_attendees_festival_id_fkey(id, slug, name, starts_on, ends_on, location)")
      .eq("user_id", userId),
    "load your festivals",
  );
  return rows.flatMap((r) => (r.festivals ? [r.festivals] : []));
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

export interface FriendSummary {
  friendshipId: string;
  userId: string;
  username: string;
  displayName: string | null;
}

export interface Friendships {
  friends: FriendSummary[];
  incoming: FriendSummary[];
  outgoing: FriendSummary[];
}

export async function listFriendships(client: AppSupabaseClient, userId: string): Promise<Friendships> {
  const rows = check(
    await client
      .from("friendships")
      .select(
        "id, status, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(username, display_name), addressee:profiles!friendships_addressee_id_fkey(username, display_name)",
      )
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false }),
    "load friends",
  );

  const result: Friendships = { friends: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    const iAsked = row.requester_id === userId;
    const other = iAsked ? row.addressee : row.requester;
    const summary: FriendSummary = {
      friendshipId: row.id,
      userId: iAsked ? row.addressee_id : row.requester_id,
      username: other?.username ?? "unknown",
      displayName: other?.display_name ?? null,
    };
    if (row.status === "accepted") result.friends.push(summary);
    else if (iAsked) result.outgoing.push(summary);
    else result.incoming.push(summary);
  }
  result.friends.sort((a, b) => a.username.localeCompare(b.username));
  return result;
}

/**
 * Send a friend request by username. If they already asked you, this accepts
 * their request instead.
 */
export async function sendFriendRequest(
  client: AppSupabaseClient,
  userId: string,
  username: string,
): Promise<"sent" | "accepted"> {
  const target = check(
    await client.from("profiles").select("id").eq("username", username.trim()).maybeSingle(),
    "find that user",
  );
  if (!target) throw new UserFacingError(`No one is called "${username.trim()}".`);
  if (target.id === userId) throw new UserFacingError("You can't add yourself.");

  const existing = check(
    await client
      .from("friendships")
      .select("id, status, requester_id")
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${userId})`,
      )
      .maybeSingle(),
    "check existing requests",
  );
  if (existing?.status === "accepted") throw new UserFacingError("You're already friends.");
  if (existing && existing.requester_id === userId) throw new UserFacingError("Request already sent.");
  if (existing) {
    await respondToFriendRequest(client, existing.id, true);
    return "accepted";
  }

  check(await client.from("friendships").insert({ requester_id: userId, addressee_id: target.id }), "send the request");
  return "sent";
}

export async function respondToFriendRequest(client: AppSupabaseClient, friendshipId: string, accept: boolean) {
  if (!accept) {
    await removeFriendship(client, friendshipId);
    return;
  }
  const rows = check(
    await client
      .from("friendships")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", friendshipId)
      .eq("status", "pending")
      .select("id"),
    "accept the request",
  );
  if (rows.length === 0) throw new UserFacingError("That request is no longer waiting for you.");
}

export async function removeFriendship(client: AppSupabaseClient, friendshipId: string) {
  check(await client.from("friendships").delete().eq("id", friendshipId), "remove the friend");
}
