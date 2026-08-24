"use server";

import { randomUUID } from "node:crypto";
import { can, toClaims } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { generateDeclaracaoPdf } from "@/lib/clinical/declaracao/generate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPatient } from "@/lib/patients/queries";
import { updatePatient } from "@/lib/patients/actions";
import { shouldPersistCapturedValue } from "@/lib/patients/known-field";
import { documentGenerationAllowed } from "@/lib/clinical/document-rate-limit";
import { ATTACHMENTS_BUCKET } from "@/lib/clinical/storage";

// W5-31 — generate the Declaração de Presença PDF for a patient and hand back a
// short-lived SIGNED download URL. Mirrors generateRgpdFormUrlAction: tenant-
// scoped read (RLS), tenant-prefixed Storage path, 60s signed URL, bytes never
// proxied through Next, error-silent (never leak PII). No schema change, nothing
// persisted beyond the transient PDF object.

export type DeclaracaoRequest = {
  patientId: string;
  date: string; // YYYY-MM-DD (Europe/Lisbon)
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  locationId?: string | null;
  nif?: string | null; // W12-24 - editable NIF, prefilled from patients.nif
  observacoes?: string | null; // PL-03a - optional free text, transient
};

export async function generateDeclaracaoUrlAction(
  input: DeclaracaoRequest,
): Promise<{ url: string | null }> {
  const ctx = await requireRequestContext();
  // Any staff who can view a patient may print an attendance declaration
  // (reception front-desk task). Reception has patients:read.
  if (!can(ctx.role, "patients:read")) return { url: null };
  if (!input.patientId || !input.date || !input.startTime || !input.endTime) {
    return { url: null };
  }

  // ROUTE 6. AFTER the capability and shape checks, BEFORE the render. This is
  // the widest of the three - it is gated on `patients:read`, so RECEPTION can
  // reach it, not only clinical readers.
  if (!(await documentGenerationAllowed(ctx.userId))) {
    return { url: null };
  }

  try {
    const pdf = await generateDeclaracaoPdf(toClaims(ctx), input);

    // PL-20: a NIF captured on a document that the PATIENT RECORD did not have
    // is written back, so the next document does not ask for it a third time.
    //
    // Re-decided HERE from the stored row, never from what the client believed:
    // the dialog's "known" state is a rendering hint, and a stale page must not
    // be able to talk the server into an overwrite. shouldPersistCapturedValue
    // fills an EMPTY field only - a one-off NIF typed over a stored one (the
    // "Alterar" path) is used for this PDF and forgotten, so a correction on a
    // single declaration never rewrites the patient's fiscal number.
    //
    // Deliberately after the PDF is generated and deliberately swallowed: the
    // document is what the user asked for, and a failed convenience write must
    // never cost them the declaration.
    if (can(ctx.role, "patients:write") && knownFieldCandidate(input.nif)) {
      try {
        const patient = await getPatient(input.patientId);
        if (patient && shouldPersistCapturedValue(patient.nif, input.nif)) {
          await updatePatient(input.patientId, { nif: input.nif });
        }
      } catch {
        // Non-fatal by design - see above.
      }
    }

    const path = `${ctx.tenantId}/declaracoes/${input.patientId}/${randomUUID()}.pdf`;
    const admin = createSupabaseAdminClient();
    const up = await admin.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, pdf.bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) return { url: null };

    // W9-03 (CB QA item 2): NO `download` option, so Supabase Storage serves the
    // object `Content-Disposition: inline` and the tab the client already opens
    // (`window.open`, DeclaracaoDialog.tsx) PREVIEWS the PDF instead of firing a
    // download. Passing `{ download: pdf.filename }` here forced
    // `Content-Disposition: attachment`, which overrides anything the client
    // does - that is why the document downloaded on BOTH paths, including the
    // "Introdução manual" one. The user can still save from the viewer.
    // Storage write above is untouched: same bytes, same path, same upload.
    const signed = await admin.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(path, 60);
    if (signed.error || !signed.data) return { url: null };
    return { url: signed.data.signedUrl };
  } catch {
    return { url: null };
  }
}

/** Cheap pre-check so the common case (no NIF typed) costs no patient read. */
function knownFieldCandidate(v: string | null | undefined): boolean {
  return (v ?? "").trim().length > 0;
}
