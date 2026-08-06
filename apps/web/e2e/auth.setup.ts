/**
 * auth.setup.ts
 *
 * Runs once before all tests. Logs in as each role and writes the resulting
 * browser storage state to e2e/.auth/<role>.json so tests can reuse sessions
 * without re-authenticating on every spec.
 *
 * Required env vars:
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 *   E2E_THERAPIST_EMAIL, E2E_THERAPIST_PASSWORD
 *   E2E_RECEPTION_EMAIL, E2E_RECEPTION_PASSWORD
 *
 * The portal patient is NOT in that list: since W13-03 it signs in with a
 * seeded trusted device, not a password. See that step at the bottom.
 */

import { test as setup } from "@playwright/test";
import path from "path";
import { PORTAL_BASE_URL, PORTAL_DEVICE_TOKEN, PORTAL_STORAGE } from "./fixtures";

const AUTH_DIR = path.join(__dirname, ".auth");

type RoleConfig = {
  name: string;
  emailVar: string;
  passwordVar: string;
  storageFile: string;
};

const ROLES: RoleConfig[] = [
  {
    name: "admin",
    emailVar: "E2E_ADMIN_EMAIL",
    passwordVar: "E2E_ADMIN_PASSWORD",
    storageFile: path.join(AUTH_DIR, "admin.json"),
  },
  {
    name: "therapist",
    emailVar: "E2E_THERAPIST_EMAIL",
    passwordVar: "E2E_THERAPIST_PASSWORD",
    storageFile: path.join(AUTH_DIR, "therapist.json"),
  },
  {
    name: "reception",
    emailVar: "E2E_RECEPTION_EMAIL",
    passwordVar: "E2E_RECEPTION_PASSWORD",
    storageFile: path.join(AUTH_DIR, "reception.json"),
  },
];

for (const role of ROLES) {
  setup(`authenticate as ${role.name}`, async ({ page }) => {
    const email = process.env[role.emailVar];
    const password = process.env[role.passwordVar];

    if (!email || !password) {
      throw new Error(
        `Missing env vars ${role.emailVar} / ${role.passwordVar} for e2e auth setup`,
      );
    }

    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /Iniciar sessão/i }).click();

    // After login, the app redirects to /dashboard. Allow generous time for the
    // dev server to compile the dashboard route on first hit.
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    await page.context().storageState({ path: role.storageFile });
  });
}

// ---------------------------------------------------------------------------
// Portal patient login (apps/portal — port 3001)
// ---------------------------------------------------------------------------

setup("authenticate as portal patient", async ({ page }) => {
  // W13-03 — THE EMAIL AND PASSWORD ARE GONE, with the screen that took them.
  // Decision D: "patient login is a 6-digit SMS OTP, phone only... No password,
  // no magic link, no session minted from any other artefact." The portal's
  // password form, its recovery screen and its activation screen were deleted
  // with LOOP 3, so this step can no longer type a password anywhere.
  //
  // IT USES THE OTHER REAL DOOR: the 30-day trusted device. The seed writes the
  // sha256 of PORTAL_DEVICE_TOKEN into patient_trusted_devices for the portal
  // test patient; this presents the token as the portal's device cookie and then
  // simply LOADS THE LOGIN SCREEN, whose on-load check calls
  // /api/v1/auth/otp/trusted, gets a session back and redirects. Nothing here is
  // test-only code in the app — it is the path a returning patient takes daily.
  //
  // WHY NOT THE CODE ITSELF: the transport is off outside production and the
  // sink holds the code in the API process's memory. Reading it would need a
  // back door in the login path, which is what this loop removed.
  await page.context().addCookies([
    {
      name: "__Host-ojp_device",
      value: PORTAL_DEVICE_TOKEN,
      // A SECURE SCHEME, deliberately, even though the portal is served over
      // http here. Two different rules are in play and only one of them is the
      // browser's:
      //
      //   * CHROME DEVTOOLS PROTOCOL, which is what addCookies drives, validates
      //     the URL's SCHEME before it will store a Secure cookie. With
      //     `http://localhost:3001` it refuses the whole call —
      //     "Protocol error (Storage.setCookies): Invalid cookie fields" — and
      //     the setup dies before it can plant anything.
      //   * THE BROWSER ITSELF treats localhost as a trustworthy origin and
      //     sends Secure cookies to it over plain http. That is exactly why the
      //     portal's own `secure: true` cookies work in local dev.
      //
      // So the cookie is STORED against the https origin and SENT to the http
      // one, because cookies are scoped by host and not by scheme. Verified
      // against a real Chromium rather than reasoned about: http rejected,
      // https accepted, and the cookie then arrived on a plain
      // http://localhost request.
      url: PORTAL_BASE_URL.replace(/^http:/, "https:"),
      httpOnly: true,
      // The `__Host-` prefix REQUIRES Secure, Path=/ and no Domain. `url` alone,
      // with no domain/path pair, yields a host-only cookie at path "/", which
      // is exactly the three attributes the prefix demands.
      secure: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto(`${PORTAL_BASE_URL}/auth/login`);

  // The trusted-device check runs on load and redirects into the portal.
  await page.waitForURL(/\/portal\/dashboard/, { timeout: 20_000 });

  await page.context().storageState({ path: PORTAL_STORAGE.patient });
});
