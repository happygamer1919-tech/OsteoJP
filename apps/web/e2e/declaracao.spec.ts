/**
 * declaracao.spec.ts — W5-31 Declaração de Presença dialog (patient Documentos).
 *
 * Runs as THERAPIST. Proves: the "Imprimir Declaração de Presença" button opens a
 * dialog; selecting a marcação PREFILLS date + hora início + hora fim from that
 * appointment; the fields are EDITABLE; and the manual-entry path works.
 */
import { test, expect } from "@playwright/test";
import { PATIENTS, STORAGE } from "./fixtures";
import { expectTime, expectTimeEmpty, fillDate, fillTime } from "./helpers";

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

    // PL-20 (owner CR 2026-07-31): a NIF the patient record ALREADY holds is
    // SHOWN, not asked. This supersedes the W12-24 contract, where the same
    // value arrived prefilled into an editable box - which is what read as
    // "the declaracao asks for the NIF again".
    const nifKnown = page.getByTestId("declaracao-nif-known");
    await expect(nifKnown).toHaveText(PATIENTS.maria.nif);
    await expect(page.getByTestId("declaracao-nif")).toHaveCount(0);
    // Maria HAS a NIF, so the "already on file" hint must not appear either.
    await expect(page.getByTestId("declaracao-nif-savehint")).toHaveCount(0);

    // Select the seeded marcação → date + hora início + hora fim prefill from it.
    await page.getByTestId("declaracao-marcacao").selectOption(SEEDED_APPT_ID);
    // SCHED-07: the field is the shared picker now, which SHOWS dd/mm/aaaa. The
    // value it posts is still the ISO date - what changed is the rendering, and
    // asserting the rendering is asserting what the clinician actually reads.
    await expect(date).toHaveValue("15/03/2022");
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
    await expect(nifKnown).toHaveText(PATIENTS.maria.nif);

    // Manual-entry path. W12-31: setting Início auto-defaults Fim to one hour
    // later (same day), so Fim can never sit before Início.
    await fillDate(date, "2026-07-12");
    await fillTime(start, "14:00");
    await expectTime(end, "15:00"); // defaulted from start + 1h
    // ...and Fim stays freely editable to a later time.
    await fillTime(end, "15:30");
    await expect(date).toHaveValue("12/07/2026");
    await expectTime(start, "14:00");
    await expectTime(end, "15:30");
  });

  test("PL-20: a known NIF is shown, and Editar reveals a one-off override", async ({ page }) => {
    await page.goto(`/patients/${PATIENTS.maria.id}?tab=documentos`);
    await page.getByRole("button", { name: "Imprimir Declaração de Presença" }).click();

    // Shown, not asked.
    await expect(page.getByTestId("declaracao-nif-known")).toHaveText(PATIENTS.maria.nif);
    await expect(page.getByTestId("declaracao-nif")).toHaveCount(0);

    // "Editar" turns it into an input, seeded with the stored value, for a
    // value that applies to THIS document only. Because the record already
    // holds a NIF, nothing typed here is written back to the patient
    // (shouldPersistCapturedValue fills an EMPTY field only).
    await page.getByTestId("declaracao-nif-override").click();
    const nifInput = page.getByTestId("declaracao-nif");
    await expect(nifInput).toHaveValue(PATIENTS.maria.nif);
    await nifInput.fill("987654321");
    await expect(nifInput).toHaveValue("987654321");
    // Still no "will be saved" hint: this patient's NIF is already on file.
    await expect(page.getByTestId("declaracao-nif-savehint")).toHaveCount(0);
  });

  test("PL-03a: the dialog has an editable, length-capped observações field", async ({ page }) => {
    await page.goto(`/patients/${PATIENTS.maria.id}?tab=documentos`);
    await page.getByRole("button", { name: "Imprimir Declaração de Presença" }).click();

    const obs = page.getByTestId("declaracao-observacoes");
    await expect(obs).toBeVisible();
    await expect(obs).toHaveValue("");
    await obs.fill("Sessão de reavaliação: evolução positiva, sem contraindicações.");
    await expect(obs).toHaveValue("Sessão de reavaliação: evolução positiva, sem contraindicações.");
    // Length-capped so a long note cannot push the signature/footer off the page.
    await expect(obs).toHaveAttribute("maxlength", "500");
  });
});
