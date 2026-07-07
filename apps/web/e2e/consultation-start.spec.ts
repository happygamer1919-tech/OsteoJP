/**
 * consultation-start.spec.ts — start-consultation screen for the AI recording
 * chain (W4-06). Runs as THERAPIST (clinical_records:author). Two paths converge
 * on a valid patient, and a consent checkbox gates "Iniciar gravação".
 */
import { test, expect } from "@playwright/test";
import { PATIENTS, STORAGE } from "./fixtures";

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
    await page.getByRole("checkbox", { name: /consente a gravação/i }).check();
    await expect(start).toBeEnabled();

    await start.click();
    await expect(page.getByText("Consentimento registado. Pronto para gravar.")).toBeVisible();
  });

  test("new stub → name required → create → consent → ready (W4-06)", async ({ page }) => {
    await page.goto("/consultation");
    await page.getByRole("button", { name: "Novo paciente" }).click();

    // Name required: "Criar e iniciar gravação" is disabled until a name is typed.
    const create = page.getByRole("button", { name: "Criar e iniciar gravação" });
    await expect(create).toBeDisabled();
    await page.getByLabel("Nome").fill("Paciente Sintético E2E");
    await expect(create).toBeEnabled();
    await create.click();

    // Stub created → consent → start → ready.
    await expect(page.getByText(/Paciente criado/)).toBeVisible();
    const start = page.getByRole("button", { name: "Iniciar gravação" });
    await expect(start).toBeDisabled();
    await page.getByRole("checkbox", { name: /consente a gravação/i }).check();
    await start.click();
    await expect(page.getByText("Consentimento registado. Pronto para gravar.")).toBeVisible();
  });
});
