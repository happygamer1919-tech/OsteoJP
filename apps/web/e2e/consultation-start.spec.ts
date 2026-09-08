/**
 * consultation-start.spec.ts — start-consultation screen for the AI recording
 * chain (W4-06). Runs as THERAPIST (clinical_records:author). Two paths converge
 * on a valid patient, and a consent checkbox gates "Iniciar gravação".
 */
import { test, expect } from "@playwright/test";
import { LOCATION, PATIENTS, STORAGE } from "./fixtures";

test.describe("start-consultation (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("existing patient → consent gates Record → ready (W4-06)", async ({ page }) => {
    await page.goto("/consultation");
    await expect(page.getByRole("heading", { name: "Iniciar consulta" })).toBeVisible();

    // Pick an existing patient via the search combobox.
    const patient = page.getByRole("combobox", { name: /Paciente/i });
    await patient.click();
    await patient.fill(PATIENTS.maria.name);
    await page.getByRole("option", { name: PATIENTS.maria.name }).click();

    // Consent gate: Record is disabled until consent is checked.
    const start = page.getByRole("button", { name: "Iniciar gravação" });
    await expect(start).toBeDisabled();
    await page.getByRole("checkbox", { name: /Autorizo a gravação/i }).check();
    await expect(start).toBeEnabled();

    await start.click();
    // Consent captured -> the recording UI (W4-07) mounts; Chromium supports
    // webm/opus so the Record control is available.
    await expect(page.getByRole("button", { name: "Gravar" })).toBeVisible();
  });

  test("new stub → name required → CLINIC required → create → consent → ready (W4-06, PL-34)", async ({ page }) => {
    await page.goto("/consultation");
    await page.getByRole("button", { name: "Novo paciente" }).click();

    // Name required: "Criar e iniciar gravação" is disabled until a name is typed.
    const create = page.getByRole("button", { name: "Criar e iniciar gravação" });
    await expect(create).toBeDisabled();
    await page.getByLabel("Nome").fill("Paciente Sintético E2E");

    // ======================================================================
    // PL-34 — A NAME IS NO LONGER ENOUGH, AND THIS ASSERTION IS THE WHOLE
    // REASON THE E2E CAUGHT WHAT THE LOCAL GATES COULD NOT.
    // ======================================================================
    // A walk-in filed at NO clinic lands with primary_location_id NULL, and
    // with no appointment either it satisfies neither arm of PL-09's patient
    // scope: invisible to every located reception and admin, while the
    // therapist who created it still sees it through the created_by arm.
    //
    // THE E2E THERAPIST IS THE PICKER CASE BY CONSTRUCTION. The seed assigns no
    // staff_locations to any test role (Q-PL-11-2), so bookingLocationScope
    // returns null - unrestricted - and resolveLocationControl offers every
    // active clinic. So this therapist MUST answer, and the button stays
    // disabled until they do. A single-clinic therapist sees a static line and
    // never reaches this control at all; that arm is covered against a real
    // database in lib/patients/create-location-link.db.test.ts, where the
    // assertion is a row rather than a button.
    await expect(
      create,
      "a name alone must not create a patient at no clinic (PL-34)",
    ).toBeDisabled();
    await page.getByLabel("Localização").selectOption({ label: LOCATION.name });
    await expect(create).toBeEnabled();
    await create.click();

    // Stub created → consent → start → ready.
    await expect(page.getByText(/Paciente criado/)).toBeVisible();
    const start = page.getByRole("button", { name: "Iniciar gravação" });
    await expect(start).toBeDisabled();
    await page.getByRole("checkbox", { name: /Autorizo a gravação/i }).check();
    await start.click();
    // Consent captured -> the recording UI (W4-07) mounts; Chromium supports
    // webm/opus so the Record control is available.
    await expect(page.getByRole("button", { name: "Gravar" })).toBeVisible();
  });
});
