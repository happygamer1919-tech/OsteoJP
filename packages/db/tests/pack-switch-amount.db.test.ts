/**
 * 0083's gate — patient_pack_instances.switch_amount_cents / switch_reason.
 *
 * ==========================================================================
 * THE PROPERTY IS "WHAT A HUMAN STATED", AND EVERY ARM HERE IS ABOUT THE
 * DIFFERENCE BETWEEN NOTHING AND ZERO
 * ==========================================================================
 * The columns are trivial. The rule they carry is not:
 *
 *   NULL / NULL  = this instance was never switched
 *   0    + why   = a goodwill upgrade. NOTHING WAS CHARGED, and somebody said so
 *   1500 + why   = fifteen euros, and somebody said so
 *
 * NULL AND 0 ARE NOT THE SAME FACT. Strategy's ruling turns on precisely that:
 * "zero is accepted while missing is refused", because collapsing "nothing was
 * charged" into "nobody said" would lose the distinction the whole ruling is
 * about. A `> 0` check, or a DEFAULT of 0, would erase it silently — both are
 * one character, and both would pass a review that only read the column type.
 *
 * ==========================================================================
 * WHY THE REFUSALS ARE PROVEN BY MAKING THEM FIRE
 * ==========================================================================
 * Reading `pg_constraint` proves a constraint with the right name exists. It
 * does not prove the database ENFORCES it: a constraint added NOT VALID
 * satisfies the catalogue read and admits the bad row anyway. Only a write that
 * is REFUSED proves enforcement, so every negative arm below writes.
 *
 * THE FIXTURE IS BUILT, NEVER BORROWED. The CI DB-gated database is
 * `supabase db reset` plus `supabase/seed.sql` and nothing else — no services,
 * no locations, no packs. A suite that took `service_packs LIMIT 1` would be
 * green on a lane and red on CI, which is the lesson patient-locale.db.test.ts
 * learned twice.
 */

import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

describe.skipIf(!live)("0083 pacote switch amount", () => {
  let sql: Sql;
  let tenantId: string;
  let patientId: string;
  let packId: string;

  beforeAll(async () => {
    sql = connect();
    const suffix = randomUUID().slice(0, 8);

    const [t] = await sql<{ id: string }[]>`
      INSERT INTO public.tenants (name, slug)
      VALUES (${`0083 pack fixture ${suffix}`}, ${`t0083-${suffix}`})
      RETURNING id`;
    tenantId = t!.id;

    const [svc] = await sql<{ id: string }[]>`
      INSERT INTO public.services (tenant_id, name)
      VALUES (${tenantId}, ${`0083 svc ${suffix}`})
      RETURNING id`;

    const [pack] = await sql<{ id: string }[]>`
      INSERT INTO public.service_packs (tenant_id, base_service_id, name, session_count, price_cents)
      VALUES (${tenantId}, ${svc!.id}, ${`0083 pacote ${suffix}`}, 10, 15000)
      RETURNING id`;
    packId = pack!.id;

    const [p] = await sql<{ id: string }[]>`
      INSERT INTO public.patients (tenant_id, full_name)
      VALUES (${tenantId}, ${`0083 utente ${suffix}`})
      RETURNING id`;
    patientId = p!.id;

    if (!tenantId || !packId || !patientId) {
      throw new Error("the 0083 fixture did not build; the arms below would test nothing");
    }
  });

  afterAll(async () => {
    // ONE DELETE AND THE CASCADE DOES THE REST. vitest runs test FILES in
    // parallel against ONE database, so this file must never touch a row it did
    // not create and must never leave one behind.
    if (!sql) return;
    if (tenantId) await sql`DELETE FROM public.tenants WHERE id = ${tenantId}`;
    await sql.end({ timeout: 5 });
  });

  /** A throwaway instance, always cleaned up. */
  async function withInstance<T>(
    fields: Record<string, unknown>,
    fn: (id: string) => Promise<T>,
  ): Promise<T> {
    const id = randomUUID();
    await sql`INSERT INTO public.patient_pack_instances ${sql({
      id,
      tenant_id: tenantId,
      patient_id: patientId,
      pack_id: packId,
      sessions_total: 10,
      sessions_remaining: 10,
      ...fields,
    })}`;
    try {
      return await fn(id);
    } finally {
      await sql`DELETE FROM public.patient_pack_instances WHERE id = ${id}`;
    }
  }

  /**
   * Assert a write is REFUSED, and clean up if it is not.
   *
   * THE finally IS A LESSON, NOT DEFENSIVE PROGRAMMING. 0081's suite learned it:
   * running the negative arm — dropping a constraint to prove these tests can go
   * red — inserts the bad rows FOR REAL, and the constraint then cannot be
   * re-added at all ("check constraint is violated by some row"). The test that
   * proves a guard works must not break the database in the one case it exists
   * for.
   */
  async function refused(
    fields: Record<string, unknown>,
    pattern: RegExp,
    label: string,
  ): Promise<void> {
    const id = randomUUID();
    try {
      await expect(
        sql`INSERT INTO public.patient_pack_instances ${sql({
          id,
          tenant_id: tenantId,
          patient_id: patientId,
          pack_id: packId,
          sessions_total: 10,
          sessions_remaining: 10,
          ...fields,
        })}`,
        label,
      ).rejects.toThrow(pattern);
      const [gone] = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM public.patient_pack_instances WHERE id = ${id}`;
      expect(gone!.n, `${label}: a refused write left a row behind`).toBe("0");
    } finally {
      await sql`DELETE FROM public.patient_pack_instances WHERE id = ${id}`;
    }
  }

  /* ---------------- the shape of the columns ---------------- */

  for (const [column, type] of [
    ["switch_amount_cents", "integer"],
    ["switch_reason", "text"],
  ] as const) {
    it(`${column} exists, is nullable ${type}, and carries NO DEFAULT`, async () => {
      const [col] = await sql<
        { data_type: string; is_nullable: string; column_default: string | null }[]
      >`
        SELECT data_type, is_nullable, column_default
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'patient_pack_instances'
           AND column_name = ${column}`;
      expect(col, `patient_pack_instances.${column} is missing`).toBeDefined();
      expect(col!.data_type).toBe(type);
      expect(col!.is_nullable).toBe("YES");
      // THE ABSENCE OF A DEFAULT IS THE FIRST STAMPED CONSTRAINT. "The amount is
      // an input, never a pre-filled default that was accepted" — a DEFAULT here
      // would make every new row claim a statement nobody made, and the row
      // could not afterwards tell "reception agreed" from "reception did not
      // look". One word, invisible in review, so it is asserted.
      expect(col!.column_default).toBeNull();
    });
  }

  /* ---------------- what is ACCEPTED ---------------- */

  it("accepts NEITHER — and that is every instance that was never switched", async () => {
    await withInstance({}, async (id) => {
      const [row] = await sql<{ a: number | null; r: string | null }[]>`
        SELECT switch_amount_cents AS a, switch_reason AS r
          FROM public.patient_pack_instances WHERE id = ${id}`;
      expect(row!.a).toBeNull();
      expect(row!.r).toBeNull();
    });
  });

  it("ACCEPTS ZERO with a reason — a goodwill upgrade is a real commercial act", async () => {
    // THE ARM THAT MATTERS MOST. `> 0` instead of `>= 0` is one character and
    // would refuse exactly the case the ruling names.
    await withInstance({ switch_amount_cents: 0, switch_reason: "cortesia" }, async (id) => {
      const [row] = await sql<{ a: number | null }[]>`
        SELECT switch_amount_cents AS a FROM public.patient_pack_instances WHERE id = ${id}`;
      expect(row!.a).toBe(0);
    });
  });

  it("accepts an amount with a reason, and stores the cents unrounded", async () => {
    await withInstance(
      { switch_amount_cents: 1500, switch_reason: "diferenca do pacote 5 para 10" },
      async (id) => {
        const [row] = await sql<{ a: number; r: string }[]>`
          SELECT switch_amount_cents AS a, switch_reason AS r
            FROM public.patient_pack_instances WHERE id = ${id}`;
        expect(row!.a).toBe(1500);
        expect(row!.r).toBe("diferenca do pacote 5 para 10");
      },
    );
  });

  it("zero and NULL are distinguishable AFTER the write, which is the whole point", async () => {
    await withInstance({ switch_amount_cents: 0, switch_reason: "cortesia" }, async (zero) => {
      await withInstance({}, async (none) => {
        const rows = await sql<{ id: string; a: number | null }[]>`
          SELECT id, switch_amount_cents AS a
            FROM public.patient_pack_instances WHERE id IN (${zero}, ${none})`;
        const byId = new Map(rows.map((r) => [r.id, r.a]));
        expect(byId.get(zero)).toBe(0);
        expect(byId.get(none)).toBeNull();
        // A reader can tell "nothing was charged" from "nobody said". If a
        // DEFAULT or a NOT NULL ever lands, this is the assertion that reddens.
        expect(byId.get(zero)).not.toBe(byId.get(none));
      });
    });
  });

  /* ---------------- what is REFUSED ---------------- */

  it("REFUSES a negative amount — a refund is not a switch charge", async () => {
    await refused(
      { switch_amount_cents: -1, switch_reason: "reembolso" },
      /switch_amount_nonneg/,
      "negative amount",
    );
  });

  it("REFUSES an amount with no reason — a number nobody can audit", async () => {
    await refused(
      { switch_amount_cents: 1500 },
      /switch_amount_and_reason_together/,
      "amount without reason",
    );
  });

  it("REFUSES a reason with no amount — a story with no settlement", async () => {
    await refused(
      { switch_reason: "o utente pediu para mudar" },
      /switch_amount_and_reason_together/,
      "reason without amount",
    );
  });

  it("REFUSES an EMPTY reason — '' is 'nobody said' wearing the clothes of 'somebody said'", async () => {
    await refused(
      { switch_amount_cents: 1500, switch_reason: "" },
      /switch_reason_nonblank/,
      "empty reason",
    );
  });

  it("REFUSES a WHITESPACE-ONLY reason, which is the same fact one keystroke along", async () => {
    await refused(
      { switch_amount_cents: 1500, switch_reason: "   " },
      /switch_reason_nonblank/,
      "whitespace reason",
    );
  });

  /* ---------------- and it did not disturb the table it landed on ---------- */

  it("the pre-0083 columns still enforce their own rules", async () => {
    // A migration that adds columns should change nothing else. If ADD COLUMN
    // had somehow rebuilt the table without its checks, this is where it shows.
    await refused(
      { sessions_total: 10, sessions_remaining: 11 },
      /remaining_range/,
      "sessions_remaining above sessions_total",
    );
  });
});
