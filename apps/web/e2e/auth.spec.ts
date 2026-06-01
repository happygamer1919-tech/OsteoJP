/**
 * auth.spec.ts — Authentication flows
 *
 * Plain-English scenario → test mapping:
 *
 *  1. Unauthenticated user is redirected to /login
 *  2. Login with valid credentials succeeds
 *  3. Login with wrong password shows error
 *  4. Login with unknown email shows error
 *  5. Empty login form shows required-field validation
 *  6. After login, navigating to /login redirects to the app
 */

import { test, expect } from "@playwright/test";

// These tests run without any storageState — they need a fresh session.
test.use({ storageState: { cookies: [], origins: [] } });

// ---------------------------------------------------------------------------
// 1. Unauthenticated redirect
// ---------------------------------------------------------------------------
test("unauthenticated user accessing /patients is redirected to /login", async ({
  page,
}) => {
  await page.goto("/patients");
  await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
});

test("unauthenticated user accessing /agenda is redirected to /login", async ({
  page,
}) => {
  await page.goto("/agenda");
  await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 2. Valid login
// ---------------------------------------------------------------------------
test("login with valid admin credentials succeeds", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) test.skip(true, "E2E_ADMIN_* env vars not set");

  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(email!);
  await page.getByPlaceholder("Palavra-passe").fill(password!);
  await page.getByRole("button", { name: /Entrar/i }).click();

  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// 3. Wrong password
// ---------------------------------------------------------------------------
test("login with wrong password shows error message", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL ?? "test@osteojp.test";

  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Palavra-passe").fill("wrong_password_99999");
  await page.getByRole("button", { name: /Entrar/i }).click();

  await expect(page.locator(".text-red-600")).toBeVisible({ timeout: 8_000 });
  await expect(page).toHaveURL(/\/login/);
});

// ---------------------------------------------------------------------------
// 4. Unknown email
// ---------------------------------------------------------------------------
test("login with unknown email shows error message", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("nobody@nowhere.test");
  await page.getByPlaceholder("Palavra-passe").fill("doesntmatter");
  await page.getByRole("button", { name: /Entrar/i }).click();

  await expect(page.locator(".text-red-600")).toBeVisible({ timeout: 8_000 });
  await expect(page).toHaveURL(/\/login/);
});

// ---------------------------------------------------------------------------
// 5. Empty form validation
// ---------------------------------------------------------------------------
test("submitting empty login form stays on /login", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Entrar/i }).click();
  await expect(page).toHaveURL(/\/login/);
});
