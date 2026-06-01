/**
 * helpers/index.ts
 *
 * Shared utilities for OsteoJP E2E tests.
 */

import { type Page, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

export async function goToPatients(page: Page) {
  await page.goto("/patients");
  await expect(page).toHaveURL(/\/patients/);
}

export async function goToAgenda(page: Page) {
  await page.goto("/agenda");
  await expect(page).toHaveURL(/\/agenda/);
}

export async function goToClinical(page: Page) {
  await page.goto("/clinical");
  await expect(page).toHaveURL(/\/clinical/);
}

export async function goToAdmin(page: Page) {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
}

// ---------------------------------------------------------------------------
// Patient helpers
// ---------------------------------------------------------------------------

export type PatientFields = {
  fullName: string;
  dateOfBirth?: string;
  sex?: string;
  nif?: string;
  phone?: string;
  email?: string;
  city?: string;
  postalCode?: string;
  address?: string;
  notes?: string;
};

/** Fills and submits the patient form. Caller navigates to /patients/new first. */
export async function fillPatientForm(page: Page, fields: PatientFields) {
  // Full name is required.
  await page.getByLabel(/Nome completo/i).fill(fields.fullName);

  if (fields.dateOfBirth) {
    await page.getByLabel(/Data de nascimento/i).fill(fields.dateOfBirth);
  }
  if (fields.sex) {
    await page.getByLabel(/Sexo/i).fill(fields.sex);
  }
  if (fields.nif) {
    await page.getByLabel(/NIF/i).fill(fields.nif);
  }
  if (fields.phone) {
    await page.getByLabel(/Telefone/i).fill(fields.phone);
  }
  if (fields.email) {
    await page.getByLabel(/Email/i).fill(fields.email);
  }
  if (fields.city) {
    await page.getByLabel(/Cidade/i).fill(fields.city);
  }
  if (fields.postalCode) {
    await page.getByLabel(/Código postal/i).fill(fields.postalCode);
  }
  if (fields.address) {
    await page.getByLabel(/Morada/i).fill(fields.address);
  }
  if (fields.notes) {
    await page.getByLabel(/Notas/i).fill(fields.notes);
  }
}

/** Creates a patient and returns the resulting patient ID from the URL. */
export async function createPatient(
  page: Page,
  fields: PatientFields,
): Promise<string> {
  await page.goto("/patients/new");
  await fillPatientForm(page, fields);
  await page.getByRole("button", { name: /Criar|Guardar/i }).click();

  // Redirected to /patients/<id>
  await expect(page).toHaveURL(/\/patients\/[a-z0-9-]+$/);
  const url = page.url();
  return url.split("/").at(-1)!;
}

// ---------------------------------------------------------------------------
// Appointment helpers
// ---------------------------------------------------------------------------

/** Opens the appointment modal via the agenda's "New" button. */
export async function openNewAppointmentModal(page: Page) {
  await goToAgenda(page);
  await page.getByRole("button", { name: /Nova|New/i }).first().click();
  await expect(
    page.getByRole("dialog", { name: /Consulta|Appointment/i }),
  ).toBeVisible();
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/** Asserts that a toast / success message contains the given text. */
export async function expectSuccess(page: Page, text: string | RegExp) {
  await expect(page.getByText(text)).toBeVisible({ timeout: 8_000 });
}

/** Asserts that an error message is shown. */
export async function expectError(page: Page, text: string | RegExp) {
  await expect(page.getByText(text)).toBeVisible({ timeout: 8_000 });
}
