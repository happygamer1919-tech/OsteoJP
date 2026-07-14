/**
 * deleted-patients.spec.ts - W6-04. The "Pacientes eliminados" recovery view is
 * OWNER-ONLY. An owner lists soft-deleted patients (with NIF) and restores them;
 * a non-owner is redirected from the route (owner-gate, not just nav hiding).
 *
 * The owner logs in fresh (no stored session; the seed provisions an owner user
 * with E2E_PASSWORD). Restores the DEDICATED soft-deleted fixture only, which the
 * seed re-soft-deletes on the next run, so no shared fixture is perturbed.
 */
import { test, expect, type Page } from "@playwright/test";
import { USERS, E2E_PASSWORD, RECOVER_PATIENT, STORAGE } from "./fixtures";

async function loginAsOwner(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(USERS.owner);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /Iniciar sessão/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

test.describe("Pacientes eliminados - owner", () => {
  test("owner lists a soft-deleted patient with NIF and restores it", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/admin/pacientes-eliminados");
    await expect(
      page.getByRole("heading", { name: "Pacientes eliminados" }),
    ).toBeVisible();

    // The dedicated soft-deleted patient is listed with its NIF.
    const row = page.locator("li").filter({ hasText: RECOVER_PATIENT.name });
    await expect(row).toBeVisible();
    await expect(row).toContainText(RECOVER_PATIENT.nif);

    // Restore returns it to the active list -> it leaves the recovery view.
    await row.getByRole("button", { name: "Restaurar", exact: true }).click();
    await expect(page.locator("li").filter({ hasText: RECOVER_PATIENT.name })).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});

test.describe("Pacientes eliminados - owner-gate", () => {
  test.use({ storageState: STORAGE.admin });

  test("a non-owner (admin) is redirected away from the route", async ({ page }) => {
    await page.goto("/admin/pacientes-eliminados");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });
  });
});
