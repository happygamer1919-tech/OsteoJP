import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  followupLastAttendanceSql,
  followupPractitionerSql,
  followupLastAttendanceClause,
  followupNoFutureBookingClause,
  followupNotPostponedClause,
  patientFollowupContacts,
  patientFollowupPostponements,
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

/**
 * The qualified reference to the outer `patients` row, written ONCE.
 *
 * Every correlated subquery on this page takes it. Two of them used to build
 * their own and both were wrong in the same way - see `followupLastAttendanceSql`
 * in `@osteojp/db`. One constant means the next one cannot be wrong differently.
 */
const PATIENT_ID = '"patients"."id"';

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
    const pid = PATIENT_ID;
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
            /**
             * ISO STRING + AN EXPLICIT CAST, NOT A BARE Date. INC-12, third
             * defect, and the new e2e caught it on its first run.
             *
             * These parameters sit inside a fragment assembled with sql.raw, so
             * Drizzle has NO COLUMN TYPE to encode them against - unlike
             * `gt(table.column, now)`, where the column tells it what to do.
             * With no type hint the postgres driver is handed a Date it cannot
             * serialise: "The string argument must be of type string... Received
             * an instance of Date".
             *
             * STILL A BOUND PARAMETER. The value is not interpolated into the
             * text - it is `$n::timestamptz` with the string bound - so the
             * reasoning above about `now` being a function parameter still holds.
             */
            part === "$1"
              ? sql`${from.toISOString()}::timestamptz`
              : part === "$2"
                ? sql`${to.toISOString()}::timestamptz`
                : part === "$3"
                  ? sql`${now.toISOString()}::timestamptz`
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
        /**
         * THE OUTER COLUMN IS NAMED, and that is not style - it is the INC of
         * 2026-08-21. Interpolating `patients.id` here rendered as the BARE
         * `"id"`, which inside `FROM appointments done` binds to `done.id`;
         * the predicate was never true, max() returned NULL, and page.tsx
         * crashed formatting it. `followupLastAttendanceSql` carries the full
         * account.
         */
        lastAttendanceAt: sql<Date>`${sql.raw(followupLastAttendanceSql(PATIENT_ID))}`.as(
          "last_attendance_at",
        ),
        /**
         * THE THERAPIST OF THAT ATTENDANCE, not "a therapist who has seen them".
         * Reception opens the conversation with "o Dr. X gostaria de saber como
         * está", and naming the wrong clinician is worse than naming none.
         * `ORDER BY starts_at DESC LIMIT 1` on the same completed set, so it can
         * only ever be the practitioner of the visit the date refers to.
         */
        practitionerName: sql<string | null>`${sql.raw(followupPractitionerSql(PATIENT_ID))}`.as(
          "practitioner_name",
        ),
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
    /**
     * ==================================================================
     * THE SCHEMA TABLE, NOT A HAND-WRITTEN ALIAS. INC-12, second cause.
     * ==================================================================
     * This was `.from(sql`patient_followup_contacts c`)` with a select of
     * `u.full_name`. Drizzle emits `left join "users"`, NOT `left join users u`
     * - it does not know about an alias somebody typed in a string - so the
     * statement referenced a `u` that was never in the FROM clause and Postgres
     * answered 42P01, missing FROM-clause entry for table "u".
     *
     * The cure is not to write `"users"."full_name"` by hand. It is to stop
     * hand-writing the FROM clause at all: `patientFollowupContacts` has been in
     * the schema since 0067, and using it means the aliases are Drizzle's own
     * and cannot disagree with themselves.
     */
    const marks = await tx
      .select({
        patientId: patientFollowupContacts.patientId,
        channel: patientFollowupContacts.channel,
        contactedAt: patientFollowupContacts.contactedAt,
        contactedByName: users.fullName,
      })
      .from(patientFollowupContacts)
      .leftJoin(users, eq(users.id, patientFollowupContacts.contactedBy))
      .where(inArray(patientFollowupContacts.patientId, ids))
      .orderBy(desc(patientFollowupContacts.contactedAt));

    const byPatient = new Map<string, FollowupChannelMark[]>();
    for (const m of marks) {
      const list = byPatient.get(m.patientId) ?? [];
      list.push({
        // The column is `text` with a CHECK pinning the three values (0067), so
        // the DB guarantees the union the type claims. Narrowed here rather than
        // asserted at the query, where it would hide a widened CHECK.
        channel: m.channel as FollowupChannelMark["channel"],
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
    /**
     * ==================================================================
     * THE QUERY THAT ACTUALLY BROUGHT THE PAGE DOWN. INC-12.
     * ==================================================================
     * Same defect as the marks query above and worse in effect: this one runs
     * on EVERY request, in parallel with the candidates query, so it threw
     * 42P01 whether or not there was a single patient to show. **The page had
     * never rendered for anyone.**
     *
     * It also selected two columns both named `id` and two named `full_name`,
     * leaving the row mapping to positional luck. Using the schema tables gives
     * Drizzle's own generated aliases and removes both problems at once.
     */
    const conds = [
      isNull(patientFollowupPostponements.revokedAt),
      gt(patientFollowupPostponements.postponedUntil, now),
    ];
    if (locationScope) conds.push(patientLocationScope(patients.id, locationScope));

    return tx
      .select({
        id: patientFollowupPostponements.id,
        patientId: patients.id,
        fullName: patients.fullName,
        postponedUntil: patientFollowupPostponements.postponedUntil,
        createdAt: patientFollowupPostponements.createdAt,
        createdByName: users.fullName,
      })
      .from(patientFollowupPostponements)
      .innerJoin(patients, eq(patients.id, patientFollowupPostponements.patientId))
      .leftJoin(users, eq(users.id, patientFollowupPostponements.createdBy))
      .where(and(...conds))
      .orderBy(asc(patientFollowupPostponements.postponedUntil));
  });
}
