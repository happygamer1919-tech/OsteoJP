"use server";

import { inArray } from "drizzle-orm";
import { can } from "@osteojp/auth";
import { appointments } from "@osteojp/db";
import { getRequestContext, runScoped } from "@/lib/auth/context";
import { BULK_MAX_ROWS, BULK_ROLES } from "./bulk-reschedule-core";
import { listPatientAppointments } from "./data";
import type { ActionResult, AgendaAppointment } from "./types";

/** One visit the bulk change can offer: the list row plus its lote. */
export type BulkCandidate = Pick<
  AgendaAppointment,
  | "id"
  | "startsAt"
  | "endsAt"
  | "status"
  | "practitionerId"
  | "practitionerName"
  | "locationId"
  | "locationName"
  | "serviceName"
> & { batchId: string | null };

/**
 * APPT-BULK-01 - the visits "Alterar várias marcações" lists: this patient's,
 * starting from now, Agendada or Confirmada, oldest first, at most
 * BULK_MAX_ROWS plus one (so the dialog can say there are more than it can
 * change at once).
 *
 * The rows come from `listPatientAppointments`, the read the Marcações tab
 * itself makes (appointments:read and RLS, so nothing the viewer cannot read
 * is listed). The lote (`batch_id`) is read beside it, for the "same lote"
 * filter; it is not on the list's row type, and adding it there would widen
 * every appointment read for one dialog.
 *
 * Its OWN module rather than another export in ./actions, for the reason
 * appointment-read-actions.ts gives: ./data wraps a read in the framework
 * cache at import, and ./actions is imported by tests that mock next/cache.
 *
 * The same role gate as the bulk action: owner, admin, reception.
 */
export async function listBulkRescheduleCandidatesAction(
  patientId: string,
): Promise<ActionResult<BulkCandidate[]>> {
  // A result object for its own client, not a navigation: the context is
  // read with getRequestContext and a missing one is answered, as
  // lib/auth/guard-callsites.test.ts asks of a server action.
  const actor = await getRequestContext();
  if (!actor) return { ok: false, error: "unauthenticated" };
  if (!can(actor.role, "appointments:write") || !BULK_ROLES.has(actor.role)) {
    return { ok: false, error: "forbidden" };
  }
  if (!patientId) return { ok: false, error: "validation" };
  try {
    const rows = (
      await listPatientAppointments(actor, patientId, {
        fromUtc: new Date(),
        status: ["scheduled", "confirmed"],
        order: "oldest",
      })
    ).slice(0, BULK_MAX_ROWS + 1);
    const ids = rows.map((r) => r.id);
    const batches =
      ids.length === 0
        ? []
        : await runScoped(actor, (tx) =>
            tx
              .select({ id: appointments.id, batchId: appointments.batchId })
              .from(appointments)
              .where(inArray(appointments.id, ids)),
          );
    const batchOf = new Map(batches.map((b) => [b.id, b.batchId]));
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        status: r.status,
        practitionerId: r.practitionerId,
        practitionerName: r.practitionerName,
        locationId: r.locationId,
        locationName: r.locationName,
        serviceName: r.serviceName,
        batchId: batchOf.get(r.id) ?? null,
      })),
    };
  } catch (e) {
    console.error("scheduling: bulk candidates read failed", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "error" };
  }
}
