/**
 * no-double-confirmed.test.ts — DB-gated proof of 0061's EXCLUDE constraint.
 *
 * WHY THIS SUITE IS THE EVIDENCE AND THE APP TESTS ARE NOT. INC-08 was produced
 * by three code paths in ninety seconds, two of which left no trace of how. The
 * whole argument for a constraint is that it is keyed on STATE rather than on
 * PATH, so it cannot be bypassed by a path nobody thought of. A mocked test
 * asserting that some function refuses proves the opposite kind of thing — it
 * proves one path behaves. Only Postgres can prove the state is unreachable.
 *
 * EVERY CASE RUNS ON THE PRIVILEGED (owner) CONNECTION, deliberately. An owner
 * BYPASSES RLS but NOT a table constraint, so a refusal here is the strongest
 * available statement: not even the most privileged writer in the system can
 * produce the state. That is exactly the claim being made.
 *
 * The four cases are chosen so that a constraint which is too STRICT fails just
 * as loudly as one that is too LOOSE. A ban on all overlaps would pass the first
 * case and fail the last three, and every one of those three is real clinic
 * behaviour that must keep working.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

const F = {
  tenant: randomUUID(),
  role: randomUUID(),
  therapist: randomUUID(),
  other: randomUUID(),
  location: randomUUID(),
  patientA: randomUUID(),
  patientB: randomUUID(),
};

/** One fixed window, and a second that abuts it exactly. */
const START = "2026-04-06T09:00:00Z";
const END = "2026-04-06T10:00:00Z";
const OVERLAP_START = "2026-04-06T09:30:00Z";
const OVERLAP_END = "2026-04-06T10:30:00Z";
const ABUT_START = "2026-04-06T10:00:00Z";
const ABUT_END = "2026-04-06T11:00:00Z";

const d = live ? describe : describe.skip;

d("0061 — appointments_no_double_confirmed", () => {
  let sql: Sql;

  async function insert(args: {
    id: string;
    status: string;
    startsAt: string;
    endsAt: string;
    practitioner?: string;
    patient?: string;
  }) {
    await sql`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
      values (${args.id}, ${F.tenant}, ${args.patient ?? F.patientA},
              ${args.practitioner ?? F.therapist}, ${F.location},
              ${args.startsAt}::timestamptz, ${args.endsAt}::timestamptz, ${args.status})`;
  }

  beforeAll(async () => {
    if (!live) return;
    sql = connect();
    await sql`insert into tenants (id, name, slug)
              values (${F.tenant}, 'Excl Co', ${`excl-${F.tenant}`})`;
    await sql`insert into roles (id, tenant_id, slug, name)
              values (${F.role}, ${F.tenant}, 'therapist', 'Therapist')`;
    await sql`insert into users (id, tenant_id, role_id, email, full_name)
              values (${F.therapist}, ${F.tenant}, ${F.role}, ${`t-${F.therapist}@e.pt`}, 'Dra Um')`;
    await sql`insert into users (id, tenant_id, role_id, email, full_name)
              values (${F.other}, ${F.tenant}, ${F.role}, ${`t-${F.other}@e.pt`}, 'Dra Dois')`;
    await sql`insert into locations (id, tenant_id, name)
              values (${F.location}, ${F.tenant}, 'Sede')`;
    await sql`insert into patients (id, tenant_id, full_name)
              values (${F.patientA}, ${F.tenant}, 'Paciente A')`;
    await sql`insert into patients (id, tenant_id, full_name)
              values (${F.patientB}, ${F.tenant}, 'Paciente B')`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from appointments where tenant_id = ${F.tenant}`;
    await sql`delete from patients where tenant_id = ${F.tenant}`;
    await sql`delete from locations where tenant_id = ${F.tenant}`;
    await sql`delete from users where tenant_id = ${F.tenant}`;
    await sql`delete from roles where tenant_id = ${F.tenant}`;
    await sql`delete from tenants where id = ${F.tenant}`;
    await sql.end();
  });

  // Cleared between cases so each starts from an empty diary for this tenant.
  async function reset() {
    await sql`delete from appointments where tenant_id = ${F.tenant}`;
  }

  it("EXISTS as an exclusion constraint on appointments", async () => {
    // A vacuous-pass guard for the whole file. If the constraint were absent,
    // every refusal case below would fail loudly - but the three PERMIT cases
    // would pass, and a reader skimming green could conclude the opposite of
    // the truth. So its existence is asserted first, by name and by type.
    const rows = await sql<{ contype: string }[]>`
      select contype::text from pg_constraint
       where conname = 'appointments_no_double_confirmed'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.contype).toBe("x"); // 'x' = exclusion
  });

  it("REFUSES a second CONFIRMED appointment overlapping the same therapist", async () => {
    await reset();
    await insert({ id: randomUUID(), status: "confirmed", startsAt: START, endsAt: END });
    await expect(
      insert({
        id: randomUUID(),
        status: "confirmed",
        startsAt: OVERLAP_START,
        endsAt: OVERLAP_END,
        patient: F.patientB,
      }),
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("REFUSES the UPDATE path too — the 17:00:01 move in the incident", async () => {
    // The production double booking was not created by an INSERT. Both rows
    // already existed and were flipped to `confirmed` by a plain status patch,
    // which ran no conflict check. A constraint keyed on STATE catches the
    // update as readily as the insert; a check keyed on PATH would not have.
    await reset();
    const a = randomUUID();
    const b = randomUUID();
    await insert({ id: a, status: "confirmed", startsAt: START, endsAt: END });
    await insert({
      id: b,
      status: "scheduled",
      startsAt: OVERLAP_START,
      endsAt: OVERLAP_END,
      patient: F.patientB,
    });
    await expect(
      sql`update appointments set status = 'confirmed' where id = ${b}`,
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("PERMITS two stacked PENDING pedidos on one window — D1 stays legal", async () => {
    // JP's option-B ruling and D1-pedido-versus-pedido-stacking. A pending
    // pedido carries status `scheduled` (0059:145, centre.ts:96), so the
    // partial predicate must leave any number of them alone. A constraint
    // written as "not cancelled" instead of "= confirmed" fails here.
    await reset();
    await insert({ id: randomUUID(), status: "scheduled", startsAt: START, endsAt: END });
    await expect(
      insert({
        id: randomUUID(),
        status: "scheduled",
        startsAt: OVERLAP_START,
        endsAt: OVERLAP_END,
        patient: F.patientB,
      }),
    ).resolves.toBeUndefined();
  });

  it("PERMITS back-to-back confirmed appointments — the range is half-open", async () => {
    // 10:00-11:00 immediately after 09:00-10:00 is most of a clinic day. A
    // closed `[]` range would refuse it and make the constraint unusable.
    await reset();
    await insert({ id: randomUUID(), status: "confirmed", startsAt: START, endsAt: END });
    await expect(
      insert({
        id: randomUUID(),
        status: "confirmed",
        startsAt: ABUT_START,
        endsAt: ABUT_END,
        patient: F.patientB,
      }),
    ).resolves.toBeUndefined();
  });

  it("PERMITS overlapping confirmed appointments for DIFFERENT therapists", async () => {
    await reset();
    await insert({ id: randomUUID(), status: "confirmed", startsAt: START, endsAt: END });
    await expect(
      insert({
        id: randomUUID(),
        status: "confirmed",
        startsAt: OVERLAP_START,
        endsAt: OVERLAP_END,
        practitioner: F.other,
        patient: F.patientB,
      }),
    ).resolves.toBeUndefined();
  });

  it("PERMITS a confirmed appointment overlapping a CANCELLED one", async () => {
    await reset();
    await insert({ id: randomUUID(), status: "cancelled", startsAt: START, endsAt: END });
    await expect(
      insert({
        id: randomUUID(),
        status: "confirmed",
        startsAt: OVERLAP_START,
        endsAt: OVERLAP_END,
        patient: F.patientB,
      }),
    ).resolves.toBeUndefined();
  });
});
