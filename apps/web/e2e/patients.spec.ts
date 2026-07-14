/**
 * patients.spec.ts — Patients (Stream A). Runs as admin (has patients:delete).
 *
 * Happy paths: list, search (name/NIF/phone), create, edit, soft-delete,
 * restore, merge.
 * Guardrails: a pre-soft-deleted patient is absent from active views;
 * a cross-tenant patient id is denied (404).
 *
 * Scenario 4.1 (test-scenarios-staff.md): the result row also shows the
 * patient NIF (below the name) and phone (in the phone column).
 */
import { test, expect, type Page } from "@playwright/test";
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
  await expect(page.getByText("Sem resultados para esta pesquisa")).toBeVisible();
});

test("search result row shows the patient NIF below the name (scenario 4.1)", async ({ page }) => {
  // Scope to <table> (desktop view) to avoid matching the hidden mobile <ul>
  // sibling, which also renders the NIF but is display:none at desktop viewport.
  await searchPatients(page, PATIENTS.maria.name);
  await expect(page.getByRole("link", { name: new RegExp(PATIENTS.maria.name) })).toBeVisible();
  await expect(page.locator("table").getByText(`NIF ${PATIENTS.maria.nif}`)).toBeVisible();
});

test("search result row shows the patient phone in the phone column (scenario 4.1)", async ({ page }) => {
  // Scope to <table> for the same reason — mobile <ul> also renders the phone
  // but is hidden at desktop viewport width.
  await searchPatients(page, PATIENTS.maria.name);
  await expect(page.getByRole("link", { name: new RegExp(PATIENTS.maria.name) })).toBeVisible();
  await expect(page.locator("table").getByText(PATIENTS.maria.phoneDisplay)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------
test("create patient with required fields only", async ({ page }) => {
  const name = `Novo Mínimo ${uniq()}`;
  await page.goto("/patients/new");
  await fillPatientForm(page, { fullName: name });
  await page.getByRole("button", { name: "Criar Paciente" }).click();

  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name })).toBeVisible();
});

test("create patient with all fields persists and displays them", async ({ page }) => {
  const name = `Completo ${uniq()}`;
  const phone = "+351 912 000 111";
  const profession = "Fisioterapeuta E2E";
  await createPatient(page, {
    fullName: name,
    dateOfBirth: "1980-06-15",
    sex: "male",
    nif: "900000001",
    phone,
    email: `c.${uniq()}@osteojp.test`,
    city: "Linda-a-Velha",
    postalCode: "2795-001",
    profession,
  });
  await expect(page.getByRole("heading", { name })).toBeVisible();
  // Contactos folded into Dados pessoais (W2-02 item 4): phone shows on the profile.
  await expect(page.getByText(phone).first()).toBeVisible();
  // Profession is surfaced (W2-02 item 5).
  await expect(page.getByText(profession).first()).toBeVisible();
  // Street address is not surfaced anywhere on the profile (W2-02 item 3).
  await expect(page.getByText(/Morada/i)).toHaveCount(0);
});

test("create with each 'Como nos conheceu?' option shows it on the profile (W5-11)", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // The three fixed options: the chosen label persists and shows on the profile.
  for (const option of ["Redes sociais", "Website", "Recomendação de um amigo"]) {
    const name = `Referral ${uniq()}`;
    await createPatient(page, { fullName: name, referral: option });
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText(option).first()).toBeVisible();
  }

  // Outro: the free-text is what persists (not the "Outro" label).
  const outroName = `Referral Outro ${uniq()}`;
  const freeText = `Feira de saúde ${uniq()}`;
  await createPatient(page, {
    fullName: outroName,
    referral: "Outro",
    referralOther: freeText,
  });
  await expect(page.getByRole("heading", { name: outroName })).toBeVisible();
  await expect(page.getByText(freeText).first()).toBeVisible();
  // The bare "Outro" label is never stored as the value — the free-text replaces
  // it. The profile shows the "Como nos conheceu?" row (label) with the free-text
  // as its value, so we assert the sentinel label "Outro" is absent, not the row.
  await expect(page.getByText("Outro", { exact: true })).toHaveCount(0);
});

test("Notas tab appends an append-only note; the edit form no longer has a notes field (W2-11)", async ({
  page,
}) => {
  const id = await createPatient(page, { fullName: `Notas ${uniq()}` });

  // The patient edit form no longer reads/writes patients.notes (flipped to the tab).
  await page.goto(`/patients/${id}/edit`);
  await expect(page.getByLabel(/^Notas/i)).toHaveCount(0);

  // The Notas tab composer appends a revision that shows immediately.
  await page.goto(`/patients/${id}?tab=notas`);
  const note = `Nota de teste ${uniq()}`;
  await page.getByPlaceholder(/Escreva uma nota/i).fill(note);
  await page.getByRole("button", { name: "Adicionar nota" }).click();
  await expect(page.getByText(note)).toBeVisible({ timeout: 8_000 });
});

test("Notas Rápidas appends a note to the SELECTED patient (W2-11)", async ({ page }) => {
  const name = `Rápida ${uniq()}`;
  const id = await createPatient(page, { fullName: name });
  await page.goto("/dashboard");

  // Pick THAT patient in the Notas Rápidas card, type a note, save.
  const combo = page.getByRole("combobox", { name: /Paciente/i });
  await combo.click();
  await combo.fill(name);
  await page.getByRole("option", { name }).click();
  const note = `Quick ${uniq()}`;
  await page.getByLabel(/Notas rápidas/i).fill(note);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(/Notas guardadas/i)).toBeVisible({ timeout: 8_000 });

  // It lands on THAT patient's Notas tab.
  await page.goto(`/patients/${id}?tab=notas`);
  await expect(page.getByText(note)).toBeVisible({ timeout: 8_000 });
});

test("edit patient phone and see the updated value on the profile", async ({ page }) => {
  const id = await createPatient(page, { fullName: `Editar ${uniq()}`, phone: "+351 910 000 000" });
  await page.goto(`/patients/${id}/edit`);
  const phone = page.getByLabel(/Telem[oó]vel/i);
  // Triple-click selects all, then pressSequentially replaces — needed in WebKit
  // where fill() does not trigger React's controlled-input onChange.
  await phone.click({ clickCount: 3 });
  await phone.pressSequentially("+351 910 000 999");
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page).toHaveURL(new RegExp(`/patients/${id}$`), { timeout: 12_000 });
  await expect(page.getByText("+351 910 000 999").first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Soft-delete / restore / merge
// ---------------------------------------------------------------------------

/**
 * W7-03: the destructive controls now live inside a COLLAPSED "Ações destrutivas"
 * disclosure (progressive disclosure - they used to sit permanently open at the
 * bottom of every tab). They are unchanged and still server-gated; they just have
 * to be revealed first. Idempotent: opening an already-open disclosure is a no-op.
 */
async function openDangerZone(page: Page) {
  const summary = page.getByText("Ações destrutivas", { exact: true });
  await expect(summary).toBeVisible({ timeout: 8_000 });
  const details = page.locator("details").filter({ has: summary });
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await summary.click();
  }
  await expect(details).toHaveJSProperty("open", true);
}

test("soft-deleting a patient shows the Eliminado badge", async ({ page }) => {
  const id = await createPatient(page, { fullName: `Apagar ${uniq()}` });
  await page.goto(`/patients/${id}`);
  await openDangerZone(page);
  page.once("dialog", (d) => d.accept()); // window.confirm
  // exact: true so this soft-delete "Eliminar" does not also match the
  // hard-delete "Eliminar definitivamente" button (W5-08).
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.getByText("Eliminado")).toBeVisible({ timeout: 8_000 });
});

test("restoring a soft-deleted patient clears the Eliminado badge", async ({ page }) => {
  const id = await createPatient(page, { fullName: `Restaurar ${uniq()}` });
  await page.goto(`/patients/${id}`);
  await openDangerZone(page);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.getByText("Eliminado")).toBeVisible({ timeout: 8_000 });

  await openDangerZone(page);
  await page.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText("Eliminado")).toBeHidden({ timeout: 8_000 });
});

test("merging two patients marks the loser as Fundido", async ({ page }) => {
  // Two createPatient calls each take up to 15 s in CI (URL redirect assertion).
  // Extend the per-test budget so cumulative wall-time under CI load doesn't
  // exhaust the 30 s default before the merge click can fire.
  test.setTimeout(90_000);

  const survivorId = await createPatient(page, { fullName: `Sobrevivente ${uniq()}` });
  const loserId = await createPatient(page, { fullName: `Perdedor ${uniq()}` });

  await page.goto(`/patients/${loserId}`);
  await openDangerZone(page);

  // Wait for React hydration before filling: the PatientActions component
  // renders client-side and the input appears after JS hydration completes.
  const mergeInput = page.getByPlaceholder(/ID do paciente/i);
  await expect(mergeInput).toBeVisible({ timeout: 8_000 });

  // pressSequentially fires per-character key events that propagate through
  // React's controlled-input onChange in all browsers. fill() dispatches a
  // single synthetic input event that WebKit's automation layer does not
  // forward to React's delegation root, leaving the state empty — which keeps
  // the "Fundir neste paciente" button disabled and causes click() to time out
  // waiting for actionability. Same root cause as F2.
  await mergeInput.pressSequentially(survivorId);

  await page.getByRole("button", { name: "Fundir neste paciente" }).click();
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
  await expect(page.getByText("Sem resultados para esta pesquisa")).toBeVisible();

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
