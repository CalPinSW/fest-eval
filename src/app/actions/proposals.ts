"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { reviewProposal } from "@/lib/data/proposals";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionState } from "./result";

export async function reviewProposalAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const slug = form.get("slug")?.toString() ?? "";
    const user = await requireUser(`/festivals/${slug}/proposals`);
    const decision = form.get("decision") === "approve" ? "approve" : "reject";
    await reviewProposal(await createClient(), user.id, form.get("proposalId")?.toString() ?? "", decision, form.get("reviewNote")?.toString());
    revalidatePath(`/festivals/${slug}`, "layout");
    return { message: decision === "approve" ? "Approved and applied." : "Rejected." };
  });
}
