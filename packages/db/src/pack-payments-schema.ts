import { sql, type SQL } from "drizzle-orm";

/**
 * PACK PAYMENTS - ARE THE PAYMENT TABLE AND THE AGREED PRICE ON THIS DATABASE YET?
 *
 * `public.pack_instance_payments` and `public.patient_pack_instances.
 * agreed_price_cents` arrive together, in one transaction, with the PENDING
 * migration `packages/db/migrations-pending/NEXT-AFTER-0114_pack_payments.sql`,
 * which has no number yet. Every database built before it is applied (CI's,
 * whose stack is built from supabase/migrations; a lane; production until the
 * sitting) has neither, and a query naming either does not return zero rows:
 * Postgres raises 42P01 or 42703, which aborts the statement and, inside
 * `runScoped`, the whole read. An unguarded reader would take Packs em uso down
 * with it.
 *
 * SO EVERY READER AND WRITER ASKS THIS FIRST, and with the schema absent the
 * page reads as today: PAGAMENTO empty and "Pagamento: em breve", no button.
 *
 * BOTH OBJECTS ARE ASKED FOR, not one. They arrive in one file, so one implies
 * the other on any database built by the migrations; asking for both costs
 * nothing and means a database where somebody created only one of them reads
 * as absent rather than failing at the first statement that needs the other.
 *
 * SAME SHAPE AS weekly-blocks-schema.ts AND rgpd-acceptance-schema.ts. Cached
 * per process and ASYMMETRICALLY: "present" never becomes false again, so it is
 * kept for the life of the process; "absent" is re-asked after a minute, so the
 * apply takes effect on the running deployment without a redeploy.
 *
 * `to_regclass` and `pg_attribute` ARE ASKED, never information_schema, which
 * hides objects from a role holding no privilege on them.
 */
type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

const ABSENT_RECHECK_MS = 60_000;

let present = false;
let absentCheckedAt = -Infinity;

export const PACK_PAYMENTS_TABLE = "public.pack_instance_payments";
export const PACK_INSTANCES_TABLE = "public.patient_pack_instances";
export const AGREED_PRICE_COLUMN = "agreed_price_cents";

export async function packPaymentsSchemaPresent(db: SqlExecutor): Promise<boolean> {
  if (present) return true;
  if (Date.now() - absentCheckedAt < ABSENT_RECHECK_MS) return false;
  const rows = (await db.execute(sql`
    select (
      to_regclass(${PACK_PAYMENTS_TABLE}) is not null
      and exists (
        select 1 from pg_attribute
         where attrelid = to_regclass(${PACK_INSTANCES_TABLE})
           and attname = ${AGREED_PRICE_COLUMN}
           and not attisdropped
      )
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
