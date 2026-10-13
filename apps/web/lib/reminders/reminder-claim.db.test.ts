/**
 * reminder-claim.db.test.ts - SWEEP-02, against a REAL Postgres, as the job.
 *
 * WHAT IT PROVES, and why each arm must be a database:
 *
 *   1. A SECOND SENDER IS HELD ONCE THE REMINDER WAS SENT. After a `sent`
 *      ledger row, the next call for the same appointment, offset, channel and
 *      start answers `claim_held`: nothing is sent, and it leaves no ledger
 *      row, no claim and no release.
 *   2. NOTHING ELSE BLOCKS. A claim alone, whatever its age, a provider
 *      refusal and a SUPPRESSION all leave the next caller to do what it did
 *      before claims existed.
 *   3. EVERY THROW RELEASES. A throw at each point before the provider call,
 *      and the provider's own refusal, leave a release row naming the claim,
 *      and the retry sends. A release that cannot be written changes nothing:
 *      the retry still sends.
 *   4. WHICH ROWS COUNT, row by row: the start, the offset, the channel, the
 *      template, the outcome, the order in time, an early claim, a released
 *      claim, a claim of another start in between, and a RELEASED claim in
 *      between, which takes no `sent` row from the live claim before it.
 *   5. TWO TENANTS. Rows of another tenant that name this very appointment do
 *      not hold it.
 *   6. WHAT THE TABLE ITSELF REFUSES, so the read never has to tell it apart:
 *      a release under another tenant or another appointment than its claim's,
 *      a release that names no row, and a second release of one claim.
 *   7. NOTHING OF IT IS IN THE AUDIT TRAIL. After every arm above, `audit_log`
 *      holds no row of either tenant.
 *
 * WHY A DATABASE. "Held" is one read of `reminder_claims` and
 * `reminder_dispatches` made under the reminder job's own role and tenant
 * claim, behind an advisory lock. A mock has no policy to hide another
 * tenant's rows, no constraint to refuse a row, no timestamps to order, and no
 * lock to wait on.
 *
 * Only the data seam (`loadReminderData`) and the two transports are replaced,
 * as in reminder-log.db.test.ts: no arm here can reach a provider whatever the
 * environment says. Four more modules are wrapped so that ONE call of theirs
 * can be made to throw; untouched, each runs its real code.
 *
 * EVERY ARM OWNS ITS ROWS: two fresh tenants, and a fresh appointment per arm.
 *
 * Skipped without DATABASE_URL. NOT YET hard-required in
 * assert-rls-executed.mjs: that file is a frozen gate, so listing this suite
 * there is a GATE-CHANGE of its own.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, lisbonDateTimeToUtc, todayInLisbon } from "../scheduling/time";

vi.mock("server-only", () => ({}));

type ThrowPoint = "config" | "render_email" | "render_sms" | "confirm_code";

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  /** Every hand-over to a (replaced) transport, in order. */
  sends: [] as string[],
  /** What the transport answers next: handed over, held back, or refused. */
  transport: "sent" as "sent" | "sandbox" | "refuse",
  /** Runs inside the transport before it answers. For the arm that acts mid-send. */
  duringSend: null as null | (() => Promise<void>),
  /** The one call, before the provider, that throws next. Cleared when it fires. */
  throwAt: null as null | string,
  sendCount: 0,
}));

/** Throw once at `point`, then never again until a test arms it. */
function throwIfArmed(point: ThrowPoint): void {
  if (h.throwAt !== point) return;
  h.throwAt = null;
  throw new Error(`thrown at ${point} by the test`);
}

vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  const transport = (channel: "sms" | "email") =>
    vi.fn(async () => {
      h.sends.push(channel);
      if (h.duringSend) await h.duringSend();
      if (h.transport === "refuse") {
        // The Twilio SDK's shape: a numeric `code` on the error.
        throw Object.assign(new Error("provider refused"), { code: 21211 });
      }
      h.sendCount += 1;
      return {
        channel,
        sandbox: h.transport === "sandbox",
        // The ledger holds provider ids under a unique index: one per send.
        id: `test-${process.pid}-${Date.now()}-${h.sendCount}`,
      };
    });
  return { ...actual, sendSms: transport("sms"), sendEmail: transport("email") };
});
vi.mock("@/lib/admin/settings-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/settings-config")>();
  return {
    ...actual,
    parseTenantConfig: (settings: unknown) => {
      throwIfArmed("config");
      return actual.parseTenantConfig(settings);
    },
  };
});
vi.mock("./templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./templates")>();
  return {
    ...actual,
    renderEmail: (...args: Parameters<typeof actual.renderEmail>) => {
      throwIfArmed("render_email");
      return actual.renderEmail(...args);
    },
  };
});
vi.mock("./sms-body", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sms-body")>();
  return {
    ...actual,
    renderReminderSmsBody: (...args: Parameters<typeof actual.renderReminderSmsBody>) => {
      throwIfArmed("render_sms");
      return actual.renderReminderSmsBody(...args);
    },
  };
});
// The confirm code store is replaced whole: it is reached only in the one arm
// that arms the confirm link, and that arm makes it throw. Nothing here mints
// a real code.
vi.mock("./confirm-code-store", () => ({
  issueConfirmCode: vi.fn(async () => {
    throwIfArmed("confirm_code");
    return null;
  }),
  withdrawConfirmCode: vi.fn(async () => true),
}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("SWEEP-02: a reminder already sent is held for a second sender, and every throw releases", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const seeds = {
    A: { tenant: tenantA, therapist: randomUUID(), location: randomUUID(), patient: randomUUID() },
    B: { tenant: tenantB, therapist: randomUUID(), location: randomUUID(), patient: randomUUID() },
  };
  /**
   * Yesterday at a pinned hour: both marks are long past, so a claim taken
   * today is NOT early. The dispatcher never reads the clock, so a start in
   * the past sends like any other.
   */
  const START = lisbonDateTimeToUtc(addDays(todayInLisbon(), -1), "11:00");
  /** The same visit, moved. */
  const OTHER_START = lisbonDateTimeToUtc(addDays(todayInLisbon(), -1), "15:00");
  /** Ten days out, pinned: far outside both offsets, so a claim taken today is early. */
  const FAR_START = lisbonDateTimeToUtc(addDays(todayInLisbon(), 10), "11:00");
  /**
   * One instant read from the DATABASE's clock, a whole second, two hours ago.
   * Seeded rows are placed around it by the minute, so their order is stated
   * and never an accident of how fast two inserts ran.
   */
  let base: Date;
  const at = (minutes: number) => new Date(base.getTime() + minutes * 60_000).toISOString();

  const ENV_KEYS = [
    "REMINDERS_LIVE_SEND",
    "REMINDERS_LINK_SECRET",
    "REMINDERS_RESCHEDULE_BASE_URL",
    "REMINDERS_CONFIRM_LINK_ENABLED",
    "REMINDERS_CONFIRM_CODE_SECRET",
  ];
  const savedEnv: Record<string, string | undefined> = {};

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  /**
   * A new appointment of one tenant, so an arm reads only rows it made.
   *
   * Stored as `scheduled`: the arms share one therapist and one start, and the
   * table refuses two CONFIRMED visits of a therapist at one time. The row is
   * here for its id and its foreign keys; what the dispatcher sees is the row
   * the replaced load hands it.
   */
  async function fresh(key: "A" | "B" = "A", startsAt: Date = START): Promise<string> {
    const t = seeds[key];
    const id = randomUUID();
    await sql.execute(raw`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
      values (${id}, ${t.tenant}, ${t.patient}, ${t.therapist}, ${t.location},
              ${startsAt.toISOString()}, ${new Date(startsAt.getTime() + 45 * 60_000).toISOString()}, 'scheduled')`);
    return id;
  }

  function loaded(appointmentId: string, key: "A" | "B" = "A", over: Record<string, unknown> = {}) {
    return {
      appointmentId,
      startsAt: START,
      status: "confirmed",
      origin: "staff",
      patientId: seeds[key].patient,
      patientName: "Paciente Claim",
      patientEmail: "paciente.claim@example.pt",
      patientPhone: "912345678",
      patientReminderSmsEnabled: true,
      patientReminderEmailEnabled: true,
      patientDeletedAt: null,
      patientHasAcceptedTerms: false,
      practitionerName: "Dra Claim",
      locationName: "Sede",
      locationPhone: "+351 210 000 000",
      tenantSettings: { locale: "pt", contacts: { phone: "+351 210 000 000" } },
      ...over,
    };
  }

  /** The claims of one appointment, oldest first. */
  async function claimsOf(appointmentId: string): Promise<Row[]> {
    return rows(raw`select id::text as id, tenant_id::text as tenant_id, offset_id, channel,
        to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at, taker, early
      from reminder_claims
      where appointment_id = ${appointmentId} and kind = 'claim'
      order by created_at, id`);
  }

  /** The releases of one appointment, as the columns that matter. */
  async function releasesOf(appointmentId: string): Promise<Row[]> {
    return rows(raw`select tenant_id::text as tenant_id, claim_id::text as claim_id, offset_id, channel,
        starts_at, due_at, taker, early, minutes_after_mark, saved_after_mark, pass_id
      from reminder_claims
      where appointment_id = ${appointmentId} and kind = 'release'
      order by created_at, id`);
  }

  async function ledgerOf(appointmentId: string): Promise<Row[]> {
    return rows(raw`select channel, template_id, outcome, suppression_reason
      from reminder_dispatches where appointment_id = ${appointmentId} order by created_at, id`);
  }

  /** Everything the dispatcher could have left for one appointment, counted. */
  async function footprint(appointmentId: string) {
    return {
      claims: (await claimsOf(appointmentId)).length,
      releases: (await releasesOf(appointmentId)).length,
      ledger: (await ledgerOf(appointmentId)).length,
      sends: h.sends.length,
    };
  }

  /**
   * A claim row written straight to the table, at a stated instant, on the
   * owning connection. `early: null` is a claim with no mark on record: the
   * table holds "no early flag" and "no due time" to each other.
   */
  async function seedClaim(
    appointmentId: string,
    over: {
      tenant?: string;
      offsetId?: "24h" | "48h";
      channel?: string;
      startsAt?: Date;
      early?: boolean | null;
      at?: string;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    const startsAt = over.startsAt ?? START;
    const early = over.early === undefined ? false : over.early;
    const due =
      early === null ? null : new Date(startsAt.getTime() - ((over.offsetId ?? "24h") === "24h" ? 24 : 48) * 60 * 60_000).toISOString();
    await sql.execute(raw`insert into reminder_claims
      (id, tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, created_at)
      values (${id}, ${over.tenant ?? tenantA}, ${appointmentId}, 'claim', ${over.offsetId ?? "24h"}, ${over.channel ?? "sms"},
              ${startsAt.toISOString()}, ${due}::timestamptz, 'run', ${early}::boolean, ${over.at ?? at(0)})`);
    return id;
  }

  /**
   * The sweep's shadow row for the 24 h SMS of START: a row of the same table,
   * for the same reminder and start, that is NOT a claim.
   */
  async function seedShadow(appointmentId: string, over: { at?: string } = {}): Promise<void> {
    await sql.execute(raw`insert into reminder_claims
      (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark, created_at)
      values (${tenantA}, ${appointmentId}, 'shadow', '24h', 'sms', ${START.toISOString()},
              ${new Date(START.getTime() - 24 * 60 * 60_000).toISOString()}, 0, false, ${over.at ?? at(0)})`);
  }

  /** A release row written straight to the table, on the owning connection. */
  async function seedRelease(appointmentId: string, claimId: string, over: { tenant?: string; at?: string } = {}) {
    await sql.execute(raw`insert into reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, claim_id, created_at)
      values (${over.tenant ?? tenantA}, ${appointmentId}, 'release', '24h', 'sms', ${claimId}, ${over.at ?? at(5)})`);
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

  /** A ledger row written straight to the table, at a stated instant. */
  async function seedLedger(
    appointmentId: string,
    over: { tenant?: string; channel?: string; templateId?: string; outcome?: string; at?: string } = {},
  ) {
    const outcome = over.outcome ?? "sent";
    await sql.execute(raw`insert into reminder_dispatches
      (tenant_id, appointment_id, channel, template_id, outcome, suppression_reason, created_at)
      values (${over.tenant ?? tenantA}, ${appointmentId}, ${over.channel ?? "sms"},
              ${over.templateId ?? "reminder.24h.sms"}, ${outcome},
              ${outcome === "suppressed" ? "status" : null}, ${over.at ?? at(30)})`);
  }

  /** Ask the claim itself, as the job, for the 24 h SMS of START. */
  async function take(appointmentId: string, over: { tenant?: string; startsAt?: Date } = {}) {
    const { takeReminderClaim } = await import("./reminder-claim");
    return takeReminderClaim({
      tenantId: over.tenant ?? tenantA,
      appointmentId,
      offsetId: "24h",
      channel: "sms",
      startsAt: over.startsAt ?? START,
      taker: "run",
    });
  }

  /** Another session sitting on one reminder's advisory lock until told to let go. */
  async function holdLock(tenantId: string, appointmentId: string, offsetId: string, channel: string) {
    const { reminderClaimLockPayload } = await import("./reminder-claim");
    const payload = reminderClaimLockPayload(tenantId, appointmentId, offsetId, channel);
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
    for (const [label, t] of Object.entries(seeds)) {
      await sql.execute(raw`insert into tenants (id, name, slug)
        values (${t.tenant}, 'Claim Blocks Co', ${"rblock-" + label.toLowerCase() + "-" + t.tenant.slice(0, 8)})`);
      await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${t.therapist}, ${t.tenant}, ${"t-" + t.therapist.slice(0, 8) + "@t.test"}, 'Dra Claim', true, true)`);
      await sql.execute(raw`insert into locations (id, tenant_id, name) values (${t.location}, ${t.tenant}, 'Sede')`);
      await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
        values (${t.patient}, ${t.tenant}, 'Paciente Claim', '912345678')`);
    }
    // As text in ISO form: the driver hands a timestamp back as Postgres prints it.
    const [clock] = await rows(raw`select to_char((date_trunc('second', now()) - interval '2 hours') at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"') as base`);
    base = new Date(String(clock!.base));
    expect(Number.isNaN(base.getTime())).toBe(false);
  });

  afterAll(async () => {
    if (!sql) return;
    for (const tenantId of [tenantA, tenantB]) {
      await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
      // By tenant, not left to the appointment's cascade: a seeded row of one
      // tenant may name the other tenant's appointment.
      await sql.execute(raw`delete from reminder_claims where tenant_id = ${tenantId}`);
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
    h.sends.length = 0;
    h.transport = "sent";
    h.duringSend = null;
    h.throwAt = null;
    h.loadReminderData.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.restoreAllMocks();
  });

  /* ---------------------------------------------------------------- */
  /* 1. A reminder already sent is held                                */
  /* ---------------------------------------------------------------- */

  it("a second caller after a `sent` row is HELD: nothing is sent, and it leaves no ledger row, no claim and no release", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const appt = await fresh();
    h.loadReminderData.mockResolvedValue(loaded(appt));

    // The first sender: the SMS is handed over and its row says `sent`.
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["sms"]);
    expect(await ledgerOf(appt)).toEqual([
      { channel: "sms", template_id: "reminder.24h.sms", outcome: "sent", suppression_reason: null },
    ]);
    const claims = await claimsOf(appt);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ offset_id: "24h", channel: "sms", starts_at: START.toISOString(), early: false });
    const after = await footprint(appt);

    // The second sender of the same reminder, and a third that calls itself the sweep.
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });
    expect(await dispatchReminder(tenantA, appt, "24h", "sms", "sweep")).toEqual({ dispatched: false, reason: "claim_held" });
    expect(await footprint(appt)).toEqual(after);

    // NEGATIVE CONTROL, the same appointment: its OTHER reminder is not held.
    expect(await dispatchReminder(tenantA, appt, "48h", "email")).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["sms", "email"]);
  });

  /* ---------------------------------------------------------------- */
  /* 2. Nothing else blocks                                            */
  /* ---------------------------------------------------------------- */

  it("a SUPPRESSION does not hold the next caller: the gates are asked again, and a visit put right gets its reminder, as before claims", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const appt = await fresh();
    const suppressed = { channel: "sms", template_id: "reminder.24h.sms", outcome: "suppressed", suppression_reason: "status" };

    // The visit is cancelled when its reminder comes due: suppressed, on record.
    h.loadReminderData.mockResolvedValue(loaded(appt, "A", { status: "cancelled" }));
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toEqual({ dispatched: false, reason: "status" });
    expect(await ledgerOf(appt)).toEqual([suppressed]);

    // Asked again while still cancelled: the same answer, its own row and its
    // own claim. Exactly what a second call did before there were claims.
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toEqual({ dispatched: false, reason: "status" });
    expect(await ledgerOf(appt)).toEqual([suppressed, suppressed]);
    expect(await claimsOf(appt)).toHaveLength(2);
    expect(h.sends).toEqual([]);

    // Brought back at the same start, and asked again: it goes out. The
    // sweep's design calls a suppression final for its start; that is held
    // for a ruling (BLOCKING_LEDGER_OUTCOMES), and until it is ruled this is
    // the behaviour.
    h.loadReminderData.mockResolvedValue(loaded(appt));
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["sms"]);

    // And once SENT it is held.
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });
    expect(h.sends).toEqual(["sms"]);
  });

  it("live send off: a message the gate held back was not sent, so it holds nothing", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const appt = await fresh();
    const heldBack = { channel: "email", template_id: "reminder.48h.email", outcome: "suppressed", suppression_reason: "sandbox" };
    h.transport = "sandbox";
    h.loadReminderData.mockResolvedValue(loaded(appt));
    expect(await dispatchReminder(tenantA, appt, "48h", "email")).toMatchObject({ dispatched: true });
    expect(await ledgerOf(appt)).toEqual([heldBack]);
    expect(await dispatchReminder(tenantA, appt, "48h", "email")).toMatchObject({ dispatched: true });
    expect(await ledgerOf(appt)).toEqual([heldBack, heldBack]);
    // Both calls reached the (replaced) transport, which held both back.
    expect(h.sends).toEqual(["email", "email"]);
  });

  it("a claim with NO outcome never blocks, whatever its age: six days old, an hour old, and one taken a moment ago", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const appt = await fresh();
    await seedClaim(appt, { at: new Date(base.getTime() - 6 * 24 * 60 * 60_000).toISOString() });
    await seedClaim(appt, { at: at(60) });
    expect(await take(appt)).toMatchObject({ held: false });
    expect(await claimsOf(appt)).toHaveLength(3);

    h.loadReminderData.mockResolvedValue(loaded(appt));
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["sms"]);
    expect(await claimsOf(appt)).toHaveLength(4);
  });

  it("a provider refusal is not an outcome that blocks: the run fails, the claim is released, and the retry sends", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const appt = await fresh();
    h.loadReminderData.mockResolvedValue(loaded(appt));

    h.transport = "refuse";
    await expect(dispatchReminder(tenantA, appt, "24h", "sms")).rejects.toThrow("provider refused");
    const [refused] = await claimsOf(appt);
    expect(await releasesOf(appt)).toEqual([
      {
        tenant_id: tenantA,
        claim_id: refused!.id,
        offset_id: "24h",
        channel: "sms",
        // What only a claim or a shadow row carries.
        starts_at: null,
        due_at: null,
        taker: null,
        early: null,
        minutes_after_mark: null,
        saved_after_mark: null,
        pass_id: null,
      },
    ]);
    expect(await ledgerOf(appt)).toEqual([
      { channel: "sms", template_id: "reminder.24h.sms", outcome: "provider_error", suppression_reason: null },
    ]);

    // The scheduler's retry: not held, and this time the provider takes it.
    h.transport = "sent";
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["sms", "sms"]);
    expect(await claimsOf(appt)).toHaveLength(2);
    expect(await releasesOf(appt)).toHaveLength(1);

    // And only NOW is the reminder held.
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });
    expect(h.sends).toEqual(["sms", "sms"]);
  });

  /* ---------------------------------------------------------------- */
  /* 3. Every throw releases                                           */
  /* ---------------------------------------------------------------- */

  const BEFORE_THE_PROVIDER: { name: string; offset: "24h" | "48h"; channel: "sms" | "email"; arm: () => void; message: string }[] = [
    {
      name: "the reschedule link cannot be built (its base URL is not set)",
      offset: "24h",
      channel: "sms",
      arm: () => {
        delete process.env.REMINDERS_RESCHEDULE_BASE_URL;
      },
      message: "REMINDERS_RESCHEDULE_BASE_URL is required",
    },
    {
      name: "the tenant's reminder settings cannot be read",
      offset: "24h",
      channel: "sms",
      arm: () => {
        h.throwAt = "config";
      },
      message: "thrown at config by the test",
    },
    {
      name: "the email cannot be rendered",
      offset: "48h",
      channel: "email",
      arm: () => {
        h.throwAt = "render_email";
      },
      message: "thrown at render_email by the test",
    },
    {
      name: "the SMS body cannot be rendered",
      offset: "24h",
      channel: "sms",
      arm: () => {
        h.throwAt = "render_sms";
      },
      message: "thrown at render_sms by the test",
    },
    {
      name: "the confirm code cannot be stored",
      offset: "24h",
      channel: "sms",
      arm: () => {
        // The confirm link is armed for this arm only, in this process only.
        process.env.REMINDERS_CONFIRM_LINK_ENABLED = "true";
        process.env.REMINDERS_CONFIRM_CODE_SECRET = "test-only-confirm-code-secret-not-prod";
        h.throwAt = "confirm_code";
      },
      message: "thrown at confirm_code by the test",
    },
  ];

  for (const point of BEFORE_THE_PROVIDER) {
    it(`a throw before the provider call, ${point.name}: the claim is released, nothing was sent, and the retry sends`, async () => {
      const { dispatchReminder } = await import("./dispatch");
      const appt = await fresh();
      h.loadReminderData.mockResolvedValue(loaded(appt));

      point.arm();
      await expect(dispatchReminder(tenantA, appt, point.offset, point.channel)).rejects.toThrow(point.message);
      // It threw BEFORE the provider: no hand-over and no ledger row. What it
      // left is its claim, and the release that names it.
      expect(h.sends).toEqual([]);
      expect(await ledgerOf(appt)).toEqual([]);
      const claims = await claimsOf(appt);
      expect(claims).toHaveLength(1);
      expect((await releasesOf(appt)).map((r) => [r.claim_id, r.offset_id, r.channel, r.tenant_id])).toEqual([
        [claims[0]!.id, point.offset, point.channel, tenantA],
      ]);

      // The retry, with whatever was wrong put right.
      process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.invalid";
      delete process.env.REMINDERS_CONFIRM_LINK_ENABLED;
      delete process.env.REMINDERS_CONFIRM_CODE_SECRET;
      expect(h.throwAt).toBeNull();
      expect(await dispatchReminder(tenantA, appt, point.offset, point.channel)).toMatchObject({ dispatched: true });
      expect(h.sends).toEqual([point.channel]);
      expect(await claimsOf(appt)).toHaveLength(2);
      // The retry threw nothing, so it released nothing.
      expect(await releasesOf(appt)).toHaveLength(1);
    });
  }

  it("a sender refused WHILE another is still at the provider: its released claim does not take the other's `sent` row, and its retry is HELD", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const appt = await fresh();
    h.loadReminderData.mockResolvedValue(loaded(appt));

    // Sender 1 claims and is slow at the provider. While it waits, sender 2
    // claims the same reminder (nothing is sent yet, so it is not held), is
    // refused, and releases. Only then does sender 1's hand-over come back.
    let refusal: unknown = null;
    h.duringSend = async () => {
      h.duringSend = null;
      h.transport = "refuse";
      refusal = await dispatchReminder(tenantA, appt, "24h", "sms").catch((e: unknown) => e);
      h.transport = "sent";
    };
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toBe("provider refused");

    // On record, in this order: two claims, the refusal, the release of the
    // SECOND claim, and the first sender's `sent` row last.
    const claims = await claimsOf(appt);
    expect(claims).toHaveLength(2);
    expect((await releasesOf(appt)).map((r) => r.claim_id)).toEqual([claims[1]!.id]);
    expect((await ledgerOf(appt)).map((r) => r.outcome)).toEqual(["provider_error", "sent"]);
    expect(h.sends).toEqual(["sms", "sms"]);
    const after = await footprint(appt);

    // Sender 2's retry. The reminder WAS sent, by sender 1: held, and nothing
    // more is written. Before released claims were left out of "the next
    // claim", the `sent` row counted for the released claim, nothing was
    // held, and this call sent a second copy.
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });
    expect(await footprint(appt)).toEqual(after);
  });

  it(
    "a FAILED release, then the retry sends: the claim stays live with no outcome, and that blocks nothing",
    async () => {
      const { dispatchReminder } = await import("./dispatch");
      const appt = await fresh();
      h.loadReminderData.mockResolvedValue(loaded(appt));
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      // The provider refuses. While the dispatcher is inside the send, another
      // session takes this reminder's lock and keeps it, so the release that
      // follows the throw waits, runs out of time, and is never written.
      let letGo: (() => Promise<void>) | null = null;
      h.transport = "refuse";
      h.duringSend = async () => {
        letGo = await holdLock(tenantA, appt, "24h", "sms");
      };
      try {
        const started = performance.now();
        // The error that comes out is the provider's, not the release's.
        await expect(dispatchReminder(tenantA, appt, "24h", "sms")).rejects.toThrow("provider refused");
        expect(performance.now() - started).toBeGreaterThan(1_900);
        expect(spy.mock.calls.flat().join(" ")).toContain("reminder claim release FAILED");
      } finally {
        await (letGo as (() => Promise<void>) | null)?.();
      }
      expect(await claimsOf(appt)).toHaveLength(1);
      expect(await releasesOf(appt)).toEqual([]);
      expect(await ledgerOf(appt)).toEqual([
        { channel: "sms", template_id: "reminder.24h.sms", outcome: "provider_error", suppression_reason: null },
      ]);

      // The retry: a live claim, never released, and it still sends.
      h.transport = "sent";
      h.duringSend = null;
      expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });
      expect(h.sends).toEqual(["sms", "sms"]);
      expect((await ledgerOf(appt)).map((r) => r.outcome)).toEqual(["provider_error", "sent"]);
    },
    30_000,
  );

  it(
    "the claim store fails OPEN even with an outcome on record: with the lock stuck elsewhere the reminder goes out again, as it did before claims",
    async () => {
      const { dispatchReminder } = await import("./dispatch");
      const appt = await fresh();
      h.loadReminderData.mockResolvedValue(loaded(appt));
      expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const letGo = await holdLock(tenantA, appt, "24h", "sms");
      try {
        const started = performance.now();
        expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });
        expect(performance.now() - started).toBeGreaterThan(1_900);
        expect(spy.mock.calls.flat().join(" ")).toContain("reminder claim write FAILED");
      } finally {
        await letGo();
      }
      expect(h.sends).toEqual(["sms", "sms"]);

      // NEGATIVE CONTROL: with the lock free, the very same call is held. So
      // it was the stuck lock, and nothing else, that let the repeat through.
      expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });
      expect(h.sends).toEqual(["sms", "sms"]);
    },
    30_000,
  );

  /* ---------------------------------------------------------------- */
  /* 4. Which rows count                                               */
  /* ---------------------------------------------------------------- */

  it("a row for ANOTHER START does not block: a moved visit earns its reminder, and moved back it is held again", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const appt = await fresh();

    h.loadReminderData.mockResolvedValue(loaded(appt));
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });

    // Moved: a start of its own, so a reminder of its own.
    h.loadReminderData.mockResolvedValue(loaded(appt, "A", { startsAt: OTHER_START }));
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["sms", "sms"]);
    expect((await claimsOf(appt)).map((c) => c.starts_at)).toEqual([START.toISOString(), OTHER_START.toISOString()]);
    // And held at the new start from then on.
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });

    // Moved back to the first start: that reminder went out, and it is held.
    h.loadReminderData.mockResolvedValue(loaded(appt));
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });
    expect(h.sends).toEqual(["sms", "sms"]);
  });

  /**
   * ROW BY ROW. Each arm seeds one claim for the 24 h SMS of START (unless it
   * says otherwise) and the rows around it, at stated instants, then asks the
   * claim as the job. One rule per arm, with its neighbour on the other side.
   */
  const CLAIM_AT = 0;
  const ROW_AT = 30;
  const WHICH_ROWS: { name: string; held: boolean; seed: (appt: string) => Promise<void> }[] = [
    {
      name: "NEGATIVE CONTROL: a claim and a sent row after it",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedLedger(appt);
      },
    },
    {
      name: "a suppressed row after it: nothing was sent",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedLedger(appt, { outcome: "suppressed" });
      },
    },
    {
      name: "a provider_error row after it",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedLedger(appt, { outcome: "provider_error" });
      },
    },
    {
      name: "the fee-notice body of the same reminder",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedLedger(appt, { templateId: "reminder.24h.sms.fee_notice" });
      },
    },
    {
      name: "a booking confirmation sent after it: not this reminder",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedLedger(appt, { templateId: "confirmation.sms" });
      },
    },
    {
      name: "a row of the OTHER offset's reminder on this channel",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedLedger(appt, { templateId: "reminder.48h.sms" });
      },
    },
    {
      name: "a row of this offset on the OTHER channel",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedLedger(appt, { channel: "email", templateId: "reminder.24h.email" });
      },
    },
    {
      name: "a sent row written BEFORE the claim: it is not this claim's outcome",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedLedger(appt, { at: at(CLAIM_AT - 1) });
      },
    },
    {
      name: "a sent row at the claim's own instant",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedLedger(appt, { at: at(CLAIM_AT) });
      },
    },
    {
      name: "a claim for another start, with its sent row",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt, { startsAt: OTHER_START });
        await seedLedger(appt);
      },
    },
    {
      name: "a claim of the other reminder of this appointment (48 h, email), with its sent row",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt, { offsetId: "48h", channel: "email" });
        await seedLedger(appt, { channel: "email", templateId: "reminder.48h.email" });
      },
    },
    {
      name: "a claim of the OTHER offset on this channel, and a sent row of this one",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt, { offsetId: "48h" });
        await seedLedger(appt);
      },
    },
    {
      name: "the sweep's SHADOW row of this reminder and this start, with a sent row after it: a shadow row is not a claim",
      held: false,
      seed: async (appt) => {
        await seedShadow(appt);
        await seedLedger(appt);
      },
    },
    {
      name: "a claim of this offset on the other channel, and a sent row of this one",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt, { channel: "email" });
        await seedLedger(appt);
      },
    },
    {
      name: "an EARLY claim with its sent row: the send at the old time does not hold the one at the right time",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt, { early: true });
        await seedLedger(appt);
      },
    },
    {
      name: "a claim with no early flag (and so no due time on record) is not taken for an early one",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt, { early: null });
        await seedLedger(appt);
      },
    },
    {
      name: "a RELEASED claim, even with a sent row after it: it is not live",
      held: false,
      seed: async (appt) => {
        const claimId = await seedClaim(appt);
        await seedLedger(appt);
        await seedRelease(appt, claimId);
      },
    },
    {
      name: "a release that names ANOTHER claim of this appointment (its other reminder's) frees nothing",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt);
        const otherReminder = await seedClaim(appt, { offsetId: "48h", channel: "email" });
        await seedLedger(appt);
        await seedRelease(appt, otherReminder);
      },
    },
    {
      name: "a claim of ANOTHER START between the claim and the row: the row is that later claim's, not this one's",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedClaim(appt, { startsAt: OTHER_START, at: at(ROW_AT - 10) });
        await seedLedger(appt);
      },
    },
    {
      name: "a later claim at the row's own instant: still that later claim's row",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedClaim(appt, { startsAt: OTHER_START, at: at(ROW_AT) });
        await seedLedger(appt);
      },
    },
    {
      name: "a later claim of this start that was RELEASED before the row: its sender threw, so the row is the first claim's",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt);
        const laterId = await seedClaim(appt, { at: at(ROW_AT - 20) });
        await seedRelease(appt, laterId, { at: at(ROW_AT - 10) });
        await seedLedger(appt);
      },
    },
    {
      name: "a later claim of this start released AFTER the row: still not that claim's row",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt);
        const laterId = await seedClaim(appt, { at: at(ROW_AT - 20) });
        await seedLedger(appt);
        await seedRelease(appt, laterId, { at: at(ROW_AT + 10) });
      },
    },
    {
      name: "a RELEASED claim of ANOTHER START between the claim and the row does not take the row away",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt);
        const laterId = await seedClaim(appt, { startsAt: OTHER_START, at: at(ROW_AT - 20) });
        await seedRelease(appt, laterId, { at: at(ROW_AT - 10) });
        await seedLedger(appt);
      },
    },
    {
      name: "a later claim of another start, and a release that names ANOTHER claim (the other reminder's): the later claim is live and the row is its own",
      held: false,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedClaim(appt, { startsAt: OTHER_START, at: at(ROW_AT - 20) });
        const otherReminder = await seedClaim(appt, { offsetId: "48h", channel: "email", at: at(ROW_AT - 25) });
        await seedRelease(appt, otherReminder, { at: at(ROW_AT - 10) });
        await seedLedger(appt);
      },
    },
    {
      name: "a claim of another start AFTER the row: the row stays this claim's",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedLedger(appt);
        await seedClaim(appt, { startsAt: OTHER_START, at: at(ROW_AT + 10) });
      },
    },
    {
      name: "two claims of this start at one instant and one sent row: an outcome is on record",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedClaim(appt);
        await seedLedger(appt);
      },
    },
    {
      name: "a claim of the OTHER reminder between the claim and the row does not take the row away",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt);
        await seedClaim(appt, { offsetId: "48h", channel: "email", at: at(ROW_AT - 10) });
        await seedLedger(appt);
      },
    },
    {
      name: "an older claim that died and a newer one with its row: held by the newer",
      held: true,
      seed: async (appt) => {
        await seedClaim(appt, { at: at(CLAIM_AT - 30) });
        await seedClaim(appt);
        await seedLedger(appt);
      },
    },
  ];

  for (const arm of WHICH_ROWS) {
    it(`which rows count: ${arm.name} -> ${arm.held ? "HELD" : "not held"}`, async () => {
      const appt = await fresh();
      await arm.seed(appt);
      const before = (await claimsOf(appt)).filter((c) => c.starts_at === START.toISOString()).length;
      const answer = await take(appt);
      expect(answer.held).toBe(arm.held);
      // Held writes nothing. Not held writes this taker's own claim.
      const after = (await claimsOf(appt)).filter((c) => c.starts_at === START.toISOString()).length;
      expect(after - before).toBe(arm.held ? 0 : 1);
    });
  }

  it("an early send does not hold the reminder at the right time, through the dispatcher: both go out, as before", async () => {
    const { dispatchReminder } = await import("./dispatch");
    // Ten days ahead: a claim taken today is over ten minutes before the mark.
    const appt = await fresh("A", FAR_START);
    h.loadReminderData.mockResolvedValue(loaded(appt, "A", { startsAt: FAR_START }));
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });
    expect((await claimsOf(appt)).map((c) => c.early)).toEqual([true]);
    expect(await dispatchReminder(tenantA, appt, "24h", "sms")).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["sms", "sms"]);
  });

  /* ---------------------------------------------------------------- */
  /* 5. Two tenants                                                    */
  /* ---------------------------------------------------------------- */

  it("two tenants: a claim, a sent row and a release of ANOTHER tenant that name this appointment decide nothing here", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const apptB = await fresh("B");

    // Tenant A's rows, pointing at tenant B's appointment. Only a superuser
    // can write these; the job reads as tenant B and must not see them.
    await seedClaim(apptB, { tenant: tenantA });
    await seedLedger(apptB, { tenant: tenantA });
    expect(await claimsOf(apptB)).toHaveLength(1);

    expect(await take(apptB, { tenant: tenantB })).toMatchObject({ held: false });
    h.loadReminderData.mockResolvedValue(loaded(apptB, "B"));
    expect(await dispatchReminder(tenantB, apptB, "24h", "sms")).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["sms"]);

    // Now tenant B has its own outcome, and holds its own reminder.
    expect(await dispatchReminder(tenantB, apptB, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });

    // And tenant A cannot free it: a release under tenant A that names tenant
    // B's claim is a row THE TABLE DOES NOT TAKE, even from the owning
    // connection (a release names a row of its own tenant and appointment).
    const mine = (await claimsOf(apptB)).filter((c) => c.tenant_id === tenantB);
    // Two: the one `take` wrote above, and the dispatcher's own.
    expect(mine).toHaveLength(2);
    for (const c of mine) {
      expect(await refusedBy(seedRelease(apptB, String(c.id), { tenant: tenantA }))).toBe("reminder_claims_claim_fkey");
    }
    expect(await dispatchReminder(tenantB, apptB, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });
    expect(h.sends).toEqual(["sms"]);

    // NEGATIVE CONTROL: the same release under tenant B's own id does free it.
    for (const c of mine) await seedRelease(apptB, String(c.id), { tenant: tenantB });
    expect(await dispatchReminder(tenantB, apptB, "24h", "sms")).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["sms", "sms"]);
  });

  /**
   * THE TENANT IS STATED IN EVERY CLAUSE, not left to the policies alone. The
   * job reads under RLS, where another tenant's rows are invisible whatever
   * the query says, so the arm above cannot tell whether the clauses are
   * there. This one asks the read itself on the superuser connection, where NO
   * policy applies and the clauses are all that stands between two tenants.
   */
  it("two tenants, with no policy in the way: the read's own tenant clauses keep another tenant's claim and ledger row out, and the table keeps its release out", async () => {
    const { claimIsHeld } = await import("./reminder-claim");
    const ask = (appointmentId: string) =>
      sql.transaction((tx) =>
        claimIsHeld(tx, { tenantId: tenantB, appointmentId, offsetId: "24h", channel: "sms", startsAt: START }),
      );

    // NEGATIVE CONTROL: tenant B's own claim and sent row hold, read this way too.
    const own = await fresh("B");
    await seedClaim(own, { tenant: tenantB });
    await seedLedger(own, { tenant: tenantB });
    expect(await ask(own)).toBe(true);

    // The claim is another tenant's.
    const foreignClaim = await fresh("B");
    await seedClaim(foreignClaim, { tenant: tenantA });
    await seedLedger(foreignClaim, { tenant: tenantB });
    expect(await ask(foreignClaim)).toBe(false);

    // The sent row is another tenant's.
    const foreignRow = await fresh("B");
    await seedClaim(foreignRow, { tenant: tenantB });
    await seedLedger(foreignRow, { tenant: tenantA });
    expect(await ask(foreignRow)).toBe(false);

    // A release under another tenant: there is no such row to read. The table
    // refuses it, so the claim stays held.
    const foreignRelease = await fresh("B");
    const claimId = await seedClaim(foreignRelease, { tenant: tenantB });
    await seedLedger(foreignRelease, { tenant: tenantB });
    expect(await refusedBy(seedRelease(foreignRelease, claimId, { tenant: tenantA }))).toBe("reminder_claims_claim_fkey");
    expect(await ask(foreignRelease)).toBe(true);

    // The same for the release of a LATER claim: refused, so that claim is
    // still live, and the row is its own.
    const foreignLaterRelease = await fresh("B");
    await seedClaim(foreignLaterRelease, { tenant: tenantB });
    const laterId = await seedClaim(foreignLaterRelease, { tenant: tenantB, startsAt: OTHER_START, at: at(10) });
    await seedLedger(foreignLaterRelease, { tenant: tenantB });
    expect(await refusedBy(seedRelease(foreignLaterRelease, laterId, { tenant: tenantA, at: at(20) }))).toBe(
      "reminder_claims_claim_fkey",
    );
    expect(await ask(foreignLaterRelease)).toBe(false);
    // NEGATIVE CONTROL: the same release under tenant B's own id hands the row back.
    await seedRelease(foreignLaterRelease, laterId, { tenant: tenantB, at: at(20) });
    expect(await ask(foreignLaterRelease)).toBe(true);
  });

  it("two tenants: each holds its own reminder and neither holds the other's", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const apptA = await fresh("A");
    const apptB = await fresh("B");

    h.loadReminderData.mockResolvedValue(loaded(apptA, "A"));
    expect(await dispatchReminder(tenantA, apptA, "24h", "sms")).toMatchObject({ dispatched: true });
    expect(await dispatchReminder(tenantA, apptA, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });

    // Tenant B, same offset, same channel, same start: its first call sends.
    h.loadReminderData.mockResolvedValue(loaded(apptB, "B"));
    expect(await dispatchReminder(tenantB, apptB, "24h", "sms")).toMatchObject({ dispatched: true });
    expect(await dispatchReminder(tenantB, apptB, "24h", "sms")).toEqual({ dispatched: false, reason: "claim_held" });
    expect(h.sends).toEqual(["sms", "sms"]);
    // Each tenant's rows are its own.
    expect((await claimsOf(apptA)).map((c) => c.tenant_id)).toEqual([tenantA]);
    expect((await claimsOf(apptB)).map((c) => c.tenant_id)).toEqual([tenantB]);
  });

  /* ---------------------------------------------------------------- */
  /* 6. What the table itself refuses                                  */
  /* ---------------------------------------------------------------- */

  /**
   * While claims were audit rows, the held read had to tell a real release
   * from a row that only looked like one: filed under another appointment,
   * naming no claim, written twice. The table now refuses each of those rows,
   * from any connection, and the read leans on it.
   */
  it("the table refuses a release under another appointment, a release that names no row, and a second release of one claim", async () => {
    const appt = await fresh();
    const claimId = await seedClaim(appt);
    await seedLedger(appt);

    expect(await refusedBy(seedRelease(await fresh(), claimId))).toBe("reminder_claims_claim_fkey");
    expect(await refusedBy(seedRelease(appt, randomUUID()))).toBe("reminder_claims_claim_fkey");
    // Nothing was written, so the claim still holds.
    expect(await releasesOf(appt)).toEqual([]);
    expect(await take(appt)).toEqual({ held: true });

    // NEGATIVE CONTROL: the release it does take, and what it then answers.
    await seedRelease(appt, claimId);
    expect(await releasesOf(appt)).toHaveLength(1);
    expect(await take(appt)).toMatchObject({ held: false });
    // One release per claim.
    expect(await refusedBy(seedRelease(appt, claimId))).toBe("reminder_claims_release_claim_key");
  });

  it("through the code: a second release of one claim, and a release that names no claim, are swallowed and logged, and write nothing", async () => {
    const { releaseReminderClaim } = await import("./reminder-claim");
    const appt = await fresh();
    const answer = await take(appt);
    if (answer.held || answer.claimId === null) throw new Error("the claim was not written: nothing here was measured");
    const release = { tenantId: tenantA, appointmentId: appt, offsetId: "24h", channel: "sms" as const };

    await expect(releaseReminderClaim({ ...release, claimId: answer.claimId })).resolves.toBeUndefined();
    expect((await releasesOf(appt)).map((r) => r.claim_id)).toEqual([answer.claimId]);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(releaseReminderClaim({ ...release, claimId: answer.claimId })).resolves.toBeUndefined();
    await expect(releaseReminderClaim({ ...release, claimId: randomUUID() })).resolves.toBeUndefined();
    await expect(releaseReminderClaim({ ...release, claimId: "not an id" })).resolves.toBeUndefined();
    expect(spy.mock.calls.filter((c) => String(c[0]).includes("reminder claim release FAILED"))).toHaveLength(3);
    expect(await releasesOf(appt)).toHaveLength(1);
  });

  /* ---------------------------------------------------------------- */
  /* 7. Nothing of it is in the audit trail                            */
  /* ---------------------------------------------------------------- */

  /**
   * LAST ON PURPOSE: it reads what every arm above left. The claims and the
   * releases are in their own table, and `audit_log` holds NOTHING of either
   * tenant: not under the two action names these rows once had, and not under
   * any other.
   */
  it("after every arm above: the claims and the releases are in reminder_claims, and audit_log holds no row of either tenant", async () => {
    // NEGATIVE CONTROL: the arms above did write, through the dispatcher and
    // through the claim itself. Without this, an empty audit trail proves nothing.
    const [written] = await rows(raw`select
        count(*) filter (where kind = 'claim')::int as claims,
        count(*) filter (where kind = 'release')::int as releases
      from reminder_claims where tenant_id in (${tenantA}, ${tenantB})`);
    expect(Number(written!.claims)).toBeGreaterThan(40);
    expect(Number(written!.releases)).toBeGreaterThan(10);

    const audit = await rows(raw`select action, count(*)::int as n from audit_log
      where tenant_id in (${tenantA}, ${tenantB}) group by action order by action`);
    expect(audit).toEqual([]);
  });
});
