import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";

// GET /api/v1/auth/session — the patient's own IDENTITY, resolved server-side
// from the verified principal. This is NOT a business endpoint (those are Wave
// B): it returns only who the caller is (their own patient_id + tenant_id), so
// the front end can confirm an active patient session. No patient data is read.
//
// Fail-closed: any non-patient (no session, staff token, malformed) → 401.

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // per-session; never cache.

export async function GET(): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Echo only the principal's OWN ids — derived from the token, never payload.
  return NextResponse.json({
    patientId: principal.patientId,
    tenantId: principal.tenantId,
  });
}
