import "server-only";
import { and, inArray, isNotNull, sql } from "drizzle-orm";
import { appointments, packLinkedCountSql, patientPackInstances, type DbTx } from "@osteojp/db";
import { uncancelPackShortfall } from "./uncancel";

/**
 * The linked, session-consuming count per instance. Built exactly as
 * lib/packs/link.ts builds it, down to the quoted outer identifier:
 * packLinkedCountSql's header records that an unquoted `id` resolved to `a.id`
 * and counted zero for every instance, silently.
 */
const linkedCount = sql<number>`${sql.raw(packLinkedCountSql('"patient_pack_instances"."id"'))}`;

/**
 * SCHED-27 — true when bringing these cancelled appointments back would use more
 * pacote sessions than their instances have left. Read inside the caller's
 * transaction, so it sees the same rows the UPDATE will change.
 */
export async function uncancelOverdrawsPack(tx: DbTx, appointmentIds: readonly string[]): Promise<boolean> {
  if (appointmentIds.length === 0) return false;
  const linked = await tx
    .select({ packInstanceId: appointments.packInstanceId })
    .from(appointments)
    .where(and(inArray(appointments.id, [...appointmentIds]), isNotNull(appointments.packInstanceId)));

  const rowsPerInstance = new Map<string, number>();
  for (const r of linked) {
    if (r.packInstanceId) rowsPerInstance.set(r.packInstanceId, (rowsPerInstance.get(r.packInstanceId) ?? 0) + 1);
  }
  if (rowsPerInstance.size === 0) return false;

  const balances = await tx
    .select({
      instanceId: patientPackInstances.id,
      sessionsTotal: patientPackInstances.sessionsTotal,
      legacyConsumed: patientPackInstances.legacyConsumed,
      linkedAppointments: linkedCount,
    })
    .from(patientPackInstances)
    .where(inArray(patientPackInstances.id, [...rowsPerInstance.keys()]));

  return (
    uncancelPackShortfall(
      balances.map((b) => ({ ...b, linkedAppointments: Number(b.linkedAppointments) })),
      rowsPerInstance,
    ).length > 0
  );
}
