/**
 * declaracao.spec.ts — W5-31 Declaração de Presença dialog (patient Documentos).
 *
 * Runs as THERAPIST. Proves: the "Imprimir Declaração de Presença" button opens a
 * dialog; selecting a marcação PREFILLS date + hora início + hora fim from that
 * appointment; the fields are EDITABLE; and the manual-entry path works.
 */
import { test, expect } from "@playwright/test";
import { PATIENTS, STORAGE } from "./fixtures";

// The far-past marcação seeded for Maria (seed-e2e.mjs ensureDeclaracaoAppointment):
// 2022-03-15 09:30–10:30 (UTC == Lisbon, pre-DST) at Linda-a-Velha.
const SEEDED_APPT_ID = "00000000-0000-0000-0000-0000000ad001";

test.describe("Declaração de Presença (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("W5-31: marcação prefills date/hora início/hora fim, fields editable, manual path works", async ({
    page,
  }) => {
    await page.goto(`/patients/${PATIENTS.maria.id}?tab=documentos`);

    await page.getByRole("button", { name: "Imprimir Declaração de Presença" }).click();

    const date = page.getByTestId("declaracao-date");
    const start = page.getByTestId("declaracao-start");
    const end = page.getByTestId("declaracao-end");
    await expect(date).toBeVisible();

    // W12-24: the NIF field prefills from the patient (editable).
    const nif = page.getByTestId("declaracao-nif");
    await expect(nif).toHaveValue(PATIENTS.maria.nif);

    // Select the seeded marcação → date + hora início + hora fim prefill from it.
    await page.getByTestId("declaracao-marcacao").selectOption(SEEDED_APPT_ID);
    await expect(date).toHaveValue("2022-03-15");
    await expect(start).toHaveValue("09:30");
    await expect(end).toHaveValue("10:30");

    // The prefilled fields are editable.
    await start.fill("08:00");
    await expect(start).toHaveValue("08:00");

    // W12-24: switching to "Introdução manual" CLEARS the marcação-derived fields
    // (previously they kept the stale prefill), so manual always starts blank.
    await page.getByTestId("declaracao-marcacao").selectOption("");
    await expect(date).toHaveValue("");
    await expect(start).toHaveValue("");
    await expect(end).toHaveValue("");
    // NIF is the patient's, not the marcação's - it survives the switch.
    await expect(nif).toHaveValue(PATIENTS.maria.nif);

    // Manual-entry path: type the fields.
    await date.fill("2026-07-12");
    await start.fill("14:00");
    await end.fill("15:00");
    await expect(date).toHaveValue("2026-07-12");
    await expect(start).toHaveValue("14:00");
    await expect(end).toHaveValue("15:00");
  });
});
