/**
 * latest-note-either-kind.db.test.ts — NOTES-01, against a real database.
 *
 * ==========================================================================
 * WHY THIS SUITE EXISTS AND THE PURE ONES DID NOT CATCH IT
 * ==========================================================================
 * /recuperacao rendered no note line on any row in production, and every test
 * the feature had was green. They were green because they all HANDED the
 * component a note. Nothing asked the question the product actually asks: given
 * a patient, does the read find the notes the clinic writes?
 *
 * IT DID NOT. It read patient-LEVEL notes only - `appointment_id IS NULL` plus
 * the legacy relation - and production holds ONE of those against 43,403
 * APPOINTMENT notes. The query was correct, its scope was correct, and it was
 * pointed at the wrong relation.
 *
 * SO THIS SUITE WRITES NOTES OF BOTH KINDS AND ASKS. It is the arm that would
 * have failed on the day, and the one that fails again if the union ever loses
 * its appointment leg.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("NOTES-01: the latest note of either kind", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let readLatestNoteEitherKind: typeof import("./latest-notes").readLatestNoteEitherKind;

  const tenant = randomUUID();
  const role = randomUUID();
  const staff = randomUUID();
  const location = randomUUID();
  const service = randomUUID();
  /** Notes of both kinds; the newest is an APPOINTMENT note. */
  const both = randomUUID();
  /** A patient-level note and nothing else. */
  const patientOnly = randomUUID();
  /** No notes at all — must be ABSENT from the map, not present and empty. */
  const silent = randomUUID();
  const appt1 = randomUUID();
  const appt2 = randomUUID();

  const run = async <T>(fn: (tx: import("@osteojp/db").DbTx) => Promise<T>): Promise<T> => {
    const { withTenantContext } = await import("@osteojp/db");
    return withTenantContext({ tenant_id: tenant, user_role: "owner", sub: staff }, fn);
  };

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ readLatestNoteEitherKind } = await import("./latest-notes"));
    const { sql } = await import("drizzle-orm");

    await db.execute(sql`insert into public.tenants (id, name, slug) values (${tenant}, 'notes', ${`notes-${tenant.slice(0, 8)}`})`);
    await db.execute(sql`insert into public.roles (id, tenant_id, slug, name) values (${role}, ${tenant}, 'owner', 'Owner')`);
    await db.execute(
      sql`insert into public.users (id, tenant_id, role_id, email, full_name)
          values (${staff}, ${tenant}, ${role}, ${`s-${staff.slice(0, 8)}@notes.test`}, 'Staff')`,
    );
    await db.execute(sql`insert into public.locations (id, tenant_id, name) values (${location}, ${tenant}, 'CB')`);
    await db.execute(
      sql`insert into public.services (id, tenant_id, name) values (${service}, ${tenant}, 'Osteopatia')`,
    );
    for (const [id, name] of [
      [both, "Ambos"],
      [patientOnly, "So Paciente"],
      [silent, "Sem Notas"],
    ] as const) {
      await db.execute(
        sql`insert into public.patients (id, tenant_id, full_name) values (${id}, ${tenant}, ${name})`,
      );
    }
    for (const [id, patient] of [
      [appt1, both],
      [appt2, both],
    ] as const) {
      await db.execute(
        sql`insert into public.appointments
              (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at)
            values (${id}, ${tenant}, ${patient}, ${staff}, ${location}, ${service},
                    now() - interval '10 days', now() - interval '10 days' + interval '45 minutes')`,
      );
    }

    // The patient-level note is the OLDEST, so a read that still preferred it
    // would be visible as a wrong `kind` rather than as a missing row.
    await db.execute(
      sql`insert into public.appointment_notes (tenant_id, patient_id, appointment_id, body, created_at)
          values (${tenant}, ${both}, null, 'nota de paciente antiga', now() - interval '9 days')`,
    );
    await db.execute(
      sql`insert into public.appointment_notes (tenant_id, patient_id, appointment_id, body, created_at)
          values (${tenant}, ${both}, ${appt1}, 'primeira nota da marcacao', now() - interval '8 days')`,
    );
    await db.execute(
      sql`insert into public.appointment_notes (tenant_id, patient_id, appointment_id, body, created_at)
          values (${tenant}, ${both}, ${appt2}, 'NOTA MAIS RECENTE DA MARCACAO', now() - interval '1 day')`,
    );
    await db.execute(
      sql`insert into public.appointment_notes (tenant_id, patient_id, appointment_id, body, created_at)
          values (${tenant}, ${patientOnly}, null, 'unica nota do paciente', now() - interval '2 days')`,
    );
  });

  afterAll(async () => {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`delete from public.tenants where id = ${tenant}`);
  });

  it("finds the APPOINTMENT note the clinic actually writes, and says so", async () => {
    const map = await run((tx) => readLatestNoteEitherKind(tx, [both]));
    const hit = map.get(both);
    expect(hit).toBeDefined();
    expect(hit!.excerpt.text).toContain("NOTA MAIS RECENTE DA MARCACAO");
    expect(hit!.kind).toBe("appointment");
    // TWO appointment notes, not three: the count is of the kind that won, so
    // the label "(de 2)" is true about the thing it sits beside.
    expect(hit!.total).toBe(2);
  });

  it("still finds a PATIENT-level note when that is the newest thing there is", async () => {
    const map = await run((tx) => readLatestNoteEitherKind(tx, [patientOnly]));
    const hit = map.get(patientOnly);
    expect(hit).toBeDefined();
    expect(hit!.excerpt.text).toContain("unica nota do paciente");
    expect(hit!.kind).toBe("patient");
    expect(hit!.total).toBe(1);
  });

  it("a patient with no notes is ABSENT, not present and empty", async () => {
    const map = await run((tx) => readLatestNoteEitherKind(tx, [silent]));
    expect(map.has(silent)).toBe(false);
  });

  it("THE REGRESSION: the old patient-only read finds nothing for this patient", async () => {
    // The control that names the defect. `readLatestPatientNotes` is still the
    // right read for /marcacoes' patient LINE, so it stays - but on a patient
    // whose notes are all attached to visits it returns nothing, which is what
    // /recuperacao was showing every row.
    const { readLatestPatientNotes } = await import("./latest-notes");
    const map = await run((tx) => readLatestPatientNotes(tx, [both]));
    expect(map.get(both)!.excerpt.text).toContain("nota de paciente antiga");
    expect(map.get(both)!.total).toBe(1);
  });
});
