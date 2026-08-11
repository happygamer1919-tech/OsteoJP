/**
 * pedido-confirm.db.test.ts — THE DOUBLE BOOKING, against a REAL Postgres.
 *
 * WHY THIS FILE EXISTS, and it is not "more coverage". On 2026-08-11 the owner
 * produced a live double booking in production: a portal pedido and a staff
 * appointment, same practitioner, same window, BOTH ending in `confirmed`. The
 * standing claim that "the confirm re-checks in-transaction, so two confirms
 * cannot both succeed" had never been verified against a database.
 *
 * IT HAD NEVER BEEN VERIFIED BECAUSE THE ONLY SUITE COVERING IT MOCKS THE CHECK
 * IT IS ASSERTING ABOUT. `pedido-confirm.test.ts` does
 * `vi.mock("./conflict", ...)` with `findConflictsForWindow: vi.fn(async () => [])`,
 * then proves refusal by setting the mock's return value. Those assertions are
 * legitimate — they pin the ORCHESTRATION, which is real logic — but they are
 * the only assertions, and orchestration is not the thing that failed.
 *
 * SO THIS FILE MOCKS NOTHING IN `./conflict`. Not the module, not one export.
 * `findConflictsForWindow` runs, reaches `public.appointment_conflicts()`, and
 * the answer comes from Postgres. The auth seam is mocked, and ONLY the auth
 * seam: `requireRequestContext` is faked so the test can act as reception, while
 * the REAL `runScoped` is kept via `importOriginal` — because
 * `appointment_conflicts` filters on `public.jwt_tenant_id()`, and a fake
 * `runScoped` would silently remove the JWT claims and make every query return
 * nothing. A test that passed that way would prove the opposite of what it
 * claims.
 *
 * BOTH ARMS ARE LOAD-BEARING AND THEY PULL IN OPPOSITE DIRECTIONS:
 *   - confirming over a non-cancelled appointment for the same practitioner
 *     must REFUSE (the defect);
 *   - a second PENDING pedido on the same slot must still SAVE (JP option B and
 *     migration 0059, which a naive "make the pedido hold the slot" fix would
 *     silently reverse).
 * A fix that satisfies one and breaks the other is not a fix.
 *
 * SKIP CONTRACT: gates on DATABASE_URL exactly as redeem.db.test.ts does, so
 * ci.yml (no database) skips cleanly and the DB-gated job runs it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The auth seam, and NOTHING else. runScoped is kept REAL: it sets
// `role authenticated` + request.jwt.claims, which is what makes
// public.jwt_tenant_id() resolve inside appointment_conflicts.
const h = vi.hoisted(() => ({ requireRequestContext: vi.fn() }));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, requireRequestContext: h.requireRequestContext };
});
vi.mock("@osteojp/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/auth")>();
  return { ...actual, assertCan: vi.fn() }; // capability granted; RLS still real
});
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

d("confirmAppointmentRequest against a real database", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let confirmAppointmentRequest: typeof import("./actions").confirmAppointmentRequest;

  let tenantId: string;
  let receptionId: string;
  let practitionerId: string;
  /** A SECOND bookable therapist, for the different-practitioner arm. */
  let otherPractitionerId: string;
  let locationId: string;
  let patientA: string;
  let patientB: string;

  /** Two hours of the same afternoon, well clear of any cutoff. */
  const START = new Date(Date.now() + 96 * 60 * 60 * 1000);
  const END = new Date(START.getTime() + 55 * 60 * 1000);

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ confirmAppointmentRequest } = await import("./actions"));

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Pedido Co', ${"pedido-" + tenantId.slice(0, 8)})`);

    receptionId = randomUUID();
    practitionerId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${receptionId}, ${tenantId}, ${"r-" + receptionId.slice(0, 8) + "@t.test"}, 'Rececao', true)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${practitionerId}, ${tenantId}, ${"p-" + practitionerId.slice(0, 8) + "@t.test"}, 'Dra Teste', true, true)`);

    otherPractitionerId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${otherPractitionerId}, ${tenantId}, ${"o-" + otherPractitionerId.slice(0, 8) + "@t.test"}, 'Dr Outro', true, true)`);

    locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name)
      values (${locationId}, ${tenantId}, 'Sede')`);

    patientA = randomUUID();
    patientB = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name)
      values (${patientA}, ${tenantId}, 'Paciente A')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name)
      values (${patientB}, ${tenantId}, 'Paciente B')`);

    h.requireRequestContext.mockResolvedValue({
      tenantId,
      role: "reception",
      userId: receptionId,
    });
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
    await sql.execute(raw`alter table patient_audit_log disable trigger patient_audit_log_append_only`);
    await sql.execute(raw`delete from patient_audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`alter table patient_audit_log enable trigger patient_audit_log_append_only`);
    // A SUCCESSFUL confirm writes an audit row keyed to the acting user, and
    // audit_log.actor_user_id has an FK to users - so the users delete below
    // fails with 23503 unless this runs first. Discovered by the teardown
    // failing on the first CI run while all seven assertions passed.
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  afterEach(async () => {
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
    await sql.execute(raw`alter table patient_audit_log disable trigger patient_audit_log_append_only`);
    await sql.execute(raw`delete from patient_audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`alter table patient_audit_log enable trigger patient_audit_log_append_only`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
  });

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  /** An appointment in the shared window. `who` defaults to the main therapist. */
  async function seedAppointment(
    patientId: string,
    status: string,
    who?: string,
  ): Promise<string> {
    const id = randomUUID();
    const practitioner = who ?? practitionerId;
    await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, location_id,
         starts_at, ends_at, status)
      values (${id}, ${tenantId}, ${patientId}, ${practitioner}, ${locationId},
              ${START.toISOString()}, ${END.toISOString()}, ${status})`);
    return id;
  }

  /**
   * Make an appointment a PEDIDO: the `appointment_request` notification row is
   * what `is_unconfirmed_pedido` keys on (0059:139-148), and it is also the row
   * the confirm's own SELECT inner-joins. Addressed to reception, because 0055
   * pins SELECT to recipient_user_id = auth.uid().
   */
  async function makePedido(appointmentId: string, patientId: string): Promise<void> {
    await sql.execute(raw`insert into staff_notifications
        (id, tenant_id, recipient_user_id, kind, appointment_id, patient_id,
         previous_starts_at, new_starts_at, occurred_at)
      values (${randomUUID()}, ${tenantId}, ${receptionId}, 'appointment_request',
              ${appointmentId}, ${patientId},
              ${START.toISOString()}, ${START.toISOString()}, ${new Date().toISOString()})`);
  }

  async function statusOf(id: string): Promise<string | undefined> {
    const r = await rows(raw`select status from appointments where id = ${id}`);
    return r[0]?.status as string | undefined;
  }

  /* ------------------------------------------------------------------ */
  /* ARM ONE — the defect. Confirming over a taken slot must REFUSE.     */
  /* ------------------------------------------------------------------ */

  it("REFUSES to confirm a pedido whose slot holds a confirmed staff appointment", async () => {
    // Exactly the production sequence: the staff booking exists and is
    // confirmed; the pedido is still scheduled and awaiting reception.
    const staff = await seedAppointment(patientB, "confirmed");
    const pedido = await seedAppointment(patientA, "scheduled");
    await makePedido(pedido, patientA);

    const result = await confirmAppointmentRequest(pedido);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toBe("conflict");

    // The pedido is untouched, so it stays in reception's queue.
    expect(await statusOf(pedido)).toBe("scheduled");
    expect(await statusOf(staff)).toBe("confirmed");
  });

  it("REFUSES when the occupying appointment is merely scheduled, not confirmed", async () => {
    // `appointment_conflicts` excludes only cancelled and no_show (0059:187), so
    // a plain scheduled staff booking blocks too. Pinned separately because a
    // fix that keyed on `status = 'confirmed'` would pass the test above and
    // still permit this one.
    const staff = await seedAppointment(patientB, "scheduled");
    const pedido = await seedAppointment(patientA, "scheduled");
    await makePedido(pedido, patientA);

    const result = await confirmAppointmentRequest(pedido);

    expect(result.ok).toBe(false);
    expect(await statusOf(pedido)).toBe("scheduled");
    expect(await statusOf(staff)).toBe("scheduled");
  });

  it("names the conflict, so reception can tell the patient what happened", async () => {
    await seedAppointment(patientB, "confirmed");
    const pedido = await seedAppointment(patientA, "scheduled");
    await makePedido(pedido, patientA);

    const result = await confirmAppointmentRequest(pedido);
    if (result.ok) throw new Error("unreachable");
    expect(result.conflicts?.length).toBeGreaterThan(0);
    expect(result.conflicts?.[0]).toMatchObject({ kind: "therapist" });
  });

  /* ------------------------------------------------------------------ */
  /* ARM TWO — option B. A pending pedido must NOT block anything.       */
  /* ------------------------------------------------------------------ */

  it("CONFIRMS normally when the only other row is an unconfirmed pedido (option B)", async () => {
    // The negative arm for the fix. A second pending pedido on the same slot is
    // LEGAL under JP's no-cap ruling and migration 0059, so it must not be
    // mistaken for a conflict. A fix that made pedidos hold the slot would
    // reverse that ruling and would pass every test above.
    const otherPedido = await seedAppointment(patientB, "scheduled");
    await makePedido(otherPedido, patientB);

    const pedido = await seedAppointment(patientA, "scheduled");
    await makePedido(pedido, patientA);

    const result = await confirmAppointmentRequest(pedido);

    expect(result.ok).toBe(true);
    expect(await statusOf(pedido)).toBe("confirmed");
    // The other pedido is untouched and still pending.
    expect(await statusOf(otherPedido)).toBe("scheduled");
  });

  it("CONFIRMS on a genuinely free slot", async () => {
    const pedido = await seedAppointment(patientA, "scheduled");
    await makePedido(pedido, patientA);

    const result = await confirmAppointmentRequest(pedido);

    expect(result.ok).toBe(true);
    expect(await statusOf(pedido)).toBe("confirmed");
  });

  it("a cancelled appointment in the window does not block (0052/0059)", async () => {
    await seedAppointment(patientB, "cancelled");
    const pedido = await seedAppointment(patientA, "scheduled");
    await makePedido(pedido, patientA);

    const result = await confirmAppointmentRequest(pedido);
    expect(result.ok).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* HYPOTHESIS 1 — a DIFFERENT practitioner is not a conflict.          */
  /* ------------------------------------------------------------------ */

  it("CONFIRMS when the overlapping confirmed appointment is a DIFFERENT practitioner", async () => {
    // WHY THIS TEST EXISTS, and it is a diagnostic rather than a regression
    // guard. The production "double booking" of 2026-08-11 could not be
    // reproduced: every refusal arm above passes against the sha it was observed
    // on. The leading remaining explanation is that the two appointments had
    // DIFFERENT practitioner_ids and were never a double booking at all - two
    // therapists working the same hour, which the agenda renders side by side
    // and which reads on screen exactly like one therapist booked twice.
    //
    // 2026-08-15 IS A SATURDAY, and the portal assigns from whoever covers that
    // weekday. Any bookable user with Saturday hours is a candidate assignee, so
    // the portal choosing someone other than the therapist staff booked is not a
    // remote possibility - it is the ordinary behaviour of chooseTherapist.
    //
    // THIS MUST PASS, and its passing is the POINT. appointment_conflicts'
    // therapist branch is per-practitioner (0059:193); a version that refused
    // here would be blocking two legitimate concurrent appointments and would
    // break the clinic's normal two-therapist Saturday.
    const otherTherapistAppt = await seedAppointment(
      patientB,
      "confirmed",
      otherPractitionerId,
    );
    const pedido = await seedAppointment(patientA, "scheduled");
    await makePedido(pedido, patientA);

    const result = await confirmAppointmentRequest(pedido);

    expect(result.ok).toBe(true);
    expect(await statusOf(pedido)).toBe("confirmed");
    expect(await statusOf(otherTherapistAppt)).toBe("confirmed");

    // Two confirmed rows, same window, same location, DIFFERENT therapists.
    // This is the shape the owner saw, and it is correct.
    const both = await rows(
      raw`select practitioner_id from appointments
           where tenant_id = ${tenantId} and status = 'confirmed'`,
    );
    expect(both).toHaveLength(2);
  });

  /* ------------------------------------------------------------------ */
  /* ARM THREE — two simultaneous confirms cannot both win.              */
  /* ------------------------------------------------------------------ */

  it("two simultaneous confirms of two pedidos on one slot produce exactly ONE confirmed", async () => {
    // The transactional half. The slot lock plus the in-transaction re-check
    // must serialise these; whichever loses must see the winner and refuse.
    const p1 = await seedAppointment(patientA, "scheduled");
    await makePedido(p1, patientA);
    const p2 = await seedAppointment(patientB, "scheduled");
    await makePedido(p2, patientB);

    const [r1, r2] = await Promise.all([
      confirmAppointmentRequest(p1),
      confirmAppointmentRequest(p2),
    ]);

    const wins = [r1, r2].filter((r) => r.ok).length;
    expect(wins).toBe(1);

    const confirmed = await rows(
      raw`select id from appointments
           where tenant_id = ${tenantId} and status = 'confirmed'`,
    );
    expect(confirmed).toHaveLength(1);
  });
});
