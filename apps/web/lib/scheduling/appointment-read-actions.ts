"use server";

import { assertCan, ForbiddenError } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { getAppointment } from "./data";
import type { ActionResult, AgendaAppointment } from "./types";

/**
 * PL-17 — read ONE marcação for a client surface that holds only its id.
 *
 * Owner CR 2026-07-30: a note in the patient's Notas tab must say which marcação
 * it documents AND be able to open it, and that tab holds note rows, not
 * appointment rows. `appointments:read` + RLS (getAppointment runs scoped), so
 * this grants no authority the agenda does not already have.
 *
 * Deliberately its OWN module rather than another export in ./actions: that file
 * is imported by tests that mock `next/cache` with only the exports it needs,
 * and pulling ./data (unstable_cache) into its module graph would break them for
 * no reason. One small "use server" file keeps the read where it belongs.
 */
export async function getAppointmentAction(
  appointmentId: string,
): Promise<ActionResult<AgendaAppointment>> {
  try {
    const actor = await requireRequestContext();
    assertCan(actor.role, "appointments:read");
    if (!appointmentId) return { ok: false, error: "validation" };
    const appt = await getAppointment(actor, appointmentId);
    if (!appt) return { ok: false, error: "not_found" };
    return { ok: true, data: appt };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    return { ok: false, error: "error" };
  }
}
