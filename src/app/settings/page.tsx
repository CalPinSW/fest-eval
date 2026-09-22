import type { Metadata } from "next";
import { disconnectAction, syncLikedArtistsAction } from "@/app/actions/music";
import { ActionForm } from "@/components/action-form";
import { AppleMusicConnect } from "@/components/apple-music-connect";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { listConnections } from "@/lib/data/music";
import { configuredProviders } from "@/lib/music/config";
import { MUSIC_PROVIDERS, PROVIDER_LABELS } from "@/lib/music/types";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Settings" };

const SPOTIFY_MESSAGES: Record<string, { tone: "success" | "danger"; text: string }> = {
  connected: { tone: "success", text: "Spotify connected." },
  denied: { tone: "danger", text: "Spotify access wasn't granted." },
  invalid_state: { tone: "danger", text: "That Spotify sign-in expired. Please try again." },
  failed: { tone: "danger", text: "Couldn't connect Spotify. Please try again." },
};

export default async function SettingsPage(props: PageProps<"/settings">) {
  const user = await requireUser("/settings");
  const { spotify } = await props.searchParams;
  const connections = await listConnections(createAdminClient(), user.id);
  const available = configuredProviders();
  const flash = typeof spotify === "string" ? SPOTIFY_MESSAGES[spotify] : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="page-title">Settings</h1>

      <section className="card">
        <h2 className="font-semibold">Account</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Username</dt>
          <dd>@{user.username}</dd>
          <dt className="text-muted">Role</dt>
          <dd className="capitalize">{user.role}</dd>
        </dl>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Music services</h2>
          <p className="text-sm text-muted">
            Connect a service to see which of the artists you follow are playing, and to save your picks as a playlist. We only read
            who you follow and create playlists you ask for.
          </p>
        </div>
        {flash && <p role="status" className={`text-sm ${flash.tone === "success" ? "text-success" : "text-danger"}`}>{flash.text}</p>}
        {MUSIC_PROVIDERS.map((provider) => {
          const connection = connections.find((c) => c.provider === provider);
          const enabled = available.includes(provider);
          return (
            <div key={provider} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">{PROVIDER_LABELS[provider]}</h3>
                <p className="text-sm text-muted">
                  {connection
                    ? `Connected · ${connection.likedArtistCount} artists${connection.lastSyncedAt ? `, synced ${connection.lastSyncedAt.toLocaleDateString("en-GB")}` : ""}`
                    : enabled
                      ? "Not connected"
                      : "Not available on this site yet"}
                </p>
              </div>
              {connection ? (
                <div className="flex gap-2">
                  <ActionForm action={syncLikedArtistsAction}>
                    <input type="hidden" name="provider" value={provider} />
                    <SubmitButton className="btn-secondary" pendingText="Syncing…">Refresh</SubmitButton>
                  </ActionForm>
                  <ActionForm action={disconnectAction}>
                    <input type="hidden" name="provider" value={provider} />
                    <SubmitButton className="btn-ghost" pendingText="…">Disconnect</SubmitButton>
                  </ActionForm>
                </div>
              ) : enabled ? (
                provider === "spotify" ? (
                  <a href="/api/connect/spotify" className="btn-primary">Connect Spotify</a>
                ) : (
                  <AppleMusicConnect />
                )
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
