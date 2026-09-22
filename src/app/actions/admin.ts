"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { UserFacingError } from "@/lib/data/errors";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/supabase/types";
import { runAction, type ActionState } from "./result";

const ROLES: AppRole[] = ["user", "moderator", "admin"];

export async function setRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireUser("/admin");
    const username = form.get("username")?.toString().trim() ?? "";
    const role = form.get("role") as AppRole;
    if (!ROLES.includes(role)) throw new UserFacingError("Unknown role.");
    // The RPC itself checks the caller is an admin.
    const { error } = await (await createClient()).rpc("set_user_role", { target_username: username, new_role: role });
    if (error) throw new UserFacingError(error.message);
    revalidatePath("/admin");
    return { message: `${username} is now ${role === "user" ? "a user" : `a ${role}`}.` };
  });
}
