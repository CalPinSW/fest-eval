import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type AppSupabaseClient = SupabaseClient<Database>;
export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type AppRole = Database["public"]["Enums"]["app_role"];
