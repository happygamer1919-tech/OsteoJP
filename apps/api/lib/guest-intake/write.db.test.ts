/**
 * INTAKE-01 - the guest write against a REAL Postgres, in whichever state the
 * database is in.
 *
 * TWO ARMS, AND THE DATABASE PICKS ONE AT COLLECTION TIME. 0087 is HELD: the
 * app half merges first and the owner applies the table later. So a database
 * built from supabase/migrations - CI's, today - has no guest_clinical_intakes,
 * and one with the contract applied has it.
 *
 *   0087 NOT APPLIED  the INERT arm: the detector answers false against the
 *                     real catalogue (and true for a table of that name, as a
 *                     negative control, inside a rolled-back transaction), and a
 *                     booking without an intake writes exactly as before.
 *   0087 APPLIED      the WITH-TABLE arm: the request and its intake commit in
 *                     one transaction with the consent set server-side, a failed
 *                     intake leaves no request behind, and a booking without an
 *                     intake still books.
 *
 * WHY THE ARMS ARE REGISTERED, NOT SKIPPED. `.github/scripts/assert-rls-executed.mjs`
 * reddens the required DB-gated check for any suite with a test that did not
 * run, unless it is listed in PERMITTED_SKIPS (empty, deliberately). A
 * `describe.skip` for the arm that does not apply would therefore fail CI. So
 * only the arm that applies is registered, and every registered test runs. When
 * 0087 merges, CI's database gains the table and runs the with-table arm with no
 * edit to this file.
 *
 * WITHOUT DATABASE_URL (the unit job) both arms are `describe.skip`, as every
 * DB-gated suite in this repository is.
 *
 * SHARED DATABASE: parallel files share it, so every assertion is about rows
 * this file created, found by its own tenant id - never a global count.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);

/** Asked ONCE, before any test is registered. */
async function tableExistsNow(): Promise<boolean> {
  if (!live) return false;
  const { getDbAdmin } = await import("@osteojp/db");
  const rows = (await getDbAdmin().execute(
    raw`select to_regclass('public.guest_clinical_intakes') is not null as present`,
  )) as unknown as Array<{ present: boolean }>;
  return rows[0]?.present === true;
}
const TABLE_PRESENT = await tableExistsNow();

const dLive = live ? describe : describe.skip;

type Db = ReturnType<typeof import("@osteojp/db").getDbAdmin>;

/** A tenant, a location and a service of this file's own, and their cleanup. */
function fixtures() {
  const tenant = randomUUID();
  const location = randomUUID();
  const service = randomUUID();
  let db: Db;

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'intake-a', ${"intake-a-" + tenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${location}::uuid, ${tenant}::uuid, 'Clinica Intake')`,
    );
    await db.execute(
      raw`insert into services (id, tenant_id, name, duration_min, price_cents)
          values (${service}::uuid, ${tenant}::uuid, 'Osteopatia', 45, 4500)`,
    );
  });

  afterAll(async () => {
    if (!db) return;
    // ON DELETE CASCADE takes any intake rows with their requests, which is also
    // why this cleanup never names guest_clinical_intakes: in the inert arm the
    // table does not exist and a statement naming it would fail.
    await db.execute(raw`delete from guest_booking_requests where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from services where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  const request = (fullName: string) => ({
    tenantId: tenant,
    fullName,
    phone: "+351912345678",
    serviceId: service,
    locationId: location,
    practitionerId: null,
    requestedStartsAt: new Date("2026-10-01T08:00:00Z"),
    requestedEndsAt: new Date("2026-10-01T12:00:00Z"),
    sourceIpHash: null,
  });

  const requestIdsNamed = async (fullName: string): Promise<string[]> => {
    const rows = (await db.execute(
      raw`select id from guest_booking_requests where tenant_id = ${tenant}::uuid and full_name = ${fullName}`,
    )) as unknown as Array<{ id: string }>;
    return rows.map((r) => r.id);
  };

  return { tenant, request, requestIdsNamed, db: () => db };
}

if (!live || !TABLE_PRESENT) {
  dLive("0087 NOT APPLIED on this database: the intake path is inert (the with-table arm registers once 0087 is applied)", () => {
    const f = fixtures();

    beforeEach(async () => {
      const { resetGuestIntakeSchemaCache } = await import("@osteojp/db");
      resetGuestIntakeSchemaCache();
    });

    it("the detector answers FALSE against the real catalogue", async () => {
      const { guestIntakeSchemaPresent } = await import("@osteojp/db");
      expect(await guestIntakeSchemaPresent(f.db())).toBe(false);
    });

    it("NEGATIVE CONTROL: it answers TRUE for a table of that name (created in a transaction that is rolled back)", async () => {
      // Without this, the test above passes against a detector that always says
      // false. DDL is transactional in Postgres, so the table never exists for
      // any other session and nothing is left behind.
      const { guestIntakeSchemaPresent, resetGuestIntakeSchemaCache } = await import("@osteojp/db");
      const ROLLBACK = new Error("rollback-on-purpose");
      let seen: boolean | null = null;
      await expect(
        f.db().transaction(async (tx) => {
          await tx.execute(raw`create table public.guest_clinical_intakes (id int)`);
          seen = await guestIntakeSchemaPresent(tx);
          throw ROLLBACK;
        }),
      ).rejects.toBe(ROLLBACK);
      expect(seen).toBe(true);
      resetGuestIntakeSchemaCache();
      expect(await guestIntakeSchemaPresent(f.db())).toBe(false);
    });

    it("a booking WITHOUT an intake writes exactly one request, as it did before INTAKE-01", async () => {
      const { writeGuestBooking } = await import("./write");
      const name = `inert-${randomUUID()}`;
      await writeGuestBooking(f.db(), f.request(name), null);
      expect(await f.requestIdsNamed(name)).toHaveLength(1);
    });
  });
}

if (!live || TABLE_PRESENT) {
  dLive("0087 APPLIED on this database: the request and its intake are one write", () => {
    const f = fixtures();
    const INTAKE = {
      dateOfBirth: "1985-03-02",
      reason: "Dor lombar",
      healthConditions: "Hipertensao",
      medication: null,
      fallsAccidents: null,
      surgeries: "Apendicectomia",
      pacemaker: "sim" as const,
      pregnancy: "nao" as const,
      consentVersion: "rgpd-intake-2026-09-11" as const,
    };

    type IntakeRow = {
      tenant_id: string;
      date_of_birth: string;
      reason: string;
      health_conditions: string | null;
      medication: string | null;
      falls_accidents: string | null;
      surgeries: string | null;
      pacemaker: string;
      pregnancy: string;
      consent_ticked: boolean;
      consent_version: string;
      consent_is_request_time: boolean;
    };

    const intakeFor = async (requestId: string): Promise<IntakeRow[]> =>
      (await f.db().execute(raw`
        select i.tenant_id, i.date_of_birth::text as date_of_birth, i.reason, i.health_conditions,
               i.medication, i.falls_accidents, i.surgeries, i.pacemaker::text as pacemaker,
               i.pregnancy::text as pregnancy, i.consent_ticked, i.consent_version,
               (i.consent_at = r.created_at) as consent_is_request_time
          from guest_clinical_intakes i
          join guest_booking_requests r on r.id = i.guest_booking_request_id
         where i.guest_booking_request_id = ${requestId}::uuid
           and i.tenant_id = ${f.tenant}::uuid
      `)) as unknown as IntakeRow[];

    it("the detector answers TRUE", async () => {
      const { guestIntakeSchemaPresent, resetGuestIntakeSchemaCache } = await import("@osteojp/db");
      resetGuestIntakeSchemaCache();
      expect(await guestIntakeSchemaPresent(f.db())).toBe(true);
    });

    it("writes the request and ONE intake row, with the consent set by the server", async () => {
      const { writeGuestBooking } = await import("./write");
      const name = `with-${randomUUID()}`;
      await writeGuestBooking(f.db(), f.request(name), INTAKE);

      const ids = await f.requestIdsNamed(name);
      expect(ids).toHaveLength(1);
      const rows = await intakeFor(ids[0]!);
      expect(rows).toEqual([
        {
          tenant_id: f.tenant,
          date_of_birth: "1985-03-02",
          reason: "Dor lombar",
          health_conditions: "Hipertensao",
          medication: null,
          falls_accidents: null,
          surgeries: "Apendicectomia",
          pacemaker: "sim",
          pregnancy: "nao",
          consent_ticked: true,
          consent_version: "rgpd-intake-2026-09-11",
          // consent_at is now() of the SAME transaction that created the
          // request: equal to the request's created_at to the microsecond. Two
          // transactions could not produce that.
          consent_is_request_time: true,
        },
      ]);
    });

    it("ONE TRANSACTION: an intake the table refuses leaves NO request behind", async () => {
      const { writeGuestBooking } = await import("./write");
      const name = `rollback-${randomUUID()}`;
      // 2001 characters: 0087's CHECK refuses it. The route's validator would
      // refuse it first; this bypasses the validator on purpose, to reach the
      // database's refusal and prove what it does to the request row.
      const tooLong = { ...INTAKE, reason: "x".repeat(2001) };
      await expect(writeGuestBooking(f.db(), f.request(name), tooLong)).rejects.toBeTruthy();
      expect(await f.requestIdsNamed(name)).toEqual([]);
    });

    it("THE CONTROL: the same request with a valid intake does commit", async () => {
      // Without this, the test above passes against a write that never commits.
      const { writeGuestBooking } = await import("./write");
      const name = `rollback-control-${randomUUID()}`;
      await writeGuestBooking(f.db(), f.request(name), INTAKE);
      expect(await f.requestIdsNamed(name)).toHaveLength(1);
    });

    it("a booking WITHOUT an intake still books, and has no intake row (a stale portal must not break booking)", async () => {
      const { writeGuestBooking } = await import("./write");
      const name = `no-intake-${randomUUID()}`;
      await writeGuestBooking(f.db(), f.request(name), null);
      const ids = await f.requestIdsNamed(name);
      expect(ids).toHaveLength(1);
      expect(await intakeFor(ids[0]!)).toEqual([]);
    });
  });
}
