import type { Metadata } from "next";
import { createFestivalAction, importFromClashfinderAction } from "@/app/actions/festivals";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { isModerator, requireUser } from "@/lib/auth";
import { clashfinderCredentialsFromEnv } from "@/lib/clashfinder/client";

export const metadata: Metadata = { title: "Add a festival" };

// Importing a large festival (thousands of sets) from Clashfinder runs in this page's server action.
export const maxDuration = 300;

const COMMON_ZONES = [
  "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris", "Europe/Berlin", "Europe/Amsterdam",
  "Europe/Brussels", "Europe/Madrid", "Europe/Copenhagen", "Europe/Budapest", "America/New_York",
  "America/Chicago", "America/Denver", "America/Los_Angeles", "Australia/Sydney", "Asia/Tokyo", "UTC",
];

export default async function NewFestivalPage() {
  const user = await requireUser("/festivals/new");
  const canImport = isModerator(user) && clashfinderCredentialsFromEnv() !== null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="page-title">Add a festival</h1>

      {canImport && (
        <section className="card">
          <h2 className="font-semibold">Import from Clashfinder</h2>
          <p className="mt-1 text-sm text-muted">
            Paste a clashfinder.com link or id. The lineup re-syncs daily; community corrections are kept.
          </p>
          <ActionForm action={importFromClashfinderAction} className="mt-4 flex flex-wrap gap-2">
            <label htmlFor="clashfinderId" className="sr-only">Clashfinder link or id</label>
            <input id="clashfinderId" name="clashfinderId" required placeholder="https://clashfinder.com/s/glasto2026/" className="input flex-1" />
            <SubmitButton pendingText="Importing…">Import</SubmitButton>
          </ActionForm>
        </section>
      )}

      <section className="card">
        <h2 className="font-semibold">Create it yourself</h2>
        <p className="mt-1 text-sm text-muted">
          You&apos;ll be its editor. Others can suggest additions and set times for you to approve.
        </p>
        <ActionForm action={createFestivalAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="label">Name</label>
            <input id="name" name="name" required minLength={2} maxLength={120} className="input" placeholder="Green Fields 2027" />
          </div>
          <div>
            <label htmlFor="location" className="label">Location <span className="text-muted">(optional)</span></label>
            <input id="location" name="location" maxLength={120} className="input" />
          </div>
          <div>
            <label htmlFor="timezone" className="label">Time zone</label>
            <select id="timezone" name="timezone" className="input" defaultValue="Europe/London">
              {COMMON_ZONES.map((z) => <option key={z}>{z}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="startsOn" className="label">First day</label>
            <input id="startsOn" name="startsOn" type="date" className="input" />
          </div>
          <div>
            <label htmlFor="endsOn" className="label">Last day</label>
            <input id="endsOn" name="endsOn" type="date" className="input" />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Creating…">Create festival</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
