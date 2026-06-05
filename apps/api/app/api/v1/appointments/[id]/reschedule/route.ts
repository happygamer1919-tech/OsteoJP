import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { parseRescheduleInput, rescheduleAppointment } from "@/lib/appointments/booking";
import { drizzleAppointmentsStore } from "@/lib/appointments/store";
import { errorResponse, unauthorized } from "@/lib/appointments/http";

// POST /api/v1/appointments/[id]/reschedule — move an OWN appointment.
// 24h cutoff (on the CURRENT start) is enforced server-side; inside it the
// request is rejected regardless of client state. The new window preserves the
// original duration and RE-RUNS conflict detection for the assigned therapist.
// Never touches invoicing.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const principal = await getPatientPrincipal();
  if (!principal) return unauthorized();
  try {
    const { id } = await ctx.params;
    const raw: unknown = await req.json().catch(() => null);
    const input = parseRescheduleInput(raw); // reads only the new startsAt
    const appointment = await rescheduleAppointment(
      principal,
      id,
      input,
      drizzleAppointmentsStore,
      new Date(),
    );
    return NextResponse.json({ appointment });
  } catch (e) {
    return errorResponse(e);
  }
}
