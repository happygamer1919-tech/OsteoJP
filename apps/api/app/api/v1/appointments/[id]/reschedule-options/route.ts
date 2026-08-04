import { NextResponse } from "next/server";
import { getPatientPrincipal } from "@/lib/auth/patient";
import { listRescheduleOptions } from "@/lib/appointments/booking";
import { drizzleAppointmentsStore } from "@/lib/appointments/store";
import { errorResponse, unauthorized } from "@/lib/appointments/http";

// GET /api/v1/appointments/[id]/reschedule-options — the slots this patient may
// move THIS appointment to.
//
// Takes the appointment id and nothing else. The service and location are
// resolved server-side from the stored row, so the portal never receives (and
// never needs) either identifier: AppointmentView stays at 8 keys and the
// exposure matrix is untouched. Data minimisation is a documented compliance
// property — see docs/rgpd-token-flow.md §9.
//
// Slots come from the same store call that backs GET /booking/slots, so there is
// no second slot implementation to drift (booking/slots/route.ts:14 stands: the
// portal must never fabricate slots client-side). The list is additionally
// filtered by the 24h minimum notice, and the reschedule ACTION re-enforces both
// that and the cutoff independently — this list is a courtesy, not the control.

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
    const slots = await listRescheduleOptions(
      principal,
      id,
      drizzleAppointmentsStore,
      new Date(),
    );
    return NextResponse.json({ slots });
  } catch (e) {
    return errorResponse(e);
  }
}
