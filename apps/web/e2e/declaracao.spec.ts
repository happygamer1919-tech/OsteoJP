/**
 * declaracao.spec.ts — W5-31 Declaração de Presença dialog (patient Documentos).
 *
 * Runs as THERAPIST. Proves: the "Imprimir Declaração de Presença" button opens a
 * dialog; selecting a marcação PREFILLS date + hora início + hora fim from that
 * appointment; the fields are EDITABLE; and the manual-entry path works.
 */
import { test, expect } from "@playwright/test";
import { PATIENTS, STORAGE } from "./fixtures";
import { fillTime, expectTime, expectTimeEmpty } from "./helpers";

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
    const dialog = page.getByRole("dialog");
    await expect(date).toBeVisible();

    // W12-31: 24h everywhere - the hora fields are select-based TimeFields, so
    // there is NO native time input and NO AM/PM text anywhere in the dialog,
    // and the hour select offers the 24h range (a "23" option exists).
    await expect(dialog.locator('input[type="time"]')).toHaveCount(0);
    await expect(dialog).not.toContainText(/\bAM\b|\bPM\b/);
    await expect(start.getByLabel("Horas").locator('option[value="23"]')).toHaveCount(1);

    // W12-24: the NIF field prefills from the patient (editable).
    const nif = page.getByTestId("declaracao-nif");
    await expect(nif).toHaveValue(PATIENTS.maria.nif);

    // Select the seeded marcação → date + hora início + hora fim prefill from it.
    await page.getByTestId("declaracao-marcacao").selectOption(SEEDED_APPT_ID);
    await expect(date).toHaveValue("2022-03-15");
    await expectTime(start, "09:30");
    await expectTime(end, "10:30");

    // The prefilled fields are editable (and a later end is not clobbered).
    await fillTime(start, "08:00");
    await expectTime(start, "08:00");
    await expectTime(end, "10:30");

    // W12-24: switching to "Introdução manual" CLEARS the marcação-derived fields
    // (previously they kept the stale prefill), so manual always starts blank.
    await page.getByTestId("declaracao-marcacao").selectOption("");
    await expect(date).toHaveValue("");
    await expectTimeEmpty(start);
    await expectTimeEmpty(end);
    // NIF is the patient's, not the marcação's - it survives the switch.
    await expect(nif).toHaveValue(PATIENTS.maria.nif);

    // Manual-entry path. W12-31: setting Início auto-defaults Fim to one hour
    // later (same day), so Fim can never sit before Início.
    await date.fill("2026-07-12");
    await fillTime(start, "14:00");
    await expectTime(end, "15:00"); // defaulted from start + 1h
    // ...and Fim stays freely editable to a later time.
    await fillTime(end, "15:30");
    await expect(date).toHaveValue("2026-07-12");
    await expectTime(start, "14:00");
    await expectTime(end, "15:30");
  });
});
