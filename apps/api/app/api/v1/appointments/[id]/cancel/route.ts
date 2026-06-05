import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { cancelAppointment } from "@/lib/appointments/booking";
import { drizzleAppointmentsStore } from "@/lib/appointments/store";
import { errorResponse, unauthorized } from "@/lib/appointments/http";

// POST /api/v1/appointments/[id]/cancel — cancel an OWN appointment.
// The 24h cutoff is enforced SERVER-SIDE from the stored startsAt + server clock;
// inside the window the request is rejected (409 cutoff) regardless of client
// state. Never touches invoicing.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) return unauthorized();
  try {
    const { id } = await ctx.params;
    await cancelAppointment(principal, id, drizzleAppointmentsStore, new Date());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
