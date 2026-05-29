import { defineConfig } from "vitest/config";

// Node-environment unit tests for the pure scheduling logic (overlap math,
// timezone/date helpers). Component and DB-integration tests are out of scope
// for this config.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
