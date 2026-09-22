import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import type { Priority } from "@/lib/domain/priority";
import { suggestArtists, type ArtistSuggestion } from "@/lib/domain/suggestions";
import { createClient } from "@/lib/supabase/server";
import { getFestivalBySlug, getLineup, lineupArtists, type Festival, type Lineup } from "./lineup";
import { getLikedArtists, getPlaylistExports } from "./music";
import { getFriendsAttending, getVisiblePicks, isAttending, type FriendAttendee } from "./social";

export interface FriendPick {
  userId: string;
  username: string;
  priority: Priority;
}

export interface FestivalView {
  festival: Festival;
  lineup: Lineup;
  artists: ReturnType<typeof lineupArtists>;
  user: CurrentUser | null;
  attending: boolean;
  canEdit: boolean;
  myPicks: Map<string, Priority>;
  friendsGoing: FriendAttendee[];
  /** Artist id -> friends who picked them, highest priority first. */
  friendPicks: Map<string, FriendPick[]>;
  suggestions: ArtistSuggestion[];
  playlists: Awaited<ReturnType<typeof getPlaylistExports>>;
}

/** Everything the festival pages show, loaded once per request. */
export const loadFestivalView = cache(async (slug: string): Promise<FestivalView> => {
  const supabase = await createClient();
  const [festival, user] = await Promise.all([getFestivalBySlug(supabase, slug), getCurrentUser()]);
  if (!festival) notFound();

  const lineup = await getLineup(supabase, festival.id);
  const artists = lineupArtists(lineup);
  const empty = {
    attending: false,
    canEdit: false,
    myPicks: new Map<string, Priority>(),
    friendsGoing: [] as FriendAttendee[],
    friendPicks: new Map<string, FriendPick[]>(),
    suggestions: [] as ArtistSuggestion[],
    playlists: [] as FestivalView["playlists"],
  };
  if (!user) return { festival, lineup, artists, user, ...empty };

  const [attending, canEditResult, picks, friendsGoing, liked, playlists] = await Promise.all([
    isAttending(supabase, user.id, festival.id),
    supabase.rpc("can_edit_festival", { uid: user.id, fid: festival.id }),
    getVisiblePicks(supabase, festival.id),
    getFriendsAttending(supabase, user.id, festival.id),
    getLikedArtists(supabase),
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
    lineup,
    artists,
    user,
    attending,
    canEdit: canEditResult.data === true,
    myPicks,
    friendsGoing,
    friendPicks,
    suggestions: attending ? suggestArtists(artists, liked, myPicks.keys()) : [],
    playlists,
  };
});
