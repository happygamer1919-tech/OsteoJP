import { defineConfig, devices } from "@playwright/test";

/**
 * OsteoJP — Playwright E2E configuration
 *
 * Runs against a locally running Next.js dev server by default.
 * Set BASE_URL env var to point at a Vercel preview URL for PR-level runs.
 *
 * Tests require two env vars for seeded test users:
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD   — admin role
 *   E2E_THERAPIST_EMAIL / E2E_THERAPIST_PASSWORD — therapist role
 *   E2E_RECEPTION_EMAIL / E2E_RECEPTION_PASSWORD — receptionist role
 *
 * These users must exist in the dev/preview Supabase tenant before running.
 */

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "pt-PT",
    timezoneId: "Europe/Lisbon",
  },

  projects: [
    // Auth setup runs first — saves storage state for each role.
    { name: "setup", testMatch: /.*\.setup\.ts/ },

    {
      name: "admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "therapist",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/therapist.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "reception",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/reception.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
