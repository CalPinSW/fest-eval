"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp } from "@/app/actions/auth";
import { FormMessage } from "./action-form";
import { SubmitButton } from "./submit-button";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Signing in…">Sign in</SubmitButton>
      <p className="text-center text-sm text-muted">
        New here? <Link href="/signup" className="link">Create an account</Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="username" className="label">Username</label>
        <input id="username" name="username" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" className="input" aria-describedby="username-hint" />
        <p id="username-hint" className="mt-1 text-xs text-muted">Friends find you by this. Letters, numbers and _.</p>
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Creating account…">Create account</SubmitButton>
      <p className="text-center text-sm text-muted">
        Already have an account? <Link href="/login" className="link">Sign in</Link>
      </p>
    </form>
  );
}
