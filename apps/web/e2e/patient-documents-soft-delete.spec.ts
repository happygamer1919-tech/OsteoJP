/**
 * patient-documents-soft-delete.spec.ts — SR-62 PU-4, GATE PU-4.
 *
 * "A deleted document is gone from the patient's Documentos tab, still present
 * in storage, and has an audit row naming actor, reason and timestamp."
 *
 * Every clause is asserted against the thing that holds it, not against the
 * screen alone:
 *   - gone from the tab     -> the row is absent after a fresh server read;
 *   - still in storage      -> the object downloads through the service client;
 *   - actor                 -> audit_log.actor_user_id AND deleted_by_user_id are
 *                              the seeded admin's users.id;
 *   - reason                -> attachments.delete_reason (it is NEVER in
 *                              audit_log, whose metadata is ids only);
 *   - timestamp             -> audit_log.created_at inside this run, and equal to
 *                              deleted_at (both are now() in one transaction).
 *
 * The dialog's gate is driven too: the confirm button stays disabled for an
 * empty and a whitespace-only reason.
 *
 * Runs as admin (patients:write) on a FRESH synthetic patient and a document
 * this spec creates, so nothing another spec writes can be deleted here. The
 * e2e seed does not provision the `clinical-attachments` bucket (see
 * camera-to-ficha.spec.ts), so this spec creates it when missing. No day offset.
 *
 * REQUIRES packages/db/migrations/0089_attachments_soft_delete.sql to be
 * APPLIED to the lane database. Before that, the tab's read names a column that
 * does not exist and this spec fails at the first page load.
 */
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPatient } from "./helpers";
import { serviceClient } from "./helpers/confirm-code";
import { TENANT_A, USERS } from "./fixtures";

const BUCKET = "clinical-attachments";
const uniq = () => Math.random().toString(36).slice(2, 8);

test("Documentos Eliminar: a reason is required, the document leaves the tab, the file stays, the trail is written", async ({
  page,
}) => {
  const db = serviceClient();

  /* ---- the bucket the seed does not create ---- */
  const { data: bucket } = await db.storage.getBucket(BUCKET);
  if (!bucket) {
    const { error } = await db.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`could not create the ${BUCKET} bucket: ${error.message}`);
    }
  }

  /* ---- the actor we expect: the seeded admin's users.id ---- */
  const { data: adminRows, error: adminError } = await db
    .from("users")
    .select("id")
    .eq("tenant_id", TENANT_A)
    .eq("email", USERS.admin)
    .limit(1);
  if (adminError) throw new Error(`admin lookup failed: ${adminError.message}`);
  const adminId = adminRows?.[0]?.id as string | undefined;
  if (!adminId) throw new Error(`${USERS.admin} has no users row in TENANT_A. Run the e2e seed.`);

  /* ---- a fresh patient with one real document: object + row ---- */
  const patientId = await createPatient(page, { fullName: `Documento Eliminar ${uniq()}` });
  const fileName = `e2e-soft-delete-${uniq()}.pdf`;
  const storagePath = `${TENANT_A}/patient-documents/${patientId}/${randomUUID()}__${fileName}`;
  const bytes = Buffer.from("%PDF-1.4\n% SR-62 PU-4 e2e soft delete\n%%EOF\n");
  const upload = await db.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error) throw new Error(`storage upload failed: ${upload.error.message}`);

  const { data: inserted, error: insertError } = await db
    .from("attachments")
    .insert({
      tenant_id: TENANT_A,
      patient_id: patientId,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: "application/pdf",
      size_bytes: bytes.length,
      uploaded_by: adminId,
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new Error(`attachment insert failed: ${insertError?.message}`);
  const documentId = inserted.id as string;

  const reason = `Carregado no paciente errado ${uniq()}`;
  // Clock slack for the Node host vs the database container. Stated, not hidden.
  const SLACK_MS = 30_000;
  const startedAt = Date.now();

  /* ---- the tab lists it ---- */
  await page.goto(`/patients/${patientId}?tab=documentos`);
  const row = page.locator(`[data-document-id="${documentId}"]`);
  await expect(row).toContainText(fileName, { timeout: 12_000 });

  /* ---- ANEXO-PREVIEW, THE POSITIVE CONTROL: a LIVE document previews ----
   * A SECOND TAB, opened now and deliberately left STALE. It is the same actor,
   * the same patient, the same document and the same button as the refusal arm
   * further down: the only thing that changes between them is `deleted_at`. It is
   * also the real case, two people at reception with the same ficha open.
   *
   * THE ASSERTION IS THE SIGNED URL AND WHAT IT SERVES, NOT WHAT THE <object>
   * PAINTS. Headless Chromium has no PDF viewer, so the <object> falls back to
   * its child, which is the SAME sentence the refusal shows. So the control reads
   * the `data` attribute, fetches it, and requires the bytes that were uploaded;
   * and "refused" below means role="alert", which the fallback does not carry. */
  const PREVIEW_REFUSED = "Não foi possível pré-visualizar este documento. Utilize Abrir.";
  const stale = await page.context().newPage();
  await stale.goto(`/patients/${patientId}?tab=documentos`);
  const staleRow = stale.locator(`[data-document-id="${documentId}"]`);
  await expect(staleRow).toContainText(fileName, { timeout: 12_000 });
  await staleRow.getByRole("button", { name: "Pré-visualizar", exact: true }).click();
  const panel = staleRow.locator('object[type="application/pdf"]');
  await expect(panel).toHaveCount(1, { timeout: 12_000 });
  await expect(panel).toHaveAttribute("aria-label", fileName);
  const signedUrl = await panel.getAttribute("data");
  expect(signedUrl, "the preview panel carries no signed URL").toMatch(/\/object\/sign\/.+token=/);
  const served = await stale.request.get(signedUrl!);
  expect(served.status(), "the signed preview URL does not serve the live document").toBe(200);
  expect((await served.body()).length).toBe(bytes.length);
  await expect(stale.getByRole("alert").filter({ hasText: PREVIEW_REFUSED })).toHaveCount(0);
  await staleRow.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(panel).toHaveCount(0);

  /* ---- the dialog: no reason, no confirm ---- */
  await row.getByRole("button", { name: "Eliminar", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Eliminar documento" });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Eliminar documento", exact: true });
  const reasonBox = dialog.getByTestId("document-delete-reason");
  await expect(confirm).toBeDisabled();
  await reasonBox.fill("    ");
  await expect(confirm).toBeDisabled();
  await reasonBox.fill(reason);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  /* ---- ANEXO-PREVIEW, THE REFUSAL: the STALE tab asks for the same preview ----
   * Its row is still on screen, because nothing told that tab the document is
   * gone. The click goes through the real server action, which must find no live
   * row: no panel, no signed URL, and the refusal as an alert. Proven against the
   * control above, same run: that button DID open this document a moment ago. */
  await staleRow.getByRole("button", { name: "Pré-visualizar", exact: true }).click();
  await expect(stale.getByRole("alert").filter({ hasText: PREVIEW_REFUSED })).toBeVisible({
    timeout: 12_000,
  });
  await expect(stale.locator('object[type="application/pdf"]')).toHaveCount(0);
  await expect(stale.locator(`img[alt="${fileName}"]`)).toHaveCount(0);
  await stale.close();

  /* ---- GATE: gone from the tab, on a fresh read from the server ---- */
  await page.goto(`/patients/${patientId}?tab=documentos`);
  await expect(page.getByText("Ainda não existem documentos para este paciente.")).toBeVisible({
    timeout: 12_000,
  });
  await expect(page.locator(`[data-document-id="${documentId}"]`)).toHaveCount(0);

  /* ---- GATE: still in storage ---- */
  const download = await db.storage.from(BUCKET).download(storagePath);
  expect(download.error).toBeNull();
  expect(download.data?.size).toBe(bytes.length);

  /* ---- GATE: the row is kept, with who and why ---- */
  const { data: kept, error: keptError } = await db
    .from("attachments")
    .select("deleted_at, deleted_by_user_id, delete_reason")
    .eq("id", documentId);
  if (keptError) throw new Error(`attachment read failed: ${keptError.message}`);
  expect(kept).toHaveLength(1);
  const keptRow = kept![0] as { deleted_at: string | null; deleted_by_user_id: string; delete_reason: string };
  expect(keptRow.deleted_at).not.toBeNull();
  expect(keptRow.deleted_by_user_id).toBe(adminId);
  expect(keptRow.delete_reason).toBe(reason);

  /* ---- GATE: one audit row naming actor and timestamp; the reason is not in it ---- */
  const { data: audit, error: auditError } = await db
    .from("audit_log")
    .select("actor_user_id, created_at, entity_type, metadata")
    .eq("tenant_id", TENANT_A)
    .eq("entity_id", documentId)
    .eq("action", "patient_document.soft_delete");
  if (auditError) throw new Error(`audit read failed: ${auditError.message}`);
  expect(audit).toHaveLength(1);
  const entry = audit![0] as {
    actor_user_id: string;
    created_at: string;
    entity_type: string;
    metadata: Record<string, unknown>;
  };
  expect(entry.actor_user_id).toBe(adminId);
  expect(entry.entity_type).toBe("attachment");
  expect(entry.metadata).toEqual({ hadReason: true, patientId });
  expect(JSON.stringify(entry)).not.toContain(reason);
  const at = new Date(entry.created_at).getTime();
  expect(at).toBeGreaterThanOrEqual(startedAt - SLACK_MS);
  expect(at).toBeLessThanOrEqual(Date.now() + SLACK_MS);
  // One transaction, one now(): the row's deleted_at IS the audit timestamp.
  expect(new Date(keptRow.deleted_at!).getTime()).toBe(at);
});
