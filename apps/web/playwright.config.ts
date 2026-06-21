import { defineConfig, devices } from "@playwright/test";

/**
 * OsteoJP — Playwright E2E configuration
 *
 * Scope: the stable, owner-confirmed workflows only — auth, Patients,
 * Scheduling, Clinical Records. Admin and Reminders are in flux and are
 * intentionally excluded (see `testIgnore`).
 *
 * Runs against a locally running Next.js dev server by default. Set BASE_URL to
 * point at a Vercel preview for PR-level runs (disables the auto-started server).
 *
 * Prerequisites (see e2e/README.md):
 *   1. Local Supabase up + migrations applied (`supabase db reset`).
 *   2. Seed the deterministic fixture: `node e2e/seed/seed-e2e.mjs`.
 *   3. App env present (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, DATABASE_URL …) and
 *      the E2E credentials below, which match the seeded users.
 *
 * Seeded test users (provisioned by e2e/seed/seed-e2e.mjs):
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *   E2E_THERAPIST_EMAIL / E2E_THERAPIST_PASSWORD
 *   E2E_RECEPTION_EMAIL / E2E_RECEPTION_PASSWORD
 *   E2E_PORTAL_PATIENT_EMAIL / E2E_PORTAL_PATIENT_PASSWORD (portal patient)
 *
 * Three browser projects (Chromium, Firefox, WebKit) share one setup run.
 * Auth storage state files (e2e/.auth/<role>.json) are cookie-based and
 * browser-agnostic — a single Chromium setup pass suffices for all three.
 * Reminders is excluded from all projects (in flux).
 *
 * New-feature specs (quick-notes, invoicing, portal-reminders) run in
 * Chromium only — they are listed in testIgnore for Firefox and WebKit.
 * The portal tests additionally require apps/api (port 3002) and apps/portal
 * (port 3001) to be running; both are declared as webServers below.
 */
export default defineConfig({
  testDir: "./e2e",
  // Serial: the suite drives ONE dev server talking to a local Supabase. Running
  // logins/server-actions concurrently churns the dev server's upstream
  // connections to Supabase Auth and yields intermittent ECONNRESET — i.e.
  // environment flakiness, not test flakiness. One worker keeps it deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
    // Logs in as each role and saves storage state to e2e/.auth/<role>.json.
    // Runs on Chromium; the resulting JSON files are reused by all three browser
    // projects below (Playwright storage state is browser-agnostic).
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Default actor is admin; clinical/reception specs override per-file.
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
      // Out of scope for this suite — Reminders is in flux and owned by its own
      // stream's spec. (Admin had no stable spec and was removed.)
      testIgnore: ["**/reminders.spec.ts"],
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
      // New-feature specs are Chromium-only (see comment at top of file).
      testIgnore: [
        "**/reminders.spec.ts",
        "**/quick-notes.spec.ts",
        "**/invoicing.spec.ts",
        "**/portal-reminders.spec.ts",
      ],
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
      testIgnore: [
        "**/reminders.spec.ts",
        "**/quick-notes.spec.ts",
        "**/invoicing.spec.ts",
        "**/portal-reminders.spec.ts",
      ],
    },
  ],

  webServer: process.env.BASE_URL
    ? undefined
    : [
        {
          command: "pnpm dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        // apps/api — required by portal server actions (PATCH /api/v1/patient/profile).
        // NEXT_PUBLIC_API_URL must be http://localhost:3002 in the test environment
        // (set via env var or NEXT_PUBLIC_API_URL=http://localhost:3002 prefix).
        {
          command: "pnpm --filter api dev",
          url: "http://localhost:3002",
          stdout: "pipe",
          stderr: "pipe",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        // apps/portal — patient-facing app; portal-reminders.spec.ts targets this.
        // Explicitly set NEXT_PUBLIC_API_URL so Next.js's DefinePlugin inlines it
        // at compile time (the plugin reads from process.env at server startup, not
        // from the inherited env when using pnpm --filter). Without this prefix the
        // portal's apiBase() returns '' and all server-action API calls fail silently.
        {
          command: "NEXT_PUBLIC_API_URL=http://localhost:3002 pnpm --filter portal dev",
          url: "http://localhost:3001",
          stdout: "pipe",
          stderr: "pipe",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
