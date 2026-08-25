// PATIENT NUMBER OWNERSHIP - the collision the import was expected to need a
// migration for, and the proof that it does not.
//
// ==========================================================================
// THE RULING, AND WHAT THE DATABASE ACTUALLY DOES
// ==========================================================================
// Owner ruling 2026-08-24: "vendor numbers authoritative and preserved; the
// trigger continues assigning for patients without numero_paciente and all
// future patients; THE IMPORT MIGRATION SEEDS THE PER-TENANT COUNTER/SEQUENCE
// ABOVE MAX IMPORTED numero_paciente to kill collisions."
//
// THERE IS NO COUNTER AND NO SEQUENCE TO SEED. `public.assign_patient_number`
// (0029, redefined SECURITY DEFINER in 0047) computes
//   COALESCE(MAX(patient_number) WHERE tenant_id = NEW.tenant_id, 0) + 1
// LIVE, on every insert, under a per-tenant advisory lock. It is SELF-SEEDING
// by construction: import a patient numbered 9,999 and the very next
// trigger-assigned number is 10,000, with nothing to configure.
//
// So the migration the ruling calls for would have been a no-op against
// production, and these assertions are what establish that rather than an
// argument. They run in the DB-gated required check against real Postgres.
//
// WHAT IS STILL A REAL COLLISION, and no migration fixes it either: a vendor
// number that duplicates a number ALREADY HELD by an existing patient in the
// same tenant. Those rows exist and hold those numbers now; seeding a counter
// would not move them. Asserted below as the case that genuinely fails, so the
// risk is on the record rather than implied.

import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connect, live } from "./rls-harness";

describe.skipIf(!live)("patient_number: vendor numbers vs the assigning trigger", () => {
  let sql: Sql;
  const tenant = randomUUID();

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug) values (${tenant}, 'pn-test', ${`pn-${tenant.slice(0, 8)}`})`;
  });

  afterAll(async () => {
    await sql`delete from patients where tenant_id = ${tenant}`;
    await sql`delete from tenants where id = ${tenant}`;
    await sql.end();
  });

  const insert = (fullName: string, patientNumber?: number) =>
    patientNumber === undefined
      ? sql`insert into patients (tenant_id, full_name) values (${tenant}, ${fullName}) returning patient_number`
      : sql`insert into patients (tenant_id, full_name, patient_number) values (${tenant}, ${fullName}, ${patientNumber}) returning patient_number`;

  it("PRESERVES an explicit vendor number - the trigger stands down", async () => {
    const [row] = await insert("Sintetico Um", 9999);
    expect(Number(row!.patient_number)).toBe(9999);
  });

  it("the NEXT trigger-assigned number is above the imported maximum, with nothing seeded", async () => {
    // This is the whole of what the ruling's migration was meant to achieve.
    // MAX+1 is computed live, so importing 9,999 moves the next number to
    // 10,000 by itself.
    const [row] = await insert("Sintetico Dois");
    expect(Number(row!.patient_number)).toBe(10_000);
  });

  it("keeps assigning for every later patient without a vendor number", async () => {
    const [row] = await insert("Sintetico Tres");
    expect(Number(row!.patient_number)).toBe(10_001);
  });

  it("still preserves a LOWER vendor number imported after a higher one", async () => {
    // Import order is not number order. A vendor number of 5 arriving after
    // 10,001 must survive, and must not drag the counter backwards.
    const [low] = await insert("Sintetico Quatro", 5);
    expect(Number(low!.patient_number)).toBe(5);
    const [next] = await insert("Sintetico Cinco");
    expect(Number(next!.patient_number)).toBe(10_002);
  });

  it("REFUSES a vendor number already held in the same tenant - the collision that is real", async () => {
    // No migration fixes this one: the row holding 9999 already exists. It is
    // the delivery's problem, and the adapter reports it before any import as
    // checks.patientNumberDuplicates.
    await expect(insert("Sintetico Seis", 9999)).rejects.toThrow(/patients_tenant_number_uq|duplicate key/i);
  });

  it("scopes numbering PER TENANT, so one clinic's import cannot move another's", async () => {
    const other = randomUUID();
    await sql`insert into tenants (id, name, slug) values (${other}, 'pn-other', ${`po-${other.slice(0, 8)}`})`;
    try {
      const [row] = await sql`insert into patients (tenant_id, full_name) values (${other}, 'Outro') returning patient_number`;
      expect(Number(row!.patient_number)).toBe(1);
    } finally {
      await sql`delete from patients where tenant_id = ${other}`;
      await sql`delete from tenants where id = ${other}`;
    }
  });
});
