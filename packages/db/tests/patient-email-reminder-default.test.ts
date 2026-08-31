/**
 * patient-email-reminder-default.test.ts — 0070, WF-18 C.
 *
 * WHAT IT PROVES, and each arm names the failure it refuses:
 *
 *   1. THE DEFAULT IS TRUE for a patient inserted without the column. Doing
 *      only the backfill and forgetting the default would work today and fail
 *      silently for every patient registered tomorrow.
 *   2. THE BACKFILL PREDICATE is exactly "has an email". A patient with no
 *      address, or an empty-string one, must NOT be flipped: the flag would
 *      record a preference for a channel they cannot receive, and the dispatch
 *      skips them on contact anyway - so the only effect would be a column
 *      that lies about what was decided.
 *   3. IT IS IDEMPOTENT. A second run touches zero rows, which is also what
 *      makes the row count reported to the owner meaningful.
 *   4. THE SMS DEFAULT IS UNTOUCHED. WF-18 C is about email; a migration that
 *      also moved the SMS flag would be a change nobody ruled.
 *
 * The backfill statement is READ FROM THE MIGRATION FILE and executed here,
 * rather than restated. A restated predicate proves the test agrees with
 * itself; this proves the shipped SQL does what is claimed.
 *
 * Skipped without DATABASE_URL and hard-required in assert-rls-executed.mjs.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

const MIGRATION = join(
  __dirname,
  "..",
  "migrations",
  "0070_patient_email_reminder_default.sql",
);

/** The UPDATE exactly as it ships, pulled out of the migration file. */
function backfillStatement(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const m = sql.match(/UPDATE public\.patients[\s\S]*?;/);
  if (!m) throw new Error("0070: could not find the backfill UPDATE in the migration");
  return m[0];
}

describe.skipIf(!live)("0070 — the email reminder default and backfill", () => {
  let sql: Sql;
  const tenant = randomUUID();

  const withEmail = randomUUID();
  const emptyEmail = randomUUID();
  const noEmail = randomUUID();
  const alreadyOn = randomUUID();

  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug) values (${tenant}, 'Email Default', ${"ed-" + tenant.slice(0, 8)})`;
    // All four are inserted with the flag explicitly FALSE, i.e. the state the
    // whole existing patient list was in before this migration.
    await sql`insert into patients (id, tenant_id, full_name, email, reminder_email_enabled)
              values (${withEmail}, ${tenant}, 'Com Email', 'doente@example.pt', false)`;
    await sql`insert into patients (id, tenant_id, full_name, email, reminder_email_enabled)
              values (${emptyEmail}, ${tenant}, 'Email Vazio', '   ', false)`;
    await sql`insert into patients (id, tenant_id, full_name, email, reminder_email_enabled)
              values (${noEmail}, ${tenant}, 'Sem Email', null, false)`;
    await sql`insert into patients (id, tenant_id, full_name, email, reminder_email_enabled)
              values (${alreadyOn}, ${tenant}, 'Ja Ligado', 'ja@example.pt', true)`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from patients where tenant_id = ${tenant}`;
    await sql`delete from tenants where id = ${tenant}`;
    await sql.end({ timeout: 5 });
  });

  const flag = async (id: string) => {
    const r = await sql`select reminder_email_enabled e from patients where id = ${id}`;
    return r[0]!.e as boolean;
  };

  it("THE DEFAULT IS TRUE — a new patient gets email reminders without asking", async () => {
    const fresh = randomUUID();
    await sql`insert into patients (id, tenant_id, full_name, email)
              values (${fresh}, ${tenant}, 'Novo', 'novo@example.pt')`;
    expect(await flag(fresh)).toBe(true);
  });

  it("the SMS default is UNTOUCHED at true — this migration is about email", async () => {
    const fresh = randomUUID();
    await sql`insert into patients (id, tenant_id, full_name) values (${fresh}, ${tenant}, 'Novo2')`;
    const r = await sql`select reminder_sms_enabled s from patients where id = ${fresh}`;
    expect(r[0]!.s).toBe(true);
  });

  it("the SHIPPED backfill flips exactly the patients with a real email", async () => {
    // Re-seed the four to false so this test owns its own starting state.
    await sql`update patients set reminder_email_enabled = false
               where id in (${withEmail}, ${emptyEmail}, ${noEmail}, ${alreadyOn})`;

    const changed = await sql.unsafe(
      backfillStatement().replace(/;$/, "") + ` and tenant_id = '${tenant}' returning id`,
    );
    expect(changed.map((r) => r.id).sort()).toEqual([withEmail, alreadyOn].sort());

    expect(await flag(withEmail)).toBe(true);
    expect(await flag(alreadyOn)).toBe(true);
    // NOT flipped: no address, and a whitespace-only address, which is a
    // stored non-answer in a free-text column.
    expect(await flag(noEmail)).toBe(false);
    expect(await flag(emptyEmail)).toBe(false);
  });

  it("IS IDEMPOTENT — a second run touches zero rows", async () => {
    const again = await sql.unsafe(
      backfillStatement().replace(/;$/, "") + ` and tenant_id = '${tenant}' returning id`,
    );
    expect(again).toHaveLength(0);
  });

  /**
   * THE ARM THAT RECORDS WHAT CANNOT BE DONE. There is no predicate that could
   * have spared a patient who deliberately switched email off: `false` is the
   * stored value for both "opted out" and "never chose", and nothing records
   * which. SR-08 forbids building a set from the absence of a record, and this
   * asserts the absence is real rather than merely claimed in a comment.
   */
  it("nothing in the schema can distinguish an opt-out from a never-chose", async () => {
    const cols = await sql`
      select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'patients'
         and column_name ~ 'reminder_email'`;
    // Exactly one column: the flag. No companion timestamp, no source column,
    // nothing that would let a later migration tell the two falses apart.
    expect(cols.map((c) => c.column_name)).toEqual(["reminder_email_enabled"]);
  });
});
