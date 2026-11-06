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
 * claim (arm B, measured). With BOTH broken, M IS SENT TWICE (arm C). So the
 * main arms would fail if claim uniqueness were lost, and each layer is shown
 * to hold the line on its own.
 *
 * HOW THE SEEDS TOUCH THE SHARED DATABASE, AND HOW THEY ARE UNDONE:
 *   - the index is swapped, in one transaction, for a copy that leaves out M's
 *     appointment only, under the original name, so every other appointment
 *     keeps its uniqueness and its 23505 name throughout. Restored the same
 *     way from the definition read at the start, and the arm asserts the live
 *     definition equals it again;
 *   - the read is blinded by a RESTRICTIVE SELECT policy for `authenticated`
 *     that hides, from this file's tenant only, every claim written before the
 *     current transaction began (`created_at >= now()` keeps the row the
 *     transaction itself inserts, so INSERT ... RETURNING still works). It is
 *     dropped in a `finally`, and `afterAll` asserts it is gone;
 *   - every seed's DDL runs in its own transaction with a 3 second lock
 *     timeout, so it never queues the other suites' claims behind it.
 *
 * Measured on the PURPLE lane, 2026-11-06: with the main arms temporarily
 * made to run under seed C (a throwaway copy of this file, deleted after),
 * SEQUENTIAL failed with the next pass's `sent: 1` and CONCURRENT failed too.
 *
 * ONLY THE TWO TRANSPORTS ARE REPLACED, as in sweep-send.db.test.ts, whose
 * fixtures this file follows: one fresh tenant of its own, a week of its own
 * per arm, a pinned Lisbon morning years ahead, and `fetch` a spy that fails
 * the arm if reached.
 *
 * Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
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
/** Migration 0106's statement, as Postgres prints it back. Captured in three parts so a seed can be built from it. */
const KEY_DEF = /^CREATE UNIQUE INDEX reminder_claims_claim_attempt_key (ON public\.reminder_claims USING btree \(appointment_id, offset_id, channel, starts_at, attempt\)) WHERE (\(kind = 'claim'::text\))$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  /** The live definition of KEY when the file started: what every restore must give back. */
  let originalKeyDef = "";

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
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
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
   * Every seed's DDL waits at most 3 seconds for its lock, the precedent of
   * effective-availability.db.test.ts: under CI load another suite's open
   * transaction on reminder_claims can hold it, and an unbounded DDL would
   * queue there and make every later claim of every suite queue behind it.
   * Bounded, the seed fails with 55P03 and this file is the one that says so.
   * LOCAL ends with the transaction.
   */
  const BOUNDED = raw`set local lock_timeout = '3s'`;

  async function keyDef(): Promise<string | null> {
    const [r] = await rows(raw`select indexdef from pg_indexes where schemaname = 'public' and indexname = ${KEY}`);
    return r ? String(r.indexdef) : null;
  }

  /** Swap KEY, in one transaction, for a copy that leaves out one appointment, under the same name. */
  async function dropUniquenessFor(appointmentId: string) {
    const [, on, where] = KEY_DEF.exec(originalKeyDef)!;
    await sql.transaction(async (tx) => {
      await tx.execute(BOUNDED);
      await tx.execute(
        raw.raw(`CREATE UNIQUE INDEX ${KEY}_a2_seed ${on} WHERE (${where} AND appointment_id <> '${uuidLiteral(appointmentId)}'::uuid)`),
      );
      await tx.execute(raw.raw(`DROP INDEX public.${KEY}`));
      await tx.execute(raw.raw(`ALTER INDEX public.${KEY}_a2_seed RENAME TO ${KEY}`));
    });
  }

  /**
   * Give KEY back exactly as it was read at the start. The seeded claims of
   * `appointmentId` are removed first: two claims of one attempt would refuse
   * the index. They are this file's own rows.
   */
  async function restoreUniqueness(appointmentId: string | null) {
    if ((await keyDef()) !== originalKeyDef) {
      const [, on, where] = KEY_DEF.exec(originalKeyDef)!;
      await sql.transaction(async (tx) => {
        await tx.execute(BOUNDED);
        if (appointmentId) await tx.execute(raw`delete from reminder_claims where appointment_id = ${appointmentId} and kind = 'claim'`);
        await tx.execute(raw.raw(`CREATE UNIQUE INDEX ${KEY}_a2_restore ${on} WHERE ${where}`));
        await tx.execute(raw.raw(`DROP INDEX public.${KEY}`));
        await tx.execute(raw.raw(`ALTER INDEX public.${KEY}_a2_restore RENAME TO ${KEY}`));
      });
    }
    expect(await keyDef()).toBe(originalKeyDef);
  }

  /** Hide from this file's tenant, as the reminder job, every claim written before the current transaction began. */
  async function blindTheReadUnderTheLock() {
    await sql.transaction(async (tx) => {
      await tx.execute(BOUNDED);
      await tx.execute(
        raw.raw(
          `CREATE POLICY ${BLIND} ON public.reminder_claims AS RESTRICTIVE FOR SELECT TO authenticated ` +
            `USING (tenant_id <> '${uuidLiteral(tenant)}'::uuid OR created_at >= now())`,
        ),
      );
    });
  }

  async function unblind() {
    if ((await blindPolicies()) === 0) return;
    await sql.transaction(async (tx) => {
      await tx.execute(BOUNDED);
      await tx.execute(raw.raw(`DROP POLICY ${BLIND} ON public.reminder_claims`));
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
    // The index this file names is migration 0106's, byte for byte as Postgres prints it.
    originalKeyDef = (await keyDef()) ?? "";
    expect(originalKeyDef).toMatch(KEY_DEF);
    expect(await blindPolicies()).toBe(0);
    await sql.execute(raw`insert into tenants (id, name, slug, settings)
      values (${tenant}, 'Late Pass Co', ${"latepass-" + tenant.slice(0, 8)},
              '{"locale":"pt","contacts":{"phone":"+351 210 000 000"}}'::jsonb)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${seed.therapist}, ${tenant}, ${"t-" + seed.therapist.slice(0, 8) + "@t.test"}, 'Dra Late', true, true)`);
    await sql.execute(raw`insert into locations (id, tenant_id, name, phone) values (${seed.location}, ${tenant}, 'Sede', '+351 210 000 000')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone, email, reminder_sms_enabled, reminder_email_enabled)
      values (${seed.patient}, ${tenant}, 'Paciente Late', '912345678', ${"p-" + seed.patient.slice(0, 8) + "@p.test"}, true, true)`);
  }, 60_000);

  afterAll(async () => {
    if (!sql) return;
    // The shared database is left as it was found: no seed outlives the file.
    await unblind();
    await restoreUniqueness(null);
    expect(await blindPolicies()).toBe(0);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenant}`);
    await sql.execute(raw`delete from reminder_claims where tenant_id = ${tenant}`);
    await sql.execute(raw`delete from reminder_sweep_passes where tenant_id = ${tenant}`);
    await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${tenant}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenant}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenant}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenant}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenant}`);
    await sql.execute(raw`delete from tenants where id = ${tenant}`);
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
      let seededFor: string | null = null;
      try {
        const { m, a, b } = await lateOverlap(2, "sequential", async (id) => {
          seededFor = id;
          await dropTheIndex(id);
        });
        expect(a.selected).toEqual([m.id]);
        expect(b.selected).toEqual([m.id]);
        expect(a.outcome).toMatchObject({ taken: 1, sent: 1 });
        expect(b.outcome).toMatchObject({ taken: 1, sent: 0, claimHeld: 1, heldByDuplicate: 0 });
        expect(sendsOf(m.id)).toBe(1);
        expect((await claimsOf(m.id)).map((c) => c.attempt)).toEqual([1]);
      } finally {
        await restoreUniqueness(seededFor);
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
      expect(await keyDef()).toBe(originalKeyDef);
    });

    it("C. BOTH broken (no claim uniqueness at all): the same scenario SENDS M TWICE, so the arms above would fail", async () => {
      let seededFor: string | null = null;
      try {
        const { m, a, b, beforeTheNextSend } = await lateOverlap(4, "sequential", async (id) => {
          seededFor = id;
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
        await unblind();
        await restoreUniqueness(seededFor);
      }
      expect(await blindPolicies()).toBe(0);
    });
  });
});
