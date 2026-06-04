import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { getOwnProfile } from "@/lib/patient/profile";

// GET /api/v1/patient/profile — the authenticated patient's OWN profile.
//
// Self-scope only: the patient_id is taken from the verified principal (never
// request payload), and the query is RLS-self-scoped + explicitly guarded on
// that id. Returns a portal whitelist (name, contacts, location) — no fiscal
// data (NIF) and no internal/clinical fields. Fail-closed: any non-patient → 401.

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // per-patient; never cache.

export async function GET(): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await getOwnProfile(principal);
  if (!profile) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ profile });
}
