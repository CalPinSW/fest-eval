import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Service-role client: bypasses RLS. Only for background sync and for tables
 * clients must never read (streaming tokens). Always scope queries to a user
 * id that came from a verified session.
 */
export function createAdminClient() {
  return createClient<Database>(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
