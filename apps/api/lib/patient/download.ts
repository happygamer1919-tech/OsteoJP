import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOwnDocumentLocation } from "./documents";
import { documentPreviewKind, type DocumentPreviewKind } from "./document-preview";
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

/**
 * The same thing, INLINE, so one of the patient's own documents can be rendered
 * in the page instead of landing in their downloads folder.
 *
 * IT WIDENS NOTHING, AND THE ORDER BELOW IS WHY. Ownership is resolved first, by
 * the same self-scoped read the download uses (RLS as the patient + an explicit
 * principal filter + a post-fetch re-check); only afterwards does the
 * service-role client, which bypasses RLS, sign the path that read returned. The
 * caller supplies a document ID and never a path, the TTL is the same 60
 * seconds, and the bucket is the same private one.
 *
 * THE ONLY DIFFERENCE IS THE MISSING `download` OPTION. With it, Supabase serves
 * `Content-Disposition: attachment` and the browser saves the file; without it
 * the object is served inline and can be rendered. That single line is the whole
 * feature, which is why the preview cannot be a broader hole than the download:
 * it is the same URL, disposed differently.
 *
 * It REFUSES a type no browser renders, before signing, so a Word document is
 * never handed to a panel that would quietly download it.
 */
export async function createOwnDocumentPreviewUrl(
  principal: PatientPrincipal,
  documentId: string,
): Promise<{ url: string; kind: DocumentPreviewKind } | null> {
  if (!isUuid(documentId)) return null;

  const location = await getOwnDocumentLocation(principal, documentId);
  if (!location) return null;

  // Decided from the STORED type, never from the file name.
  const kind = documentPreviewKind(location.mimeType);
  if (!kind) return null;

  if (!location.storagePath.startsWith(`${principal.tenantId}/`)) return null;

  const admin = createSupabaseAdminClient();
  // No `download` option: inline, so the portal can render it in place.
  const { data, error } = await admin.storage
    .from(PATIENT_DOCUMENTS_BUCKET)
    .createSignedUrl(location.storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return { url: data.signedUrl, kind };
}
