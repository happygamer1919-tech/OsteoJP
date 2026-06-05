import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { createOwnDocumentDownloadUrl } from "@/lib/patient/download";

// GET /api/v1/patient/documents/[id]/download — a short-lived SIGNED URL for one
// of the patient's OWN documents. Mirrors the #128 clinical-report pattern: the
// bytes are not proxied through the app; the response is a Supabase signed URL
// (opaque token + expiry, no PII, no fiscal data).
//
// Self-scope only: ownership of [id] is resolved under RLS + an explicit
// principal guard BEFORE the service-role client signs the path. A document that
// is not the caller's own (another patient's, cross-tenant, or non-existent) is
// indistinguishable here — all return 404. Fail-closed: non-patient → 401.

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // signed, per-request; never cache.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await createOwnDocumentDownloadUrl(principal, id);
  if (!result) {
    // Not theirs / not found / malformed id — never disclose which.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(result); // { url }
}
