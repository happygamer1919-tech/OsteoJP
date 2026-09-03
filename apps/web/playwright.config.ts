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
/**
 * LE-local-supabase-per-lane: the three dev ports are ENV-DRIVEN, defaulting to
 * the values they were hardcoded at. Two executor lanes running the suite at the
 * same time cannot share port 3000, and the shared local Supabase they used to
 * share is what SR-39 split; leaving the app ports fixed would have moved the
 * collision one layer up rather than removing it.
 *
 * CI is unaffected BY CONSTRUCTION: every default below is the literal the file
 * carried before, and e2e.yml sets none of these variables.
 */
const WEB_PORT = process.env.WEB_PORT ?? "3000";
const PORTAL_PORT = process.env.PORTAL_PORT ?? "3001";
const API_PORT = process.env.API_PORT ?? "3002";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? `http://localhost:${API_PORT}`;

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
  // Per-test wall-clock budget. The default 30s is too tight for this suite's
  // longer multi-dialog flows on overloaded CI runners, where actions can run
  // 4-12x slower than local (observed: a 7.8s-local test taking 96s on CI). That
  // slow-runner timeout was the dominant e2e flake; 120s absorbs the variance
  // without masking real hangs. Individual long tests may still raise it further.
  timeout: 120_000,
  // The JSON report is what `.github/scripts/assert-e2e-executed.mjs` reads to
  // prove a hard-required test RAN rather than merely not-failing. Without it
  // that guard has nothing to inspect and a skipped gate-bearing test is
  // invisible inside a green shard - which is exactly how PG8's direction A
  // skipped green on two consecutive runs before the guard existed.
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    ["json", { outputFile: "e2e-results.json" }],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${WEB_PORT}`,
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
        // W4-05: getUserMedia camera mock is Chromium-only, like the specs above.
        "**/camera-to-ficha.spec.ts",
        // W4-12: booking location auto-fill spec — Chromium-only, like the above.
        "**/location-auto-select.spec.ts",
        // W4-06: start-consultation spec — Chromium-only, like the above.
        "**/consultation-start.spec.ts",
        // W4-07: recording spec (MediaRecorder mock) — Chromium-only.
        "**/recording.spec.ts",
        // W7-01: staff-invite spec provisions a real auth user — Chromium-only.
        "**/staff-invite.spec.ts",
        // W8-02: staff-contact-fields provisions a real auth user, Chromium-only.
        "**/staff-contact-fields.spec.ts",
        // W7-02: profile-reachability changes real passwords — Chromium-only, so
        // three browsers never race on the same account's password.
        "**/profile-reachability.spec.ts",
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
        // W4-05: getUserMedia camera mock is Chromium-only, like the specs above.
        "**/camera-to-ficha.spec.ts",
        // W4-12: booking location auto-fill spec — Chromium-only, like the above.
        "**/location-auto-select.spec.ts",
        // W4-06: start-consultation spec — Chromium-only, like the above.
        "**/consultation-start.spec.ts",
        // W4-07: recording spec (MediaRecorder mock) — Chromium-only.
        "**/recording.spec.ts",
        // W7-01: staff-invite spec provisions a real auth user — Chromium-only.
        "**/staff-invite.spec.ts",
        // W8-02: staff-contact-fields provisions a real auth user, Chromium-only.
        "**/staff-contact-fields.spec.ts",
        // W7-02: profile-reachability changes real passwords — Chromium-only, so
        // three browsers never race on the same account's password.
        "**/profile-reachability.spec.ts",
      ],
    },
  ],

  webServer: process.env.BASE_URL
    ? undefined
    : [
        {
          command: "pnpm dev",
          url: `http://localhost:${WEB_PORT}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          // W4-08: TEST-ONLY scoped-audio-bucket env so the presigned signer
          // produces a URL (the e2e mocks the S3 PUT via page.route — these are
          // NOT real credentials and never reach AWS). The real scoped key lives
          // in Vercel env only; this is a harness fixture, like the local
          // Supabase test key.
          env: {
            AUDIO_S3_REGION: "eu-central-1",
            AUDIO_S3_BUCKET: "osteojp-audio-intake-e2e",
            AUDIO_S3_ACCESS_KEY_ID: "e2e-test-access-key",
            AUDIO_S3_SECRET_ACCESS_KEY: "e2e-test-secret-key",
          },
        },
        // apps/api — required by portal server actions (PATCH /api/v1/patient/profile).
        // NEXT_PUBLIC_API_URL must be http://localhost:3002 in the test environment
        // (set via env var or NEXT_PUBLIC_API_URL=http://localhost:3002 prefix).
        {
          command: "pnpm --filter api dev",
          url: `http://localhost:${API_PORT}`,
          stdout: "pipe",
          stderr: "pipe",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          // W13-03: the patient-session signing secret. A HARNESS FIXTURE, named
          // so it cannot be mistaken for anything else, exactly like the
          // AUDIO_S3_* values above and matching the literal db-tests.yml
          // already uses. Without it /api/v1/auth/otp/trusted answers 503 and
          // the portal patient can never be signed in — which is the honest
          // behaviour, and is why the value has to be supplied here rather than
          // defaulted inside the app.
          env: {
            PATIENT_SESSION_SECRET: "ci-fixture-not-a-secret-at-least-32-chars",
          },
        },
        // apps/portal — patient-facing app; portal-reminders.spec.ts targets this.
        // Explicitly set NEXT_PUBLIC_API_URL so Next.js's DefinePlugin inlines it
        // at compile time (the plugin reads from process.env at server startup, not
        // from the inherited env when using pnpm --filter). Without this prefix the
        // portal's apiBase() returns '' and all server-action API calls fail silently.
        {
          command: `NEXT_PUBLIC_API_URL=${API_URL} pnpm --filter portal dev`,
          url: `http://localhost:${PORTAL_PORT}`,
          stdout: "pipe",
          stderr: "pipe",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          // W13-03: the tenant the OTP screens name when they call the API. Both
          // OTP routes take it in the body because they run BEFORE any
          // authentication, so there is no token to derive it from. TENANT_A,
          // the tenant the seed builds.
          env: {
            PORTAL_TENANT_ID: "00000000-0000-0000-0000-0000000000a1",
          },
        },
      ],
});
