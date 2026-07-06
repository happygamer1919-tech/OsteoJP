/**
 * staff-primary-service.spec.ts — Per-therapist primary service admin (W3-04).
 * Runs as admin (default storageState). The admin sets/changes a therapist's
 * primary service among the services already mapped to them; the primary is the
 * service W3-03 auto-selects at booking.
 *
 * The E2E therapist is seeded with two mapped services (Osteopatia primary, then
 * NESA). This test flips the primary to NESA, verifies it persisted, then
 * RESTORES it to Osteopatia so the shared seed DB matches what the W3-03 booking
 * spec expects (workers: 1 → no interleaving, so restore is sufficient).
 */
import { test, expect } from "@playwright/test";
import { THERAPIST_NAME } from "./fixtures";

const OSTEO = "Osteopatia";
const NESA = "NESA (sensível)";

test("admin sets and changes a therapist's primary service (W3-04)", async ({ page }) => {
  await page.goto("/admin/staff");

  const row = page.locator("tbody tr").filter({ hasText: THERAPIST_NAME });
  const select = row.locator('select[name="serviceId"]');
  const setBtn = row.getByRole("button", { name: "Definir" });

  // Seed default: primary is the first mapped service (Osteopatia).
  await expect(select.locator("option:checked")).toHaveText(OSTEO);

  // Change primary → NESA and confirm it persisted (re-designation is
  // delete+insert under the hood; the UI just reflects the new earliest).
  await select.selectOption({ label: NESA });
  await setBtn.click();
  await page.waitForURL(/admin\/staff/);
  await expect(
    page.locator("tbody tr").filter({ hasText: THERAPIST_NAME }).locator("select[name='serviceId'] option:checked"),
  ).toHaveText(NESA);

  // Restore primary → Osteopatia (also proves change works both ways) and leave
  // the shared seed DB as the booking spec expects.
  const row2 = page.locator("tbody tr").filter({ hasText: THERAPIST_NAME });
  await row2.locator('select[name="serviceId"]').selectOption({ label: OSTEO });
  await row2.getByRole("button", { name: "Definir" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(
    page.locator("tbody tr").filter({ hasText: THERAPIST_NAME }).locator("select[name='serviceId'] option:checked"),
  ).toHaveText(OSTEO);
});
