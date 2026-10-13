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
 *      are only to be recorded.
 *   9. THE FLOOR. A pass takes no mark that fell due before the tenant's
 *      first heartbeat, and a tenant with no heartbeat is not swept at all:
 *      the pass writes the first one and starts from there.
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
      await sql.execute(raw`insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values (${tenantId}, null, 'appointment.create', 'appointment', ${id}, '{}'::jsonb)`);
    }
    return { id, start };
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
    over: { taker?: "run" | "sweep"; early?: boolean; released?: boolean } = {},
  ): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into reminder_claims
      (id, tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early)
      values (${id}, ${tenantA}, ${appointmentId}, 'claim', '24h', 'sms', ${start.toISOString()},
              ${plus(start, -24 * H).toISOString()}, ${over.taker ?? "run"}, ${over.early ?? false}::boolean)`);
    if (over.released) {
      await sql.execute(raw`insert into reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, claim_id)
        values (${tenantA}, ${appointmentId}, 'release', '24h', 'sms', ${id})`);
    }
    return id;
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

  async function pass(tenant: string, now: Date, over: { limit?: number; passId?: string; includeNeverReminded?: boolean } = {}) {
    const { sweepTenantSending } = await import("./sweep-send");
    return sweepTenantSending({
      tenantId: tenant,
      now: () => now,
      limit: over.limit ?? 50,
      passId: over.passId ?? `pass-${randomUUID()}`,
      includeNeverReminded: over.includeNeverReminded,
      alarm: () => {},
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
    // THE FLOOR: the sweep has been running for both tenants since long before
    // any mark an arm seeds. (The last arm removes one tenant's to prove the rule.)
    for (const tenant of [tenantA, tenantB]) {
      await sql.execute(raw`insert into reminder_sweep_passes
        (tenant_id, pass_id, mode, pass_at, due_count, recorded_count, over_ceiling, excluded_count)
        values (${tenant}, 'floor-seed', 'shadow', '2026-01-05T08:00:00Z', 0, 0, false, 0)`);
    }
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

  beforeEach(() => {
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
    expect(first).toEqual({ due: 2, taken: 2, sent: 2, heldBack: 0, tooLate: 0, claimHeld: 0, failed: 0, overCeiling: false });
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
    expect(a.sent + a.claimHeld + b.sent + b.claimHeld).toBe(a.taken + b.taken);
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
  const smsDue = (now: Date, minutesAgo: number, over: { origin?: string } = {}) => smsVisit(now, { startIn: 24 * H - minutesAgo, ...over });
  /** A visit whose only DUE mark is the 48 hour email, due `minutesAgo` before `now`. */
  const emailDue = (now: Date, minutesAgo: number) => visit({ now, startIn: 48 * H - minutesAgo });

  it("THE LATE RULE: 3 hours for an SMS and 12 for an email are still sent; a minute later each is recorded as too late, once, and never sent", async () => {
    const now = clockOf(7);
    const v = {
      smsAtLimit: await smsDue(now, 3 * H),
      smsLate: await smsDue(now, 3 * H + 1),
      emailAtLimit: await emailDue(now, 12 * H),
      emailLate: await emailDue(now, 12 * H + 1),
    };

    const out = await pass(tenantA, now);
    expect(out).toEqual({ due: 4, taken: 4, sent: 2, heldBack: 0, tooLate: 2, claimHeld: 0, failed: 0, overCeiling: false });
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
  /* 9. The floor                                                      */
  /* ---------------------------------------------------------------- */

  it("THE FLOOR: a tenant with no heartbeat is not swept; its first pass writes one, and only marks due from then on are ever taken", async () => {
    const now = clockOf(10);
    // Tenant B as a tenant the sweep has never run for.
    await sql.execute(raw`delete from reminder_sweep_passes where tenant_id = ${tenantB}`);
    // Its reminder fell due 30 minutes ago. The sleeping job may have sent it
    // before claims were written: there is no claim to say either way.
    const before = await smsVisit(now, { tenant: tenantB });

    const first = await pass(tenantB, now, { passId: "floor-1" });
    expect(first).toMatchObject({ due: 0, taken: 0, sent: 0 });
    expect(await heartbeatsOf("floor-1")).toEqual([
      { tenant_id: tenantB, mode: "send", due_count: 0, recorded_count: 0, over_ceiling: false, excluded_count: 0, pass_at: now.toISOString() },
    ]);

    // A reminder that falls due 10 minutes AFTER that first heartbeat.
    const after = await smsVisit(now, { tenant: tenantB, startIn: 24 * H + 10 });
    // And one that falls due at the very instant of the floor: taken.
    const atFloor = await smsVisit(now, { tenant: tenantB, startIn: 24 * H });

    const second = await pass(tenantB, plus(now, 15));
    expect(second).toMatchObject({ due: 2, taken: 2, sent: 2 });
    expect([...h.sends].sort()).toEqual([`sms:${after.id}`, `sms:${atFloor.id}`].sort());
    // The one from before the floor is never taken, at any later pass.
    for (const later of [30, 2 * H]) {
      expect(await pass(tenantB, plus(now, later))).toMatchObject({ due: 0, taken: 0 });
    }
    expect(await claimsOf(before.id)).toEqual([]);
    expect(await ledgerOf(before.id)).toEqual([]);
    // CONTROL: tenant A, whose floor is long past, takes the same kind of mark.
    const control = await smsVisit(now);
    expect(await pass(tenantA, now)).toMatchObject({ due: 1, taken: 1, sent: 1 });
    expect(h.sends).toContain(`sms:${control.id}`);
  });

  it("nothing a pass writes is in the audit trail: the two tenants hold their booking rows and nothing else", async () => {
    const [t] = await rows(raw`select count(*)::int as n, count(*) filter (where action <> 'appointment.create')::int as other
      from audit_log where tenant_id in (${tenantA}, ${tenantB})`);
    expect(Number(t!.n)).toBeGreaterThan(0);
    expect(t!.other).toBe(0);
  });
});
