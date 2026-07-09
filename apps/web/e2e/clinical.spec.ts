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
  TEMPLATE_RETIRED_LABEL,
  TEMPLATE_SUPERSEDED_LABEL,
} from "./fixtures";

test.describe("authoring (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("the Modelo picker offers only Ficha Médica (others retired from creation)", async ({
    page,
  }) => {
    await page.goto("/clinical/new");
    const picker = page.getByLabel(/Modelo/i);
    // W5-13 (SPEC sec 1): creation offers a SINGLE template — Ficha Médica.
    await expect(picker.getByRole("option")).toHaveCount(1);
    await expect(picker.getByRole("option", { name: TEMPLATE_CURRENT_LABEL })).toHaveCount(1);
    // The superseded osteopathy version is collapsed away (PR #96 resolver)...
    await expect(picker.getByRole("option", { name: TEMPLATE_SUPERSEDED_LABEL })).toHaveCount(0);
    // ...and a now-retired template (physiotherapy) is not selectable on creation
    // — its row still exists; existing records that pinned it render unchanged.
    await expect(picker.getByRole("option", { name: TEMPLATE_RETIRED_LABEL })).toHaveCount(0);
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

  // W5-14 (SPEC-ficha-medica.md sec 3-5): a new Ficha Médica renders the
  // read-only patient header strip, the 5.1 header row with Peso/Altura
  // adjacent, the four-column Problemas de Saúde grid with all 19 conditions +
  // Outros after the grid, and NO manual created-date picker.
  test("a new Ficha Médica renders the sec 5.0-5.9 structure (header strip, Peso/Altura, 19-condition grid, no created-date picker)", async ({
    page,
  }) => {
    await page.goto("/clinical/new");
    const patient = page.getByRole("combobox", { name: /Paciente/i });
    await patient.click();
    await patient.fill(PATIENTS.maria.name);
    await page.getByRole("option", { name: PATIENTS.maria.name }).click();
    await page.getByLabel(/Modelo/i).selectOption({ label: TEMPLATE_CURRENT_LABEL });
    await page.getByRole("button", { name: "Criar ficha" }).click();
    await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    const form = page.locator("#record-form");

    // 5.0 read-only patient header strip: patient name + "Criado em" timestamp,
    // OUTSIDE the record form (display-only, no duplicated inputs).
    await expect(page.getByText("Criado em", { exact: false }).first()).toBeVisible();
    // NO-DUPLICATION: the form itself requests no NIF / Profissão field.
    await expect(form.getByText("NIF", { exact: false })).toHaveCount(0);
    await expect(form.getByText("Profissão", { exact: false })).toHaveCount(0);

    // 5.1 header row: Data do Episódio prefilled today, Peso + Altura present.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
    await expect(form.locator('input[type="date"]').first()).toHaveValue(today);
    await expect(form.getByText("Peso (kg)")).toBeVisible();
    await expect(form.getByText("Altura (cm)")).toBeVisible();

    // 5.4 Problemas de Saúde: all 19 conditions render as checkboxes (Lúpus
    // included) with the free-text Outros present. Scope to the form to avoid
    // the header strip / rail. Assert a representative spread incl. Lúpus.
    for (const label of ["Fumador", "Lúpus", "Diabetes", "COVID-19", "Hipotensão", "Neoplasia"]) {
      await expect(form.getByText(label, { exact: false }).first()).toBeVisible();
    }
    await expect(form.getByText("Outros", { exact: false }).first()).toBeVisible();

    // 5.4 four-column grid: the checkbox grid carries the lg:grid-cols-4 class.
    await expect(form.locator(".lg\\:grid-cols-4").first()).toBeAttached();

    // SPEC sec 4: NO manual created-date picker. The only date input is
    // episode_date (the header row); there is no second "created"/"criado" date
    // field to hand-type.
    await expect(form.locator('input[type="date"]')).toHaveCount(1);
  });

  // W5-15 (SPEC-ficha-medica.md sec 5.10-5.13): the Mobilidade Activa/Passiva
  // three-circle widget (unlimited dot/star markers per circle, Limpar per
  // circle, persist + restore) plus the 5.10-5.13 fields in the authoritative
  // sequence. Locators are scoped to #record-form and to each circle's
  // aria-label to avoid strict-mode ambiguity across the three circles.
  test("Mobilidade widget: place Activa/Passiva markers on all three circles, Limpar clears one, persist + restore; 5.10-5.13 render in order", async ({
    page,
  }) => {
    await page.goto("/clinical/new");
    const patient = page.getByRole("combobox", { name: /Paciente/i });
    await patient.click();
    await patient.fill(PATIENTS.maria.name);
    await page.getByRole("option", { name: PATIENTS.maria.name }).click();
    await page.getByLabel(/Modelo/i).selectOption({ label: TEMPLATE_CURRENT_LABEL });
    await page.getByRole("button", { name: "Criar ficha" }).click();
    await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    const form = page.locator("#record-form");

    // 5.10-5.13 fields render in the authoritative sequence (scoped to the form).
    for (const label of [
      "Mobilidade Activa / Passiva",
      "Observações Mobilidade Activa / Passiva",
      "Testes Neurológicos",
      "Testes Especiais",
      "Diagnóstico",
      "Tratamento",
      "Plano de Tratamento",
      "Objectivos do Tratamento",
      "Observações",
    ]) {
      await expect(form.getByText(label, { exact: false }).first()).toBeVisible();
    }

    const cervical = form.getByRole("application", { name: "Cervical" });
    const dorsal = form.getByRole("application", { name: "Dorsal" });
    const lombar = form.getByRole("application", { name: "Lombar" });
    const markerSelect = form.getByRole("combobox").filter({ hasText: "Mobilidade Activa" }).first();

    // Place an Activa (dot) marker on each circle.
    await markerSelect.selectOption({ label: "Mobilidade Activa" });
    for (const circle of [cervical, dorsal, lombar]) {
      await circle.click({ position: { x: 40, y: 40 } });
    }
    // Switch to Passiva and place a star marker on each circle.
    await markerSelect.selectOption({ label: "Mobilidade Passiva" });
    for (const circle of [cervical, dorsal, lombar]) {
      await circle.click({ position: { x: 100, y: 100 } });
    }

    // Each circle now holds 1 Activa (dot) + 1 Passiva (star).
    for (const circle of [cervical, dorsal, lombar]) {
      await expect(circle.locator('[data-marker="activa"]')).toHaveCount(1);
      await expect(circle.locator('[data-marker="passiva"]')).toHaveCount(1);
    }

    // Limpar clears exactly the Dorsal circle; Cervical + Lombar keep their markers.
    await dorsal
      .locator("xpath=ancestor::div[1]")
      .getByRole("button", { name: "Limpar marcadores" })
      .click();
    await expect(dorsal.locator('[data-marker]')).toHaveCount(0);
    await expect(cervical.locator('[data-marker]')).toHaveCount(2);
    await expect(lombar.locator('[data-marker]')).toHaveCount(2);

    // Motivos (consultation_reason) is a required field — the save validates the
    // schema's required set (episode_date is prefilled), so fill it before Guardar.
    await form.getByLabel(/Motivos da Consulta/i).fill("Dor lombar de esforço.");

    // Persist (Guardar) then reload — markers restore from mobilidade.*.
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Ficha guardada", { exact: false }).first()).toBeVisible({
      timeout: 12_000,
    });
    await page.reload();

    const cervical2 = page.locator("#record-form").getByRole("application", { name: "Cervical" });
    const dorsal2 = page.locator("#record-form").getByRole("application", { name: "Dorsal" });
    const lombar2 = page.locator("#record-form").getByRole("application", { name: "Lombar" });
    await expect(cervical2.locator('[data-marker="activa"]')).toHaveCount(1);
    await expect(cervical2.locator('[data-marker="passiva"]')).toHaveCount(1);
    await expect(lombar2.locator('[data-marker]')).toHaveCount(2);
    await expect(dorsal2.locator('[data-marker]')).toHaveCount(0);
  });

  // W5-15: a finalized (signed/locked) record renders the Mobilidade widget
  // read-only — no marker-type select, no Limpar action, and clicking a circle
  // places nothing (the circle is not an interactive application).
  test("Mobilidade widget is read-only on a finalized record", async ({ page }) => {
    await page.goto("/clinical/new");
    const patient = page.getByRole("combobox", { name: /Paciente/i });
    await patient.click();
    await patient.fill(PATIENTS.maria.name);
    await page.getByRole("option", { name: PATIENTS.maria.name }).click();
    await page.getByLabel(/Modelo/i).selectOption({ label: TEMPLATE_CURRENT_LABEL });
    await page.getByRole("button", { name: "Criar ficha" }).click();
    await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    // Place one Activa marker on Cervical, then sign/lock.
    const form = page.locator("#record-form");
    await form.getByRole("application", { name: "Cervical" }).click({ position: { x: 40, y: 40 } });
    await page.getByRole("button", { name: "Assinar e bloquear" }).click();
    await expect(page.getByText("Ficha finalizada e imutável.", { exact: false })).toBeVisible({
      timeout: 12_000,
    });

    // Read-only: the placed marker still renders, but the circle is no longer an
    // interactive application and the Limpar action + marker-type select are gone.
    await expect(page.getByText("Cervical").first()).toBeVisible();
    await expect(page.getByRole("application", { name: "Cervical" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Limpar marcadores" })).toHaveCount(0);
    await expect(page.locator('[data-marker="activa"]').first()).toBeVisible();
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
    // Scope to the Episódio <select> by name: getByLabel(/Episódio/i) also
    // caught the sibling Modelo select's options (the option counts below must
    // see only the episode select).
    const episodio = page.locator('select[name="episodeId"]');
    // W5-02: the Paciente field is an async search Combobox (focus, type, pick).
    const patient = page.getByRole("combobox", { name: /Paciente/i });

    // Empty state: no patient selected yet → only "Sem episódio".
    await expect(episodio.locator("option")).toHaveCount(1);
    await expect(episodio.locator("option", { hasText: "Sem episódio" })).toHaveCount(1);

    // Patient A: her episode(s) appear, and "Sem episódio" stays available.
    await patient.click();
    await patient.fill(PATIENTS.maria.name);
    await page.getByRole("option", { name: PATIENTS.maria.name }).click();
    await expect(episodio.locator("option", { hasText: "Sem episódio" })).toHaveCount(1);
    // Options inside a closed native select are not "visible" — assert attachment.
    await expect(episodio.locator("option", { hasText: /Episódio \(/ }).first()).toBeAttached();

    // Patient B (João — no spec ever opens episodes for him): none of Maria's
    // episodes leak through; only "Sem episódio" remains.
    await patient.click();
    await patient.fill(PATIENTS.joao.name);
    await page.getByRole("option", { name: PATIENTS.joao.name }).click();
    await expect(episodio.locator("option")).toHaveCount(1);
    await expect(episodio.locator("option", { hasText: "Sem episódio" })).toHaveCount(1);
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
