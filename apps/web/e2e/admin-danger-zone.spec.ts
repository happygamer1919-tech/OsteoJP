/**
 * admin-danger-zone.spec.ts (W12-27): the Administração overview carries a
 * COLLAPSED "Zona de risco" section at the bottom, consolidating the admin-level
 * destructive entry points (Q-W7-03-1 ruling). Collapsed by default ("not too
 * obvious"); opening it reveals the delete-password entry (always present for an
 * admin). No control is weakened - these are navigation links to routes that keep
 * their own server guards. Runs as admin (default storageState).
 */
import { test, expect } from "@playwright/test";

test("W12-27: admin overview shows a collapsed Zona de risco section", async ({ page }) => {
  await page.goto("/admin");

  const summary = page.getByText("Zona de risco", { exact: true });
  await expect(summary).toBeVisible({ timeout: 8_000 });

  // Collapsed by default.
  const details = page.locator("details").filter({ has: summary });
  await expect(details).toHaveJSProperty("open", false);

  // Opening reveals the admin-level destructive entry point (delete-password
  // config), which links to Settings without weakening any control.
  await summary.click();
  await expect(details).toHaveJSProperty("open", true);
  const passwordEntry = page.getByRole("link", { name: "Palavra-passe de eliminação" });
  await expect(passwordEntry).toBeVisible();
  await expect(passwordEntry).toHaveAttribute("href", "/admin/settings");
});
