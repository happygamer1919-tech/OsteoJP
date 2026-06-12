/**
 * patients.spec.ts — Patients (Stream A). Runs as admin (has patients:delete).
 *
 * Happy paths: list, search (name/NIF/phone), create, edit, soft-delete,
 * restore, merge.
 * Guardrails: a pre-soft-deleted patient is absent from active views;
 * a cross-tenant patient id is denied (404).
 */
import { test, expect } from "@playwright/test";
import { createPatient, fillPatientForm, goToPatients, searchPatients } from "./helpers";
import { PATIENTS, PATIENT_OTHER_TENANT } from "./fixtures";

// Unique suffix so parallel tests / re-runs never collide on created rows.
const uniq = () => Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------------------
// List + search (seeded data)
// ---------------------------------------------------------------------------
test("patient list loads and shows a seeded patient", async ({ page }) => {
  await goToPatients(page);
  await expect(page.getByRole("heading", { name: "Pacientes" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(PATIENTS.maria.name) })).toBeVisible({
    timeout: 8_000,
  });
});

test("search by name narrows to the matching patient", async ({ page }) => {
  await searchPatients(page, PATIENTS.maria.name);
  await expect(page.getByRole("link", { name: new RegExp(PATIENTS.maria.name) })).toBeVisible();
});

test("search by NIF returns the matching patient", async ({ page }) => {
  await searchPatients(page, PATIENTS.maria.nif);
  await expect(page.getByRole("link", { name: new RegExp(PATIENTS.maria.name) })).toBeVisible();
});

test("search by phone returns the matching patient", async ({ page }) => {
  await searchPatients(page, PATIENTS.maria.phone);
  await expect(page.getByRole("link", { name: new RegExp(PATIENTS.maria.name) })).toBeVisible();
});

test("search with no results shows the empty-state message", async ({ page }) => {
  // Digit-free: a query with digits would also match patients by NIF/phone.
  await searchPatients(page, "ZZZNENHUMUTENTEZZZ");
  await expect(page.getByText("Sem resultados para a pesquisa.")).toBeVisible();
});

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------
test("create patient with required fields only", async ({ page }) => {
  const name = `Novo Mínimo ${uniq()}`;
  await page.goto("/patients/new");
  await fillPatientForm(page, { fullName: name });
  await page.getByRole("button", { name: "Criar Utente" }).click();

  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name })).toBeVisible();
});

test("create patient with all fields persists and displays them", async ({ page }) => {
  const name = `Completo ${uniq()}`;
  const phone = "+351 912 000 111";
  await createPatient(page, {
    fullName: name,
    dateOfBirth: "1980-06-15",
    sex: "male",
    nif: "900000001",
    phone,
    email: `c.${uniq()}@osteojp.test`,
    city: "Linda-a-Velha",
    postalCode: "2795-001",
    address: "Rua do Teste, 1",
    notes: "Nota E2E",
  });
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(phone).first()).toBeVisible();
});

test("edit patient phone and see the updated value on the profile", async ({ page }) => {
  const id = await createPatient(page, { fullName: `Editar ${uniq()}`, phone: "+351 910 000 000" });
  await page.goto(`/patients/${id}/edit`);
  const phone = page.getByLabel(/Telefone/i);
  await phone.clear();
  await phone.fill("+351 910 000 999");
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page).toHaveURL(new RegExp(`/patients/${id}$`), { timeout: 12_000 });
  await expect(page.getByText("+351 910 000 999").first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Soft-delete / restore / merge
// ---------------------------------------------------------------------------
test("soft-deleting a patient shows the Eliminado badge", async ({ page }) => {
  const id = await createPatient(page, { fullName: `Apagar ${uniq()}` });
  await page.goto(`/patients/${id}`);
  page.once("dialog", (d) => d.accept()); // window.confirm
  await page.getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByText("Eliminado")).toBeVisible({ timeout: 8_000 });
});

test("restoring a soft-deleted patient clears the Eliminado badge", async ({ page }) => {
  const id = await createPatient(page, { fullName: `Restaurar ${uniq()}` });
  await page.goto(`/patients/${id}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByText("Eliminado")).toBeVisible({ timeout: 8_000 });

  await page.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText("Eliminado")).toBeHidden({ timeout: 8_000 });
});

test("merging two patients marks the loser as Fundido", async ({ page }) => {
  const survivorId = await createPatient(page, { fullName: `Sobrevivente ${uniq()}` });
  const loserId = await createPatient(page, { fullName: `Perdedor ${uniq()}` });

  await page.goto(`/patients/${loserId}`);
  await page.getByPlaceholder(/ID do utente/i).fill(survivorId);
  await page.getByRole("button", { name: "Fundir neste utente" }).click();

  await expect(page.getByText("Fundido")).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// GUARDRAIL — soft-deleted patient absent from active views
// ---------------------------------------------------------------------------
test("a soft-deleted patient is absent from the active list and search", async ({ page }) => {
  // Control: an active patient IS searchable.
  await searchPatients(page, PATIENTS.maria.name);
  await expect(page.getByRole("link", { name: new RegExp(PATIENTS.maria.name) })).toBeVisible();

  // The seeded soft-deleted patient must not surface in search…
  await searchPatients(page, PATIENTS.archived.name);
  await expect(page.getByText("Sem resultados para a pesquisa.")).toBeVisible();

  // …nor in the unfiltered active list.
  await goToPatients(page);
  await expect(page.getByText(PATIENTS.archived.name)).toHaveCount(0);

  // …but is still reachable directly, flagged Eliminado (audit/history intact).
  await page.goto(`/patients/${PATIENTS.archived.id}`);
  await expect(page.getByRole("heading", { name: PATIENTS.archived.name })).toBeVisible();
  await expect(page.getByText("Eliminado")).toBeVisible();
});

// ---------------------------------------------------------------------------
// GUARDRAIL — cross-tenant patient is denied (RLS → 404)
// ---------------------------------------------------------------------------
test("a patient from another tenant is not accessible (404)", async ({ page }) => {
  const resp = await page.goto(`/patients/${PATIENT_OTHER_TENANT.id}`);
  expect(resp?.status()).toBe(404);
  await expect(page.getByText(PATIENT_OTHER_TENANT.name)).toHaveCount(0);
});
