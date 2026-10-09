import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "../src/lib/supabase/database.types";

export const PASSWORD = "e2e-password-123";

export const admin = () =>
  createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });

export const uniq = () => randomUUID().replace(/-/g, "").slice(0, 8);

export interface E2EUser {
  id: string;
  username: string;
  email: string;
}

export async function createUser(prefix = "e2e"): Promise<E2EUser> {
  const username = `${prefix}_${uniq()}`;
  const email = `${username}@e2e.test`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) throw error;
  return { id: data.user.id, username, email };
}

export async function signIn(page: Page, user: E2EUser, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

/**
 * A festival with a timed lineup, created through the service role for speed.
 * Times are Europe/London (BST): 18:00 local = 17:00Z.
 */
export async function createFestivalWithLineup(owner: E2EUser | null, sets: { artist: string; stage: string; start: string; end: string }[]) {
  const db = admin();
  const slug = `e2e-${uniq()}`;
  const { data: festival, error } = await db
    .from("festivals")
    .insert({ slug, name: `E2E Fest ${slug.slice(4)}`, timezone: "Europe/London", starts_on: "2027-07-02", ends_on: "2027-07-03", created_by: owner?.id ?? null })
    .select("*")
    .single();
  if (error) throw error;

  const stageIds = new Map<string, string>();
  for (const [i, name] of [...new Set(sets.map((s) => s.stage))].entries()) {
    const { data } = await db.from("stages").insert({ festival_id: festival.id, name, sort_order: i }).select("id").single();
    stageIds.set(name, data!.id);
  }
  for (const set of sets) {
    const normalized = set.artist.toLowerCase();
    const { data: artist } = await db
      .from("artists")
      .upsert({ name: set.artist, normalized_name: normalized }, { onConflict: "normalized_name" })
      .select("id")
      .single();
    await db.from("performances").insert({
      festival_id: festival.id,
      artist_id: artist!.id,
      stage_id: stageIds.get(set.stage)!,
      starts_at: set.start,
      ends_at: set.end,
    });
  }
  return festival;
}

/** A Glastonbury-sized festival: `artists` acts over three days and many stages, inserted in bulk. */
export async function createLargeFestival(artists: number, stages = 60) {
  const db = admin();
  const suffix = uniq();
  const { data: festival, error } = await db
    .from("festivals")
    .insert({ slug: `big-${suffix}`, name: `Big Fest ${suffix}`, timezone: "Europe/London", starts_on: "2027-06-25", ends_on: "2027-06-27" })
    .select("*")
    .single();
  if (error) throw error;

  const { data: stageRows } = await db
    .from("stages")
    .insert(Array.from({ length: stages }, (_, i) => ({ festival_id: festival.id, name: `Stage ${i + 1}`, sort_order: i })))
    .select("id");
  const artistRows: { id: string }[] = [];
  for (let i = 0; i < artists; i += 500) {
    const batch = Array.from({ length: Math.min(500, artists - i) }, (_, j) => ({
      name: `Act ${String(i + j).padStart(5, "0")} ${suffix}`,
      normalized_name: `act ${String(i + j).padStart(5, "0")} ${suffix}`,
    }));
    const { data, error: e } = await db.from("artists").insert(batch).select("id");
    if (e) throw e;
    artistRows.push(...data);
  }
  // Spread acts evenly: every stage runs every day, back-to-back 40-minute sets from 11:00.
  const perDay = Math.ceil(artistRows.length / 3);
  const perfs = artistRows.map((a, i) => {
    const day = Math.floor(i / perDay);
    const slot = Math.floor((i % perDay) / stages);
    const start = Date.UTC(2027, 5, 25 + day, 10) + slot * 45 * 60_000;
    return {
      festival_id: festival.id,
      artist_id: a.id,
      stage_id: stageRows![i % stages].id,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(start + 40 * 60_000).toISOString(),
    };
  });
  for (let i = 0; i < perfs.length; i += 500) {
    const { error: e } = await db.from("performances").insert(perfs.slice(i, i + 500));
    if (e) throw e;
  }
  return { festival, suffix };
}

/** Rate an artist and wait until the server has saved it. */
export async function pick(page: Page, artistName: string, level: "Maybe" | "Would like" | "Want to see" | "Really want" | "Must see") {
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && "next-action" in r.request().headers());
  const radio = page.getByRole("radiogroup", { name: `How much do you want to see ${artistName}?` }).getByRole("radio", { name: level });
  await radio.click();
  await saved;
  await expect(radio).toHaveAttribute("aria-checked", "true");
}
