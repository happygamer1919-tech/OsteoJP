import { sql, type SQL } from "drizzle-orm";

/**
 * RGPD-01 - IS THE PATIENT RGPD CONSENT TABLE ON THIS DATABASE YET?
 *
 * `public.patient_rgpd_acceptances` arrives with
 * `packages/db/migrations/0093_patient_rgpd_acceptances.sql`, promoted on
 * 2026-09-23 and applied to production before this code merges. A database that
 * stands before 0093 (a lane, a preview, a rehearsal) still has no table.
 *
 * SO EVERY PATH THAT READS OR WRITES THE TABLE MUST BE INERT UNTIL IT EXISTS.
 * The ficha's "RGPD em falta" mark reads as it does today (no consent on file),
 * and the creation form does not offer the tick at all.
 *
 * THIS FILE EXISTS BECAUSE ITS ABSENCE COST A FULL E2E RUN. The first cut of
 * RGPD-01 reasoned that the PR is held until the apply, so the application code
 * could assume the table. That is true of production and false of EVERY
 * pre-merge environment: CI's e2e stack builds its database with
 * `supabase db reset` from supabase/migrations, so the ficha read failed with
 * 42P01 `relation "patient_rgpd_acceptances" does not exist` on every patient
 * page, and all three Playwright shards went red. `shared-resource.ts`
 * (SCHED-17) and `guest-intake.ts` (INTAKE-01) had already written the rule
 * down; this is the third table to need it.
 *
 * SAME SHAPE AS THOSE TWO, deliberately. One question, asked of
 * information_schema, cached per process and ASYMMETRICALLY: "present" never
 * becomes false again, so it is kept for the life of the process; "absent" is
 * re-asked after a minute, so an apply takes effect on the running deployment
 * without a redeploy.
 *
 * `information_schema.tables` lists tables the CALLING role holds a privilege
 * on. The migration grants SELECT and INSERT to `authenticated`, which is the
 * role every staff read runs under via `runScoped`, so every caller in this
 * repository qualifies. The `patient` role is granted nothing and never asks.
 */
type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

const ABSENT_RECHECK_MS = 60_000;

let present = false;
let absentCheckedAt = -Infinity;

export async function rgpdAcceptancesSchemaPresent(db: SqlExecutor): Promise<boolean> {
  if (present) return true;
  if (Date.now() - absentCheckedAt < ABSENT_RECHECK_MS) return false;
  const rows = (await db.execute(sql`
    select exists (
      select 1 from information_schema.tables
       where table_schema = 'public'
         and table_name = 'patient_rgpd_acceptances'
    ) as present
  `)) as unknown as ReadonlyArray<{ present: boolean }>;
  if (rows[0]?.present === true) {
    present = true;
    return true;
  }
  absentCheckedAt = Date.now();
  return false;
}

/** Tests only: forget what was learned, so a test can ask again. */
export function resetRgpdAcceptancesSchemaCache(): void {
  present = false;
  absentCheckedAt = -Infinity;
}
