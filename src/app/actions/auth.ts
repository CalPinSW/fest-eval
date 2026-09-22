"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema, firstIssue } from "@/lib/validation";
import { runAction, type ActionState } from "./result";

export async function signIn(_: ActionState, form: FormData): Promise<ActionState> {
  const next = safeNextPath(form.get("next")?.toString());
  const result = await runAction(async () => {
    const parsed = signInSchema.safeParse({ email: form.get("email"), password: form.get("password") });
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: "Wrong email or password." };
  });
  if (result.error) return result;
  redirect(next);
}

export async function signUp(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const parsed = signUpSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
      username: form.get("username"),
    });
    if (!parsed.success) return { error: firstIssue(parsed.error) };

    const supabase = await createClient();
    const { data: taken } = await supabase.from("profiles").select("id").eq("username", parsed.data.username).maybeSingle();
    if (taken) return { error: "That username is taken." };

    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { username: parsed.data.username } },
    });
    if (error) return { error: error.message };
    // With email confirmation on, there is no session until the link is clicked.
    if (!data.session) return { message: "Check your email to confirm your account, then sign in." };
  });
  if (result.error || result.message) return result;
  redirect("/festivals");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
