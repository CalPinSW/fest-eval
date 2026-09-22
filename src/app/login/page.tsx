import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth-forms";
import { getCurrentUser, safeNextPath } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, error } = await props.searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null);
  if (await getCurrentUser()) redirect(nextPath);
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="page-title mb-6">Sign in</h1>
      {error && <p role="alert" className="mb-4 text-sm text-danger">That link didn&apos;t work. Try signing in.</p>}
      <div className="card">
        <SignInForm next={nextPath} />
      </div>
    </div>
  );
}
