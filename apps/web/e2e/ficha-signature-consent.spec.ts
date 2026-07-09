/**
 * ficha-signature-consent.spec.ts — W5-16 (SPEC-ficha-medica.md sec 5.14 / 7).
 * Runs as THERAPIST (clinical_records:author). SYNTHETIC patient only.
 *
 * Asserts the signature + consent section that lands after the ficha body (5.13):
 *  - the on-screen SIGNATURE canvas + Guardar/Limpar controls are present on a
 *    draft (the actual Storage landing is covered by the unit tests — the CI
 *    seed does not provision the clinical-attachments bucket, exactly as the
 *    camera-to-ficha and patient-documents specs note);
 *  - GERAR PDF is present (the A4 RGPD form action);
 *  - each of the three CONSINTO items toggles between an explicit check (granted)
 *    and X (denied) state, and the state PERSISTS across a Guardar + reload
 *    (migration-free, inside the record data);
 *  - a FINALIZED (signed) record renders the section READ-ONLY: no canvas, no
 *    toggles, the persisted decisions shown as static states.
 *
 * Every locator is scoped to `#signature-consent` (or `#record-form`) so the
 * assertions never collide with the ficha body, the rail, or the header strip.
 */
import { test, expect, type Page } from "@playwright/test";
import { PATIENTS, STORAGE, TEMPLATE_CURRENT_LABEL } from "./fixtures";

/** Create a fresh draft Ficha Médica for a synthetic patient; land on its detail. */
async function createDraftFicha(page: Page) {
  await page.goto("/clinical/new");
  const patient = page.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(PATIENTS.maria.name);
  await page.getByRole("option", { name: PATIENTS.maria.name }).click();
  await page.getByLabel(/Modelo/i).selectOption({ label: TEMPLATE_CURRENT_LABEL });
  await page.getByRole("button", { name: "Criar ficha" }).click();
  await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByText("Rascunho")).toBeVisible();
}

test.describe("ficha signature + consent (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("signature canvas + Gerar PDF present; Consinto items toggle check/X and persist", async ({
    page,
  }) => {
    await createDraftFicha(page);

    const section = page.locator("#signature-consent");
    await expect(section).toBeVisible();

    // 1. On-screen signature canvas + its controls.
    await expect(section.getByTestId("signature-canvas")).toBeVisible();
    await expect(section.getByRole("button", { name: "Guardar assinatura" })).toBeVisible();
    await expect(section.getByRole("button", { name: "Limpar" })).toBeVisible();

    // 2. Gerar PDF (A4 RGPD form action).
    await expect(section.getByRole("button", { name: "Gerar PDF" })).toBeVisible();

    // 3. Three Consinto items, each starting in an EXPLICIT unset state (never a
    //    bare box). Scope every locator by the item's data attribute.
    for (const key of ["rgpd", "sms", "dataHandling"]) {
      const item = section.locator(`[data-consent-item="${key}"]`);
      await expect(item).toBeVisible();
      await expect(item.locator('[data-consent-state="unset"]')).toBeVisible();
    }

    // Toggle rgpd -> granted (check), sms -> denied (X), leave dataHandling unset.
    await section.locator('[data-consent-action="rgpd:grant"]').click();
    await section.locator('[data-consent-action="sms:deny"]').click();
    await expect(
      section.locator('[data-consent-item="rgpd"] [data-consent-state="granted"]'),
    ).toBeVisible();
    await expect(
      section.locator('[data-consent-item="sms"] [data-consent-state="denied"]'),
    ).toBeVisible();

    // Required field must be filled before Guardar (schema validates it).
    await page
      .locator("#record-form")
      .getByLabel(/Motivos da Consulta/i)
      .fill("Dor lombar de esforço.");

    // Persist: Gravar (the record-form submit), then reload → the consent
    // decisions survive (persisted in the record data, migration-free).
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Ficha guardada.", { exact: false })).toBeVisible({
      timeout: 12_000,
    });
    await page.reload();

    const reloaded = page.locator("#signature-consent");
    await expect(
      reloaded.locator('[data-consent-item="rgpd"] [data-consent-state="granted"]'),
    ).toBeVisible();
    await expect(
      reloaded.locator('[data-consent-item="sms"] [data-consent-state="denied"]'),
    ).toBeVisible();
    await expect(
      reloaded.locator('[data-consent-item="dataHandling"] [data-consent-state="unset"]'),
    ).toBeVisible();
  });

  test("a finalized (signed) record renders the signature + consent section read-only", async ({
    page,
  }) => {
    await createDraftFicha(page);

    // Record a decision + a required field, save, then sign/lock.
    const section = page.locator("#signature-consent");
    await section.locator('[data-consent-action="rgpd:grant"]').click();
    await page
      .locator("#record-form")
      .getByLabel(/Motivos da Consulta/i)
      .fill("Dor lombar de esforço.");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Ficha guardada.", { exact: false })).toBeVisible({
      timeout: 12_000,
    });

    await page.getByRole("button", { name: "Assinar e bloquear" }).click();
    await expect(page.getByText("Ficha finalizada e imutável.", { exact: false })).toBeVisible({
      timeout: 12_000,
    });

    // Read-only: no signature canvas, no grant/deny toggles; the persisted
    // decision still shows as a static explicit state.
    const finalized = page.locator("#signature-consent");
    await expect(finalized).toBeVisible();
    await expect(finalized.getByTestId("signature-canvas")).toHaveCount(0);
    await expect(finalized.locator('[data-consent-action="rgpd:grant"]')).toHaveCount(0);
    await expect(
      finalized.locator('[data-consent-item="rgpd"] [data-consent-state="granted"]'),
    ).toBeVisible();
  });
});
