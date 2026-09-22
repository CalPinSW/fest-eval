/**
 * Seed a local database with a demo festival, users and picks.
 *   npm run db:seed
 * Users: alice@demo.test, bob@demo.test, cara@demo.test (password: festival-demo)
 * alice is an admin.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parseClashfinderEvent } from "../src/lib/clashfinder/parse";
import { applyClashfinderEvent } from "../src/lib/data/sync";
import type { Database } from "../src/lib/supabase/database.types";

config({ path: ".env.local", quiet: true });

const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

const PASSWORD = "festival-demo";
const STAGES = ["Main Stage", "The Tent", "Woodland", "Late Bar"];
const ACTS = [
  "Fontaines D.C.", "Wet Leg", "Bicep", "Little Simz", "Idles", "Self Esteem", "Arlo Parks", "Floating Points",
  "Black Country, New Road", "Sampha", "Kae Tempest", "Jamie xx", "Nilüfer Yanya", "Yard Act", "Caribou", "Kokoroko",
  "Four Tet", "Shygirl", "The Smile", "Bonobo", "Bat for Lashes", "Sons of Kemet", "Porridge Radio", "Moderat",
  "Ezra Collective", "Big Thief", "Burial", "Loyle Carner", "Anna Calvi", "Squid", "The Chemical Brothers", "Björk",
];

function demoFeed() {
  const days = ["2027-06-25", "2027-06-26", "2027-06-27"];
  let act = 0;
  const locations = STAGES.map((name, s) => {
    const events = [];
    for (const day of days) {
      const startHour = s === 3 ? 20 : 14;
      const slots = s === 3 ? 3 : 4;
      for (let i = 0; i < slots && act < ACTS.length * 3; i++) {
        const name = ACTS[act++ % ACTS.length];
        const h = startHour + i * 2 + (s % 2) * 0.5;
        const end = h + (i === slots - 1 && s === 0 ? 2 : 1.25);
        const fmt = (x: number) => {
          const dayOffset = Math.floor(x / 24);
          const d = new Date(`${day}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + dayOffset);
          const hh = Math.floor(x % 24);
          const mm = Math.round((x % 1) * 60);
          return `${d.toISOString().slice(0, 10)} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
        };
        events.push({ name, short: `${name.slice(0, 6).toLowerCase()}${act}`, start: fmt(h), end: fmt(end) });
      }
    }
    return { name, events };
  });
  return { name: "Demo Fields 2027", id: "demofields27", timezone: "Europe/London", locations };
}

async function ensureUser(username: string, email: string) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const alice = await ensureUser("alice", "alice@demo.test");
  const bob = await ensureUser("bob", "bob@demo.test");
  const cara = await ensureUser("cara", "cara@demo.test");
  await admin.from("profiles").update({ role: "admin" }).eq("id", alice);

  const event = parseClashfinderEvent(demoFeed());
  let { data: festival } = await admin.from("festivals").select("id").eq("slug", "demo-fields-2027").maybeSingle();
  if (!festival) {
    const { data, error } = await admin
      .from("festivals")
      .insert({
        slug: "demo-fields-2027",
        name: "Demo Fields 2027",
        location: "Somewhere Green",
        timezone: "Europe/London",
        starts_on: "2027-06-25",
        ends_on: "2027-06-27",
        created_by: alice,
      })
      .select("id")
      .single();
    if (error) throw error;
    festival = data;
  }
  const summary = await applyClashfinderEvent(admin, festival.id, event);

  for (const [a, b] of [[alice, bob], [alice, cara]]) {
    await admin.from("friendships").upsert({ requester_id: a, addressee_id: b, status: "accepted" }, { onConflict: "id", ignoreDuplicates: true });
  }

  const { data: performances } = await admin.from("performances").select("artist_id").eq("festival_id", festival.id);
  const artistIds = [...new Set((performances ?? []).map((p) => p.artist_id))];
  for (const [i, user] of [alice, bob, cara].entries()) {
    await admin.from("festival_attendees").upsert({ user_id: user, festival_id: festival.id });
    const picks = artistIds
      .filter((_, n) => (n + i) % 3 !== 0)
      .map((artist_id, n) => ({ user_id: user, festival_id: festival!.id, artist_id, priority: ((n * (i + 2)) % 5) + 1 }));
    await admin.from("artist_picks").upsert(picks);
  }

  console.log(`Seeded Demo Fields 2027 (${summary.inserted} new sets). Sign in as alice@demo.test / ${PASSWORD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
