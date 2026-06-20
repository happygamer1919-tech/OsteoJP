/**
 * portal-reminders.spec.ts — patient reminder preferences (apps/portal)
 *
 * Feature: PR #336 — ReminderToggles component on /portal/account.
 * Each toggle fires updateReminderPrefsAction (server action) →
 * PATCH apps/api/api/v1/patient/profile → updates patients.reminder_*_enabled.
 *
 * The seed (seed-e2e.mjs → ensurePortalPatient) resets the test patient to a
 * known state before every run: sms=true, email=false.
 *
 * These tests run against the portal app on http://localhost:3001 and require
 * apps/api on http://localhost:3002 — both declared as webServers in
 * playwright.config.ts. Chromium only (listed in testIgnore for ff + webkit).
 */

import { test, expect } from "@playwright/test";
import { PORTAL_BASE_URL, PORTAL_STORAGE } from "./fixtures";

// All portal tests in this file use the portal patient session and the
// portal base URL. test.use applies to the entire file.
test.use({
  storageState: PORTAL_STORAGE.patient,
  baseURL: PORTAL_BASE_URL,
});

// ---------------------------------------------------------------------------
// Account page — initial render
// ---------------------------------------------------------------------------

test("account page renders reminder toggles", async ({ page }) => {
  await page.goto("/portal/account");
  await expect(page).toHaveURL(/\/portal\/account(\?|$)/, { timeout: 10_000 });

  // Section heading
  await expect(page.getByText(/Preferências/i).first()).toBeVisible();

  // Both toggles present
  const smsToggle = page.getByRole("switch", { name: /^SMS$/i });
  const emailToggle = page.getByRole("switch", { name: /^Email$/i });
  await expect(smsToggle).toBeVisible();
  await expect(emailToggle).toBeVisible();

  // Seed state: sms=true, email=false
  await expect(smsToggle).toBeChecked();
  await expect(emailToggle).not.toBeChecked();
});

// ---------------------------------------------------------------------------
// Toggle persistence — SMS off
// ---------------------------------------------------------------------------

test("disabling SMS persists after reload", async ({ page }) => {
  await page.goto("/portal/account");
  await expect(page).toHaveURL(/\/portal\/account(\?|$)/, { timeout: 10_000 });

  const smsToggle = page.getByRole("switch", { name: /^SMS$/i });
  await expect(smsToggle).toBeChecked();

  // Toggle SMS off — fires updateReminderPrefsAction.
  await smsToggle.click();
  await expect(smsToggle).not.toBeChecked();

  // Wait for the server action to complete (optimistic update is immediate;
  // the round-trip updates the DB before the reload test is meaningful).
  // A short wait is sufficient; the action is fast in local Supabase.
  await page.waitForTimeout(800);

  // Reload the page — data must be re-fetched from the DB.
  await page.goto("/portal/account");
  await expect(page).toHaveURL(/\/portal\/account(\?|$)/, { timeout: 10_000 });

  // Toggle must still be unchecked.
  await expect(page.getByRole("switch", { name: /^SMS$/i })).not.toBeChecked();

  // Restore to seed state (sms=true) so subsequent tests start clean.
  await page.getByRole("switch", { name: /^SMS$/i }).click();
  await page.waitForTimeout(400);
});

// ---------------------------------------------------------------------------
// Both-off warning
// ---------------------------------------------------------------------------

test("disabling both SMS and email shows the all-off warning", async ({ page }) => {
  await page.goto("/portal/account");
  await expect(page).toHaveURL(/\/portal\/account(\?|$)/, { timeout: 10_000 });

  const smsToggle = page.getByRole("switch", { name: /^SMS$/i });
  const emailToggle = page.getByRole("switch", { name: /^Email$/i });

  // Seed state: sms=on, email=off. Disable SMS to get both-off.
  await smsToggle.click();
  await expect(smsToggle).not.toBeChecked();
  await expect(emailToggle).not.toBeChecked();

  // Warning message rendered by ReminderToggles when both are off.
  await expect(
    page.getByRole("status").filter({ hasText: /lembretes/i }),
  ).toBeVisible({ timeout: 4_000 });

  // Re-enable SMS — warning must disappear.
  await smsToggle.click();
  await expect(smsToggle).toBeChecked();
  await expect(
    page.getByRole("status").filter({ hasText: /lembretes/i }),
  ).toHaveCount(0);

  // Leave the page in the seed state (sms=on, email=off).
  await page.waitForTimeout(400);
});
