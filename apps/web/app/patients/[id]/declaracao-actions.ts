"use server";

import { randomUUID } from "node:crypto";
import { can, toClaims } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { generateDeclaracaoPdf } from "@/lib/clinical/declaracao/generate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  try {
    const pdf = await generateDeclaracaoPdf(toClaims(ctx), input);

    const path = `${ctx.tenantId}/declaracoes/${input.patientId}/${randomUUID()}.pdf`;
    const admin = createSupabaseAdminClient();
    const up = await admin.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, pdf.bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) return { url: null };

    const signed = await admin.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(path, 60, { download: pdf.filename });
    if (signed.error || !signed.data) return { url: null };
    return { url: signed.data.signedUrl };
  } catch {
    return { url: null };
  }
}
