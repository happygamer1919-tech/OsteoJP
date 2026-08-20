import "server-only";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { appointments, patients } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { patientLocationScope, therapistPatientScope } from "@/lib/patients/scope";

/**
 * Q-LE-REMINDERS-LANDLINE-1, ruled 2026-08-20: SKIP the send AND SURFACE it to
 * reception. This is the surface half.
 *
 * ==========================================================================
 * IT IS A DERIVED QUERY, NOT A LOG OF SKIPS, AND THAT IS THE DESIGN.
 * ==========================================================================
 * The obvious build is to record every skipped reminder and show reception the
 * list. It needs a table, and it tells reception about a message that has
 * ALREADY not been sent - after the appointment is 48 hours away, or 24, which
 * is exactly when there is least time to do anything.
 *
 * The fact reception actually needs is knowable WITHOUT any of that: a patient
 * whose stored number cannot receive SMS **and who has an appointment coming
 * up** is going to miss their reminder, and that is derivable from
 * `patients.phone_e164` and `appointments.starts_at` today. So this needs NO
 * MIGRATION, no persistence, nothing that can drift from the truth - and it
 * surfaces the problem BEFORE the reminder is due rather than after.
 *
 * ==========================================================================
 * IT MATCHES THE `2` PREFIX IN SQL, WHICH IS A SECOND COPY OF A RULE.
 * ==========================================================================
 * Said out loud rather than left for somebody to find. `isSmsCapablePT` is the
 * authority and it is TypeScript; this predicate has to run in the database
 * because filtering every patient in the tenant through JavaScript would read
 * the whole table.
 *
 * THE DUPLICATION IS BOUNDED AND GUARDED. It is one prefix, not a
 * normalisation - `phone_e164` is already normalised by the generated column
 * (0062), so the only question here is "does it start +3512". And
 * `unreachable-by-sms.test.ts` asserts the SQL predicate and `isSmsCapablePT`
 * agree on a shared corpus, in both directions, so the two cannot drift the way
 * the two `phone.ts` copies did.
 */

export type UnreachablePatientView = {
  patientId: string;
  fullName: string;
  /** As stored, not normalised: reception is going to read it back to a person. */
  phone: string | null;
  /** The next appointment that will miss its reminder. */
  nextAppointmentAt: Date;
};

/**
 * Patients with an upcoming appointment whose stored number cannot receive SMS.
 *
 * SCOPED EXACTLY LIKE EVERY OTHER PATIENT READ, and for the same reason AI-04
 * gave: the row is about a PATIENT, so the two ratified patient scopes apply -
 * `therapistPatientScope` (a therapist sees a patient they treat or created) and
 * `patientLocationScope` (a located receptionist or admin sees their own
 * clinic's). No new visibility rule is invented by this card.
 */
export async function listPatientsUnreachableBySms(
  ctx: RequestContext,
): Promise<UnreachablePatientView[]> {
  assertCan(ctx.role, "patients:read");
  const locationScope = await viewerLocationScope(ctx);

  return runScoped(ctx, async (tx) => {
    const conds = [
      // Only appointments that are still going to happen. A cancelled one sends
      // no reminder, so its patient is not a problem to solve.
      gt(appointments.startsAt, new Date()),
      sql`${appointments.status} in ('scheduled', 'confirmed')`,
      // THE LANDLINE PREDICATE. `phone_e164` is the generated, normalised column
      // (0062), so `+3512` is the whole of the test - see the header on why this
      // is a second copy of the rule and what stops it drifting.
      sql`${patients.phoneE164} like '+3512%'`,
    ];

    const therapistScope = therapistPatientScope(ctx, appointments.patientId);
    if (therapistScope) conds.push(therapistScope);
    if (locationScope) {
      conds.push(patientLocationScope(appointments.patientId, locationScope));
    }

    const rows = await tx
      .select({
        patientId: patients.id,
        fullName: patients.fullName,
        phone: patients.phone,
        nextAppointmentAt: sql<Date>`min(${appointments.startsAt})`,
      })
      .from(appointments)
      // INNER, not LEFT, and this is the one place in this file where that is
      // the right choice: a row here is a claim about a PATIENT's number, so an
      // appointment whose patient cannot be resolved has nothing to report.
      // Contrast AI-04's stuck-recording list, where the row is an ALARM and a
      // missing name must not delete it.
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .where(and(...conds))
      // ONE ROW PER PATIENT, not per appointment. A patient with four upcoming
      // appointments is one conversation, not four; listing them four times
      // would make the queue look like four problems.
      .groupBy(patients.id, patients.fullName, patients.phone)
      .orderBy(asc(sql`min(${appointments.startsAt})`));

    return rows.map((r) => ({
      patientId: r.patientId,
      fullName: r.fullName,
      phone: r.phone,
      nextAppointmentAt: new Date(r.nextAppointmentAt),
    }));
  });
}
