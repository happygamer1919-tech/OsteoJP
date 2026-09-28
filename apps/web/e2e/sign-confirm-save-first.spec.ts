/**
 * sign-confirm-save-first.spec.ts: SIGN-CONFIRM-AND-SAVE-FIRST (owner: "fix
 * right away"; found by the guide writers).
 *
 * THE DEFECT. On a registo, "Assinar e bloquear" signed on ONE press, with no
 * confirmation, from a form of its own: RecordForm has no autosave, so anything
 * typed and not saved was left out of the signed registo, and a signed registo
 * is immutable (clinical_records_enforce_immutability). The edit was lost for
 * good. Revisao Consulta's "Finalizar (assinar e bloquear)" had the same shape;
 * revisao-consulta.spec.ts covers it on the one reviewable item the seed offers.
 *
 * WHAT THIS PROVES, as the seeded therapist, on fichas this spec creates itself
 * (so it consumes no seeded row and depends on no other spec's order):
 *   1. typed and not saved -> the press opens a dialog saying the ficha locks
 *      for good and that the edit is saved first; Cancelar changes nothing (a
 *      draft, the edit still in the form, nothing stored); confirming SAVES the
 *      text, THEN signs, and the locked registo shows it, read back from the
 *      database (a fresh load and the row itself, and the save's audit row
 *      precedes the sign's);
 *   2. a save that fails signs nothing: the reason shows in the dialog and the
 *      ficha is still a draft;
 *   3. a double click on confirm signs ONCE (one sign audit row);
 *   4. content saved elsewhere after the form loaded is refused, never signed
 *      unseen, and signs once the current version is loaded.
 *
 * The database reads use the lane's service-role client (helpers/confirm-code),
 * as patient-documents-soft-delete.spec.ts does for its audit row.
 */
import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PATIENTS, STORAGE, TEMPLATE_CURRENT_LABEL, TENANT_A } from "./fixtures";
import { serviceClient } from "./helpers/confirm-code";
import { SIGN_LABEL, signButton, signDialog } from "./helpers/sign-confirm";

const LOCKED_NOTICE = "Ficha finalizada e imutável.";

/** Create a fresh draft ficha for Maria Filia from the current template; returns its id. */
async function createDraftFicha(page: Page): Promise<string> {
  await page.goto("/clinical/new");
  const patient = page.getByRole("combobox", { name: /Paciente/i });
  await patient.click();
  await patient.fill(PATIENTS.maria.name);
  await page.getByRole("option", { name: PATIENTS.maria.name }).click();
  await page.getByLabel(/Modelo/i).selectOption({ label: TEMPLATE_CURRENT_LABEL });
  await page.getByRole("button", { name: "Criar ficha" }).click();
  await expect(page).toHaveURL(/\/clinical\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByText("Rascunho")).toBeVisible();
  return page.url().match(/clinical\/([0-9a-f-]{36})/)![1]!;
}

/** The record row as stored. */
async function storedRecord(
  db: SupabaseClient,
  id: string,
): Promise<{ status: string; data: Record<string, unknown> }> {
  const { data, error } = await db
    .from("clinical_records")
    .select("status, data")
    .eq("tenant_id", TENANT_A)
    .eq("id", id)
    .single();
  if (error) throw new Error(`clinical_records read failed: ${error.message}`);
  return data as { status: string; data: Record<string, unknown> };
}

/** This record's clinical audit actions, oldest first. */
async function auditActions(db: SupabaseClient, id: string): Promise<string[]> {
  const { data, error } = await db
    .from("audit_log")
    .select("action, created_at")
    .eq("tenant_id", TENANT_A)
    .eq("entity_type", "clinical_record")
    .eq("entity_id", id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`audit_log read failed: ${error.message}`);
  return (data ?? []).map((row) => (row as { action: string }).action);
}

test.describe("Assinar e bloquear: confirmation first, unsaved edits saved first (therapist)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("typed and not saved: Cancelar changes nothing; confirm saves the text, then signs", async ({
    page,
  }) => {
    const db = serviceClient();
    const id = await createDraftFicha(page);
    const motivos = page.locator("#record-form").getByLabel(/Motivos da Consulta/i);
    const typed = `Dor cervical, escrita e nao guardada ${Date.now()}`;
    await motivos.fill(typed);

    // --- First press: the dialog, and nothing else happens yet. ---
    await signButton(page).click();
    const dialog = signDialog(page);
    await expect(dialog).toBeVisible();
    // It names what happens: locked for good, cannot be changed afterwards...
    await expect(dialog).toContainText("bloqueada de forma permanente e não poderá ser alterada");
    // ...and, because the form holds an unsaved edit, that it is saved first.
    await expect(dialog.getByTestId("sign-saves-first")).toBeVisible();

    // --- Cancelar: a draft still, the edit still in the form, nothing stored. ---
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Rascunho")).toBeVisible();
    await expect(page.getByText(LOCKED_NOTICE, { exact: false })).toHaveCount(0);
    await expect(motivos).toHaveValue(typed);
    await expect(motivos).toBeEditable();
    const afterCancel = await storedRecord(db, id);
    expect(afterCancel.status).toBe("draft");
    expect(afterCancel.data["consultation_reason"]).toBeUndefined();

    // --- Press again and confirm: saved first, then signed. ---
    await signButton(page).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: SIGN_LABEL, exact: true }).click();
    await expect(page.getByText(LOCKED_NOTICE, { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`/clinical/${id}\\?m=signed$`));
    // The locked registo shows the typed text, in a read-only field.
    const lockedMotivos = page.locator("#record-form").getByLabel(/Motivos da Consulta/i);
    await expect(lockedMotivos).toHaveValue(typed);
    await expect(lockedMotivos).toBeDisabled();
    await expect(signButton(page)).toHaveCount(0);

    // --- From the database, not from the form's memory. ---
    await page.goto(`/clinical/${id}`);
    await expect(page.getByText(LOCKED_NOTICE, { exact: false })).toBeVisible();
    await expect(page.locator("#record-form").getByLabel(/Motivos da Consulta/i)).toHaveValue(typed);
    const signed = await storedRecord(db, id);
    expect(signed.status).toBe("signed");
    expect(signed.data["consultation_reason"]).toBe(typed);
    // The save wrote before the sign, and the sign wrote once.
    const actions = await auditActions(db, id);
    const saveAt = actions.indexOf("clinical_record.update");
    const signAt = actions.indexOf("clinical_record.sign");
    expect(saveAt).toBeGreaterThanOrEqual(0);
    expect(signAt).toBeGreaterThan(saveAt);
    expect(actions.filter((a) => a === "clinical_record.sign")).toHaveLength(1);
  });

  test("a save that fails signs nothing: the reason shows in the dialog, the ficha stays a draft", async ({
    page,
  }) => {
    const db = serviceClient();
    const id = await createDraftFicha(page);
    const form = page.locator("#record-form");
    // An edit that cannot be saved: Motivos da Consulta is required and left
    // empty, while another field is typed into.
    const observacoes = form.getByLabel(/^Observações$/i).first();
    const typed = "Observacao sem motivo da consulta.";
    await observacoes.fill(typed);

    await signButton(page).click();
    const dialog = signDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: SIGN_LABEL, exact: true }).click();

    const failure = dialog.getByTestId("sign-save-failed");
    await expect(failure).toBeVisible({ timeout: 15_000 });
    await expect(failure).toContainText("não foi assinada");
    await expect(failure).toContainText("Verifique os campos obrigatórios.");

    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Rascunho")).toBeVisible();
    await expect(observacoes).toHaveValue(typed);
    const stored = await storedRecord(db, id);
    expect(stored.status).toBe("draft");
    expect(await auditActions(db, id)).not.toContain("clinical_record.sign");
  });

  test("a double click on confirm signs once", async ({ page }) => {
    const db = serviceClient();
    const id = await createDraftFicha(page);

    await signButton(page).click();
    const dialog = signDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: SIGN_LABEL, exact: true }).dblclick();

    await expect(page.getByText(LOCKED_NOTICE, { exact: false })).toBeVisible({ timeout: 15_000 });
    // Give a second request, if one was sent, the chance to land before the
    // count: it would have been refused and redirected here with an error.
    // Best effort and bounded (the shell may keep polling); the audit count
    // below is the assertion.
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await expect(page).toHaveURL(new RegExp(`/clinical/${id}\\?m=signed$`));
    await expect(page.getByText("Ficha já finalizada; não pode ser alterada.")).toHaveCount(0);
    await expect(page.getByText("A ficha foi alterada entretanto.", { exact: false })).toHaveCount(0);
    expect((await auditActions(db, id)).filter((a) => a === "clinical_record.sign")).toHaveLength(1);
  });

  test("content saved elsewhere after the form loaded is refused, not signed unseen", async ({
    page,
  }) => {
    const db = serviceClient();
    const id = await createDraftFicha(page);

    // Another session saves the draft while this page is open.
    const elsewhere = "Motivo gravado noutra sessao.";
    const { error } = await db
      .from("clinical_records")
      .update({ data: { consultation_reason: elsewhere } })
      .eq("tenant_id", TENANT_A)
      .eq("id", id)
      .eq("status", "draft");
    if (error) throw new Error(`clinical_records update failed: ${error.message}`);

    // This page's form has no edit of its own, so it signs directly, naming
    // the content it loaded: refused.
    await signButton(page).click();
    const dialog = signDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("sign-saves-first")).toHaveCount(0);
    await dialog.getByRole("button", { name: SIGN_LABEL, exact: true }).click();
    await expect(page.getByText("A ficha foi alterada entretanto.", { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(new RegExp(`/clinical/${id}\\?m=err:stale$`));
    expect((await storedRecord(db, id)).status).toBe("draft");
    expect(await auditActions(db, id)).not.toContain("clinical_record.sign");

    // Loaded again, the current version is on screen and signs.
    await page.goto(`/clinical/${id}`);
    const motivos = page.locator("#record-form").getByLabel(/Motivos da Consulta/i);
    await expect(motivos).toHaveValue(elsewhere);
    await signButton(page).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: SIGN_LABEL, exact: true }).click();
    await expect(page.getByText(LOCKED_NOTICE, { exact: false })).toBeVisible({ timeout: 15_000 });
    const signed = await storedRecord(db, id);
    expect(signed.status).toBe("signed");
    expect(signed.data["consultation_reason"]).toBe(elsewhere);
  });
});
