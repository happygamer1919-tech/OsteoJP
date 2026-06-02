import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node-environment unit tests for pure logic (scheduling/date helpers,
// validation) plus lightweight client-component render checks via
// react-dom/server (no jsdom needed). DB-integration tests stay out of scope.
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
    include: ["lib/**/*.test.ts", "app/**/*.test.tsx"],
  },
});
