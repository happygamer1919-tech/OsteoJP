/**
 * nif-required.spec.ts — PL-31. A ficha cannot be created without a NIF.
 *
 * Owner CR 2026-08-03: "when creating ficha clinica, the NIF field must be as
 * mandatory to fill in, cannot move forward without it".
 *
 * These cases exist because the unit tests prove the RULE and cannot prove the
 * FORM: that the field is actually marked required, that the exemption reveals
 * its reason input, and that a blocked submit leaves the user on the form
 * instead of silently creating half a patient.
 */
import { test, expect } from "@playwright/test";
import { createPatient, generateValidNif, goToPatients } from "./helpers";

const uniq = () => Math.random().toString(36).slice(2, 8);

test("cannot create a patient with no NIF - submit is refused and we stay on the form", async ({
  page,
}) => {
  await page.goto("/patients/new");
  await page.getByLabel(/Nome completo/i).pressSequentially(`Sem NIF ${uniq()}`);
  // Deliberately no NIF, no exemption.
  await page.getByRole("button", { name: "Criar Paciente" }).click();

  // Still on the create form: no redirect to /patients/<uuid> happened.
  await expect(page).toHaveURL(/\/patients\/new/);
  // And the field itself reports as invalid rather than the page just doing
  // nothing, which is what tells the user WHY the button appeared to fail.
  const nif = page.getByLabel(/^NIF/i);
  await expect(nif).toHaveJSProperty("validity.valid", false);
});

test("a valid NIF creates the patient and shows it on the ficha", async ({ page }) => {
  const nif = generateValidNif();
  const id = await createPatient(page, { fullName: `Com NIF ${uniq()}`, nif });

  await page.goto(`/patients/${id}`);
  await expect(page.getByText(nif)).toBeVisible();
  // A complete ficha carries no incomplete banner.
  await expect(page.getByTestId("ficha-incompleta-nif")).toHaveCount(0);
});

test("a malformed NIF is rejected by the server, not silently stored", async ({ page }) => {
  await page.goto("/patients/new");
  await page.getByLabel(/Nome completo/i).pressSequentially(`NIF Mau ${uniq()}`);
  // Nine digits, so the browser's own required-check passes and the value
  // reaches the server: this asserts the CHECKSUM is enforced, which is the
  // half that stops the field filling up with plausible junk.
  await page.getByLabel(/^NIF/i).pressSequentially("123456780");
  await page.getByRole("button", { name: "Criar Paciente" }).click();

  await expect(page).toHaveURL(/\/patients\/new/);
  await expect(page.getByText(/d[ií]gito de controlo/i)).toBeVisible({ timeout: 8_000 });
});

test("999999990 is refused and the message points at the exemption", async ({ page }) => {
  await page.goto("/patients/new");
  await page.getByLabel(/Nome completo/i).pressSequentially(`Consumidor ${uniq()}`);
  await page.getByLabel(/^NIF/i).pressSequentially("999999990");
  await page.getByRole("button", { name: "Criar Paciente" }).click();

  await expect(page).toHaveURL(/\/patients\/new/);
  await expect(page.getByText(/consumidor final/i)).toBeVisible({ timeout: 8_000 });
});

test("the exemption lets a foreign patient through, and is shown on the ficha", async ({
  page,
}) => {
  const name = `Estrangeiro ${uniq()}`;
  const id = await createPatient(page, {
    fullName: name,
    nifExempt: true,
    nifExemptReason: "Passaporte do Reino Unido",
  });

  await page.goto(`/patients/${id}`);
  // The ficha states the exemption and its reason rather than an empty dash.
  await expect(page.getByText(/Sem NIF/)).toBeVisible();
  await expect(page.getByText(/Passaporte do Reino Unido/)).toBeVisible();
  // An exempted patient is COMPLETE: no incomplete banner.
  await expect(page.getByTestId("ficha-incompleta-nif")).toHaveCount(0);
});

test("ticking the exemption reveals a required reason and hides the NIF input", async ({
  page,
}) => {
  await page.goto("/patients/new");
  const nif = page.getByLabel(/^NIF/i);
  await expect(nif).toBeEnabled();

  await page.getByLabel(/Estrangeiro \/ sem NIF/i).check();
  await expect(nif).toBeDisabled();

  const reason = page.getByLabel(/^Motivo/i);
  await expect(reason).toBeVisible();
  await expect(reason).toHaveJSProperty("required", true);

  // Un-ticking restores the NIF input.
  await page.getByLabel(/Estrangeiro \/ sem NIF/i).uncheck();
  await expect(nif).toBeEnabled();
  await expect(page.getByLabel(/^Motivo/i)).toHaveCount(0);
});

test("an existing NIF cannot be edited back to empty", async ({ page }) => {
  const id = await createPatient(page, {
    fullName: `Editar NIF ${uniq()}`,
    nif: generateValidNif(),
  });

  await page.goto(`/patients/${id}/edit`);
  // Cleared with real key events, not fill(""): WebKit's automation layer does
  // not propagate fill() to React's onChange, so the controlled input would
  // keep its old value and this test would pass without testing anything.
  const nifBox = page.getByLabel(/^NIF/i);
  await nifBox.click();
  await nifBox.press("ControlOrMeta+a");
  await nifBox.press("Backspace");
  await expect(nifBox).toHaveValue("");
  await page.getByRole("button", { name: /Guardar/i }).click();

  // Rejected server-side: the ficha keeps the NIF it had.
  await expect(page.getByText(/N[ãa]o é possível remover um NIF já registado/i)).toBeVisible({
    timeout: 8_000,
  });
});

test("patient search still finds a patient by NIF", async ({ page }) => {
  const nif = generateValidNif();
  const name = `Busca NIF ${uniq()}`;
  await createPatient(page, { fullName: name, nif });

  await goToPatients(page);
  const box = page.getByPlaceholder(/Pesquisar por nome/i);
  await box.pressSequentially(nif);
  await box.press("Enter");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible({
    timeout: 8_000,
  });
});
