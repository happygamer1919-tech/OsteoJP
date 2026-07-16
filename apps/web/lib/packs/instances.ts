import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { patientPackInstances, servicePacks, services, type DbTx } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "@/lib/admin/audit";
import {
  instanceStatus,
  resolvePackAdjust,
  resolvePackBooking,
  type AdjustDirection,
} from "./instances-core";

/**
 * W8-01c — per-patient pack instances (consumption side of the W8-01a model).
 * Booking a pack registers or decrements an instance; staff can manually
 * consume/restore a session (the under-24h/no-show rule, never a charge); the
 * patient profile lists remaining sessions. All tenant-scoped (RLS) + audited.
 */

export type PackInstanceView = {
  id: string;
  packId: string;
  packName: string;
  baseServiceName: string;
  sessionsTotal: number;
  sessionsRemaining: number;
  status: string;
};

export type PackBookResult = {
  instanceId: string;
  // The pack's base service — the appointment records this as its serviceId.
  baseServiceId: string;
  sessionsTotal: number;
  sessionsRemaining: number;
  registered: boolean;
};

/**
 * Register-or-decrement one pack session for a patient, INSIDE a caller-provided
 * tenant-scoped tx (createAppointment shares its tx so the appointment and the
 * consumption commit or roll back together). Returns null when the pack is
 * missing or inactive — the caller maps that to a validation error WITHOUT
 * having written anything (this reads before it writes). The 0037 checks
 * (remaining 0..total) are the DB backstop; resolvePackBooking never proposes an
 * out-of-range value.
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

  const [active] = await tx
    .select({
      id: patientPackInstances.id,
      sessionsTotal: patientPackInstances.sessionsTotal,
      sessionsRemaining: patientPackInstances.sessionsRemaining,
    })
    .from(patientPackInstances)
    .where(
      and(
        eq(patientPackInstances.patientId, patientId),
        eq(patientPackInstances.packId, packId),
        eq(patientPackInstances.status, "active"),
        gt(patientPackInstances.sessionsRemaining, 0),
      ),
    )
    .orderBy(desc(patientPackInstances.purchasedAt))
    .limit(1);

  const res = resolvePackBooking(active ?? null, pack.sessionCount);

  if (res.action === "register") {
    const [row] = await tx
      .insert(patientPackInstances)
      // tenant_id NOT NULL, no default; RLS WITH CHECK validates it vs the JWT.
      .values({
        tenantId: actor.tenantId,
        patientId,
        packId,
        sessionsTotal: res.sessionsTotal,
        sessionsRemaining: res.sessionsRemaining,
        status: instanceStatus(res.sessionsRemaining),
      })
      .returning({ id: patientPackInstances.id });
    await writeAudit(tx, actor, {
      action: "pack_instance.register",
      entityType: "patient_pack_instance",
      entityId: row!.id,
      metadata: {
        packId,
        patientId,
        sessionsTotal: res.sessionsTotal,
        sessionsRemaining: res.sessionsRemaining,
      },
    });
    return {
      instanceId: row!.id,
      baseServiceId: pack.baseServiceId,
      sessionsTotal: res.sessionsTotal,
      sessionsRemaining: res.sessionsRemaining,
      registered: true,
    };
  }

  await tx
    .update(patientPackInstances)
    .set({ sessionsRemaining: res.sessionsRemaining, status: instanceStatus(res.sessionsRemaining) })
    .where(eq(patientPackInstances.id, active!.id));
  await writeAudit(tx, actor, {
    action: "pack_instance.consume",
    entityType: "patient_pack_instance",
    entityId: active!.id,
    metadata: { packId, patientId, sessionsRemaining: res.sessionsRemaining },
  });
  return {
    instanceId: active!.id,
    baseServiceId: pack.baseServiceId,
    sessionsTotal: active!.sessionsTotal,
    sessionsRemaining: res.sessionsRemaining,
    registered: false,
  };
}

/** The active (still-bookable) instance's balance for a (patient, pack), or null. */
export async function getActivePackBalance(
  actor: RequestContext,
  patientId: string,
  packId: string,
): Promise<{ sessionsTotal: number; sessionsRemaining: number } | null> {
  assertCan(actor.role, "appointments:read");
  return runScoped(actor, async (tx) => {
    const [active] = await tx
      .select({
        sessionsTotal: patientPackInstances.sessionsTotal,
        sessionsRemaining: patientPackInstances.sessionsRemaining,
      })
      .from(patientPackInstances)
      .where(
        and(
          eq(patientPackInstances.patientId, patientId),
          eq(patientPackInstances.packId, packId),
          eq(patientPackInstances.status, "active"),
          gt(patientPackInstances.sessionsRemaining, 0),
        ),
      )
      .orderBy(desc(patientPackInstances.purchasedAt))
      .limit(1);
    return active ?? null;
  });
}

/** All pack instances for a patient (most recent first), with pack + base-service
 *  names for display. Surfaced on the patient profile. */
export async function listPatientPackInstances(
  actor: RequestContext,
  patientId: string,
): Promise<PackInstanceView[]> {
  assertCan(actor.role, "appointments:read");
  return runScoped(actor, (tx) =>
    tx
      .select({
        id: patientPackInstances.id,
        packId: patientPackInstances.packId,
        packName: servicePacks.name,
        baseServiceName: services.name,
        sessionsTotal: patientPackInstances.sessionsTotal,
        sessionsRemaining: patientPackInstances.sessionsRemaining,
        status: patientPackInstances.status,
      })
      .from(patientPackInstances)
      .innerJoin(servicePacks, eq(patientPackInstances.packId, servicePacks.id))
      .innerJoin(services, eq(servicePacks.baseServiceId, services.id))
      .where(eq(patientPackInstances.patientId, patientId))
      .orderBy(desc(patientPackInstances.purchasedAt)),
  );
}

export type AdjustOutcome =
  | { ok: true; sessionsRemaining: number }
  | { ok: false; error: "not_found" | "exhausted" | "complete" };

/**
 * Manual staff adjust of one instance (consume/restore a session for the
 * under-24h/no-show rule). Audited; NEVER a charge. Enforces the no-negative /
 * no-over-grant bounds (resolvePackAdjust) with the 0037 checks as backstop.
 */
export async function adjustPackInstance(
  actor: RequestContext,
  instanceId: string,
  direction: AdjustDirection,
): Promise<AdjustOutcome> {
  assertCan(actor.role, "appointments:write");
  return runScoped(actor, async (tx) => {
    const [inst] = await tx
      .select({
        id: patientPackInstances.id,
        sessionsTotal: patientPackInstances.sessionsTotal,
        sessionsRemaining: patientPackInstances.sessionsRemaining,
      })
      .from(patientPackInstances)
      .where(eq(patientPackInstances.id, instanceId))
      .limit(1);
    if (!inst) return { ok: false, error: "not_found" };

    const res = resolvePackAdjust(inst, direction);
    if (!res.ok) return { ok: false, error: res.reason };

    await tx
      .update(patientPackInstances)
      .set({ sessionsRemaining: res.sessionsRemaining, status: instanceStatus(res.sessionsRemaining) })
      .where(eq(patientPackInstances.id, instanceId));
    await writeAudit(tx, actor, {
      // Explicit direction in the action so the audit trail distinguishes a
      // manual restore (no-show reversed) from a manual consume.
      action: direction === "consume" ? "pack_instance.adjust.consume" : "pack_instance.adjust.restore",
      entityType: "patient_pack_instance",
      entityId: instanceId,
      metadata: { direction, sessionsRemaining: res.sessionsRemaining },
    });
    return { ok: true, sessionsRemaining: res.sessionsRemaining };
  });
}
