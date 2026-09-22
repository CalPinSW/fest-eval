<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes

- Read README.md for architecture. Access control is enforced by RLS in `supabase/migrations`; keep data functions taking a client so integration tests can run them as different users.
- After a migration change: `npm run db:reset && npm run db:types`.
- Every change needs tests at the right layer: pure logic → `src/**/*.test.ts`, RLS/data → `tests/integration`, user flows → `e2e/`.
