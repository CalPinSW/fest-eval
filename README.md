# Clashplan

Plan who you'll see at a festival: rank artists 1–5, spot clashes, see which of your friends are going to which sets, and turn your picks into a Spotify or Apple Music playlist.

Next.js 16 (App Router) · Supabase (Postgres, Auth, row-level security) · Tailwind 4 · Vitest · Playwright. Built to deploy on Vercel.

## Features

| Area | What it does | Where |
| --- | --- | --- |
| Lineups | Festivals, stages, artists and set times. Imported from [Clashfinder](https://clashfinder.com) and re-synced daily; anyone can create their own festival. | `src/lib/data/lineup.ts`, `src/lib/data/sync.ts` |
| Community edits | Non-editors suggest additions, time changes and removals; festival owners and moderators approve or reject. Human edits to imported sets are never overwritten by the next sync. | `src/lib/data/proposals.ts`, `src/lib/domain/lineup-sync.ts` |
| Picks | Mark yourself as going, then rate artists 1 (maybe) to 5 (must see). | `src/lib/data/social.ts` |
| Streaming | Connect Spotify (OAuth) or Apple Music (MusicKit JS). Suggests lineup artists you follow; exports a playlist weighted by priority. | `src/lib/music/*`, `src/lib/data/music.ts` |
| Friends | Friend requests by username. Friends attending the same festival see each other's picks (enforced in the database). | `supabase/migrations/*` (RLS), `src/app/friends` |
| Timetable | Stage × time grid per festival day (late sets stay on the previous night), friends' interest on each set, and a "My plan" view that resolves clashes optimally by priority. | `src/lib/domain/timetable.ts`, `src/lib/domain/planner.ts` |

## Getting started

Requires Node 20.9+, Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
npm install
npm run db:start          # local Supabase on ports 553xx (see supabase/config.toml)
cp .env.example .env.local
```

Fill `.env.local` from `supabase status` (`API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY`) and generate `TOKEN_ENCRYPTION_KEY` with the command in `.env.example`. Then:

```bash
npm run db:seed           # demo festival + users alice/bob/cara@demo.test, password festival-demo
npm run dev
```

Clashfinder, Spotify and Apple Music are optional. Without their keys the related buttons stay hidden or say "not available".

## Architecture

```
src/
  lib/domain/        Pure logic: name normalisation, time zones and festival days,
                     timetable layout, clash planner, sync planning, suggestions
  lib/clashfinder/   Feed client + tolerant parser
  lib/music/         Spotify & Apple Music clients behind one interface, token encryption
  lib/data/          Database access; every function takes a Supabase client
  lib/validation.ts  zod schemas shared by forms, proposals and the DB layer
  app/               Pages, server actions (app/actions), route handlers (app/api)
supabase/migrations  Schema + row-level security policies
```

Design decisions:

- **Access control lives in Postgres.** Pages and actions talk to Supabase *as the signed-in user*, so RLS policies decide what's visible: friends' picks, proposals, who may edit a lineup. Column-level grants stop users changing their own role or approving their own suggestions. The service-role client is used only for Clashfinder sync and streaming tokens.
- **Streaming tokens** sit in a table no client role can read, encrypted with AES-256-GCM.
- **Picks are per artist, not per set**, so an artist playing twice is one decision. The planner only schedules them once.
- **Priority weights are exponential** (1, 3, 9, 27, 81), so one "must see" outweighs two "really want"s when resolving clashes.
- **Clashfinder sync** matches on Clashfinder's per-set code: it updates and deletes imported rows, skips any a person has edited, and links hand-added sets instead of duplicating them.

## Testing

| Command | Layer | Needs |
| --- | --- | --- |
| `npm test` | Unit (domain, clients with fake HTTP, validation) + React component tests | nothing |
| `npm run coverage` | Same, with coverage thresholds on the pure layers | nothing |
| `npm run test:integration` | Data layer and **RLS policies** against a real local database, as different users | `npm run db:start` |
| `npm run test:e2e` | Playwright: sign-up, lineup building, picks, timetable plan, friends, proposals, API auth, mobile layout | local Supabase |
| `npm run test:all` | Typecheck, lint and all of the above | local Supabase |

After changing a migration: `npm run db:reset && npm run db:types`. CI (`.github/workflows/ci.yml`) runs everything, including a check that the generated types match the migrations.

## Deploying to Vercel

1. Create a Supabase project and apply the migrations: `supabase link --project-ref <ref> && supabase db push`.
2. In Supabase Auth, set the Site URL and redirect URLs to your domain. If email confirmation is on, point the confirm-email template at `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
3. Import the repo in Vercel and set the variables from `.env.example`. `vercel.json` schedules the daily Clashfinder sync, which Vercel calls with `CRON_SECRET`.
4. Make yourself an admin once: `update profiles set role = 'admin' where username = '<you>';`. After that, use `/admin` to appoint moderators.

## Third-party caveats

- **Clashfinder** data is CC BY-NC 3.0: fine for a non-commercial app with attribution (it's in the footer). Commercial use needs permission from its author. API access needs a free account and a public key generated at <https://clashfinder.com/pages/api/>.
- **Spotify**: since February 2026, development-mode apps are limited to 5 allow-listed users and the owner needs Premium. A public launch needs Spotify's extended quota. The client targets the post-2026 API: no artist top-tracks endpoint (tracks come from search), and playlists go through `POST /me/playlists` and `/playlists/{id}/items`.
- **Apple Music** needs a paid Apple Developer account for a MusicKit key. Apple's API can't remove tracks from a library playlist, so each export creates a new playlist.
