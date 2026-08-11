/**
 * auth.spec.ts — Authentication (login + tenant/role in session)
 *
 *  1. Unauthenticated user is redirected to /login
 *  2. Login with valid credentials lands in the app (session established)
 *  3. Wrong password / unknown email shows the invalid-credentials error
 *  4. Empty form stays on /login (native required validation)
 *  5. An authenticated session carries tenant + role: an admin reaches the app,
 *     and visiting /login while authenticated bounces back into it.
 *  6. Therapist login redirects to /dashboard (scenario 1.x — login per role)
 *  7. Reception login redirects to /dashboard (scenario 1.x — login per role)
 *
 * Role-specific session enforcement (reception has no clinical access) is proven
 * in clinical.spec.ts.
 */
import { test, expect } from "@playwright/test";
import { USERS, E2E_PASSWORD } from "./fixtures";

// ---------------------------------------------------------------------------
// Unauthenticated — fresh context, no stored session.
// ---------------------------------------------------------------------------
test.describe("unauthenticated", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("accessing /patients redirects to /login", async ({ page }) => {
    await page.goto("/patients");
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test("accessing /agenda redirects to /login", async ({ page }) => {
    await page.goto("/agenda");
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test("login with valid admin credentials establishes a session", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(USERS.admin);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /Iniciar sessão/i }).click();
    // Login action redirects to /dashboard on success.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });
  });

  test("login with valid therapist credentials redirects to /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(USERS.therapist);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /Iniciar sessão/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });
  });

  test("login with valid reception credentials redirects to /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(USERS.reception);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /Iniciar sessão/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });
  });

  test("wrong password shows the invalid-credentials error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(USERS.admin);
    await page.locator('input[name="password"]').fill("definitely-wrong-99999");
    await page.getByRole("button", { name: /Iniciar sessão/i }).click();
    await expect(page.getByText(/Não foi possível iniciar sessão/i)).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("unknown email shows the invalid-credentials error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("nobody@nowhere.test");
    await page.locator('input[name="password"]').fill("whatever");
    await page.getByRole("button", { name: /Iniciar sessão/i }).click();
    await expect(page.getByText(/Não foi possível iniciar sessão/i)).toBeVisible({ timeout: 8_000 });
  });

  test("submitting an empty form stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Iniciar sessão/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  // -------------------------------------------------------------------------
  // LE-staff-no-forgot-password - the recovery route is reachable from /login.
  //
  // WHAT THIS DELIBERATELY DOES NOT DO: submit the form. Submitting asks
  // Supabase to SEND MAIL, and a test that mails on every CI run is a test that
  // gets muted. The send path is proven without a browser instead:
  // app/auth/forgot-password/request.test.ts holds it to one outcome for
  // success and every failure, and inert-mount.test.ts proves in source that it
  // fires only from the explicit submit. What only a browser can prove is that
  // a locked-out person can actually GET to the form, which is the whole of
  // this card.
  // -------------------------------------------------------------------------
  test("the login screen reaches the password-recovery form", async ({ page }) => {
    await page.goto("/login");

    const link = page.getByRole("link", { name: /Esqueceu-se da palavra-passe\?/i });
    await expect(link).toBeVisible();
    await link.click();

    await expect(page).toHaveURL(/\/auth\/forgot-password/, { timeout: 8_000 });
    await expect(
      page.getByRole("heading", { name: /Recuperar a palavra-passe/i }),
    ).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();

    // And back, so a staff member who clicked by mistake is not stranded on a
    // screen with no way out, the dead end this card exists to remove.
    await page.getByRole("link", { name: /Voltar ao início de sessão/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test("the recovery form renders on a direct visit, and sends nothing to get there", async ({
    page,
  }) => {
    // A staff member is as likely to be handed this URL as to click through to
    // it. The GET must render the form and must not have mailed anybody: the
    // screen still shows the request form, never the "check your email"
    // confirmation, which is what a mount-time send would produce.
    await page.goto("/auth/forgot-password");
    await expect(page.getByRole("heading", { name: /Recuperar a palavra-passe/i })).toBeVisible();
    await expect(page.getByText(/Verifique o seu email/i)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Authenticated session (default admin storage state from setup).
// ---------------------------------------------------------------------------
test("an authenticated admin session reaches the app and skips /login", async ({ page }) => {
  // Tenant + role claims resolved from the stored session let admin read patients.
  await page.goto("/patients");
  await expect(page).toHaveURL(/\/patients(\?|$)/);
  await expect(page.getByRole("heading", { name: "Pacientes" })).toBeVisible();

  // Already authenticated: the root dispatcher sends us into the app, not /login.
  await page.goto("/");
  await expect(page).not.toHaveURL(/\/login/);
});
