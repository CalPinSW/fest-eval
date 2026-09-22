import Link from "next/link";
import { setAttendingAction } from "@/app/actions/picks";
import { ActionForm } from "@/components/action-form";
import { formatDateRange } from "@/components/festival-card";
import { FestivalTabs } from "@/components/festival-tabs";
import { SubmitButton } from "@/components/submit-button";
import { loadFestivalView } from "@/lib/data/festival-view";

export async function generateMetadata(props: LayoutProps<"/festivals/[slug]">) {
  const { slug } = await props.params;
  const view = await loadFestivalView(slug);
  return { title: view.festival.name };
}

export default async function FestivalLayout(props: LayoutProps<"/festivals/[slug]">) {
  const { slug } = await props.params;
  const { festival, user, attending, canEdit, friendsGoing } = await loadFestivalView(slug);
  const dates = formatDateRange(festival.starts_on, festival.ends_on);

  const tabs = [
    { href: "", label: "Lineup" },
    { href: "/timetable", label: "Timetable" },
    ...(user ? [{ href: "/edit", label: canEdit ? "Edit lineup" : "Suggest an edit" }] : []),
    ...(user ? [{ href: "/proposals", label: canEdit ? "Review suggestions" : "Your suggestions" }] : []),
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{festival.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {[dates, festival.location].filter(Boolean).join(" · ") || "Dates to be announced"}
            {festival.clashfinder_id && <span className="chip ml-2">Synced from Clashfinder</span>}
          </p>
          {friendsGoing.length > 0 && (
            <p className="mt-2 text-sm">
              <span className="font-medium">{friendsGoing.length} {friendsGoing.length === 1 ? "friend" : "friends"} going:</span>{" "}
              <span className="text-muted">{friendsGoing.map((f) => `@${f.username}`).join(", ")}</span>
            </p>
          )}
        </div>
        {user ? (
          <ActionForm action={setAttendingAction}>
            <input type="hidden" name="slug" value={festival.slug} />
            <input type="hidden" name="festivalId" value={festival.id} />
            <input type="hidden" name="attending" value={String(!attending)} />
            <SubmitButton className={attending ? "btn-secondary" : "btn-primary"} pendingText="Saving…">
              {attending ? "✓ Going · leave" : "I'm going"}
            </SubmitButton>
          </ActionForm>
        ) : (
          <Link href={`/login?next=/festivals/${festival.slug}`} className="btn-primary">
            Sign in to plan
          </Link>
        )}
      </header>
      <FestivalTabs slug={festival.slug} tabs={tabs} />
      {props.children}
    </div>
  );
}
