/**
 * 0081's gate — patients.locale and guest_booking_requests.locale.
 *
 * ==========================================================================
 * THE PROPERTY IS "NULL IS A THIRD STATE", AND IT IS NOT A CATALOGUE FACT
 * ==========================================================================
 * The column is trivial. What is not trivial is the rule it exists to carry:
 *
 *   NULL  = nobody has asked this patient
 *   'pt'  = they CHOSE Portuguese
 *   'en'  = they CHOSE English
 *
 * NULL AND 'pt' RENDER IDENTICALLY. `resolveLocale` falls through NULL to the
 * tenant default and then to the platform default, which is pt — so a backfill
 * of NULL to 'pt' changes NOTHING on any screen, passes every visual check, and
 * permanently destroys the only way to find the ~8,400 patients who have never
 * been offered the choice.
 *
 * THAT IS PORTAL-REHYDRATE §1.3 IN A COLUMN: a convenience that maps an unknown
 * case onto a known, harmless-looking one, where the system carries on reporting
 * something reasonable. A test that only asserted `data_type = 'text'` would be
 * green through exactly that mistake. So the assertions below are about
 * BEHAVIOUR — what the database accepts and what it refuses — and one of them
 * asserts a state of the DATA rather than of the schema.
 *
 * ==========================================================================
 * WHY THE REFUSAL IS PROVEN BY MAKING IT FIRE
 * ==========================================================================
 * Reading `pg_constraint` proves a constraint with the right name and the right
 * text exists. It does not prove the database ENFORCES it: a constraint added
 * NOT VALID satisfies the catalogue read and admits the bad row anyway. Only an
 * INSERT that is REFUSED proves enforcement, which is why every arm here writes.
 *
 * Chromium of this suite: it needs a database. `describe.skipIf(!live)` is the
 * repo's convention and DATABASE_URL is what arms it.
 */

import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

describe.skipIf(!live)("0081 patient locale", () => {
  let sql: Sql;
  let tenantId: string;
  /** A real service and location, so the ONLY thing wrong with the guest probe
   *  row is its locale. See the comment on the guest arm. */
  let serviceId: string;
  let locationId: string;

  beforeAll(async () => {
    sql = connect();
    const [t] = await sql<{ id: string }[]>`
      SELECT id FROM public.tenants ORDER BY created_at LIMIT 1`;
    if (!t) throw new Error("no tenant in the database; run the seed first");
    tenantId = t.id;

    const [svc] = await sql<{ id: string }[]>`
      SELECT id FROM public.services WHERE tenant_id = ${t.id} ORDER BY name LIMIT 1`;
    const [loc] = await sql<{ id: string }[]>`
      SELECT id FROM public.locations WHERE tenant_id = ${t.id} ORDER BY name LIMIT 1`;
    if (!svc || !loc) {
      throw new Error(
        "no seeded service or location; the guest arm needs both NOT NULL columns filled " +
          "with real ids, or the INSERT is refused before the locale CHECK is ever reached",
      );
    }
    serviceId = svc.id;
    locationId = loc.id;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  /** A throwaway patient, always cleaned up, never reusing a seeded row. */
  async function withPatient<T>(
    fields: Record<string, unknown>,
    fn: (id: string) => Promise<T>,
  ): Promise<T> {
    const id = randomUUID();
    await sql`INSERT INTO public.patients ${sql({
      id,
      tenant_id: tenantId,
      full_name: `0081 test ${id.slice(0, 8)}`,
      ...fields,
    })}`;
    try {
      return await fn(id);
    } finally {
      await sql`DELETE FROM public.patients WHERE id = ${id}`;
    }
  }

  for (const table of ["patients", "guest_booking_requests"] as const) {
    it(`${table}.locale exists, is nullable text, and carries NO default`, async () => {
      const [col] = await sql<
        { data_type: string; is_nullable: string; column_default: string | null }[]
      >`
        SELECT data_type, is_nullable, column_default
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ${table} AND column_name = 'locale'`;
      expect(col, `${table}.locale is missing`).toBeDefined();
      expect(col!.data_type).toBe("text");
      expect(col!.is_nullable).toBe("YES");
      // A DEFAULT of 'pt' is the backfill arriving one row at a time: every new
      // row would claim a choice nobody made.
      expect(col!.column_default).toBeNull();
    });
  }

  it("accepts NULL, and NULL is what a row gets when nobody asks", async () => {
    await withPatient({}, async (id) => {
      const [row] = await sql<{ locale: string | null }[]>`
        SELECT locale FROM public.patients WHERE id = ${id}`;
      expect(row!.locale).toBeNull();
    });
  });

  it("accepts 'pt' and 'en'", async () => {
    for (const locale of ["pt", "en"] as const) {
      await withPatient({ locale }, async (id) => {
        const [row] = await sql<{ locale: string | null }[]>`
          SELECT locale FROM public.patients WHERE id = ${id}`;
        expect(row!.locale).toBe(locale);
      });
    }
  });

  /**
   * Assert an INSERT is REFUSED, and clean up if it is not.
   *
   * THE finally IS NOT DEFENSIVE PROGRAMMING, IT IS A LESSON. The first version
   * of this file inserted directly and relied on the refusal to leave nothing
   * behind. Running the negative arm — dropping the constraint to prove these
   * tests can go red — inserted the bad rows for real, and the constraint could
   * then not be re-added at all: "check constraint is violated by some row".
   * The test that proves a guard works must not be the thing that breaks the
   * database when the guard is missing, which is exactly the case it exists for.
   */
  async function refused(
    table: "patients" | "guest_booking_requests",
    row: Record<string, unknown>,
    pattern: RegExp,
    label: string,
  ): Promise<void> {
    const id = randomUUID();
    try {
      await expect(
        table === "patients"
          ? sql`INSERT INTO public.patients ${sql({ id, tenant_id: tenantId, ...row })}`
          : sql`INSERT INTO public.guest_booking_requests ${sql({ id, tenant_id: tenantId, ...row })}`,
        label,
      ).rejects.toThrow(pattern);
      // AND IT LEFT NOTHING BEHIND. A refused write that half-committed would be
      // a worse defect than the one this guards.
      const [gone] = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM public.patients WHERE id = ${id}`;
      expect(gone!.n).toBe("0");
    } finally {
      await sql`DELETE FROM public.patients WHERE id = ${id}`;
      await sql`DELETE FROM public.guest_booking_requests WHERE id = ${id}`;
    }
  }

  it("REFUSES a third value, on both tables, by firing the constraint", async () => {
    // THE ARM THAT MATTERS. Not `SELECT ... FROM pg_constraint`: that would pass
    // against a NOT VALID constraint that admits the row.
    await refused(
      "patients",
      { full_name: "0081 must not exist", locale: "fr" },
      /patients_locale_check/,
      "patients accepted locale 'fr'",
    );
    // EVERY NOT-NULL COLUMN IS FILLED WITH A REAL ID, AND THAT IS THE WHOLE
    // POINT OF THIS ARM RATHER THAN A CONVENIENCE.
    //
    // The first version of this test left `service_id` null. The INSERT was
    // refused — by the NOT NULL constraint, before the locale CHECK was ever
    // evaluated — and `.rejects.toThrow()` was satisfied. The arm was GREEN
    // while testing nothing it claimed to test, and an earlier draft of the
    // pattern (`/locale_check|null value|violates/`) would have kept it green
    // forever. The regex is pinned to the constraint NAME for that reason: a
    // refusal is only evidence when it is the refusal you asked for.
    await refused(
      "guest_booking_requests",
      {
        full_name: "0081 must not exist",
        phone: "+351910000000",
        service_id: serviceId,
        location_id: locationId,
        requested_starts_at: new Date(),
        requested_ends_at: new Date(),
        locale: "de",
      },
      /guest_booking_requests_locale_check/,
      "guest_booking_requests accepted locale 'de'",
    );
  });

  it("case matters: 'PT' and 'EN' are refused, so nothing normalises silently", async () => {
    // If a writer upper-cases a locale it must FAIL, not be quietly accepted and
    // then miss every `= 'pt'` comparison downstream.
    for (const bad of ["PT", "EN", "pt-PT", "en_GB", ""]) {
      await refused(
        "patients",
        { full_name: "0081 must not exist", locale: bad },
        /patients_locale_check/,
        `patients accepted locale ${JSON.stringify(bad)}`,
      );
    }
  });

  it("NO EXISTING PATIENT HAS BEEN BACKFILLED: every pre-0081 row is still NULL", async () => {
    // THE DATA ASSERTION, and it is the one a schema test cannot make. It runs
    // against whatever database it is pointed at, so on a lane it proves the
    // migration wrote nothing and on a production-shaped copy it would prove the
    // same thing about the real rows.
    //
    // It excludes this file's own throwaway rows by name, because a test that
    // asserted a global zero would race the arms above under parallel vitest.
    const [row] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n
        FROM public.patients
       WHERE locale IS NOT NULL
         AND full_name NOT LIKE '0081 %'`;
    expect(row!.n).toBe("0");
  });
});
