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
    // app/**/*.test.ts is included as well as .tsx, deliberately. Until W13-01
    // only .tsx was collected under app/, so an app-level test that renders
    // nothing - a source guard, a route-shape assertion - was silently NEVER
    // RUN. A test that is not collected is worse than no test: it reads as
    // protection. Widening this collects exactly the files it should and no
    // others (verified: one file existed in that shape at the time).
    //
    // W13-02 widened it again, for the same reason and after hitting the same
    // trap: components/ held NO collected tests at all, so the shell — the
    // component every authenticated route renders — could not be guarded by
    // anything. The bell defect PG4 fixed lived in exactly that blind spot: a
    // decorative element drifted inside a link and stayed there because no test
    // could have expressed the placement invariant. Verified before widening:
    // components/ contained exactly one test file, the one added with this
    // change, so nothing previously-silent is being switched on unexamined.
    include: [
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "components/**/*.test.ts",
      "components/**/*.test.tsx",
    ],
  },
});
