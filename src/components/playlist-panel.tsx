import Link from "next/link";
import { exportPlaylistAction } from "@/app/actions/music";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { PROVIDER_LABELS, type MusicProviderId } from "@/lib/music/types";

export function PlaylistPanel({
  slug,
  connected,
  playlists,
  pickCount,
}: {
  slug: string;
  connected: MusicProviderId[];
  playlists: { provider: MusicProviderId; playlist_url: string | null; track_count: number }[];
  pickCount: number;
}) {
  return (
    <section className="card" aria-labelledby="playlist-heading">
      <h2 id="playlist-heading" className="font-semibold">Playlist</h2>
      {connected.length === 0 ? (
        <p className="mt-1 text-sm text-muted">
          <Link href="/settings" className="link">Connect Spotify or Apple Music</Link> to turn your picks into a playlist and get
          suggestions from artists you follow.
        </p>
      ) : pickCount === 0 ? (
        <p className="mt-1 text-sm text-muted">Pick some artists and we&apos;ll build a playlist, most-wanted first.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {connected.map((provider) => {
            const existing = playlists.find((p) => p.provider === provider);
            return (
              <ActionForm key={provider} action={exportPlaylistAction} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="provider" value={provider} />
                <SubmitButton className="btn-secondary" pendingText="Building playlist…">
                  {existing ? "Update" : "Create"} {PROVIDER_LABELS[provider]} playlist
                </SubmitButton>
                {existing?.playlist_url && (
                  <a href={existing.playlist_url} target="_blank" rel="noreferrer" className="link text-sm">
                    Open ({existing.track_count} tracks)
                  </a>
                )}
              </ActionForm>
            );
          })}
        </div>
      )}
    </section>
  );
}
