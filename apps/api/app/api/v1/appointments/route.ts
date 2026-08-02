import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import {
  bookAppointment,
  listOwnAppointments,
  parseBookingInput,
} from "@/lib/appointments/booking";
import { drizzleAppointmentsStore } from "@/lib/appointments/store";
import { errorResponse, unauthorized } from "@/lib/appointments/http";
import {
  RULES,
  checkRateLimit,
  clientKey,
  tooManyRequests,
} from "@/lib/rate-limit/limiter";

// /api/v1/appointments — the patient's OWN appointments.
//   GET  → list (self-scoped; the patient sees only their own).
//   POST → book a slot (service-assigned therapist, conflict-checked; no payment).
//
// patient_id is ALWAYS the verified principal's; the request body can never set
// it. Fail-closed: any non-patient → 401.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) return unauthorized();
  try {
    const appointments = await listOwnAppointments(principal, drizzleAppointmentsStore);
    return NextResponse.json({ appointments });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) return unauthorized();

  // Keyed on the verified patient, not the IP: a booking flood from one account
  // is the case that actually hurts the agenda, and it survives IP rotation.
  const verdict = checkRateLimit(
    clientKey(req, "booking", principal.patientId),
    RULES.booking,
  );
  if (!verdict.ok) return tooManyRequests(verdict);

  try {
    const raw: unknown = await req.json().catch(() => null);
    const input = parseBookingInput(raw); // reads only serviceId/locationId/startsAt
    const appointment = await bookAppointment(
      principal,
      input,
      drizzleAppointmentsStore,
      new Date(),
    );
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
