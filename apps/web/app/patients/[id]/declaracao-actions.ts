"use server";

import { randomUUID } from "node:crypto";
import { can } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import {
  declaracaoAvailability,
  generateDeclaracaoPdf,
} from "@/lib/clinical/declaracao/generate";
import { isClinicalError } from "@/lib/clinical/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPatient } from "@/lib/patients/queries";
import { updatePatient } from "@/lib/patients/actions";
import { shouldPersistCapturedValue } from "@/lib/patients/known-field";
import { documentGenerationAllowed } from "@/lib/clinical/document-rate-limit";
import { recordDeclaracaoExport } from "@/lib/clinical/export-audit";
import { ATTACHMENTS_BUCKET } from "@/lib/clinical/storage";

// W5-31 — generate the Declaração de Presença PDF for a patient and hand back a
// short-lived SIGNED download URL. Mirrors generateRgpdFormUrlAction: tenant-
// scoped read (RLS), tenant-prefixed Storage path, 60s signed URL, bytes never
// proxied through Next, error-silent (never leak PII). No schema change, nothing
// persisted beyond the transient PDF object.
//
// EXPORT-01: THE AUDIT ROW (`patient.export_pdf`, document `declaracao`: the
// patient and the location, ids only) is written after the file is stored and
// signed and before the URL is returned. If it cannot be written, the URL is
// not handed out, and the file just stored is removed, best effort (the order
// and its reasons: lib/clinical/export-audit.ts).

export type DeclaracaoRequest = {
  patientId: string;
  date: string; // YYYY-MM-DD (Europe/Lisbon)
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  // R45 - REQUIRED: the marcação's location, or the one chosen in the dialog
  // for a manual entry. Left optional in the type because the value comes from
  // the browser; a request without one is refused below as malformed.
  locationId?: string | null;
  nif?: string | null; // W12-24 - editable NIF, prefilled from patients.nif
  observacoes?: string | null; // PL-03a - optional free text, transient
};

/**
 * What the dialog gets back. `url` is the signed URL, or null when nothing was
 * produced. `refused` names the one failure the screen words differently:
 *
 * R45 (strategy, 2026-10-06): "no_stamp" - the location this declaration is for
 * has no carimbo asset, so it is not issued ("Never issue one without a
 * stamp"). The dialog shows `documents.declaracao.noStamp` for it; every other
 * failure keeps the generic message.
 */
export type DeclaracaoResult = { url: string | null; refused?: "no_stamp" };

export async function generateDeclaracaoUrlAction(
  input: DeclaracaoRequest,
): Promise<DeclaracaoResult> {
  const ctx = await requireRequestContext();
  // Any staff who can view a patient may print an attendance declaration
  // (reception front-desk task). Reception has patients:read.
  if (!can(ctx.role, "patients:read")) return { url: null };
  // R45: a declaration is made for a location that was GIVEN. A request with
  // none is malformed, like one with no date; there is no default location to
  // issue it for.
  if (
    !input.patientId ||
    !input.date ||
    !input.startTime ||
    !input.endTime ||
    typeof input.locationId !== "string" ||
    !input.locationId
  ) {
    return { url: null };
  }

  // R45: decided HERE, before the ceiling below. A location that is not an
  // active one this staff member may act in is malformed input as well, and a
  // location with no carimbo asset is refused by name. Neither request can
  // produce a document, and the ceiling's own rule is that such a request does
  // not spend the caller's allowance. A read that fails is not a refusal: it
  // takes the generic path, and still produces nothing.
  try {
    const availability = await declaracaoAvailability(ctx, input.locationId);
    if (availability === "invalid") return { url: null };
    if (availability === "no_stamp") return { url: null, refused: "no_stamp" };
  } catch {
    return { url: null };
  }

  // ROUTE 6. AFTER the capability and shape checks, BEFORE the render. This is
  // the widest of the three - it is gated on `patients:read`, so RECEPTION can
  // reach it, not only clinical readers.
  if (!(await documentGenerationAllowed(ctx.userId))) {
    return { url: null };
  }

  try {
    const pdf = await generateDeclaracaoPdf(ctx, input);

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
          // INC-nif-validationerror-at-the-desk: `updatePatient` now RETURNS a
          // refusal instead of throwing one, so a NIF typed on the declaration
          // that the server will not store arrives here as `ok: false` rather
          // than as an exception the catch below absorbed. The outcome is
          // unchanged and deliberately so - the document is what the user asked
          // for, and a failed convenience write must never cost them it - but
          // the result is now discarded EXPLICITLY rather than by a catch that
          // also covered the read.
          void (await updatePatient(input.patientId, { nif: input.nif }));
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

    try {
      await recordDeclaracaoExport(ctx, {
        patientId: input.patientId,
        locationId: input.locationId,
      });
    } catch {
      // No row, so no URL, and the file just stored will never be linked to:
      // it is removed. Best effort: the answer is the same either way.
      try {
        await admin.storage.from(ATTACHMENTS_BUCKET).remove([path]);
      } catch {
        // Nothing to add: the audit failure is what is logged below.
      }
      // The screen shows this like any other failure, so it is logged: the
      // document and the step, no id, no error object, no message text.
      console.error("[declaracao] the export failed at step: audit");
      return { url: null };
    }
    return { url: signed.data.signedUrl };
  } catch (e) {
    // R45: the generator refuses a location with no carimbo on its own, before
    // it renders. Reported as the same refusal as the check above. Its refusal
    // of a missing or unusable location is malformed input, the generic result.
    if (isClinicalError(e) && e.code === "no_stamp") return { url: null, refused: "no_stamp" };
    return { url: null };
  }
}

/** Cheap pre-check so the common case (no NIF typed) costs no patient read. */
function knownFieldCandidate(v: string | null | undefined): boolean {
  return (v ?? "").trim().length > 0;
}
