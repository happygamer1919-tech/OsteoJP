import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node-environment unit tests for the superadmin app's pure logic (operator
// gate, tenant-input validation). DB-integration tests for tenant provisioning
// live in packages/db (gated on DATABASE_URL).
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
