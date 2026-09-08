# REPORT — an `appointment_notes` policy-swap harness, on a restored copy

**Status: REPORT. NOTHING IS BUILT, AND ONE PRECONDITION IS NOT MET.**
BLUE, 2026-09-08. Every policy quoted below was read from the migration files on
`origin/main`.

---

## 0. The precondition, first, because it decides what is buildable today

**"On a restored copy" means a restore of production into a throwaway project,
and this lane cannot make one.** SR-50 is suspended for applies and the harness
refuses any command that connects to production, so the restore is an owner
action. Everything in section 3 is buildable **now, on a lane database**;
everything in section 4 needs the restored copy and is specified so it can be run
the hour one exists.

**A lane database is not a substitute and the difference is the point.** A lane
has fixtures a test wrote; a restored copy has a decade of notes written by
receptionists, and the whole reason to swap a policy on the *restored* copy is to
find the rows that only real data produces.

---

## 1. What the policies actually are

Three policies, from two migrations, all `TO authenticated`:

| policy | migration | clause |
|---|---|---|
| `appointment_notes_tenant_select` | 0026 | `USING (tenant_id = jwt_tenant_id())` |
| `appointment_notes_tenant_insert` | 0026 | `WITH CHECK (tenant_id = jwt_tenant_id())` |
| `appointment_notes_tenant_update` | 0050 | `USING` **and** `WITH CHECK`, same predicate |

**There is no DELETE policy, and its absence IS the design.** 0026's own comment
says so: *"append-only is enforced by the missing UPDATE/DELETE policies, NOT by
grant carve-outs (see 0003_grants.sql audit_log note): keep the full DML grant so
UPDATE/DELETE deny as 0 rows via RLS in every environment."* The table carries
`GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated` **on purpose**, so a
delete is refused by RLS as zero rows rather than by a permission error.

0050 then added the UPDATE policy — *editable, not deletable* — and the
append-only claim narrowed to DELETE alone without the comment above being
rewritten. **That is the first thing a harness should pin**, because the file
that states the rule and the file that changed it are two files apart.

---

## 2. What a policy swap proves that a normal test does not

The existing suites (`appointment-notes-nullable-rls.test.ts`,
`cross-tenant-rls-isolation.test.ts`) assert **what the policy allows**. They run
as a principal, do a thing, and check the outcome. What they cannot show is
**which of the several overlapping protections produced that outcome**.

`appointment_notes` has at least three, and on any given query they agree:

1. the RLS policy's `tenant_id = jwt_tenant_id()`,
2. the application's own `runScoped` transaction, which sets the claims,
3. the query's own `WHERE` clauses, written by the caller.

**A test passes if any one of them holds. A policy swap is how you learn whether
the one you think is holding actually is.** Replace `appointment_notes_tenant_select`
with a deliberately permissive `USING (true)` and re-run: every assertion that
stays green was being carried by something other than the policy.

This project has the finding already, one table over:
`location-scope-classes.db.test.ts` records that removing the app-layer predicate
from all four `patients` compositions left every assertion green, because 0073's
`patients_select` produced the identical set on its own. **That is not a hole in
the test; it is the shape of a defence-in-depth system, and it is invisible until
you take one layer away.**

---

## 3. The harness, buildable now on a lane

A script that, inside **one transaction it always rolls back**:

1. records the current policy definitions from `pg_policies` (`qual`, `with_check`),
2. `DROP`s one named policy and `CREATE`s a swapped variant,
3. runs a fixed battery of statements as each principal,
4. records the outcome of each,
5. `ROLLBACK`s, and prints a matrix of **which swaps changed which outcome**.

### The swaps worth running

| swap | what a green suite afterwards would mean |
|---|---|
| `tenant_select` → `USING (true)` | nothing was relying on the SELECT policy for tenant isolation; the app's `WHERE` was carrying it |
| `tenant_select` → `USING (false)` | the positive control — if this does not redden the reads, the harness is not reaching the policy at all |
| `tenant_update` → `USING (true)` | a cross-tenant edit is prevented by something else, or is not prevented |
| **add** a `FOR DELETE … USING (true)` policy | **the append-only claim measured rather than asserted**: what in the product starts deleting notes once RLS permits it |
| `tenant_insert` `WITH CHECK (true)` | whether any path writes a `tenant_id` it did not get from the JWT |

**The fourth is the one worth building the harness for.** Every other row
confirms a protection; that row asks what the absence of a policy is currently
hiding, which is the only question the current tests structurally cannot ask.

### The two rules it must hold

- **`ROLLBACK` on every path, including the failing one.** The 0081 DB-gated test
  learned this the hard way: its negative arm inserted bad rows for real and the
  constraint then could not be re-added at all (*"violated by some row"*). The
  swap helper cleans up in a `finally`, not at the end of the happy path.
- **A positive control in every run.** A swap that reddens nothing and a harness
  that is not executing the swap look identical.

---

## 4. What the restored copy adds

Three questions a lane cannot answer:

1. **Row counts and shapes.** How many `appointment_notes` rows exist per tenant,
   how many carry a null `appointment_id` (0042 made it nullable), how many have
   been edited (`edited_at IS NOT NULL`) since 0050. A permissive swap on a table
   with four fixture rows tells you nothing about a table with a decade of them.
2. **Whether any row is already cross-tenant.** The policy has been in place
   since 0026, but `tenant_id` is written by the application, and the swap to
   `USING (true)` is the only read that can *see* a row the policy has been
   hiding. **On a lane there is no such row by construction.**
3. **Performance under the real predicate.** `jwt_tenant_id()` is called per row
   in the `USING` clause; 0078 removed exactly that shape from `appointments`
   because a SECURITY DEFINER call per row cost 150× on the scan. Whether
   `appointment_notes` has the same problem is a question about row counts, and
   the lane's row count is a fixture.

**And measure it as an assigned principal.** A measurement taken on the owner
connection, or with nested JWT claims that do not resolve, times an empty set and
looks fast. Assert the result set is **narrowed and non-empty** before quoting
any number from it.

---

## 5. Recommendation

**Build section 3 now; it needs nothing this lane does not have.** It is a
`.db.test.ts` beside the existing `appointment-notes-*` suites, it runs in CI's
DB-gated job, and its immediate deliverable is the DELETE row — the one that says
what the missing policy is currently preventing.

**Hold section 4 for the restore.** It is not blocked on engineering and it is
not blocked on a decision; it is blocked on a copy of production existing, which
is an owner action and is worth doing anyway for the backup-restore drill
(`docs/qa-backup-restore-drill-2026-06-21.md`).

**And correct 0026's comment when either lands.** *"Append-only is enforced by
the missing UPDATE/DELETE policies"* has been half true since 0050 shipped the
UPDATE policy. A file that states the rule and a file that changed it should not
be two files apart with no cross-reference.
