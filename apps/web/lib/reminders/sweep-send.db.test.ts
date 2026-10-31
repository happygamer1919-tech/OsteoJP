/**
 * sweep-send.db.test.ts - SWEEP-47, against a REAL Postgres, as the job: the
 * reminder sweep as the sender, and the same scheduled function with the
 * switch off.
 *
 * WHAT IT PROVES, and why each arm must be a database:
 *
 *   1. WITH THE SEND SWITCH OFF NOTHING CHANGES. The scheduled function's own
 *      handler, run with the switch unset and with near-misses of `send`,
 *      writes the shadow's rows and nothing else: no claim, no ledger row, no
 *      send. With the switch on the same handler sends.
 *   2. A SENDING PASS SENDS EACH DUE REMINDER ONCE: both channels, through the
 *      real dispatcher and the real load, and leaves a claim of the taker
 *      `sweep`, a `sent` ledger row and a heartbeat of mode `send`. The next
 *      pass takes nothing, and a sleeping job that wakes afterwards is held.
 *   3. A REMINDER THAT WAS HELD BACK IS TRIED AGAIN, once an hour, and is sent
 *      when the visit is put right. A REMINDER THAT WAS SENT IS NEVER SENT
 *      AGAIN.
 *   4. WHICH ROWS SETTLE A MARK, row by row: a live claim of either sender
 *      does; a released claim, an early claim, a claim for another start and
 *      the shadow's own row do not.
 *   5. TWO PASSES AT ONCE send each reminder once.
 *   6. THE SECOND SWITCH: a visit that never had a reminder is taken only
 *      while REMINDERS_SWEEP_NEVER_REMINDED is exactly `on`.
 *   7. THE CEILING, TWO TENANTS, and a mark that fails does not stop the next.
 *   8. THE LATE RULE. An SMS up to 3 hours after its time and an email up to
 *      12 are still sent; a minute later each is recorded as too late, once,
 *      and never sent. A reminder held back until its limit ends the same
 *      way. The marks that can still go out are taken before the ones that
 *      are only to be recorded. IT IS JUDGED WHEN THE SEND STEP RUNS: a step
 *      that runs hours after its selection sends nothing that is by then too
 *      late, and nothing for a visit that has by then begun.
 *   9. THE FLOOR. A pass takes no mark that fell due before the tenant's
 *      first SENDING heartbeat of this spell: not one the sleeping job sent
 *      without a claim, not one it held back. A tenant that has only ever
 *      been swept in shadow is not swept: the pass writes the first sending
 *      heartbeat and starts from there, and again after the switch was off.
 *  10. A VISIT MOVED LATER between the last pass's selection and its send is
 *      not reminded early.
 *  11. A CLAIM WITH NOTHING AFTER IT is counted and named by every later
 *      pass, and never sent again.
 *  12. R24: A VISIT SAVED AFTER ITS MARK, before the mark was first handed
 *      over, is never taken: no claim, no send, no ledger row. Saved before or
 *      AT its mark it is sent as before, and a reminder held back before such
 *      a save is still tried again.
 *  13. R33: only a save that re-armed the sleeping job keeps a mark out; a
 *      booked visit confirmed by hand, in review or by SMS is sent. R33's two
 *      GATE checks. R34: the held-back retry after such a save runs to
 *      EXACTLY 3 hours after the mark, both channels, and stops there.
 *
 * WHY A DATABASE. The selection reads `appointments`, the audit trail and
 * `reminder_claims` under the job's own claims, and "sent once" is the claim's
 * lock. A mock has neither.
 *
 * ONLY THE TWO TRANSPORTS ARE REPLACED, and the tenant lister is narrowed to
 * the two tenants this file made: no arm can reach a provider or sweep a
 * tenant it does not own. `fetch` is a spy that fails the arm if reached.
 *
 * EVERY ARM OWNS ITS ROWS: two fresh tenants, a week of its own per arm, and
 * every count is of those two tenants' rows only.
 *
 * THE CLOCKS. Every arm but one hands the pass a pinned Lisbon morning far in
 * the future, so the file gives the same answer at any hour. A claim is
 * stamped by the database's own clock, so to those passes every claim is more
 * than an hour old. The arm that proves the hour between two tries uses the
 * real clock instead.
 *
 * THE DISPATCHER READS A CLOCK OF ITS OWN WHEN IT SENDS, and takes it from
 * nobody. So `pass` sets the system's clock (`Date` only; every timer and the
 * database's clock stay real) to the pass's own, and an arm that lets time go
 * by between the selection and a send moves it inside the send step.
 *
 * Skipped without DATABASE_URL. NOT hard-required in assert-rls-executed.mjs:
 * that file is a frozen gate, so listing this suite there is a GATE-CHANGE.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, lisbonDateTimeToUtc } from "../scheduling/time";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  /** Every hand-over to a (replaced) transport: `<channel>:<appointment id>`. */
  sends: [] as string[],
  /** Appointments whose hand-over the transport refuses with an unlisted answer. */
  refuse: new Set<string>(),
  sendDelayMs: 0,
  sendCount: 0,
  /** The tenants the scheduled function is allowed to list: this file's two. */
  tenants: [] as string[],
  network: [] as string[],
  /** Every alarm line a pass raised. */
  alarms: [] as string[],
}));

vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  const transport = (channel: "sms" | "email") =>
    vi.fn(async (msg: { appointmentId?: string }) => {
      h.sends.push(`${channel}:${msg.appointmentId ?? "?"}`);
      if (h.sendDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, h.sendDelayMs));
      if (msg.appointmentId && h.refuse.has(msg.appointmentId)) {
        throw Object.assign(new Error("provider unknown"), { code: 20500 });
      }
      h.sendCount += 1;
      return { channel, sandbox: false, id: `sweep-send-${process.pid}-${Date.now()}-${h.sendCount}` };
    });
  return { ...actual, sendSms: transport("sms"), sendEmail: transport("email") };
});
vi.mock("@osteojp/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/db")>();
  return { ...actual, listTenantIdsForRetention: vi.fn(async () => [...h.tenants]) };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("SWEEP-47: the sweep as the sender sends each due reminder once, and with the switch off it sends nothing", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const seeds: Record<string, { therapist: string; location: string; patient: string }> = {
    [tenantA]: { therapist: randomUUID(), location: randomUUID(), patient: randomUUID() },
    [tenantB]: { therapist: randomUUID(), location: randomUUID(), patient: randomUUID() },
  };

  const MIN = 60_000;
  const H = 60;
  /** A Monday in winter time, years ahead. Arm `week` owns the week that begins `week` weeks later. */
  const FIRST_MONDAY = "2031-03-03";
  const clockOf = (week: number) => lisbonDateTimeToUtc(addDays(FIRST_MONDAY, week * 7), "10:15");
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

  /** A visit, with the row a booking at the clinic writes on its audit trail unless `booked` is false. */
  async function visit(v: {
    tenant?: string;
    now: Date;
    /** Minutes from `now` to the start. */
    startIn: number;
    /** Minutes from `now` to the row's creation. Negative: before. */
    createdIn?: number;
    status?: string;
    origin?: string;
    booked?: boolean;
  }): Promise<{ id: string; start: Date }> {
    const tenantId = v.tenant ?? tenantA;
    const mine = seeds[tenantId]!;
    const id = randomUUID();
    const start = plus(v.now, v.startIn);
    const created = plus(v.now, v.createdIn ?? -5 * 24 * H);
    await sql.execute(raw`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
      values (${id}, ${tenantId}, ${mine.patient}, ${mine.therapist}, ${mine.location},
              ${start.toISOString()}, ${plus(start, 45).toISOString()}, ${v.status ?? "scheduled"}, ${v.origin ?? "staff"},
              ${created.toISOString()}, ${created.toISOString()})`);
    if (v.booked !== false) {
      // Stamped at the visit's creation, as a booking is. The database's clock
      // would put it after the mark of an arm on the real clock, and R24 reads
      // when a scheduling save was written.
      await sql.execute(raw`insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
        values (${tenantId}, null, 'appointment.create', 'appointment', ${id}, '{}'::jsonb, ${created.toISOString()})`);
    }
    return { id, start };
  }

  /** The R24 arms' own saves, by action: the last arm reads the trail against them. */
  const laterSaves: Record<string, number> = {};

  /** A save on a visit's audit trail, written `at` an instant of the arm's choosing. */
  async function savedAt(
    appointmentId: string,
    action: string,
    metadata: Record<string, unknown>,
    at: Date,
    tenant = tenantA,
  ): Promise<void> {
    await sql.execute(raw`insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
      values (${tenant}, null, ${action}, 'appointment', ${appointmentId}, ${JSON.stringify(metadata)}::jsonb, ${at.toISOString()})`);
    laterSaves[action] = (laterSaves[action] ?? 0) + 1;
  }

  /**
   * A visit with ONE selectable mark, the 24 hour SMS, due 30 minutes before
   * `now`: it starts 23 and a half hours after `now` and was created 10 hours
   * before, which is after its 48 hour mark.
   */
  const smsVisit = (now: Date, over: { tenant?: string; startIn?: number; status?: string; origin?: string; booked?: boolean } = {}) =>
    visit({ now, startIn: over.startIn ?? 23 * H + 30, createdIn: -10 * H, ...over });

  /** A visit whose ONLY due mark is the 48 hour email, due 30 minutes before `now`. */
  const emailVisit = (now: Date, over: { tenant?: string } = {}) => visit({ now, startIn: 47 * H + 30, ...over });

  async function seedClaim(
    appointmentId: string,
    start: Date,
    over: { tenant?: string; taker?: "run" | "sweep"; early?: boolean; released?: boolean } = {},
  ): Promise<string> {
    const id = randomUUID();
    const tenant = over.tenant ?? tenantA;
    // The attempt as the writer numbers it (0106): the next one for this
    // reminder and start.
    await sql.execute(raw`insert into reminder_claims
      (id, tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt)
      values (${id}, ${tenant}, ${appointmentId}, 'claim', '24h', 'sms', ${start.toISOString()},
              ${plus(start, -24 * H).toISOString()}, ${over.taker ?? "run"}, ${over.early ?? false}::boolean,
              (select coalesce(max(attempt), 0) + 1 from reminder_claims
                where appointment_id = ${appointmentId} and kind = 'claim' and offset_id = '24h' and channel = 'sms'
                  and starts_at = ${start.toISOString()}::timestamptz))`);
    if (over.released) {
      await sql.execute(raw`insert into reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, claim_id)
        values (${tenant}, ${appointmentId}, 'release', '24h', 'sms', ${id})`);
    }
    return id;
  }

  /** A ledger row of the 24 hour SMS, as the dispatcher leaves one. */
  async function seedLedger(appointmentId: string, outcome: "sent" | "suppressed", reason: string | null, tenant = tenantA) {
    await sql.execute(raw`insert into reminder_dispatches (tenant_id, appointment_id, channel, template_id, outcome, suppression_reason)
      values (${tenant}, ${appointmentId}, 'sms', 'reminder.24h.sms', ${outcome}, ${reason})`);
  }

  /** A heartbeat for one tenant: what a pass of that mode leaves. */
  async function heartbeat(tenant: string, mode: "shadow" | "send", at: Date | string) {
    await sql.execute(raw`insert into reminder_sweep_passes
      (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count)
      values (${tenant}, 'floor-seed', ${mode}, ${typeof at === "string" ? at : at.toISOString()}, 0, 0, false, 0)`);
  }

  async function claimsOf(appointmentId: string): Promise<Row[]> {
    return rows(raw`select c.offset_id, c.channel, c.taker, c.early,
        to_char(c.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at,
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

  async function shadowsOf(appointmentId: string): Promise<number> {
    const [r] = await rows(raw`select count(*)::int as n from reminder_claims where appointment_id = ${appointmentId} and kind = 'shadow'`);
    return Number(r!.n);
  }

  /** The heartbeats of one pass, for this file's two tenants. */
  async function heartbeatsOf(passId: string): Promise<Row[]> {
    return rows(raw`select tenant_id::text as tenant_id, mode, due_count, recorded_count, over_ceiling, excluded_count,
        to_char(pass_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as pass_at
      from reminder_sweep_passes
      where pass_id = ${passId} and tenant_id in (${tenantA}, ${tenantB})
      order by tenant_id`);
  }

  /** Everything a send leaves, for the two tenants. */
  async function footprint() {
    const [f] = await rows(raw`select
      (select count(*)::int from reminder_dispatches where tenant_id in (${tenantA}, ${tenantB})) as ledger,
      (select count(*)::int from reminder_claims where tenant_id in (${tenantA}, ${tenantB}) and kind = 'claim') as claims,
      (select count(*)::int from reminder_claims where tenant_id in (${tenantA}, ${tenantB}) and kind = 'release') as releases`);
    return { ...f!, sends: h.sends.length };
  }

  /** Set the clock the dispatcher reads when it sends. `Date` only: timers and the database stay real. */
  function theSendClockReads(at: Date) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
  }

  /**
   * One tenant's sending pass at `now`. The system's clock reads `now` too,
   * as it does in a run that does not stall. `beforeEachSend` runs inside
   * every send step, before the dispatcher is called: the place where an arm
   * lets time go by, or changes a visit, between the selection and the send.
   */
  async function pass(
    tenant: string,
    now: Date,
    over: { limit?: number; passId?: string; includeNeverReminded?: boolean; beforeEachSend?: () => Promise<void> | void } = {},
  ) {
    const { sweepTenantSending } = await import("./sweep-send");
    theSendClockReads(now);
    return sweepTenantSending({
      tenantId: tenant,
      now: () => now,
      limit: over.limit ?? 50,
      passId: over.passId ?? `pass-${randomUUID()}`,
      includeNeverReminded: over.includeNeverReminded,
      step: async (id, fn) => {
        if (id.startsWith("sweep-send-")) await over.beforeEachSend?.();
        return fn();
      },
      alarm: (line) => h.alarms.push(line),
    });
  }

  /** The scheduled function's own handler, as the scheduler calls it. */
  async function runScheduledFunction(runId: string) {
    const { sweepDueReminders } = await import("./inngest/sweep");
    const handler = (sweepDueReminders as unknown as { fn: (ctx: unknown) => Promise<Record<string, unknown>> }).fn;
    const step = { run: async (_id: string, fn: () => Promise<unknown>) => fn() };
    return handler({ step, runId });
  }

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    for (const [tenant, t] of Object.entries(seeds)) {
      await sql.execute(raw`insert into tenants (id, name, slug, settings)
        values (${tenant}, 'Sweep Send Co', ${"sweepsend-" + tenant.slice(0, 8)},
                '{"locale":"pt","contacts":{"phone":"+351 210 000 000"}}'::jsonb)`);
      await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${t.therapist}, ${tenant}, ${"t-" + t.therapist.slice(0, 8) + "@t.test"}, 'Dra Sweep', true, true)`);
      await sql.execute(raw`insert into locations (id, tenant_id, name, phone) values (${t.location}, ${tenant}, 'Sede', '+351 210 000 000')`);
      await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone, email, reminder_sms_enabled, reminder_email_enabled)
        values (${t.patient}, ${tenant}, 'Paciente Sweep', '912345678', ${"p-" + t.patient.slice(0, 8) + "@p.test"}, true, true)`);
    }
    h.tenants = [tenantA, tenantB];
  });

  afterAll(async () => {
    if (!sql) return;
    for (const tenantId of [tenantA, tenantB]) {
      await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from reminder_claims where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from reminder_sweep_passes where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from tenants where id = ${tenantId}`);
    }
  });

  beforeEach(async () => {
    // THE FLOOR: the sweep has been SENDING for both tenants since long before
    // any mark an arm seeds, and nothing has interrupted it. Set again before
    // every arm, because the arms that run with the switch off leave shadow
    // heartbeats, and a shadow heartbeat ends a spell of sending. (The arms
    // of the floor replace one tenant's to prove the rule.)
    await sql.execute(raw`delete from reminder_sweep_passes where tenant_id in (${tenantA}, ${tenantB})`);
    for (const tenant of [tenantA, tenantB]) await heartbeat(tenant, "send", "2026-01-05T08:00:00Z");
    h.alarms.length = 0;
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.invalid";
    process.env.REMINDERS_SWEEP_MODE = "send";
    h.sends.length = 0;
    h.refuse.clear();
    h.sendDelayMs = 0;
    h.network.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    // Anything that reaches the network from here is a real send. Postgres does not use `fetch`.
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
    // Each arm starts from visits of its own: the earlier arms' are cancelled.
    await sql.execute(raw`update appointments set status = 'cancelled' where tenant_id in (${tenantA}, ${tenantB}) and status <> 'cancelled'`);
  });

  /* ---------------------------------------------------------------- */
  /* 1. The switch                                                     */
  /* ---------------------------------------------------------------- */

  describe("the scheduled function, by the switch", () => {
    it.each([undefined, "", "shadow", "SEND", "Send", " send", "send ", "true", "on"])(
      "REMINDERS_SWEEP_MODE=%j: a run writes the shadow's rows and NOTHING a send would leave",
      async (value) => {
        if (value === undefined) delete process.env.REMINDERS_SWEEP_MODE;
        else process.env.REMINDERS_SWEEP_MODE = value;
        // The handler reads the real clock: a visit whose 24 hour mark fell due 30 minutes ago.
        const now = new Date();
        const v = await smsVisit(now);
        const before = await footprint();
        const runId = `off-${randomUUID()}`;

        const out = await runScheduledFunction(runId);

        expect(out).toMatchObject({ mode: "shadow", tenants: 2, failedTenants: 0 });
        expect(await shadowsOf(v.id)).toBe(1);
        expect((await heartbeatsOf(runId)).map((x) => x.mode)).toEqual(["shadow", "shadow"]);
        // No claim, no release, no ledger row, no transport: exactly as before this change.
        expect(await footprint()).toEqual(before);
        expect(h.sends).toEqual([]);
        expect(await claimsOf(v.id)).toEqual([]);
        expect(await ledgerOf(v.id)).toEqual([]);
      },
    );

    it("REMINDERS_SWEEP_MODE=send: the same handler sends, writes no shadow row, and its heartbeat says send", async () => {
      const now = new Date();
      const v = await smsVisit(now);
      const runId = `on-${randomUUID()}`;

      const out = await runScheduledFunction(runId);

      expect(out).toMatchObject({ mode: "send", tenants: 2, failedTenants: 0, taken: 1, sent: 1 });
      expect(h.sends).toEqual([`sms:${v.id}`]);
      expect(await shadowsOf(v.id)).toBe(0);
      expect((await heartbeatsOf(runId)).map((x) => x.mode)).toEqual(["send", "send"]);
      expect(await ledgerOf(v.id)).toEqual(["reminder.24h.sms:sent:"]);
    });
  });

  /* ---------------------------------------------------------------- */
  /* 2. Sent once                                                      */
  /* ---------------------------------------------------------------- */

  it("a sending pass sends each due reminder ONCE, on its channel; the next pass takes nothing and a sleeping job is held", async () => {
    const now = clockOf(0);
    const sms = await smsVisit(now);
    const email = await emailVisit(now);
    // Not due, not ahead, not a status a reminder is sent for.
    const notDue = await visit({ now, startIn: 60 * H });
    const started = await visit({ now, startIn: -1 });
    const cancelled = await smsVisit(now, { status: "cancelled" });

    const first = await pass(tenantA, now, { passId: "sent-once-1" });
    expect(first).toEqual({ due: 2, taken: 2, sent: 2, heldBack: 0, tooLate: 0, claimHeld: 0, heldByDuplicate: 0, failed: 0, overCeiling: false, unsettledClaims: 0 });
    expect([...h.sends].sort()).toEqual([`email:${email.id}`, `sms:${sms.id}`].sort());
    expect(await claimsOf(sms.id)).toEqual([
      { offset_id: "24h", channel: "sms", taker: "sweep", early: false, starts_at: sms.start.toISOString(), released: false },
    ]);
    expect(await claimsOf(email.id)).toEqual([
      { offset_id: "48h", channel: "email", taker: "sweep", early: false, starts_at: email.start.toISOString(), released: false },
    ]);
    expect(await ledgerOf(sms.id)).toEqual(["reminder.24h.sms:sent:"]);
    expect(await ledgerOf(email.id)).toEqual(["reminder.48h.email:sent:"]);
    for (const other of [notDue, started, cancelled]) {
      expect(await claimsOf(other.id)).toEqual([]);
      expect(await ledgerOf(other.id)).toEqual([]);
    }
    expect(await heartbeatsOf("sent-once-1")).toEqual([
      { tenant_id: tenantA, mode: "send", due_count: 2, recorded_count: 2, over_ceiling: false, excluded_count: 0, pass_at: now.toISOString() },
    ]);

    // The next passes, 15 minutes and two hours on: nothing is due, nothing is sent.
    for (const later of [15, 2 * H]) {
      expect(await pass(tenantA, plus(now, later))).toMatchObject({ due: 0, taken: 0, sent: 0 });
    }
    // The sleeping job wakes after the pass: held, and it leaves nothing.
    const { dispatchReminder } = await import("./dispatch");
    const woke = { now: plus(now, 20) };
    expect(await dispatchReminder(tenantA, sms.id, "24h", "sms", "run", woke)).toEqual({ dispatched: false, reason: "claim_held" });
    expect(await dispatchReminder(tenantA, email.id, "48h", "email", "run", woke)).toEqual({ dispatched: false, reason: "claim_held" });
    expect(h.sends).toHaveLength(2);
    expect(await claimsOf(sms.id)).toHaveLength(1);
    expect(await ledgerOf(sms.id)).toEqual(["reminder.24h.sms:sent:"]);
  });

  /* ---------------------------------------------------------------- */
  /* 3. Held back is tried again; sent is final                        */
  /* ---------------------------------------------------------------- */

  it("HELD BACK IS TRIED AGAIN ONCE AN HOUR, sent when the visit is put right, and then never again (the real clock)", async () => {
    // THE REAL CLOCK, because a claim is stamped by the database's own.
    const t0 = new Date();
    // An online request nobody has accepted: the dispatcher holds its reminder back.
    const v = await smsVisit(t0, { origin: "patient_portal" });

    expect(await pass(tenantA, t0)).toMatchObject({ due: 1, taken: 1, sent: 0, heldBack: 1 });
    expect(await ledgerOf(v.id)).toEqual(["reminder.24h.sms:suppressed:unconfirmed"]);
    expect((await claimsOf(v.id)).map((c) => c.released)).toEqual([true]);

    // 15 and 59 minutes on: tried less than an hour ago, left alone.
    for (const later of [15, 59]) {
      expect(await pass(tenantA, plus(t0, later))).toMatchObject({ due: 0, taken: 0 });
    }
    expect(await ledgerOf(v.id)).toHaveLength(1);

    // 61 minutes on: taken again, held back again.
    expect(await pass(tenantA, plus(t0, 61))).toMatchObject({ due: 1, taken: 1, heldBack: 1 });
    expect((await claimsOf(v.id)).map((c) => c.released)).toEqual([true, true]);
    expect(h.sends).toEqual([]);

    // The clinic accepts the request. An hour after the last try the pass sends it.
    await sql.execute(raw`update appointments set status = 'confirmed' where id = ${v.id}`);
    expect(await pass(tenantA, plus(t0, 2 * H + 2))).toMatchObject({ due: 1, taken: 1, sent: 1, heldBack: 0 });
    expect(h.sends).toEqual([`sms:${v.id}`]);
    expect((await claimsOf(v.id)).map((c) => c.released)).toEqual([true, true, false]);

    // SENT IS FINAL: an hour on, a day on, the pass takes nothing, and nothing is sent.
    for (const later of [3 * H + 3, 4 * H + 4, 22 * H]) {
      expect(await pass(tenantA, plus(t0, later))).toMatchObject({ due: 0, taken: 0, sent: 0 });
    }
    expect(h.sends).toEqual([`sms:${v.id}`]);
    expect(await ledgerOf(v.id)).toEqual([
      "reminder.24h.sms:suppressed:unconfirmed",
      "reminder.24h.sms:suppressed:unconfirmed",
      "reminder.24h.sms:sent:",
    ]);
  });

  it("an UNKNOWN outcome is final too: the transport's answer is not on the list, and no later pass sends it again", async () => {
    const now = clockOf(1);
    const v = await smsVisit(now);
    h.refuse.add(v.id);
    expect(await pass(tenantA, now)).toMatchObject({ taken: 1, sent: 0, failed: 1 });
    h.refuse.clear();
    for (const later of [15, 61, 2 * H + 2]) {
      expect(await pass(tenantA, plus(now, later))).toMatchObject({ due: 0, taken: 0 });
    }
    expect(h.sends).toEqual([`sms:${v.id}`]);
    expect((await claimsOf(v.id)).map((c) => c.released)).toEqual([false]);
    expect(await ledgerOf(v.id)).toEqual(["reminder.24h.sms:provider_error:20500"]);
  });

  /* ---------------------------------------------------------------- */
  /* 4. Which rows settle a mark                                       */
  /* ---------------------------------------------------------------- */

  it("which rows settle a mark: a live claim of either sender does; a released, an early, another start's and a shadow row do not", async () => {
    const now = clockOf(2);
    const mk = () => smsVisit(now);
    const v = {
      liveRun: await mk(),
      liveSweep: await mk(),
      released: await mk(),
      early: await mk(),
      otherStart: await mk(),
      shadow: await mk(),
      liveAmongReleased: await mk(),
    };
    await seedClaim(v.liveRun.id, v.liveRun.start, { taker: "run" });
    await seedClaim(v.liveSweep.id, v.liveSweep.start, { taker: "sweep" });
    await seedClaim(v.released.id, v.released.start, { released: true });
    await seedClaim(v.early.id, v.early.start, { early: true });
    await seedClaim(v.otherStart.id, plus(v.otherStart.start, 60));
    await sql.execute(raw`insert into reminder_claims
      (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark)
      values (${tenantA}, ${v.shadow.id}, 'shadow', '24h', 'sms', ${v.shadow.start.toISOString()},
              ${plus(v.shadow.start, -24 * H).toISOString()}, 0, false)`);
    await seedClaim(v.liveAmongReleased.id, v.liveAmongReleased.start, { released: true });
    await seedClaim(v.liveAmongReleased.id, v.liveAmongReleased.start);

    const out = await pass(tenantA, now);
    expect(out).toMatchObject({ due: 4, taken: 4, sent: 4 });
    expect([...h.sends].sort()).toEqual([v.released, v.early, v.otherStart, v.shadow].map((x) => `sms:${x.id}`).sort());
  });

  /* ---------------------------------------------------------------- */
  /* 5. Two passes at once                                             */
  /* ---------------------------------------------------------------- */

  it("TWO PASSES AT ONCE send each reminder once", async () => {
    const now = clockOf(3);
    const visits = [await smsVisit(now), await smsVisit(now), await emailVisit(now)];
    h.sendDelayMs = 150;
    const [a, b] = await Promise.all([pass(tenantA, now), pass(tenantA, now)]);
    expect(a.sent + b.sent).toBe(3);
    expect(a.failed + b.failed).toBe(0);
    // Whatever one pass did not send, the claim held it for the other.
    expect(a.sent + a.claimHeld + a.heldByDuplicate + b.sent + b.claimHeld + b.heldByDuplicate).toBe(a.taken + b.taken);
    expect([...h.sends].sort()).toEqual([`sms:${visits[0]!.id}`, `sms:${visits[1]!.id}`, `email:${visits[2]!.id}`].sort());
    for (const v of visits) {
      expect(await claimsOf(v.id)).toHaveLength(1);
      expect((await ledgerOf(v.id)).filter((l) => l.includes(":sent:"))).toHaveLength(1);
    }
  });

  /* ---------------------------------------------------------------- */
  /* 6. The second switch                                              */
  /* ---------------------------------------------------------------- */

  it("a visit that NEVER HAD A REMINDER is taken only while the second switch is exactly on", async () => {
    const now = clockOf(4);
    const never = await smsVisit(now, { booked: false });
    const booked = await smsVisit(now);

    // Off: unset, and every near-miss. Left out, and counted on the heartbeat.
    const off = await pass(tenantA, now, { passId: "s12-off" });
    expect(off).toMatchObject({ due: 1, taken: 1, sent: 1 });
    expect(h.sends).toEqual([`sms:${booked.id}`]);
    expect((await heartbeatsOf("s12-off"))[0]).toMatchObject({ excluded_count: 1 });
    for (const value of ["ON", "On", " on", "true", "1", "send"]) {
      process.env.REMINDERS_SWEEP_NEVER_REMINDED = value;
      expect(await pass(tenantA, plus(now, 15)), JSON.stringify(value)).toMatchObject({ due: 0, taken: 0 });
    }
    expect(await claimsOf(never.id)).toEqual([]);
    expect(await ledgerOf(never.id)).toEqual([]);

    // On: taken, and sent like any other. Nothing is left out any more.
    process.env.REMINDERS_SWEEP_NEVER_REMINDED = "on";
    const on = await pass(tenantA, plus(now, 20), { passId: "s12-on" });
    expect(on).toMatchObject({ due: 1, taken: 1, sent: 1 });
    expect(h.sends).toEqual([`sms:${booked.id}`, `sms:${never.id}`]);
    expect((await heartbeatsOf("s12-on"))[0]).toMatchObject({ excluded_count: 0 });
    expect(await ledgerOf(never.id)).toEqual(["reminder.24h.sms:sent:"]);
  });

  it("the second switch alone sends nothing: with the send switch off the scheduled function is the shadow, and leaves the visit out", async () => {
    delete process.env.REMINDERS_SWEEP_MODE;
    process.env.REMINDERS_SWEEP_NEVER_REMINDED = "on";
    const now = new Date();
    const never = await smsVisit(now, { booked: false });
    const out = await runScheduledFunction(`s12-alone-${randomUUID()}`);
    expect(out).toMatchObject({ mode: "shadow" });
    expect(h.sends).toEqual([]);
    expect(await shadowsOf(never.id)).toBe(0);
    expect(await claimsOf(never.id)).toEqual([]);
  });

  /* ---------------------------------------------------------------- */
  /* 7. The ceiling, two tenants, a mark that fails                    */
  /* ---------------------------------------------------------------- */

  it("the ceiling: oldest mark first, the rest on the next pass, and the heartbeat says so", async () => {
    const now = clockOf(5);
    // Three marks, due 40, 30 and 20 minutes ago.
    const oldest = await smsVisit(now, { startIn: 23 * H + 20 });
    const middle = await smsVisit(now, { startIn: 23 * H + 30 });
    const newest = await smsVisit(now, { startIn: 23 * H + 40 });

    const first = await pass(tenantA, now, { limit: 2, passId: "ceiling-1" });
    expect(first).toMatchObject({ due: 3, taken: 2, sent: 2, overCeiling: true });
    expect(h.sends).toEqual([`sms:${oldest.id}`, `sms:${middle.id}`]);
    expect((await heartbeatsOf("ceiling-1"))[0]).toMatchObject({ due_count: 3, recorded_count: 2, over_ceiling: true });

    const second = await pass(tenantA, plus(now, 15), { limit: 2, passId: "ceiling-2" });
    expect(second).toMatchObject({ due: 1, taken: 1, sent: 1, overCeiling: false });
    expect(h.sends[2]).toBe(`sms:${newest.id}`);

    // A limit of nothing: counted, not taken, and still a heartbeat.
    const another = await smsVisit(plus(now, 30));
    const none = await pass(tenantA, plus(now, 30), { limit: 0, passId: "ceiling-3" });
    expect(none).toMatchObject({ due: 1, taken: 0, sent: 0, overCeiling: true });
    expect(await claimsOf(another.id)).toEqual([]);
    expect(await heartbeatsOf("ceiling-3")).toHaveLength(1);
  });

  it("two tenants: each pass sends its own tenant's reminders only, and a mark that fails does not stop the next", async () => {
    const now = clockOf(6);
    const a1 = await smsVisit(now, { startIn: 23 * H + 20 });
    const a2 = await smsVisit(now, { startIn: 23 * H + 30 });
    const a3 = await smsVisit(now, { startIn: 23 * H + 40 });
    const b1 = await smsVisit(now, { tenant: tenantB });
    h.refuse.add(a2.id);

    const outA = await pass(tenantA, now);
    expect(outA).toMatchObject({ due: 3, taken: 3, sent: 2, failed: 1 });
    expect(h.sends).toEqual([`sms:${a1.id}`, `sms:${a2.id}`, `sms:${a3.id}`]);
    expect(await claimsOf(b1.id)).toEqual([]);

    const outB = await pass(tenantB, now);
    expect(outB).toMatchObject({ due: 1, taken: 1, sent: 1 });
    expect(h.sends[3]).toBe(`sms:${b1.id}`);
    const [claim] = await rows(raw`select tenant_id::text as tenant_id from reminder_claims where appointment_id = ${b1.id}`);
    expect(claim!.tenant_id).toBe(tenantB);
  });

  /* ---------------------------------------------------------------- */
  /* 8. The late rule                                                  */
  /* ---------------------------------------------------------------- */

  /** A visit whose only selectable mark is the 24 hour SMS, due `minutesAgo` before `now`. */
  const smsDue = (now: Date, minutesAgo: number, over: { origin?: string; tenant?: string } = {}) =>
    smsVisit(now, { startIn: 24 * H - minutesAgo, ...over });
  /** A visit whose only DUE mark is the 48 hour email, due `minutesAgo` before `now`. */
  const emailDue = (now: Date, minutesAgo: number, over: { origin?: string; tenant?: string } = {}) =>
    visit({ now, startIn: 48 * H - minutesAgo, ...over });

  it("THE LATE RULE: 3 hours for an SMS and 12 for an email are still sent; a minute later each is recorded as too late, once, and never sent", async () => {
    const now = clockOf(7);
    const v = {
      smsAtLimit: await smsDue(now, 3 * H),
      smsLate: await smsDue(now, 3 * H + 1),
      emailAtLimit: await emailDue(now, 12 * H),
      emailLate: await emailDue(now, 12 * H + 1),
    };

    const out = await pass(tenantA, now, { passId: "late-rule-1" });
    expect(out).toEqual({ due: 4, taken: 4, sent: 2, heldBack: 0, tooLate: 2, claimHeld: 0, heldByDuplicate: 0, failed: 0, overCeiling: false, unsettledClaims: 0 });
    // The heartbeat counts the marks handed to the dispatcher, the two it did not send included.
    expect((await heartbeatsOf("late-rule-1"))[0]).toMatchObject({ mode: "send", due_count: 4, recorded_count: 4 });
    expect([...h.sends].sort()).toEqual([`email:${v.emailAtLimit.id}`, `sms:${v.smsAtLimit.id}`].sort());
    expect(await ledgerOf(v.smsAtLimit.id)).toEqual(["reminder.24h.sms:sent:"]);
    expect(await ledgerOf(v.emailAtLimit.id)).toEqual(["reminder.48h.email:sent:"]);
    // TOO LATE: one row that says so, and a claim that is KEPT, so it is final.
    expect(await ledgerOf(v.smsLate.id)).toEqual(["reminder.24h.sms:suppressed:mark_missed"]);
    expect(await ledgerOf(v.emailLate.id)).toEqual(["reminder.48h.email:suppressed:mark_missed"]);
    expect((await claimsOf(v.smsLate.id)).map((c) => [c.taker, c.released])).toEqual([["sweep", false]]);
    expect((await claimsOf(v.emailLate.id)).map((c) => [c.taker, c.released])).toEqual([["sweep", false]]);

    // Never again: not by a later pass, not by a sleeping job.
    for (const later of [15, 61, 5 * H]) {
      expect(await pass(tenantA, plus(now, later))).toMatchObject({ due: 0, taken: 0 });
    }
    const { dispatchReminder } = await import("./dispatch");
    expect(await dispatchReminder(tenantA, v.smsLate.id, "24h", "sms", "run", { now: plus(now, 20) })).toEqual({
      dispatched: false,
      reason: "claim_held",
    });
    expect(h.sends).toHaveLength(2);
    expect(await ledgerOf(v.smsLate.id)).toHaveLength(1);
  });

  it("a reminder HELD BACK until its limit runs out is then recorded as too late, and putting the visit right afterwards sends nothing", async () => {
    const now = clockOf(8);
    // An online request nobody accepted, its SMS due 2 hours 50 minutes ago.
    const v = await smsDue(now, 2 * H + 50, { origin: "patient_portal" });

    expect(await pass(tenantA, now)).toMatchObject({ taken: 1, heldBack: 1, tooLate: 0 });
    // 20 minutes on it is 3 hours 10 minutes late.
    expect(await pass(tenantA, plus(now, 20))).toMatchObject({ taken: 1, heldBack: 0, tooLate: 1 });
    expect(await ledgerOf(v.id)).toEqual(["reminder.24h.sms:suppressed:unconfirmed", "reminder.24h.sms:suppressed:mark_missed"]);
    expect((await claimsOf(v.id)).map((c) => c.released)).toEqual([true, false]);

    await sql.execute(raw`update appointments set status = 'confirmed' where id = ${v.id}`);
    for (const later of [40, 2 * H]) {
      expect(await pass(tenantA, plus(now, later))).toMatchObject({ due: 0, taken: 0 });
    }
    expect(h.sends).toEqual([]);
  });

  it("under the ceiling the marks that can still go out are taken BEFORE the ones that are only too late, though those are older", async () => {
    const now = clockOf(9);
    const late1 = await smsDue(now, 5 * H);
    const late2 = await smsDue(now, 4 * H);
    const inTime1 = await smsDue(now, 2 * H);
    const inTime2 = await smsDue(now, 1 * H);

    const first = await pass(tenantA, now, { limit: 2 });
    expect(first).toMatchObject({ due: 4, taken: 2, sent: 2, tooLate: 0, overCeiling: true });
    expect(h.sends).toEqual([`sms:${inTime1.id}`, `sms:${inTime2.id}`]);
    expect(await ledgerOf(late1.id)).toEqual([]);

    const second = await pass(tenantA, plus(now, 15), { limit: 2 });
    expect(second).toMatchObject({ due: 2, taken: 2, sent: 0, tooLate: 2, overCeiling: false });
    expect(await ledgerOf(late1.id)).toEqual(["reminder.24h.sms:suppressed:mark_missed"]);
    expect(await ledgerOf(late2.id)).toEqual(["reminder.24h.sms:suppressed:mark_missed"]);
    expect(h.sends).toHaveLength(2);
  });

  /* ---------------------------------------------------------------- */
  /* 8b. The late rule is judged when the send step runs               */
  /* ---------------------------------------------------------------- */

  describe("A SEND STEP THAT RUNS HOURS AFTER ITS SELECTION is judged at the hour it runs", () => {
    it("the SMS selected 30 minutes late and sent 4 hours later is NOT sent: recorded too late, once, claim kept", async () => {
      const now = clockOf(11);
      const v = await smsDue(now, 30);
      // The run stalls between its selection and its send: the send step runs four hours on.
      const out = await pass(tenantA, now, { passId: "stall-sms", beforeEachSend: () => theSendClockReads(plus(now, 4 * H)) });

      expect(out).toMatchObject({ due: 1, taken: 1, sent: 0, tooLate: 1 });
      expect(h.sends).toEqual([]);
      expect(await ledgerOf(v.id)).toEqual(["reminder.24h.sms:suppressed:mark_missed"]);
      expect((await claimsOf(v.id)).map((c) => [c.taker, c.released])).toEqual([["sweep", false]]);
      // The heartbeat still carries the instant of the selection: it is the pass's clock, and only that.
      expect((await heartbeatsOf("stall-sms"))[0]).toMatchObject({ pass_at: now.toISOString(), recorded_count: 1 });
      // Final: no later pass and no sleeping job sends it.
      for (const later of [4 * H + 15, 5 * H + 30]) {
        expect(await pass(tenantA, plus(now, later))).toMatchObject({ due: 0, taken: 0 });
      }
      expect(h.sends).toEqual([]);
    });

    it("the email selected 30 minutes late and sent 13 hours later is NOT sent", async () => {
      const now = clockOf(12);
      const v = await emailDue(now, 30);
      const out = await pass(tenantA, now, { beforeEachSend: () => theSendClockReads(plus(now, 13 * H)) });
      expect(out).toMatchObject({ taken: 1, sent: 0, tooLate: 1 });
      expect(h.sends).toEqual([]);
      expect(await ledgerOf(v.id)).toEqual(["reminder.48h.email:suppressed:mark_missed"]);
    });

    it("CONTROL: the same two reminders, in a run that stalls for less than their limit, ARE sent", async () => {
      const now = clockOf(13);
      const sms = await smsDue(now, 30);
      const email = await emailDue(now, 30);
      // Two hours on: the SMS is 2 hours 30 late, the email too. Both inside their limit.
      const out = await pass(tenantA, now, { beforeEachSend: () => theSendClockReads(plus(now, 2 * H)) });
      expect(out).toMatchObject({ taken: 2, sent: 2, tooLate: 0 });
      expect([...h.sends].sort()).toEqual([`email:${email.id}`, `sms:${sms.id}`].sort());
    });

    it("THE FLOOR UNDER EVERY SEND: a send step that runs after the visit has BEGUN sends nothing, and says `start_passed`", async () => {
      const now = clockOf(14);
      // The 48 hour email, 8 hours late at the selection: the visit starts 40 hours on.
      const email = await emailDue(now, 8 * H);
      // The 24 hour SMS, 30 minutes late: the visit starts 23 and a half hours on.
      const sms = await smsDue(now, 30);
      // The send steps run 41 hours on. Both visits have begun.
      const out = await pass(tenantA, now, { beforeEachSend: () => theSendClockReads(plus(now, 41 * H)) });

      expect(out).toMatchObject({ due: 2, taken: 2, sent: 0, tooLate: 2 });
      expect(h.sends).toEqual([]);
      expect(await ledgerOf(email.id)).toEqual(["reminder.48h.email:suppressed:start_passed"]);
      expect(await ledgerOf(sms.id)).toEqual(["reminder.24h.sms:suppressed:start_passed"]);
      expect((await claimsOf(email.id)).map((c) => c.released)).toEqual([false]);
    });

    it("a visit cancelled during the stall, and by then too late, is recorded as cancelled (`status`), once, and its claim is kept", async () => {
      const now = clockOf(15);
      const v = await smsDue(now, 30);
      const out = await pass(tenantA, now, {
        beforeEachSend: async () => {
          await sql.execute(raw`update appointments set status = 'cancelled' where id = ${v.id}`);
          theSendClockReads(plus(now, 4 * H));
        },
      });
      expect(out).toMatchObject({ taken: 1, sent: 0 });
      expect(h.sends).toEqual([]);
      expect(await ledgerOf(v.id)).toEqual(["reminder.24h.sms:suppressed:status"]);
      expect((await claimsOf(v.id)).map((c) => c.released)).toEqual([false]);
    });
  });

  /* ---------------------------------------------------------------- */
  /* 9. The floor                                                      */
  /* ---------------------------------------------------------------- */

  it("THE FLOOR IS THE MOMENT THE SWITCH WAS TURNED: nothing that fell due before the first sending heartbeat is ever taken, whatever the sleeping job left on record", async () => {
    const now = clockOf(10);
    // Tenant B has been swept IN SHADOW for months, up to a quarter of an hour ago. It has never been sent for.
    await sql.execute(raw`delete from reminder_sweep_passes where tenant_id = ${tenantB}`);
    await heartbeat(tenantB, "shadow", "2026-01-05T08:00:00Z");
    await heartbeat(tenantB, "shadow", plus(now, -15));

    // Three reminders that fell due 30 minutes ago, while the sleeping job was the sender:
    // (b) SENT WHILE THE CLAIM STORE FAILED: a `sent` row in the ledger and NO claim.
    const sentWithoutClaim = await smsVisit(now, { tenant: tenantB });
    await seedLedger(sentWithoutClaim.id, "sent", null, tenantB);
    // (a) HELD BACK by the sleeping job: under the rules of today its claim was kept.
    const heldBack = await smsVisit(now, { tenant: tenantB, origin: "patient_portal" });
    await seedClaim(heldBack.id, heldBack.start, { tenant: tenantB });
    await seedLedger(heldBack.id, "suppressed", "unconfirmed", tenantB);
    // And one with nothing on record at all: sent before claims existed, or never.
    const nothingOnRecord = await smsVisit(now, { tenant: tenantB });

    // THE FIRST SENDING PASS takes nothing and sends nothing. It writes the first sending heartbeat.
    const first = await pass(tenantB, now, { passId: "floor-1" });
    expect(first).toMatchObject({ due: 0, taken: 0, sent: 0 });
    expect(h.sends).toEqual([]);
    expect(await heartbeatsOf("floor-1")).toEqual([
      { tenant_id: tenantB, mode: "send", due_count: 0, recorded_count: 0, over_ceiling: false, excluded_count: 0, pass_at: now.toISOString() },
    ]);

    // A reminder that falls due 10 minutes AFTER that heartbeat, and one due at its very instant: taken.
    const after = await smsVisit(now, { tenant: tenantB, startIn: 24 * H + 10 });
    const atFloor = await smsVisit(now, { tenant: tenantB, startIn: 24 * H });
    const second = await pass(tenantB, plus(now, 15));
    expect(second).toMatchObject({ due: 2, taken: 2, sent: 2 });
    expect([...h.sends].sort()).toEqual([`sms:${after.id}`, `sms:${atFloor.id}`].sort());

    // The clinic accepts the request that was held back. It fell due before the switch: still not the sweep's.
    await sql.execute(raw`update appointments set status = 'confirmed' where id = ${heldBack.id}`);
    for (const later of [30, 90, 2 * H]) {
      expect(await pass(tenantB, plus(now, later))).toMatchObject({ due: 0, taken: 0 });
    }
    expect(h.sends).toHaveLength(2);
    expect(await ledgerOf(sentWithoutClaim.id)).toEqual(["reminder.24h.sms:sent:"]);
    expect(await claimsOf(sentWithoutClaim.id)).toEqual([]);
    expect(await ledgerOf(heldBack.id)).toEqual(["reminder.24h.sms:suppressed:unconfirmed"]);
    expect(await claimsOf(heldBack.id)).toHaveLength(1);
    expect(await claimsOf(nothingOnRecord.id)).toEqual([]);
    expect(await ledgerOf(nothingOnRecord.id)).toEqual([]);

    // THE SWITCH IS TURNED OFF AND ON AGAIN. Three hours on a shadow pass ran: that spell of sending is over.
    await heartbeat(tenantB, "shadow", plus(now, 3 * H));
    // A reminder that fell due while the switch was off (2 hours 40 on), which the sleeping job handled.
    const whileOff = await smsVisit(now, { tenant: tenantB, startIn: 24 * H + 2 * H + 40 });
    const again = await pass(tenantB, plus(now, 3 * H + 10), { passId: "floor-2" });
    expect(again).toMatchObject({ due: 0, taken: 0, sent: 0 });
    expect(await heartbeatsOf("floor-2")).toHaveLength(1);
    // From the new spell's first heartbeat on, marks are taken again; the one from the gap never is.
    const afterAgain = await smsVisit(now, { tenant: tenantB, startIn: 24 * H + 3 * H + 20 });
    expect(await pass(tenantB, plus(now, 3 * H + 25))).toMatchObject({ due: 1, taken: 1, sent: 1 });
    expect(h.sends[2]).toBe(`sms:${afterAgain.id}`);
    expect(await claimsOf(whileOff.id)).toEqual([]);
    expect(await ledgerOf(whileOff.id)).toEqual([]);

    // CONTROL: tenant A, sending without a break since long ago, takes the same kind of mark.
    const control = await smsVisit(now);
    expect(await pass(tenantA, now)).toMatchObject({ due: 1, taken: 1, sent: 1 });
    expect(h.sends).toContain(`sms:${control.id}`);
  });

  it("a tenant with no heartbeat at all is not swept either: its first sending pass writes one and starts from there", async () => {
    const now = clockOf(16);
    await sql.execute(raw`delete from reminder_sweep_passes where tenant_id = ${tenantB}`);
    const before = await smsVisit(now, { tenant: tenantB });
    expect(await pass(tenantB, now)).toMatchObject({ due: 0, taken: 0, sent: 0 });
    const after = await smsVisit(now, { tenant: tenantB, startIn: 24 * H + 10 });
    expect(await pass(tenantB, plus(now, 15))).toMatchObject({ due: 1, taken: 1, sent: 1 });
    expect(h.sends).toEqual([`sms:${after.id}`]);
    expect(await claimsOf(before.id)).toEqual([]);
  });

  /* ---------------------------------------------------------------- */
  /* 10. A visit moved later between the selection and the send        */
  /* ---------------------------------------------------------------- */

  describe("the day's last pass, and a visit moved while it runs", () => {
    // 21:45 Lisbon on the Monday of the arm's week (winter time: Lisbon is UTC).
    const lastPassOf = (week: number) => lisbonDateTimeToUtc(addDays(FIRST_MONDAY, week * 7), "21:45");

    it("A VISIT MOVED TWO DAYS LATER between the selection and the send is NOT reminded early, takes no claim, and is reminded at its new time", async () => {
      const now = lastPassOf(17);
      // Its 24 hour SMS falls due at 22:30, 45 minutes ahead: the last pass takes it ahead.
      const v = await smsVisit(now, { startIn: 24 * H + 45 });
      const movedStart = plus(v.start, 2 * 24 * H);

      const out = await pass(tenantA, now, {
        beforeEachSend: async () => {
          await sql.execute(raw`update appointments set starts_at = ${movedStart.toISOString()}, ends_at = ${plus(movedStart, 45).toISOString()} where id = ${v.id}`);
        },
      });

      expect(out).toMatchObject({ due: 1, taken: 1, sent: 0, heldBack: 1 });
      expect(h.sends).toEqual([]);
      // NO CLAIM: nothing blocks the reminder at the right time.
      expect(await claimsOf(v.id)).toEqual([]);
      expect(await ledgerOf(v.id)).toEqual(["reminder.24h.sms:suppressed:not_due"]);

      // Two days on, at its new time, a pass sends it: once. (The move also gave the visit a 48 hour
      // email time, a day gone by then: that one is recorded as too late.)
      const due = plus(movedStart, -24 * H);
      expect(await pass(tenantA, plus(due, 5))).toMatchObject({ due: 2, taken: 2, sent: 1, tooLate: 1 });
      expect(h.sends).toEqual([`sms:${v.id}`]);
      expect((await claimsOf(v.id)).filter((c) => c.offset_id === "24h").map((c) => [c.starts_at, c.early, c.released])).toEqual([
        [movedStart.toISOString(), false, false],
      ]);
    });

    it("CONTROL: the same visit, not moved, IS taken ahead by the last pass and sent, and its claim holds in the morning", async () => {
      const now = lastPassOf(18);
      const v = await smsVisit(now, { startIn: 24 * H + 45 });
      expect(await pass(tenantA, now)).toMatchObject({ due: 1, taken: 1, sent: 1 });
      expect(h.sends).toEqual([`sms:${v.id}`]);
      expect((await claimsOf(v.id)).map((c) => [c.early, c.released])).toEqual([[false, false]]);
      // 07:00 the next morning: nothing to take.
      expect(await pass(tenantA, plus(now, 9 * H + 15))).toMatchObject({ due: 0, taken: 0 });
      expect(h.sends).toHaveLength(1);
    });
  });

  /* ---------------------------------------------------------------- */
  /* 11. A claim with nothing after it                                 */
  /* ---------------------------------------------------------------- */

  describe("A CLAIM WITH NOTHING AFTER IT: a sender died between its claim and its send", () => {
    it("every later pass counts it and names its appointment, and nobody sends it again", async () => {
      const now = clockOf(19);
      const v = {
        // What a crash between the claim and the send leaves: a live claim, and no ledger row.
        stranded: await smsVisit(now),
        strandedRun: await smsVisit(now),
        // Settled, each in its own way: none of these is counted.
        sent: await smsVisit(now),
        tooLate: await smsVisit(now),
        released: await smsVisit(now),
        early: await smsVisit(now),
      };
      await seedClaim(v.stranded.id, v.stranded.start, { taker: "sweep" });
      await seedClaim(v.strandedRun.id, v.strandedRun.start, { taker: "run" });
      await seedClaim(v.sent.id, v.sent.start, { taker: "sweep" });
      await seedLedger(v.sent.id, "sent", null);
      await seedClaim(v.tooLate.id, v.tooLate.start, { taker: "sweep" });
      await seedLedger(v.tooLate.id, "suppressed", "mark_missed");
      await seedClaim(v.released.id, v.released.start, { released: true });
      await seedClaim(v.early.id, v.early.start, { early: true });
      // A stranded claim of a visit that has begun is no longer reported.
      const begun = await visit({ now, startIn: -30 });
      await seedClaim(begun.id, begun.start, { taker: "sweep" });
      // And another tenant's stranded claim is that tenant's.
      const other = await smsVisit(now, { tenant: tenantB });
      await seedClaim(other.id, other.start, { tenant: tenantB, taker: "sweep" });

      const named = [v.stranded.id, v.strandedRun.id].sort().join(",");
      for (const later of [0, 15, 3 * H]) {
        h.alarms.length = 0;
        const out = await pass(tenantA, plus(now, later));
        // The released and the early one are taken and sent on the first pass; the stranded two never are.
        expect(out.unsettledClaims, `pass at +${later}`).toBe(2);
        expect(h.alarms.filter((l) => l.includes("UNSETTLED CLAIMS"))).toEqual([
          `[reminders] sweep: UNSETTLED CLAIMS tenantId=${tenantA} count=2 appointmentIds=${named}: ` +
            `a claim was taken and nothing was recorded after it. Whether the reminder left is not known. It is not sent again.`,
        ]);
      }
      expect([...h.sends].sort()).toEqual([`sms:${v.released.id}`, `sms:${v.early.id}`].sort());
      expect(await ledgerOf(v.stranded.id)).toEqual([]);
      expect(await claimsOf(v.stranded.id)).toHaveLength(1);
      // A sleeping job that wakes for it is held too: an unknown outcome is not sent twice.
      const { dispatchReminder } = await import("./dispatch");
      expect(await dispatchReminder(tenantA, v.stranded.id, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });
      expect(await pass(tenantB, now)).toMatchObject({ unsettledClaims: 1 });
    });

    it("a claim taken a moment ago is a send in progress, not a stranded one (the real clock)", async () => {
      const t0 = new Date();
      // To the real clock every claim an earlier arm left is ahead and will soon be old: this arm starts from none.
      await sql.execute(raw`delete from reminder_claims where tenant_id = ${tenantA}`);
      const v = await smsVisit(t0);
      await seedClaim(v.id, v.start, { taker: "sweep" });
      expect(await pass(tenantA, t0)).toMatchObject({ unsettledClaims: 0 });
      expect(h.alarms).toEqual([]);
      // Sixteen minutes on, with still nothing after it, it is one.
      expect(await pass(tenantA, plus(t0, 16))).toMatchObject({ unsettledClaims: 1 });
    });

    it("the pass says it once, inside its selection step: a run the scheduler resumes does not say it again", async () => {
      const now = clockOf(20);
      const v = await smsVisit(now);
      await seedClaim(v.id, v.start, { taker: "sweep" });
      const { sweepTenantSending } = await import("./sweep-send");
      const stored = new Map<string, unknown>();
      const step = async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
        if (!stored.has(id)) stored.set(id, JSON.parse(JSON.stringify(await fn())));
        return stored.get(id) as T;
      };
      for (let resumed = 0; resumed < 3; resumed++) {
        const out = await sweepTenantSending({ tenantId: tenantA, now: () => now, limit: 50, step, alarm: (l) => h.alarms.push(l) });
        expect(out.unsettledClaims).toBe(1);
      }
      expect(h.alarms.filter((l) => l.includes("UNSETTLED CLAIMS"))).toHaveLength(1);
    });
  });

  /* ---------------------------------------------------------------- */
  /* 12. R24: no grace for a visit saved after its mark                */
  /* ---------------------------------------------------------------- */

  /**
   * R24, strategy's ruling: "S5 grace = none. GATE: a visit saved after its
   * mark and before the pass gets no shadow row and no send; a visit saved
   * before its mark is unchanged." The sending pass reads the same gate as the
   * shadow (sweep.ts `notSavedAfterMark`): a scheduling save, by its own
   * `created_at`, strictly after the mark. AT the mark counts as before it.
   */
  it("R24: a visit SAVED AFTER ITS MARK and before the pass is not sent, takes no claim and leaves no ledger row; saved before or AT its mark it is sent", async () => {
    const now = clockOf(21);
    const mk = async (startIn: number, over: { booked?: boolean } = {}) => {
      const v = await smsVisit(now, { startIn, ...over });
      return { ...v, mark: plus(v.start, -24 * H) };
    };
    // Each: the 24 hour SMS, due about 30 minutes before the pass.
    const before = await mk(23 * H + 30);
    const movedAfter = await mk(23 * H + 31);
    const movedAtMark = await mk(23 * H + 32);
    const acceptedAfter = await mk(23 * H + 33, { booked: false });
    await savedAt(movedAfter.id, "appointment.reschedule", { startsAt: movedAfter.start.toISOString() }, plus(movedAfter.mark, 1));
    await savedAt(movedAtMark.id, "appointment.reschedule", { startsAt: movedAtMark.start.toISOString() }, movedAtMark.mark);
    await savedAt(acceptedAfter.id, "appointment.update", { via: "portal_request_confirm" }, plus(acceptedAfter.mark, 5));

    expect(await pass(tenantA, now)).toMatchObject({ due: 2, taken: 2, sent: 2 });
    expect([...h.sends].sort()).toEqual([`sms:${before.id}`, `sms:${movedAtMark.id}`].sort());
    for (const v of [movedAfter, acceptedAfter]) {
      expect(await claimsOf(v.id)).toEqual([]);
      expect(await ledgerOf(v.id)).toEqual([]);
      expect(await shadowsOf(v.id)).toBe(0);
    }

    // Never, for that start: an hour on, with the second switch on as well, nothing more is taken.
    process.env.REMINDERS_SWEEP_NEVER_REMINDED = "on";
    expect(await pass(tenantA, plus(now, 61))).toMatchObject({ due: 0, taken: 0, sent: 0 });
    expect(await pass(tenantA, plus(now, 61), { includeNeverReminded: true })).toMatchObject({ due: 0, taken: 0 });
    expect(h.sends).toHaveLength(2);
  });

  /**
   * "BEFORE THE PASS" IS BEFORE THE MARK WAS FIRST HANDED OVER. A reminder the
   * dispatcher held back is tried again (the owner's rule), and a save written
   * after that first try does not stop the retry. A save written before any
   * try does.
   */
  it("R24: a reminder HELD BACK before a save after its mark is still tried again and sent; one saved after its mark before any try is never taken", async () => {
    const now = clockOf(22);
    // An online request nobody has accepted: held back at the first pass.
    const heldBack = await smsVisit(now, { origin: "patient_portal" });
    // A booked visit moved to this start after its mark, before the first pass.
    const confirmedFirst = await smsVisit(now, { startIn: 23 * H + 31 });
    await savedAt(confirmedFirst.id, "appointment.reschedule", { startsAt: confirmedFirst.start.toISOString() }, plus(confirmedFirst.start, -24 * H + 5));

    expect(await pass(tenantA, now)).toMatchObject({ due: 1, taken: 1, sent: 0, heldBack: 1 });
    expect(await ledgerOf(heldBack.id)).toEqual(["reminder.24h.sms:suppressed:unconfirmed"]);
    expect((await claimsOf(heldBack.id)).map((c) => c.released)).toEqual([true]);

    // The clinic accepts the request after the mark and after that first try.
    await sql.execute(raw`update appointments set status = 'confirmed' where id = ${heldBack.id}`);
    await savedAt(heldBack.id, "appointment.update", { via: "portal_request_confirm" }, plus(now, 10));

    // An hour after the try: tried again and sent. The visit saved before any try is still not taken.
    expect(await pass(tenantA, plus(now, 61))).toMatchObject({ due: 1, taken: 1, sent: 1 });
    expect(h.sends).toEqual([`sms:${heldBack.id}`]);
    expect(await claimsOf(confirmedFirst.id)).toEqual([]);
    expect(await ledgerOf(confirmedFirst.id)).toEqual([]);
  });

  /**
   * The other side of the same rule: a claim taken AFTER the save does not
   * lift the gate. A claim is stamped by the database's own clock, so this
   * arm runs on the real clock and writes the save before the claim.
   */
  it("R24: a claim taken only AFTER the save does not lift the gate (the real clock)", async () => {
    const t0 = new Date();
    const v = await smsVisit(t0);
    // Moved to this start one minute after its mark, 29 minutes ago.
    await savedAt(v.id, "appointment.reschedule", { startsAt: v.start.toISOString() }, plus(v.start, -24 * H + 1));
    // A claim of this mark, given up, taken NOW: after the save.
    await seedClaim(v.id, v.start, { released: true });
    expect(await pass(tenantA, plus(t0, 61))).toMatchObject({ due: 0, taken: 0, sent: 0 });
    expect(h.sends).toEqual([]);
    expect(await ledgerOf(v.id)).toEqual([]);
  });

  /**
   * R33: a save that re-armed nothing does not keep a mark out of the sending
   * pass either. Strategy, its words: "A status-only save (an SMS "confirmo",
   * a hand-set Confirmada) never counts." So the reminder of a booked visit
   * confirmed after its mark, before any pass took it, is sent as before R24
   * (this was the case the PR first left without one). The same rows on an
   * online request ARE its acceptance, re-armed the sleeping job, and keep the
   * mark out.
   */
  it("R33: a booked visit confirmed by hand, in the review queue or by SMS after its mark IS sent; a request accepted that way after its mark is not", async () => {
    const now = clockOf(17);
    // Confirmed visits of one therapist may not overlap: 50 minutes apart. Requests on the other tenant.
    const booked = (minutesAgo: number) => smsVisit(now, { startIn: 24 * H - minutesAgo, status: "confirmed" });
    const request = (minutesAgo: number) =>
      smsVisit(now, { tenant: tenantB, startIn: 24 * H - minutesAgo, status: "confirmed", origin: "patient_portal", booked: false });
    const markOf = (x: { start: Date }) => plus(x.start, -24 * H);
    const reply = { source: "patient-sms-reply", intent: "confirmada", outcome: "confirmed", reason: null };
    const v = {
      handConfirmed: await booked(20),
      smsConfirmed: await booked(70),
      reviewConfirmed: await booked(120),
      requestAcceptedWithEstado: await request(20),
      requestAcceptedBySms: await request(70),
    };
    await savedAt(v.handConfirmed.id, "appointment.update", { changed: ["status"], fromStatus: "scheduled", toStatus: "confirmed" }, plus(markOf(v.handConfirmed), 5));
    await savedAt(v.smsConfirmed.id, "appointment.patient_sms_reply", reply, plus(markOf(v.smsConfirmed), 5));
    await savedAt(v.reviewConfirmed.id, "appointment.sms_reply_reviewed", { source: "reception-sms-review", resolution: "confirmed", applied: true }, plus(markOf(v.reviewConfirmed), 5));
    await savedAt(v.requestAcceptedWithEstado.id, "appointment.update", { changed: ["status"], fromStatus: "scheduled", toStatus: "confirmed" }, plus(markOf(v.requestAcceptedWithEstado), 5), tenantB);
    await savedAt(v.requestAcceptedBySms.id, "appointment.patient_sms_reply", reply, plus(markOf(v.requestAcceptedBySms), 5), tenantB);

    expect(await pass(tenantA, now)).toMatchObject({ due: 3, taken: 3, sent: 3 });
    expect(await pass(tenantB, now)).toMatchObject({ due: 0, taken: 0, sent: 0 });
    expect([...h.sends].sort()).toEqual([`sms:${v.handConfirmed.id}`, `sms:${v.reviewConfirmed.id}`, `sms:${v.smsConfirmed.id}`].sort());
    for (const x of [v.requestAcceptedWithEstado, v.requestAcceptedBySms]) {
      expect(await claimsOf(x.id)).toEqual([]);
      expect(await ledgerOf(x.id)).toEqual([]);
    }
  });

  /**
   * R33's GATE, its words: "CHECK a visit confirmed by SMS after its 24h mark,
   * already sent by the live job. EXPECT no UNEXPLAINED row and no send." The
   * sending pass reads the sleeping job's claim as settling the mark, and the
   * SMS "confirmo" does not keep it out or take it again.
   */
  it("R33 GATE: a visit confirmed by SMS after its 24h mark, already sent by the sleeping job, is not sent again", async () => {
    const now = clockOf(18);
    const v = await smsVisit(now);
    const mark = plus(v.start, -24 * H);
    await seedClaim(v.id, v.start, { taker: "run" });
    await seedLedger(v.id, "sent", null);
    await sql.execute(raw`update appointments set status = 'confirmed' where id = ${v.id}`);
    await savedAt(v.id, "appointment.patient_sms_reply", { source: "patient-sms-reply", intent: "confirmada", outcome: "confirmed", reason: null }, plus(mark, 20));

    expect(await pass(tenantA, now)).toMatchObject({ due: 0, taken: 0, sent: 0 });
    expect(await pass(tenantA, plus(now, 61))).toMatchObject({ due: 0, taken: 0, sent: 0 });
    expect(h.sends).toEqual([]);
    expect((await claimsOf(v.id)).map((c) => [c.taker, c.released])).toEqual([["run", false]]);
    expect(await ledgerOf(v.id)).toEqual(["reminder.24h.sms:sent:"]);
  });

  /**
   * R33's GATE, its words: "CHECK a visit moved after its mark to a later
   * start the same day. EXPECT the past mark not sent, as the live job does."
   * The sleeping job sent the old start's reminder, then the move re-armed it
   * and it planned from the new start, whose mark was already past: dropped.
   */
  it("R33 GATE: a visit moved after its mark to a LATER START THE SAME DAY: the past mark is not sent; moved before that mark, it is", async () => {
    const now = clockOf(23);
    const movedLater = async (startIn: number, movedAt: (mark: Date) => Date) => {
      const v = await smsVisit(now, { startIn });
      const oldStart = plus(v.start, -3 * H);
      // The sleeping job sent the old start's SMS at its mark.
      await seedClaim(v.id, oldStart, { taker: "run" });
      await seedLedger(v.id, "sent", null);
      await savedAt(v.id, "appointment.reschedule", { startsAt: v.start.toISOString() }, movedAt(plus(v.start, -24 * H)));
      return { ...v, oldStart };
    };
    // The new start's mark was 30 minutes ago; moved ten minutes after it.
    const late = await movedLater(23 * H + 30, (mark) => plus(mark, 10));
    // CONTROL: the new start's mark an hour ago; moved an hour before it.
    const early = await movedLater(23 * H, (mark) => plus(mark, -60));

    expect(await pass(tenantA, now)).toMatchObject({ due: 1, taken: 1, sent: 1 });
    expect(h.sends).toEqual([`sms:${early.id}`]);
    expect((await claimsOf(late.id)).map((c) => [c.taker, c.starts_at])).toEqual([["run", late.oldStart.toISOString()]]);
    expect(await ledgerOf(late.id)).toEqual(["reminder.24h.sms:sent:"]);
    expect(await pass(tenantA, plus(now, 61))).toMatchObject({ due: 0, taken: 0, sent: 0 });
  });

  /**
   * R34, strategy's ruling: "the owner's hourly held-back retry wins. It is
   * the one named exception to R24, capped at 3 hours after the mark, with its
   * own label in the compare." Both sides of the cap, both channels: requests
   * held back at their first try, accepted after their mark, tried again at
   * EXACTLY 3 hours after the mark (sent) and at 3 hours and a minute (nothing:
   * not taken, not recorded too late, not counted; an email would otherwise
   * still be inside its own 12 hours). One tenant each side: accepted, they
   * are confirmed visits of one therapist, and those may not overlap.
   */
  it("R34: a reminder held back before a save after its mark is tried again up to EXACTLY 3 hours after the mark, SMS and email; a minute later nothing", async () => {
    const now = clockOf(24);
    const v = {
      smsAt3h: await smsDue(now, 30, { origin: "patient_portal" }),
      emailAt3h: await emailDue(now, 30, { origin: "patient_portal" }),
      smsPast3h: await smsDue(now, 31, { origin: "patient_portal", tenant: tenantB }),
      emailPast3h: await emailDue(now, 31, { origin: "patient_portal", tenant: tenantB }),
    };
    const tenantOf = (x: { id: string }) => (x === v.smsPast3h || x === v.emailPast3h ? tenantB : tenantA);

    // The first try: each held back, an unaccepted request.
    expect(await pass(tenantA, now)).toMatchObject({ due: 2, taken: 2, heldBack: 2 });
    expect(await pass(tenantB, now)).toMatchObject({ due: 2, taken: 2, heldBack: 2 });
    // Accepted ten minutes later, after every mark and after that try.
    for (const x of Object.values(v)) {
      await sql.execute(raw`update appointments set status = 'confirmed' where id = ${x.id}`);
      await savedAt(x.id, "appointment.update", { changed: ["status"], via: "portal_request_confirm" }, plus(now, 10), tenantOf(x));
    }

    // 2 hours 30 minutes on: the A pair is 3 hours after its mark exactly, the B pair 3 hours and 1 minute.
    const atCap = plus(now, 150);
    expect(await pass(tenantA, atCap)).toMatchObject({ due: 2, taken: 2, sent: 2, tooLate: 0 });
    expect(await pass(tenantB, atCap)).toMatchObject({ due: 0, taken: 0, sent: 0, tooLate: 0 });
    expect([...h.sends].sort()).toEqual([`email:${v.emailAt3h.id}`, `sms:${v.smsAt3h.id}`].sort());
    expect(await ledgerOf(v.smsPast3h.id)).toEqual(["reminder.24h.sms:suppressed:unconfirmed"]);
    expect(await ledgerOf(v.emailPast3h.id)).toEqual(["reminder.48h.email:suppressed:unconfirmed"]);
    expect((await claimsOf(v.emailPast3h.id)).map((c) => c.released)).toEqual([true]);
    // And never later, though an email is inside its own late rule for nine hours more.
    expect(await pass(tenantB, plus(now, 5 * H))).toMatchObject({ due: 0, taken: 0, sent: 0 });
  });

  it("nothing a pass writes is in the audit trail: the two tenants hold their booking rows, the R24 arms' saves, and nothing else", async () => {
    const audit = await rows(raw`select action, count(*)::int as n from audit_log
      where tenant_id in (${tenantA}, ${tenantB}) group by action order by action`);
    expect(laterSaves).toEqual({
      "appointment.patient_sms_reply": 3,
      "appointment.reschedule": 6,
      "appointment.sms_reply_reviewed": 1,
      "appointment.update": 8,
    });
    const bookings = audit.find((r) => r.action === "appointment.create");
    expect(Number(bookings?.n ?? 0)).toBeGreaterThan(0);
    expect(audit.filter((r) => r.action !== "appointment.create")).toEqual(
      Object.entries(laterSaves)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([action, n]) => ({ action, n })),
    );
  });
});
