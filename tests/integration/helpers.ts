import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import type { AppRole, AppSupabaseClient } from "@/lib/supabase/types";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function adminClient(): AppSupabaseClient {
  return createClient<Database>(url(), process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): AppSupabaseClient {
  return createClient<Database>(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  username: string;
  email: string;
  client: AppSupabaseClient;
}

const createdUsers: string[] = [];
const createdFestivals: string[] = [];

/** Unique suffix so parallel runs and reruns never collide. */
export const uniq = () => randomUUID().replace(/-/g, "").slice(0, 8);

export async function createUser(role: AppRole = "user", usernamePrefix = "u"): Promise<TestUser> {
  const admin = adminClient();
  const username = `${usernamePrefix}_${uniq()}`;
  const email = `${username}@test.local`;
  const password = "correct-horse-battery";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) throw error;
  createdUsers.push(data.user.id);

  if (role !== "user") {
    const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", data.user.id);
    if (roleError) throw roleError;
  }

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, username, email, client };
}

export async function makeFriends(a: TestUser, b: TestUser) {
  const { data, error } = await a.client
    .from("friendships")
    .insert({ requester_id: a.id, addressee_id: b.id })
    .select("id")
    .single();
  if (error) throw error;
  const accepted = await b.client.from("friendships").update({ status: "accepted" }).eq("id", data.id);
  if (accepted.error) throw accepted.error;
}

/** A festival owned by `owner` (or by nobody, via the service role). */
export async function createFestival(owner?: TestUser, extra: Partial<Database["public"]["Tables"]["festivals"]["Insert"]> = {}) {
  const slug = `fest-${uniq()}`;
  const client = owner ? owner.client : adminClient();
  const { data, error } = await client
    .from("festivals")
    .insert({ slug, name: `Fest ${slug}`, timezone: "Europe/London", created_by: owner?.id ?? null, ...extra })
    .select("*")
    .single();
  if (error) throw error;
  createdFestivals.push(data.id);
  return data;
}

export function trackFestival(id: string) {
  createdFestivals.push(id);
}

afterAll(async () => {
  const admin = adminClient();
  if (createdFestivals.length) await admin.from("festivals").delete().in("id", createdFestivals.splice(0));
  for (const id of createdUsers.splice(0)) await admin.auth.admin.deleteUser(id);
});
