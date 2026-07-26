/**
 * staff-primary-service.spec.ts — Per-therapist primary service admin (W3-04),
 * re-pointed to the W12-40 Gerir modal (Serviço principal section). Runs as admin.
 * The admin sets/changes a therapist's primary service; the primary is the
 * service W3-03 auto-selects at booking.
 *
 * The E2E therapist is seeded with two mapped services (Osteopatia primary, then
 * NESA). This test flips the primary to NESA, verifies it persisted, then
 * RESTORES it to Osteopatia so the shared seed DB matches what the W3-03 booking
 * spec expects.
 */
import { test, expect, type Page } from "@playwright/test";
import { THERAPIST_NAME } from "./fixtures";

const OSTEO = "Osteopatia";
const NESA = "NESA (sensível)";

function card(page: Page, name: string) {
  return page.locator('[data-testid="equipa-card"]').filter({ hasText: name });
}
function manageModal(page: Page) {
  return page.getByRole("dialog", { name: /Gerir/i });
}
/** Open THERAPIST_NAME's Gerir modal on the Serviço principal section. */
async function openService(page: Page) {
  const modal = manageModal(page);
  if (!(await modal.isVisible())) {
    await card(page, THERAPIST_NAME).getByRole("button", { name: "Gerir", exact: true }).click();
    await expect(modal).toBeVisible();
  }
  await modal.getByRole("radio", { name: "Serviço principal", exact: true }).click();
  return modal;
}

test("admin sets and changes a therapist's primary service (W3-04)", async ({ page }) => {
  await page.goto("/admin/staff");

  let modal = await openService(page);
  const select = modal.locator('select[name="serviceId"]');

  // Seed default: primary is the first mapped service (Osteopatia).
  await expect(select.locator("option:checked")).toHaveText(OSTEO);

  // Change primary → NESA and confirm it persisted (re-designation is
  // delete+insert under the hood; the UI just reflects the new earliest).
  await select.selectOption({ label: NESA });
  await modal.getByRole("button", { name: "Definir" }).click();
  await page.waitForURL(/admin\/staff/);
  modal = await openService(page);
  await expect(modal.locator('select[name="serviceId"] option:checked')).toHaveText(NESA);

  // Restore primary → Osteopatia (also proves change works both ways) and leave
  // the shared seed DB as the booking spec expects.
  await modal.locator('select[name="serviceId"]').selectOption({ label: OSTEO });
  await modal.getByRole("button", { name: "Definir" }).click();
  await page.waitForURL(/admin\/staff/);
  modal = await openService(page);
  await expect(modal.locator('select[name="serviceId"] option:checked')).toHaveText(OSTEO);
});
