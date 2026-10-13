/**
 * sweep.db.test.ts - SWEEP-03, against a REAL Postgres, as the job.
 *
 * WHAT IT PROVES, and why each arm must be a database:
 *
 *   1. WHICH MARKS A PASS TAKES, on seeded rows and to the minute: due marks
 *      of visits still ahead, scheduled or confirmed, created before the mark,
 *      and only visits the clinic saved while the switch is off. The day's
 *      last pass takes the marks due before 23:00.
 *   2. A MARK IS TAKEN ONCE. A pass writes one shadow row per mark and the
 *      next pass leaves it alone, whatever happened to that reminder since.
 *      A SUPPRESSED mark above all: the list that decides when a second
 *      sender is held (reminder-claim.ts) does not hold it, and the sweep
 *      still selects it once and never again.
 *   3. WHICH ROWS TAKE A MARK, row by row: the start, the offset, the channel,
 *      the tenant, the action, the taker, an early claim, a released claim.
 *   4. THE CEILING. 50 marks a pass over every tenant, oldest first, the rest
 *      on the next pass, and the heartbeat says so.
 *   5. ONE HEARTBEAT PER TENANT PER PASS, and none for a tenant whose pass
 *      could not finish, which does not stop the other tenant's.
 *   6. A PASS SENDS NOTHING. It leaves audit rows of two kinds and nothing
 *      else: no ledger row, no claim, no release, no change to a visit. The
 *      transports, the dispatcher, the scheduler's client and `fetch` are
 *      replaced by spies, and none is reached.
 *
 * WHY A DATABASE. The selection is one read of `appointments` and `audit_log`
 * made under the reminder job's own role and tenant claim, behind an advisory
 * lock. A mock has no policy to hide another tenant's rows, no timestamps to
 * compare and no lock to wait on.
 *
 * EVERY ARM OWNS ITS ROWS: two fresh tenants, and a week of its own per arm.
 * Every instant a pass compares against is passed in, and every arm's clock is
 * a pinned Lisbon morning, so the file gives the same answer at any hour.
 *
 * Skipped without DATABASE_URL. NOT YET hard-required in
 * assert-rls-executed.mjs: that file is a frozen gate, so listing this suite
 * there is a GATE-CHANGE of its own.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, lisbonDateTimeToUtc } from "../scheduling/time";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  /** Every sender a pass reached, by name. It must stay empty. */
  reached: [] as string[],
}));

/** A stand-in for something that sends: it records that it was reached, and refuses. */
function sender(name: string) {
  return vi.fn(async () => {
    h.reached.push(name);
    throw new Error(`the shadow sweep reached ${name}`);
  });
}

vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return { ...actual, sendSms: sender("clients.sendSms"), sendEmail: sender("clients.sendEmail") };
});
vi.mock("./dispatch", () => ({
  dispatchReminder: sender("dispatch.dispatchReminder"),
  dispatchConfirmation: sender("dispatch.dispatchConfirmation"),
  dispatchFollowUp: sender("dispatch.dispatchFollowUp"),
  dispatchNoShow: sender("dispatch.dispatchNoShow"),
}));
vi.mock("./inngest/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./inngest/client")>();
  return { ...actual, inngest: { send: sender("inngest.send") } };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("SWEEP-03: the sweep in shadow selects each due mark once and sends nothing", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const seeds: Record<string, { therapist: string; location: string; patient: string }> = {
    [tenantA]: { therapist: randomUUID(), location: randomUUID(), patient: randomUUID() },
    [tenantB]: { therapist: randomUUID(), location: randomUUID(), patient: randomUUID() },
  };

  const MIN = 60_000;
  /** A Monday in winter time. Arm `week` owns the week that begins `week` weeks later. */
  const FIRST_MONDAY = "2026-11-02";
  const dayOf = (week: number) => addDays(FIRST_MONDAY, week * 7);
  /** The arm's clock: 10:15 on its Monday, Lisbon time. */
  const clockOf = (week: number) => lisbonDateTimeToUtc(dayOf(week), "10:15");
  const plus = (base: Date, minutes: number) => new Date(base.getTime() + minutes * MIN);

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  /** An audit row written straight to the table. `::text::jsonb`, or the driver encodes the string twice. */
  async function audit(a: {
    tenant?: string;
    action: string;
    entityType?: string;
    entityId: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into audit_log (id, tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
      values (${id}, ${a.tenant ?? tenantA}, null, ${a.action}, ${a.entityType ?? "appointment"}, ${a.entityId},
              ${JSON.stringify(a.metadata ?? {})}::text::jsonb)`);
    return id;
  }

  /**
   * A visit. Created five days before `now` unless told otherwise, and with
   * the row a booking at the clinic writes on its audit trail unless `booked`
   * is false (an imported visit, an online request nobody handled).
   */
  async function visit(v: {
    tenant?: string;
    now: Date;
    /** Minutes from `now` to the start. */
    startIn: number;
    /** Minutes from `now` to the row's creation. Negative: before. */
    createdIn?: number;
    updatedIn?: number;
    status?: string;
    booked?: boolean;
  }): Promise<{ id: string; start: Date }> {
    const tenantId = v.tenant ?? tenantA;
    const mine = seeds[tenantId]!;
    const id = randomUUID();
    const start = plus(v.now, v.startIn);
    const created = plus(v.now, v.createdIn ?? -5 * 24 * 60);
    const updated = v.updatedIn === undefined ? created : plus(v.now, v.updatedIn);
    await sql.execute(raw`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_at, updated_at)
      values (${id}, ${tenantId}, ${mine.patient}, ${mine.therapist}, ${mine.location},
              ${start.toISOString()}, ${plus(start, 45).toISOString()}, ${v.status ?? "scheduled"},
              ${created.toISOString()}, ${updated.toISOString()})`);
    if (v.booked !== false) await audit({ tenant: tenantId, action: "appointment.create", entityId: id });
    return { id, start };
  }

  /**
   * A visit with ONE selectable mark, the 24 hour one: it starts 20 hours
   * after `now` and was created 10 hours before, which is after its 48 hour
   * mark and before its 24 hour mark.
   */
  function oneMarkVisit(now: Date, over: { tenant?: string; startIn?: number } = {}) {
    return visit({ now, startIn: over.startIn ?? 20 * 60, createdIn: -10 * 60, tenant: over.tenant });
  }

  const SMS = { offsetId: "24h", channel: "sms" } as const;

  /** A shadow row, shaped as a pass writes it. */
  function seedShadow(
    appointmentId: string,
    start: Date,
    over: { tenant?: string; offsetId?: string; channel?: string; action?: string; entityType?: string } = {},
  ) {
    return audit({
      tenant: over.tenant,
      action: over.action ?? "appointment.reminder_sweep_shadow",
      entityType: over.entityType,
      entityId: appointmentId,
      metadata: {
        source: "reminder-sweep",
        mode: "shadow",
        passId: null,
        offsetId: over.offsetId ?? SMS.offsetId,
        channel: over.channel ?? SMS.channel,
        startsAt: start.toISOString(),
        minutesAfterMark: 0,
        savedAfterMark: false,
      },
    });
  }

  /** A claim row, shaped as takeReminderClaim writes it. */
  function seedClaim(
    appointmentId: string,
    start: Date,
    over: {
      tenant?: string;
      taker?: string;
      offsetId?: string;
      channel?: string;
      early?: boolean | null;
      action?: string;
      entityType?: string;
    } = {},
  ) {
    return audit({
      tenant: over.tenant,
      action: over.action ?? "appointment.reminder_claimed",
      entityType: over.entityType,
      entityId: appointmentId,
      metadata: {
        source: "reminder-claim",
        offsetId: over.offsetId ?? SMS.offsetId,
        channel: over.channel ?? SMS.channel,
        startsAt: start.toISOString(),
        taker: over.taker ?? "sweep",
        early: over.early === undefined ? false : over.early,
      },
    });
  }

  function seedRelease(
    appointmentId: string,
    claimId: string,
    over: { tenant?: string; action?: string; entityType?: string } = {},
  ) {
    return audit({
      tenant: over.tenant,
      action: over.action ?? "appointment.reminder_claim_released",
      entityType: over.entityType,
      entityId: appointmentId,
      metadata: { source: "reminder-claim", claimId, ...SMS },
    });
  }

  /** A ledger row for the 24 hour SMS, as the dispatcher writes it. */
  async function seedLedger(appointmentId: string, outcome: "sent" | "suppressed", tenant = tenantA) {
    await sql.execute(raw`insert into reminder_dispatches
      (tenant_id, appointment_id, channel, template_id, outcome, suppression_reason)
      values (${tenant}, ${appointmentId}, 'sms', 'reminder.24h.sms', ${outcome},
              ${outcome === "suppressed" ? "sandbox" : null})`);
  }

  /** The sweep's selection, read as the job in its tenant, writing nothing. */
  async function select(tenant: string, now: Date, opts: { limit?: number; includeNeverReminded?: boolean } = {}) {
    const { withReminderTenantContext } = await import("./context");
    const { selectDueMarks } = await import("./sweep");
    return withReminderTenantContext(tenant, (tx) =>
      selectDueMarks(tx, { tenantId: tenant, now, limit: opts.limit ?? 500, includeNeverReminded: opts.includeNeverReminded }),
    );
  }

  /** Is this visit's 24 hour mark selected for tenant A at `now`? */
  async function selects(now: Date, appointmentId: string): Promise<boolean> {
    const { marks } = await select(tenantA, now);
    return marks.some((m) => m.appointmentId === appointmentId && m.offsetId === "24h");
  }

  async function pass(tenant: string, now: Date, passId: string, limit = 50) {
    const { sweepTenantInShadow } = await import("./sweep");
    return sweepTenantInShadow({ tenantId: tenant, now, limit, passId });
  }

  async function shadowsOf(appointmentId: string): Promise<Row[]> {
    return rows(raw`select tenant_id::text as tenant_id, actor_user_id, entity_type, ip, metadata
      from audit_log
      where entity_id = ${appointmentId} and action = 'appointment.reminder_sweep_shadow'
      order by metadata->>'offsetId', created_at, id`);
  }

  async function heartbeatsOf(passId: string): Promise<Row[]> {
    return rows(raw`select tenant_id::text as tenant_id, actor_user_id, entity_type, entity_id, ip, metadata
      from audit_log
      where action = 'reminder_sweep.pass' and metadata->>'passId' = ${passId}
        and tenant_id in (${tenantA}, ${tenantB})
      order by tenant_id`);
  }

  /** Everything a send, or a sender's bookkeeping, would have changed for the two tenants. */
  async function footprint() {
    const [f] = await rows(raw`select
      (select count(*)::int from reminder_dispatches where tenant_id in (${tenantA}, ${tenantB})) as ledger,
      (select count(*)::int from audit_log where tenant_id in (${tenantA}, ${tenantB})
         and action = 'appointment.reminder_claimed') as claims,
      (select count(*)::int from audit_log where tenant_id in (${tenantA}, ${tenantB})
         and action = 'appointment.reminder_claim_released') as releases,
      (select count(*)::int from audit_log where tenant_id in (${tenantA}, ${tenantB})
         and action not in ('appointment.reminder_sweep_shadow', 'reminder_sweep.pass')) as other_audit,
      (select count(*)::int from staff_notifications where tenant_id in (${tenantA}, ${tenantB})) as notifications,
      (select coalesce(md5(string_agg(id::text || starts_at::text || status::text || confirmation_state::text
                || updated_at::text, ',' order by id)), '') from appointments
         where tenant_id in (${tenantA}, ${tenantB})) as visits`);
    return f!;
  }

  /** Another session sitting on one tenant's sweep lock until told to let go. */
  async function holdSweepLock(tenantId: string) {
    const { sweepLockPayload } = await import("./sweep");
    const payload = sweepLockPayload(tenantId);
    let letGo!: () => void;
    const untilLetGo = new Promise<void>((resolve) => (letGo = resolve));
    let lockIsHeld!: () => void;
    const untilHeld = new Promise<void>((resolve) => (lockIsHeld = resolve));
    const holder = sql.transaction(async (tx) => {
      await tx.execute(raw`select pg_advisory_xact_lock(hashtextextended(${payload}, 0))`);
      lockIsHeld();
      await untilLetGo;
    });
    await untilHeld;
    return async () => {
      letGo();
      await holder;
    };
  }

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    for (const [tenant, t] of Object.entries(seeds)) {
      await sql.execute(raw`insert into tenants (id, name, slug)
        values (${tenant}, 'Sweep Shadow Co', ${"sweep-" + tenant.slice(0, 8)})`);
      await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${t.therapist}, ${tenant}, ${"t-" + t.therapist.slice(0, 8) + "@t.test"}, 'Dra Sweep', true, true)`);
      await sql.execute(raw`insert into locations (id, tenant_id, name) values (${t.location}, ${tenant}, 'Sede')`);
      await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
        values (${t.patient}, ${tenant}, 'Paciente Sweep', '912345678')`);
    }
  });

  afterAll(async () => {
    if (!sql) return;
    for (const tenantId of [tenantA, tenantB]) {
      await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from tenants where id = ${tenantId}`);
    }
  });

  beforeEach(() => {
    // Anything that reaches the network from here is a send. Postgres does not use `fetch`.
    vi.spyOn(globalThis, "fetch").mockImplementation(sender("fetch") as unknown as typeof fetch);
  });

  afterEach(() => {
    // After EVERY arm: nothing that sends was reached.
    expect(h.reached).toEqual([]);
    vi.restoreAllMocks();
  });

  /* ---------------------------------------------------------------- */
  /* 1. Which marks a pass takes                                       */
  /* ---------------------------------------------------------------- */

  it("takes exactly the due marks of the visits the clinic saved: every edge to the minute, both offsets, two tenants", async () => {
    const now = clockOf(0);
    const H = 60;
    const v = {
      // Starts in an hour: both marks are long past.
      a: await visit({ now, startIn: 1 * H }),
      // Starts in two minutes: still ahead, both marks due.
      h: await visit({ now, startIn: 2 }),
      // Confirmed, in four hours.
      l: await visit({ now, startIn: 4 * H, status: "confirmed" }),
      // The 24 hour mark is due THIS INSTANT: taken.
      b: await visit({ now, startIn: 24 * H }),
      // One minute later: its 24 hour mark is not due, its 48 hour mark is.
      c: await visit({ now, startIn: 24 * H + 1 }),
      // The 48 hour mark is due this instant: taken. One minute later: nothing.
      d: await visit({ now, startIn: 48 * H }),
      e: await visit({ now, startIn: 48 * H + 1 }),
      // Not ahead any more: starting now, and started a minute ago.
      f: await visit({ now, startIn: 0 }),
      g: await visit({ now, startIn: -1 }),
      // Not a status a reminder is sent for.
      i: await visit({ now, startIn: 2 * H, status: "cancelled" }),
      j: await visit({ now, startIn: 3 * H, status: "completed" }),
      k: await visit({ now, startIn: 3 * H + 1, status: "no_show" }),
      // Starts in 20 hours, so its 24 hour mark was 4 hours ago and its 48 hour mark 28 hours ago.
      // Created 10 hours ago: after the 48 hour mark, before the 24 hour one.
      n: await visit({ now, startIn: 20 * H, createdIn: -10 * H }),
      // Created 2 hours ago, inside the lead time of both: this visit never had either reminder.
      m: await visit({ now, startIn: 20 * H + 1, createdIn: -2 * H }),
      // Created AT its 24 hour mark, to the instant: not before it.
      n2: await visit({ now, startIn: 20 * H + 2, createdIn: -4 * H + 2 }),
      // Created one minute before its 24 hour mark.
      n3: await visit({ now, startIn: 20 * H + 3, createdIn: -4 * H + 2 }),
      // Saved an hour ago, after both marks: selected, and the fact is recorded.
      r: await visit({ now, startIn: 8 * H, updatedIn: -1 * H }),
      // Saved AT its 24 hour mark, to the instant: after the 48 hour mark, not after the 24 hour one.
      s: await visit({ now, startIn: 9 * H, updatedIn: -15 * H }),
      // NEVER HAD A REMINDER: no save of the clinic on its trail.
      o: await visit({ now, startIn: 5 * H, booked: false }),
      // The same, with a booking row that ANOTHER tenant wrote about it.
      q: await visit({ now, startIn: 6 * H, booked: false }),
      // The other tenant's own visit.
      p: await visit({ now, startIn: 6 * H, tenant: tenantB }),
    };
    await audit({ tenant: tenantB, action: "appointment.create", entityId: v.q.id });
    const label = (id: string) => Object.entries(v).find(([, x]) => x.id === id)?.[0] ?? id;
    const keys = (marks: { appointmentId: string; offsetId: string }[]) =>
      marks.map((m) => `${label(m.appointmentId)}:${m.offsetId}`).sort();

    const saved = ["a:24h", "a:48h", "b:24h", "b:48h", "c:48h", "d:48h", "h:24h", "h:48h", "l:24h", "l:48h", "n3:24h", "n:24h", "r:24h", "r:48h", "s:24h", "s:48h"];
    const off = await select(tenantA, now);
    expect(keys(off.marks)).toEqual(saved);
    expect(off.due).toBe(saved.length);
    // Left out because the visit never had a reminder: both marks of `o` and of `q`.
    expect(off.neverRemindedLeftOut).toBe(4);

    // Oldest mark first: `h` starts first, so its 48 hour mark is the oldest of all.
    const marks = off.marks.map((m) => m.mark.getTime());
    expect(marks).toEqual([...marks].sort((x, y) => x - y));
    expect(`${label(off.marks[0]!.appointmentId)}:${off.marks[0]!.offsetId}`).toBe("h:48h");

    // What a row says about its mark.
    const mark = (name: keyof typeof v, offsetId: string) =>
      off.marks.find((m) => m.appointmentId === v[name].id && m.offsetId === offsetId)!;
    expect(mark("a", "24h")).toEqual({
      appointmentId: v.a.id,
      offsetId: "24h",
      channel: "sms",
      startsAt: v.a.start,
      mark: plus(v.a.start, -24 * H),
      minutesAfterMark: 23 * H,
      savedAfterMark: false,
    });
    expect(mark("a", "48h")).toMatchObject({ channel: "email", mark: plus(v.a.start, -48 * H), minutesAfterMark: 47 * H });
    expect(mark("b", "24h")).toMatchObject({ mark: now, minutesAfterMark: 0 });
    expect(mark("r", "24h").savedAfterMark).toBe(true);
    expect(mark("r", "48h").savedAfterMark).toBe(true);
    expect(mark("s", "24h").savedAfterMark).toBe(false);
    expect(mark("s", "48h").savedAfterMark).toBe(true);

    // THE SWITCH, ON: the visits that never had a reminder are taken too, and nothing is left out.
    const on = await select(tenantA, now, { includeNeverReminded: true });
    expect(keys(on.marks)).toEqual([...saved, "o:24h", "o:48h", "q:24h", "q:48h"].sort());
    expect(on.due).toBe(saved.length + 4);
    expect(on.neverRemindedLeftOut).toBeNull();

    // THE LIMIT cuts the list, oldest first, and `due` still counts everything.
    const cut = await select(tenantA, now, { limit: 3 });
    expect(cut.marks).toEqual(off.marks.slice(0, 3));
    expect(cut.due).toBe(saved.length);
    const none = await select(tenantA, now, { limit: 0 });
    expect(none).toEqual({ marks: [], due: saved.length, neverRemindedLeftOut: 4 });

    // THE OTHER TENANT sees its own visit and none of these.
    const other = await select(tenantB, now);
    expect(other.marks.map((m) => `${m.appointmentId}:${m.offsetId}`).sort()).toEqual([`${v.p.id}:24h`, `${v.p.id}:48h`]);
    expect(other.neverRemindedLeftOut).toBe(0);

    // A minute earlier the two marks due "this instant" were not due yet.
    const earlier = await select(tenantA, plus(now, -1));
    expect(keys(earlier.marks)).not.toContain("b:24h");
    expect(keys(earlier.marks)).not.toContain("d:48h");
    expect(keys(earlier.marks)).toContain("b:48h");
  });

  it("the day's last pass, 21:45, takes the marks due before 23:00; the pass before it does not", async () => {
    const day = dayOf(1);
    const last = lisbonDateTimeToUtc(day, "21:45");
    const created = -3 * 24 * 60;
    // Tomorrow 22:30: the 24 hour mark is 22:30 tonight, 45 minutes ahead of the last pass.
    const x = await visit({ now: last, startIn: 24 * 60 + 45, createdIn: created });
    // In two days at 22:59: the 48 hour mark is 22:59 tonight.
    const y = await visit({ now: last, startIn: 48 * 60 + 74, createdIn: created });
    // Tomorrow 23:00: the mark is 23:00 tonight, which belongs to the morning.
    const z = await visit({ now: last, startIn: 24 * 60 + 75, createdIn: created });
    expect(x.start).toEqual(lisbonDateTimeToUtc(addDays(day, 1), "22:30"));
    expect(z.start).toEqual(lisbonDateTimeToUtc(addDays(day, 1), "23:00"));
    const keys = (marks: { appointmentId: string; offsetId: string }[]) =>
      marks.map((m) => `${m.appointmentId === x.id ? "x" : m.appointmentId === y.id ? "y" : "z"}:${m.offsetId}`).sort();

    // 21:30: only the marks already past. The 48 hour marks of x and z were yesterday evening.
    expect(keys((await select(tenantA, plus(last, -15))).marks)).toEqual(["x:48h", "z:48h"]);

    // 21:45: x's 24 hour mark and y's 48 hour mark are taken AHEAD.
    const atLast = await select(tenantA, last);
    expect(keys(atLast.marks)).toEqual(["x:24h", "x:48h", "y:48h", "z:48h"]);
    expect(atLast.marks.find((m) => m.appointmentId === x.id && m.offsetId === "24h")!.minutesAfterMark).toBe(-45);
    expect(atLast.marks.find((m) => m.appointmentId === y.id)!.minutesAfterMark).toBe(-74);

    // The pass records how far ahead, and the heartbeat says where it looked to.
    expect(await pass(tenantA, last, "last-pass")).toEqual({ due: 4, recorded: 4, overCeiling: false });
    const ahead = (await shadowsOf(x.id)).map((s) => s.metadata as Row);
    expect(ahead.map((m) => [m.offsetId, m.minutesAfterMark])).toEqual([
      ["24h", -45],
      ["48h", 23 * 60 + 15],
    ]);
    const [beat] = await heartbeatsOf("last-pass");
    expect((beat!.metadata as Row).lookAheadBefore).toBe(lisbonDateTimeToUtc(day, "23:00").toISOString());
    // z's 24 hour mark is taken by the first pass of the morning, eight hours late.
    const morning = lisbonDateTimeToUtc(addDays(day, 1), "07:00");
    expect(keys((await select(tenantA, morning)).marks)).toEqual(["z:24h"]);
  });

  /* ---------------------------------------------------------------- */
  /* 2. A mark is taken once                                           */
  /* ---------------------------------------------------------------- */

  it("a pass writes one shadow row per mark and one heartbeat, and the next pass takes nothing twice", async () => {
    const now = clockOf(2);
    const v1 = await visit({ now, startIn: 60 });
    // Starts in 25 hours: the 48 hour mark is due, the 24 hour one in an hour.
    const v2 = await visit({ now, startIn: 25 * 60 });
    await visit({ now, startIn: 120, booked: false });

    expect(await pass(tenantA, now, "once-1")).toEqual({ due: 3, recorded: 3, overCeiling: false });

    // The rows, whole. Ids, enums, an instant and two numbers: nobody's name.
    const row = (offsetId: string, channel: string, start: Date, minutesAfterMark: number) => ({
      tenant_id: tenantA,
      actor_user_id: null,
      entity_type: "appointment",
      ip: null,
      metadata: {
        source: "reminder-sweep",
        mode: "shadow",
        passId: "once-1",
        offsetId,
        channel,
        startsAt: start.toISOString(),
        minutesAfterMark,
        savedAfterMark: false,
      },
    });
    expect(await shadowsOf(v1.id)).toEqual([
      row("24h", "sms", v1.start, 23 * 60),
      row("48h", "email", v1.start, 47 * 60),
    ]);
    expect(await shadowsOf(v2.id)).toEqual([row("48h", "email", v2.start, 23 * 60)]);

    // The heartbeat, whole: this tenant's, about no entity, with the pass's counts.
    expect(await heartbeatsOf("once-1")).toEqual([
      {
        tenant_id: tenantA,
        actor_user_id: null,
        entity_type: "reminder_sweep",
        entity_id: null,
        ip: null,
        metadata: {
          source: "reminder-sweep",
          mode: "shadow",
          passId: "once-1",
          at: now.toISOString(),
          lookAheadBefore: null,
          due: 3,
          recorded: 3,
          overCeiling: false,
          neverRemindedLeftOut: 2,
        },
      },
    ]);

    // Fifteen minutes later: nothing is due that was not taken. A heartbeat all the same.
    expect(await pass(tenantA, plus(now, 15), "once-2")).toEqual({ due: 0, recorded: 0, overCeiling: false });
    expect(await shadowsOf(v1.id)).toHaveLength(2);
    expect(await shadowsOf(v2.id)).toHaveLength(1);
    expect(await heartbeatsOf("once-2")).toHaveLength(1);

    // Two hours later v1 has started, and v2's OTHER mark has come due: that one row, once.
    expect(await pass(tenantA, plus(now, 120), "once-3")).toEqual({ due: 1, recorded: 1, overCeiling: false });
    expect(await pass(tenantA, plus(now, 135), "once-4")).toEqual({ due: 0, recorded: 0, overCeiling: false });
    expect((await shadowsOf(v2.id)).map((s) => (s.metadata as Row).offsetId)).toEqual(["24h", "48h"]);
    expect(await shadowsOf(v1.id)).toHaveLength(2);
  });

  it("a SUPPRESSED mark is selected once: the list that holds a second sender does not hold it, and the sweep still never takes it again", async () => {
    const now = clockOf(3);
    const suppressedLater = await oneMarkVisit(now);
    const suppressedBefore = await oneMarkVisit(now, { startIn: 20 * 60 + 1 });
    const sweptAndSuppressed = await oneMarkVisit(now, { startIn: 20 * 60 + 2 });

    // BEFORE the first pass: the sleeping job already claimed one reminder and
    // the dispatcher suppressed it; and one carries the sweep's OWN claim with
    // a suppressed row after it, which is what the sweep will leave once it sends.
    await seedClaim(suppressedBefore.id, suppressedBefore.start, { taker: "run" });
    await seedLedger(suppressedBefore.id, "suppressed");
    await seedClaim(sweptAndSuppressed.id, sweptAndSuppressed.start, { taker: "sweep" });
    await seedLedger(sweptAndSuppressed.id, "suppressed");

    // PASS 1 takes the two the sweep has no record of. Its own claim is its record of the third.
    expect(await pass(tenantA, now, "suppressed-1")).toEqual({ due: 2, recorded: 2, overCeiling: false });
    expect(await shadowsOf(suppressedLater.id)).toHaveLength(1);
    expect(await shadowsOf(suppressedBefore.id)).toHaveLength(1);
    expect(await shadowsOf(sweptAndSuppressed.id)).toHaveLength(0);

    // AFTER the pass: the sleeping job claims the first reminder too, and it is suppressed.
    await seedClaim(suppressedLater.id, suppressedLater.start, { taker: "run" });
    await seedLedger(suppressedLater.id, "suppressed");

    // Every later pass: nothing. One selection each, however many passes follow.
    for (const [i, minutes] of [15, 30, 45, 600].entries()) {
      expect(await pass(tenantA, plus(now, minutes), `suppressed-${i + 2}`)).toEqual({ due: 0, recorded: 0, overCeiling: false });
    }
    expect(await shadowsOf(suppressedLater.id)).toHaveLength(1);
    expect(await shadowsOf(suppressedBefore.id)).toHaveLength(1);
    expect(await shadowsOf(sweptAndSuppressed.id)).toHaveLength(0);

    // CONTROL: the list a second SENDER is held by does not hold any of the
    // three. A pass that asked it would have selected each of them again on
    // every pass above.
    const { takeReminderClaim, BLOCKING_LEDGER_OUTCOMES } = await import("./reminder-claim");
    expect(BLOCKING_LEDGER_OUTCOMES).toEqual(["sent"]);
    for (const v of [suppressedLater, suppressedBefore, sweptAndSuppressed]) {
      const answer = await takeReminderClaim({
        tenantId: tenantA,
        appointmentId: v.id,
        ...SMS,
        startsAt: v.start,
        taker: "run",
        now: plus(now, 600),
      });
      expect(answer).toEqual({ held: false, claimId: expect.any(String) });
    }
  });

  /* ---------------------------------------------------------------- */
  /* 3. Which rows take a mark                                         */
  /* ---------------------------------------------------------------- */

  it("which rows take a mark, row by row: only the sweep's own record, for this start, in this tenant", async () => {
    const now = clockOf(4);
    let n = 0;
    /** A fresh visit with one selectable mark, each at its own minute. */
    const fresh = () => oneMarkVisit(now, { startIn: 20 * 60 + n++ });
    const elsewhen = (start: Date) => plus(start, 240);

    // CONTROL: with no record at all the mark is selected.
    const untouched = await fresh();
    expect(await selects(now, untouched.id)).toBe(true);

    // THE SHADOW ROW takes it...
    const shadowed = await fresh();
    await seedShadow(shadowed.id, shadowed.start);
    expect(await selects(now, shadowed.id)).toBe(false);
    // ...and nothing that only looks like it does.
    const notShadows: [string, (v: { id: string; start: Date }) => Promise<unknown>][] = [
      ["a shadow row for another start", (v) => seedShadow(v.id, elsewhen(v.start))],
      ["a shadow row for the other reminder", (v) => seedShadow(v.id, v.start, { offsetId: "48h", channel: "email" })],
      ["a shadow row for another channel", (v) => seedShadow(v.id, v.start, { channel: "email" })],
      ["a shadow row for another offset on this channel", (v) => seedShadow(v.id, v.start, { offsetId: "48h" })],
      ["a shadow row of ANOTHER visit with this very start", (v) => seedShadow(randomUUID(), v.start)],
      ["a shadow row of another tenant", (v) => seedShadow(v.id, v.start, { tenant: tenantB })],
      ["a shadow row about another kind of entity", (v) => seedShadow(v.id, v.start, { entityType: "patient" })],
      ["the same metadata under another action", (v) => seedShadow(v.id, v.start, { action: "reminder_sweep.pass" })],
    ];
    for (const [what, seed] of notShadows) {
      const v = await fresh();
      await seed(v);
      expect(await selects(now, v.id), what).toBe(true);
    }

    // THE SWEEP'S OWN LIVE CLAIM takes it, with no outcome on record at all...
    const claimed = await fresh();
    await seedClaim(claimed.id, claimed.start);
    expect(await selects(now, claimed.id)).toBe(false);
    // ...and with a claim whose `early` was never worked out.
    const unknownEarly = await fresh();
    await seedClaim(unknownEarly.id, unknownEarly.start, { early: null });
    expect(await selects(now, unknownEarly.id)).toBe(false);
    // A release that names ANOTHER claim, or that another tenant wrote, frees nothing.
    const otherRelease = await fresh();
    await seedClaim(otherRelease.id, otherRelease.start);
    await seedRelease(otherRelease.id, randomUUID());
    expect(await selects(now, otherRelease.id)).toBe(false);
    const foreignRelease = await fresh();
    const kept = await seedClaim(foreignRelease.id, foreignRelease.start);
    await seedRelease(foreignRelease.id, kept, { tenant: tenantB });
    expect(await selects(now, foreignRelease.id)).toBe(false);
    // And a row that names the claim without being its release: about another
    // kind of entity, filed under another visit, or under another action.
    const notReleases: [string, (visitId: string, claimId: string) => Promise<unknown>][] = [
      ["a release about another kind of entity", (visitId, claimId) => seedRelease(visitId, claimId, { entityType: "patient" })],
      ["a release filed under another visit", (_visitId, claimId) => seedRelease(randomUUID(), claimId)],
      ["another action that carries the claim's id", (visitId, claimId) => seedRelease(visitId, claimId, { action: "appointment.reminder_claimed" })],
    ];
    for (const [what, seed] of notReleases) {
      const v = await fresh();
      await seed(v.id, await seedClaim(v.id, v.start));
      expect(await selects(now, v.id), what).toBe(false);
    }

    const notClaims: [string, (v: { id: string; start: Date }) => Promise<unknown>][] = [
      ["a claim of the sleeping job", (v) => seedClaim(v.id, v.start, { taker: "run" })],
      [
        "a claim of the sleeping job with its sent row",
        async (v) => {
          await seedClaim(v.id, v.start, { taker: "run" });
          await seedLedger(v.id, "sent");
        },
      ],
      ["an early claim of the sweep", (v) => seedClaim(v.id, v.start, { early: true })],
      ["a released claim of the sweep", async (v) => seedRelease(v.id, await seedClaim(v.id, v.start))],
      ["a claim of the sweep for another start", (v) => seedClaim(v.id, elsewhen(v.start))],
      ["a claim of the sweep for the other reminder", (v) => seedClaim(v.id, v.start, { offsetId: "48h", channel: "email" })],
      ["a claim of the sweep for another channel", (v) => seedClaim(v.id, v.start, { channel: "email" })],
      ["a claim of the sweep for another offset on this channel", (v) => seedClaim(v.id, v.start, { offsetId: "48h" })],
      ["a claim of the sweep on ANOTHER visit with this very start", (v) => seedClaim(randomUUID(), v.start)],
      ["a claim of the sweep about another kind of entity", (v) => seedClaim(v.id, v.start, { entityType: "patient" })],
      ["the claim's metadata under another action", (v) => seedClaim(v.id, v.start, { action: "appointment.booking_approved_handed_over" })],
      ["a claim of the sweep in another tenant", (v) => seedClaim(v.id, v.start, { tenant: tenantB })],
    ];
    for (const [what, seed] of notClaims) {
      const v = await fresh();
      await seed(v);
      expect(await selects(now, v.id), what).toBe(true);
    }

    // WITH NO POLICY IN THE WAY (the owning connection): the tenant is stated
    // in every clause, so another tenant's rows still take nothing and the
    // selection still returns this tenant's visits only.
    const foreign = await fresh();
    await seedShadow(foreign.id, foreign.start, { tenant: tenantB });
    await seedClaim(foreign.id, foreign.start, { tenant: tenantB });
    const theirs = await oneMarkVisit(now, { tenant: tenantB });
    const { selectDueMarks } = await import("./sweep");
    const unscoped = await sql.transaction((tx) => selectDueMarks(tx as never, { tenantId: tenantA, now, limit: 500 }));
    const ids = unscoped.marks.map((m) => m.appointmentId);
    expect(ids).toContain(foreign.id);
    expect(ids).toContain(untouched.id);
    expect(ids).not.toContain(theirs.id);
    expect(ids).not.toContain(shadowed.id);
    expect(ids).not.toContain(claimed.id);
    // The other tenant's release of this tenant's claim frees nothing here either.
    expect(ids).not.toContain(foreignRelease.id);
  });

  it("a visit moved to another time is a new mark, and moved back it is the old one again", async () => {
    const now = clockOf(5);
    const v = await oneMarkVisit(now);
    expect(await pass(tenantA, now, "moved-1")).toEqual({ due: 1, recorded: 1, overCeiling: false });
    expect(await selects(plus(now, 15), v.id)).toBe(false);

    // Moved two hours later. The mark of the new start is due as well: taken, once.
    const moved = plus(v.start, 120);
    const move = (to: Date) =>
      sql.execute(raw`update appointments set starts_at = ${to.toISOString()},
        ends_at = ${plus(to, 45).toISOString()}, updated_at = ${plus(now, 10).toISOString()} where id = ${v.id}`);
    await move(moved);
    expect(await pass(tenantA, plus(now, 15), "moved-2")).toEqual({ due: 1, recorded: 1, overCeiling: false });
    expect(await pass(tenantA, plus(now, 30), "moved-3")).toEqual({ due: 0, recorded: 0, overCeiling: false });
    const shadows = (await shadowsOf(v.id)).map((s) => s.metadata as Row);
    expect(shadows.map((m) => m.startsAt)).toEqual([v.start.toISOString(), moved.toISOString()]);
    // The row of the new start says the visit was saved after that mark.
    expect(shadows.map((m) => m.savedAfterMark)).toEqual([false, true]);

    // Moved back: the first row is about this start, so nothing is taken again.
    await move(v.start);
    expect(await pass(tenantA, plus(now, 45), "moved-4")).toEqual({ due: 0, recorded: 0, overCeiling: false });
    expect(await shadowsOf(v.id)).toHaveLength(2);
  });

  /* ---------------------------------------------------------------- */
  /* 4 and 5. The ceiling, the heartbeat, and a tenant that fails      */
  /* ---------------------------------------------------------------- */

  it("the ceiling: 50 marks a pass over both tenants, oldest first, the rest on the next pass, one heartbeat per tenant per pass", async () => {
    const { runReminderSweep, SWEEP_LOG_PREFIX } = await import("./sweep");
    const now = clockOf(6);
    // 60 visits of tenant A with one selectable mark each, a minute apart, and 2 of tenant B.
    // Written LATEST FIRST, so the order they were inserted in is not the order of their marks.
    const mine: { id: string; start: Date }[] = [];
    for (let i = 59; i >= 0; i--) mine.unshift(await oneMarkVisit(now, { startIn: 20 * 60 + i }));
    const theirs = [await oneMarkVisit(now, { tenant: tenantB }), await oneMarkVisit(now, { tenant: tenantB, startIn: 20 * 60 + 1 })];
    const taken = async (list: { id: string }[]) => {
      const out: boolean[] = [];
      for (const v of list) out.push((await shadowsOf(v.id)).length === 1);
      return out;
    };
    const run = async (passId: string, minutes: number) => {
      const alarms: string[] = [];
      const outcome = await runReminderSweep({
        listTenantIds: async () => [tenantA, tenantB],
        passId,
        now: () => plus(now, minutes),
        log: () => {},
        alarm: (l) => alarms.push(l),
      });
      return { outcome, alarms };
    };
    const byTenant = (a: { tenant: unknown }, b: { tenant: unknown }) => (String(a.tenant) < String(b.tenant) ? -1 : 1);
    const beats = async (passId: string) =>
      (await heartbeatsOf(passId))
        .map((b) => {
          const m = b.metadata as Row;
          return { tenant: b.tenant_id, due: m.due, recorded: m.recorded, overCeiling: m.overCeiling };
        })
        .sort(byTenant);

    // PASS 1: the 50 oldest marks of tenant A. Tenant B's turn comes with nothing left.
    const first = await run("ceiling-1", 0);
    expect(first.outcome).toEqual({ mode: "shadow", tenants: 2, failedTenants: 0, due: 62, recorded: 50, overCeiling: true });
    expect(first.alarms).toEqual([`${SWEEP_LOG_PREFIX} OVER THE CEILING due=62 recorded=50 ceiling=50`]);
    expect(await taken(mine)).toEqual([...Array(50).fill(true), ...Array(10).fill(false)]);
    expect(await taken(theirs)).toEqual([false, false]);
    expect(await beats("ceiling-1")).toEqual(
      [
        { tenant: tenantA, due: 60, recorded: 50, overCeiling: true },
        { tenant: tenantB, due: 2, recorded: 0, overCeiling: true },
      ].sort(byTenant),
    );

    // PASS 2: the ten that waited, and tenant B's two. Nothing over.
    const second = await run("ceiling-2", 15);
    expect(second.outcome).toEqual({ mode: "shadow", tenants: 2, failedTenants: 0, due: 12, recorded: 12, overCeiling: false });
    expect(second.alarms).toEqual([]);
    expect(await taken(mine)).toEqual(Array(60).fill(true));
    expect(await taken(theirs)).toEqual([true, true]);
    expect(await beats("ceiling-2")).toEqual(
      [
        { tenant: tenantA, due: 10, recorded: 10, overCeiling: false },
        { tenant: tenantB, due: 2, recorded: 2, overCeiling: false },
      ].sort(byTenant),
    );

    // PASS 3: nothing left, and still a heartbeat for each tenant.
    const third = await run("ceiling-3", 30);
    expect(third.outcome).toMatchObject({ due: 0, recorded: 0, overCeiling: false });
    expect(await beats("ceiling-3")).toHaveLength(2);
    // Every shadow row carries its own tenant.
    expect((await shadowsOf(theirs[0]!.id))[0]!.tenant_id).toBe(tenantB);
    expect((await shadowsOf(mine[0]!.id))[0]!.tenant_id).toBe(tenantA);
  });

  it("a tenant whose pass cannot get its lock is given up after two seconds, leaves nothing, and does not stop the other tenant", async () => {
    const { runReminderSweep, ReminderSweepError, SWEEP_LOG_PREFIX } = await import("./sweep");
    const now = clockOf(7);
    const mine = await oneMarkVisit(now);
    const theirs = await oneMarkVisit(now, { tenant: tenantB });
    const run = (passId: string, alarms: string[]) =>
      runReminderSweep({
        listTenantIds: async () => [tenantA, tenantB],
        passId,
        now: () => now,
        log: () => {},
        alarm: (l) => alarms.push(l),
      });

    const release = await holdSweepLock(tenantA);
    const alarms: string[] = [];
    let failure: unknown;
    try {
      const started = Date.now();
      failure = await run("stuck-1", alarms).catch((e: unknown) => e);
      // Postgres ended the wait: the pass did not sit behind the holder.
      expect(Date.now() - started).toBeLessThan(15_000);
    } finally {
      await release();
    }
    expect(failure).toBeInstanceOf(ReminderSweepError);
    expect((failure as InstanceType<typeof ReminderSweepError>).outcome).toEqual({
      mode: "shadow",
      tenants: 2,
      failedTenants: 1,
      due: 1,
      recorded: 1,
      overCeiling: false,
    });
    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatch(new RegExp(`^\\${SWEEP_LOG_PREFIX} tenant FAILED tenantId=${tenantA}: [A-Za-z]+$`));
    // Tenant A: no shadow row and NO HEARTBEAT, which is the signal. Tenant B: swept.
    expect(await shadowsOf(mine.id)).toHaveLength(0);
    expect(await shadowsOf(theirs.id)).toHaveLength(1);
    expect((await heartbeatsOf("stuck-1")).map((b) => b.tenant_id)).toEqual([tenantB]);

    // The next pass, with the lock free, takes what the failed one could not.
    const again: string[] = [];
    expect(await run("stuck-2", again)).toEqual({ mode: "shadow", tenants: 2, failedTenants: 0, due: 1, recorded: 1, overCeiling: false });
    expect(again).toEqual([]);
    expect(await shadowsOf(mine.id)).toHaveLength(1);
    expect(await heartbeatsOf("stuck-2")).toHaveLength(2);
  });

  /* ---------------------------------------------------------------- */
  /* 6. A pass sends nothing                                           */
  /* ---------------------------------------------------------------- */

  it("A PASS SENDS NOTHING: it leaves shadow rows and heartbeats, and no ledger row, claim, release, notice or change to a visit", async () => {
    const { runReminderSweep } = await import("./sweep");
    const now = clockOf(8);
    // Everything a real send would act on: due marks in both tenants, both
    // channels, a confirmed visit, one never reminded, one already suppressed.
    await visit({ now, startIn: 60 });
    await visit({ now, startIn: 90, status: "confirmed" });
    await visit({ now, startIn: 120, booked: false });
    const suppressed = await oneMarkVisit(now);
    await seedClaim(suppressed.id, suppressed.start, { taker: "run" });
    await seedLedger(suppressed.id, "suppressed");
    await visit({ now, startIn: 60, tenant: tenantB });

    const before = await footprint();
    const shadowsBefore = await rows(raw`select count(*)::int as n from audit_log
      where tenant_id in (${tenantA}, ${tenantB}) and action = 'appointment.reminder_sweep_shadow'`);

    const outcome = await runReminderSweep({
      listTenantIds: async () => [tenantA, tenantB],
      passId: "sends-nothing",
      now: () => now,
      log: () => {},
      alarm: () => {},
    });
    // It DID take marks: seven of them, so "nothing was sent" is not "nothing was due".
    expect(outcome).toEqual({ mode: "shadow", tenants: 2, failedTenants: 0, due: 7, recorded: 7, overCeiling: false });

    // Everything a send would have left is exactly as it was.
    expect(await footprint()).toEqual(before);
    // What the pass did leave: seven shadow rows and two heartbeats, by nobody, from nowhere.
    const left = await rows(raw`select action, entity_type, count(*)::int as n,
        count(actor_user_id)::int as with_actor, count(ip)::int as with_ip
      from audit_log
      where tenant_id in (${tenantA}, ${tenantB}) and metadata->>'passId' = 'sends-nothing'
      group by action, entity_type order by action`);
    expect(left).toEqual([
      { action: "appointment.reminder_sweep_shadow", entity_type: "appointment", n: 7, with_actor: 0, with_ip: 0 },
      { action: "reminder_sweep.pass", entity_type: "reminder_sweep", n: 2, with_actor: 0, with_ip: 0 },
    ]);
    const shadowsAfter = await rows(raw`select count(*)::int as n from audit_log
      where tenant_id in (${tenantA}, ${tenantB}) and action = 'appointment.reminder_sweep_shadow'`);
    expect(Number(shadowsAfter[0]!.n) - Number(shadowsBefore[0]!.n)).toBe(7);
    expect(h.reached).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("negative control: the spies do see a send, so their silence above means something", async () => {
    const clients = await import("./clients");
    const dispatch = await import("./dispatch");
    const { inngest } = await import("./inngest/client");
    await expect(clients.sendSms({} as never)).rejects.toThrow("the shadow sweep reached clients.sendSms");
    await expect(clients.sendEmail({} as never)).rejects.toThrow("clients.sendEmail");
    await expect(dispatch.dispatchReminder("t", "a", "24h", "sms")).rejects.toThrow("dispatch.dispatchReminder");
    await expect(inngest.send({ name: "x", data: {} } as never)).rejects.toThrow("inngest.send");
    await expect(fetch("https://sweep.invalid/")).rejects.toThrow("fetch");
    expect(h.reached).toEqual([
      "clients.sendSms",
      "clients.sendEmail",
      "dispatch.dispatchReminder",
      "inngest.send",
      "fetch",
    ]);
    // Emptied by hand, so the check after every arm still holds for this one.
    h.reached.length = 0;
  });
});
