import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  PACK_CONSUMING_STATUS_SQL,
  packLinkedCountSql,
  patientPackInstances,
  patients,
  servicePacks,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import {
  PACKS_IN_USE_CAPABILITIES,
  buildPacksInUse,
  isInUseCandidate,
  type PackInstanceRow,
  type PackSession,
  type PacksInUsePage,
} from "./in-use";

/**
 * "Packs em uso", read side. Every decision is in `./in-use.ts`; this file
 * fetches rows and nothing else.
 *
 * ==========================================================================
 * IT READS AS THE VIEWER, NEVER AS THE SERVICE ROLE
 * ==========================================================================
 * Both statements run inside `runScoped`, under the viewer's own JWT.
 *
 * - The instances are joined to `patients`, so `patients_select` (RLS) decides
 *   which pacotes appear: a therapist sees the pacotes of the patients they may
 *   open, a receptionist or admin with a clinic those of their clinics' patients,
 *   the owner all of them. `patient_pack_instances` is tenant-only on its own,
 *   which is why the join is not optional.
 * - The sessions come from 0108's `pack_instance_consuming_sessions`, called as
 *   the viewer. It returns rows only when the viewer may already see the
 *   pacote's patient (patients_select's terms, restated in the function), and
 *   then returns EVERY consuming visit of the pacote, whoever the therapist. A
 *   pacote's balance is a property of the pacote: a plain RLS read of
 *   `appointments` would undercount for a therapist and show a colleague's
 *   booked session as free.
 *
 * ==========================================================================
 * THE OUTER COLUMN IS NAMED EXPLICITLY IN EVERY SUBQUERY
 * ==========================================================================
 * `packLinkedCountSql` carries the account: an interpolated Drizzle column
 * rendered as a bare `"id"` and silently counted zero for every pacote.
 */
const INSTANCE_ID = '"patient_pack_instances"."id"';

const visibleLinked = sql<number>`${sql.raw(packLinkedCountSql(INSTANCE_ID))}`;

const visibleUpcoming = sql<number>`${sql.raw(`(
  SELECT count(*)::int FROM appointments a
   WHERE a.pack_instance_id = ${INSTANCE_ID}
     AND a.${PACK_CONSUMING_STATUS_SQL}
     AND a.starts_at > now()
)`)}`;

export async function listPacksInUse(
  actor: RequestContext,
  query: string,
  now: Date = new Date(),
): Promise<PacksInUsePage> {
  for (const c of PACKS_IN_USE_CAPABILITIES) assertCan(actor.role, c);

  return runScoped(
    actor,
    async (tx) => {
      const rows = await tx
        .select({
          instanceId: patientPackInstances.id,
          patientId: patientPackInstances.patientId,
          patientName: patients.fullName,
          packName: servicePacks.name,
          packPriceCents: servicePacks.priceCents,
          sessionsTotal: patientPackInstances.sessionsTotal,
          legacyConsumed: patientPackInstances.legacyConsumed,
          purchasedAt: patientPackInstances.purchasedAt,
          visibleLinked,
          visibleUpcoming,
        })
        .from(patientPackInstances)
        .innerJoin(
          patients,
          and(
            eq(patients.id, patientPackInstances.patientId),
            eq(patients.tenantId, patientPackInstances.tenantId),
          ),
        )
        .innerJoin(servicePacks, eq(servicePacks.id, patientPackInstances.packId))
        // A soft-deleted patient is not on the patient list, so their pacotes
        // are not "a decorrer" either.
        .where(isNull(patients.deletedAt));

      const candidates: PackInstanceRow[] = rows
        .filter((r) =>
          isInUseCandidate({
            sessionsTotal: r.sessionsTotal,
            legacyConsumed: r.legacyConsumed,
            visibleLinked: Number(r.visibleLinked),
            visibleUpcoming: Number(r.visibleUpcoming),
          }),
        )
        .map((r) => ({
          instanceId: r.instanceId,
          patientId: r.patientId,
          patientName: r.patientName,
          packName: r.packName,
          packPriceCents: r.packPriceCents,
          sessionsTotal: r.sessionsTotal,
          legacyConsumed: r.legacyConsumed,
          purchasedAt: r.purchasedAt,
        }));

      const sessionsByInstance = new Map<string, PackSession[]>();
      if (candidates.length > 0) {
        const ids = sql.join(
          candidates.map((c) => sql`${c.instanceId}::uuid`),
          sql`, `,
        );
        const found = (await tx.execute(sql`
          select i.id as instance_id, s.appointment_id, s.starts_at
            from unnest(array[${ids}]) as i(id)
            cross join lateral public.pack_instance_consuming_sessions(i.id) s
        `)) as unknown as ReadonlyArray<{
          instance_id: string;
          appointment_id: string;
          starts_at: string | Date;
        }>;
        for (const f of found) {
          const list = sessionsByInstance.get(f.instance_id) ?? [];
          // A raw statement carries no column type, so the driver may hand back
          // a string rather than a Date. Converted once, here.
          list.push({ appointmentId: f.appointment_id, startsAt: new Date(f.starts_at) });
          sessionsByInstance.set(f.instance_id, list);
        }
      }

      return buildPacksInUse(candidates, sessionsByInstance, now, query);
    },
    "db:packs-in-use",
  );
}
