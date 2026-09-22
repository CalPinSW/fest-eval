"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setAttending, setPick } from "@/lib/data/social";
import { parsePriority } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionState } from "./result";

export async function setAttendingAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const slug = form.get("slug")?.toString() ?? "";
    const user = await requireUser(`/festivals/${slug}`);
    await setAttending(await createClient(), user.id, form.get("festivalId")?.toString() ?? "", form.get("attending") === "true");
    revalidatePath(`/festivals/${slug}`, "layout");
    revalidatePath("/");
  });
}

export async function setPickAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const slug = form.get("slug")?.toString() ?? "";
    const user = await requireUser(`/festivals/${slug}`);
    await setPick(
      await createClient(),
      user.id,
      form.get("festivalId")?.toString() ?? "",
      form.get("artistId")?.toString() ?? "",
      parsePriority(form.get("priority")),
    );
    revalidatePath(`/festivals/${slug}`, "layout");
  });
}
