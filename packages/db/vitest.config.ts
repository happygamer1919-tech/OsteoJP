import { defineConfig } from "vitest/config";

// Minimal node-environment runner for packages/db integration tests. These are
// GATED on a live DATABASE_URL (see the test files' describe.skipIf) so a plain
// `pnpm test` stays green in CI / locally without a database. The only suite
// today is the ai_ingestion_requests RLS tenant-isolation check (migration 0008).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Live DB round-trips (connect + seed + role-switched assertions) can exceed
    // the 5s default on a cold local Postgres.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
