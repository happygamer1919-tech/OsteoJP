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
 *
 * SIGN-CONFIRM-AND-SAVE-FIRST. Finalizar used to finalize on one press, from a
 * form of its own, so an edit typed and not saved was left out of the signed
 * record for good. It now opens a confirmation and saves unsaved edits first.
 * The seed offers ONE reviewable item per run (AI_REVIEW_DRAFT), and this spec
 * consumes it, so the Finalizar half of sign-confirm-save-first.spec.ts lives
 * HERE rather than in a second spec racing this one for the same row: after the
 * saved edit, a second edit is typed and NOT saved, Finalizar is cancelled
 * (nothing changes), then confirmed, and the signed record carries both edits.
 */
import { test, expect } from "@playwright/test";
import { AI_REVIEW_DRAFT, PATIENTS, STORAGE } from "./fixtures";
import { FINALIZE_LABEL, SIGN_LABEL, signButton, signDialog } from "./helpers/sign-confirm";

test.describe("Revisão Consulta — Assumir opens the Ficha Médica editor (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("Assumir an AI draft → Ficha Médica editor shows the twelve AI values editable → edit + sign → appears signed in Registos", async ({
    page,
  }) => {
    // --- Review queue: the AI draft is queued (Por rever) for João Fictício. ---
    await page.goto("/clinical/review");
    await expect(page.getByRole("heading", { name: "Revisão Consulta" })).toBeVisible();

    // Scope to the queue row for THIS RECORD, by id.
    //
    // It used to filter by patient NAME and take .first(), which was only ever
    // correct by accident: fixtures.ts seeds TWO drafts for Joao Ficticio -
    // AI_REVIEW_DRAFT and AI_DELETE_DRAFT - and this test passed only because
    // clinical.spec.ts runs earlier in file order (c before r) and hard-deletes
    // the second one first. So this spec silently depended on another spec file
    // having run, and any change to file order broke it: sharding the suite put
    // clinical.spec.ts in a different shard, both rows survived, .first() took
    // the wrong one, and its Assumir never became clickable - a 120s timeout,
    // three times, with nothing in the failure naming the real cause.
    //
    // Addressing the record by id says what the test means and cannot be
    // reordered into a different answer.
    // `tr[...]`, not `[...]`. The queue renders BOTH layouts into the DOM at all
    // times - a desktop <table> and a mobile <ul>, each hidden by CSS at the
    // other breakpoint - so an unqualified attribute selector matches two
    // elements and Playwright's strict mode refuses it. The tag qualifier picks
    // the desktop row this test drives.
    const row = page.locator(`tr[data-record-id="${AI_REVIEW_DRAFT.id}"]`);
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

    // --- SIGN-CONFIRM-AND-SAVE-FIRST: a second edit, typed and NOT saved. ---
    const unsaved = "Revisto: observacao escrita e nao guardada.";
    await observacoes.fill(unsaved);

    // --- Finalizar opens a confirmation; Cancelar changes nothing. ---
    await signButton(page, FINALIZE_LABEL).click();
    const dialog = signDialog(page, FINALIZE_LABEL);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("bloqueada de forma permanente e não poderá ser alterada");
    await expect(dialog.getByTestId("sign-saves-first")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/clinical\/review\/[0-9a-f-]{36}$/);
    await expect(observacoes).toHaveValue(unsaved);
    await expect(observacoes).toBeEditable();

    // --- Finalizar again, confirmed: the unsaved edit is SAVED FIRST, then the
    //     record is signed + approved (record_status → signed, ai_review_state →
    //     approved). It redirects to the normal clinical viewer. ---
    await signButton(page, FINALIZE_LABEL).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: FINALIZE_LABEL, exact: true }).click();
    await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}(\?.*)?$/, { timeout: 15_000 });
    // record_status axis: the finalized record is Assinada + immutable (no sign
    // action, form read-only). Immutability guardrail.
    await expect(page.getByText("Assinada").first()).toBeVisible({ timeout: 10_000 });
    await expect(signButton(page, SIGN_LABEL)).toHaveCount(0);
    // The edited AI value persisted through claim → save → finalize...
    await expect(page.getByText(edited, { exact: false }).first()).toBeVisible();
    // ...and so did the edit that was never saved by hand: Finalizar saved it
    // first. Read from a fresh load, so it is the stored record, not the form.
    await page.goto(`/clinical/${AI_REVIEW_DRAFT.id}`);
    await expect(
      page.locator("#record-form").getByLabel(/^Observações$/i).first(),
    ).toHaveValue(unsaved);

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
