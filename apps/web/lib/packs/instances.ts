import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  PACK_CONSUMING_STATUS_SQL,
  packIsActive,
  packSessionsAvailable,
  packSessionsConsumed,
  patientPackInstances,
  servicePacks,
  services,
  type DbTx,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "@/lib/admin/audit";

/**
 * Per-patient pack instances. W8-01c built this as a COUNTER; RB-02 makes it a
 * DERIVED BALANCE.
 *
 * ==========================================================================
 * WHAT CHANGED, AND WHY IT IS NOT A REFACTOR
 * ==========================================================================
 * Before: booking a pacote decremented `sessions_remaining`, and a "consumir"
 * button on the patient profile decremented it again with **no appointment
 * row** — no who, no when, no slot. The balance was a number nothing could
 * reconcile against the diary, and the only thing that could correct it was
 * another press of the same button.
 *
 * After: a pacote session **is an appointment**, linked by
 * `appointments.pack_instance_id` (migration 0067), and the balance is
 *
 *     sessionsTotal - legacyConsumed - linked appointments that are not cancelled
 *
 * `@osteojp/db`'s `pack-balance` carries the formula and the reasoning for both
 * subtracted terms. Two consequences are worth stating here because they are
 * the point of the card:
 *
 * 1. **`consumir` and `restore` are DELETED, not reimplemented.** They existed
 *    for the under-24h / no-show rule. A no-show is now an appointment with
 *    `status = 'no_show'`, which the formula counts by itself, so the rule is a
 *    consequence of the data rather than a button somebody must remember. It
 *    also can no longer be applied to a patient with no appointment at all,
 *    which is what made the old counter unreconcilable.
 * 2. **`sessions_remaining` and `status` are FROZEN.** Nothing below UPDATEs
 *    either. `sessions_remaining` is the only evidence 0067's backfill can ever
 *    be checked against, and `scripts/pack-sessions-remaining-is-frozen.test.mjs`
 *    asserts in the required check that no application code writes it. A
 *    vestigial column something still writes drifts silently, which is the
 *    family of defect this project keeps paying for.
 */

/**
 * Appointments linked to an instance that CONSUME a session. One definition,
 * used by every read and by the booking path.
 */
const linkedCount = sql<number>`(
  SELECT count(*)::int FROM appointments a
   WHERE a.pack_instance_id = ${patientPackInstances.id}
     AND a.${sql.raw(PACK_CONSUMING_STATUS_SQL)}
)`;

export type PackInstanceView = {
  id: string;
  packId: string;
  packName: string;
  baseServiceName: string;
  sessionsTotal: number;
  /**
   * DERIVED. Deliberately NOT called `sessionsRemaining`: that name now belongs
   * to the frozen pre-0067 column, and reusing it for a different number is the
   * conflation this codebase keeps finding in its own instruments.
   */
  sessionsAvailable: number;
  /** What has been spent. Can exceed the total; see `packSessionsConsumed`. */
  sessionsConsumed: number;
  /** Derived, not the vestigial `status` column. */
  active: boolean;
};

export type PackBookResult = {
  instanceId: string;
  /** The pack's base service — the appointment records this as its serviceId. */
  baseServiceId: string;
  sessionsTotal: number;
  /** Available BEFORE this booking's appointments are inserted. */
  sessionsAvailableBefore: number;
  registered: boolean;
};

/**
 * Find or open the instance a pacote booking should attach to, INSIDE a
 * caller-provided tenant-scoped tx. Returns null when the pack is missing or
 * inactive — the caller maps that to a validation error with nothing written.
 *
 * ==========================================================================
 * IT NO LONGER CONSUMES ANYTHING, AND THAT IS THE WHOLE CHANGE
 * ==========================================================================
 * It used to decrement a counter here. Now it only resolves WHICH instance the
 * appointments will be linked to; the consumption happens when the caller writes
 * `pack_instance_id` on the rows it inserts, in the same transaction. So a
 * booking that rolls back consumes nothing without any compensating update, and
 * an appointment that is later cancelled returns its session by itself.
 *
 * `sessionsAvailableBefore` is returned so the caller can refuse a batch larger
 * than the balance. Refusing is the caller's job because only the caller knows
 * how many appointments it is about to insert.
 */
export async function bookPackSessionTx(
  tx: DbTx,
  actor: RequestContext,
  patientId: string,
  packId: string,
): Promise<PackBookResult | null> {
  const [pack] = await tx
    .select({
      sessionCount: servicePacks.sessionCount,
      isActive: servicePacks.isActive,
      baseServiceId: servicePacks.baseServiceId,
    })
    .from(servicePacks)
    .where(eq(servicePacks.id, packId))
    .limit(1);
  if (!pack || !pack.isActive) return null;

  /**
   * THE MOST RECENT INSTANCE WITH SESSIONS LEFT, by the DERIVED balance rather
   * than by the frozen `status` column. Filtering on `status = 'active'` would
   * read a value nothing maintains any more, and it would go on looking correct.
   */
  /**
   * THE MOST RECENT INSTANCE **WITH SESSIONS LEFT**, not simply the most recent.
   *
   * The distinction is load-bearing and it is easy to get wrong: a patient who
   * bought a second pacote before finishing the first has two rows, newest
   * first. Taking the newest unconditionally attaches to it even when it is
   * exhausted and the older one still has sessions, and the patient is charged
   * for a pacote they had already paid for. The old code avoided this with a
   * `sessions_remaining > 0` filter in SQL; the balance is derived now, so the
   * choice is made here over all of them.
   *
   * There are a handful of rows per (patient, pack), so fetching them and
   * choosing in JS costs nothing and keeps ONE definition of "available".
   */
  const instances = await tx
    .select({
      id: patientPackInstances.id,
      sessionsTotal: patientPackInstances.sessionsTotal,
      legacyConsumed: patientPackInstances.legacyConsumed,
      linked: linkedCount,
    })
    .from(patientPackInstances)
    .where(
      and(eq(patientPackInstances.patientId, patientId), eq(patientPackInstances.packId, packId)),
    )
    .orderBy(desc(patientPackInstances.purchasedAt));

  const withBalance = instances.map((i) => ({
    ...i,
    available: packSessionsAvailable({
      sessionsTotal: i.sessionsTotal,
      legacyConsumed: i.legacyConsumed,
      linkedAppointments: i.linked,
    }),
  }));
  const active = withBalance.find((i) => i.available > 0);

  if (active) {
    return {
      instanceId: active.id,
      baseServiceId: pack.baseServiceId,
      sessionsTotal: active.sessionsTotal,
      sessionsAvailableBefore: active.available,
      registered: false,
    };
  }

  /**
   * A FRESH PURCHASE. `sessions_remaining` is written ONCE, here, to the full
   * total — the honest value at purchase, when nothing has been consumed — and
   * never touched again. The frozen-column guard asserts no UPDATE writes it;
   * an INSERT of a brand-new row is not the drift that guard exists to catch,
   * and the column is NOT NULL with no default, so a row cannot be created
   * without one.
   */
  const [row] = await tx
    .insert(patientPackInstances)
    // tenant_id NOT NULL, no default; RLS WITH CHECK validates it vs the JWT.
    .values({
      tenantId: actor.tenantId,
      patientId,
      packId,
      sessionsTotal: pack.sessionCount,
      sessionsRemaining: pack.sessionCount,
      legacyConsumed: 0,
    })
    .returning({ id: patientPackInstances.id });

  await writeAudit(tx, actor, {
    action: "pack_instance.register",
    entityType: "patient_pack_instance",
    entityId: row!.id,
    metadata: { packId, patientId, sessionsTotal: pack.sessionCount },
  });

  return {
    instanceId: row!.id,
    baseServiceId: pack.baseServiceId,
    sessionsTotal: pack.sessionCount,
    sessionsAvailableBefore: pack.sessionCount,
    registered: true,
  };
}

/** The balance of the instance a new booking would attach to, or null. */
export async function getActivePackBalance(
  actor: RequestContext,
  patientId: string,
  packId: string,
): Promise<{ sessionsTotal: number; sessionsAvailable: number } | null> {
  assertCan(actor.role, "appointments:read");
  return runScoped(actor, async (tx) => {
    const rows = await tx
      .select({
        sessionsTotal: patientPackInstances.sessionsTotal,
        legacyConsumed: patientPackInstances.legacyConsumed,
        linked: linkedCount,
      })
      .from(patientPackInstances)
      .where(
        and(eq(patientPackInstances.patientId, patientId), eq(patientPackInstances.packId, packId)),
      )
      .orderBy(desc(patientPackInstances.purchasedAt));
    if (rows.length === 0) return null;

    const withBalance = rows.map((r) => ({
      sessionsTotal: r.sessionsTotal,
      sessionsAvailable: packSessionsAvailable({
        sessionsTotal: r.sessionsTotal,
        legacyConsumed: r.legacyConsumed,
        linkedAppointments: r.linked,
      }),
    }));

    /**
     * THE SAME INSTANCE `bookPackSessionTx` WOULD ATTACH TO, and the banner has
     * to agree with the booking or it tells reception one thing while the save
     * does another. First with sessions left, newest first; if none has any, the
     * newest, so the banner reads "0/10" rather than disappearing.
     */
    return withBalance.find((r) => r.sessionsAvailable > 0) ?? withBalance[0]!;
  });
}

/** All pack instances for a patient (most recent first), with pack + base-service
 *  names for display. Surfaced on the patient profile. */
export async function listPatientPackInstances(
  actor: RequestContext,
  patientId: string,
): Promise<PackInstanceView[]> {
  assertCan(actor.role, "appointments:read");
  return runScoped(actor, async (tx) => {
    const rows = await tx
      .select({
        id: patientPackInstances.id,
        packId: patientPackInstances.packId,
        packName: servicePacks.name,
        baseServiceName: services.name,
        sessionsTotal: patientPackInstances.sessionsTotal,
        legacyConsumed: patientPackInstances.legacyConsumed,
        linked: linkedCount,
      })
      .from(patientPackInstances)
      .innerJoin(servicePacks, eq(patientPackInstances.packId, servicePacks.id))
      .innerJoin(services, eq(servicePacks.baseServiceId, services.id))
      .where(eq(patientPackInstances.patientId, patientId))
      .orderBy(desc(patientPackInstances.purchasedAt));

    return rows.map((r) => {
      const inputs = {
        sessionsTotal: r.sessionsTotal,
        legacyConsumed: r.legacyConsumed,
        linkedAppointments: r.linked,
      };
      return {
        id: r.id,
        packId: r.packId,
        packName: r.packName,
        baseServiceName: r.baseServiceName,
        sessionsTotal: r.sessionsTotal,
        sessionsAvailable: packSessionsAvailable(inputs),
        sessionsConsumed: packSessionsConsumed(inputs),
        active: packIsActive(inputs),
      };
    });
  });
}
