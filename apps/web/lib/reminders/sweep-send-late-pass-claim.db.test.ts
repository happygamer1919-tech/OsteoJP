/**
 * sweep-send-late-pass-claim.db.test.ts - strategy's A2(2), against a REAL
 * Postgres: before the sweep is switched to send, "a send-mode DB test proves
 * a mark re-selected by the next pass after a late pass is never sent twice
 * (claim uniqueness), with a seeded failure (break uniqueness, test must
 * fail)". A test file only: it changes nothing under lib/reminders (R9).
 *
 * THE SHAPE, from 2026-11-03: the 09:00 tick's pass ran at 09:25, so the next
 * pass's selection window overlapped it and one mark could be selected by two
 * passes. The scheduled function runs with `concurrency: { limit: 1 }`, which
 * Inngest applies to steps, so the steps of two runs can interleave: the late
 * pass selects, the next pass selects, then each one's send step runs. Both
 * selections hold mark M before either pass has claimed it.
 *
 * A NEXT PASS THAT SELECTS ONLY AFTER THE LATE PASS HAS SENT DOES NOT SELECT M
 * AT ALL: the selection leaves out a mark with a live claim
 * (sweep-send.ts `notSettledNorJustTried`). So "M re-selected" is only true
 * when the second selection runs before the first claim is written, and this
 * file drives exactly that order through the pass's own `step` hook. Each arm
 * asserts that BOTH selections returned M, so no arm is vacuous, and a control
 * pass afterwards selects nothing.
 *
 * WHAT CARRIES "SENT ONCE", READ FROM THE CODE AND MEASURED BELOW. Two layers,
 * not one:
 *
 *   1. THE CLAIM TRANSACTION, apps/web/lib/reminders/reminder-claim.ts:661-671
 *      (`takeReminderClaimClosed`): the reminder's advisory lock (663-665),
 *      then `claimIsLive` (666), then the attempt number (667) and the insert
 *      (668-671). A second taker of M finds the first one's live claim and
 *      answers `claim_held`. THIS IS WHAT STOPS THE SECOND SEND whenever the
 *      read sees the first claim.
 *   2. THE UNIQUE INDEX `reminder_claims_claim_attempt_key`, migration 0106,
 *      packages/db/migrations/0106_reminder_claims.sql:335-337 (the same
 *      statement is at supabase/migrations/0106_reminder_claims.sql:339-341):
 *      one claim per (appointment_id, offset_id, channel, starts_at, attempt)
 *      WHERE kind = 'claim'. A taker that did not see the first claim computes
 *      the same attempt number, the table refuses its row with a 23505 on this
 *      key, and the dispatcher answers `claim_held_by_duplicate`
 *      (reminder-claim.ts:676). THIS IS THE CONSTRAINT THAT CARRIES CLAIM
 *      UNIQUENESS IN THE TABLE.
 *
 * THE SEEDED FAILURE, and why it is three arms. Dropping the unique index
 * ALONE does not make M go twice: layer 1 still holds it (arm A, measured).
 * Blinding layer 1's read ALONE does not either: the index refuses the second
 * claim (arm B, measured). With BOTH broken, M IS SENT TWICE (arm C, in both
 * shapes). So the main arms would fail if claim uniqueness were lost.
 *
 * WHAT ARM B DOES AND DOES NOT SHOW. The index backs layer 1 up against a
 * RACE OR VISIBILITY failure: a second taker whose read does not see the first
 * claim (its snapshot predates the first commit), which is what the blind
 * policy simulates. It does NOT back up a PREDICATE failure of layer 1: the
 * attempt number (`nextReminderClaimAttempt`) reads the same rows `claimIsLive`
 * reads, so if `claimIsLive` answered "not live" while seeing the first claim,
 * the second taker would compute attempt 2 and the index would let it
 * through. A review measured this (`claimIsLive` made to return false: M was
 * sent twice with the index intact). What catches a predicate break is the
 * main arms, SEQUENTIAL and CONCURRENT, not the index.
 *
 * HOW THE SEEDS TOUCH THE SHARED DATABASE, AND HOW THEY ARE UNDONE:
 *   - the index is swapped, in one transaction, for a copy that leaves out M's
 *     appointment only, under the original name, so every other appointment
 *     keeps its uniqueness and its 23505 name throughout. It is rebuilt from
 *     MIGRATION 0106's OWN STATEMENT (`KEY_0106` below, checked against the
 *     migration file at the start of every run), never from what a run read,
 *     and the live definition is then compared, exactly, with how Postgres
 *     prints that statement (`KEY_PRINTED`);
 *   - the read is blinded by a RESTRICTIVE SELECT policy for `authenticated`
 *     that hides, from this file's tenant only, every claim the reading
 *     transaction did not write itself (`created_at = now()`: a claim's
 *     `created_at` is its writer's transaction start, so the row the
 *     transaction itself inserts stays visible and INSERT ... RETURNING still
 *     works, and the other taker's row is hidden whichever began first). It is
 *     dropped (IF EXISTS) in a `finally`, in `afterAll`, and in `beforeAll`;
 *   - every seed's DDL runs in its own transaction with a 1 second lock
 *     timeout (under the claims' own 2 seconds), and an index swap takes
 *     ACCESS EXCLUSIVE before anything else, so it does not deadlock with the
 *     other suites' claims and keeps their wait under their own bound;
 *   - WHILE ARMS B AND C RUN, the blind policy is a third policy on
 *     reminder_claims. packages/db/tests/reminder-claims-rls.db.test.ts checks
 *     "one SELECT and one INSERT policy and no other", so that check would
 *     fail if it ran at the same moment against the same database. CI runs it
 *     in an earlier step of .github/workflows/db-tests.yml (the RLS isolation
 *     suite), not alongside this file. Two copies of THIS file must not run at
 *     the same moment on one database either: the second would heal the
 *     first's seeds as leftovers.
 *
 * AN ABORTED RUN HEALS ON THE NEXT ONE. A run killed inside arm C leaves the
 * policy, the M-excluding index and M's two attempt-1 claims behind. Every
 * `beforeAll` and `afterAll` therefore (1) drops the policy IF EXISTS, (2)
 * recognises the index ONLY in migration 0106's exact form or in this file's
 * exact seed form (anything else is refused, never rebuilt), (3) for the seed
 * form, deletes the claim rows of the one appointment it leaves out, after
 * checking they belong to this file's tenants only, and rebuilds the index from
 * `KEY_0106`; `beforeAll` then (4) cleans the earlier run's tenant whose
 * rows it removed. `afterAll` cleans its tenant in a `finally`, so a rebuild that
 * throws does not leave the tenant behind. Arm D builds such a leftover on
 * purpose and shows the same heal clears it.
 *
 * Measured on the PURPLE lane, 2026-11-06: with the main arms temporarily
 * made to run under seed C (a throwaway copy of this file, deleted after),
 * SEQUENTIAL failed with the next pass's `sent: 1` and CONCURRENT failed too.
 * Arm C now runs both shapes under seed C in this file.
 *
 * ONLY THE TWO TRANSPORTS ARE REPLACED, as in sweep-send.db.test.ts, whose
 * fixtures this file follows: one fresh tenant of its own, a week of its own
 * per arm, a pinned Lisbon morning years ahead, and `fetch` a spy that fails
 * the arm if reached.
 *
 * Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, lisbonDateTimeToUtc } from "../scheduling/time";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  /** Every hand-over to a (replaced) transport: `<channel>:<appointment id>`. */
  sends: [] as string[],
  sendDelayMs: 0,
  sendCount: 0,
  network: [] as string[],
  alarms: [] as string[],
}));

vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  const transport = (channel: "sms" | "email") =>
    vi.fn(async (msg: { appointmentId?: string }) => {
      h.sends.push(`${channel}:${msg.appointmentId ?? "?"}`);
      if (h.sendDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, h.sendDelayMs));
      h.sendCount += 1;
      return { channel, sandbox: false, id: `late-pass-${process.pid}-${Date.now()}-${h.sendCount}` };
    });
  return { ...actual, sendSms: transport("sms"), sendEmail: transport("email") };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/** The unique index migration 0106 creates over the claims of one attempt. */
const KEY = "reminder_claims_claim_attempt_key";
/** The seeded failure's restrictive policy. Never on a database this file does not own the run of. */
const BLIND = "a2_seed_blind_earlier_claims";
/**
 * Migration 0106's statement for KEY, character for character (without its
 * `--> statement-breakpoint`). `beforeAll` asserts the migration file holds it,
 * so a change to the migration fails this file instead of being papered over.
 * Every rebuild of KEY is made from this text.
 */
const KEY_0106 = [
  "CREATE UNIQUE INDEX reminder_claims_claim_attempt_key",
  "  ON public.reminder_claims (appointment_id, offset_id, channel, starts_at, attempt)",
  "  WHERE kind = 'claim';",
].join("\n");
const MIGRATION_0106 = join(__dirname, "..", "..", "..", "..", "packages/db/migrations/0106_reminder_claims.sql");
/** KEY_0106 as Postgres prints it back in pg_indexes. Arm D and every rebuild compare the live definition with it exactly. */
const KEY_PRINTED =
  "CREATE UNIQUE INDEX reminder_claims_claim_attempt_key ON public.reminder_claims USING btree " +
  "(appointment_id, offset_id, channel, starts_at, attempt) WHERE (kind = 'claim'::text)";
/** The seed's copy of KEY, leaving out one appointment, as Postgres prints it back (measured on the PURPLE lane). */
const seedPrinted = (appointmentId: string) =>
  "CREATE UNIQUE INDEX reminder_claims_claim_attempt_key ON public.reminder_claims USING btree " +
  `(appointment_id, offset_id, channel, starts_at, attempt) WHERE ((kind = 'claim'::text) AND (appointment_id <> '${appointmentId}'::uuid))`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** This file's tenants, by the name and slug `beforeAll` gives them. */
const OWN_TENANT_NAME = "Late Pass Co";
const OWN_TENANT_SLUG = /^latepass-[0-9a-f]{8}$/;

/**
 * The appointment a live definition leaves out, when that definition is
 * EXACTLY this file's seed form; null for anything else. The uuid is found by
 * position and then the whole string is compared with the seed form built from
 * it, so nothing is accepted by a partial match.
 */
function seededAppointmentOf(def: string): string | null {
  const head = seedPrinted("").split("''::uuid")[0]! + "'";
  if (!def.startsWith(head)) return null;
  const id = def.slice(head.length, head.length + 36);
  return UUID.test(id) && def === seedPrinted(id) ? id : null;
}

function uuidLiteral(id: string): string {
  if (!UUID.test(id)) throw new Error("not a uuid");
  return id;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

d("A2(2): a mark re-selected by the next pass after a late pass is sent ONCE", { timeout: 30_000 }, () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  const tenant = randomUUID();
  const seed = { therapist: randomUUID(), location: randomUUID(), patient: randomUUID() };

  const MIN = 60_000;
  const H = 60;
  /** A Monday in winter time, years ahead, and after every week sweep-send.db.test.ts uses. */
  const FIRST_MONDAY = "2033-03-07";
  /** Slot T of arm `week`: 09:00 Lisbon on that week's Monday. */
  const slotOf = (week: number) => lisbonDateTimeToUtc(addDays(FIRST_MONDAY, week * 7), "09:00");
  const plus = (base: Date, minutes: number) => new Date(base.getTime() + minutes * MIN);

  const ENV_KEYS = [
    "REMINDERS_SWEEP_MODE",
    "REMINDERS_SWEEP_NEVER_REMINDED",
    "REMINDERS_LIVE_SEND",
    "REMINDERS_LINK_SECRET",
    "REMINDERS_RESCHEDULE_BASE_URL",
    "REMINDERS_CONFIRM_LINK_ENABLED",
    "REMINDERS_CONFIRM_CODE_SECRET",
    "REMINDERS_FEE_NOTICE_ENABLED",
  ];
  const savedEnv: Record<string, string | undefined> = {};

  type Row = Record<string, unknown>;
  function rowsOf(r: unknown): Row[] {
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    return rowsOf(await sql.execute(q));
  }

  /**
   * A booked visit whose ONE selectable mark is the 24 hour SMS, due at `mark`.
   * Created 10 hours before that mark, which is after its 48 hour mark, so the
   * email is not selectable.
   */
  async function visitDueAt(mark: Date): Promise<{ id: string; start: Date }> {
    const id = randomUUID();
    const start = plus(mark, 24 * H);
    const created = plus(mark, -10 * H);
    await sql.execute(raw`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
      values (${id}, ${tenant}, ${seed.patient}, ${seed.therapist}, ${seed.location},
              ${start.toISOString()}, ${plus(start, 45).toISOString()}, 'scheduled', 'staff',
              ${created.toISOString()}, ${created.toISOString()})`);
    await sql.execute(raw`insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
      values (${tenant}, null, 'appointment.create', 'appointment', ${id}, '{}'::jsonb, ${created.toISOString()})`);
    return { id, start };
  }

  async function claimsOf(appointmentId: string): Promise<Row[]> {
    return rows(raw`select c.offset_id, c.channel, c.taker, c.attempt,
        exists (select 1 from reminder_claims r where r.kind = 'release' and r.claim_id = c.id) as released
      from reminder_claims c
      where c.appointment_id = ${appointmentId} and c.kind = 'claim'
      order by c.created_at, c.id`);
  }

  async function ledgerOf(appointmentId: string): Promise<string[]> {
    const r = await rows(raw`select template_id, outcome, coalesce(suppression_reason, provider_error_code, '') as why
      from reminder_dispatches where appointment_id = ${appointmentId} order by created_at, id`);
    return r.map((x) => `${String(x.template_id)}:${String(x.outcome)}:${String(x.why)}`);
  }

  const sendsOf = (appointmentId: string) => h.sends.filter((s) => s === `sms:${appointmentId}`).length;

  async function snapshot(appointmentId: string) {
    return { sends: sendsOf(appointmentId), claims: (await claimsOf(appointmentId)).length, ledger: await ledgerOf(appointmentId) };
  }

  /** Set the clock the dispatcher reads when it sends. `Date` only: timers and the database stay real. */
  function theSendClockReads(at: Date) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
  }

  type Hooks = { afterSelect?: () => void; beforeSend?: () => Promise<void> | void };

  /**
   * One sending pass of this file's tenant at `now`, through the pass's own
   * steps. `afterSelect` runs when the selection step has returned;
   * `beforeSend` inside every send step, before the dispatcher is called. The
   * marks the selection returned are kept: they are the evidence that a mark
   * was selected.
   */
  async function runPass(now: Date, label: string, hooks: Hooks = {}) {
    const { sweepTenantSending } = await import("./sweep-send");
    const selected: string[] = [];
    let due = -1;
    const outcome = await sweepTenantSending({
      tenantId: tenant,
      now: () => now,
      limit: 50,
      passId: `${label}-${randomUUID()}`,
      step: async <T,>(id: string, fn: () => Promise<T>): Promise<T> => {
        if (id.startsWith("sweep-select-")) {
          const result = await fn();
          const stored = result as unknown as { due: number; marks: { appointmentId: string }[] };
          due = stored.due;
          selected.push(...stored.marks.map((m) => m.appointmentId));
          hooks.afterSelect?.();
          return result;
        }
        if (id.startsWith("sweep-send-")) await hooks.beforeSend?.();
        return fn();
      },
      alarm: (line) => h.alarms.push(line),
    });
    return { outcome, selected, due };
  }

  /**
   * THE LATE PASS AND THE NEXT ONE. Slot T's pass runs 25 minutes late; slot
   * T+15's pass, held behind it, selects a minute later. M fell due at T+10, so
   * it is due for both. The order is fixed: the late pass selects, the next
   * pass selects, then the sends.
   *
   *   sequential  the late pass's send step runs and finishes (claim, send,
   *               ledger row, heartbeat), and only then the next pass's.
   *   concurrent  both send steps start together and race for M's claim, with
   *               a slow transport so the first send is still in flight.
   *
   * SEQUENTIAL IS THE PRODUCTION SHAPE. The Inngest function runs with
   * `concurrency: { limit: 1 }` (inngest/sweep.ts), so the steps of two runs
   * can interleave but two send steps never run at the same instant in
   * production. CONCURRENT is a stricter extra: it holds the same guarantee in
   * a shape production does not produce today.
   */
  async function lateOverlap(
    week: number,
    shape: "sequential" | "concurrent",
    /** The seeded failure: runs once M exists, before either pass selects. */
    seedFailure?: (appointmentId: string) => Promise<void>,
  ) {
    const T = slotOf(week);
    const lateRun = plus(T, 25);
    const nextRun = plus(T, 26);
    const m = await visitDueAt(plus(T, 10));
    if (seedFailure) await seedFailure(m.id);
    const lateSelected = deferred();
    const nextSelected = deferred();
    let beforeTheNextSend: Awaited<ReturnType<typeof snapshot>> | null = null;

    theSendClockReads(lateRun);
    const late = runPass(lateRun, "slot-T-late", {
      afterSelect: () => lateSelected.resolve(),
      beforeSend: async () => {
        await nextSelected.promise;
        theSendClockReads(plus(lateRun, 2));
      },
    });
    await Promise.race([lateSelected.promise, late]);
    const next = runPass(nextRun, "slot-T15", {
      afterSelect: () => nextSelected.resolve(),
      beforeSend: async () => {
        if (shape === "sequential") {
          await late;
          beforeTheNextSend = await snapshot(m.id);
        }
        theSendClockReads(plus(lateRun, 3));
      },
    });
    const [a, b] = await Promise.all([late, next]);
    // The evidence, printed: both selections held M.
    console.log(
      `[A2(2) ${shape}] late pass: due=${a.due} selected=${a.selected.length} includesM=${a.selected.includes(m.id)}; ` +
        `next pass: due=${b.due} selected=${b.selected.length} includesM=${b.selected.includes(m.id)}; ` +
        `sends of M=${sendsOf(m.id)}`,
    );
    return { T, m, a, b, beforeTheNextSend: beforeTheNextSend as Awaited<ReturnType<typeof snapshot>> | null };
  }

  /* ---------------------------------------------------------------- */
  /* The seeds                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Every seed's DDL waits at most 1 second for its lock: under CI load another
   * suite's open transaction on reminder_claims can hold it, and an unbounded
   * DDL would queue there and make every later claim of every suite queue
   * behind it. A claim transaction waits at most CLAIM_LOCK_TIMEOUT (2s,
   * asserted in `beforeAll`) for ITS locks, so the seed's bound is kept under
   * it: a claim queued behind a waiting seed is not timed out by the seed.
   * Bounded, the seed fails with 55P03 and this file is the one that says so.
   * LOCAL ends with the transaction.
   */
  const BOUNDED = raw`set local lock_timeout = '1s'`;
  /**
   * An index swap takes ACCESS EXCLUSIVE FIRST, before any other lock. Built
   * the other way (CREATE INDEX takes SHARE, then DROP INDEX asks for ACCESS
   * EXCLUSIVE) the swap upgrades its lock, and a concurrent claim transaction
   * that already read the table and then inserts deadlocks with it. Measured on
   * the PURPLE lane, 2026-11-06, with sweep-send.db.test.ts running alongside:
   * 40P01 in 4 of 12 runs, the victim either this file's restore or that
   * file's "TWO PASSES AT ONCE" claim (its `failed: 1`).
   */
  const LOCK_FIRST = raw`lock table public.reminder_claims in access exclusive mode`;

  async function keyDef(): Promise<string | null> {
    const [r] = await rows(raw`select indexdef from pg_indexes where schemaname = 'public' and indexname = ${KEY}`);
    return r ? String(r.indexdef) : null;
  }

  /** KEY_0106 under another name, for a build-then-swap in one transaction. */
  function key0106Named(name: string): string {
    const head = `CREATE UNIQUE INDEX ${KEY}\n`;
    if (!KEY_0106.startsWith(head)) throw new Error("KEY_0106 does not start with its own name");
    return `CREATE UNIQUE INDEX ${name}\n` + KEY_0106.slice(head.length);
  }

  /** Swap KEY, in one transaction, for a copy that leaves out one appointment, under the same name. */
  async function dropUniquenessFor(appointmentId: string) {
    expect(await keyDef()).toBe(KEY_PRINTED);
    const seedStatement = key0106Named(`${KEY}_a2_seed`).replace(
      /;$/,
      ` AND appointment_id <> '${uuidLiteral(appointmentId)}'::uuid`,
    );
    await sql.transaction(async (tx) => {
      await tx.execute(BOUNDED);
      await tx.execute(LOCK_FIRST);
      await tx.execute(raw.raw(seedStatement));
      await tx.execute(raw.raw(`DROP INDEX public.${KEY}`));
      await tx.execute(raw.raw(`ALTER INDEX public.${KEY}_a2_seed RENAME TO ${KEY}`));
    });
    expect(await keyDef()).toBe(seedPrinted(appointmentId));
  }

  /**
   * Give KEY back as migration 0106 made it, whatever run left it seeded.
   * IDEMPOTENT: a KEY already in 0106's form is left alone. A KEY in this
   * file's exact seed form is rebuilt from KEY_0106, after the claim rows of the
   * one appointment it leaves out are deleted (two claims of one attempt would
   * refuse the index); those rows must all belong to this file's tenants, or
   * nothing is touched. Any OTHER definition, or no KEY at all, is refused: it
   * is not this file's to repair. Returns the tenants whose seeded rows were
   * removed.
   */
  async function restoreUniqueness(): Promise<string[]> {
    const live = await keyDef();
    if (live === KEY_PRINTED) return [];
    const excluded = live === null ? null : seededAppointmentOf(live);
    if (excluded === null) {
      throw new Error(`${KEY} is neither migration 0106's nor this file's seed, and this file will not rebuild it: ${String(live)}`);
    }
    const owners = await sql.transaction(async (tx) => {
      await tx.execute(BOUNDED);
      await tx.execute(LOCK_FIRST);
      // Read under the lock: no claim of the appointment can appear between the check and the delete.
      const r = rowsOf(
        await tx.execute(raw`select distinct c.tenant_id, t.name, t.slug
          from reminder_claims c left join tenants t on t.id = c.tenant_id
          where c.appointment_id = ${excluded}`),
      );
      const foreign = r.filter(
        (o) => !(String(o.tenant_id) === tenant || (o.name === OWN_TENANT_NAME && OWN_TENANT_SLUG.test(String(o.slug)))),
      );
      if (foreign.length > 0) {
        throw new Error(`${KEY} leaves out an appointment whose claims are not this file's tenants'; refusing to delete them`);
      }
      // Releases reference their claims (ON DELETE CASCADE): every row of the appointment goes in one statement.
      await tx.execute(raw`delete from reminder_claims where appointment_id = ${excluded}`);
      await tx.execute(raw.raw(key0106Named(`${KEY}_a2_restore`)));
      await tx.execute(raw.raw(`DROP INDEX public.${KEY}`));
      await tx.execute(raw.raw(`ALTER INDEX public.${KEY}_a2_restore RENAME TO ${KEY}`));
      return r;
    });
    expect(await keyDef()).toBe(KEY_PRINTED);
    return owners.map((o) => String(o.tenant_id));
  }

  /** Every row of one of this file's tenants, children first. */
  async function cleanTenant(id: string) {
    await sql.execute(raw`delete from audit_log where tenant_id = ${id}`);
    await sql.execute(raw`delete from reminder_claims where tenant_id = ${id}`);
    await sql.execute(raw`delete from reminder_sweep_passes where tenant_id = ${id}`);
    await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${id}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${id}`);
    await sql.execute(raw`delete from patients where tenant_id = ${id}`);
    await sql.execute(raw`delete from locations where tenant_id = ${id}`);
    await sql.execute(raw`delete from users where tenant_id = ${id}`);
    await sql.execute(raw`delete from tenants where id = ${id}`);
  }

  /**
   * THE HEAL, run by `beforeAll` (a leftover of an aborted run) and by arm D.
   * Drops the policy if it is there, gives KEY back, and cleans the tenant of
   * an EARLIER run whose seeded rows it removed. Returns those tenants.
   */
  async function healLeftovers(): Promise<string[]> {
    await unblind();
    const earlier = (await restoreUniqueness()).filter((t) => t !== tenant);
    for (const t of earlier) await cleanTenant(t);
    expect(await blindPolicies()).toBe(0);
    expect(await keyDef()).toBe(KEY_PRINTED);
    return earlier;
  }

  /**
   * Hide from this file's tenant, as the reminder job, every claim the reading
   * transaction did not write itself: a claim row's `created_at` is its
   * writer's `now()`, the transaction's start, so `created_at = now()` keeps
   * only this transaction's own rows (two transactions on two connections would
   * have to start in the same microsecond to share it). Measured on the PURPLE
   * lane, 2026-11-06: the earlier `created_at >= now()` form let the other
   * taker's claim through when the two racing transactions began in the other
   * order (3 of 8 runs of the concurrent seed-C arm). An `xmin` form was also
   * tried and every claim transaction failed (ReminderClaimStoreError), most
   * likely because INSERT ... RETURNING checks the SELECT policy against the
   * new row before it carries a transaction id.
   */
  async function blindTheReadUnderTheLock() {
    await sql.transaction(async (tx) => {
      await tx.execute(BOUNDED);
      await tx.execute(
        raw.raw(
          `CREATE POLICY ${BLIND} ON public.reminder_claims AS RESTRICTIVE FOR SELECT TO authenticated ` +
            `USING (tenant_id <> '${uuidLiteral(tenant)}'::uuid OR created_at = now())`,
        ),
      );
    });
  }

  /** Drop the seed policy IF EXISTS. Idempotent: safe from a `finally`, `afterAll` and `beforeAll` alike. */
  async function unblind() {
    if ((await blindPolicies()) === 0) return;
    await sql.transaction(async (tx) => {
      await tx.execute(BOUNDED);
      await tx.execute(raw.raw(`DROP POLICY IF EXISTS ${BLIND} ON public.reminder_claims`));
    });
  }

  async function blindPolicies(): Promise<number> {
    const [r] = await rows(raw`select count(*)::int as n from pg_policies where tablename = 'reminder_claims' and policyname = ${BLIND}`);
    return Number(r!.n);
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */

  beforeAll(async () => {
    // As in sweep-send.db.test.ts (R35): the module graph, loaded once.
    await import("./sweep-send");
    await import("./dispatch");
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    // The seeds' 1 second lock bound stays under the claims' own (see BOUNDED).
    const { CLAIM_LOCK_TIMEOUT } = await import("./reminder-claim");
    expect(CLAIM_LOCK_TIMEOUT).toBe("2s");
    // The statement every rebuild uses is still migration 0106's, character for character.
    expect(readFileSync(MIGRATION_0106, "utf8")).toContain(`${KEY_0106}--> statement-breakpoint`);
    // A run killed inside a seeded arm left its seeds behind: heal them, or refuse a KEY that is not ours.
    const healed = await healLeftovers();
    if (healed.length > 0) console.log(`[A2(2)] healed the seeds an earlier, aborted run left, and cleaned ${healed.length} tenant(s)`);
    expect(await keyDef()).toBe(KEY_PRINTED);
    expect(await blindPolicies()).toBe(0);
    await sql.execute(raw`insert into tenants (id, name, slug, settings)
      values (${tenant}, ${OWN_TENANT_NAME}, ${"latepass-" + tenant.slice(0, 8)},
              '{"locale":"pt","contacts":{"phone":"+351 210 000 000"}}'::jsonb)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${seed.therapist}, ${tenant}, ${"t-" + seed.therapist.slice(0, 8) + "@t.test"}, 'Dra Late', true, true)`);
    await sql.execute(raw`insert into locations (id, tenant_id, name, phone) values (${seed.location}, ${tenant}, 'Sede', '+351 210 000 000')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone, email, reminder_sms_enabled, reminder_email_enabled)
      values (${seed.patient}, ${tenant}, 'Paciente Late', '912345678', ${"p-" + seed.patient.slice(0, 8) + "@p.test"}, true, true)`);
  }, 60_000);

  afterAll(async () => {
    if (!sql) return;
    // The shared database is left as it was found: no seed outlives the file,
    // even when an arm died before its own `finally`. The tenant is cleaned
    // whatever the restore does, and the restore runs whatever the drop does.
    try {
      try {
        await unblind();
      } finally {
        await restoreUniqueness();
      }
      expect(await blindPolicies()).toBe(0);
      expect(await keyDef()).toBe(KEY_PRINTED);
    } finally {
      await cleanTenant(tenant);
    }
  });

  beforeEach(async () => {
    // THE FLOOR: the sweep has been sending for this tenant since long before any mark an arm seeds.
    await sql.execute(raw`delete from reminder_sweep_passes where tenant_id = ${tenant}`);
    await sql.execute(raw`insert into reminder_sweep_passes
      (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count)
      values (${tenant}, 'floor-seed', 'send', '2026-01-05T08:00:00Z', 0, 0, false, 0)`);
    h.alarms.length = 0;
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.invalid";
    process.env.REMINDERS_SWEEP_MODE = "send";
    h.sends.length = 0;
    h.sendDelayMs = 0;
    h.network.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation((async () => {
      h.network.push("fetch");
      throw new Error("the test reached the network");
    }) as unknown as typeof fetch);
  });

  afterEach(async () => {
    expect(h.network).toEqual([]);
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
    await sql.execute(raw`update appointments set status = 'cancelled' where tenant_id = ${tenant} and status <> 'cancelled'`);
  });

  /* ---------------------------------------------------------------- */
  /* The guarantee                                                     */
  /* ---------------------------------------------------------------- */

  it("SEQUENTIAL: the late pass sends M once; the next pass RE-SELECTED M and does not send it again", async () => {
    const { T, m, a, b, beforeTheNextSend } = await lateOverlap(0, "sequential");

    // M was really selected by both passes: the arm is not vacuous.
    expect(a.selected).toEqual([m.id]);
    expect(b.selected).toEqual([m.id]);
    expect([a.due, b.due]).toEqual([1, 1]);

    // 1. The late pass sent M once: one claim, one `sent` row, the transport once.
    expect(a.outcome).toMatchObject({ due: 1, taken: 1, sent: 1, claimHeld: 0, heldByDuplicate: 0, failed: 0 });
    expect(beforeTheNextSend).toEqual({ sends: 1, claims: 1, ledger: ["reminder.24h.sms:sent:"] });

    // 2. The next pass handed M to the dispatcher, which sent nothing: the claim held it.
    expect(b.outcome).toMatchObject({ due: 1, taken: 1, sent: 0, claimHeld: 1, heldByDuplicate: 0, failed: 0 });
    expect(sendsOf(m.id)).toBe(1);
    expect(await claimsOf(m.id)).toEqual([{ offset_id: "24h", channel: "sms", taker: "sweep", attempt: 1, released: false }]);
    expect(await ledgerOf(m.id)).toEqual(["reminder.24h.sms:sent:"]);

    // CONTROL: a pass that selects after the claim was written does not select M at all.
    const after = await runPass(plus(T, 40), "slot-T30");
    expect(after.selected).toEqual([]);
    expect(after.outcome).toMatchObject({ due: 0, taken: 0, sent: 0 });
    expect(sendsOf(m.id)).toBe(1);
  });

  // A stricter extra: with the function's concurrency limit of 1, two send steps never run at the same instant in production.
  it("CONCURRENT: both passes' send steps for M race, and M is sent exactly once", async () => {
    h.sendDelayMs = 150;
    const { m, a, b } = await lateOverlap(1, "concurrent");

    expect(a.selected).toEqual([m.id]);
    expect(b.selected).toEqual([m.id]);
    expect(a.outcome.sent + b.outcome.sent).toBe(1);
    expect(a.outcome.failed + b.outcome.failed).toBe(0);
    // Whichever lost the race was held, by the live claim or by the table.
    expect(a.outcome.claimHeld + a.outcome.heldByDuplicate + b.outcome.claimHeld + b.outcome.heldByDuplicate).toBe(1);
    expect(sendsOf(m.id)).toBe(1);
    expect(await claimsOf(m.id)).toEqual([{ offset_id: "24h", channel: "sms", taker: "sweep", attempt: 1, released: false }]);
    expect(await ledgerOf(m.id)).toEqual(["reminder.24h.sms:sent:"]);
  });

  /* ---------------------------------------------------------------- */
  /* The seeded failure                                                */
  /* ---------------------------------------------------------------- */

  describe("THE SEEDED FAILURE: with claim uniqueness broken in this database, the same scenario sends M twice", () => {
    afterEach(async () => {
      await unblind();
    });

    /** The uniqueness of M's claims is gone from the table: the index now leaves M's appointment out. */
    const dropTheIndex = async (id: string) => {
      await dropUniquenessFor(id);
      expect(await keyDef()).toContain(`appointment_id <> '${id}'::uuid`);
    };
    /** The live-claim read under the lock no longer sees the late pass's claim. */
    const blindTheRead = async () => {
      await blindTheReadUnderTheLock();
      expect(await blindPolicies()).toBe(1);
    };

    it("A. the unique index dropped for M ALONE: still once, held by the live-claim read under the lock", async () => {
      try {
        const { m, a, b } = await lateOverlap(2, "sequential", async (id) => {
          await dropTheIndex(id);
        });
        expect(a.selected).toEqual([m.id]);
        expect(b.selected).toEqual([m.id]);
        expect(a.outcome).toMatchObject({ taken: 1, sent: 1 });
        expect(b.outcome).toMatchObject({ taken: 1, sent: 0, claimHeld: 1, heldByDuplicate: 0 });
        expect(sendsOf(m.id)).toBe(1);
        expect((await claimsOf(m.id)).map((c) => c.attempt)).toEqual([1]);
      } finally {
        await restoreUniqueness();
      }
    });

    it("B. the live-claim read blinded ALONE, the index intact: still once, the TABLE refuses the second claim (23505 on the attempt key)", async () => {
      try {
        const { m, a, b } = await lateOverlap(3, "sequential", async () => {
          await blindTheRead();
        });
        expect(a.selected).toEqual([m.id]);
        expect(b.selected).toEqual([m.id]);
        expect(a.outcome).toMatchObject({ taken: 1, sent: 1 });
        // The next pass took attempt 1 again, and the index refused it.
        expect(b.outcome).toMatchObject({ taken: 1, sent: 0, claimHeld: 0, heldByDuplicate: 1 });
        expect(sendsOf(m.id)).toBe(1);
        expect(await ledgerOf(m.id)).toEqual(["reminder.24h.sms:sent:"]);
      } finally {
        await unblind();
      }
      expect(await blindPolicies()).toBe(0);
      expect(await keyDef()).toBe(KEY_PRINTED);
    });

    it("C. BOTH broken (no claim uniqueness at all): the same scenario SENDS M TWICE, so the arms above would fail", async () => {
      try {
        const { m, a, b, beforeTheNextSend } = await lateOverlap(4, "sequential", async (id) => {
          await dropTheIndex(id);
          await blindTheRead();
        });
        expect(a.selected).toEqual([m.id]);
        expect(b.selected).toEqual([m.id]);
        expect(beforeTheNextSend).toEqual({ sends: 1, claims: 1, ledger: ["reminder.24h.sms:sent:"] });
        expect(a.outcome).toMatchObject({ taken: 1, sent: 1 });
        expect(b.outcome).toMatchObject({ taken: 1, sent: 1, claimHeld: 0, heldByDuplicate: 0 });
        // TWO SENDS, two claims of the same attempt, two `sent` rows.
        expect(sendsOf(m.id)).toBe(2);
        expect((await claimsOf(m.id)).map((c) => [c.taker, c.attempt, c.released])).toEqual([
          ["sweep", 1, false],
          ["sweep", 1, false],
        ]);
        expect(await ledgerOf(m.id)).toEqual(["reminder.24h.sms:sent:", "reminder.24h.sms:sent:"]);
      } finally {
        try {
          await unblind();
        } finally {
          await restoreUniqueness();
        }
      }
      expect(await blindPolicies()).toBe(0);
      expect(await keyDef()).toBe(KEY_PRINTED);
    });

    it("C, CONCURRENT shape. BOTH broken: the two racing send steps SEND M TWICE, so the CONCURRENT arm above would fail", async () => {
      h.sendDelayMs = 150;
      try {
        const { m, a, b } = await lateOverlap(5, "concurrent", async (id) => {
          await dropTheIndex(id);
          await blindTheRead();
        });
        expect(a.selected).toEqual([m.id]);
        expect(b.selected).toEqual([m.id]);
        expect(a.outcome).toMatchObject({ taken: 1, sent: 1, claimHeld: 0, heldByDuplicate: 0, failed: 0 });
        expect(b.outcome).toMatchObject({ taken: 1, sent: 1, claimHeld: 0, heldByDuplicate: 0, failed: 0 });
        expect(sendsOf(m.id)).toBe(2);
        expect((await claimsOf(m.id)).map((c) => [c.taker, c.attempt, c.released])).toEqual([
          ["sweep", 1, false],
          ["sweep", 1, false],
        ]);
        expect(await ledgerOf(m.id)).toEqual(["reminder.24h.sms:sent:", "reminder.24h.sms:sent:"]);
      } finally {
        try {
          await unblind();
        } finally {
          await restoreUniqueness();
        }
      }
      expect(await blindPolicies()).toBe(0);
      expect(await keyDef()).toBe(KEY_PRINTED);
    });

    it("D. an aborted run's leftover (seed C left in place, its `finally` never reached) is cleared by the heal every `beforeAll` runs", async () => {
      let leftoverOf: string | null = null;
      try {
        // Build exactly what a run killed inside arm C leaves: the policy, the
        // M-excluding index, and M's two claims of attempt 1. No restore here.
        const { m } = await lateOverlap(6, "sequential", async (id) => {
          leftoverOf = id;
          await dropTheIndex(id);
          await blindTheRead();
        });
        expect(await blindPolicies()).toBe(1);
        expect(await keyDef()).toBe(seedPrinted(m.id));
        expect((await claimsOf(m.id)).map((c) => c.attempt)).toEqual([1, 1]);

        // THE HEAL, the same function `beforeAll` calls. This run's own tenant
        // is not an earlier run's, so it is not cleaned here (afterAll does that).
        expect(await healLeftovers()).toEqual([]);
        expect(await blindPolicies()).toBe(0);
        expect(await keyDef()).toBe(KEY_PRINTED);
        expect(await claimsOf(m.id)).toEqual([]);
        // Idempotent: a second heal finds nothing to do.
        expect(await healLeftovers()).toEqual([]);
      } finally {
        if (leftoverOf !== null) {
          try {
            await unblind();
          } finally {
            await restoreUniqueness();
          }
        }
      }
    });

    it("D, the refusal: a KEY in neither 0106's form nor this file's seed form is never rebuilt", () => {
      expect(seededAppointmentOf(KEY_PRINTED)).toBeNull();
      const id = randomUUID();
      expect(seededAppointmentOf(seedPrinted(id))).toBe(id);
      expect(seededAppointmentOf(seedPrinted(id) + " ")).toBeNull();
      expect(seededAppointmentOf(seedPrinted(id).replace("<>", "="))).toBeNull();
      expect(seededAppointmentOf(seedPrinted(id).replace("attempt)", "attempt, tenant_id)"))).toBeNull();
      expect(seededAppointmentOf(seedPrinted("not-a-uuid-at-all-not-a-uuid-at-all!"))).toBeNull();
    });
  });
});
