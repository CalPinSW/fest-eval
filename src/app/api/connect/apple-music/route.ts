import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { saveAppleMusicConnection, syncLikedArtists } from "@/lib/data/music";
import { siteUrl } from "@/lib/env";
import { createAppleDeveloperToken, createAppleMusicClient, fetchAppleStorefront } from "@/lib/music/apple-music";
import { musicConfigFromEnv } from "@/lib/music/config";
import { createAdminClient } from "@/lib/supabase/admin";

/** Developer token for MusicKit JS in the browser (signed-in users only). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { apple } = musicConfigFromEnv();
  if (!apple) return NextResponse.json({ error: "Apple Music isn't configured" }, { status: 503 });
  const developerToken = await createAppleDeveloperToken(apple, { ttlSeconds: 3600, origin: siteUrl() });
  return NextResponse.json({ developerToken }, { headers: { "Cache-Control": "no-store" } });
}

const bodySchema = z.object({ musicUserToken: z.string().min(10).max(4096) });

/** Store the Music-User-Token MusicKit returned after the user authorised us. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  // Same-origin only: this endpoint changes account state.
  if (request.headers.get("origin") !== new URL(siteUrl()).origin) {
    return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  }
  const { apple } = musicConfigFromEnv();
  if (!apple) return NextResponse.json({ error: "Apple Music isn't configured" }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  try {
    const developerToken = await createAppleDeveloperToken(apple);
    const auth = { developerToken, userToken: parsed.data.musicUserToken };
    const storefront = await fetchAppleStorefront(auth);
    const admin = createAdminClient();
    await saveAppleMusicConnection(admin, user.id, parsed.data.musicUserToken, storefront, {});
    const count = await syncLikedArtists(admin, user.id, createAppleMusicClient({ ...auth, storefront }));
    return NextResponse.json({ ok: true, likedArtists: count });
  } catch (error) {
    console.error("Apple Music connection failed", error);
    return NextResponse.json({ error: "Couldn't connect to Apple Music" }, { status: 502 });
  }
}
