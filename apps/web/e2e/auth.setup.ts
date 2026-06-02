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
 */

import { test as setup } from "@playwright/test";
import path from "path";

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
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Palavra-passe").fill(password);
    await page.getByRole("button", { name: /Entrar/i }).click();

    // After login, the app redirects to /dashboard. Allow generous time for the
    // dev server to compile the dashboard route on first hit.
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    await page.context().storageState({ path: role.storageFile });
  });
}
