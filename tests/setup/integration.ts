import { config } from "dotenv";

// CI provides variables directly; locally they come from .env.local.
config({ path: ".env.local", quiet: true });

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) {
  if (!process.env[name]) {
    throw new Error(`${name} is not set. Start Supabase with \`npm run db:start\` and create .env.local (see README).`);
  }
}
