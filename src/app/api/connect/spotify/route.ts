import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { musicConfigFromEnv } from "@/lib/music/config";
import { SPOTIFY_STATE_COOKIE } from "@/lib/music/oauth";
import { spotifyAuthorizeUrl } from "@/lib/music/spotify";


/** Start the Spotify OAuth flow. The state cookie guards against CSRF. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/settings`);

  const { spotify } = musicConfigFromEnv();
  if (!spotify) return NextResponse.redirect(`${siteUrl()}/settings?error=spotify_not_configured`);

  const state = randomBytes(16).toString("base64url");
  const response = NextResponse.redirect(spotifyAuthorizeUrl(spotify, state));
  response.cookies.set(SPOTIFY_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/connect/spotify",
  });
  return response;
}
