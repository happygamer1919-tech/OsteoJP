import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { listBookableTherapists } from "@/lib/appointments/booking";
import { drizzleAppointmentsStore } from "@/lib/appointments/store";
import { AppointmentError } from "@/lib/appointments/errors";
import { errorResponse, unauthorized } from "@/lib/appointments/http";

// GET /api/v1/booking/therapists?serviceId=&locationId= — the ROSTER for the
// portal's therapist step (A2).
//
// WHAT THIS IS NOT: an availability query. It answers "who could see this
// patient at this clinic at all", because the therapist step runs BEFORE the
// patient picks a date and there is no window to check against. Free/busy is
// decided afterwards by /booking/slots, which is unchanged and remains the
// step-4 source of truth.
//
// FILTERED ON is_bookable (PL-06b). Never on a title and never on a role
// slug: a role predicate once dropped JP from the staff dropdown as a live
// defect, and D2 (f821eac) brought the portal's other predicates onto this same
// flag after a booking was auto-assigned to an administrator.
//
// AND ON THE SERVICE MAPPING, by owner ruling Q-M (2026-10-20): a therapist is
// listed only for a service they are mapped to in `therapist_services`, and a
// therapist with no mapped service is not listed at all. Q-M supersedes PL-06a
// ("the mapping is a PRESELECTION, NEVER A RESTRICTION") for the patient-facing
// surfaces ONLY; the staff agenda keeps PL-06a. `serviceId` resolves the service
// AND narrows the roster.
//
// PAYLOAD IS ID AND NAME ONLY. No title, no role, no schedule — none of it is
// the patient's business and none of it is a filter here.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) return unauthorized();
  try {
    const url = new URL(req.url);
    const serviceId = url.searchParams.get("serviceId") ?? "";
    const locationId = url.searchParams.get("locationId") ?? "";
    if (!UUID_RE.test(serviceId) || !UUID_RE.test(locationId)) {
      throw new AppointmentError("invalid_input");
    }
    const therapists = await listBookableTherapists(
      principal,
      { serviceId, locationId },
      drizzleAppointmentsStore,
    );
    return NextResponse.json({ therapists });
  } catch (e) {
    return errorResponse(e);
  }
}
