import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { listOwnDocuments } from "@/lib/patient/documents";

// GET /api/v1/patient/documents — the authenticated patient's OWN documents and
// declarations (display metadata only; the storage path is never exposed —
// downloads go through /documents/[id]/download).
//
// Self-scope only: list is RLS-self-scoped + explicitly filtered on the verified
// principal's patient_id. Fail-closed: any non-patient → 401.

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // per-patient; never cache.

export async function GET(): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const documents = await listOwnDocuments(principal);
  return NextResponse.json({ documents });
}
