import "server-only";
import { randomUUID } from "node:crypto";
import type { RequestContext } from "@osteojp/auth";
import { appointments, packBatchIsOverbooked } from "@osteojp/db";
import { bookPackSessionTx } from "@/lib/packs/instances";
import { runScoped } from "@/lib/auth/context";
import { writeAppointmentAudit } from "./audit";
import { getTherapistAvailability } from "./day-availability";
import { toRRule, type RecurrenceSpec } from "./recurrence";
import type { TimeInterval } from "./intervals";
import type { AppointmentStatusValue } from "./types";
import {
  classifyBatchSlots,
  isExplicitSlots,
  resolveBatchSlots,
  type BatchExplicitSlot,
  type BatchFailure,
} from "./batch-core";
import { acquireSlotLocksForMany } from "./slot-lock";

/**
 * Batch scheduling engine (SPEC-appointments §4). Given a recurrence rule, it
 * resolves the candidate slots, checks each against getTherapistAvailability
 * (#396 — the SAME merged availability query the panel uses; this engine never
 * reimplements the working-minus-booked interval math), books the free ones
 * under a shared batch_id (0028), and returns a structured failure for each busy
 * slot: its date, hour, and the nearest free alternative drawn from the same
 * availability result. Partial success is expected behaviour, not an error.
 */

type BatchCommonInput = {
  patientId: string;
  practitionerId: string;
  locationId: string;
  serviceId?: string | null;
  // No lifecycle `status` here by design (W3-01, creation invariant DECISIONS
  // 2026-07-01): batch booking is a creation path, so every booked row is
  // `scheduled`, hardcoded below — never from the caller.
};

/** Recurrence-rule input (V1): a rule expanded to N same-time occurrences. */
export type BatchRecurrenceInput = BatchCommonInput & {
  /** First occurrence's Lisbon calendar date, "yyyy-mm-dd". */
  firstDate: string;
  /** Lisbon wall-clock start, "HH:MM". */
  hhmm: string;
  durationMin: number;
  recurrence: RecurrenceSpec;
};

/** Explicit per-slot input (V2, W2-09): a concrete datetime list, each slot its
 *  own time/duration (the Rodica case). */
export type BatchExplicitInput = BatchCommonInput & {
  slots: BatchExplicitSlot[];
  /**
   * RB-02b — book N sessions of ONE pacote, each slot hand-picked.
   *
   * ON THE EXPLICIT VARIANT ONLY, AND THAT IS THE POINT. The recurrence variant
   * cannot carry a pacote because the TYPE will not let it, which is how the
   * owner's "no interval control and no weekday recurrence for the pacote path"
   * is enforced rather than merely intended. A future caller cannot reach the
   * pacote path with a rule; there is no field to put one in.
   */
  packId?: string | null;
};

/** Discriminated by the presence of `slots`. Both modes converge on one booking
 *  loop; recurrence callers (W2-05) keep working unchanged. */
export type BatchScheduleInput = BatchRecurrenceInput | BatchExplicitInput;

export type BatchBooked = { appointmentId: string; startsAt: string; date: string; hhmm: string };
export type BatchScheduleResult = {
  batchId: string;
  requested: number;
  booked: BatchBooked[];
  failures: BatchFailure[];
};

/**
 * RB-02b — the two ways a pacote batch is refused OUTRIGHT, as opposed to a slot
 * failing on availability.
 *
 * THROWN RATHER THAN RETURNED because they are not partial-success outcomes and
 * must not be reported beside busy slots. Throwing inside the transaction also
 * rolls back a pacote instance this call may just have registered, so a refused
 * batch leaves no trace - which a returned value could not guarantee.
 *
 * The action layer maps them to their own error codes; nothing else catches them.
 */
export class PackBatchRefused extends Error {
  constructor(readonly kind: "pack_insufficient" | "validation") {
    super(`pack batch refused: ${kind}`);
    this.name = "PackBatchRefused";
  }
}

/** Orchestrator: expand → check availability → book free → report failures. */
export async function batchSchedule(
  ctx: RequestContext,
  input: BatchScheduleInput,
): Promise<BatchScheduleResult> {
  // Both input modes converge on one concrete slot list.
  const slots = resolveBatchSlots(input);
  const batchId = randomUUID();

  // Nothing to book (e.g. an empty explicit list): return an empty batch.
  if (slots.length === 0) {
    return { batchId, requested: 0, booked: [], failures: [] };
  }

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

  const { toBook, failures } = classifyBatchSlots(slots, freeByDate);

  // Explicit slots carry no recurrence rule; the recurrence mode still documents
  // its rule on the booked rows (existing storage).
  const rrule = isExplicitSlots(input) ? null : toRRule(input.recurrence);
  // Creation invariant (W3-01): booked rows are always `scheduled`. Never taken
  // from the caller; `confirmation_state` falls to its DB default (`pending`).
  const status: AppointmentStatusValue = "scheduled";
  let booked: BatchBooked[] = [];

  /**
   * A PACOTE BATCH ALWAYS OPENS THE TRANSACTION, even with nothing bookable.
   *
   * The early skip below exists so an all-busy batch costs no transaction. For a
   * pacote that skip would swallow the over-booking refusal: asking for five
   * sessions from a pacote with three is an error whether or not the five slots
   * happen to be free, and it must be told to the person who asked.
   */
  const packId = isExplicitSlots(input) ? (input.packId ?? null) : null;

  if (toBook.length > 0 || packId) {
    booked = await runScoped(ctx, async (tx) => {
      /**
       * RB-02b — RESOLVE THE PACOTE FIRST, INSIDE THIS TRANSACTION.
       *
       * `bookPackSessionTx` finds the most recent instance with sessions left
       * or opens a new one; it CONSUMES NOTHING. Consumption is the
       * `pack_instance_id` written on the rows below, in this same
       * transaction, so a rolled-back batch spends nothing with no compensating
       * update - the property RB-02 established and this path inherits rather
       * than re-implements.
       *
       * THE CAP IS CHECKED ON `slots.length`, NOT `toBook.length`. See
       * `packBatchIsOverbooked` for why the request is what is judged.
       *
       * AND IT FORCES THE SERVICE, which the single-create path also does. A
       * pacote session is the pacote's BASE service; without this every row in
       * the batch would record whatever service the form happened to carry, and
       * the defect would be invisible until somebody read a receipt.
       */
      let packInstanceId: string | null = null;
      let serviceIdForRows = input.serviceId ?? null;
      if (packId) {
        // NOT named `booked`: the outer scope already binds that to the list of
        // written rows, and a shadow there would read as the same thing.
        const pack = await bookPackSessionTx(tx, ctx, input.patientId, packId);
        if (!pack) throw new PackBatchRefused("validation");
        if (packBatchIsOverbooked(slots.length, pack.sessionsAvailableBefore)) {
          throw new PackBatchRefused("pack_insufficient");
        }
        packInstanceId = pack.instanceId;
        serviceIdForRows = pack.baseServiceId;
      }

      if (toBook.length === 0) return [];

      // 2.9 — one sorted acquisition covering every slot this batch books, so
      // two concurrent batches touching overlapping slots serialize instead of
      // interleaving, and cannot deadlock against each other.
      const slotLocks = acquireSlotLocksForMany(
        ctx.tenantId,
        toBook.map((s) => ({
          practitionerId: input.practitionerId,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
        })),
      );
      if (slotLocks) await tx.execute(slotLocks);

      const rows = await tx
        .insert(appointments)
        .values(
          toBook.map((s) => ({
            tenantId: ctx.tenantId, // NOT NULL + RLS WITH CHECK
            patientId: input.patientId,
            practitionerId: input.practitionerId,
            locationId: input.locationId,
            // RB-02b: the pacote's BASE service when this is a pacote batch,
            // the form's service otherwise. Resolved once, above.
            serviceId: serviceIdForRows,
            // RB-02b: the link that makes the balance derivable. Null for every
            // non-pacote batch, which is almost all of them.
            packInstanceId,
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
            serviceId: serviceIdForRows,
            status,
            startsAt: b.startsAt,
            batchId,
            packInstanceId,
          },
          ip: null,
        });
      }
      return out;
    });
  }

  return { batchId, requested: slots.length, booked, failures };
}
