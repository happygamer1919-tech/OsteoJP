import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { createOwnDocumentPreviewUrl } from "@/lib/patient/download";

// GET /api/v1/patient/documents/[id]/preview — a short-lived INLINE signed URL
// for one of the patient's OWN documents, so the portal can render it in place.
//
// The sibling /download route returns the same URL with an attachment
// disposition. Everything else is identical, deliberately: same self-scope
// (ownership under RLS + an explicit principal guard BEFORE the service-role
// client signs), same 60s TTL, same private bucket, same fail-closed shape.
//
// A document that is not the caller's own, does not exist, has a malformed id,
// or carries a type no browser renders all return the SAME 404. The last of
// those is a refusal rather than an error: the portal falls back to the download
// button, which is what it offered before this route existed.

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
  const result = await createOwnDocumentPreviewUrl(principal, id);
  if (!result) {
    // Not theirs / not found / not previewable — never disclose which.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(result); // { url, kind }
}
