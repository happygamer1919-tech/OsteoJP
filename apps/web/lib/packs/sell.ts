import "server-only";
import { sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { packPaymentsSchemaPresent } from "@osteojp/db";
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
 * GATE-CHANGE, and the guard also asserts this file never UPDATEs it. The
 * balance stays DERIVED (`packSessionsAvailable`): a sold pacote with no
 * booking reads every session free, and the first booking of the same pacote
 * attaches to it (the newest instance with sessions left).
 *
 * ==========================================================================
 * THE PRICE IS TYPED, NEVER TAKEN FROM THE CATALOGUE (P2)
 * ==========================================================================
 * The form shows today's catalogue price beside the field and never fills it;
 * this function stores exactly what was typed. It is written by raw SQL because
 * `agreed_price_cents` is not declared on the drizzle instance table until
 * after the apply (see schema.ts beside `packInstancePayments`), and the whole
 * sale is refused on a database without the column.
 *
 * Nothing here is fiscal: the sale itself is made in Stylus first, by hand (S1,
 * S2, design note 1.6). The audit row carries ids and the session count, never
 * the price.
 */

export type SellPackResult =
  | { ok: true; instanceId: string }
  | { ok: false; reason: "unavailable" | "patient" | "pack" };

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
      const [patient] = (await tx.execute(sql`
        select id from patients where id = ${input.patientId}::uuid and deleted_at is null
      `)) as unknown as ReadonlyArray<{ id: string }>;
      if (!patient) return { ok: false as const, reason: "patient" as const };

      const [pack] = (await tx.execute(sql`
        select id, session_count from service_packs where id = ${input.packId}::uuid and is_active
      `)) as unknown as ReadonlyArray<{ id: string; session_count: number }>;
      if (!pack) return { ok: false as const, reason: "pack" as const };
      const total = Number(pack.session_count);

      // tenant_id from the actor; 0037's policy checks it against the JWT, and
      // the pending migration's restrictive INSERT policy admits a price only
      // from owner, admin or reception.
      const [row] = (await tx.execute(sql`
        insert into patient_pack_instances
          (tenant_id, patient_id, pack_id, sessions_total, sessions_remaining, legacy_consumed, agreed_price_cents)
        values
          (${actor.tenantId}::uuid, ${input.patientId}::uuid, ${input.packId}::uuid, ${total}, ${total}, 0, ${input.agreedPriceCents})
        returning id
      `)) as unknown as ReadonlyArray<{ id: string }>;

      await writeAudit(tx, actor, {
        action: "pack_instance.sell",
        entityType: "patient_pack_instance",
        entityId: row!.id,
        metadata: { packId: input.packId, patientId: input.patientId, sessionsTotal: total },
      });

      return { ok: true as const, instanceId: row!.id };
    },
    "db:pack-sell",
  );
}
