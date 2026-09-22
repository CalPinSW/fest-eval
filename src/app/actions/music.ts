"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { UserFacingError } from "@/lib/data/errors";
import { getFestivalBySlug, getLineup, lineupArtists } from "@/lib/data/lineup";
import { disconnect, exportFestivalPlaylist, getProviderClient, syncLikedArtists } from "@/lib/data/music";
import { getVisiblePicks } from "@/lib/data/social";
import { musicConfigFromEnv } from "@/lib/music/config";
import { MUSIC_PROVIDERS, PROVIDER_LABELS, type MusicProviderId } from "@/lib/music/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionState } from "./result";

function providerFrom(form: FormData): MusicProviderId {
  const value = form.get("provider");
  if (!MUSIC_PROVIDERS.includes(value as MusicProviderId)) throw new UserFacingError("Unknown streaming service.");
  return value as MusicProviderId;
}

export async function syncLikedArtistsAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("/settings");
    const provider = providerFrom(form);
    const admin = createAdminClient();
    const client = await getProviderClient(admin, user.id, provider, musicConfigFromEnv());
    const count = await syncLikedArtists(admin, user.id, client);
    revalidatePath("/", "layout");
    return { message: `Found ${count} artists you like on ${PROVIDER_LABELS[provider]}.` };
  });
}

export async function disconnectAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("/settings");
    await disconnect(createAdminClient(), user.id, providerFrom(form));
    revalidatePath("/", "layout");
    return { message: "Disconnected." };
  });
}

export async function exportPlaylistAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const slug = form.get("slug")?.toString() ?? "";
    const user = await requireUser(`/festivals/${slug}`);
    const provider = providerFrom(form);
    const supabase = await createClient();
    const festival = await getFestivalBySlug(supabase, slug);
    if (!festival) throw new UserFacingError("Festival not found.");

    const [lineup, picks] = await Promise.all([getLineup(supabase, festival.id), getVisiblePicks(supabase, festival.id)]);
    const artists = new Map(lineupArtists(lineup).map((a) => [a.id, a]));
    const mine = picks
      .filter((p) => p.userId === user.id && artists.has(p.artistId))
      .map((p) => {
        const artist = artists.get(p.artistId)!;
        const times = artist.performances.flatMap((perf) => (perf.startsAt ? [perf.startsAt.getTime()] : []));
        return {
          artistName: artist.name,
          priority: p.priority,
          firstStartsAt: times.length ? new Date(Math.min(...times)) : null,
        };
      });

    const admin = createAdminClient();
    const client = await getProviderClient(admin, user.id, provider, musicConfigFromEnv());
    const result = await exportFestivalPlaylist(admin, user.id, festival, client, mine);
    revalidatePath(`/festivals/${slug}`);
    const missing = result.notFound.length ? ` Couldn't find: ${result.notFound.slice(0, 5).join(", ")}${result.notFound.length > 5 ? "…" : ""}.` : "";
    return { message: `Saved ${result.trackCount} tracks to your ${PROVIDER_LABELS[provider]} playlist.${missing}` };
  });
}
