/**
 * pack-derived-balance.db.test.ts — RB-02's balance, against a real Postgres.
 *
 * ==========================================================================
 * WHAT THIS PROVES THAT THE UNIT TESTS CANNOT
 * ==========================================================================
 * `pack-balance.test.ts` proves the ARITHMETIC. It cannot prove that an
 * appointment inserted with a `pack_instance_id` is actually counted, that a
 * cancellation actually returns the session, or that the counting predicate
 * matches the one the application ships - all three of which are SQL, and all
 * three of which are the parts that would fail silently.
 *
 * IT IMPORTS THE PREDICATE RATHER THAN RESTATING IT, for the reason
 * `followup-selection.db.test.ts` gives at length and
 * `LE-apply-block-expectation-drift` was carded for: a proof written against one
 * version of a rule and never regenerated goes GREEN while asserting the old one.
 *
 * Gated on DATABASE_URL, so `vitest run` with no database stays green.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PACK_CONSUMING_STATUS_SQL, packSessionsAvailable } from "../src/pack-balance";
import { connect, live } from "./rls-harness";

const tenant = randomUUID();
const role = randomUUID();
const user = randomUUID();
const patient = randomUUID();
const location = randomUUID();
const service = randomUUID();
const pack = randomUUID();

/** A pacote of ten with three already spent before 0067 existed. */
const SESSIONS_TOTAL = 10;
const LEGACY_CONSUMED = 3;
const instance = randomUUID();

let sql: Sql;

/** The derived balance, computed the way the application computes it. */
async function derivedAvailable(): Promise<number> {
  const rows = await sql.unsafe(
    `select i.sessions_total, i.legacy_consumed,
            (select count(*)::int from appointments a
              where a.pack_instance_id = i.id and a.${PACK_CONSUMING_STATUS_SQL}) as linked
       from patient_pack_instances i
      where i.id = $1`,
    [instance],
  );
  // THROWS RATHER THAN RETURNING A DEFAULT. A missing instance means the fixture
  // did not seed, and every assertion below would then compare two numbers that
  // are both wrong - the suite would go green over nothing, which is exactly
  // what criterion F on ACC-vacuous-guard-sweep is about.
  const row = rows[0];
  if (!row) throw new Error("fixture instance not found - the suite is asserting nothing");
  return packSessionsAvailable({
    sessionsTotal: row.sessions_total as number,
    legacyConsumed: row.legacy_consumed as number,
    linkedAppointments: row.linked as number,
  });
}

async function addAppointment(status: string, linked: boolean): Promise<string> {
  const id = randomUUID();
  const starts = new Date(`2026-09-0${(Math.floor(Math.random() * 8) % 8) + 1}T09:00:00Z`);
  await sql`insert into appointments
              (id, tenant_id, patient_id, practitioner_id, location_id, service_id,
               starts_at, ends_at, status, pack_instance_id)
            values (${id}, ${tenant}, ${patient}, ${user}, ${location}, ${service},
                    ${starts}, ${new Date(starts.getTime() + 3600000)},
                    ${status}::appointment_status, ${linked ? instance : null})`;
  return id;
}

beforeAll(async () => {
  if (!live) return;
  sql = connect();
  await sql`insert into tenants (id, name, slug) values (${tenant}, 'Pack Balance', ${`pb-${tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name) values (${role}, ${tenant}, 'reception', 'Rececao')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${user}, ${tenant}, ${role}, ${`pb-${user}@example.pt`}, 'Seed Reception')`;
  await sql`insert into patients (id, tenant_id, full_name) values (${patient}, ${tenant}, 'Pack Patient')`;
  await sql`insert into locations (id, tenant_id, name) values (${location}, ${tenant}, 'Seed Clinic')`;
  await sql`insert into services (id, tenant_id, name, duration_min, price_cents)
            values (${service}, ${tenant}, 'Seed Service', 60, 5000)`;
  await sql`insert into service_packs (id, tenant_id, name, base_service_id, session_count, price_cents)
            values (${pack}, ${tenant}, 'Pacote 10', ${service}, ${SESSIONS_TOTAL}, 45000)`;
  await sql`insert into patient_pack_instances
              (id, tenant_id, patient_id, pack_id, sessions_total, sessions_remaining, legacy_consumed)
            values (${instance}, ${tenant}, ${patient}, ${pack}, ${SESSIONS_TOTAL},
                    ${SESSIONS_TOTAL - LEGACY_CONSUMED}, ${LEGACY_CONSUMED})`;
});

afterAll(async () => {
  if (!live) return;
  await sql`delete from appointments where tenant_id = ${tenant}`;
  await sql`delete from patient_pack_instances where tenant_id = ${tenant}`;
  await sql`delete from service_packs where tenant_id = ${tenant}`;
  await sql`delete from patients where tenant_id = ${tenant}`;
  await sql`delete from services where tenant_id = ${tenant}`;
  await sql`delete from locations where tenant_id = ${tenant}`;
  await sql`delete from users where tenant_id = ${tenant}`;
  await sql`delete from roles where tenant_id = ${tenant}`;
  await sql`delete from tenants where id = ${tenant}`;
  await sql.end();
});

describe.skipIf(!live)("RB-02 derived pacote balance (migration 0067)", () => {
  it("starts at the pre-0067 balance, with nothing linked", async () => {
    // THE CASE THE WHOLE MIGRATION EXISTS FOR. A pure derive-from-rows model
    // would say 10 here and silently hand the patient back three sessions they
    // had already used.
    expect(await derivedAvailable()).toBe(SESSIONS_TOTAL - LEGACY_CONSUMED);
  });

  it("a linked scheduled appointment consumes one", async () => {
    await addAppointment("scheduled", true);
    expect(await derivedAvailable()).toBe(SESSIONS_TOTAL - LEGACY_CONSUMED - 1);
  });

  it("an UNLINKED appointment for the same patient consumes NOTHING", async () => {
    // The link is what makes a session a session. Without this arm the suite
    // would pass against a predicate that counted every appointment the patient
    // has, which would drain a pacote on unrelated bookings.
    const before = await derivedAvailable();
    await addAppointment("scheduled", false);
    expect(await derivedAvailable()).toBe(before);
  });

  it("a NO_SHOW consumes one - which is why the consumir button could be deleted", async () => {
    // The under-24h / no-show rule, now a consequence of the data. If this ever
    // stops holding, the clinic silently loses the session it is owed and there
    // is no longer a button to put it right.
    const before = await derivedAvailable();
    await addAppointment("no_show", true);
    expect(await derivedAvailable()).toBe(before - 1);
  });

  it("a CANCELLED appointment returns its session", async () => {
    const before = await derivedAvailable();
    const id = await addAppointment("scheduled", true);
    expect(await derivedAvailable()).toBe(before - 1);
    await sql`update appointments set status = 'cancelled' where id = ${id}`;
    expect(await derivedAvailable()).toBe(before);
  });

  it("never reports a negative balance, however many are linked", async () => {
    // Reachable in practice - re-attending cancelled rows, or a hand-adjusted
    // legacy counter. "Minus one session" is not something a clinic can act on.
    for (let i = 0; i < SESSIONS_TOTAL; i++) await addAppointment("completed", true);
    expect(await derivedAvailable()).toBe(0);
  });
});
