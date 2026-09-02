/**
 * confirm-redeem.db.test.ts — SR-30 against a REAL database.
 *
 * ==========================================================================
 * WHY THIS CANNOT BE A UNIT TEST
 * ==========================================================================
 * The two properties SR-30 names are properties of BEHAVIOUR, not of a return
 * value: three different refusals must be indistinguishable in OUTPUT and in
 * TIME. A mock answers instantly for all three and would prove the second
 * property trivially while the real code leaked it. And single-use is decided
 * by an UPDATE's own predicate, which only a database can arbitrate.
 *
 * THE TIMING ASSERTION IS A RATIO OVER MEDIANS, NOT A THRESHOLD IN
 * MILLISECONDS. What it must catch is a STRUCTURAL short-circuit — a refusal
 * path that skips the lookup and answers in a millisecond while a real one
 * takes tens. That is an order of magnitude, so the bound is generous enough
 * that ordinary variance cannot redden it and tight enough that a skipped query
 * cannot hide. A tight millisecond bound in a required job is a flake with a
 * countdown on it, and a flaky gate gets muted.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

const H = 60 * 60 * 1000;
const SECRET = "confirm-02-test-secret";

d("redeemConfirmCode against a real database", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let tenantId: string;
  let patientId: string;
  let practitionerId: string;
  let locationId: string;

  /**
   * Seed one appointment and mint one code for it.
   *
   * EVERY FIXTURE GETS ITS OWN SLOT, and that is not tidiness: migration 0061's
   * `appointments_no_double_confirmed` exclusion constraint refuses a second
   * CONFIRMED appointment for the same practitioner in an overlapping window,
   * so a fixture that reused one time would make INC-08's guard look like a
   * defect in this feature.
   */
  let slot = 0;
  async function freshAppointmentWithCode(opts: {
    startsInHours?: number;
    status?: string;
  } = {}): Promise<{ appointmentId: string; code: string }> {
    const { issueConfirmCode } = await import("./confirm-code-store");
    const appointmentId = randomUUID();
    const base = (opts.startsInHours ?? 24) * H;
    // The slot offset moves AWAY from now in the SAME direction as `base`, so a
    // fixture asked for a PAST appointment stays in the past however many
    // fixtures precede it. Adding the offset unconditionally silently walked
    // the expired fixtures into the future and made a refusal test pass for the
    // wrong reason.
    const startsAt = new Date(Date.now() + base + Math.sign(base || 1) * slot++ * 2 * H);
    await sql.execute(raw`
      insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                starts_at, ends_at, status)
      values (${appointmentId}, ${tenantId}, ${patientId}, ${practitionerId}, ${locationId},
              ${startsAt.toISOString()}, ${new Date(startsAt.getTime() + H).toISOString()},
              ${opts.status ?? "scheduled"})`);
    const issued = await issueConfirmCode({ tenantId, appointmentId });
    if (!issued) throw new Error("fixture: a live code already existed");
    return { appointmentId, code: issued.code };
  }

  const statusOf = async (appointmentId: string): Promise<string> => {
    const rows = (await sql.execute(
      raw`select status from appointments where id = ${appointmentId}`,
    )) as unknown as { status: string }[];
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    return (list[0] as { status: string }).status;
  };

  const auditCount = async (appointmentId: string): Promise<number> => {
    const rows = (await sql.execute(
      raw`select count(*)::int as n from audit_log where entity_id = ${appointmentId}`,
    )) as unknown as { n: number }[];
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    return (list[0] as { n: number }).n;
  };

  beforeAll(async () => {
    process.env.REMINDERS_CONFIRM_CODE_SECRET ??= SECRET;
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Confirm Co', ${"confirm-" + tenantId.slice(0, 8)})`);
    practitionerId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${practitionerId}, ${tenantId}, ${"p-" + practitionerId.slice(0, 8) + "@t.test"},
              'Dra Teste', true)`);
    locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name)
      values (${locationId}, ${tenantId}, 'Sede')`);
    patientId = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name)
      values (${patientId}, ${tenantId}, 'Paciente Teste')`);
  });

  afterAll(async () => {
    // Own rows only, keyed by this run's tenant. `audit_log` cascades from
    // tenants; the confirm codes cascade from appointments.
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  /* ================================================================== */
  /* SR-30, HALF ONE: THE OUTPUT                                         */
  /* ================================================================== */

  it("unknown, expired and consumed return the SAME object, by deep equality", async () => {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const now = new Date();

    // UNKNOWN: a well-formed code that names no row.
    const unknown = await redeemConfirmCode({ code: "AAAAAAAA", action: "confirm", now, ip: null });

    // EXPIRED: a real code on an appointment that has already begun.
    const past = await freshAppointmentWithCode({ startsInHours: -1 });
    const expired = await redeemConfirmCode({ code: past.code, action: "confirm", now, ip: null });

    // CONSUMED: a real code already spent by a pedido.
    const spent = await freshAppointmentWithCode();
    const { consumeConfirmCode } = await import("./confirm-code-store");
    await consumeConfirmCode({ tenantId, code: spent.code, now });
    const consumed = await redeemConfirmCode({ code: spent.code, action: "confirm", now, ip: null });

    // MALFORMED, which is not one of the three but must not be a fourth.
    const malformed = await redeemConfirmCode({ code: "!!", action: "confirm", now, ip: null });

    expect(unknown).toEqual({ outcome: "generic" });
    expect(expired).toEqual(unknown);
    expect(consumed).toEqual(unknown);
    expect(malformed).toEqual(unknown);
    // Deep equality is the assertion, and the object carries no reason field a
    // caller could render, so there is nothing else for them to differ by.
    expect(Object.keys(unknown)).toEqual(["outcome"]);
  });

  it("a refused code changes NOTHING: no status move, no audit row", async () => {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const past = await freshAppointmentWithCode({ startsInHours: -1 });
    await redeemConfirmCode({ code: past.code, action: "confirm", now: new Date(), ip: null });
    expect(await statusOf(past.appointmentId)).toBe("scheduled");
    expect(await auditCount(past.appointmentId)).toBe(0);
  });

  /* ================================================================== */
  /* SR-30, HALF TWO: THE TIME                                           */
  /* ================================================================== */

  it("the three refusals take the SAME TIME, within an order of magnitude", async () => {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const now = new Date();
    const spent = await freshAppointmentWithCode();
    const { consumeConfirmCode } = await import("./confirm-code-store");
    await consumeConfirmCode({ tenantId, code: spent.code, now });
    const past = await freshAppointmentWithCode({ startsInHours: -1 });

    const median = async (code: string): Promise<number> => {
      const samples: number[] = [];
      for (let i = 0; i < 15; i++) {
        const t0 = performance.now();
        await redeemConfirmCode({ code, action: "confirm", now, ip: null });
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)]!;
    };

    // Warm the pool so the first sample does not pay for a connection.
    await redeemConfirmCode({ code: "AAAAAAAA", action: "confirm", now, ip: null });

    const timings = {
      unknown: await median("AAAAAAAA"),
      malformed: await median("!!"),
      consumed: await median(spent.code),
      expired: await median(past.code),
    };

    const values = Object.values(timings);
    const lo = Math.min(...values);
    const hi = Math.max(...values);

    // WHAT THIS CATCHES: a path that skips the lookup entirely. That is ~10x,
    // and the malformed one is the path that would do it — it is the only input
    // whose shape can be judged without a query. The bound is 4x so ordinary
    // variance on a loaded CI runner cannot redden it.
    expect(hi / lo, `medians: ${JSON.stringify(timings)}`).toBeLessThan(4);
  });

  /* ================================================================== */
  /* THE TWO ACTIONS                                                     */
  /* ================================================================== */

  it("confirm moves scheduled to confirmed and writes ONE audit row", async () => {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const a = await freshAppointmentWithCode();
    const result = await redeemConfirmCode({
      code: a.code,
      action: "confirm",
      now: new Date(),
      ip: "203.0.113.9",
    });
    expect(result).toEqual({ outcome: "confirmed" });
    expect(await statusOf(a.appointmentId)).toBe("confirmed");
    expect(await auditCount(a.appointmentId)).toBe(1);
  });

  it("confirm is IDEMPOTENT and does not consume the code", async () => {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const a = await freshAppointmentWithCode();
    await redeemConfirmCode({ code: a.code, action: "confirm", now: new Date(), ip: null });

    const second = await redeemConfirmCode({
      code: a.code,
      action: "confirm",
      now: new Date(),
      ip: null,
    });
    // Not the generic refusal: reaching this needs a LIVE, unspent code, so it
    // discloses nothing the holder did not already have. SR-30 covers refusals.
    expect(second).toEqual({ outcome: "already_confirmed" });
    expect(await statusOf(a.appointmentId)).toBe("confirmed");
    // Still exactly one audit row: the second press wrote nothing.
    expect(await auditCount(a.appointmentId)).toBe(1);
  });

  it("pedido consumes the code, and the SECOND press is refused generically", async () => {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const a = await freshAppointmentWithCode();
    const first = await redeemConfirmCode({
      code: a.code,
      action: "pedido",
      now: new Date(),
      ip: null,
    });
    expect(first).toEqual({ outcome: "pedido" });

    const second = await redeemConfirmCode({
      code: a.code,
      action: "pedido",
      now: new Date(),
      ip: null,
    });
    // The consume's own `consumed_at IS NULL` predicate refused it, and the
    // answer is the same one a forged code gets.
    expect(second).toEqual({ outcome: "generic" });
    expect(await auditCount(a.appointmentId)).toBe(1);
  });

  it("TWO SIMULTANEOUS pedidos produce exactly ONE request", async () => {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const a = await freshAppointmentWithCode();
    const now = new Date();
    const [x, y] = await Promise.all([
      redeemConfirmCode({ code: a.code, action: "pedido", now, ip: null }),
      redeemConfirmCode({ code: a.code, action: "pedido", now, ip: null }),
    ]);
    const outcomes = [x.outcome, y.outcome].sort();
    expect(outcomes).toEqual(["generic", "pedido"]);
    expect(await auditCount(a.appointmentId)).toBe(1);
  });

  it("expiry is read from the APPOINTMENT, so moving it moves the boundary", async () => {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const a = await freshAppointmentWithCode({ startsInHours: 2 });

    // Reception moves the appointment into the past. 0072 stores no expires_at,
    // so nothing had to be updated for the code to expire with it.
    await sql.execute(raw`update appointments set starts_at = now() - interval '1 hour',
                                                  ends_at = now()
                           where id = ${a.appointmentId}`);
    expect(
      await redeemConfirmCode({ code: a.code, action: "confirm", now: new Date(), ip: null }),
    ).toEqual({ outcome: "generic" });
  });

  it("one live code per appointment: a second issue for the same one is refused", async () => {
    const { issueConfirmCode } = await import("./confirm-code-store");
    const a = await freshAppointmentWithCode();
    expect(await issueConfirmCode({ tenantId, appointmentId: a.appointmentId })).toBeNull();
  });

  it("a WITHDRAWN code frees the appointment to be issued again", async () => {
    const { issueConfirmCode, withdrawConfirmCode } = await import("./confirm-code-store");
    const a = await freshAppointmentWithCode();
    const hash = (
      await import("./confirm-code")
    ).hashConfirmCode(a.code, process.env as NodeJS.ProcessEnv);
    expect(await withdrawConfirmCode({ tenantId, codeHash: hash })).toBe(true);
    // And the appointment can carry a link on the retry, which is the whole
    // reason the withdraw exists.
    expect(await issueConfirmCode({ tenantId, appointmentId: a.appointmentId })).not.toBeNull();
  });
});
