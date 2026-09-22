import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/festivals");
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="page-title mb-6">Create an account</h1>
      <div className="card">
        <SignUpForm />
      </div>
    </div>
  );
}
