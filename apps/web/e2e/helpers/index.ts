/**
 * helpers/index.ts — shared utilities for OsteoJP E2E specs.
 *
 * Every selector here is grounded in the real app (PT-PT i18n strings and the
 * actual component markup), not guessed.
 */

import { type Page, type Locator, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export async function goToPatients(page: Page) {
  await page.goto("/patients");
  await expect(page).toHaveURL(/\/patients(\?|$)/);
}

export async function goToAgenda(page: Page) {
  await page.goto("/agenda");
  await expect(page).toHaveURL(/\/agenda(\?|$)/);
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export type PatientFields = {
  fullName: string;
  dateOfBirth?: string;
  sex?: "male" | "female" | "other";
  nif?: string;
  phone?: string;
  email?: string;
  city?: string;
  postalCode?: string;
  profession?: string;
};

/** Fills the patient form (caller is already on /patients/new or /edit). */
export async function fillPatientForm(page: Page, f: PatientFields) {
  // pressSequentially fires per-character key events that React's synthetic event
  // system picks up correctly in all browsers. fill() only fires a single 'input'
  // event which WebKit's automation layer does not propagate to React's onChange,
  // leaving controlled-input state empty and causing server-side validation errors.
  await page.getByLabel(/Nome completo/i).pressSequentially(f.fullName);
  if (f.dateOfBirth) await page.getByLabel(/Data de nascimento/i).fill(f.dateOfBirth);
  if (f.sex) await page.getByLabel(/Sexo/i).selectOption(f.sex); // <select>, not text
  if (f.nif) await page.getByLabel(/NIF/i).pressSequentially(f.nif);
  if (f.phone) await page.getByLabel(/Telem[oó]vel/i).pressSequentially(f.phone);
  if (f.email) await page.getByLabel(/^Email/i).pressSequentially(f.email);
  if (f.city) await page.getByLabel(/Localidade/i).pressSequentially(f.city);
  if (f.postalCode) await page.getByLabel(/Código postal/i).pressSequentially(f.postalCode);
  // Street address (Morada) is no longer surfaced in the form (W2-02 item 3).
  if (f.profession) await page.getByLabel(/Profissão/i).pressSequentially(f.profession);
}

/** Creates a patient and returns the new patient id (from the redirect URL). */
export async function createPatient(page: Page, f: PatientFields): Promise<string> {
  await page.goto("/patients/new");
  await fillPatientForm(page, f);
  await page.getByRole("button", { name: "Criar Paciente" }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  return page.url().split("/").at(-1)!;
}

/** Runs a patient search via the search box (fill + submit) and waits for nav. */
export async function searchPatients(page: Page, query: string) {
  await goToPatients(page);
  const box = page.getByPlaceholder(/Pesquisar por nome/i);
  // pressSequentially keeps WebKit's React synthetic event chain intact; fill()
  // alone does not update the controlled-input state in WebKit, so Enter submits
  // an empty query and the URL never gains the ?q= param.
  await box.pressSequentially(query);
  await box.press("Enter");
  await expect(page).toHaveURL(/\/patients\?q=/, { timeout: 8_000 });
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/** Opens the agenda in day view on a given date, then opens the New modal. */
export async function openNewAppointment(page: Page, date: string): Promise<Locator> {
  const url = `/agenda?view=day&date=${date}`;
  try {
    await page.goto(url);
  } catch (e) {
    // Firefox/WebKit: a client-side agenda refresh triggered by a preceding form
    // save can race with page.goto. Firefox throws NS_BINDING_ABORTED; WebKit
    // throws "interrupted by another navigation". Retry once — cleanly supersedes.
    if (/interrupted by another navigation|NS_BINDING_ABORTED/i.test(String(e))) {
      await page.goto(url);
    } else {
      throw e;
    }
  }
  await page.getByRole("button", { name: /Nova Marcação/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 8_000 });
  return dialog;
}

/** Fills the appointment modal's required fields. Caller clicks Save. */
export async function fillAppointment(
  dialog: Locator,
  opts: { patient: string; therapist: string; location: string; date: string; time: string },
) {
  // Patient is now a search Combobox (W2-04): type the name, pick the option.
  const patient = dialog.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(opts.patient);
  await dialog.getByRole("option", { name: opts.patient }).click();
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: opts.therapist });
  await dialog.getByLabel(/Localização/i).selectOption({ label: opts.location });
  await dialog.locator('input[type="date"]').fill(opts.date);
  await dialog.locator('input[type="time"]').fill(opts.time);
}
