/**
 * THE CONFIRM LINK MEETS 0061's EXCLUSION CONSTRAINT. Found by GREEN, NESA-R9 N6.
 *
 * ==========================================================================
 * THE DEFECT, AS BEHAVIOUR
 * ==========================================================================
 * A patient taps `Confirmar:` in their 24h SMS. Their booking is `scheduled`,
 * and it overlaps an appointment that is ALREADY `confirmed` on the same
 * practitioner. `appointments_no_double_confirmed` (migration 0061) refuses the
 * UPDATE with SQLSTATE 23P01, nothing catches it, and the throw reaches
 * `global-error.tsx`: the patient is shown a bare error page. The booking stays
 * `scheduled` — Agendada — because the transaction rolled back, so from
 * reception's side it is indistinguishable from a patient who ignored the SMS.
 *
 * ==========================================================================
 * WHY THIS CANNOT BE A UNIT TEST
 * ==========================================================================
 * The refusal is the DATABASE's. A mock that throws a hand-built 23P01 proves
 * the mapping and nothing about whether the constraint fires on the rows this
 * path actually writes — which is the half that was wrong. The companion unit
 * test covers the mapping; this one makes the real constraint say no.
 *
 * TWO SCHEDULED ROWS ON ONE WINDOW ARE LEGAL, which is why this state exists in
 * production at all: 0061's predicate is `status = 'confirmed'`, and it says so
 * in its own header. The clinic double-books a slot as `scheduled` on purpose,
 * one of them gets confirmed, and then the other patient taps their link.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

const H = 60 * 60 * 1000;
const SECRET = "confirm-overlap-test-secret";

d("the confirm link against a slot already confirmed for that practitioner", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let tenantId: string;
  let practitionerId: string;
  let locationId: string;
  /** Two patients: the one who holds the slot, and the one who taps the link. */
  let holderPatientId: string;
  let tapperPatientId: string;

  /** Distinct windows per fixture, so one test cannot arrange another's collision. */
  let slot = 0;

  /**
   * The situation, seeded exactly: a confirmed appointment holding a window,
   * and a scheduled one on the SAME practitioner and the SAME window, with a
   * live confirm code. The constraint keys on `practitioner_id` only, so the
   * shared practitioner is what makes them collide.
   */
  async function overlappingPair(): Promise<{ appointmentId: string; code: string; heldId: string }> {
    const { issueConfirmCode } = await import("./confirm-code-store");
    const startsAt = new Date(Date.now() + 24 * H + slot++ * 4 * H);
    const endsAt = new Date(startsAt.getTime() + H);

    const heldId = randomUUID();
    await sql.execute(raw`
      insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                starts_at, ends_at, status)
      values (${heldId}, ${tenantId}, ${holderPatientId}, ${practitionerId}, ${locationId},
              ${startsAt.toISOString()}, ${endsAt.toISOString()}, 'confirmed')`);

    const appointmentId = randomUUID();
    await sql.execute(raw`
      insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                starts_at, ends_at, status)
      values (${appointmentId}, ${tenantId}, ${tapperPatientId}, ${practitionerId}, ${locationId},
              ${startsAt.toISOString()}, ${endsAt.toISOString()}, 'scheduled')`);

    const issued = await issueConfirmCode({ tenantId, appointmentId });
    if (!issued) throw new Error("fixture: a live code already existed");
    return { appointmentId, code: issued.code, heldId };
  }

  const statusOf = async (appointmentId: string): Promise<string> => {
    const rows = (await sql.execute(
      raw`select status from appointments where id = ${appointmentId}`,
    )) as unknown as { status: string }[];
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    return (list[0] as { status: string }).status;
  };

  const auditRows = async (
    appointmentId: string,
  ): Promise<{ action: string; metadata: Record<string, unknown> | null }[]> => {
    const rows = (await sql.execute(
      raw`select action, metadata from audit_log where entity_id = ${appointmentId} order by created_at`,
    )) as unknown as { action: string; metadata: Record<string, unknown> | null }[];
    return Array.isArray(rows)
      ? rows
      : (((rows as { rows?: unknown[] }).rows ?? []) as never);
  };

  const codeConsumedAt = async (appointmentId: string): Promise<string | null> => {
    const rows = (await sql.execute(
      raw`select consumed_at::text as consumed_at from appointment_confirm_codes
           where appointment_id = ${appointmentId}`,
    )) as unknown as { consumed_at: string | null }[];
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    return (list[0] as { consumed_at: string | null } | undefined)?.consumed_at ?? null;
  };

  beforeAll(async () => {
    process.env.REMINDERS_CONFIRM_CODE_SECRET ??= SECRET;
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Overlap Co', ${"overlap-" + tenantId.slice(0, 8)})`);
    practitionerId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${practitionerId}, ${tenantId}, ${"p-" + practitionerId.slice(0, 8) + "@t.test"},
              'Dra Teste', true)`);
    locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name)
      values (${locationId}, ${tenantId}, 'Sede')`);
    holderPatientId = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name)
      values (${holderPatientId}, ${tenantId}, 'Paciente Um')`);
    tapperPatientId = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name)
      values (${tapperPatientId}, ${tenantId}, 'Paciente Dois')`);
  });

  afterAll(async () => {
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  /* ================================================================== */
  /* THE FIXTURE ITSELF, ASSERTED - otherwise a green test below could   */
  /* mean the collision was never arranged.                              */
  /* ================================================================== */

  it("NEGATIVE CONTROL: the constraint really does refuse this pair", async () => {
    const { appointmentId } = await overlappingPair();
    // Straight at the database, no application code: if this does NOT reject,
    // the fixture is not the situation the card describes and every assertion
    // below would be proving something else.
    //
    // THE CODE IS ON `cause`, NOT ON THE ERROR. Drizzle wraps the driver error
    // in its own "Failed query" Error and hangs the PostgresError off `cause`.
    // Asserting `{ code }` at the top level silently fails - it did, on the
    // first run of this file - and that nesting is exactly why the classifier
    // in confirm-redeem.ts walks the cause chain instead of reading one field.
    await expect(
      sql.execute(
        raw`update appointments set status = 'confirmed' where id = ${appointmentId}`,
      ),
    ).rejects.toMatchObject({
      cause: { code: "23P01", constraint_name: "appointments_no_double_confirmed" },
    });
    expect(await statusOf(appointmentId)).toBe("scheduled");
  });

  /* ================================================================== */
  /* THE DEFECT                                                          */
  /* ================================================================== */

  it("ANSWERS double_booked instead of throwing", async () => {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const { code } = await overlappingPair();

    // TODAY THIS REJECTS WITH 23P01 and the patient sees a bare error page.
    const outcome = await redeemConfirmCode({
      code,
      action: "confirm",
      now: new Date(),
      ip: null,
    });
    expect(outcome).toEqual({ outcome: "double_booked" });
  });

  it("LEAVES THE BOOKING AGENDADA, and does not touch the one holding the slot", async () => {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const { appointmentId, code, heldId } = await overlappingPair();

    await redeemConfirmCode({ code, action: "confirm", now: new Date(), ip: null });

    expect(await statusOf(appointmentId)).toBe("scheduled");
    expect(await statusOf(heldId)).toBe("confirmed");
  });

  it("LEAVES THE CODE LIVE, so the patient can still act after ringing the clinic", async () => {
    // The confirm branch has never consumed the code (it is idempotent), and
    // this refusal does not change that. Stated as an assertion because "we
    // left it alone" is exactly the kind of claim that quietly stops being true.
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const { appointmentId, code } = await overlappingPair();

    await redeemConfirmCode({ code, action: "confirm", now: new Date(), ip: null });

    expect(await codeConsumedAt(appointmentId)).toBeNull();
  });

  it("LEAVES RECEPTION A TRACE, because a refusal nobody can see is the same as no refusal", async () => {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const { appointmentId, code } = await overlappingPair();

    await redeemConfirmCode({ code, action: "confirm", now: new Date(), ip: null });

    const rows = await auditRows(appointmentId);
    const refusals = rows.filter(
      (r) => (r.metadata as { reason?: string } | null)?.reason === "double_confirmed_refused",
    );
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.action).toBe("appointment.confirm.sms_code");

    // AND NO SUCCESS ROW. The failed transaction took its audit row with it, so
    // the only row for this appointment is the refusal - never both.
    expect(rows.filter((r) => !(r.metadata as { reason?: string } | null)?.reason)).toHaveLength(0);
  });

  /* ================================================================== */
  /* THE ARM THAT MUST NOT CHANGE                                        */
  /* ================================================================== */

  it("a NON-overlapping confirm still works exactly as before", async () => {
    // Proves the catch is narrow rather than swallowing the happy path: same
    // code path, same practitioner, a window nobody holds.
    const { redeemConfirmCode } = await import("./confirm-redeem");
    const { issueConfirmCode } = await import("./confirm-code-store");

    const appointmentId = randomUUID();
    const startsAt = new Date(Date.now() + 24 * H + slot++ * 4 * H);
    await sql.execute(raw`
      insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                starts_at, ends_at, status)
      values (${appointmentId}, ${tenantId}, ${tapperPatientId}, ${practitionerId}, ${locationId},
              ${startsAt.toISOString()}, ${new Date(startsAt.getTime() + H).toISOString()},
              'scheduled')`);
    const issued = await issueConfirmCode({ tenantId, appointmentId });
    if (!issued) throw new Error("fixture: a live code already existed");

    const outcome = await redeemConfirmCode({
      code: issued.code,
      action: "confirm",
      now: new Date(),
      ip: null,
    });

    expect(outcome).toEqual({ outcome: "confirmed" });
    expect(await statusOf(appointmentId)).toBe("confirmed");
  });
});
