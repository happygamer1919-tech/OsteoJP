import { sql, type SQL } from "drizzle-orm";

/**
 * PACK PAYMENTS - ARE THE TWO PACK MONEY TABLES ON THIS DATABASE YET?
 *
 * `public.pack_instance_agreed_prices` and `public.pack_instance_payments`
 * arrive together, in one transaction, with the PENDING migration
 * `packages/db/migrations-pending/NEXT-AFTER-0114_pack_payments.sql`, which has
 * no number yet. Every database built before it is applied (CI's, whose stack
 * is built from supabase/migrations; a lane; production until the sitting) has
 * neither, and a query naming either does not return zero rows: Postgres
 * raises 42P01, which aborts the statement and, inside `runScoped`, the whole
 * read. An unguarded reader would take Packs em uso down with it.
 *
 * SO EVERY READER AND WRITER ASKS THIS FIRST, and with the tables absent the
 * pages read as today: PAGAMENTO empty and "Pagamento: em breve", no button.
 *
 * BOTH TABLES ARE ASKED FOR, not one. They arrive in one file, so one implies
 * the other on any database built by the migrations; asking for both costs
 * nothing and means a database where somebody created only one of them reads
 * as absent rather than failing at the first statement that needs the other.
 *
 * SAME SHAPE AS weekly-blocks-schema.ts AND rgpd-acceptance-schema.ts. Cached
 * per process and ASYMMETRICALLY: "present" never becomes false again, so it is
 * kept for the life of the process; "absent" is re-asked after a minute, so the
 * apply takes effect on the running deployment without a redeploy.
 *
 * `to_regclass` IS THE QUESTION, never information_schema, which hides a table
 * from a role holding no privilege on it (a therapist holds SELECT on both, but
 * the answer must not depend on who asks).
 */
type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

const ABSENT_RECHECK_MS = 60_000;

let present = false;
let absentCheckedAt = -Infinity;

export const PACK_PAYMENTS_TABLE = "public.pack_instance_payments";
export const PACK_AGREED_PRICES_TABLE = "public.pack_instance_agreed_prices";

export async function packPaymentsSchemaPresent(db: SqlExecutor): Promise<boolean> {
  if (present) return true;
  if (Date.now() - absentCheckedAt < ABSENT_RECHECK_MS) return false;
  const rows = (await db.execute(sql`
    select (
      to_regclass(${PACK_PAYMENTS_TABLE}) is not null
      and to_regclass(${PACK_AGREED_PRICES_TABLE}) is not null
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
export function resetPackPaymentsSchemaCache(): void {
  present = false;
  absentCheckedAt = -Infinity;
}
