"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { removeFriendship, respondToFriendRequest, sendFriendRequest } from "@/lib/data/social";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionState } from "./result";

export async function sendFriendRequestAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser("/friends");
    const username = form.get("username")?.toString() ?? "";
    const outcome = await sendFriendRequest(await createClient(), user.id, username);
    revalidatePath("/friends");
    return { message: outcome === "accepted" ? `You and ${username} are now friends.` : `Request sent to ${username}.` };
  });
}

export async function respondToFriendRequestAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireUser("/friends");
    await respondToFriendRequest(await createClient(), form.get("friendshipId")?.toString() ?? "", form.get("accept") === "true");
    revalidatePath("/friends");
  });
}

export async function removeFriendAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireUser("/friends");
    await removeFriendship(await createClient(), form.get("friendshipId")?.toString() ?? "");
    revalidatePath("/friends");
  });
}
