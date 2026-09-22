import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveSpotifyConnection, syncLikedArtists } from "@/lib/data/music";
import { siteUrl } from "@/lib/env";
import { musicConfigFromEnv } from "@/lib/music/config";
import { createSpotifyClient, exchangeSpotifyCode } from "@/lib/music/spotify";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPOTIFY_STATE_COOKIE } from "@/lib/music/oauth";

export async function GET(request: NextRequest) {
  const settings = (result: string) => {
    const response = NextResponse.redirect(`${siteUrl()}/settings?spotify=${result}`);
    response.cookies.delete({ name: SPOTIFY_STATE_COOKIE, path: "/api/connect/spotify" });
    return response;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/settings`);

  const params = request.nextUrl.searchParams;
  const expectedState = request.cookies.get(SPOTIFY_STATE_COOKIE)?.value;
  if (params.get("error")) return settings("denied");
  if (!expectedState || params.get("state") !== expectedState) return settings("invalid_state");
  const code = params.get("code");
  const { spotify } = musicConfigFromEnv();
  if (!code || !spotify) return settings("failed");

  try {
    const tokens = await exchangeSpotifyCode(spotify, code);
    const client = createSpotifyClient(tokens.accessToken);
    const me = await client.getCurrentUser();
    const admin = createAdminClient();
    await saveSpotifyConnection(admin, user.id, tokens, me.id, {});
    await syncLikedArtists(admin, user.id, client);
    return settings("connected");
  } catch (error) {
    console.error("Spotify connection failed", error);
    return settings("failed");
  }
}
