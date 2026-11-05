import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  packInstanceAgreedPrices,
  packLinkedCountSql,
  packPaymentsSchemaPresent,
  packSessionsAvailable,
  patientPackInstances,
  patients,
  servicePacks,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "@/lib/admin/audit";

/**
 * "VENDER PACK" (owner P8, 2026-11-05): open a pacote instance for a patient
 * BEFORE its first booking, with the price agreed at the sale.
 *
 * Until now an instance was created only by the first pacote booking
 * (`bookPackSessionTx` in ./instances.ts), so a pacote sold at the desk had
 * nowhere to record its price. This is the second place an instance is
 * created, and it is an INSERT only.
 *
 * ==========================================================================
 * sessions_remaining IS WRITTEN ONCE, HERE, AND THE GUARD KNOWS IT
 * ==========================================================================
 * The column is FROZEN since RB-02 (`scripts/pack-sessions-remaining-is-frozen
 * .test.mjs`): nothing may UPDATE it. It is NOT NULL with no default, so a new
 * row must name it, with the purchase-time value (the full total), exactly as
 * `bookPackSessionTx` does. This file is on that guard's allow-list by its own
 * GATE-CHANGE (#1729), and the guard also asserts this file never UPDATEs it.
 * The balance stays DERIVED (`packSessionsAvailable`).
 *
 * ==========================================================================
 * ONE RUNNING PACOTE OF A KIND AT A TIME (the lead's default, reversible)
 * ==========================================================================
 * The sale is refused while the patient already holds the SAME pacote with
 * sessions left ("Este utente já tem este pack com sessões livres"): the
 * booking path draws from the newest instance with sessions left, so a second
 * running one would be consumed first and the older one would sit unused.
 * "Sessions left" is the booking path's own rule (`packSessionsAvailable` over
 * the visits the viewer's session counts), so the refusal agrees with what a
 * booking would do.
 *
 * ==========================================================================
 * THE PRICE IS TYPED, NEVER TAKEN FROM THE CATALOGUE (P2)
 * ==========================================================================
 * The form shows today's catalogue price beside the field and never fills it;
 * this function stores exactly what was typed, as the instance's one row in
 * `pack_instance_agreed_prices`, in the same transaction as the instance.
 *
 * Nothing here is fiscal: the sale itself is made in Stylus first, by hand (S1,
 * S2, design note 1.6). The audit row carries ids and the session count, never
 * the price.
 */

export type SellPackResult =
  | { ok: true; instanceId: string }
  | { ok: false; reason: "unavailable" | "patient" | "pack" | "pack_has_free_sessions" };

const linkedCount = sql<number>`${sql.raw(packLinkedCountSql('"patient_pack_instances"."id"'))}`;

export async function sellPack(
  actor: RequestContext,
  input: { patientId: string; packId: string; agreedPriceCents: number },
): Promise<SellPackResult> {
  assertCan(actor.role, "pack_payments:record");
  assertCan(actor.role, "patients:read");
  if (!Number.isInteger(input.agreedPriceCents) || input.agreedPriceCents < 0) {
    throw new RangeError("agreedPriceCents must be a non-negative integer");
  }

  return runScoped(
    actor,
    async (tx) => {
      if (!(await packPaymentsSchemaPresent(tx))) return { ok: false as const, reason: "unavailable" as const };

      // The patient as the viewer may see them (patients_select), not deleted.
      const [patient] = await tx
        .select({ id: patients.id, deletedAt: patients.deletedAt })
        .from(patients)
        .where(eq(patients.id, input.patientId))
        .limit(1);
      if (!patient || patient.deletedAt !== null) return { ok: false as const, reason: "patient" as const };

      const [pack] = await tx
        .select({ id: servicePacks.id, sessionCount: servicePacks.sessionCount, isActive: servicePacks.isActive })
        .from(servicePacks)
        .where(eq(servicePacks.id, input.packId))
        .limit(1);
      if (!pack || !pack.isActive) return { ok: false as const, reason: "pack" as const };

      const held = await tx
        .select({
          sessionsTotal: patientPackInstances.sessionsTotal,
          legacyConsumed: patientPackInstances.legacyConsumed,
          linked: linkedCount,
        })
        .from(patientPackInstances)
        .where(and(eq(patientPackInstances.patientId, input.patientId), eq(patientPackInstances.packId, input.packId)));
      const hasFree = held.some(
        (h) =>
          packSessionsAvailable({
            sessionsTotal: h.sessionsTotal,
            legacyConsumed: h.legacyConsumed,
            linkedAppointments: Number(h.linked),
          }) > 0,
      );
      if (hasFree) return { ok: false as const, reason: "pack_has_free_sessions" as const };

      // tenant_id from the actor; 0037's policy checks it against the JWT.
      const [row] = await tx
        .insert(patientPackInstances)
        .values({
          tenantId: actor.tenantId,
          patientId: input.patientId,
          packId: input.packId,
          sessionsTotal: pack.sessionCount,
          sessionsRemaining: pack.sessionCount,
          legacyConsumed: 0,
        })
        .returning({ id: patientPackInstances.id });

      await tx.insert(packInstanceAgreedPrices).values({
        packInstanceId: row!.id,
        tenantId: actor.tenantId,
        agreedPriceCents: input.agreedPriceCents,
        createdBy: actor.userId,
      });

      await writeAudit(tx, actor, {
        action: "pack_instance.sell",
        entityType: "patient_pack_instance",
        entityId: row!.id,
        metadata: { packId: input.packId, patientId: input.patientId, sessionsTotal: pack.sessionCount },
      });

      return { ok: true as const, instanceId: row!.id };
    },
    "db:pack-sell",
  );
}
