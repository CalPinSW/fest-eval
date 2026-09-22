import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./tests/setup/dom.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./tests/setup/integration.ts"],
          // Tests share one local database; run files serially.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["src/lib/supabase/database.types.ts", "**/*.test.*", "src/lib/music/fake-fetch.ts"],
      // Pure logic must stay thoroughly unit-tested. The data layer is covered
      // by the integration suite and pages by Playwright, so they are not
      // held to a unit-coverage bar.
      thresholds: {
        "src/lib/domain/**": { lines: 95, branches: 90, functions: 95 },
        "src/lib/clashfinder/**": { lines: 95, branches: 85 },
        "src/lib/music/{spotify,apple-music,http,playlist,token-crypto}.ts": { lines: 95, branches: 80 },
        "src/lib/{validation,forms,redirects}.ts": { lines: 95, branches: 85 },
      },
    },
  },
});
