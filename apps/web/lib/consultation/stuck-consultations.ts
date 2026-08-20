import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { consultations, patients, users } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { patientLocationScope, therapistPatientScope } from "@/lib/patients/scope";

/**
 * AI-04 — the read behind reception's stuck-recording list.
 *
 * WHAT A ROW MEANS, because it does not mean "we will try again". A consultation
 * at `fire_status = 'needs_attention'` was recorded, uploaded, and never reached
 * the AI partner. The retry scanner has stopped: it is over the ceiling, the
 * ceiling is bounded by the 7-day audio lifecycle, and after that the recording
 * is GONE — the scoped S3 credential is put+get with NO list, so nothing can go
 * and find it. No clinical record was created and none will be. The only
 * remaining path to a note is a human writing it from memory, and the window in
 * which that is possible is measured in days.
 *
 * BEFORE THIS, THAT STATE WAS VISIBLE ONLY TO SOMEBODY WITH DATABASE OR LOG
 * ACCESS. Migration 0064 made it queryable and the ceiling emits one
 * `console.error`. Nobody at the clinic has either, so in practice the clinic
 * was never told.
 *
 * ==========================================================================
 * `needs_attention` IS THE WHOLE STUCK SET, AND THAT IS A CLAIM ABOUT THE
 * SCANNER RATHER THAN AN ASSUMPTION ABOUT THE COLUMN.
 * ==========================================================================
 * `consultation-store.ts` documents a second class that is invisible in both
 * directions: a row still `pending` whose `attempt_count` is at or past the
 * ceiling, left behind when a `needs_attention` write is lost mid-tick. It is
 * never retried (over the ceiling) and never surfaced (not `needs_attention`).
 *
 * IT IS NOT QUERIED HERE because the scanner already sweeps it: `functions.ts`
 * runs `listOverCeiling()` FIRST on every tick and records the outcome, which
 * moves those rows to `needs_attention`. Adding a second over-ceiling predicate
 * on this screen would put a copy of the ceiling rule in a place that cannot be
 * kept in step with `retry-policy.ts`, to catch rows the sweep catches one tick
 * earlier.
 *
 * WHAT THAT DOES NOT COVER, said plainly rather than left implied: if the retry
 * CRON stops running entirely, nothing reaches the ceiling in the first place,
 * so this list stays empty while every recording quietly fails. An empty list
 * here means "nothing has been given up on", never "the delivery path is
 * healthy". That is a monitoring question and it is not a screen.
 *
 * ==========================================================================
 * WHO MAY READ IT. THIS IS NOT SEC-01's SHAPE, AND THE DIFFERENCE IS THE POINT.
 * ==========================================================================
 * SEC-01 was a therapist reading the whole tenant's guest queue on deployed
 * production. Two things combined to produce it: the gate was `appointments:read`,
 * which EVERY role holds, and there was no data scope underneath it at all —
 * a guest request has no patient, so there was nothing to scope BY.
 *
 * A consultation is the opposite case. Every row is about a PATIENT, and this
 * repo already has two ratified, tested patient-visibility scopes:
 *
 *   - `therapistPatientScope` — a therapist sees a patient they treat or
 *     created (owner ruling Q-W10-03-2).
 *   - `patientLocationScope` — a located receptionist or admin sees the
 *     patients at their own clinic (PL-09 Phase 1).
 *
 * BOTH ARE APPLIED TO `consultations.patient_id` HERE, so the capability is not
 * carrying the whole weight the way it was in SEC-01. `patients:read` is the
 * right gate precisely because patient identity IS the sensitive content of
 * this list; a new capability would be a third name for a rule these two
 * functions already state.
 *
 * NO NEW VISIBILITY RULE IS INVENTED BY THIS CARD. Whoever could already see a
 * patient can see that this patient's recording was lost. That is deliberate:
 * a screen about lost clinical work is not the place to decide who may see a
 * patient's name, and this card was not given that decision to make.
 *
 * THE OWNER IS UNRESTRICTED and an UNASSIGNED reception or admin user is too,
 * mirroring PL-09's own documented fallback so nobody is locked out
 * mid-onboarding. Assigning them a location in Equipa makes the restriction
 * take effect.
 *
 * NO CLINICAL CONTENT. A row carries a name, an instant, an attempt count and
 * `last_error`, which 0064 constrains by construction to a status code or an
 * error class name — never a response body and never payload content.
 */

export type StuckConsultationView = {
  id: string;
  /**
   * NULL IS A REAL ANSWER HERE AND THE ROW MUST SURVIVE IT.
   *
   * Both joins are LEFT joins, and that is a §1.3 decision rather than a
   * defensive habit. `patient_id` and `doctor_id` are both NOT NULL with
   * foreign keys, so an inner join looks equivalent and reads better — until
   * the joined row is not visible for some reason nobody predicted, at which
   * point an inner join DELETES THE ALARM. A lost recording that disappears
   * from the list because a name could not be resolved is the exact failure
   * this screen exists to stop: the screen would carry on reporting something
   * reasonable, which is "nothing is stuck".
   *
   * So the row survives and the missing name is rendered as a missing name.
   */
  patientName: string | null;
  clinicianName: string | null;
  /** The consultation itself, not the failure. This is what a clinician
   *  reconstructs from, so it is what they need to recognise. */
  consultationStartedAt: Date;
  attemptCount: number;
  lastAttemptAt: Date | null;
  /** PII-free by construction (0064). A status code or an error class name. */
  lastError: string | null;
};

/**
 * Consultations that stopped being retried, most recent consultation first.
 *
 * NEWEST FIRST, WHICH IS THE OPPOSITE OF THE PEDIDO QUEUE BESIDE IT, and the
 * reason is worth the line. A queue is worked front to back because the person
 * who has waited longest is the one still waiting. This is not a queue: nothing
 * here can be delivered any more, and the only remaining action is a clinician
 * writing the note from memory. The most recent consultation is the one they
 * can still remember, so it is the one that goes at the top.
 */
export async function listStuckConsultations(
  ctx: RequestContext,
): Promise<StuckConsultationView[]> {
  assertCan(ctx.role, "patients:read");
  const locationScope = await viewerLocationScope(ctx);

  return runScoped(ctx, async (tx) => {
    const conds = [eq(consultations.fireStatus, "needs_attention")];

    // Therapist: their own patients. `therapistPatientScope` returns undefined
    // for every other role, so this is a no-op for reception, admin and owner.
    const therapistScope = therapistPatientScope(ctx, consultations.patientId);
    if (therapistScope) conds.push(therapistScope);

    // Reception/admin WITH an assignment: their own clinic's patients.
    // `viewerLocationScope` returns null for owner and therapist, and for an
    // unassigned reception/admin user — see PL-09's onboarding fallback.
    if (locationScope) {
      conds.push(patientLocationScope(consultations.patientId, locationScope));
    }

    const rows = await tx
      .select({
        id: consultations.id,
        patientName: patients.fullName,
        clinicianName: users.fullName,
        consultationStartedAt: consultations.consultationStartedAt,
        attemptCount: consultations.attemptCount,
        lastAttemptAt: consultations.lastAttemptAt,
        lastError: consultations.lastError,
      })
      .from(consultations)
      .leftJoin(patients, eq(patients.id, consultations.patientId))
      .leftJoin(users, eq(users.id, consultations.doctorId))
      .where(and(...conds))
      .orderBy(desc(consultations.consultationStartedAt));

    return rows;
  });
}
