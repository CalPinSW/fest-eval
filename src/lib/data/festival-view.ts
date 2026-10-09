import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import type { Priority } from "@/lib/domain/priority";
import { createClient } from "@/lib/supabase/server";
import { getFestivalBySlug, type Festival } from "./lineup";
import { getPlaylistExports } from "./music";
import { getFriendsAttending, getVisiblePicks, isAttending, type FriendAttendee } from "./social";

export interface FriendPick {
  userId: string;
  username: string;
  priority: Priority;
}

/**
 * The per-user context every festival page needs. Deliberately excludes the
 * lineup itself: pages load only the slice they show (a page of artists, one
 * day of the timetable), which matters for festivals with thousands of sets.
 */
export interface FestivalView {
  festival: Festival;
  user: CurrentUser | null;
  attending: boolean;
  canEdit: boolean;
  myPicks: Map<string, Priority>;
  friendsGoing: FriendAttendee[];
  /** Artist id -> friends who picked them, highest priority first. */
  friendPicks: Map<string, FriendPick[]>;
  playlists: Awaited<ReturnType<typeof getPlaylistExports>>;
}

/** Loaded once per request and shared by the festival layout and pages. */
export const loadFestivalView = cache(async (slug: string): Promise<FestivalView> => {
  const supabase = await createClient();
  const [festival, user] = await Promise.all([getFestivalBySlug(supabase, slug), getCurrentUser()]);
  if (!festival) notFound();

  const empty = {
    attending: false,
    canEdit: false,
    myPicks: new Map<string, Priority>(),
    friendsGoing: [] as FriendAttendee[],
    friendPicks: new Map<string, FriendPick[]>(),
    playlists: [] as FestivalView["playlists"],
  };
  if (!user) return { festival, user, ...empty };

  const [attending, canEditResult, picks, friendsGoing, playlists] = await Promise.all([
    isAttending(supabase, user.id, festival.id),
    supabase.rpc("can_edit_festival", { uid: user.id, fid: festival.id }),
    getVisiblePicks(supabase, festival.id),
    getFriendsAttending(supabase, user.id, festival.id),
    getPlaylistExports(supabase, festival.id),
  ]);

  const usernames = new Map(friendsGoing.map((f) => [f.userId, f.username]));
  const myPicks = new Map<string, Priority>();
  const friendPicks = new Map<string, FriendPick[]>();
  for (const pick of picks) {
    if (pick.userId === user.id) {
      myPicks.set(pick.artistId, pick.priority);
      continue;
    }
    const username = usernames.get(pick.userId);
    if (!username) continue;
    const list = friendPicks.get(pick.artistId) ?? [];
    list.push({ userId: pick.userId, username, priority: pick.priority });
    friendPicks.set(pick.artistId, list);
  }
  for (const list of friendPicks.values()) list.sort((a, b) => b.priority - a.priority || a.username.localeCompare(b.username));

  return {
    festival,
    user,
    attending,
    canEdit: canEditResult.data === true,
    myPicks,
    friendsGoing,
    friendPicks,
    playlists,
  };
});
