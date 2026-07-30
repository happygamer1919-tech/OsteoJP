/**
 * horarios.spec.ts — PL-09 Phase 5 reception schedule surface (/horarios).
 *
 * Reception (schedule:read, no settings:read) reaches the page, sees the
 * therapist cards, and can save a therapist's week through the reception action
 * (which redirects back to /horarios, not /admin/staff). A therapist has no
 * schedule:read and is redirected away.
 *
 * NOTE: the e2e reception is assigned to NO staff_locations, so the own-location
 * scope resolves to null (no-lockout) and every therapist is visible — the
 * location NARROWING itself is proven at the DB layer (schedule-scope unit test)
 * and would need a located reception seed to exercise here.
 */
import { test, expect } from "@playwright/test";
import { STORAGE } from "./fixtures";

test.describe("Horários — reception schedule surface", () => {
  test.use({ storageState: STORAGE.reception });

  test("reception reaches /horarios, sees a therapist card, and saves a week", async ({ page }) => {
    await page.goto("/horarios");
    await expect(page.getByRole("heading", { name: "Horários da equipa" })).toBeVisible();
    // A therapist card is rendered (E2E Therapist is a bookable, in-scope member).
    await expect(page.getByRole("heading", { name: "E2E Therapist" }).first()).toBeVisible();

    // The week editor's Guardar submits the reconcile through the schedule:manage
    // + own-location lib gates and redirects back to /horarios with a confirmation.
    const save = page.getByRole("button", { name: "Guardar" }).first();
    await expect(save).toBeVisible();
    await save.click();
    await expect(page).toHaveURL(/\/horarios/);
    await expect(page.getByText("Horário guardado.")).toBeVisible();
  });
});

test.describe("Horários — gate", () => {
  test.use({ storageState: STORAGE.therapist });

  test("a therapist (no schedule:read) is redirected from /horarios", async ({ page }) => {
    await page.goto("/horarios");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });
  });
});
