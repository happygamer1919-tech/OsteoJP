import "server-only";
import { and, inArray, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  followupLastAttendanceClause,
  followupNoFutureBookingClause,
  followupNotPostponedClause,
  patients,
  users,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { patientLocationScope } from "@/lib/patients/scope";
import { followupWindow } from "./window";

/**
 * RB-01 — RECUPERACAO DE UTENTES. Patients recently in treatment with no future
 * booking, so reception can reach out before the relationship goes quiet.
 *
 * THE LIST IS A WORK QUEUE, NOT A REPORT. Every row exists to be acted on today
 * and to leave the list once it has been: the patient books, or reception
 * postpones them, and either way they are gone tomorrow. That is why the
 * ordering is oldest-attendance-first — the patient who has been quiet longest
 * is the one most likely to be lost.
 *
 * ==========================================================================
 * NOTHING HERE SENDS ANYTHING. Owner ruling 2026-08-20.
 * ==========================================================================
 * Every action on this surface is a CLIENT-SIDE DEEP LINK that opens on the
 * receptionist's own device — `wa.me`, `sms:`, `mailto:` — with a prefilled and
 * EDITABLE message. No Twilio, no Resend, no Inngest job, and the R9 live-send
 * flags are untouched. The server's only role is to record that a human pressed
 * a link.
 *
 * That is a deliberate boundary and not a shortcut. A server-side send from a
 * list of patients is a bulk-messaging feature, and it would need consent
 * handling, suppression, per-channel rate limits and an audit trail of message
 * bodies before it could ship safely. A deep link is a receptionist writing to
 * one person from their own phone, which is what the clinic already does.
 */

export type FollowupChannelMark = {
  channel: "whatsapp" | "sms" | "email";
  contactedAt: Date;
  contactedByName: string | null;
};

export type FollowupCandidate = {
  patientId: string;
  fullName: string;
  /** As STORED, not normalised: reception reads it back to a person. */
  phone: string | null;
  email: string | null;
  /** The most recent completed attendance. Always inside the window. */
  lastAttendanceAt: Date;
  /** Who saw them. Null only if the practitioner row is gone. */
  practitionerName: string | null;
  /** Every recorded contact for this patient, most recent first. */
  contacts: FollowupChannelMark[];
};

/**
 * The candidates, oldest attendance first.
 *
 * ==========================================================================
 * THE THREE CLAUSES, AND WHY EACH IS WRITTEN THE WAY IT IS
 * ==========================================================================
 * 1. **Their MOST RECENT completed attendance falls in the window.** Not "some
 *    attendance in the window" — see `window.ts`, which carries the reasoning
 *    and the boundary arithmetic. A `MAX(...)` in a correlated subquery, so the
 *    clause says the thing it means rather than approximating it with an
 *    ordering.
 * 2. **No future appointment.** `cancelled` and `no_show` do not count as
 *    bookings: a cancelled future appointment is precisely the case this list
 *    exists to catch, and treating it as a booking would hide the patient who
 *    most needs the call.
 * 3. **Not currently postponed.** Active means `revoked_at IS NULL AND
 *    postponed_until > now()`, which is exactly the shape 0067's partial index
 *    covers.
 *
 * ==========================================================================
 * WHO MAY READ IT
 * ==========================================================================
 * `followup:read` — owner, admin, reception. **A therapist gets nothing**, and
 * this THROWS for one rather than returning an empty list. An empty list is a
 * valid answer a future caller would render as "nobody to call"; a throw is not
 * something a caller can mistake for data. The page hiding the route is the
 * courtesy; this is the boundary. Same reasoning as
 * `listPendingGuestRequests`, and for the same reason: that list shipped
 * readable by therapists on production.
 *
 * LOCATION-SCOPED per PL-09, through the SAME `patientLocationScope` every other
 * located read uses rather than a second definition. A located receptionist or
 * admin sees their own clinic's patients; the owner sees all; an UNASSIGNED
 * reception or admin user is unrestricted, mirroring PL-09's documented
 * onboarding fallback so nobody is locked out on their first day.
 */
export async function listFollowupCandidates(
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<FollowupCandidate[]> {
  assertCan(ctx.role, "followup:read");
  const { from, to } = followupWindow(now);
  const locationScope = await viewerLocationScope(ctx);

  return runScoped(ctx, async (tx) => {
    /**
     * THE THREE CLAUSES COME FROM `@osteojp/db`, NOT FROM HERE.
     *
     * They are shared with `packages/db/tests/followup-selection.db.test.ts`,
     * which proves them against a real Postgres. Writing them inline and
     * re-typing them in the test is the drift shape `LE-apply-block-expectation-drift`
     * was carded for on the same day as this card: a proof written against one
     * version of a rule, never regenerated when the rule changed, going GREEN
     * while asserting the old rule.
     *
     * The clause text uses positional `$1 $2 $3` = windowFrom, windowTo, now.
     * `sql.raw` interpolates the CLAUSE, and the three values are bound as
     * ordinary Drizzle parameters immediately after — the clause carries no
     * caller data, so nothing user-supplied reaches `raw`.
     */
    const pid = '"patients"."id"';
    /**
     * THE PLACEHOLDERS BECOME REAL BOUND PARAMETERS, never interpolated text.
     *
     * Interpolating the three instants would not be exploitable today - they are
     * a server-computed window and a clock. But `now` IS a function parameter,
     * so a future caller passing something from a request would turn a safe line
     * into an injection without touching it. Same reasoning `guest-requests.ts`
     * gives for using `inArray` over a hand-built IN list, and the same
     * conclusion: a parameterised predicate cannot become exploitable later.
     */
    const bind = (clause: string) =>
      sql.join(
        clause
          .split(/(\$[123])/g)
          .map((part) =>
            part === "$1"
              ? sql`${from}`
              : part === "$2"
                ? sql`${to}`
                : part === "$3"
                  ? sql`${now}`
                  : sql.raw(part),
          ),
        sql``,
      );

    const conds = [
      bind(followupLastAttendanceClause(pid)),
      bind(followupNoFutureBookingClause(pid)),
      bind(followupNotPostponedClause(pid)),
    ];

    if (locationScope) conds.push(patientLocationScope(patients.id, locationScope));

    const rows = await tx
      .select({
        patientId: patients.id,
        fullName: patients.fullName,
        phone: patients.phone,
        email: patients.email,
        lastAttendanceAt: sql<Date>`(
          SELECT max(done.starts_at)
            FROM appointments done
           WHERE (done.patient_id = ${patients.id} OR done.patient_2_id = ${patients.id})
             AND done.status = 'completed'
        )`.as("last_attendance_at"),
        /**
         * THE THERAPIST OF THAT ATTENDANCE, not "a therapist who has seen them".
         * Reception opens the conversation with "o Dr. X gostaria de saber como
         * está", and naming the wrong clinician is worse than naming none.
         * `ORDER BY starts_at DESC LIMIT 1` on the same completed set, so it can
         * only ever be the practitioner of the visit the date refers to.
         */
        practitionerName: sql<string | null>`(
          SELECT u.full_name
            FROM appointments done
            JOIN users u ON u.id = done.practitioner_id
           WHERE (done.patient_id = ${patients.id} OR done.patient_2_id = ${patients.id})
             AND done.status = 'completed'
           ORDER BY done.starts_at DESC
           LIMIT 1
        )`.as("practitioner_name"),
      })
      .from(patients)
      .where(and(...conds))
      .orderBy(sql`last_attendance_at ASC`);

    if (rows.length === 0) return [];

    /**
     * CONTACTS IN ONE QUERY, NOT ONE PER ROW. A list of forty patients would
     * otherwise be forty round trips, and the N+1 would only show up once the
     * clinic had a real backlog — which is exactly when this screen matters.
     */
    const ids = rows.map((r) => r.patientId);
    const marks = await tx
      .select({
        patientId: sql<string>`c.patient_id`,
        channel: sql<"whatsapp" | "sms" | "email">`c.channel`,
        contactedAt: sql<Date>`c.contacted_at`,
        contactedByName: sql<string | null>`u.full_name`,
      })
      .from(sql`patient_followup_contacts c`)
      .leftJoin(users, sql`${users.id} = c.contacted_by`)
      .where(inArray(sql`c.patient_id`, ids))
      .orderBy(sql`c.contacted_at DESC`);

    const byPatient = new Map<string, FollowupChannelMark[]>();
    for (const m of marks) {
      const list = byPatient.get(m.patientId) ?? [];
      list.push({
        channel: m.channel,
        contactedAt: m.contactedAt,
        contactedByName: m.contactedByName,
      });
      byPatient.set(m.patientId, list);
    }

    return rows.map((r) => ({
      patientId: r.patientId,
      fullName: r.fullName,
      phone: r.phone,
      email: r.email,
      lastAttendanceAt: r.lastAttendanceAt,
      practitionerName: r.practitionerName,
      contacts: byPatient.get(r.patientId) ?? [],
    }));
  });
}

/** Everything about a patient's active postponement, for the reversal control. */
export type ActivePostponement = {
  id: string;
  postponedUntil: Date;
  createdByName: string | null;
  createdAt: Date;
};

/**
 * The patients this viewer has postponed and can still bring back, most recent
 * first.
 *
 * RENDERED AS ITS OWN SECTION RATHER THAN HIDDEN. A postponement that vanishes
 * from every screen is indistinguishable from one that never happened, and the
 * card requires the reversal to be visible with who and when. It is also the
 * only way to undo a misclick before the postponement expires.
 */
export async function listActivePostponements(
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<(ActivePostponement & { patientId: string; fullName: string })[]> {
  assertCan(ctx.role, "followup:read");
  const locationScope = await viewerLocationScope(ctx);

  return runScoped(ctx, async (tx) => {
    const conds = [
      sql`p.revoked_at IS NULL`,
      sql`p.postponed_until > ${now}`,
    ];
    if (locationScope) conds.push(patientLocationScope(patients.id, locationScope));

    return tx
      .select({
        id: sql<string>`p.id`,
        patientId: patients.id,
        fullName: patients.fullName,
        postponedUntil: sql<Date>`p.postponed_until`,
        createdAt: sql<Date>`p.created_at`,
        createdByName: sql<string | null>`u.full_name`,
      })
      .from(sql`patient_followup_postponements p`)
      .innerJoin(patients, sql`${patients.id} = p.patient_id`)
      .leftJoin(users, sql`${users.id} = p.created_by`)
      .where(and(...conds))
      .orderBy(sql`p.postponed_until ASC`);
  });
}
