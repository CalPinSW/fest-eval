import Link from "next/link";
import { FriendBadges } from "@/components/friend-badges";
import { describePerformance } from "@/components/performance-summary";
import { PlaylistPanel } from "@/components/playlist-panel";
import { PriorityPicker } from "@/components/priority-picker";
import { loadFestivalView } from "@/lib/data/festival-view";
import { listConnections } from "@/lib/data/music";
import { PROVIDER_LABELS } from "@/lib/music/types";
import { createAdminClient } from "@/lib/supabase/admin";

const FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "mine", label: "My picks" },
  { value: "friends", label: "Friends' picks" },
] as const;

export default async function LineupPage(props: PageProps<"/festivals/[slug]">) {
  const { slug } = await props.params;
  const search = await props.searchParams;
  const show = FILTERS.some((f) => f.value === search.show) ? (search.show as string) : "all";
  const q = typeof search.q === "string" ? search.q.trim().toLowerCase() : "";

  const view = await loadFestivalView(slug);
  const { festival, artists, user, attending, myPicks, friendPicks, suggestions } = view;
  const connected = user ? (await listConnections(createAdminClient(), user.id)).map((c) => c.provider) : [];

  const visible = artists.filter((a) => {
    if (q && !a.name.toLowerCase().includes(q)) return false;
    if (show === "mine") return myPicks.has(a.id);
    if (show === "friends") return friendPicks.has(a.id);
    return true;
  });

  const pickerProps = (artist: { id: string; name: string }) => ({
    artistId: artist.id,
    artistName: artist.name,
    festivalId: festival.id,
    slug: festival.slug,
    priority: myPicks.get(artist.id) ?? null,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <form role="search" className="flex flex-1 gap-2">
            <input type="hidden" name="show" value={show} />
            <label htmlFor="artist-q" className="sr-only">Search artists</label>
            <input id="artist-q" name="q" defaultValue={q} placeholder={`Search ${artists.length} artists`} className="input" />
          </form>
          <div className="flex gap-1" role="group" aria-label="Filter">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={`?show=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                aria-current={show === f.value ? "true" : undefined}
                className={show === f.value ? "chip bg-accent-soft text-accent" : "chip hover:text-text"}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>

        {user && !attending && artists.length > 0 && (
          <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">Mark yourself as going to start picking artists.</p>
        )}

        {artists.length === 0 ? (
          <div className="card text-center">
            <p className="font-medium">No lineup yet.</p>
            {user && (
              <Link href={`/festivals/${festival.slug}/edit`} className="link mt-2 inline-block text-sm">
                {view.canEdit ? "Add the first artist" : "Suggest artists"}
              </Link>
            )}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-muted">Nothing matches.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Lineup">
            {visible.map((artist) => (
              <li key={artist.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{artist.name}</p>
                  <ul className="text-xs text-muted">
                    {artist.performances.map((p) => (
                      <li key={p.id}>{describePerformance(p, festival.timezone, festival.day_boundary_hour)}</li>
                    ))}
                  </ul>
                </div>
                <FriendBadges friends={friendPicks.get(artist.id) ?? []} />
                {attending && <PriorityPicker {...pickerProps(artist)} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {user && (
        <aside className="space-y-4">
          {suggestions.length > 0 && (
            <section className="card" aria-labelledby="suggested-heading">
              <h2 id="suggested-heading" className="font-semibold">Artists you follow</h2>
              <p className="mt-1 text-xs text-muted">Playing here, not picked yet.</p>
              <ul className="mt-3 space-y-3">
                {suggestions.slice(0, 12).map(({ artist, providers }) => (
                  <li key={artist.id}>
                    <p className="text-sm font-medium">
                      {artist.name}{" "}
                      <span className="text-xs font-normal text-muted">via {providers.map((p) => PROVIDER_LABELS[p]).join(" & ")}</span>
                    </p>
                    <div className="mt-1">
                      <PriorityPicker {...pickerProps(artist)} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {attending && (
            <PlaylistPanel slug={festival.slug} connected={connected} playlists={view.playlists} pickCount={myPicks.size} />
          )}
          <section className="card text-sm">
            <h2 className="font-semibold">How picking works</h2>
            <p className="mt-1 text-muted">
              1 = maybe, 5 = must see. Higher picks win clashes in your timetable plan and get more tracks in your playlist.
              Friends going to this festival can see your picks.
            </p>
          </section>
        </aside>
      )}
    </div>
  );
}
