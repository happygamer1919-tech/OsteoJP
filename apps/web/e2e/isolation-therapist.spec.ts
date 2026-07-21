/**
 * isolation-therapist.spec.ts — W10-04 per-person isolation (SPEC-isolation.md,
 * owner-approved matrix 2026-07-21). MANDATORY negative-isolation coverage.
 *
 * Proves the therapist role is scoped to their own patients + own calendar, and
 * that owner/admin keep cross-visibility (positive control). All on local
 * synthetic data (cloud is real-data-only after W10-02).
 *
 * Seed ground truth (seed-e2e.mjs):
 *  - Maria/João/Ana are created_by the E2E therapist  -> therapist SEES them.
 *  - PATIENT_OTHER_THERAPIST (a304) is created_by therapist2, no appointment with
 *    the E2E therapist -> therapist must NOT see it; admin MUST.
 */
import { test, expect } from "@playwright/test";
import { goToPatients, searchPatients } from "./helpers";
import { PATIENTS, PATIENT_OTHER_THERAPIST, STORAGE } from "./fixtures";

test.describe("therapist isolation — own patients only (negative)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("therapist SEES their own patient (created_by them)", async ({ page }) => {
    await goToPatients(page);
    await expect(
      page.getByRole("link", { name: new RegExp(PATIENTS.maria.name) }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("therapist does NOT see another therapist's patient in the list", async ({ page }) => {
    await goToPatients(page);
    await expect(page.getByRole("heading", { name: "Pacientes" })).toBeVisible();
    await expect(page.getByText(PATIENT_OTHER_THERAPIST.name)).toHaveCount(0);
  });

  test("therapist search cannot surface another therapist's patient", async ({ page }) => {
    await searchPatients(page, PATIENT_OTHER_THERAPIST.name);
    await expect(page.getByText(PATIENT_OTHER_THERAPIST.name)).toHaveCount(0);
    await expect(page.getByText("Sem resultados para esta pesquisa")).toBeVisible();
  });

  test("therapist cannot open another therapist's patient by direct URL (not found)", async ({
    page,
  }) => {
    const resp = await page.goto(`/patients/${PATIENT_OTHER_THERAPIST.id}`);
    expect(resp?.status()).toBe(404);
    await expect(page.getByText(PATIENT_OTHER_THERAPIST.name)).toHaveCount(0);
  });

  test("therapist sees NEITHER the therapist selector NOR the location selector on the agenda", async ({
    page,
  }) => {
    await page.goto("/agenda?view=day");
    await expect(page).toHaveURL(/\/agenda/);
    // Both switchers are gated for the therapist role (W10-04): the therapist
    // selector was already gated (lockTherapist), the location selector is the
    // new gate. Neither combobox renders.
    await expect(page.getByRole("combobox", { name: "Terapeutas" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Localização" })).toHaveCount(0);
  });
});

test.describe("admin cross-visibility — positive control", () => {
  test.use({ storageState: STORAGE.admin });

  test("admin DOES see the other-therapist patient (tenant-wide)", async ({ page }) => {
    await searchPatients(page, PATIENT_OTHER_THERAPIST.name);
    await expect(
      page.getByRole("link", { name: new RegExp(PATIENT_OTHER_THERAPIST.name) }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("admin keeps BOTH agenda selectors (therapist + location)", async ({ page }) => {
    await page.goto("/agenda?view=day");
    await expect(page).toHaveURL(/\/agenda/);
    await expect(page.getByRole("combobox", { name: "Terapeutas" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Localização" })).toBeVisible();
  });
});
