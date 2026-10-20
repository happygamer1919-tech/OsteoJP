import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { listOpenSlots } from "@/lib/appointments/booking";
import { drizzleAppointmentsStore } from "@/lib/appointments/store";
import { AppointmentError } from "@/lib/appointments/errors";
import { errorResponse, unauthorized } from "@/lib/appointments/http";

// GET /api/v1/booking/slots?serviceId=&locationId=[&practitionerId=] — the
// bookable slot starts
// (UTC ISO, ascending, 14-day horizon) for a service at a location.
//
// This is the portal step-3 SOURCE OF TRUTH: slots are expanded from active
// therapists' availability templates (Europe/Lisbon wall-clock, in Postgres)
// and filtered by the SAME conflict predicates the booking guard re-runs at
// confirm. The portal must never fabricate slots client-side — a slot listed
// here can only fail at confirm through a genuine booking race.

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
    // A2: OPTIONAL therapist filter. Absent means every bookable therapist, which
    // is the pre-A2 behaviour. Present must be a UUID; whether it names a
    // BOOKABLE therapist is decided by the query's own is_bookable predicates,
    // so a well-formed id for a non-bookable user simply yields no slots - it
    // cannot widen the result.
    const practitionerRaw = url.searchParams.get("practitionerId");
    if (practitionerRaw !== null && !UUID_RE.test(practitionerRaw)) {
      throw new AppointmentError("invalid_input");
    }
    const slots = await listOpenSlots(
      principal,
      { serviceId, locationId, practitionerId: practitionerRaw },
      drizzleAppointmentsStore,
      new Date(),
    );
    return NextResponse.json({ slots });
  } catch (e) {
    return errorResponse(e);
  }
}
