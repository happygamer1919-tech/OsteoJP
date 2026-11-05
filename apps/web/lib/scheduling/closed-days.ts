import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { locationClosedDays, locationClosedDaysSchemaPresent, type DbTx } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { closedDayBandsByDate, type ClosedDayBand, type ClosedDayRule } from "./closed-days-core";

/**
 * DATED CLINIC CLOSURES - the ONE staff-side read of a clinic's closures.
 *
 * Every staff reader of a clinic closure composes this beside the lunch
 * closure it already reads: the refusal `checkClinicClosure` (every write path,
 * Agendar lote and the pedido confirmation), the availability read behind Nova
 * marcacao, Agendar lote and the Horarios inspector, and the agenda's closure
 * band. One function, so no reader can learn the dated closures and another
 * forget them. The census test (clinic-closure-readers.census.test.ts) holds
 * every lunch-closure reader to naming it.
 *
 * INERT UNTIL THE TABLE EXISTS. The migration is pending; on a database built
 * without it, `locationClosedDaysSchemaPresent` answers false and this returns
 * [] with no query against the table, so every reader behaves exactly as
 * before the sitting.
 *
 * Runs on the caller's tenant-scoped tx: RLS scopes it to the caller's tenant,
 * and this module never filters tenant_id by hand.
 */
export async function readClosedDays(
  tx: DbTx,
  args: { locationId: string; fromDate: string; toDate: string },
): Promise<ClosedDayRule[]> {
  if (!(await locationClosedDaysSchemaPresent(tx))) return [];
  return tx
    .select({
      id: locationClosedDays.id,
      startsOn: locationClosedDays.startsOn,
      endsOn: locationClosedDays.endsOn,
      closedFrom: locationClosedDays.closedFrom,
      closedTo: locationClosedDays.closedTo,
      kind: locationClosedDays.kind,
      label: locationClosedDays.label,
    })
    .from(locationClosedDays)
    .where(
      and(
        eq(locationClosedDays.locationId, args.locationId),
        // Any closure that covers a date in [fromDate, toDate].
        lte(locationClosedDays.startsOn, args.toDate),
        gte(locationClosedDays.endsOn, args.fromDate),
      ),
    )
    .orderBy(asc(locationClosedDays.startsOn));
}

/**
 * The agenda's dated-closure bands for ONE clinic over the displayed dates,
 * keyed by Lisbon date. Read on every request (never through the agenda's
 * 60-second reference cache), so a closure saved on the Encerramentos page
 * shows on the next load.
 */
export async function readClosedDayBands(
  ctx: RequestContext,
  args: { locationId: string; dates: readonly string[] },
): Promise<Record<string, ClosedDayBand[]>> {
  if (args.dates.length === 0) return {};
  const sorted = [...args.dates].sort();
  const rules = await runScoped(ctx, (tx) =>
    readClosedDays(tx, { locationId: args.locationId, fromDate: sorted[0]!, toDate: sorted[sorted.length - 1]! }),
  );
  return closedDayBandsByDate(rules, args.dates);
}
