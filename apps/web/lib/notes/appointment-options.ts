"use server";

import { requireRequestContext } from "@/lib/auth/context";
import { listPatientAppointments } from "@/lib/scheduling/data";

/**
 * W12-13 (notes unification R6) — the appointment options for the dashboard
 * Notas Rápidas AppointmentSelector: a chosen patient's appointments as
 * `{ id, label }`, most-recent first. Read-only; tenant + role scoped by
 * `listPatientAppointments` (appointments:read). The label is a Europe/Lisbon
 * date + time + service/location so staff can pick the right visit.
 *
 * Kept in its OWN "use server" module (not scheduling/actions.ts) so pulling the
 * agenda read layer — which evaluates `unstable_cache` at import — does not leak
 * into the scheduling-action unit tests that partially mock `next/cache`.
 */
export async function listPatientAppointmentsForNoteAction(
  patientId: string,
): Promise<{ id: string; label: string }[]> {
  const ctx = await requireRequestContext();
  if (!patientId) return [];
  const appts = await listPatientAppointments(ctx, patientId);
  const fmt = new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  });
  return appts.map((a) => {
    const when = fmt.format(new Date(a.startsAt));
    const what = a.serviceName ?? a.locationName;
    return { id: a.id, label: what ? `${when} · ${what}` : when };
  });
}
