import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  followupLastAttendanceSql,
  followupPractitionerSql,
  followupLastAttendanceClause,
  followupNoFutureBookingClause,
  followupNotPostponedClause,
  followupOwnPatientClause,
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

/**
 * THE PLACEHOLDERS BECOME REAL BOUND PARAMETERS, never interpolated text.
 *
 * Interpolating the three instants would not be exploitable today - they are a
 * server-computed window and a clock. But `now` IS a function parameter, so a
 * future caller passing something from a request would turn a safe line into an
 * injection without touching it. `$4` makes that concrete rather than
 * hypothetical: it is a USER ID, and it is the value that decides which
 * patients a therapist may see. Same reasoning `guest-requests.ts` gives for
 * using `inArray` over a hand-built IN list.
 *
 * HOISTED TO MODULE SCOPE 2026-08-27, from inside `listFollowupCandidates`. Both
 * queries in this file now bind the therapist clause, and a second copy of this
 * function is how the two would come to bind `$4` differently - the same
 * argument `followup-selection.ts` makes for living in `packages/db` at all.
 *
 * ISO STRING + AN EXPLICIT CAST, NOT A BARE Date. INC-12, third defect. These
 * parameters sit inside a fragment assembled with `sql.raw`, so Drizzle has NO
 * COLUMN TYPE to encode them against - unlike `gt(table.column, now)`, where the
 * column tells it what to do. With no type hint the postgres driver is handed a
 * Date it cannot serialise. `$4` carries `::uuid` for the same reason: the
 * column it is compared against is `practitioner_id`, and the driver cannot see
 * it through the raw fragment.
 *
 * STILL A BOUND PARAMETER in every case. The value is never interpolated into
 * the text - it is `$n::type` with the value bound.
 */
function bindFollowupClause(
  clause: string,
  values: { from: Date; to: Date; now: Date; therapistUserId?: string },
): SQL {
  return sql.join(
    clause
      .split(/(\$[1234])/g)
      .map((part) =>
        part === "$1"
          ? sql`${values.from.toISOString()}::timestamptz`
          : part === "$2"
            ? sql`${values.to.toISOString()}::timestamptz`
            : part === "$3"
              ? sql`${values.now.toISOString()}::timestamptz`
              : part === "$4"
                ? /**
                   * A CLAUSE CARRYING `$4` WITH NOTHING TO BIND IS A BUG, NOT AN
                   * EMPTY SCOPE, and it throws rather than rendering something.
                   * The alternative - substituting NULL - makes `... = NULL`,
                   * which is never true, so the query returns an EMPTY LIST. On
                   * this screen an empty list reads as "nobody to call", which is
                   * good news. A scope bug that presents as good news is the
                   * exact failure shape this codebase keeps cataloguing.
                   */
                  (() => {
                    if (!values.therapistUserId)
                      throw new Error(
                        "bindFollowupClause: the clause carries $4 but no therapistUserId was supplied",
                      );
                    return sql`${values.therapistUserId}::uuid`;
                  })()
                : sql.raw(part),
      ),
    sql``,
  );
}

/**
 * The therapist whose patients this viewer may see, or null for an unscoped role.
 *
 * OWNER RULING 2026-08-27: therapists gain /recuperacao, SCOPED to the patients
 * whose most recent completed consultation was theirs. Owner, admin and
 * reception keep the unscoped list per PL-09.
 *
 * A FUNCTION AND NOT AN INLINE `ctx.role === "therapist"` AT EACH CALL SITE,
 * for the reason `resolveScheduleScope` gives for the same shape one directory
 * over: there are now three call sites in this feature (two queries and the
 * mutation guard) and the fourth is whatever gets added next. One definition
 * means a caller can fail to APPLY the scope - a visible omission - but cannot
 * express it incorrectly.
 *
 * `ctx.userId` IS the `users.id` this compares against: `users.id` is 1:1 with
 * the Supabase auth user id and is not generated locally (see the column's own
 * comment in `packages/db/src/schema.ts`), which is the same identity
 * `resolveScheduleScope` relies on for `{kind:"self"}`.
 */
export function therapistScope(ctx: RequestContext): string | null {
  return ctx.role === "therapist" ? ctx.userId : null;
}

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
  /**
   * The most recent completed attendance. Always inside the window for a row the
   * predicate selected, so in practice never null - but typed nullable because
   * the SELECT can return null and a type that promised otherwise is how the
   * page came to call a date method on nothing.
   */
  lastAttendanceAt: Date | null;
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
 * WHO MAY READ IT, AND WITH WHAT SCOPE
 * ==========================================================================
 * `followup:read` — owner, admin, reception UNSCOPED; therapist SCOPED to their
 * own patients by owner ruling 2026-08-27. A role holding NO capability still
 * THROWS here rather than returning an empty list: an empty list is a valid
 * answer a future caller would render as "nobody to call", and a throw is not
 * something a caller can mistake for data. The page hiding the route is the
 * courtesy; this is the boundary. Same reasoning as `listPendingGuestRequests`,
 * and for the same reason: that list shipped readable by therapists on
 * production.
 *
 * THE TWO SCOPES COMPOSE RATHER THAN COMPETE, and they answer different
 * questions. `patientLocationScope` asks WHICH CLINIC (PL-09);
 * `followupOwnPatientClause` asks WHOSE PATIENT. A therapist assigned to a
 * location gets both, ANDed, because a therapist is not exempt from PL-09 by
 * gaining a second bound.
 *
 * LOCATION-SCOPED per PL-09, through the SAME `patientLocationScope` every other
 * located read uses rather than a second definition. A located receptionist or
 * admin sees their own clinic's patients; the owner sees all; an UNASSIGNED
 * reception or admin user is unrestricted, mirroring PL-09's documented
 * onboarding fallback so nobody is locked out on their first day.
 *
 * AN UNASSIGNED THERAPIST IS **NOT** UNRESTRICTED, and that is the one place
 * this feature departs from PL-09's fallback. PL-09 opens up for an unassigned
 * reception or admin so nobody is locked out on their first day; a therapist's
 * own-patient bound is not an onboarding convenience, it is the whole reason
 * they may see the page at all. An unassigned therapist with no completed
 * consultations simply sees an empty list, which is the truth.
 */
/** PERF-03. One page of the work queue, plus the total the header states. */
export type FollowupPage = {
  rows: FollowupCandidate[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * PERF-03 - PAGE SIZE, AND WHY PAGING IS ONLY NOW CORRECT.
 *
 * The card carried a POST-LAUNCH tag until 2026-08-30 and the reason was not
 * caution: paging a query that takes 127 seconds does not help, because EVERY
 * page costs the same full-table churn and the receptionist pays it once per
 * page instead of once. Migration 0068 made the query answer in ~171 ms on
 * production, so paging is now a real reduction rather than a rearrangement,
 * and the tag was superseded explicitly.
 */
export const FOLLOWUP_PAGE_SIZE = 50;

export async function listFollowupCandidates(
  ctx: RequestContext,
  now: Date = new Date(),
  opts: { page?: number; q?: string } = {},
): Promise<FollowupPage> {
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

    const conds = [
      bindFollowupClause(followupLastAttendanceClause(pid), { from, to, now }),
      bindFollowupClause(followupNoFutureBookingClause(pid), { from, to, now }),
      bindFollowupClause(followupNotPostponedClause(pid), { from, to, now }),
    ];

    if (locationScope) conds.push(patientLocationScope(patients.id, locationScope));
    /**
     * THE THERAPIST SCOPE, ANDed INTO THE QUERY. Owner ruling 2026-08-27.
     *
     * IT IS A WHERE CLAUSE AND NOT A `.filter()` ON THE RESULT, and that is the
     * ruling's own wording: "enforced server-side in the query, never by hiding
     * rows client-side". A row that reaches the mapping below has already been
     * SELECTED - its telephone number is in the process, in the payload, and in
     * the browser's memory. Filtering it there hides it from the screen and
     * discloses it anyway.
     *
     * THE OTHER THREE ROLES ARE UNTOUCHED. `ownPatientsOnly` is null for owner,
     * admin and reception, so nothing is appended and their query renders byte
     * for byte as it did - which is what "owner and reception still see all"
     * means and what the suite asserts.
     */
    const ownScope = therapistScope(ctx);
    if (ownScope) conds.push(bindFollowupClause(followupOwnPatientClause(pid), { from, to, now, therapistUserId: ownScope }));

    /**
     * PERF-03 - the name/phone filter, as a WHERE clause.
     *
     * A CLAUSE AND NOT A `.filter()` ON THE RESULT, for the same reason the
     * therapist scope is: a row that reaches the mapping below has already been
     * selected, and its telephone number is in the process, in the payload and
     * in the browser's memory. Filtering there hides it from the screen and
     * discloses it anyway.
     *
     * PHONE MATCHES ON `phone_digits`, the STORED generated column from
     * migration 0015, so "912 345 678" and "912345678" are the same search. The
     * name side is a plain ILIKE; reception types a fragment of a name.
     */
    const filterText = (opts.q ?? "").trim();
    if (filterText.length > 0) {
      const digits = filterText.replace(/\D/g, "");
      const like = `%${filterText.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const matchers = [sql`${patients.fullName} ilike ${like}`];
      if (digits.length > 0) matchers.push(sql`"phone_digits" like ${`%${digits}%`}`);
      conds.push(sql`(${sql.join(matchers, sql` OR `)})`);
    }

    // The count the header states, on the SAME predicate as the page below it.
    // A header that counts one thing and a table that lists another is the
    // shape a receptionist stops trusting after one disagreement.
    const [countRow] = await tx
      .select({ n: count() })
      .from(patients)
      .where(and(...conds));
    const total = Number(countRow?.n ?? 0);
    const pageSize = FOLLOWUP_PAGE_SIZE;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1) || 1), pageCount);

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
        /**
         * TYPED `string | null`, WHICH IS WHAT IT ACTUALLY IS. INC-12, fourth
         * defect, and the e2e found this one too.
         *
         * It was `sql<Date>`, and that annotation is a CLAIM TO TYPESCRIPT, NOT
         * A DECODER. Drizzle converts a timestamptz to a Date when it reads a
         * KNOWN COLUMN, because the column carries its type; a raw `sql`
         * fragment carries nothing, so the postgres driver's own value comes
         * straight through - a string. The page then called
         * `toLocaleDateString` on it: "d.toLocaleDateString is not a function",
         * which is a different error from the null one and needed a different
         * fix.
         *
         * THE LESSON IS THE FAMILY, NOT THE LINE. Every defect on this page has
         * been a claim the runtime did not honour: a column reference that bound
         * elsewhere, an alias that did not exist, a Date the driver could not
         * encode, and now a type that did not convert. `sql<T>` is the most
         * convincing of them because it type-checks.
         */
        lastAttendanceAt: sql<string | null>`${sql.raw(followupLastAttendanceSql(PATIENT_ID))}`.as(
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
      // THE ORDERING IS UNCHANGED - oldest attendance first. The patient who
      // has been quiet longest is the one most likely to be lost, and paging a
      // work queue must not reorder it.
      .orderBy(sql`last_attendance_at ASC`)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    if (rows.length === 0) return { rows: [], total, page, pageSize, pageCount };

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

    const mapped = rows.map((r) => ({
      patientId: r.patientId,
      fullName: r.fullName,
      phone: r.phone,
      email: r.email,
      // CONVERTED AT THE BOUNDARY, once, where the string is known to be one.
      // The alternative - handing a string to the page and formatting it there -
      // would put the same decision on every future caller.
      lastAttendanceAt: r.lastAttendanceAt ? new Date(r.lastAttendanceAt) : null,
      practitionerName: r.practitionerName,
      contacts: byPatient.get(r.patientId) ?? [],
    }));

    return { rows: mapped, total, page, pageSize, pageCount };
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
  const ownScope = therapistScope(ctx);
  // The window is not part of THIS query's own rule - a postponement is active
  // or it is not, regardless of when the patient was last seen. It is computed
  // because `followupOwnPatientClause` shares one binder with the candidates
  // query, and one binder is what keeps `$4` meaning the same thing in both.
  const { from, to } = followupWindow(now);

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
    /**
     * THE SAME THERAPIST SCOPE AS THE CANDIDATES QUERY, AND IT IS NOT OPTIONAL
     * HERE JUST BECAUSE THIS SECTION LOOKS SMALLER.
     *
     * The Postponed section renders a patient's FULL NAME. Scoping the main list
     * and leaving this one open would mean a therapist saw every patient in the
     * tenant that reception had postponed - a smaller leak than the call list
     * and the same KIND of leak, arriving through the section nobody was
     * looking at. It is the shape SEC-01 shipped: a surface adjacent to the
     * gated one, sharing its capability and not its scope.
     *
     * IT USES THE SAME CLAUSE, not a second predicate that means roughly the
     * same thing. A therapist sees a postponement exactly when they would have
     * seen the patient on the list it was made from.
     */
    if (ownScope) {
      conds.push(
        bindFollowupClause(followupOwnPatientClause(PATIENT_ID), {
          from,
          to,
          now,
          therapistUserId: ownScope,
        }),
      );
    }

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
