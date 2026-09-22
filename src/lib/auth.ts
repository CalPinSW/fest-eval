import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/supabase/types";

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string | null;
  role: AppRole;
}

/** The signed-in user, verified against Supabase Auth. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;
  return { id: profile.id, username: profile.username, displayName: profile.display_name, role: profile.role };
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export const isModerator = (user: CurrentUser | null) => user?.role === "moderator" || user?.role === "admin";

export { safeNextPath } from "./redirects";
