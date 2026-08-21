import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RB-02b — the batch path must LINK every pacote row and force the base service.
 *
 * ==========================================================================
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ==========================================================================
 * It is a SOURCE GUARD, the same instrument `booking-location-scope.test.ts`
 * uses on the same file, and for the same reason: the property lives inside a
 * transaction in a server-only module that a unit test cannot reach and the
 * DB-gated suite cannot call.
 *
 * **It does not prove the column is written.** It proves the two lines that
 * write it have not been deleted or renamed, which is the failure this change is
 * actually exposed to — a later refactor of the insert dropping a field nobody
 * is looking at. The behaviour itself is proven one layer down: the derived
 * balance counts `pack_instance_id` rows, and
 * `packages/db/tests/pack-derived-balance.db.test.ts` proves that against a real
 * Postgres through the production function.
 *
 * Saying so explicitly matters more than the assertion. `ACC-vacuous-guard-sweep`
 * criterion F: a guard proves a test RAN; only the assertion proves it tested the
 * right SUBJECT. This one's subject is the source text, and it is labelled as
 * such rather than left to read like an end-to-end proof.
 */

const src = () =>
  readFileSync(join(process.cwd(), "lib/scheduling/batch.ts"), "utf8");

describe("the batch engine and pacotes", () => {
  it("writes pack_instance_id on every row it inserts", () => {
    const s = src();
    // In the .values() mapper, not merely mentioned somewhere in the file.
    const mapper = s.slice(s.indexOf("toBook.map((s) => ({"));
    expect(mapper).toContain("packInstanceId");
  });

  it("forces the pacote's BASE service onto the rows, not the form's service", () => {
    // Without this every row in a pacote batch records whatever service the form
    // happened to carry. The single-create path has always forced it; the batch
    // path had no pacote at all until now, so this is the first time it can be
    // wrong. It would be invisible until somebody read a receipt.
    const s = src();
    const mapper = s.slice(s.indexOf("toBook.map((s) => ({"));
    expect(mapper).toContain("serviceId: serviceIdForRows");
    expect(mapper).not.toContain("serviceId: input.serviceId");
  });

  it("resolves the pacote INSIDE the transaction, before the insert", () => {
    // Order is the property. Resolving outside would race a concurrent booking
    // on the same pacote: two batches could each read three sessions available
    // and each book three.
    const s = src();
    const tx = s.indexOf("runScoped(ctx, async (tx)");
    const resolve = s.indexOf("bookPackSessionTx(tx, ctx");
    const insert = s.indexOf(".insert(appointments)");
    expect(tx).toBeGreaterThan(-1);
    expect(resolve).toBeGreaterThan(tx);
    expect(insert).toBeGreaterThan(resolve);
  });

  it("checks the cap on what was REQUESTED, never on what happens to be free", () => {
    // slots.length, not toBook.length. The two differ only when a slot is busy,
    // so a swap would pass every test that books into free time.
    expect(src()).toContain("packBatchIsOverbooked(slots.length");
  });

  it("cannot express a pacote with a recurrence, by TYPE", () => {
    // The owner ruling is "no interval control and no weekday recurrence for the
    // pacote path". `packId` sits on BatchExplicitInput only, so a caller has
    // nowhere to put a rule alongside a pacote. Enforced rather than intended.
    const s = src();
    const explicit = s.slice(
      s.indexOf("export type BatchExplicitInput"),
      s.indexOf("export type BatchScheduleInput"),
    );
    const recurrence = s.slice(
      s.indexOf("export type BatchRecurrenceInput"),
      s.indexOf("export type BatchExplicitInput"),
    );
    expect(explicit).toContain("packId");
    expect(recurrence).not.toContain("packId");
  });
});
