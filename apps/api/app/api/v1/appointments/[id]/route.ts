import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { getOwnAppointment } from "@/lib/appointments/booking";
import { drizzleAppointmentsStore } from "@/lib/appointments/store";
import { errorResponse, unauthorized } from "@/lib/appointments/http";

// GET /api/v1/appointments/[id] — one of the patient's OWN appointments.
// Self-scope: an id that isn't the patient's resolves to 404 (never another
// patient's row), enforced by RLS in the store.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) return unauthorized();
  try {
    const { id } = await ctx.params;
    const appointment = await getOwnAppointment(principal, id, drizzleAppointmentsStore);
    return NextResponse.json({ appointment });
  } catch (e) {
    return errorResponse(e);
  }
}
