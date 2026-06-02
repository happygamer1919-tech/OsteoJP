import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node-environment unit tests for the pure scheduling logic (overlap math,
// timezone/date helpers). Component and DB-integration tests are out of scope
// for this config.
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Mirror the tsconfig `@/*` -> `./*` path alias so tests can import modules by
  // their app-absolute specifier (e.g. the ingestion route, which pulls its deps
  // via `@/lib/...`). Other lib tests use relative imports and are unaffected.
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
