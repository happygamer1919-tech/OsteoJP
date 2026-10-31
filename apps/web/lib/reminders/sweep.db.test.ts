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
 *      the tenant, the kind of row, the taker, an early claim, a released
 *      claim. And which rows the table itself refuses, so the selection never
 *      meets them.
 *   4. THE CEILING. 50 marks a pass over every tenant, oldest first, the rest
 *      on the next pass, and the heartbeat says so.
 *   5. ONE HEARTBEAT PER TENANT PER PASS, and none for a tenant whose pass
 *      could not finish, which does not stop the other tenant's.
 *   6. A PASS SENDS NOTHING. It leaves shadow rows in `reminder_claims` and
 *      heartbeats in `reminder_sweep_passes`, and nothing else: no ledger row,
 *      no claim, no release, no change to a visit. The transports, the
 *      dispatcher, the scheduler's client and `fetch` are replaced by spies,
 *      and none is reached.
 *   7. NOTHING OF IT IS IN THE AUDIT TRAIL. A full pass leaves `audit_log`
 *      exactly as it found it, row for row, and after every arm of this file
 *      the two tenants' audit rows are the booking rows the seeds wrote and
 *      nothing else.
 *
 * WHY A DATABASE. The selection is one read of `appointments`, of the audit
 * trail of a visit's booking, and of `reminder_claims`, made under the reminder
 * job's own role and tenant claim, behind an advisory lock. A mock has no
 * policy to hide another tenant's rows or to refuse a write, no constraint, no
 * timestamps to compare and no lock to wait on.
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

  /** How many booking rows the seeds wrote to the audit trail. The last arm reads the trail against it. */
  let bookingRows = 0;

  /**
   * A booking row on a visit's audit trail, as a save at the clinic writes
   * one. The sweep reads it to tell a visit the clinic saved, and writes none
   * of its own. Stamped `at` the visit's creation, as the booking is: never by
   * the database's clock, which would put it after the mark of an arm's
   * pinned morning once the real date passes that morning (R24 reads when a
   * scheduling save was written).
   */
  async function booking(tenant: string, appointmentId: string, at?: Date, bookedStart?: Date): Promise<void> {
    // `bookedStart`: the start the booking row records, as createAppointment
    // writes it. Without it the row carries no start, which the gate reads as
    // "start at the mark unknown" (a move after the mark then counts).
    const metadata = JSON.stringify(bookedStart ? { startsAt: bookedStart.toISOString() } : {});
    await sql.execute(raw`insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
      values (${tenant}, null, 'appointment.create', 'appointment', ${appointmentId}, ${metadata}::jsonb,
              coalesce(${at?.toISOString() ?? null}::timestamptz, now()))`);
    bookingRows += 1;
  }

  /**
   * The audit rows of the R24 arm, other than bookings: saves written at a
   * chosen instant, by action. The last arm reads the trail against these and
   * `bookingRows`, and nothing else.
   */
  const laterSaves: Record<string, number> = {};

  /** A save on a visit's audit trail, written `at` an instant of the arm's choosing. */
  async function savedAt(appointmentId: string, action: string, metadata: Record<string, unknown>, at: Date): Promise<void> {
    await sql.execute(raw`insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
      values (${tenantA}, null, ${action}, 'appointment', ${appointmentId}, ${JSON.stringify(metadata)}::jsonb, ${at.toISOString()})`);
    laterSaves[action] = (laterSaves[action] ?? 0) + 1;
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
    /** `patient_portal` for an online request (0067). The default is the column's: `staff`. */
    origin?: string;
    booked?: boolean;
    /** Minutes from the start to the start the booking row records. Absent: the row records none. */
    bookedStartIn?: number;
    /**
     * Microseconds added to the STORED start, which a `Date` cannot carry. The
     * start handed back is the one a sender's clock would read: without them.
     */
    micros?: number;
  }): Promise<{ id: string; start: Date }> {
    const tenantId = v.tenant ?? tenantA;
    const mine = seeds[tenantId]!;
    const id = randomUUID();
    const start = plus(v.now, v.startIn);
    const created = plus(v.now, v.createdIn ?? -5 * 24 * 60);
    const updated = v.updatedIn === undefined ? created : plus(v.now, v.updatedIn);
    await sql.execute(raw`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin, created_at, updated_at)
      values (${id}, ${tenantId}, ${mine.patient}, ${mine.therapist}, ${mine.location},
              ${start.toISOString()}::timestamptz + make_interval(secs => ${(v.micros ?? 0) / 1_000_000}::double precision),
              ${plus(start, 45).toISOString()}, ${v.status ?? "scheduled"}, ${v.origin ?? "staff"},
              ${created.toISOString()}, ${updated.toISOString()})`);
    if (v.booked !== false) {
      await booking(tenantId, id, created, v.bookedStartIn === undefined ? undefined : plus(start, v.bookedStartIn));
    }
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

  const hoursOf = (offsetId: string) => (offsetId === "48h" ? 48 : 24);

  /** A shadow row, shaped as a pass writes it, on the owning connection. */
  async function seedShadow(
    appointmentId: string,
    start: Date,
    over: { tenant?: string; offsetId?: "24h" | "48h"; channel?: string } = {},
  ): Promise<void> {
    const offsetId = over.offsetId ?? SMS.offsetId;
    await sql.execute(raw`insert into reminder_claims
      (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark)
      values (${over.tenant ?? tenantA}, ${appointmentId}, 'shadow', ${offsetId}, ${over.channel ?? SMS.channel},
              ${start.toISOString()}, ${plus(start, -hoursOf(offsetId) * 60).toISOString()}, 0, false)`);
  }

  /**
   * A claim row, shaped as takeReminderClaim writes it. `early: null` is a
   * claim with no mark on record: the table holds "no early flag" and "no due
   * time" to each other.
   */
  async function seedClaim(
    appointmentId: string,
    start: Date,
    over: {
      tenant?: string;
      taker?: "run" | "sweep";
      offsetId?: "24h" | "48h";
      channel?: string;
      early?: boolean | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    const offsetId = over.offsetId ?? SMS.offsetId;
    const early = over.early === undefined ? false : over.early;
    const due = early === null ? null : plus(start, -hoursOf(offsetId) * 60).toISOString();
    // The attempt as the writer numbers it (0106): the next one for this
    // reminder and start.
    await sql.execute(raw`insert into reminder_claims
      (id, tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, attempt)
      values (${id}, ${over.tenant ?? tenantA}, ${appointmentId}, 'claim', ${offsetId}, ${over.channel ?? SMS.channel},
              ${start.toISOString()}, ${due}::timestamptz, ${over.taker ?? "sweep"}, ${early}::boolean,
              (select coalesce(max(attempt), 0) + 1 from reminder_claims
                where appointment_id = ${appointmentId} and kind = 'claim' and offset_id = ${offsetId}
                  and channel = ${over.channel ?? SMS.channel} and starts_at = ${start.toISOString()}::timestamptz))`);
    return id;
  }

  /**
   * A release row. Since 0106 a release carries its claim's offset and
   * channel, so the release of another reminder's claim names that reminder.
   */
  async function seedRelease(
    appointmentId: string,
    claimId: string,
    over: { tenant?: string; offsetId?: "24h" | "48h"; channel?: string } = {},
  ): Promise<void> {
    await sql.execute(raw`insert into reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, claim_id)
      values (${over.tenant ?? tenantA}, ${appointmentId}, 'release', ${over.offsetId ?? SMS.offsetId},
              ${over.channel ?? SMS.channel}, ${claimId})`);
  }

  /**
   * The constraint that refused a statement. Drizzle wraps the driver's error,
   * so the name is looked for on the error and on its cause.
   */
  async function refusedBy(statement: Promise<unknown>): Promise<string> {
    try {
      await statement;
    } catch (e) {
      const own = (e as { constraint_name?: string }).constraint_name;
      const cause = ((e as { cause?: { constraint_name?: string } }).cause ?? {}).constraint_name;
      return own ?? cause ?? `refused with no constraint: ${e instanceof Error ? e.name : "unknown"}`;
    }
    return "NOT REFUSED";
  }

  /**
   * ANOTHER visit of the same tenant with this very start. Cancelled, so it is
   * no mark of its own; it is there to carry a row that names the wrong visit.
   */
  async function twinOf(v: { start: Date }, now: Date): Promise<{ id: string; start: Date }> {
    return visit({ now, startIn: Math.round((v.start.getTime() - now.getTime()) / MIN), createdIn: -10 * 60, status: "cancelled" });
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

  /** An instant column as the ISO text `toISOString()` writes, or null. */
  const iso = (column: string) => raw.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

  /** The shadow rows of one visit, whole. */
  async function shadowsOf(appointmentId: string): Promise<Row[]> {
    return rows(raw`select tenant_id::text as tenant_id, kind, offset_id, channel,
        ${iso("starts_at")} as starts_at, ${iso("due_at")} as due_at,
        minutes_after_mark, saved_after_mark, pass_id, taker, early, claim_id
      from reminder_claims
      where appointment_id = ${appointmentId} and kind = 'shadow'
      order by offset_id, created_at, id`);
  }

  /** The heartbeats of one pass, whole. */
  async function heartbeatsOf(passId: string): Promise<Row[]> {
    return rows(raw`select tenant_id::text as tenant_id, pass_id, mode,
        ${iso("pass_at")} as pass_at, ${iso("look_ahead_before")} as look_ahead_before,
        due_count, recorded_count, over_ceiling, excluded_count
      from reminder_sweep_passes
      where pass_id = ${passId} and tenant_id in (${tenantA}, ${tenantB})
      order by tenant_id`);
  }

  /** The two tenants' audit trail, as a count and a fingerprint of every row in it. */
  async function auditTrail(): Promise<Row> {
    const [t] = await rows(raw`select count(*)::int as n,
        coalesce(md5(string_agg(id::text || action || entity_type || coalesce(entity_id::text, '') || metadata::text
          || created_at::text, ',' order by id)), '') as fingerprint
      from audit_log where tenant_id in (${tenantA}, ${tenantB})`);
    return t!;
  }

  /** Everything a send, or a sender's bookkeeping, would have changed for the two tenants. */
  async function footprint() {
    const [f] = await rows(raw`select
      (select count(*)::int from reminder_dispatches where tenant_id in (${tenantA}, ${tenantB})) as ledger,
      (select count(*)::int from reminder_claims where tenant_id in (${tenantA}, ${tenantB})
         and kind = 'claim') as claims,
      (select count(*)::int from reminder_claims where tenant_id in (${tenantA}, ${tenantB})
         and kind = 'release') as releases,
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
      // By tenant: a seeded row of one tenant may name the other's visit, and
      // a heartbeat names no visit at all, so no cascade reaches it.
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
    await booking(tenantB, v.q.id);
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
    const ahead = await shadowsOf(x.id);
    expect(ahead.map((m) => [m.offset_id, m.minutes_after_mark, m.due_at])).toEqual([
      // Its due time is 22:30 tonight, 45 minutes after the pass.
      ["24h", -45, plus(last, 45).toISOString()],
      ["48h", 23 * 60 + 15, plus(last, -(23 * 60 + 15)).toISOString()],
    ]);
    const [beat] = await heartbeatsOf("last-pass");
    expect(beat!.look_ahead_before).toBe(lisbonDateTimeToUtc(day, "23:00").toISOString());
    expect(beat!.pass_at).toBe(last.toISOString());
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

    // The rows, whole. Ids, enums, two instants and two facts: nobody's name,
    // and nothing a claim or a release carries.
    const row = (offsetId: "24h" | "48h", channel: string, start: Date, minutesAfterMark: number) => ({
      tenant_id: tenantA,
      kind: "shadow",
      offset_id: offsetId,
      channel,
      starts_at: start.toISOString(),
      due_at: plus(start, -hoursOf(offsetId) * 60).toISOString(),
      minutes_after_mark: minutesAfterMark,
      saved_after_mark: false,
      pass_id: "once-1",
      taker: null,
      early: null,
      claim_id: null,
    });
    expect(await shadowsOf(v1.id)).toEqual([
      row("24h", "sms", v1.start, 23 * 60),
      row("48h", "email", v1.start, 47 * 60),
    ]);
    expect(await shadowsOf(v2.id)).toEqual([row("48h", "email", v2.start, 23 * 60)]);

    // The heartbeat, whole: this tenant's, in its own table, with the pass's counts.
    expect(await heartbeatsOf("once-1")).toEqual([
      {
        tenant_id: tenantA,
        pass_id: "once-1",
        mode: "shadow",
        pass_at: now.toISOString(),
        look_ahead_before: null,
        due_count: 3,
        recorded_count: 3,
        over_ceiling: false,
        // Both marks of the visit that never had a reminder.
        excluded_count: 2,
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
    expect((await shadowsOf(v2.id)).map((s) => s.offset_id)).toEqual(["24h", "48h"]);
    expect(await shadowsOf(v1.id)).toHaveLength(2);

    // WITH THE SWITCH ON nothing is left out, and the heartbeat's count says 0.
    const { sweepTenantInShadow } = await import("./sweep");
    await sweepTenantInShadow({ tenantId: tenantA, now: plus(now, 150), limit: 50, passId: "once-on", includeNeverReminded: true });
    expect((await heartbeatsOf("once-on")).map((b) => b.excluded_count)).toEqual([0]);
    // A PASS WITH NO ID of its own still leaves its heartbeat, with no pass id:
    // the table takes an id or none, never a blank one.
    const noId = () =>
      rows(raw`select count(*)::int as n from reminder_sweep_passes where tenant_id = ${tenantA} and pass_id is null`);
    const before = Number((await noId())[0]!.n);
    await pass(tenantA, plus(now, 165), "");
    expect(Number((await noId())[0]!.n) - before).toBe(1);
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
    // ...also for a visit whose STORED start carries microseconds. A pass reads
    // the start as its clock does, to the millisecond, and writes that; the
    // next pass must know its own row, or it would take the mark every time.
    const fine = await visit({ now, startIn: 20 * 60 + n++, createdIn: -10 * 60, micros: 123 });
    const [stored] = await rows(raw`select (starts_at <> date_trunc('milliseconds', starts_at)) as has_micros
      from appointments where id = ${fine.id}`);
    expect(stored).toEqual({ has_micros: true });
    expect(await selects(now, fine.id)).toBe(true);
    await seedShadow(fine.id, fine.start);
    expect(await selects(now, fine.id)).toBe(false);
    // ...and nothing that only looks like it does.
    const notShadows: [string, (v: { id: string; start: Date }) => Promise<unknown>][] = [
      ["a shadow row for another start", (v) => seedShadow(v.id, elsewhen(v.start))],
      ["a shadow row for the other reminder", (v) => seedShadow(v.id, v.start, { offsetId: "48h", channel: "email" })],
      ["a shadow row for another channel", (v) => seedShadow(v.id, v.start, { channel: "email" })],
      ["a shadow row for another offset on this channel", (v) => seedShadow(v.id, v.start, { offsetId: "48h" })],
      ["a shadow row of ANOTHER visit with this very start", async (v) => seedShadow((await twinOf(v, now)).id, v.start)],
      ["a shadow row of another tenant", (v) => seedShadow(v.id, v.start, { tenant: tenantB })],
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
    // A release that names ANOTHER claim of the visit (its other reminder's) frees nothing.
    const otherRelease = await fresh();
    await seedClaim(otherRelease.id, otherRelease.start);
    await seedRelease(otherRelease.id, await seedClaim(otherRelease.id, otherRelease.start, { offsetId: "48h", channel: "email" }), {
      offsetId: "48h",
      channel: "email",
    });
    expect(await selects(now, otherRelease.id)).toBe(false);
    // WHAT THE TABLE REFUSES, so the selection never has to tell it apart: a
    // release another tenant wrote, a release filed under another visit, and
    // a release that names no row. Each leaves the claim live.
    const foreignRelease = await fresh();
    const kept = await seedClaim(foreignRelease.id, foreignRelease.start);
    expect(await refusedBy(seedRelease(foreignRelease.id, kept, { tenant: tenantB }))).toBe("reminder_claims_claim_fkey");
    expect(await refusedBy(seedRelease((await twinOf(foreignRelease, now)).id, kept))).toBe("reminder_claims_claim_fkey");
    expect(await refusedBy(seedRelease(foreignRelease.id, randomUUID()))).toBe("reminder_claims_claim_fkey");
    expect(await selects(now, foreignRelease.id)).toBe(false);

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
      ["a claim of the sweep on ANOTHER visit with this very start", async (v) => seedClaim((await twinOf(v, now)).id, v.start)],
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
    // The claim whose three releases the table refused is still live here too.
    expect(ids).not.toContain(foreignRelease.id);
  });

  it("a visit moved to another time is a new mark, and moved back it is the old one again", async () => {
    const now = clockOf(5);
    const v = await oneMarkVisit(now);
    expect(await pass(tenantA, now, "moved-1")).toEqual({ due: 1, recorded: 1, overCeiling: false });
    expect(await selects(plus(now, 15), v.id)).toBe(false);

    // Moved two hours later. The mark of the new start is due as well: taken, once.
    // Moved by a bare write that leaves no audit row: a move at the clinic writes
    // `appointment.reschedule`, and a visit SAVED after its mark is the R24 arm below.
    const moved = plus(v.start, 120);
    const move = (to: Date) =>
      sql.execute(raw`update appointments set starts_at = ${to.toISOString()},
        ends_at = ${plus(to, 45).toISOString()}, updated_at = ${plus(now, 10).toISOString()} where id = ${v.id}`);
    await move(moved);
    expect(await pass(tenantA, plus(now, 15), "moved-2")).toEqual({ due: 1, recorded: 1, overCeiling: false });
    expect(await pass(tenantA, plus(now, 30), "moved-3")).toEqual({ due: 0, recorded: 0, overCeiling: false });
    const shadows = await shadowsOf(v.id);
    expect(shadows.map((m) => m.starts_at)).toEqual([v.start.toISOString(), moved.toISOString()]);
    // The row of the new start says the visit was saved after that mark.
    expect(shadows.map((m) => m.saved_after_mark)).toEqual([false, true]);

    // Moved back: the first row is about this start, so nothing is taken again.
    await move(v.start);
    expect(await pass(tenantA, plus(now, 45), "moved-4")).toEqual({ due: 0, recorded: 0, overCeiling: false });
    expect(await shadowsOf(v.id)).toHaveLength(2);
  });

  /**
   * R24, strategy's ruling: "S5 grace = none. GATE: a visit saved after its
   * mark and before the pass gets no shadow row and no send; a visit saved
   * before its mark is unchanged." A save counts when it RE-ARMED the sleeping
   * job (R33, the table of ./reminder-population.ts), timed by its own
   * `created_at`. AT the mark exactly counts as before it.
   */
  it("R24: a visit SAVED AFTER ITS MARK and before the pass gets no shadow row; saved before or AT its mark it is taken as before", async () => {
    const now = clockOf(9);
    const H = 60;
    // Each starts 20 hours on and was created 10 hours ago: one mark, the 24
    // hour one, due 4 hours ago (the 48 hour mark was before the creation).
    const one = async (i: number) => {
      const v = await oneMarkVisit(now, { startIn: 20 * H + i });
      return { ...v, mark: plus(v.start, -24 * H) };
    };
    const toThisStart = (v: { start: Date }) => ({ startsAt: v.start.toISOString() });
    const v = {
      // (b) Booked before its mark, nothing since: taken, as before R24.
      before: await one(0),
      // (a) S5 itself: booked earlier, moved TO this start one minute after its mark.
      movedAfter: await one(1),
      // (c) The same move, written AT the mark to the microsecond: before it, so taken.
      movedAtMark: await one(2),
      // The boundary from the other side: one millisecond after the mark.
      movedJustAfter: await one(3),
      // S5's other arm: an online request nobody had accepted at its mark, accepted after it.
      acceptedAfter: await visit({ now, startIn: 20 * H + 4, createdIn: -10 * H, booked: false }),
      // R33: a status set to Confirmada by hand after the mark re-arms nothing: taken.
      confirmedAfter: await one(5),
      // CONTROL: an edit after the mark that is not a scheduling save changes nothing.
      editedAfter: await one(6),
      // Two marks: created five days ago, both due; saved between the 48 hour
      // mark and the 24 hour one. The 48 hour mark is not taken, the 24 hour one is.
      between: await visit({ now, startIn: 20 * H + 7 }),
    };
    const markOf = (x: { start: Date }) => plus(x.start, -24 * H);
    await savedAt(v.movedAfter.id, "appointment.reschedule", toThisStart(v.movedAfter), plus(markOf(v.movedAfter), 1));
    await savedAt(v.movedAtMark.id, "appointment.reschedule", toThisStart(v.movedAtMark), markOf(v.movedAtMark));
    await savedAt(v.movedJustAfter.id, "appointment.reschedule", toThisStart(v.movedJustAfter), new Date(markOf(v.movedJustAfter).getTime() + 1));
    await savedAt(v.acceptedAfter.id, "appointment.update", { via: "portal_request_confirm" }, plus(markOf(v.acceptedAfter), 5));
    await savedAt(v.confirmedAfter.id, "appointment.update", { fromStatus: "scheduled", toStatus: "confirmed" }, plus(markOf(v.confirmedAfter), 5));
    await savedAt(v.editedAfter.id, "appointment.update", { fields: ["notes"] }, plus(markOf(v.editedAfter), 5));
    await savedAt(v.between.id, "appointment.reschedule", toThisStart(v.between), plus(v.between.start, -30 * H));

    const label = (id: string) => Object.entries(v).find(([, x]) => x.id === id)?.[0] ?? id;
    const keys = (marks: { appointmentId: string; offsetId: string }[]) =>
      marks.map((m) => `${label(m.appointmentId)}:${m.offsetId}`).sort();
    const taken = ["before:24h", "between:24h", "confirmedAfter:24h", "editedAfter:24h", "movedAtMark:24h"];

    // THE SELECTION. Not taken, and not counted as due either.
    const selected = await select(tenantA, now);
    expect(keys(selected.marks)).toEqual(taken);
    expect(selected.due).toBe(taken.length);
    // The accepted request HAS a scheduling save now, so it is not "never reminded".
    expect(selected.neverRemindedLeftOut).toBe(0);
    // With the switch that takes every visit on, the gate still holds.
    expect(keys((await select(tenantA, now, { includeNeverReminded: true })).marks)).toEqual(taken);

    // THE PASS writes a shadow row for each mark taken and none for the others.
    expect(await pass(tenantA, now, "r24-1")).toEqual({ due: taken.length, recorded: taken.length, overCeiling: false });
    for (const name of ["movedAfter", "movedJustAfter", "acceptedAfter"] as const) {
      expect(await shadowsOf(v[name].id), name).toEqual([]);
    }
    expect((await shadowsOf(v.between.id)).map((r) => r.offset_id)).toEqual(["24h"]);
    expect((await shadowsOf(v.before.id)).map((r) => r.saved_after_mark)).toEqual([false]);
    expect(await shadowsOf(v.movedAtMark.id)).toHaveLength(1);
    expect(await shadowsOf(v.editedAfter.id)).toHaveLength(1);
    expect(await shadowsOf(v.confirmedAfter.id)).toHaveLength(1);
    expect((await heartbeatsOf("r24-1"))[0]).toMatchObject({ due_count: taken.length, recorded_count: taken.length });

    // NOT TAKEN MEANS NEVER, for that start: a later pass takes nothing, and the visits are still ahead.
    expect(await pass(tenantA, plus(now, 15), "r24-2")).toEqual({ due: 0, recorded: 0, overCeiling: false });
    expect(await pass(tenantA, plus(now, 6 * H), "r24-3")).toEqual({ due: 0, recorded: 0, overCeiling: false });
    for (const name of ["movedAfter", "movedJustAfter", "acceptedAfter"] as const) {
      expect(await shadowsOf(v[name].id), name).toEqual([]);
    }
  });

  /**
   * R33, strategy's ruling: "It counts exactly the saves that make the live
   * job re-plan this visit's reminders [...]. A status-only save (an SMS
   * "confirmo", a hand-set Confirmada) never counts." Every door of the table,
   * after the mark, against the same audit rows on a visit where they re-arm
   * nothing. Written the way each door writes its row (actions.ts,
   * inbound-store.ts, inbound-reply.ts).
   */
  it("R33: only a save that RE-ARMED the sleeping job keeps a mark out; the same rows on a booked visit are status-only and the mark is taken", async () => {
    const now = clockOf(10);
    const H = 60;
    let i = 0;
    // One mark each, the 24 hour one, due 5 to 14 hours ago, 46 minutes apart
    // (one therapist, and two confirmed visits may not overlap). `request`: an online
    // request (origin patient_portal), which the portal writes with no audit
    // row; reception moved it before its mark, unaccepted (a move re-arms
    // nothing for a request, and it puts the visit among those the clinic
    // saved), so every one of them is a visit the pass would take.
    const one = async (over: { request?: boolean; status?: string } = {}) => {
      i += 1;
      const v = await visit({
        now,
        startIn: 10 * H + 46 * i,
        createdIn: -20 * H,
        status: over.status,
        origin: over.request ? "patient_portal" : undefined,
        booked: !over.request,
      });
      if (over.request) await savedAt(v.id, "appointment.reschedule", { startsAt: v.start.toISOString() }, plus(now, -20 * H + 1));
      return { ...v, mark: plus(v.start, -24 * H) };
    };
    const after = (x: { mark: Date }) => plus(x.mark, 5);
    const reply = (outcome: string) => ({ source: "patient-sms-reply", intent: "confirmada", outcome, reason: null });
    const review = (resolution: string, applied: boolean) => ({ source: "reception-sms-review", resolution, applied });

    const v = {
      // STATUS-ONLY on a booked visit: each re-arms nothing, so each is taken.
      handConfirmed: await one({ status: "confirmed" }),
      smsConfirmed: await one({ status: "confirmed" }),
      reviewConfirmed: await one({ status: "confirmed" }),
      // A request's own SMS refused for the slot: the row says `review`, nothing was accepted.
      requestSmsRefused: await one({ request: true }),
      // A request brought back from Cancelada to Agendada is unaccepted again and emits nothing.
      requestBroughtBackToAgendada: await one({ request: true }),
      // A request accepted BEFORE its mark, saved again as Confirmada after it: no transition, no event.
      requestConfirmedAgain: await one({ request: true, status: "confirmed" }),
      // RE-ARMING: each door below emitted appointment/scheduled, so each keeps its mark out.
      requestAcceptedWithEstado: await one({ request: true, status: "confirmed" }),
      requestAcceptedBySms: await one({ request: true, status: "confirmed" }),
      requestAcceptedInReview: await one({ request: true, status: "confirmed" }),
      broughtBackToConfirmada: await one({ status: "confirmed" }),
      broughtBackToAgendada: await one(),
      requestBroughtBackToConfirmada: await one({ request: true, status: "confirmed" }),
    };
    await savedAt(v.handConfirmed.id, "appointment.update", { changed: ["status"], fromStatus: "scheduled", toStatus: "confirmed" }, after(v.handConfirmed));
    await savedAt(v.smsConfirmed.id, "appointment.patient_sms_reply", reply("confirmed"), after(v.smsConfirmed));
    await savedAt(v.reviewConfirmed.id, "appointment.sms_reply_reviewed", review("confirmed", true), after(v.reviewConfirmed));
    await savedAt(v.requestSmsRefused.id, "appointment.patient_sms_reply", { ...reply("review"), reason: "slot_taken" }, after(v.requestSmsRefused));
    await savedAt(v.requestBroughtBackToAgendada.id, "appointment.update", { changed: ["status"], fromStatus: "cancelled", toStatus: "scheduled" }, after(v.requestBroughtBackToAgendada));
    await savedAt(v.requestConfirmedAgain.id, "appointment.update", { changed: ["status"], fromStatus: "confirmed", toStatus: "confirmed" }, after(v.requestConfirmedAgain));
    await savedAt(v.requestAcceptedWithEstado.id, "appointment.update", { changed: ["status"], fromStatus: "scheduled", toStatus: "confirmed" }, after(v.requestAcceptedWithEstado));
    await savedAt(v.requestAcceptedBySms.id, "appointment.patient_sms_reply", reply("confirmed"), after(v.requestAcceptedBySms));
    await savedAt(v.requestAcceptedInReview.id, "appointment.sms_reply_reviewed", review("confirmed", true), after(v.requestAcceptedInReview));
    await savedAt(v.broughtBackToConfirmada.id, "appointment.update", { changed: ["status"], fromStatus: "cancelled", toStatus: "confirmed" }, after(v.broughtBackToConfirmada));
    await savedAt(v.broughtBackToAgendada.id, "appointment.update", { changed: ["status"], fromStatus: "cancelled", toStatus: "scheduled" }, after(v.broughtBackToAgendada));
    await savedAt(v.requestBroughtBackToConfirmada.id, "appointment.update", { changed: ["status"], fromStatus: "cancelled", toStatus: "confirmed" }, after(v.requestBroughtBackToConfirmada));

    const label = (id: string) => Object.entries(v).find(([, x]) => x.id === id)?.[0] ?? id;
    const taken = [
      "handConfirmed",
      "requestBroughtBackToAgendada",
      "requestConfirmedAgain",
      "requestSmsRefused",
      "reviewConfirmed",
      "smsConfirmed",
    ];
    const selected = await select(tenantA, now);
    expect(selected.marks.map((m) => label(m.appointmentId)).sort()).toEqual(taken);
    expect(selected.due).toBe(taken.length);

    expect(await pass(tenantA, now, "r33-1")).toEqual({ due: taken.length, recorded: taken.length, overCeiling: false });
    for (const [name, x] of Object.entries(v)) {
      expect(await shadowsOf(x.id), name).toHaveLength(taken.includes(name) ? 1 : 0);
    }
  });

  /**
   * R33's GATE, its words: "CHECK a visit confirmed by SMS after its 24h mark,
   * already sent by the live job. EXPECT no UNEXPLAINED row and no send." In
   * shadow: the sweep takes that mark, so the compare finds the job's claim
   * and the shadow row side by side. (No send: sweep-send.db.test.ts.)
   */
  it("R33 GATE: a visit confirmed by SMS after its 24h mark, already sent by the sleeping job, is taken by the shadow: the job's claim and the shadow row side by side", async () => {
    const now = clockOf(11);
    const v = await oneMarkVisit(now);
    const mark = plus(v.start, -24 * 60);
    // The sleeping job woke at the mark and sent the SMS.
    await seedClaim(v.id, v.start, { taker: "run" });
    await seedLedger(v.id, "sent");
    // The patient answered "confirmo" twenty minutes later, before this pass.
    await sql.execute(raw`update appointments set status = 'confirmed', updated_at = ${plus(mark, 20).toISOString()} where id = ${v.id}`);
    await savedAt(v.id, "appointment.patient_sms_reply", { source: "patient-sms-reply", intent: "confirmada", outcome: "confirmed", reason: null }, plus(mark, 20));

    expect(await pass(tenantA, now, "r33-gate-a")).toEqual({ due: 1, recorded: 1, overCeiling: false });
    const shadows = await shadowsOf(v.id);
    expect(shadows.map((r) => [r.starts_at, r.offset_id, r.saved_after_mark])).toEqual([[v.start.toISOString(), "24h", true]]);
    const [jobClaim] = await rows(raw`select count(*)::int as n from reminder_claims
      where appointment_id = ${v.id} and kind = 'claim' and taker = 'run' and starts_at = ${v.start.toISOString()}::timestamptz`);
    expect(jobClaim!.n).toBe(1);
  });

  /**
   * R33's GATE, its words: "CHECK a visit moved after its mark to a later
   * start the same day. EXPECT the past mark not sent, as the live job does."
   * The move re-armed the sleeping job, which planned from the new start and
   * dropped its mark, already past. The sweep takes no mark for the new start,
   * and the old start's mark is no longer a mark of this visit.
   */
  it("R33 GATE: a visit moved after its mark to a LATER START THE SAME DAY: the past mark is not taken, as the job drops it; moved before that mark, it is", async () => {
    const now = clockOf(12);
    const H = 60;
    // Each now starts 20 hours on (its 24 hour mark 4 hours ago), and used to start 3 hours earlier that day.
    const movedLater = async (i: number, movedAt: (mark: Date) => Date) => {
      const v = await oneMarkVisit(now, { startIn: 20 * H + i });
      const oldStart = plus(v.start, -3 * H);
      const mark = plus(v.start, -24 * H);
      // The shadow took the old start's mark before the move, 7 hours ago.
      await seedShadow(v.id, oldStart);
      await savedAt(v.id, "appointment.reschedule", { startsAt: v.start.toISOString() }, movedAt(mark));
      return { ...v, oldStart };
    };
    // Moved an hour after the new start's mark: that mark was already past.
    const late = await movedLater(0, (mark) => plus(mark, 60));
    // CONTROL: moved an hour BEFORE the new start's mark (after the old one): the job keeps it.
    const early = await movedLater(1, (mark) => plus(mark, -60));

    expect(await pass(tenantA, now, "r33-gate-b")).toEqual({ due: 1, recorded: 1, overCeiling: false });
    expect((await shadowsOf(late.id)).map((r) => r.starts_at)).toEqual([late.oldStart.toISOString()]);
    expect((await shadowsOf(early.id)).map((r) => r.starts_at)).toEqual([early.oldStart.toISOString(), early.start.toISOString()]);
    // Never later either.
    expect(await pass(tenantA, plus(now, 2 * H), "r33-gate-b2")).toEqual({ due: 0, recorded: 0, overCeiling: false });
  });

  /**
   * A MOVE COUNTS ONLY WHEN THE START IS NOT THE ONE THE MARK WAS FOR (R4
   * round 2 on #1678). The start at the mark is the `startsAt` of the latest
   * booking or move row at or before the mark. Every visit here starts 20
   * hours on (its 24 hour mark 4 hours ago), and the sleeping job sent its SMS
   * at the mark.
   */
  it("R33: a move after the mark that KEEPS the start is taken (the job's claim and a shadow row); one that changed it is not", async () => {
    const now = clockOf(13);
    const H = 60;
    const toStart = (x: { start: Date }, minutes = 0) => ({ startsAt: plus(x.start, minutes).toISOString() });
    const one = async (i: number, bookedStartIn: number) => {
      const v = await visit({ now, startIn: 20 * H + i, createdIn: -10 * H, bookedStartIn });
      await seedClaim(v.id, v.start, { taker: "run" });
      await seedLedger(v.id, "sent");
      return { ...v, mark: plus(v.start, -24 * H) };
    };
    const v = {
      // (i) Booked at this start; another therapist after the mark, same start.
      therapistChanged: await one(0, 0),
      // (ii) Booked at this start; moved two hours on after the mark, and back.
      awayAndBack: await one(1, 0),
      // (iii) Booked three hours earlier that day; moved to this start after the mark.
      laterSameDay: await one(2, -3 * H),
      // (iv) The bulk change keeping the hour (its row is the single move's).
      bulkKeptHour: await one(3, 0),
      // The start at the mark from a move written AT the mark, after a booking elsewhere: kept, taken.
      movedAtMarkThenKept: await one(4, -2 * H),
      // CONTROL: a booking row with no start recorded: the move after the mark counts.
      noStartOnRecord: await visit({ now, startIn: 20 * H + 5, createdIn: -10 * H }),
    };
    const after = (x: { start: Date }, minutes: number) => plus(x.start, -24 * H + minutes);
    await savedAt(v.therapistChanged.id, "appointment.reschedule", { ...toStart(v.therapistChanged), scope: "one" }, after(v.therapistChanged, 5));
    await savedAt(v.awayAndBack.id, "appointment.reschedule", toStart(v.awayAndBack, 2 * H), after(v.awayAndBack, 5));
    await savedAt(v.awayAndBack.id, "appointment.reschedule", toStart(v.awayAndBack), after(v.awayAndBack, 10));
    await savedAt(v.laterSameDay.id, "appointment.reschedule", toStart(v.laterSameDay), after(v.laterSameDay, 5));
    await savedAt(
      v.bulkKeptHour.id,
      "appointment.reschedule",
      { ...toStart(v.bulkKeptHour), endsAt: plus(v.bulkKeptHour.start, 45).toISOString(), scope: "one", allowConflict: false },
      after(v.bulkKeptHour, 5),
    );
    await savedAt(v.movedAtMarkThenKept.id, "appointment.reschedule", toStart(v.movedAtMarkThenKept), after(v.movedAtMarkThenKept, 0));
    await savedAt(v.movedAtMarkThenKept.id, "appointment.reschedule", toStart(v.movedAtMarkThenKept), after(v.movedAtMarkThenKept, 5));
    await savedAt(v.noStartOnRecord.id, "appointment.reschedule", toStart(v.noStartOnRecord), after(v.noStartOnRecord, 5));

    const taken = ["awayAndBack", "bulkKeptHour", "movedAtMarkThenKept", "therapistChanged"];
    expect(await pass(tenantA, now, "kept-start")).toEqual({ due: taken.length, recorded: taken.length, overCeiling: false });
    for (const [name, x] of Object.entries(v)) {
      expect(await shadowsOf(x.id), name).toHaveLength(taken.includes(name) ? 1 : 0);
    }
    // "Both": the job's claim and the shadow row, for the same start.
    const [both] = await rows(raw`select count(*)::int as n from reminder_claims
      where appointment_id = ${v.therapistChanged.id} and starts_at = ${v.therapistChanged.start.toISOString()}::timestamptz
        and (kind = 'shadow' or (kind = 'claim' and taker = 'run'))`);
    expect(both!.n).toBe(2);
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
        .map((b) => ({ tenant: b.tenant_id, due: b.due_count, recorded: b.recorded_count, overCeiling: b.over_ceiling }))
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

  it("A PASS SENDS NOTHING AND AUDITS NOTHING: it leaves shadow rows and heartbeats in its own two tables, no ledger row, claim, release, notice or change to a visit, and audit_log exactly as it was", async () => {
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
    const auditBefore = await auditTrail();
    // NEGATIVE CONTROL: the trail is not empty. It holds the bookings seeded so far, and the R24 arm's saves.
    const later = Object.values(laterSaves).reduce((a, b) => a + b, 0);
    expect(auditBefore).toMatchObject({ n: bookingRows + later });
    expect(bookingRows).toBeGreaterThan(100);
    const shadowsBefore = await rows(raw`select count(*)::int as n from reminder_claims
      where tenant_id in (${tenantA}, ${tenantB}) and kind = 'shadow'`);

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
    // THE AUDIT TRAIL, READ AFTER THE FULL PASS: the same rows, to the byte.
    // Not one row was added, changed or removed.
    expect(await auditTrail()).toEqual(auditBefore);
    // What the pass did leave: seven shadow rows and two heartbeats, in their own tables.
    const left = await rows(raw`select kind, count(*)::int as n from reminder_claims
      where tenant_id in (${tenantA}, ${tenantB}) and pass_id = 'sends-nothing'
      group by kind order by kind`);
    expect(left).toEqual([{ kind: "shadow", n: 7 }]);
    expect((await heartbeatsOf("sends-nothing")).map((b) => [b.mode, b.recorded_count])).toHaveLength(2);
    const shadowsAfter = await rows(raw`select count(*)::int as n from reminder_claims
      where tenant_id in (${tenantA}, ${tenantB}) and kind = 'shadow'`);
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

  /* ---------------------------------------------------------------- */
  /* 7. Nothing of it is in the audit trail                            */
  /* ---------------------------------------------------------------- */

  /**
   * LAST ON PURPOSE: it reads what every arm above left. Passes ran for both
   * tenants, with shadow rows, heartbeats, claims and releases, and one arm
   * took claims through the claim's own code. The claim, the release, the
   * shadow row and the heartbeat were audit rows in the first draft of the
   * sweep. Not one is there now: the two tenants' audit trail holds the
   * booking rows this file's seeds wrote and the R24 arm's own saves, and
   * nothing else.
   */
  it("after every arm above: audit_log holds the seeded booking rows and no claim, release, shadow row or heartbeat", async () => {
    // NEGATIVE CONTROL: the four kinds of row were all written, in their own tables.
    const [written] = await rows(raw`select
        (select count(*)::int from reminder_claims where tenant_id in (${tenantA}, ${tenantB}) and kind = 'shadow') as shadows,
        (select count(*)::int from reminder_claims where tenant_id in (${tenantA}, ${tenantB}) and kind = 'claim') as claims,
        (select count(*)::int from reminder_claims where tenant_id in (${tenantA}, ${tenantB}) and kind = 'release') as releases,
        (select count(*)::int from reminder_sweep_passes where tenant_id in (${tenantA}, ${tenantB})) as heartbeats`);
    expect(Number(written!.shadows)).toBeGreaterThan(70);
    expect(Number(written!.claims)).toBeGreaterThan(15);
    expect(Number(written!.releases)).toBeGreaterThan(1);
    expect(Number(written!.heartbeats)).toBeGreaterThan(20);

    const audit = await rows(raw`select action, entity_type, count(*)::int as n from audit_log
      where tenant_id in (${tenantA}, ${tenantB}) group by action, entity_type order by action`);
    // The bookings, and the saves the R24 arm wrote itself at chosen instants. Nothing else.
    expect(laterSaves).toEqual({
      "appointment.patient_sms_reply": 4,
      "appointment.reschedule": 21,
      "appointment.sms_reply_reviewed": 2,
      "appointment.update": 10,
    });
    expect(audit).toEqual([
      { action: "appointment.create", entity_type: "appointment", n: bookingRows },
      ...Object.entries(laterSaves)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([action, n]) => ({ action, entity_type: "appointment", n })),
    ]);
  });
});
