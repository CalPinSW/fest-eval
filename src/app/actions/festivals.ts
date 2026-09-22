"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fetchClashfinderEvent, clashfinderCredentialsFromEnv, parseClashfinderId } from "@/lib/clashfinder/client";
import { isModerator, requireUser } from "@/lib/auth";
import { UserFacingError } from "@/lib/data/errors";
import { applyLineupChange, createFestival, getFestivalBySlug } from "@/lib/data/lineup";
import { proposeLineupChange } from "@/lib/data/proposals";
import { applyClashfinderEvent, createFestivalFromClashfinder } from "@/lib/data/sync";
import { parseLineupForm } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { festivalInputSchema } from "@/lib/validation";
import { runAction, type ActionState } from "./result";

export async function createFestivalAction(_: ActionState, form: FormData): Promise<ActionState> {
  let slug = "";
  const result = await runAction(async () => {
    const user = await requireUser("/festivals/new");
    const input = festivalInputSchema.parse({
      name: form.get("name"),
      location: form.get("location") ?? "",
      timezone: form.get("timezone"),
      startsOn: form.get("startsOn") ?? "",
      endsOn: form.get("endsOn") ?? "",
    });
    slug = (await createFestival(await createClient(), user.id, input)).slug;
  });
  if (result.error) return result;
  redirect(`/festivals/${slug}/edit`);
}

/** Moderators import (or re-sync) a festival straight from Clashfinder. */
export async function importFromClashfinderAction(_: ActionState, form: FormData): Promise<ActionState> {
  let slug = "";
  const result = await runAction(async () => {
    const user = await requireUser("/festivals/new");
    if (!isModerator(user)) throw new UserFacingError("Only moderators can import from Clashfinder.");
    const clashfinderId = parseClashfinderId(form.get("clashfinderId")?.toString() ?? "");
    if (!clashfinderId) throw new UserFacingError("Enter a Clashfinder id or link, like glasto2026.");
    const credentials = clashfinderCredentialsFromEnv();
    if (!credentials) throw new UserFacingError("Clashfinder isn't configured on this site.");

    const event = await fetchClashfinderEvent(clashfinderId, credentials).catch((e: Error) => {
      throw new UserFacingError(e.message);
    });
    const admin = createAdminClient();
    const { data: existing } = await admin.from("festivals").select("id, slug").eq("clashfinder_id", clashfinderId).maybeSingle();
    const festival = existing ?? (await createFestivalFromClashfinder(admin, clashfinderId, event, user.id));
    await applyClashfinderEvent(admin, festival.id, event);
    slug = festival.slug;
  });
  if (result.error) return result;
  redirect(`/festivals/${slug}`);
}

/**
 * Lineup form handler. Editors' changes apply immediately; everyone else's
 * become a suggestion for an editor to review.
 */
export async function submitLineupChangeAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const slug = form.get("slug")?.toString() ?? "";
    const user = await requireUser(`/festivals/${slug}/edit`);
    const supabase = await createClient();
    const festival = await getFestivalBySlug(supabase, slug);
    if (!festival) throw new UserFacingError("Festival not found.");

    const change = parseLineupForm(form, festival.timezone);
    const { data: canEdit } = await supabase.rpc("can_edit_festival", { uid: user.id, fid: festival.id });

    if (canEdit) {
      await applyLineupChange(supabase, festival.id, change);
      revalidatePath(`/festivals/${slug}`, "layout");
      return { message: change.kind === "remove_performance" ? "Removed." : "Saved." };
    }

    await proposeLineupChange(supabase, user.id, festival.id, change, form.get("note")?.toString());
    revalidatePath(`/festivals/${slug}/proposals`);
    return { message: "Thanks! Your suggestion will appear once an editor approves it." };
  });
}
