import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOwnDocumentLocation } from "./documents";
import type { PatientPrincipal } from "@/lib/auth/patient";

// Patient-portal document DOWNLOAD — mirrors the #128 clinical-report pattern:
// the bytes are NEVER proxied through the app; instead we hand back a short-lived
// Supabase SIGNED URL (opaque token + expiry). The URL carries no PII and no
// fiscal data — only the storage object token.
//
// Ownership is resolved under self-scope first (getOwnDocumentLocation: RLS +
// explicit principal guard); only then does the service-role admin client sign
// the already-verified path. The admin client BYPASSES RLS, so signing MUST come
// after the self-scoped ownership check — never before.

/** Documents live in the same private bucket as staff-uploaded attachments. */
export const PATIENT_DOCUMENTS_BUCKET = "clinical-attachments";

/** Signed-URL lifetime: long enough to redirect-and-fetch, short enough to leak nothing. */
export const SIGNED_URL_TTL_SECONDS = 60;

/** uuid v4-ish shape — reject a malformed document id before it hits the DB. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Resolve a short-lived signed download URL for one of the patient's OWN
 * documents, or null if the id is malformed, not theirs, or unsignable. The
 * document id is the only input; the patient is the verified principal.
 */
export async function createOwnDocumentDownloadUrl(
  principal: PatientPrincipal,
  documentId: string,
): Promise<{ url: string } | null> {
  if (!isUuid(documentId)) return null;

  const location = await getOwnDocumentLocation(principal, documentId);
  if (!location) return null;

  // Defense in depth: the stored path must sit under THIS tenant's prefix. A row
  // that somehow carried a foreign path is refused rather than signed.
  if (!location.storagePath.startsWith(`${principal.tenantId}/`)) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(PATIENT_DOCUMENTS_BUCKET)
    .createSignedUrl(location.storagePath, SIGNED_URL_TTL_SECONDS, {
      download: location.fileName,
    });
  if (error || !data) return null;
  return { url: data.signedUrl };
}
