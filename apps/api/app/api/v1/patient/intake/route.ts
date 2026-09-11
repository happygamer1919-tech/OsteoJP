import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { readOwnGuestIntakes } from "@/lib/guest-intake/patient-read";

// GET /api/v1/patient/intake - INTAKE-01. The authenticated patient's OWN
// clinical intake answers, sent with a guest booking request that reception has
// converted to them. READ ONLY: this route exports GET and nothing else.
//
// Self-scope only: the patient principal comes from a VERIFIED token
// (getPatientPrincipal), the read runs under the patient role with that
// principal's claims (RLS, 0087's patient arm) plus an explicit filter. Fail
// closed: anything that is not a patient is a 401.
//
// { enabled: false } means migration 0087 is not applied on this database; the
// portal then shows nothing at all for it.
//
// ARTICLE 9. The body carries health answers, so it is never cached and a failed
// read logs a fixed line with no error text: a query error can carry parameters.

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // per-patient; never cache.

export async function GET(): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await readOwnGuestIntakes(principal);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[patient-intake] read failed; nothing was returned.");
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
}
