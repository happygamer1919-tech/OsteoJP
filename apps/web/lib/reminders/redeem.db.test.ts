/**
 * redeem.db.test.ts — LOOP 1's remaining Definition-of-Done lines, against a
 * REAL Postgres. W13-01a.
 *
 * WHY THIS FILE EXISTS AND WHY IT IS HERE. Three DoD lines in WAVE-13.md LOOP 1
 * assert properties of a TRANSACTION: that the appointment write and the
 * consumption record commit or roll back together, that a refusal still writes
 * an audit row, and that a cutoff refusal happens at redemption rather than at
 * issuance. None of them can be honestly proven against a mock - a mock would
 * only prove it agrees with itself. They need a database.
 *
 * They could not live in packages/db/tests, where every other DB-gated suite
 * lives, because redeemActionToken is in apps/web and packages/db importing from
 * apps/web is the wrong dependency direction. So this is the first DB-gated
 * suite in apps/web, and .github/workflows/db-tests.yml grew a step to run it
 * against the same Supabase stack the packages/db suites use.
 *
 * THE SKIP CONTRACT, which is the whole point of the harness. `live` gates on
 * DATABASE_URL exactly as packages/db/tests/rls-harness.ts does, so ci.yml (no
 * database) skips cleanly and stays green. That makes a silent skip possible,
 * which is why assert-rls-executed.mjs was extended to hard-require this file:
 * a suite that skips in the DB-gated job now REDDENS it. Without that, this file
 * would be exactly the kind of test that reads as protection and proves nothing
 * - the same defect found in W13-01d, where an app-level test was never
 * collected at all.
 *
 * Seeding goes through getDbAdmin() rather than a raw postgres.js client, and
 * that is deliberate: apps/web does not depend on `postgres`, and adding a
 * dependency to reach a database it already reaches through @osteojp/db would be
 * a new dependency bought for a test. Every fixture is torn down in afterAll,
 * and the append-only tables need their trigger disabled to clean up - which is
 * itself the guarantee working.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

/** The clinic's cutoff, restated so the test states its own premise. */
const H = 60 * 60 * 1000;

d("redeemActionToken against a real database", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let tenantId: string;
  let patientId: string;
  let practitionerId: string;
  let locationId: string;
  const serviceId: string | null = null;

  beforeAll(async () => {
    process.env.REMINDERS_LINK_SECRET ??= "w13-01a-test-secret";
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();

    tenantId = randomUUID();
    const slug = "redeem-" + tenantId.slice(0, 8);
    await sql.execute(raw`insert into tenants (id, name, slug)
              values (${tenantId}, 'Redeem Co', ${slug})`);

    // A practitioner needs an auth-shaped users row; users.id mirrors auth.users.id.
    practitionerId = randomUUID();
    const email = "p-" + practitionerId.slice(0, 8) + "@t.test";
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
              values (${practitionerId}, ${tenantId}, ${email}, 'Dra Teste', true)`);

    locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name)
              values (${locationId}, ${tenantId}, 'Sede')`);

    patientId = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name)
              values (${patientId}, ${tenantId}, 'Paciente Teste')`);
  });

  // ==================================================================
  // TEARDOWN NEVER TOUCHES A TRIGGER. INC-db-gated-trigger-race.
  //
  // WHAT THIS USED TO DO AND WHY IT WAS WRONG. It ran
  // `ALTER TABLE ... DISABLE TRIGGER` so it could DELETE from the two
  // append-only tables, with a comment claiming that was "the guarantee
  // working, not a workaround for a flaw". It was a workaround, and it was
  // GLOBAL: ALTER TABLE changes the table for EVERY connection, not for the
  // session that ran it. Once a second apps/web suite
  // (scheduling/pedido-confirm.db.test.ts) started toggling the same trigger
  // and the db-tests workflow moved to a glob that actually ran it, vitest's
  // default parallel file execution let one suite's ENABLE land inside the
  // other's disabled window. The loser's DELETE was refused and the DB-gated
  // REQUIRED check went red on a sha whose diff could not touch it.
  //
  // WHY DELETING THESE ROWS WAS NEVER NEEDED. Every assertion in this file
  // reads patient_audit_log through auditRows(), which filters by
  // `appointment_id`, and each test seeds its own appointment with a fresh
  // randomUUID. The consumption reads are keyed by token hash. Nothing here
  // is scoped only by tenant, so leftover rows from a previous test in this
  // file cannot be seen by a later one.
  //
  // WHY THE TENANT ROW IS LEFT BEHIND. patient_audit_log.tenant_id and
  // action_token_consumptions.tenant_id both carry an FK to tenants with NO
  // cascade, and migration 0054 says that is deliberate: "Deleting a tenant
  // that still holds a patient audit trail is refused, which is the correct
  // answer for an audit trail." So the old teardown was not merely disabling
  // a guard to tidy up - it was breaking the exact production rule 0054
  // exists to state. This suite now obeys that rule. The tenant is a fresh
  // uuid per run; CI reset the database anyway, and a local run accumulates a
  // handful of tiny rows, which is the honest price of an append-only table.
  // ==================================================================
  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
  });

  /** Rows from a raw query, normalised across driver shapes. */
  /**
   * Rows from a raw query. `unknown` values rather than `any`: every read below
   * is either compared with toBe/toMatchObject or passed to new Date(), so the
   * cast belongs at the use site, not smuggled in as a blanket any.
   */
  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  /** An appointment starting `hoursFromNow` out. Returns its id. */
  async function seedAppointment(hoursFromNow: number): Promise<string> {
    const id = randomUUID();
    // ISO strings, not Date objects. The raw-template path binds parameters
    // through the driver's serializer, which rejects a Date for a timestamptz
    // (ERR_INVALID_ARG_TYPE, "Received an instance of Date"). Drizzle's typed
    // insert builder would convert it; a raw template does not.
    const starts = new Date(Date.now() + hoursFromNow * H).toISOString();
    const ends = new Date(Date.now() + (hoursFromNow + 1) * H).toISOString();
    await sql.execute(raw`insert into appointments
                (id, tenant_id, patient_id, practitioner_id, location_id,
                 service_id, starts_at, ends_at, status)
              values (${id}, ${tenantId}, ${patientId}, ${practitionerId}, ${locationId},
                      ${serviceId}, ${starts}, ${ends}, 'scheduled')`);
    return id;
  }

  async function auditRows(appointmentId: string) {
    return rows(raw`select action, outcome, reason, auth_means, ip
                 from patient_audit_log
                where appointment_id = ${appointmentId}
                order by occurred_at`);
  }

  async function mint(appointmentId: string, scope: "confirm" | "confirm_cancel", startsAt: Date) {
    const { signRescheduleToken, rescheduleTokenExpiry } = await import("./link-token");
    return signRescheduleToken({
      tenantId,
      appointmentId,
      exp: rescheduleTokenExpiry(startsAt),
      scope,
    });
  }

  it("confirms an appointment and writes BOTH the consumption and the audit row", async () => {
    const { redeemActionToken, tokenHash } = await import("./redeem");
    const apptId = await seedAppointment(48);
    const [{ starts_at }] = await rows(raw`select starts_at from appointments where id = ${apptId}`);
    const token = await mint(apptId, "confirm_cancel", new Date(starts_at as string));

    const result = await redeemActionToken({
      token, action: "confirm", now: new Date(), ip: "203.0.113.9",
    });
    expect(result).toEqual({ outcome: "success", action: "confirm" });

    // The 0024 confirmation axis, never appointment_status.
    const [appt] = await rows(raw`select status, confirmation_state, confirmation_received_at
                               from appointments where id = ${apptId}`);
    expect(appt.status).toBe("scheduled");
    expect(appt.confirmation_state).toBe("confirmed");
    expect(appt.confirmation_received_at).not.toBeNull();

    const spent = await rows(raw`select action from action_token_consumptions
                             where token_hash = ${tokenHash(token)}`);
    expect(spent).toHaveLength(1);

    const audit = await auditRows(apptId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "confirm", outcome: "success", reason: null, auth_means: "signed_token",
    });
  });

  it("refuses a SECOND redemption identically to a forged token", async () => {
    const { redeemActionToken } = await import("./redeem");
    const apptId = await seedAppointment(48);
    const [{ starts_at }] = await rows(raw`select starts_at from appointments where id = ${apptId}`);
    const token = await mint(apptId, "confirm_cancel", new Date(starts_at as string));

    await redeemActionToken({ token, action: "confirm", now: new Date(), ip: null });
    const second = await redeemActionToken({ token, action: "confirm", now: new Date(), ip: null });
    const forged = await redeemActionToken({
      token: "eyJ0IjoieCJ9.bm90LWEtc2lnbmF0dXJl", action: "confirm", now: new Date(), ip: null,
    });

    // Counsel s6: a consumed token yields the same generic rejection as an
    // invalid one. Deep equality, not "both are falsy".
    expect(second).toEqual({ outcome: "refused" });
    expect(second).toEqual(forged);
  });

  it("rolls the appointment write BACK when the consumption insert fails", async () => {
    // The DoD line: force a failure between the action and the consumption and
    // assert NEITHER landed. The consumption primary key is the forcing
    // mechanism - pre-inserting the hash makes the second insert collide inside
    // the same transaction as the appointment write.
    const { redeemActionToken, tokenHash } = await import("./redeem");
    const apptId = await seedAppointment(48);
    const [{ starts_at }] = await rows(raw`select starts_at from appointments where id = ${apptId}`);
    const token = await mint(apptId, "confirm_cancel", new Date(starts_at as string));

    await sql.execute(raw`insert into action_token_consumptions
                (token_hash, tenant_id, appointment_id, action)
              values (${tokenHash(token)}, ${tenantId}, ${apptId}, 'confirm')`);

    const before = await rows(raw`select confirmation_state from appointments where id = ${apptId}`);
    expect(before[0].confirmation_state).toBe("pending");

    const result = await redeemActionToken({
      token, action: "confirm", now: new Date(), ip: null,
    });
    expect(result).toEqual({ outcome: "refused" });

    // THE ASSERTION THAT MATTERS: the appointment is untouched. A two-write
    // sequence that merely looked atomic would have left it 'confirmed'.
    const after = await rows(raw`select confirmation_state, confirmation_received_at
                              from appointments where id = ${apptId}`);
    expect(after[0].confirmation_state).toBe("pending");
    expect(after[0].confirmation_received_at).toBeNull();
  });

  it("refuses a cancel INSIDE the cutoff and records the refusal", async () => {
    // Counsel s5: a cancel link minted at 48h is legitimately outside the cutoff
    // when created. Redeemed 20h before start it is inside, and the server
    // re-evaluates against the clock AT REDEMPTION.
    const { redeemActionToken, tokenHash } = await import("./redeem");
    const apptId = await seedAppointment(20);
    const [{ starts_at }] = await rows(raw`select starts_at from appointments where id = ${apptId}`);
    const token = await mint(apptId, "confirm_cancel", new Date(starts_at as string));

    const result = await redeemActionToken({
      token, action: "cancel", now: new Date(), ip: "203.0.113.4",
    });
    expect(result).toEqual({ outcome: "cutoff" });

    const [appt] = await rows(raw`select status from appointments where id = ${apptId}`);
    expect(appt.status).toBe("scheduled"); // NOT cancelled

    // Not consumed: counsel s6 forbids a token burned with no action taken.
    const spent = await rows(raw`select 1 from action_token_consumptions
                             where token_hash = ${tokenHash(token)}`);
    expect(spent).toHaveLength(0);

    // A REFUSAL IS A ROW. This is the dispute record counsel s8 names.
    const audit = await auditRows(apptId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "cancel", outcome: "refused", reason: "inside_cutoff", ip: "203.0.113.4",
    });
  });

  it("still allows CONFIRM inside the cutoff - it is not cutoff-bound", async () => {
    const { redeemActionToken } = await import("./redeem");
    const apptId = await seedAppointment(20);
    const [{ starts_at }] = await rows(raw`select starts_at from appointments where id = ${apptId}`);
    const token = await mint(apptId, "confirm", new Date(starts_at as string));

    const result = await redeemActionToken({
      token, action: "confirm", now: new Date(), ip: null,
    });
    // Confirming an imminent appointment is exactly what the 24h reminder asks
    // for; a cutoff applied to confirm would break the SMS offset's only action.
    expect(result).toEqual({ outcome: "success", action: "confirm" });
  });

  it("refuses cancel on a confirm-only token and audits it as out of scope", async () => {
    const { redeemActionToken } = await import("./redeem");
    const apptId = await seedAppointment(48);
    const [{ starts_at }] = await rows(raw`select starts_at from appointments where id = ${apptId}`);
    const token = await mint(apptId, "confirm", new Date(starts_at as string));

    const result = await redeemActionToken({
      token, action: "cancel", now: new Date(), ip: null,
    });
    expect(result).toEqual({ outcome: "refused" });

    const [appt] = await rows(raw`select status from appointments where id = ${apptId}`);
    expect(appt.status).toBe("scheduled");

    const audit = await auditRows(apptId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ outcome: "refused", reason: "outside_scope" });
  });

  it("cancels outside the cutoff, releasing the slot", async () => {
    const { redeemActionToken } = await import("./redeem");
    const apptId = await seedAppointment(48);
    const [{ starts_at }] = await rows(raw`select starts_at from appointments where id = ${apptId}`);
    const token = await mint(apptId, "confirm_cancel", new Date(starts_at as string));

    const result = await redeemActionToken({
      token, action: "cancel", now: new Date(), ip: null,
    });
    expect(result).toEqual({ outcome: "success", action: "cancel" });

    const [appt] = await rows(raw`select status from appointments where id = ${apptId}`);
    expect(appt.status).toBe("cancelled");
  });
});
