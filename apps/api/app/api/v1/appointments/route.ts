import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import {
  bookAppointment,
  listOwnAppointments,
  parseBookingInput,
} from "@/lib/appointments/booking";
import { drizzleAppointmentsStore } from "@/lib/appointments/store";
import { errorResponse, unauthorized } from "@/lib/appointments/http";

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
