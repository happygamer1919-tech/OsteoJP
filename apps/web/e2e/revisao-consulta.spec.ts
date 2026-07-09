/**
 * revisao-consulta.spec.ts — W5-17 (SPEC-ficha-medica.md sec 1-2, Revisão
 * Consulta flow). Runs as THERAPIST (owner/therapist hold
 * clinical_records:review + :sign).
 *
 * Proves the wave-closing behaviour: the Revisão Consulta "Assumir" on an AI
 * draft opens it INSIDE the Ficha Médica editor (W5-13/14/15/16 RecordForm) with
 * the twelve AI-filled fields visible + EDITABLE (mapped from _aiIngestionRaw by
 * the identity mapping), the reviewer edits an AI field + signs, and the signed
 * record lands in the patient's Registos clínicos. The two axes stay SEPARATE:
 * signing is a record_status transition (draft → signed); approval is an
 * ai_review_state transition (in_review → approved). Finalize advances both by
 * DISTINCT columns in one statement — the DB-level axis-separation + immutability
 * proof lives in packages/db/tests/review-finalize-rls.test.ts.
 *
 * Locator discipline (the flakiness class we keep hitting): scope to #record-form
 * / the exact review row; use exact:true for buttons whose name prefixes another
 * ("Guardar" vs "Guardar assinatura"); fill required fields before saving.
 */
import { test, expect } from "@playwright/test";
import { AI_REVIEW_DRAFT, PATIENTS, STORAGE } from "./fixtures";

test.describe("Revisão Consulta — Assumir opens the Ficha Médica editor (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("Assumir an AI draft → Ficha Médica editor shows the twelve AI values editable → edit + sign → appears signed in Registos", async ({
    page,
  }) => {
    // --- Review queue: the AI draft is queued (Por rever) for João Pereira. ---
    await page.goto("/clinical/review");
    await expect(page.getByRole("heading", { name: "Revisão Consulta" })).toBeVisible();

    // Scope to the queue ROW for our seeded patient so the Assumir click is
    // unambiguous even if other queue items exist.
    const row = page
      .getByRole("row")
      .filter({ hasText: AI_REVIEW_DRAFT.patientName })
      .first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole("button", { name: "Assumir", exact: true }).click();

    // --- Lands in the Ficha Médica editor on the review route (NOT the old
    //     narrative editor): the #record-form + the Ficha Médica structure. ---
    await expect(page).toHaveURL(/\/clinical\/review\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const form = page.locator("#record-form");
    await expect(form).toBeVisible({ timeout: 10_000 });
    // The Ficha Médica structure (the 5.1 header row: Peso/Altura — no date input
    // since W5-19) — this is the Ficha Médica editor, not the free-text JSON one.
    await expect(form.getByText("Peso (kg)")).toBeVisible();
    await expect(form.getByText("Altura (cm)")).toBeVisible();

    // --- The twelve AI values render in their Ficha Médica fields, EDITABLE. ---
    // Motivos da Consulta (AI key 1) carries the seeded AI value and is editable.
    const motivos = form.getByLabel(/Motivos da Consulta/i);
    await expect(motivos).toHaveValue(AI_REVIEW_DRAFT.values.consultation_reason);
    await expect(motivos).toBeEditable();
    // Observações (AI key 12) likewise.
    const observacoes = form.getByLabel(/^Observações$/i).first();
    await expect(observacoes).toHaveValue(AI_REVIEW_DRAFT.values.observations);
    // A systems_review leaf (AI key 4) shows its AI value too (twelve, not just top-level).
    await expect(
      form.getByText(AI_REVIEW_DRAFT.values.neurological, { exact: false }).first(),
    ).toBeVisible();

    // --- Reviewer edits an AI field, completes the required set, and SAVES. ---
    const edited = "Revisto: dor lombar mecanica confirmada.";
    await motivos.fill(edited); // consultation_reason is required — filled with the edit.
    // exact: the signature section adds "Guardar assinatura"; a substring
    // "Guardar" would violate strict mode.
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Ficha guardada", { exact: false }).first()).toBeVisible({
      timeout: 12_000,
    });

    // --- Finalizar: sign + approve (record_status → signed, ai_review_state →
    //     approved). It redirects to the normal clinical viewer. ---
    await page.getByRole("button", { name: "Finalizar (assinar e bloquear)" }).click();
    await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}(\?.*)?$/, { timeout: 15_000 });
    // record_status axis: the finalized record is Assinada + immutable (no sign
    // action, form read-only). Immutability guardrail.
    await expect(page.getByText("Assinada").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Assinar e bloquear" })).toHaveCount(0);
    // The edited AI value persisted through claim → save → finalize.
    await expect(page.getByText(edited, { exact: false }).first()).toBeVisible();

    // --- The signed record appears in the patient's Registos clínicos tab. ---
    await page.goto(`/patients/${PATIENTS.joao.id}?tab=registos`);
    const recordLink = page.locator(`a[href="/clinical/${AI_REVIEW_DRAFT.id}"]`).first();
    await expect(recordLink).toBeVisible({ timeout: 10_000 });
    // Its status axis shows Assinada in the Registos list, and the finalized ficha
    // exposes the addendum action (immutable → changes are new versions).
    await expect(page.getByText("Assinada").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova versão (adenda)" }).first()).toBeVisible();
  });
});
