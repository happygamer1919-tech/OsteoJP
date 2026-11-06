import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  PACK_CONSUMING_STATUS_SQL,
  packLinkedCountSql,
  patientPackInstances,
  patients,
  servicePacks,
  type DbTx,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import {
  PACKS_IN_USE_CAPABILITIES,
  PACKS_IN_USE_READ_CAP,
  PATIENT_PACKS_READ_CAP,
  buildPacksInUse,
  buildPatientPacks,
  comparePacksInUse,
  isInUseCandidate,
  matchesPatientSearch,
  summarizePackInstance,
  type PackInUseView,
  type PackInstanceRow,
  type PackSession,
  type PacksInUsePage,
  type PatientPacksPage,
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

const UPCOMING_COUNT_SQL = `(
  SELECT count(*)::int FROM appointments a
   WHERE a.pack_instance_id = ${INSTANCE_ID}
     AND a.${PACK_CONSUMING_STATUS_SQL}
     AND a.starts_at > now()
)`;

const visibleUpcoming = sql<number>`${sql.raw(UPCOMING_COUNT_SQL)}`;

/**
 * `isInUseCandidate` (./in-use.ts), as SQL, so only candidates are read and
 * the cap below counts candidates rather than every pacote ever sold. The JS
 * rule still runs over the rows that come back; the two are the same rule and
 * the unit suite pins the JS one.
 */
const isCandidateSql = sql`${sql.raw(`(
  ("patient_pack_instances"."sessions_total"
     - "patient_pack_instances"."legacy_consumed"
     - ${packLinkedCountSql(INSTANCE_ID)}) > 0
  OR ${UPCOMING_COUNT_SQL} > 0
)`)}`;

export async function listPacksInUse(
  actor: RequestContext,
  query: string,
  opts: { now?: Date; cap?: number } = {},
): Promise<PacksInUsePage> {
  for (const c of PACKS_IN_USE_CAPABILITIES) assertCan(actor.role, c);
  // Injectable for the tests only; the page passes neither. A cap below 1 or
  // a fraction would read nothing and call it complete, so it is refused.
  const now = opts.now ?? new Date();
  const cap = opts.cap ?? PACKS_IN_USE_READ_CAP;
  if (!Number.isInteger(cap) || cap < 1) throw new RangeError("cap must be a positive integer");

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
        .where(and(isNull(patients.deletedAt), isCandidateSql))
        // BOUNDED. Newest purchases first, and one row past the cap so the
        // page can say it stopped. Each candidate costs one call of 0108's
        // function, so an unbounded read is an unbounded page.
        .orderBy(desc(patientPackInstances.purchasedAt), desc(patientPackInstances.id))
        .limit(cap + 1);

      const truncated = rows.length > cap;
      const candidates: PackInstanceRow[] = rows
        .slice(0, cap)
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

      const sessionsByInstance = await readConsumingSessions(tx, candidates);

      return { ...buildPacksInUse(candidates, sessionsByInstance, now, query), truncated };
    },
    "db:packs-in-use",
  );
}

/**
 * The consuming sessions of each instance, from 0108's
 * `pack_instance_consuming_sessions`, called AS THE VIEWER. One call per
 * instance, which is why both reads in this file are bounded.
 */
async function readConsumingSessions(
  tx: DbTx,
  instances: readonly PackInstanceRow[],
): Promise<Map<string, PackSession[]>> {
  const sessionsByInstance = new Map<string, PackSession[]>();
  if (instances.length === 0) return sessionsByInstance;
  const ids = sql.join(
    instances.map((c) => sql`${c.instanceId}::uuid`),
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
  return sessionsByInstance;
}

/**
 * PACK-FICHA-01: ONE patient's pacotes, for the "Packs" tab of the ficha.
 *
 * The same read as "Packs em uso", narrowed to one patient, with the same
 * gate and the same boundary:
 *
 * - Same capabilities (`patients:read` AND `appointments:read`), asserted
 *   before anything is read.
 * - Same session: `runScoped`, the viewer's own JWT, never the service role.
 *   The instances are joined to `patients`, so `patients_select` (RLS) still
 *   decides whether this patient's pacotes come back at all; the patient
 *   filter only NARROWS what that policy already allows, it widens nothing.
 * - Same sessions: 0108's function, as the viewer.
 *
 * Two differences, both because this is one patient's file rather than a
 * clinic-wide list:
 *
 * - NO in-use pre-filter. Every pacote of the patient is read, so the tab can
 *   show the finished ones too, and the running/finished split is made on the
 *   exact numbers (0108's), not on the viewer-visible pre-filter.
 * - NO soft-delete filter. The ficha opens for a soft-deleted patient (it is
 *   where they are restored), and their pacotes belong in their own file.
 *   That is a display rule of the clinic-wide list, not an access rule.
 *
 * BOUNDED: at most PATIENT_PACKS_READ_CAP pacotes, newest purchase first, one
 * row past the cap so the tab can say it stopped.
 */
export async function listPatientPacks(
  actor: RequestContext,
  patientId: string,
  opts: { now?: Date; cap?: number } = {},
): Promise<PatientPacksPage> {
  for (const c of PACKS_IN_USE_CAPABILITIES) assertCan(actor.role, c);
  const now = opts.now ?? new Date();
  const cap = opts.cap ?? PATIENT_PACKS_READ_CAP;
  if (!Number.isInteger(cap) || cap < 1) throw new RangeError("cap must be a positive integer");
  if (!patientId) throw new RangeError("patientId is required");

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
        .where(eq(patientPackInstances.patientId, patientId))
        .orderBy(desc(patientPackInstances.purchasedAt), desc(patientPackInstances.id))
        .limit(cap + 1);

      const truncated = rows.length > cap;
      const kept: PackInstanceRow[] = rows.slice(0, cap);
      const sessionsByInstance = await readConsumingSessions(tx, kept);
      return { ...buildPatientPacks(patientId, kept, sessionsByInstance, now), truncated };
    },
    "db:patient-packs",
  );
}

/**
 * PACK PAYMENTS, "€ POR RECEBER": the pacotes named by the receivables read
 * (lib/packs/payments-read.ts, every pacote with money still to receive, in use
 * or not), as the same rows Packs em uso draws, with the same numbers.
 *
 * The same boundary as the two reads above: the same capabilities, the
 * viewer's own session, the join to `patients` (soft-deleted ones out, as on
 * Packs em uso), 0108's function for the sessions. The ids only NARROW what the
 * viewer may read; an id the viewer cannot read returns nothing. NO in-use
 * filter: a pacote with every session spent and money still owed is exactly
 * the one this list exists for. Bounded by the caller's id list, which the
 * receivables read already caps.
 */
export async function listPacksByIds(
  actor: RequestContext,
  instanceIds: readonly string[],
  query: string,
  opts: { now?: Date } = {},
): Promise<PackInUseView[]> {
  for (const c of PACKS_IN_USE_CAPABILITIES) assertCan(actor.role, c);
  if (instanceIds.length === 0) return [];
  const now = opts.now ?? new Date();
  // The outer column is named explicitly, as everywhere in this file.
  const idList = sql.join(
    instanceIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  return runScoped(
    actor,
    async (tx) => {
      const rows: PackInstanceRow[] = await tx
        .select({
          instanceId: patientPackInstances.id,
          patientId: patientPackInstances.patientId,
          patientName: patients.fullName,
          packName: servicePacks.name,
          packPriceCents: servicePacks.priceCents,
          sessionsTotal: patientPackInstances.sessionsTotal,
          legacyConsumed: patientPackInstances.legacyConsumed,
          purchasedAt: patientPackInstances.purchasedAt,
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
        .where(and(isNull(patients.deletedAt), sql`"patient_pack_instances"."id" = any(array[${idList}])`));
      const sessionsByInstance = await readConsumingSessions(tx, rows);
      return rows
        .map((r) => summarizePackInstance(r, sessionsByInstance.get(r.instanceId) ?? [], now))
        .filter((v) => matchesPatientSearch(v.patientName, query))
        .sort(comparePacksInUse);
    },
    "db:packs-by-ids",
  );
}
