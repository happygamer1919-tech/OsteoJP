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

    // 5.1 header row (W5-19 ruling B): NO Data do Episódio input — Peso + Altura
    // present and adjacent. The episode date is auto-stamped from created_at.
    await expect(form.getByText("Peso (kg)")).toBeVisible();
    await expect(form.getByText("Altura (cm)")).toBeVisible();

    // W5-19 ruling C — the section is now "Outros" (not "Problemas de Saúde"):
    // all 19 conditions render as checkboxes (Lúpus included). Scope to the form
    // to avoid the header strip / rail. Assert a representative spread incl. Lúpus.
    for (const label of ["Fumador", "Lúpus", "Diabetes", "COVID-19", "Hipotensão", "Neoplasia"]) {
      await expect(form.getByText(label, { exact: false }).first()).toBeVisible();
    }
    await expect(form.getByText("Outros", { exact: false }).first()).toBeVisible();
    await expect(form.getByText("Problemas de Saúde", { exact: false })).toHaveCount(0);
    // AMENDMENTS ruling F (W5-24): the free-text renders with NO visible label —
    // an unlabeled input carrying the "Outras..." placeholder (accessible name via
    // aria-label). The superseded ruling-C placeholder is gone.
    await expect(form.getByPlaceholder("Outras...")).toBeVisible();
    await expect(
      form.getByPlaceholder("Outras condições, alergias, medicamentos..."),
    ).toHaveCount(0);

    // Ruling F: the Outros section is the legacy 4x5 grid — strict 4-up desktop
    // (lg:grid-cols-4), with the free-text pulled INLINE as the 20th (last) grid
    // cell. Exactly 20 cells; the last one holds the "Outras..." free-text input.
    const outrosGrid = form.locator(".lg\\:grid-cols-4").first();
    await expect(outrosGrid).toBeAttached();
    await expect(outrosGrid.locator(":scope > div")).toHaveCount(20);
    await expect(
      outrosGrid.locator(":scope > div").last().getByPlaceholder("Outras..."),
    ).toBeVisible();

    // W5-19 ruling B: NO manual created-date picker anywhere — there is no
    // date input and no "Data do Episódio" label in the form. The created
    // instant shows read-only in the header strip ("Criado em") only.
    await expect(form.locator('input[type="date"]')).toHaveCount(0);
    await expect(form.getByText("Data do Episódio", { exact: false })).toHaveCount(0);
  });

  // W5-15 + W5-20 (SPEC-ficha-medica.md sec 5.10-5.13, AMENDMENTS ruling E): the
  // Mobilidade Activa/Passiva three-circle widget — min-44px marker-type toggle,
  // "Inserir marcador" arm step, unlimited dot/star markers, record-wide Limpar,
  // persist + restore — plus the 5.10-5.13 fields in the authoritative sequence.
  // Locators are scoped to #record-form and to each circle's aria-label to avoid
  // strict-mode ambiguity across the three circles.
  test("Mobilidade widget: toggle + Inserir marcador places Activa/Passiva on all three circles, record-wide Limpar clears all, persist + restore; 5.10-5.13 render in order", async ({
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

    // Select Activa via the min-44px toggle, ARM placement (Inserir marcador),
    // then place a dot on each circle. Placement only lands while armed.
    await form.getByRole("button", { name: "Mobilidade Activa", exact: true }).click();
    await form.getByRole("button", { name: "Inserir marcador", exact: true }).click();
    for (const circle of [cervical, dorsal, lombar]) {
      await circle.click({ position: { x: 40, y: 40 } });
    }
    // Switch to Passiva (still armed) and place a star on each circle.
    await form.getByRole("button", { name: "Mobilidade Passiva", exact: true }).click();
    for (const circle of [cervical, dorsal, lombar]) {
      await circle.click({ position: { x: 100, y: 100 } });
    }

    // Each circle now holds 1 Activa (dot) + 1 Passiva (star).
    for (const circle of [cervical, dorsal, lombar]) {
      await expect(circle.locator('[data-marker="activa"]')).toHaveCount(1);
      await expect(circle.locator('[data-marker="passiva"]')).toHaveCount(1);
    }

    // Motivos (consultation_reason) is a required field — the save validates the
    // schema's required set (episode_date is auto-stamped server-side from
    // created_at, W5-19), so only Motivos must be filled before Guardar.
    await form.getByLabel(/Motivos da Consulta/i).fill("Dor lombar de esforço.");

    // Persist (Guardar) then reload — markers restore from mobilidade.*.
    // exact: the signature section adds a "Guardar assinatura" button, which a
    // substring "Guardar" match would also catch (strict-mode violation).
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Ficha guardada", { exact: false }).first()).toBeVisible({
      timeout: 12_000,
    });
    await page.reload();

    const form2 = page.locator("#record-form");
    const cervical2 = form2.getByRole("application", { name: "Cervical" });
    const dorsal2 = form2.getByRole("application", { name: "Dorsal" });
    const lombar2 = form2.getByRole("application", { name: "Lombar" });
    // All three circles restored their 1 Activa + 1 Passiva.
    for (const circle of [cervical2, dorsal2, lombar2]) {
      await expect(circle.locator('[data-marker="activa"]')).toHaveCount(1);
      await expect(circle.locator('[data-marker="passiva"]')).toHaveCount(1);
    }

    // A single record-wide "Limpar marcadores" clears ALL three circles at once.
    await form2.getByRole("button", { name: "Limpar marcadores", exact: true }).click();
    for (const circle of [cervical2, dorsal2, lombar2]) {
      await expect(circle.locator('[data-marker]')).toHaveCount(0);
    }
  });

  // W5-15 + W5-20: a finalized (signed/locked) record renders the Mobilidade
  // widget read-only — no marker-type toggle, no "Inserir marcador", no Limpar,
  // and clicking a circle places nothing (not an interactive application).
  test("Mobilidade widget is read-only on a finalized record", async ({ page }) => {
    await page.goto("/clinical/new");
    const patient = page.getByRole("combobox", { name: /Paciente/i });
    await patient.click();
    await patient.fill(PATIENTS.maria.name);
    await page.getByRole("option", { name: PATIENTS.maria.name }).click();
    await page.getByLabel(/Modelo/i).selectOption({ label: TEMPLATE_CURRENT_LABEL });
    await page.getByRole("button", { name: "Criar ficha" }).click();
    await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    // Arm placement, then place one Activa marker on Cervical, then sign/lock.
    const form = page.locator("#record-form");
    await form.getByRole("button", { name: "Inserir marcador", exact: true }).click();
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

  // W5-25 (SPEC-ficha-medica.md AMENDMENTS ruling G): the Local da dor bodychart
  // gives each marker type a UNIQUE shape + colour and shows an always-visible
  // legend. Place two distinct types, assert distinct shapes render + the nine-
  // entry legend is present, then persist + reload and confirm both restore
  // (marker array shape { marker_type, x, y, view } unchanged).
  test("Bodychart markers: distinct shapes + always-visible legend, persist + restore", async ({
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
    const canvas = form.getByTestId("bodychart-canvas");
    const typeSelect = form.getByRole("combobox", { name: /Tipo de marcador/i });

    // Always-visible legend: all nine types listed (not a hover/disclosure).
    const legend = form.getByTestId("bodychart-legend");
    await expect(legend).toBeVisible();
    await expect(legend.locator("[data-legend-type]")).toHaveCount(9);

    // Place a Bloqueio / Disfunção (square) and a Local da dor (circle).
    await typeSelect.selectOption({ label: "Bloqueio / Disfunção" });
    await canvas.click({ position: { x: 30, y: 40 } });
    await typeSelect.selectOption({ label: "Local da dor" });
    await canvas.click({ position: { x: 90, y: 120 } });

    // Two on-chart markers with DISTINCT shapes (scoped to the canvas so the
    // legend's own shape glyphs are not counted).
    await expect(canvas.locator('[data-marker-shape="square"]')).toHaveCount(1);
    await expect(canvas.locator('[data-marker-shape="circle"]')).toHaveCount(1);

    await form.getByLabel(/Motivos da Consulta/i).fill("Marcadores no diagrama corporal.");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Ficha guardada", { exact: false }).first()).toBeVisible({
      timeout: 12_000,
    });
    await page.reload();

    // Both markers restore with their type-driven shapes (stored data untouched).
    const canvas2 = page.locator("#record-form").getByTestId("bodychart-canvas");
    await expect(canvas2.locator('[data-marker-shape="square"]')).toHaveCount(1);
    await expect(canvas2.locator('[data-marker-shape="circle"]')).toHaveCount(1);
    await expect(
      page.locator("#record-form").getByTestId("bodychart-legend").locator("[data-legend-type]"),
    ).toHaveCount(9);
  });

osteojp-w5-26-pain-scale-eva
  // W5-26 (SPEC-ficha-medica.md AMENDMENTS ruling H): placing a Local da dor
  // (pain_location) marker exposes a 0-10 EVA selector; the chosen value stores
  // as an additive `intensity` jsonb key, shows as "Local da dor - EVA n/10",
  // persists across reload, appears ONLY on pain_location, and is read-only once
  // the record is signed.
  test("Bodychart EVA: Local da dor stores a 0-10 intensity, persists, other types unaffected, signed read-only", async ({
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
    const canvas = form.getByTestId("bodychart-canvas");
    const typeSelect = form.getByRole("combobox", { name: /Tipo de marcador/i });
    const evaSelect = form.getByRole("combobox", { name: "Intensidade EVA (0 a 10)" });

    // Place a Local da dor marker, then set EVA = 7 on its list row.
    await typeSelect.selectOption({ label: "Local da dor" });
    await canvas.click({ position: { x: 60, y: 80 } });
    await expect(evaSelect).toHaveCount(1);
    await evaSelect.selectOption("7");
    await expect(form.getByText("Local da dor - EVA 7/10")).toBeVisible();

    // Other types get NO EVA selector: place a Hipertonicidade marker; still one EVA select.
    await typeSelect.selectOption({ label: "Hipertonicidade" });
    await canvas.click({ position: { x: 120, y: 150 } });
    await expect(form.getByRole("combobox", { name: "Intensidade EVA (0 a 10)" })).toHaveCount(1);

    // Persist + reload → the stored intensity restores and displays.
    await form.getByLabel(/Motivos da Consulta/i).fill("EVA na Local da dor.");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Ficha guardada", { exact: false }).first()).toBeVisible({
      timeout: 12_000,
    });
    await page.reload();

    const form2 = page.locator("#record-form");
    await expect(form2.getByText("Local da dor - EVA 7/10")).toBeVisible();
    await expect(
      form2.getByRole("combobox", { name: "Intensidade EVA (0 a 10)" }),
    ).toHaveValue("7");

    // Sign/lock → the EVA value still shows, but the editable control is gone.
    await page.getByRole("button", { name: "Assinar e bloquear" }).click();
    await expect(page.getByText("Ficha finalizada e imutável.", { exact: false })).toBeVisible({
      timeout: 12_000,
    });
    await expect(page.getByText("Local da dor - EVA 7/10")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Intensidade EVA (0 a 10)" })).toHaveCount(0);
  });


 main
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
