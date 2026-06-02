/**
 * clinical.spec.ts — Clinical Records (Stream C).
 *
 * Authoring/signing runs as THERAPIST (owner/therapist hold
 * clinical_records:author + :sign; admin is read-only).
 *
 * Happy paths: create a record from the CURRENT form version, sign/lock it,
 * then create a new version (addendum).
 * Guardrails: a signed record is immutable (read-only, no sign action); the
 * picker offers only the current template version (PR #96 resolver); reception
 * has no clinical access at all.
 */
import { test, expect } from "@playwright/test";
import {
  PATIENTS,
  STORAGE,
  TEMPLATE_CURRENT_LABEL,
  TEMPLATE_SUPERSEDED_LABEL,
} from "./fixtures";

test.describe("authoring (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("the Modelo picker offers only the current template version", async ({ page }) => {
    await page.goto("/clinical/new");
    const picker = page.getByLabel(/Modelo/i);
    await expect(picker.getByRole("option", { name: TEMPLATE_CURRENT_LABEL })).toHaveCount(1);
    // PR #96: the superseded v1 must not appear.
    await expect(picker.getByRole("option", { name: TEMPLATE_SUPERSEDED_LABEL })).toHaveCount(0);
  });

  test("create a record from the current form, then sign/lock and version it", async ({ page }) => {
    // --- Create from the current template version ---
    await page.goto("/clinical/new");
    await page.getByLabel(/Utente/i).selectOption({ label: PATIENTS.maria.name });
    await page.getByLabel(/Modelo/i).selectOption({ label: TEMPLATE_CURRENT_LABEL });
    await page.getByRole("button", { name: "Criar ficha" }).click();

    await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    await expect(page.getByText(/Versão 1/)).toBeVisible();
    await expect(page.getByText("Rascunho")).toBeVisible();

    // --- Sign + lock → immutable ---
    await page.getByRole("button", { name: "Assinar e bloquear" }).click();
    await expect(page.getByText("Ficha finalizada e imutável.", { exact: false })).toBeVisible({
      timeout: 12_000,
    });
    // "Assinada" shows in both the header status and the success banner — first().
    await expect(page.getByText("Assinada").first()).toBeVisible();
    // GUARDRAIL — the sign action is gone and the form is read-only after locking.
    await expect(page.getByRole("button", { name: "Assinar e bloquear" })).toHaveCount(0);

    // --- Version (addendum) → a fresh draft at version 2 ---
    await page.getByRole("button", { name: "Nova versão (adenda)" }).click();
    await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/, { timeout: 12_000 });
    await expect(page.getByText(/Versão 2/)).toBeVisible();
    await expect(page.getByText("Rascunho")).toBeVisible();
  });
});

test.describe("access control (reception)", () => {
  test.use({ storageState: STORAGE.reception });

  test("reception has no clinical access and is redirected away", async ({ page }) => {
    await page.goto("/clinical");
    // The clinical layout redirects a role without clinical_records:read.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8_000 });
    await expect(page).not.toHaveURL(/\/clinical/);
  });
});
