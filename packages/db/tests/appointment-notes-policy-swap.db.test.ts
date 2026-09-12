/**
 * appointment-notes-policy-swap.db.test.ts — WHICH LAYER IS ACTUALLY HOLDING?
 *
 * ==========================================================================
 * WHAT A POLICY SWAP PROVES THAT A NORMAL RLS TEST CANNOT
 * ==========================================================================
 * The existing suites (`appointment-notes-nullable-rls`,
 * `cross-tenant-rls-isolation`) assert WHAT THE POLICY ALLOWS: run as a
 * principal, do a thing, check the outcome. What they cannot show is WHICH of
 * the overlapping protections produced that outcome, because on any given query
 * they agree.
 *
 * `appointment_notes` has at least three:
 *   1. the RLS policy's `tenant_id = jwt_tenant_id()`,
 *   2. the application's `runScoped` transaction, which sets the claims,
 *   3. the caller's own WHERE clauses.
 *
 * A test passes if ANY ONE of them holds. THIS FILE TAKES ONE AWAY AND LOOKS.
 *
 * The project already has the finding one table over:
 * `location-scope-classes.db.test.ts` records that removing the app-layer
 * predicate from all four `patients` compositions left every assertion green,
 * because 0073's `patients_select` produced the identical set on its own. That
 * is not a hole in the test - it is the shape of a defence-in-depth system, and
 * it is invisible until you remove a layer.
 *
 * ==========================================================================
 * THE ONE THAT IS NOT A CONFIRMATION: THE DELETE POLICY, AND 0084
 * ==========================================================================
 * Until 0084, `appointment_notes` had SELECT (0026), INSERT (0026) and UPDATE
 * (0050) policies and NO DELETE POLICY, and that absence WAS the append-only
 * design - 0026: "append-only is enforced by the missing UPDATE/DELETE
 * policies, NOT by grant carve-outs - keep the full DML grant so UPDATE/DELETE
 * deny as 0 rows via RLS in every environment."
 *
 * 0084 reverses that for the 2026-09-10 clinic batch: a tenant-scoped DELETE
 * policy, `appointment_notes_tenant_delete`. The grant is unchanged, so every
 * refusal that remains is still ZERO ROWS rather than a permission error. What
 * changes is the question. Before 0084 it was "what is the missing policy
 * preventing" (everything, and one line would undo it). Now the tenant
 * predicate in 0084's USING is the ONLY thing between a principal and another
 * clinic's notes, and the DELETE swaps below remove each layer in turn to show
 * exactly that, which is the only question the existing suites structurally
 * cannot ask.
 *
 * ==========================================================================
 * WHAT THIS FILE IS NOT
 * ==========================================================================
 * It is the BUILDABLE-NOW half of the harness in
 * docs/reports/REPORT-appointment-notes-policy-swap-harness.md. The other half
 * needs a RESTORED COPY of production - row counts, whether any row is already
 * cross-tenant, and the per-row cost of `jwt_tenant_id()` in the USING clause -
 * and a restore is an owner action. On a lane every one of those is a fixture,
 * so measuring them here would be measuring the fixture.
 *
 * ==========================================================================
 * EVERY SWAP IS ROLLED BACK, AND THAT IS NOT A CONVENIENCE
 * ==========================================================================
 * `swapped()` runs DDL and assertions inside ONE transaction that always rolls
 * back, on BOTH paths. Postgres takes DDL in a transaction, so a dropped policy
 * is restored by the rollback rather than by a cleanup step that can be skipped.
 * The 0081 DB-gated test learned the other way round: its negative arm inserted
 * bad rows for real and the constraint could then not be re-added at all.
 */
import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimsFor, connect, live } from "./rls-harness";

const A = { tenant: randomUUID(), patient: randomUUID(), note: randomUUID() };
const B = { tenant: randomUUID(), patient: randomUUID(), note: randomUUID() };

/** Rolled back on every path; see the header. */
class Rollback<T> {
  constructor(readonly value: T) {}
}

/**
 * Run `fn` as `authenticated` under tenant A's claims, with `ddl` applied first.
 * ALWAYS rolls back - the policy set is restored by the rollback itself.
 *
 * `ddl` is a fixed array of literals written in this file. It is never built
 * from a value and never reaches a parameter, which is why `.unsafe()` here has
 * no injection surface.
 */
async function swapped<T>(
  sql: Sql,
  ddl: readonly string[],
  claims: string,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  try {
    await sql.begin(async (tx) => {
      for (const stmt of ddl) await tx.unsafe(stmt);
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      const value = await fn(tx);
      throw new Rollback(value);
    });
    throw new Error("unreachable: the swap transaction committed");
  } catch (err) {
    if (err instanceof Rollback) return err.value as T;
    throw err;
  }
}

const visibleIds = async (tx: TransactionSql): Promise<string[]> => {
  const rows = await tx<{ id: string }[]>`
    select id from appointment_notes where id in (${A.note}, ${B.note}) order by id`;
  return rows.map((r) => r.id).sort();
};

describe.skipIf(!live)("appointment_notes — which layer is holding (policy swap)", () => {
  let sql: Sql;
  const claimsA = claimsFor(A.tenant);

  beforeAll(async () => {
    sql = connect();
    for (const t of [A, B]) {
      await sql`insert into tenants (id, name, slug)
                values (${t.tenant}, 'Swap', ${`swap-${t.tenant}`})`;
      await sql`insert into patients (id, tenant_id, full_name)
                values (${t.patient}, ${t.tenant}, 'Paciente Swap')`;
      await sql`insert into appointment_notes (id, tenant_id, patient_id, appointment_id, author_user_id, body)
                values (${t.note}, ${t.tenant}, ${t.patient}, null, null, 'nota sintetica')`;
    }
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from appointment_notes where tenant_id in (${A.tenant}, ${B.tenant})`;
    await sql`delete from patients where tenant_id in (${A.tenant}, ${B.tenant})`;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  /* ================================================================== */
  /* THE CONTROLS FIRST. A swap that changes nothing and a harness that  */
  /* is not executing the swap look identical.                           */
  /* ================================================================== */

  it("CONTROL 1: unswapped, tenant A sees its own note and NOT tenant B's", async () => {
    const seen = await swapped(sql, [], claimsA, visibleIds);
    expect(seen).toEqual([A.note]);
  });

  it("CONTROL 2: the swap MACHINERY works — USING (false) hides even A's own note", async () => {
    // If this does not redden the read, the harness is not reaching the policy
    // at all and every verdict below is meaningless.
    const seen = await swapped(
      sql,
      [
        `drop policy "appointment_notes_tenant_select" on public.appointment_notes`,
        `create policy "appointment_notes_tenant_select" on public.appointment_notes
           for select to authenticated using (false)`,
      ],
      claimsA,
      visibleIds,
    );
    expect(seen).toEqual([]);
  });

  it("CONTROL 3: the rollback restored the policy — the unswapped read is unchanged", async () => {
    // Ordered AFTER control 2 on purpose. A swap that leaked would leave the
    // table with `using (false)` and this would return nothing.
    const seen = await swapped(sql, [], claimsA, visibleIds);
    expect(seen).toEqual([A.note]);
  });

  /* ================================================================== */
  /* THE SWAPS THAT ASK WHICH LAYER IS HOLDING.                          */
  /* ================================================================== */

  it("the SELECT policy is the ONLY thing keeping tenant B's note out of an unfiltered read", async () => {
    // ==================================================================
    // THE MEASUREMENT, NOT AN ASSUMPTION
    // ==================================================================
    // Replace the tenant predicate with `true` and read WITHOUT a tenant filter,
    // exactly as a caller that forgot one would. Both notes appear.
    //
    // WHAT IT ESTABLISHES: nothing else in the database is holding the READ.
    // There is no second predicate, no view, no trigger. The policy is
    // load-bearing and alone here, so any change to it is a tenant-isolation
    // change and must be treated as one.
    //
    // AND IT GUARDS MORE THAN READS, which the next test measures: because
    // `INSERT ... RETURNING` reads the row back, this policy also refuses a
    // cross-tenant WRITE that uses RETURNING - even with the INSERT policy
    // wide open.
    const seen = await swapped(
      sql,
      [
        `drop policy "appointment_notes_tenant_select" on public.appointment_notes`,
        `create policy "appointment_notes_tenant_select" on public.appointment_notes
           for select to authenticated using (true)`,
      ],
      claimsA,
      visibleIds,
    );
    expect(seen).toEqual([A.note, B.note].sort());
  });

  it("TWO layers stop a cross-tenant write, and WHICH one depends on `RETURNING`", async () => {
    // ==================================================================
    // THIS TEST ASSERTED SOMETHING FALSE ON ITS FIRST RUN, AND THE SWAP IS
    // WHAT FOUND IT. That is the entire argument for the harness.
    // ==================================================================
    // The claim was "the INSERT policy is the only thing stopping a note being
    // written into another tenant". Swapping it to `WITH CHECK (true)` and
    // writing anyway STILL FAILED - so the claim was wrong and something else
    // was holding.
    //
    // WHAT IS HOLDING: `INSERT ... RETURNING` reads the row back, and the read
    // is subject to the SELECT policy. A row written into tenant B is invisible
    // to tenant A's claims, so the RETURNING is refused with "new row violates
    // row-level security policy" - which reads exactly like the INSERT policy
    // refusing, and is not.
    //
    // IT IS THE SAME MECHANISM 0047's HEADER DOCUMENTS FOR `patients`, pointing
    // the other way. There it BROKE creation: a SECURITY DEFINER helper that
    // re-queried `patients` could not see the just-inserted row, so
    // createPatient's RETURNING was rejected. Here the same coupling protects.
    //
    // SO THE REAL SHAPE IS: a caller that writes WITHOUT `RETURNING` is guarded
    // by the INSERT policy ALONE. A caller that uses `RETURNING` is guarded by
    // both, and would survive the INSERT policy being weakened. Both arms are
    // asserted below because a future change to either policy moves a different
    // one of them, and a single-arm test would report the wrong culprit.
    const insertPermissive = [
      `drop policy "appointment_notes_tenant_insert" on public.appointment_notes`,
      `create policy "appointment_notes_tenant_insert" on public.appointment_notes
         for insert to authenticated with check (true)`,
    ];

    // UNSWAPPED: refused, as it must be.
    await expect(
      swapped(sql, [], claimsA, async (tx) => {
        await tx`insert into appointment_notes (tenant_id, patient_id, body)
                 values (${B.tenant}, ${B.patient}, 'escrita cruzada')`;
      }),
    ).rejects.toThrow(/row-level security/i);

    // ARM 1 - INSERT policy permissive, NO `RETURNING`. THE WRITE LANDS.
    // This is the arm that proves the INSERT policy was doing real work.
    const landed = await swapped(sql, insertPermissive, claimsA, async (tx) => {
      await tx`insert into appointment_notes (tenant_id, patient_id, body)
               values (${B.tenant}, ${B.patient}, 'escrita cruzada')`;
      // Counted on the OWNER's behalf inside the same transaction would be
      // wrong - the role is `authenticated` here and it cannot see tenant B.
      // The write not throwing IS the observation.
      return true;
    });
    expect(landed).toBe(true);

    // ARM 2 - the same swap, WITH `RETURNING`. STILL REFUSED, by the SELECT
    // policy. If this ever starts landing, the SELECT policy has been widened.
    await expect(
      swapped(sql, insertPermissive, claimsA, async (tx) => {
        await tx`insert into appointment_notes (tenant_id, patient_id, body)
                 values (${B.tenant}, ${B.patient}, 'escrita cruzada')
                 returning id`;
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  /* ================================================================== */
  /* THE ONE WORTH BUILDING THE HARNESS FOR.                             */
  /* ================================================================== */

  it("DELETE lands in-tenant (0084) and denies CROSS-TENANT as ZERO ROWS, not as an error — the grant is deliberately full", async () => {
    // 0084 lets a principal delete its OWN tenant's note. The refusal of
    // ANOTHER tenant's note must still be SILENT and ROW-SHAPED, 0026's design.
    // A permission error here would mean somebody carved the grant, and the
    // isolation would then depend on the grant rather than on the policy set - a
    // different mechanism with different failure modes.
    const own = await swapped(sql, [], claimsA, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        delete from appointment_notes where id = ${A.note} returning id`;
      return rows.length;
    });
    expect(own, "0084: a principal deletes its own tenant's note").toBe(1);

    const cross = await swapped(sql, [], claimsA, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        delete from appointment_notes where id = ${B.note} returning id`;
      return rows.length;
    });
    expect(cross, "another tenant's note is refused as zero rows").toBe(0);

    // And the grant really is full, read rather than inferred.
    const grant = await sql<{ has: boolean }[]>`
      select has_table_privilege('authenticated', 'public.appointment_notes', 'DELETE') as has`;
    expect(grant[0]?.has, "0026 keeps DELETE granted on purpose; a carve-out changes the mechanism").toBe(
      true,
    );
  });

  it("DROPPING 0084's delete policy restores the refusal — that policy is the only thing permitting a delete", async () => {
    // The grant is full on purpose, so if anything other than 0084's policy
    // were admitting deletes, removing the policy would change nothing. It must
    // change everything: with the policy gone, the own-tenant delete is back to
    // zero rows, exactly the pre-0084 state.
    const deleted = await swapped(
      sql,
      [`drop policy "appointment_notes_tenant_delete" on public.appointment_notes`],
      claimsA,
      async (tx) => {
        const rows = await tx<{ id: string }[]>`
          delete from appointment_notes where id = ${A.note} returning id`;
        return rows.length;
      },
    );
    expect(deleted).toBe(0);
  });

  it("REPLACING 0084's tenant predicate with `using (true)` STILL deletes nothing cross-tenant — the SELECT policy hides the row first", async () => {
    // ==================================================================
    // THE QUESTION THE EXISTING SUITES CANNOT ASK
    // ==================================================================
    // Before 0084 this swap asked what the MISSING policy was preventing. Now a
    // DELETE policy exists and the question moves one layer in: what is its
    // tenant predicate preventing?
    //
    // MEASURED, AND NOT WHAT THE FIRST DRAFT OF THIS TEST ASSUMED: on its own,
    // nothing. A DELETE whose WHERE reads a column needs SELECT on the row, so
    // Postgres applies the SELECT policy's USING as well as the DELETE policy's,
    // and appointment_notes_tenant_select already hides another tenant's note.
    // The first draft asserted 1 here and the lane returned 0. The two tenant
    // predicates are REDUNDANT for a cross-tenant delete, which is the
    // defence-in-depth shape the header describes, not a hole.
    const deleted = await swapped(
      sql,
      [
        `drop policy "appointment_notes_tenant_delete" on public.appointment_notes`,
        `create policy "swap_probe_delete" on public.appointment_notes
           for delete to authenticated using (true)`,
      ],
      claimsA,
      async (tx) => {
        const rows = await tx<{ id: string }[]>`
          delete from appointment_notes where id = ${B.note} returning id`;
        return rows.length;
      },
    );
    expect(deleted).toBe(0);
  });

  it("…and only removing BOTH tenant predicates makes another tenant's note deletable — two layers hold, each alone is enough", async () => {
    // THAT IS WHY THIS ASSERTION IS WRITTEN THE WAY IT IS. It asserts exactly
    // how thin the guarantee is: two statements, one per policy, and one clinic
    // can erase another's notes with no error anywhere. Either predicate alone
    // restores the refusal, so a future migration that loosens one of them is
    // survivable and one that loosens both is not.
    const deleted = await swapped(
      sql,
      [
        `drop policy "appointment_notes_tenant_delete" on public.appointment_notes`,
        `create policy "swap_probe_delete" on public.appointment_notes
           for delete to authenticated using (true)`,
        `drop policy "appointment_notes_tenant_select" on public.appointment_notes`,
        `create policy "swap_probe_select" on public.appointment_notes
           for select to authenticated using (true)`,
      ],
      claimsA,
      async (tx) => {
        const rows = await tx<{ id: string }[]>`
          delete from appointment_notes where id = ${B.note} returning id`;
        return rows.length;
      },
    );
    expect(deleted).toBe(1);
  });

  it("the note survived every swap — nothing above committed", async () => {
    // The last word, and it is on the REAL table rather than inside a
    // transaction: the tests above deleted BOTH notes and dropped 0084's policy,
    // and the rollbacks put all of it back. If DDL-in-a-transaction ever stopped
    // behaving this way, this is where the suite says so instead of leaving a
    // hole in the fixture.
    const rows = await sql<{ id: string }[]>`
      select id from appointment_notes where id in (${A.note}, ${B.note})`;
    expect(rows.length).toBe(2);

    const policies = await sql<{ policyname: string }[]>`
      select policyname from pg_policies
       where schemaname = 'public' and tablename = 'appointment_notes'
       order by policyname`;
    const names = policies.map((p) => p.policyname);
    expect(names).toEqual([
      "appointment_notes_tenant_delete",
      "appointment_notes_tenant_insert",
      "appointment_notes_tenant_select",
      "appointment_notes_tenant_update",
    ]);
    expect(names, "the probe DELETE policy leaked out of its transaction").not.toContain(
      "swap_probe_delete",
    );
    expect(names, "the probe SELECT policy leaked out of its transaction").not.toContain(
      "swap_probe_select",
    );
  });
});
