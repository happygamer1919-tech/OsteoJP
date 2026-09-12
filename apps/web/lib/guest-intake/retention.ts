import type { SQL } from "drizzle-orm";
import {
  guestIntakeSchemaPresent,
  listTenantIdsForRetention,
  purgeTenantGuestIntakes,
} from "@osteojp/db";

/**
 * INTAKE-01 - THE RETENTION JOB'S DRIVER. Seven days, all four conditions.
 *
 * WHAT THIS DOES AND, MORE IMPORTANTLY, WHAT IT DOES NOT. It decides NOTHING
 * about which intake is deleted. That decision is `purge_expired_guest_intakes`
 * in migration 0087, which holds the four conditions together (older than seven
 * days by ARRIVAL, request never converted to a person, the answers go and the
 * request stays, one audit row per deletion). This file only:
 *   1. checks the table exists (0087 is HELD; until the owner applies it this
 *      job must touch nothing, so it returns `table_absent` and calls nothing);
 *   2. lists every tenant; and
 *   3. calls the function ONCE PER TENANT (CLAUDE.md rule 3: a job never runs
 *      globally, and the function refuses a NULL tenant for the same reason).
 * The two statements themselves live in packages/db
 * (`src/guest-intake-staff.ts`); there is no SQL here, and no predicate to get
 * wrong - in particular none on `guest_booking_requests.converted_appointment_id`,
 * which nothing writes and which would read a treated patient as never booked.
 *
 * THE CONNECTION IS THE OWNING ROLE. The caller passes `getDbAdmin()`, which
 * connects as the database owner (BYPASSRLS; `packages/db/src/client.ts`).
 * 0087 revokes EXECUTE on the function from anon, authenticated, patient AND
 * service_role, so only its owner can run it. That is on purpose and is not
 * worked around: no grant, no SECURITY DEFINER wrapper.
 *
 * LOGS COUNTS ONLY. One line per run: how many tenants, how many intakes went.
 * No tenant id, no request id, no answer. The per-deletion detail is the audit
 * row the function writes, which is PII-free by construction.
 */

type SqlExecutor = { execute: (query: SQL) => PromiseLike<unknown> };

/**
 * Runs one named unit of work. Inngest's `step.run` in production, so a failure
 * in one tenant retries that tenant alone; a plain call in tests.
 */
export type StepRunner = <T>(id: string, fn: () => Promise<T>) => Promise<T>;

const runInline: StepRunner = (_id, fn) => fn();

export const RETENTION_LOG_PREFIX = "[guest-intake] retention:";

export type RetentionOutcome =
  | { ran: false; reason: "table_absent" }
  | { ran: true; tenants: number; purged: number };

export type RetentionDeps = {
  step?: StepRunner;
  listTenantIds?: (db: SqlExecutor) => Promise<string[]>;
  purgeTenant?: (db: SqlExecutor, tenantId: string) => Promise<number>;
  log?: (line: string) => void;
};

export async function runGuestIntakeRetention(
  db: SqlExecutor,
  deps: RetentionDeps = {},
): Promise<RetentionOutcome> {
  const step = deps.step ?? runInline;
  const listTenantIds = deps.listTenantIds ?? listTenantIdsForRetention;
  const purgeTenant = deps.purgeTenant ?? purgeTenantGuestIntakes;
  const log = deps.log ?? ((line: string) => console.info(line));

  const present = await step("check-table", () => guestIntakeSchemaPresent(db));
  if (!present) {
    log(`${RETENTION_LOG_PREFIX} table absent`);
    return { ran: false, reason: "table_absent" };
  }

  const tenantIds = await step("list-tenants", () => listTenantIds(db));
  let purged = 0;
  for (const tenantId of tenantIds) {
    purged += await step(`purge-tenant-${tenantId}`, () => purgeTenant(db, tenantId));
  }

  log(`${RETENTION_LOG_PREFIX} tenants=${tenantIds.length} purged=${purged}`);
  return { ran: true, tenants: tenantIds.length, purged };
}
