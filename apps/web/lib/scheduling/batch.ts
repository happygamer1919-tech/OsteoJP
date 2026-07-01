import "server-only";
import { randomUUID } from "node:crypto";
import type { RequestContext } from "@osteojp/auth";
import { appointments } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { writeAppointmentAudit } from "./audit";
import { getTherapistAvailability } from "./day-availability";
import { expandRecurrence, toRRule, type RecurrenceSpec } from "./recurrence";
import type { TimeInterval } from "./intervals";
import type { AppointmentStatusValue } from "./types";
import {
  classifyBatchSlots,
  describeInstant,
  type BatchFailure,
  type BatchSlot,
} from "./batch-core";

/**
 * Batch scheduling engine (SPEC-appointments §4). Given a recurrence rule, it
 * resolves the candidate slots, checks each against getTherapistAvailability
 * (#396 — the SAME merged availability query the panel uses; this engine never
 * reimplements the working-minus-booked interval math), books the free ones
 * under a shared batch_id (0028), and returns a structured failure for each busy
 * slot: its date, hour, and the nearest free alternative drawn from the same
 * availability result. Partial success is expected behaviour, not an error.
 */

export type BatchScheduleInput = {
  patientId: string;
  practitionerId: string;
  locationId: string;
  serviceId?: string | null;
  /** First occurrence's Lisbon calendar date, "yyyy-mm-dd". */
  firstDate: string;
  /** Lisbon wall-clock start, "HH:MM". */
  hhmm: string;
  durationMin: number;
  recurrence: RecurrenceSpec;
  /** Lifecycle status for booked rows. Default "scheduled". */
  status?: AppointmentStatusValue;
};

export type BatchBooked = { appointmentId: string; startsAt: string; date: string; hhmm: string };
export type BatchScheduleResult = {
  batchId: string;
  requested: number;
  booked: BatchBooked[];
  failures: BatchFailure[];
};

/** Orchestrator: expand → check availability → book free → report failures. */
export async function batchSchedule(
  ctx: RequestContext,
  input: BatchScheduleInput,
): Promise<BatchScheduleResult> {
  const occ = expandRecurrence(input.firstDate, input.hhmm, input.durationMin, input.recurrence);
  const slots: BatchSlot[] = occ.map((o) => ({
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    ...describeInstant(o.startsAt),
  }));

  // Availability over the whole span (inclusive Lisbon date range).
  const dates = slots.map((s) => s.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const days = await getTherapistAvailability(ctx, {
    therapistId: input.practitionerId,
    from,
    to,
    locationId: input.locationId,
  });
  const freeByDate = new Map<string, TimeInterval[]>(
    days.map((d) => [
      d.date,
      d.free.map((iv) => ({ start: new Date(iv.start), end: new Date(iv.end) })),
    ]),
  );

  const { toBook, failures } = classifyBatchSlots(slots, freeByDate, input.durationMin);

  const batchId = randomUUID();
  const rrule = toRRule(input.recurrence);
  const status: AppointmentStatusValue = input.status ?? "scheduled";
  let booked: BatchBooked[] = [];

  if (toBook.length > 0) {
    booked = await runScoped(ctx, async (tx) => {
      const rows = await tx
        .insert(appointments)
        .values(
          toBook.map((s) => ({
            tenantId: ctx.tenantId, // NOT NULL + RLS WITH CHECK
            patientId: input.patientId,
            practitionerId: input.practitionerId,
            locationId: input.locationId,
            serviceId: input.serviceId ?? null,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            status,
            batchId,
            recurrenceRule: rrule, // documents the batch rule (existing storage)
            createdBy: ctx.userId,
          })),
        )
        .returning({ id: appointments.id });

      const out: BatchBooked[] = rows.map((r, i) => ({
        appointmentId: r.id,
        startsAt: toBook[i].startsAt.toISOString(),
        date: toBook[i].date,
        hhmm: toBook[i].hhmm,
      }));

      // Rule 6: audit every appointment creation.
      for (const b of out) {
        await writeAppointmentAudit(tx, {
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          action: "appointment.create",
          appointmentId: b.appointmentId,
          metadata: {
            patientId: input.patientId,
            practitionerId: input.practitionerId,
            locationId: input.locationId,
            serviceId: input.serviceId ?? null,
            status,
            startsAt: b.startsAt,
            batchId,
          },
          ip: null,
        });
      }
      return out;
    });
  }

  return { batchId, requested: slots.length, booked, failures };
}
