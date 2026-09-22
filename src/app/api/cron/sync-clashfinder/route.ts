import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clashfinderCredentialsFromEnv, fetchClashfinderEvent } from "@/lib/clashfinder/client";
import { applyClashfinderEvent } from "@/lib/data/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Vercel Cron: re-sync every Clashfinder-backed festival that hasn't finished.
 * Community edits survive (see planLineupSync).
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const credentials = clashfinderCredentialsFromEnv();
  if (!credentials) return NextResponse.json({ error: "Clashfinder not configured" }, { status: 503 });

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: festivals, error } = await admin
    .from("festivals")
    .select("id, slug, clashfinder_id, timezone")
    .not("clashfinder_id", "is", null)
    .or(`ends_on.is.null,ends_on.gte.${today}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const festival of festivals ?? []) {
    try {
      const event = await fetchClashfinderEvent(festival.clashfinder_id!, credentials, { fallbackTimeZone: festival.timezone });
      const summary = await applyClashfinderEvent(admin, festival.id, event);
      results.push({ slug: festival.slug, ...summary, rejected: summary.rejected.length });
    } catch (e) {
      results.push({ slug: festival.slug, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ synced: results });
}
