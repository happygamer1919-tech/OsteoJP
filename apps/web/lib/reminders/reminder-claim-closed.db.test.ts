/**
 * reminder-claim-closed.db.test.ts - SWEEP-47, against a REAL Postgres, as the
 * job: the claim WHILE THE SWEEP IS THE SENDER.
 *
 * WHAT IT PROVES, and why each arm must be a database:
 *
 *   1. WHICH ROWS MAKE THE CLOSED CLAIM ANSWER HELD, row by row: a live claim
 *      of either taker, at any age, with or without a ledger row after it. And
 *      which do not: a released claim, an early claim, a claim for another
 *      start, offset, channel or tenant, and the sweep's shadow row.
 *   2. FAIL CLOSED. A claim that cannot be taken (another session sits on the
 *      reminder's lock) throws, and writes nothing.
 *   3. TWO AT ONCE, ONE SEND. Eight senders ask for one reminder in the same
 *      instant, through the real dispatcher: one hands the message over, seven
 *      answer `claim_held`, and the tables hold one claim and one `sent` row.
 *      NEGATIVE CONTROL: the same eight with the send switch OFF all send,
 *      which is the dispatcher of today and the reason the switch exists.
 *   4. SENT IS FINAL. After a send no later caller, pass or sleeping job,
 *      sends again.
 *   5. HELD BACK IS TRIED AGAIN. A reminder a gate held back gives its claim
 *      up, the next caller takes a new one, and when the visit is put right
 *      the reminder goes out, once.
 *   6. AN UNKNOWN OUTCOME IS NEVER SENT AGAIN; a provider answer on the pinned
 *      list is.
 *
 * WHY A DATABASE. The duplicate refusal is an advisory lock and a read of
 * `reminder_claims` under the job's own claims. A mock has no lock for two
 * senders to queue on.
 *
 * Only the data seam (`loadReminderData`) and the two transports are replaced,
 * as in reminder-claim.db.test.ts: no arm here can reach a provider whatever
 * the environment says.
 *
 * EVERY ARM OWNS ITS ROWS: two fresh tenants, a fresh appointment per arm, and
 * every count is of those rows only.
 *
 * Skipped without DATABASE_URL. NOT hard-required in assert-rls-executed.mjs:
 * that file is a frozen gate, so listing this suite there is a GATE-CHANGE.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, lisbonDateTimeToUtc, todayInLisbon } from "../scheduling/time";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  /** Every hand-over to a (replaced) transport, in order. */
  sends: [] as string[],
  /** What the transport does next. */
  transport: "sent" as "sent" | "sandbox" | "refuse_listed" | "refuse_unknown",
  /** How long the transport takes, so senders overlap. */
  sendDelayMs: 0,
  sendCount: 0,
}));

vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  const transport = (channel: "sms" | "email") =>
    vi.fn(async () => {
      h.sends.push(channel);
      if (h.sendDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, h.sendDelayMs));
      // The Twilio SDK's shape: a numeric `code` on the error. 21211 is on the
      // pinned list of answers that give a claim up; 20500 is not.
      if (h.transport === "refuse_listed") throw Object.assign(new Error("provider refused"), { code: 21211 });
      if (h.transport === "refuse_unknown") throw Object.assign(new Error("provider unknown"), { code: 20500 });
      h.sendCount += 1;
      return { channel, sandbox: h.transport === "sandbox", id: `closed-${process.pid}-${Date.now()}-${h.sendCount}` };
    });
  return { ...actual, sendSms: transport("sms"), sendEmail: transport("email") };
});
vi.mock("./confirm-code-store", () => ({
  issueConfirmCode: vi.fn(async () => null),
  withdrawConfirmCode: vi.fn(async () => true),
}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("SWEEP-47: while the sweep is the sender a live claim blocks, and two senders at once send once", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const seeds = {
    A: { tenant: tenantA, therapist: randomUUID(), location: randomUUID(), patient: randomUUID() },
    B: { tenant: tenantB, therapist: randomUUID(), location: randomUUID(), patient: randomUUID() },
  };
  /** Yesterday at a pinned hour: both marks are past, so a claim taken today is not early. */
  const START = lisbonDateTimeToUtc(addDays(todayInLisbon(), -1), "11:00");
  const OTHER_START = lisbonDateTimeToUtc(addDays(todayInLisbon(), -1), "15:00");
  /**
   * The clock the dispatcher is handed: five minutes after the 24 hour mark of
   * a start. While the sweep is the sender a reminder is sent only inside its
   * late limit, so "yesterday" has to be asked at yesterday's hour.
   */
  const justAfterMarkOf = (start: Date, hours = 24) => ({ now: new Date(start.getTime() - hours * 60 * 60_000 + 5 * 60_000) });
  /** Ten days out: far outside both offsets, so a claim taken today is early. */
  const FAR_START = lisbonDateTimeToUtc(addDays(todayInLisbon(), 10), "11:00");

  const ENV_KEYS = [
    "REMINDERS_SWEEP_MODE",
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

  async function fresh(key: "A" | "B" = "A", startsAt: Date = START): Promise<string> {
    const t = seeds[key];
    const id = randomUUID();
    await sql.execute(raw`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
      values (${id}, ${t.tenant}, ${t.patient}, ${t.therapist}, ${t.location},
              ${startsAt.toISOString()}, ${new Date(startsAt.getTime() + 45 * 60_000).toISOString()}, 'scheduled')`);
    return id;
  }

  function loaded(appointmentId: string, over: Record<string, unknown> = {}) {
    return {
      appointmentId,
      startsAt: START,
      status: "confirmed",
      origin: "staff",
      patientId: seeds.A.patient,
      patientName: "Paciente Fecho",
      patientEmail: "paciente.fecho@example.pt",
      patientPhone: "912345678",
      patientReminderSmsEnabled: true,
      patientReminderEmailEnabled: true,
      patientDeletedAt: null,
      patientHasAcceptedTerms: false,
      practitionerName: "Dra Fecho",
      locationName: "Sede",
      locationPhone: "+351 210 000 000",
      tenantSettings: { locale: "pt", contacts: { phone: "+351 210 000 000" } },
      ...over,
    };
  }

  async function claimsOf(appointmentId: string): Promise<Row[]> {
    return rows(raw`select c.id::text as id, c.tenant_id::text as tenant_id, c.offset_id, c.channel, c.taker, c.early,
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

  /** A claim row written straight to the table, on the owning connection. */
  async function seedClaim(
    appointmentId: string,
    over: {
      tenant?: string;
      offsetId?: "24h" | "48h";
      channel?: string;
      startsAt?: Date;
      early?: boolean | null;
      taker?: "run" | "sweep";
      /** Days before now the claim was taken. */
      daysAgo?: number;
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
              ${startsAt.toISOString()}, ${due}::timestamptz, ${over.taker ?? "run"}, ${early}::boolean,
              now() - make_interval(days => ${over.daysAgo ?? 0}::int) - interval '1 minute')`);
    return id;
  }

  async function seedRelease(appointmentId: string, claimId: string) {
    await sql.execute(raw`insert into reminder_claims (tenant_id, appointment_id, kind, offset_id, channel, claim_id)
      values (${tenantA}, ${appointmentId}, 'release', '24h', 'sms', ${claimId})`);
  }

  async function seedLedger(appointmentId: string, outcome: "sent" | "suppressed") {
    await sql.execute(raw`insert into reminder_dispatches
      (tenant_id, appointment_id, channel, template_id, outcome, suppression_reason)
      values (${tenantA}, ${appointmentId}, 'sms', 'reminder.24h.sms', ${outcome}, ${outcome === "suppressed" ? "status" : null})`);
  }

  /** Ask the closed claim itself, as the job, for the 24 h SMS of START. */
  async function take(appointmentId: string, over: { startsAt?: Date; taker?: "run" | "sweep"; takenAhead?: boolean } = {}) {
    const { takeReminderClaimClosed } = await import("./reminder-claim");
    return takeReminderClaimClosed({
      tenantId: tenantA,
      appointmentId,
      offsetId: "24h",
      channel: "sms",
      startsAt: over.startsAt ?? START,
      taker: over.taker ?? "sweep",
      takenAhead: over.takenAhead,
    });
  }

  async function dispatch(appointmentId: string, taker: "run" | "sweep" = "sweep", start: Date = START) {
    const { dispatchReminder } = await import("./dispatch");
    return dispatchReminder(tenantA, appointmentId, "24h", "sms", taker, justAfterMarkOf(start));
  }

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    for (const [label, t] of Object.entries(seeds)) {
      await sql.execute(raw`insert into tenants (id, name, slug)
        values (${t.tenant}, 'Claim Closed Co', ${"rclosed-" + label.toLowerCase() + "-" + t.tenant.slice(0, 8)})`);
      await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${t.therapist}, ${t.tenant}, ${"t-" + t.therapist.slice(0, 8) + "@t.test"}, 'Dra Fecho', true, true)`);
      await sql.execute(raw`insert into locations (id, tenant_id, name) values (${t.location}, ${t.tenant}, 'Sede')`);
      await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
        values (${t.patient}, ${t.tenant}, 'Paciente Fecho', '912345678')`);
    }
  });

  afterAll(async () => {
    if (!sql) return;
    for (const tenantId of [tenantA, tenantB]) {
      await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
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
    process.env.REMINDERS_SWEEP_MODE = "send";
    h.sends.length = 0;
    h.transport = "sent";
    h.sendDelayMs = 0;
    h.loadReminderData.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.restoreAllMocks();
  });

  /* ---------------------------------------------------------------- */
  /* 1. Which rows hold                                                */
  /* ---------------------------------------------------------------- */

  describe("which rows make the closed claim answer held", () => {
    it("no claim at all: not held, and the row it writes names the taker and the start and is not early", async () => {
      const id = await fresh();
      const answer = await take(id, { taker: "sweep" });
      expect(answer.held).toBe(false);
      const claims = await claimsOf(id);
      expect(claims).toEqual([
        {
          id: (answer as { claimId: string }).claimId,
          tenant_id: tenantA,
          offset_id: "24h",
          channel: "sms",
          taker: "sweep",
          early: false,
          starts_at: START.toISOString(),
          released: false,
        },
      ]);
    });

    it.each([
      ["a claim of the pass, a minute old", { taker: "sweep" as const, daysAgo: 0 }],
      ["a claim of the sleeping job, a minute old", { taker: "run" as const, daysAgo: 0 }],
      ["a claim nine days old: AT ANY AGE", { taker: "sweep" as const, daysAgo: 9 }],
    ])("%s, with no ledger row after it: HELD, and nothing is written", async (_name, over) => {
      const id = await fresh();
      await seedClaim(id, over);
      expect(await take(id)).toEqual({ held: true });
      expect(await claimsOf(id)).toHaveLength(1);
    });

    it("a live claim holds whatever the ledger says after it: sent, or suppressed", async () => {
      const sent = await fresh();
      await seedClaim(sent);
      await seedLedger(sent, "sent");
      expect(await take(sent)).toEqual({ held: true });

      // A claim of before the switch, whose sender held the reminder back and
      // (as the dispatcher then was) wrote no release: it holds. The limit is
      // stated in the report: such a reminder is not tried again by the pass.
      const suppressed = await fresh();
      await seedClaim(suppressed);
      await seedLedger(suppressed, "suppressed");
      expect(await take(suppressed)).toEqual({ held: true });
    });

    it("a RELEASED claim does not hold, and a second claim is written beside it", async () => {
      const id = await fresh();
      const first = await seedClaim(id);
      await seedRelease(id, first);
      const answer = await take(id);
      expect(answer.held).toBe(false);
      const claims = await claimsOf(id);
      expect(claims.map((c) => c.released)).toEqual([true, false]);
    });

    it("one live claim among released ones still holds", async () => {
      const id = await fresh();
      const first = await seedClaim(id, { daysAgo: 2 });
      await seedRelease(id, first);
      await seedClaim(id, { daysAgo: 1 });
      expect(await take(id)).toEqual({ held: true });
    });

    it("an EARLY claim does not hold: it was taken over ten minutes before this start's mark", async () => {
      const id = await fresh();
      await seedClaim(id, { early: true });
      expect((await take(id)).held).toBe(false);
    });

    it("a claim with no mark on record is not early, and holds", async () => {
      const id = await fresh();
      await seedClaim(id, { early: null });
      expect(await take(id)).toEqual({ held: true });
    });

    it.each([
      ["another start", { startsAt: OTHER_START }],
      ["another offset", { offsetId: "48h" as const }],
      ["another channel", { channel: "email" }],
    ])("a live claim for %s does not hold this reminder", async (_name, over) => {
      const id = await fresh();
      await seedClaim(id, over);
      expect((await take(id)).held).toBe(false);
    });

    it("another tenant's claim that names this very appointment does not hold it", async () => {
      const id = await fresh();
      // On the owning connection only: the table's own key would refuse a
      // release, not a claim, that names another tenant's appointment.
      await seedClaim(id, { tenant: tenantB });
      expect((await take(id)).held).toBe(false);
    });

    it("the sweep's shadow row is not a claim, and does not hold", async () => {
      const id = await fresh();
      await sql.execute(raw`insert into reminder_claims
        (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark)
        values (${tenantA}, ${id}, 'shadow', '24h', 'sms', ${START.toISOString()},
                ${new Date(START.getTime() - 24 * 60 * 60_000).toISOString()}, 0, false)`);
      expect((await take(id)).held).toBe(false);
    });

    it("a claim the last pass takes AHEAD of its mark is not recorded early, so it holds the next taker", async () => {
      const id = await fresh("A", FAR_START);
      // CONTROL: without the flag a claim this far ahead IS early, and holds nobody.
      const control = await fresh("A", FAR_START);
      await take(control, { startsAt: FAR_START });
      expect((await claimsOf(control))[0]!.early).toBe(true);
      expect((await take(control, { startsAt: FAR_START })).held).toBe(false);

      await take(id, { startsAt: FAR_START, takenAhead: true });
      expect((await claimsOf(id))[0]!.early).toBe(false);
      expect(await take(id, { startsAt: FAR_START, takenAhead: true })).toEqual({ held: true });
      expect(await claimsOf(id)).toHaveLength(1);
    });
  });

  /* ---------------------------------------------------------------- */
  /* 2. Fail closed                                                    */
  /* ---------------------------------------------------------------- */

  it("FAIL CLOSED: while another session sits on the reminder's lock the claim throws, nothing is written and nothing is sent", async () => {
    const { reminderClaimLockPayload, ReminderClaimStoreError } = await import("./reminder-claim");
    const id = await fresh();
    const payload = reminderClaimLockPayload(tenantA, id, "24h", "sms");
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
    try {
      h.loadReminderData.mockResolvedValue(loaded(id));
      const failure = await dispatch(id).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(ReminderClaimStoreError);
      // Ids and the error's name, and nobody's name or number.
      expect((failure as Error).message).toContain(`appointmentId=${id}`);
      expect((failure as Error).message).not.toMatch(/Paciente|912345678|example\.pt/);
    } finally {
      letGo();
      await holder;
    }
    expect(h.sends).toEqual([]);
    expect(await claimsOf(id)).toEqual([]);
    expect(await ledgerOf(id)).toEqual([]);

    // And once the lock is free the same call sends: the failure cost a delay.
    expect(await dispatch(id)).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["sms"]);
  });

  /* ---------------------------------------------------------------- */
  /* 3. Two at once                                                    */
  /* ---------------------------------------------------------------- */

  describe("TWO AT ONCE: the duplicate refusal", () => {
    const SENDERS = 8;

    it("eight senders of one reminder in the same instant: ONE send, seven held, one claim, one sent row", async () => {
      const id = await fresh();
      h.loadReminderData.mockResolvedValue(loaded(id));
      // The transport takes long enough that every sender has asked for the
      // claim before the first one's message is on record.
      h.sendDelayMs = 300;
      const takers = Array.from({ length: SENDERS }, (_, i) => (i % 2 === 0 ? "sweep" : "run") as "sweep" | "run");
      const outcomes = await Promise.all(takers.map((taker) => dispatch(id, taker)));

      expect(h.sends).toEqual(["sms"]);
      expect(outcomes.filter((o) => o.dispatched)).toHaveLength(1);
      expect(outcomes.filter((o) => !o.dispatched && o.reason === "claim_held")).toHaveLength(SENDERS - 1);
      const claims = await claimsOf(id);
      expect(claims).toHaveLength(1);
      expect(claims[0]!.released).toBe(false);
      expect(await ledgerOf(id)).toEqual(["reminder.24h.sms:sent:"]);
    });

    it("NEGATIVE CONTROL: with the send switch OFF the same eight ALL send, as the dispatcher of today does", async () => {
      delete process.env.REMINDERS_SWEEP_MODE;
      const id = await fresh();
      h.loadReminderData.mockResolvedValue(loaded(id));
      h.sendDelayMs = 300;
      const outcomes = await Promise.all(Array.from({ length: SENDERS }, () => dispatch(id, "run")));
      // Today a claim blocks only once a `sent` row is on record, and none is
      // yet when eight senders read in the same instant.
      expect(h.sends).toHaveLength(SENDERS);
      expect(outcomes.every((o) => o.dispatched)).toBe(true);
      expect(await claimsOf(id)).toHaveLength(SENDERS);
    });

    it("two senders of DIFFERENT reminders of one visit do not hold each other", async () => {
      const id = await fresh();
      h.loadReminderData.mockResolvedValue(loaded(id));
      h.sendDelayMs = 100;
      const { dispatchReminder } = await import("./dispatch");
      const [sms, email] = await Promise.all([
        dispatchReminder(tenantA, id, "24h", "sms", "sweep", justAfterMarkOf(START)),
        dispatchReminder(tenantA, id, "48h", "email", "sweep", justAfterMarkOf(START, 48)),
      ]);
      expect(sms).toMatchObject({ dispatched: true });
      expect(email).toMatchObject({ dispatched: true });
      expect([...h.sends].sort()).toEqual(["email", "sms"]);
    });
  });

  /* ---------------------------------------------------------------- */
  /* 4 to 6. Sent, held back, unknown                                  */
  /* ---------------------------------------------------------------- */

  it("SENT IS FINAL: after a send neither the pass nor the sleeping job sends again, and neither leaves a row", async () => {
    const id = await fresh();
    h.loadReminderData.mockResolvedValue(loaded(id));
    expect(await dispatch(id, "sweep")).toMatchObject({ dispatched: true });
    for (const taker of ["sweep", "run", "sweep"] as const) {
      expect(await dispatch(id, taker)).toEqual({ dispatched: false, reason: "claim_held" });
    }
    expect(h.sends).toEqual(["sms"]);
    expect(await claimsOf(id)).toHaveLength(1);
    expect(await ledgerOf(id)).toEqual(["reminder.24h.sms:sent:"]);
  });

  it("HELD BACK IS TRIED AGAIN: each held attempt gives its claim up, and once the visit is put right it is sent, once", async () => {
    const id = await fresh();
    // An online request nobody has accepted yet: held back, twice.
    h.loadReminderData.mockResolvedValue(loaded(id, { status: "scheduled", origin: "patient_portal" }));
    expect(await dispatch(id)).toEqual({ dispatched: false, reason: "unconfirmed" });
    expect(await dispatch(id)).toEqual({ dispatched: false, reason: "unconfirmed" });
    expect(h.sends).toEqual([]);
    expect((await claimsOf(id)).map((c) => c.released)).toEqual([true, true]);

    // Accepted. The next attempt sends, and its claim is kept.
    h.loadReminderData.mockResolvedValue(loaded(id, { status: "confirmed", origin: "patient_portal" }));
    expect(await dispatch(id)).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["sms"]);
    expect((await claimsOf(id)).map((c) => c.released)).toEqual([true, true, false]);

    // And never again.
    expect(await dispatch(id)).toEqual({ dispatched: false, reason: "claim_held" });
    expect(await dispatch(id, "run")).toEqual({ dispatched: false, reason: "claim_held" });
    expect(h.sends).toEqual(["sms"]);
    expect(await ledgerOf(id)).toEqual([
      "reminder.24h.sms:suppressed:unconfirmed",
      "reminder.24h.sms:suppressed:unconfirmed",
      "reminder.24h.sms:sent:",
    ]);
  });

  it("a message the gate kept in the sandbox handed nothing over: its claim is given up and the next attempt sends", async () => {
    const id = await fresh();
    h.loadReminderData.mockResolvedValue(loaded(id));
    h.transport = "sandbox";
    expect(await dispatch(id)).toMatchObject({ dispatched: true });
    expect((await claimsOf(id)).map((c) => c.released)).toEqual([true]);
    h.transport = "sent";
    expect(await dispatch(id)).toMatchObject({ dispatched: true });
    expect(await dispatch(id)).toEqual({ dispatched: false, reason: "claim_held" });
    expect(await ledgerOf(id)).toEqual(["reminder.24h.sms:suppressed:sandbox", "reminder.24h.sms:sent:"]);
  });

  it("AN UNKNOWN OUTCOME IS NEVER SENT AGAIN: the provider's answer is not on the list, the claim stays, the retry is held", async () => {
    const id = await fresh();
    h.loadReminderData.mockResolvedValue(loaded(id));
    h.transport = "refuse_unknown";
    await expect(dispatch(id)).rejects.toThrow("provider unknown");
    expect((await claimsOf(id)).map((c) => c.released)).toEqual([false]);

    h.transport = "sent";
    expect(await dispatch(id)).toEqual({ dispatched: false, reason: "claim_held" });
    expect(await dispatch(id, "run")).toEqual({ dispatched: false, reason: "claim_held" });
    // The transport was reached once, by the attempt that failed.
    expect(h.sends).toEqual(["sms"]);
    expect(await ledgerOf(id)).toEqual(["reminder.24h.sms:provider_error:20500"]);
  });

  it("A REFUSAL ON THE LIST gives the claim up: the next attempt sends, once", async () => {
    const id = await fresh();
    h.loadReminderData.mockResolvedValue(loaded(id));
    h.transport = "refuse_listed";
    await expect(dispatch(id)).rejects.toThrow("provider refused");
    expect((await claimsOf(id)).map((c) => c.released)).toEqual([true]);

    h.transport = "sent";
    expect(await dispatch(id)).toMatchObject({ dispatched: true });
    expect(await dispatch(id)).toEqual({ dispatched: false, reason: "claim_held" });
    expect(h.sends).toEqual(["sms", "sms"]);
    expect(await ledgerOf(id)).toEqual(["reminder.24h.sms:provider_error:21211", "reminder.24h.sms:sent:"]);
  });

  it("a visit moved to another start earns a reminder of its own: the claim of the old start does not hold it", async () => {
    const id = await fresh();
    h.loadReminderData.mockResolvedValue(loaded(id));
    expect(await dispatch(id)).toMatchObject({ dispatched: true });
    h.loadReminderData.mockResolvedValue(loaded(id, { startsAt: OTHER_START }));
    expect(await dispatch(id, "sweep", OTHER_START)).toMatchObject({ dispatched: true });
    expect(await dispatch(id, "sweep", OTHER_START)).toEqual({ dispatched: false, reason: "claim_held" });
    expect((await claimsOf(id)).map((c) => c.starts_at)).toEqual([START.toISOString(), OTHER_START.toISOString()]);
    expect(h.sends).toEqual(["sms", "sms"]);
  });

  it("nothing of it is in the audit trail", async () => {
    const [n] = await rows(raw`select count(*)::int as n from audit_log where tenant_id in (${tenantA}, ${tenantB})`);
    expect(n!.n).toBe(0);
  });
});
