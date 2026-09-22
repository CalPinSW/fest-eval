import type { Metadata } from "next";
import { removeFriendAction, respondToFriendRequestAction, sendFriendRequestAction } from "@/app/actions/friends";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { listFriendships, type FriendSummary } from "@/lib/data/social";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Friends" };

function Person({ friend }: { friend: FriendSummary }) {
  return (
    <span>
      <span className="font-medium">@{friend.username}</span>
      {friend.displayName && friend.displayName !== friend.username && <span className="text-muted"> · {friend.displayName}</span>}
    </span>
  );
}

export default async function FriendsPage() {
  const user = await requireUser("/friends");
  const { friends, incoming, outgoing } = await listFriendships(await createClient(), user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="page-title">Friends</h1>
        <p className="mt-1 text-sm text-muted">
          Friends going to the same festival see each other&apos;s picks. Your username is <span className="font-medium text-text">@{user.username}</span>.
        </p>
      </div>

      <section className="card">
        <h2 className="font-semibold">Add a friend</h2>
        <ActionForm action={sendFriendRequestAction} resetOnSuccess className="mt-3 flex gap-2" aria-label="Add a friend">
          <label htmlFor="friend-username" className="sr-only">Their username</label>
          <input id="friend-username" name="username" required placeholder="Their username" className="input" autoComplete="off" />
          <SubmitButton pendingText="Sending…">Send request</SubmitButton>
        </ActionForm>
      </section>

      {incoming.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Requests for you</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {incoming.map((f) => (
              <li key={f.friendshipId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <Person friend={f} />
                <div className="flex gap-2">
                  <ActionForm action={respondToFriendRequestAction}>
                    <input type="hidden" name="friendshipId" value={f.friendshipId} />
                    <input type="hidden" name="accept" value="true" />
                    <SubmitButton aria-label={`Accept @${f.username}`}>Accept</SubmitButton>
                  </ActionForm>
                  <ActionForm action={respondToFriendRequestAction}>
                    <input type="hidden" name="friendshipId" value={f.friendshipId} />
                    <input type="hidden" name="accept" value="false" />
                    <SubmitButton className="btn-secondary" aria-label={`Decline @${f.username}`}>Decline</SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Your friends ({friends.length})</h2>
        {friends.length === 0 ? (
          <p className="text-sm text-muted">No friends yet. Add someone by their username.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface" aria-label="Your friends">
            {friends.map((f) => (
              <li key={f.friendshipId} className="flex items-center justify-between gap-2 px-4 py-3">
                <Person friend={f} />
                <ActionForm action={removeFriendAction}>
                  <input type="hidden" name="friendshipId" value={f.friendshipId} />
                  <SubmitButton className="btn-ghost" aria-label={`Remove @${f.username}`}>Remove</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Waiting for them</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {outgoing.map((f) => (
              <li key={f.friendshipId} className="flex items-center justify-between gap-2 px-4 py-3">
                <Person friend={f} />
                <ActionForm action={removeFriendAction}>
                  <input type="hidden" name="friendshipId" value={f.friendshipId} />
                  <SubmitButton className="btn-ghost" aria-label={`Cancel request to @${f.username}`}>Cancel</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
