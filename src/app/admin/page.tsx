import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRoleAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await requireUser("/admin");
  if (user.role !== "admin") notFound();
  const { data: staff } = await (await createClient())
    .from("profiles")
    .select("id, username, role")
    .neq("role", "user")
    .order("username");

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="page-title">Admin</h1>
      <section className="card">
        <h2 className="font-semibold">Change a role</h2>
        <p className="mt-1 text-sm text-muted">Moderators can edit any lineup, review suggestions and import from Clashfinder.</p>
        <ActionForm action={setRoleAction} className="mt-3 flex flex-wrap gap-2" aria-label="Change a role">
          <label htmlFor="role-username" className="sr-only">Username</label>
          <input id="role-username" name="username" required placeholder="Username" className="input max-w-xs" />
          <label htmlFor="role" className="sr-only">Role</label>
          <select id="role" name="role" className="input w-auto" defaultValue="moderator">
            <option value="user">User</option>
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
          </select>
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </ActionForm>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Moderators and admins</h2>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {(staff ?? []).map((p) => (
            <li key={p.id} className="flex justify-between px-4 py-3 text-sm">
              <span className="font-medium">@{p.username}</span>
              <span className="chip capitalize">{p.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
