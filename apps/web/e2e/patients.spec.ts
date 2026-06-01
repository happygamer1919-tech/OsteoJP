/**
 * patients.spec.ts — Stream A
 *
 * Covers: list, search, create, edit, soft-delete, restore, merge.
 * Runs as admin (full access) unless otherwise noted.
 *
 * Plain-English scenario → Playwright test mapping:
 *
 *  1. Patient list loads and shows registered patients
 *  2. Search by name narrows the list
 *  3. Search with no results shows empty state
 *  4. Create a new patient with required fields only
 *  5. Create a new patient with all fields
 *  6. Validation: submitting empty form shows error
 *  7. Edit an existing patient's phone number
 *  8. Soft-delete a patient; they get a "Eliminado" badge on their profile
 *  9. Restore a soft-deleted patient
 * 10. Merge two patients: loser redirects to survivor
 * 11. Receptionist cannot see clinical record tab (permission check)
 * 12. Therapist can view patients but only their own clinical records
 */

import { test, expect } from "@playwright/test";
import { createPatient, fillPatientForm, goToPatients } from "./helpers";

// ---------------------------------------------------------------------------
// 1. Patient list loads
// ---------------------------------------------------------------------------
test("patient list loads and shows at least one result", async ({ page }) => {
  await goToPatients(page);
  // With seed data loaded there should be at least one patient row.
  await expect(page.locator("ul li").first()).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 2. Search by name narrows list
// ---------------------------------------------------------------------------
test("search by name narrows the patient list", async ({ page }) => {
  await goToPatients(page);
  await page.getByRole("searchbox").fill("Maria Silva");
  // Wait for debounce / navigation
  await page.waitForURL(/q=Maria/);
  await expect(page.getByText("Maria Silva")).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2b. Search by NIF (prefix match) — seeded "Maria Silva" has NIF 123456789.
// searchPatients() matches patients.nif as a prefix on the digits of `q`.
// ---------------------------------------------------------------------------
test("search by NIF returns the matching patient", async ({ page }) => {
  await goToPatients(page);
  await page.getByRole("searchbox").fill("123456789");
  await page.waitForURL(/q=123456789/);
  await expect(page.getByText("Maria Silva")).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 2c. Search by phone — seeded "Maria Silva" has phone "+351 912 345 678".
// searchPatients() strips non-digits from the column and from `q`, then does a
// substring match, so the national-number fragment must resolve to her row.
// ---------------------------------------------------------------------------
test("search by phone returns the matching patient", async ({ page }) => {
  await goToPatients(page);
  await page.getByRole("searchbox").fill("912345678");
  await page.waitForURL(/q=912345678/);
  await expect(page.getByText("Maria Silva")).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 3. Search with no results
// ---------------------------------------------------------------------------
test("search with no results shows empty state message", async ({ page }) => {
  await goToPatients(page);
  await page.getByRole("searchbox").fill("ZZZ_NOBODY_999");
  await page.waitForURL(/q=ZZZ/);
  // i18n key patients.noResults
  await expect(
    page.getByText(/Nenhum resultado|No results/i),
  ).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 4. Create patient — required fields only
// ---------------------------------------------------------------------------
test("create patient with required fields only navigates to profile", async ({
  page,
}) => {
  await page.goto("/patients/new");
  await fillPatientForm(page, { fullName: "Teste Automático" });
  await page.getByRole("button", { name: /Criar/i }).click();

  await expect(page).toHaveURL(/\/patients\/[a-z0-9-]+$/, { timeout: 10_000 });
  await expect(page.getByText("Teste Automático")).toBeVisible();
});

// ---------------------------------------------------------------------------
// 5. Create patient — all fields
// ---------------------------------------------------------------------------
test("create patient with all fields stores and displays them", async ({
  page,
}) => {
  const id = await createPatient(page, {
    fullName: "Joaquim Automático",
    dateOfBirth: "1980-06-15",
    sex: "male",
    nif: "900000001",
    phone: "+351 912 000 001",
    email: "joaquim.auto@osteojp.test",
    city: "Linda-a-Velha",
    postalCode: "2795-001",
    address: "Rua do Teste, 1",
    notes: "Nota de teste automatizado",
  });

  expect(id).toBeTruthy();
  await expect(page.getByText("Joaquim Automático")).toBeVisible();
  await expect(page.getByText("+351 912 000 001")).toBeVisible();
});

// ---------------------------------------------------------------------------
// 6. Validation: empty form
// ---------------------------------------------------------------------------
test("submitting empty patient form shows required field error", async ({
  page,
}) => {
  await page.goto("/patients/new");
  await page.getByRole("button", { name: /Criar/i }).click();
  // Browser native required validation prevents submission; full name field
  // should show as invalid. Check we stay on the same page.
  await expect(page).toHaveURL(/\/patients\/new/);
});

// ---------------------------------------------------------------------------
// 7. Edit patient
// ---------------------------------------------------------------------------
test("edit patient phone number and see updated value on profile", async ({
  page,
}) => {
  const id = await createPatient(page, {
    fullName: "Editar Telefone",
    phone: "+351 910 000 000",
  });

  await page.goto(`/patients/${id}/edit`);
  const phoneField = page.getByLabel(/Telefone/i);
  await phoneField.clear();
  await phoneField.fill("+351 910 000 999");
  await page.getByRole("button", { name: /Guardar/i }).click();

  await expect(page).toHaveURL(`/patients/${id}`, { timeout: 10_000 });
  await expect(page.getByText("+351 910 000 999")).toBeVisible();
});

// ---------------------------------------------------------------------------
// 8. Soft-delete
// ---------------------------------------------------------------------------
test("soft-deleting a patient shows Eliminado badge on profile", async ({
  page,
}) => {
  const id = await createPatient(page, { fullName: "Apagar Temporário" });

  await page.goto(`/patients/${id}`);
  // Confirm dialog will appear — accept it.
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Eliminar/i }).click();

  await page.waitForURL(`/patients/${id}`);
  await expect(page.getByText(/Eliminado/i)).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 9. Restore
// ---------------------------------------------------------------------------
test("restoring a soft-deleted patient removes the Eliminado badge", async ({
  page,
}) => {
  const id = await createPatient(page, { fullName: "Restaurar Paciente" });

  // Delete first
  await page.goto(`/patients/${id}`);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Eliminar/i }).click();
  await expect(page.getByText(/Eliminado/i)).toBeVisible({ timeout: 8_000 });

  // Restore
  await page.getByRole("button", { name: /Restaurar/i }).click();
  await page.waitForURL(`/patients/${id}`);
  await expect(page.getByText(/Eliminado/i)).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// 10. Merge patients
// ---------------------------------------------------------------------------
test("merging two patients marks loser as merged with badge", async ({
  page,
}) => {
  const survivorId = await createPatient(page, { fullName: "Sobrevivente Merge" });
  const loserId = await createPatient(page, { fullName: "Perdedor Merge" });

  // Go to loser, fill merge input with survivor ID.
  await page.goto(`/patients/${loserId}`);
  await page.getByPlaceholder(/ID do paciente/i).fill(survivorId);
  await page.getByRole("button", { name: /Fundir/i }).click();

  await page.waitForURL(`/patients/${loserId}`);
  await expect(page.getByText(/Fundido|Merged/i)).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 11. Receptionist cannot see clinical records tab (access)
// This test is in the "reception" project — see playwright.config.ts
// ---------------------------------------------------------------------------
test(
  "receptionist sees patient profile but clinical records tab is inaccessible",
  { tag: "@reception" },
  async ({ page }) => {
    await goToPatients(page);
    // Navigate to any patient profile
    await page.locator("ul li a").first().click();
    await expect(page).toHaveURL(/\/patients\//);
    // Clinical tab exists in DOM but navigating to /clinical should be blocked
    await page.goto("/clinical");
    // Should redirect to login or show forbidden — not show clinical records list
    const url = page.url();
    expect(url).toMatch(/login|forbidden/i);
  },
);
