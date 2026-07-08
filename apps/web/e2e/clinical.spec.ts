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
    // W5-02: the Paciente field is now an async search Combobox (was a Select
    // listing every patient). Same drive pattern as the agenda/consultation
    // pickers: focus, type, pick the option.
    const patient = page.getByRole("combobox", { name: /Paciente/i });
    await patient.click();
    await patient.fill(PATIENTS.maria.name);
    await page.getByRole("option", { name: PATIENTS.maria.name }).click();
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

  // W2-06: fichas entry points live in the patient-profile Registos clínicos tab.
  test("patient Registos tab creates a ficha (scoped) and surfaces the addendum action", async ({
    page,
  }) => {
    await page.goto(`/patients/${PATIENTS.maria.id}?tab=registos`);

    // "Nova ficha" reuses the /clinical/new creation flow, pre-scoped to this patient.
    await page.getByRole("link", { name: "Nova ficha" }).click();
    await expect(page).toHaveURL(/\/clinical\/new\?patientId=/);
    // W5-02: the prefill (arriving with ?patientId=) resolves the id to the
    // patient's name in the async Combobox input; the hidden patientId carries
    // the id to the create action. Assert the visible prefilled name.
    await expect(page.getByRole("combobox", { name: /Paciente/i })).toHaveValue(
      PATIENTS.maria.name,
    );

    await page.getByLabel(/Modelo/i).selectOption({ label: TEMPLATE_CURRENT_LABEL });
    await page.getByRole("button", { name: "Criar ficha" }).click();
    await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const recordUrl = page.url(); // capture the record-detail deep link

    // Sign/lock so the ficha is finalized (its addendum action then appears in the tab).
    await page.getByRole("button", { name: "Assinar e bloquear" }).click();
    await expect(page.getByText("Ficha finalizada e imutável.", { exact: false })).toBeVisible({
      timeout: 12_000,
    });

    // Back on the tab: the finalized ficha exposes the per-ficha "Nova versão (adenda)".
    await page.goto(`/patients/${PATIENTS.maria.id}?tab=registos`);
    const addendum = page.getByRole("button", { name: "Nova versão (adenda)" }).first();
    await expect(addendum).toBeVisible();
    // The ficha row deep-links to /clinical/[id] (its title is a link to the record).
    await expect(page.locator(`a[href="${new URL(recordUrl).pathname}"]`).first()).toBeVisible();

    // Deep-link invariant: the record-detail URL still resolves unchanged.
    await page.goto(recordUrl);
    await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/);
    await expect(page.getByText(/Versão/).first()).toBeVisible({ timeout: 8_000 });
  });

  // W5-04: the Episódio picker is scoped to the selected patient — it lists
  // only that patient's episodes plus "Sem episódio"; with no patient selected
  // it offers only "Sem episódio".
  test("Episodio picker lists only the selected patient's episodes plus Sem episodio", async ({
    page,
  }) => {
    // Ensure patient A (Maria) has at least one episode: one-click "Novo
    // episódio" on her profile (dated default title, lands on the episode).
    await page.goto(`/patients/${PATIENTS.maria.id}`);
    await page.getByRole("button", { name: "Novo episódio" }).click();
    await expect(page).toHaveURL(/\/clinical\/episodes\/[0-9a-f-]{36}/, { timeout: 15_000 });

    await page.goto("/clinical/new");
    const episodio = page.getByLabel(/Episódio/i);
    // W5-02: the Paciente field is an async search Combobox (focus, type, pick).
    const patient = page.getByRole("combobox", { name: /Paciente/i });

    // Empty state: no patient selected yet → only "Sem episódio".
    await expect(episodio.getByRole("option")).toHaveCount(1);
    await expect(episodio.getByRole("option", { name: "Sem episódio" })).toHaveCount(1);

    // Patient A: her episode(s) appear, and "Sem episódio" stays available.
    await patient.click();
    await patient.fill(PATIENTS.maria.name);
    await page.getByRole("option", { name: PATIENTS.maria.name }).click();
    await expect(episodio.getByRole("option", { name: "Sem episódio" })).toHaveCount(1);
    // Options inside a closed native select are not "visible" — assert attachment.
    await expect(episodio.getByRole("option", { name: /Episódio \(/ }).first()).toBeAttached();

    // Patient B (João — no spec ever opens episodes for him): none of Maria's
    // episodes leak through; only "Sem episódio" remains.
    await patient.click();
    await patient.fill(PATIENTS.joao.name);
    await page.getByRole("option", { name: PATIENTS.joao.name }).click();
    await expect(episodio.getByRole("option")).toHaveCount(1);
    await expect(episodio.getByRole("option", { name: "Sem episódio" })).toHaveCount(1);
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
