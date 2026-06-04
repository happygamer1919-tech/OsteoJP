import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { listOwnFichas } from "@/lib/fichas/read";

// GET /api/v1/me/fichas — the patient's OWN finalized clinical records (fichas),
// read-only and REDACTED.
//
// Three guards, defense in depth:
//   * principal — derived server-side from the verified token; fail-closed 401.
//   * self-scope — listOwnFichas runs as the `patient` role, so RLS confines
//     rows to this patient (never another patient, never cross-tenant).
//   * redaction — only finalized records, and only an allow-list of fields;
//     therapist-private content (e.g. data.private_notes) is never serialized.

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // per-session; never cache.

export async function GET(): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const fichas = await listOwnFichas(principal);
  return NextResponse.json({ fichas });
}
