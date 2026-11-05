import "server-only";
import { sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { packInstancePayments, packPaymentsSchemaPresent } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "@/lib/admin/audit";
import type { PackPaymentInput } from "./payments";

/**
 * PACK PAYMENTS, the write side: one line of money, and with the first payment
 * the agreed price (P2), in ONE transaction with its audit row.
 *
 * ==========================================================================
 * THE RULES ARE THE DATABASE'S, AND THIS FILE SAYS THEM FIRST
 * ==========================================================================
 * - Who: `pack_payments:record` (owner, admin, reception); a correcao also
 *   needs `pack_payments:correct` (owner, admin). The pending migration's
 *   INSERT policy says the same, so a caller that skipped this check would
 *   still be refused.
 * - Which pacote: one the viewer can see, read joined to `patients` under the
 *   viewer's own RLS, as Packs em uso reads it.
 * - Which clinic: an active location of the tenant.
 * - The agreed price is SET ONCE: the UPDATE carries `agreed_price_cents IS
 *   NULL` in its WHERE, and the restrictive policy refuses anything else, so two
 *   receptionists typing a price at once cannot both win; the loser's whole
 *   transaction rolls back, line included.
 * - APPEND ONLY. There is no update and no delete of a line anywhere: a mistake
 *   is a new line (a correcao by owner or admin).
 *
 * The audit row carries ids, the kind and two booleans. Never the amount and
 * never the reason (design note 2.1; CLAUDE.md rule 7): the reason lives on the
 * line, where the same RLS as the money covers it.
 *
 * NEVER THE invoices TABLE, and nothing here is fiscal (S1, S2, ruling B4).
 */

export type RecordPackPaymentResult =
  | { ok: true; lineId: string }
  | {
      ok: false;
      reason: "unavailable" | "not_found" | "location" | "price_already_set" | "price_required";
    };

class Refused extends Error {
  constructor(readonly reason: Extract<RecordPackPaymentResult, { ok: false }>["reason"]) {
    super(reason);
  }
}

export async function recordPackPayment(
  actor: RequestContext,
  input: PackPaymentInput,
): Promise<RecordPackPaymentResult> {
  assertCan(actor.role, "pack_payments:record");
  if (input.kind === "correcao") assertCan(actor.role, "pack_payments:correct");

  try {
    return await runScoped(
      actor,
      async (tx) => {
        if (!(await packPaymentsSchemaPresent(tx))) throw new Refused("unavailable");

        const [inst] = (await tx.execute(sql`
          select i.id, i.agreed_price_cents
            from patient_pack_instances i
            join patients p on p.id = i.patient_id and p.tenant_id = i.tenant_id
           where i.id = ${input.instanceId}::uuid
        `)) as unknown as ReadonlyArray<{ id: string; agreed_price_cents: number | null }>;
        if (!inst) throw new Refused("not_found");

        const [loc] = (await tx.execute(sql`
          select id from locations where id = ${input.locationId}::uuid and is_active
        `)) as unknown as ReadonlyArray<{ id: string }>;
        if (!loc) throw new Refused("location");

        let setAgreedPrice = false;
        if (inst.agreed_price_cents === null && input.kind === "pagamento") {
          if (input.agreedPriceCents === null) throw new Refused("price_required");
          const updated = (await tx.execute(sql`
            update patient_pack_instances
               set agreed_price_cents = ${input.agreedPriceCents}, updated_at = now()
             where id = ${input.instanceId}::uuid and agreed_price_cents is null
            returning id
          `)) as unknown as ReadonlyArray<{ id: string }>;
          if (updated.length !== 1) throw new Refused("price_already_set");
          setAgreedPrice = true;
        }

        const [line] = await tx
          .insert(packInstancePayments)
          .values({
            tenantId: actor.tenantId,
            packInstanceId: input.instanceId,
            locationId: input.locationId,
            kind: input.kind,
            amountCents: input.amountCents,
            receivedOn: input.receivedOn,
            method: input.method,
            stylusRef: input.stylusRef,
            reason: input.reason,
            createdBy: actor.userId,
          })
          .returning({ id: packInstancePayments.id });

        await writeAudit(tx, actor, {
          action: "pack_payment.record",
          entityType: "pack_instance_payment",
          entityId: line!.id,
          metadata: {
            packInstanceId: input.instanceId,
            kind: input.kind,
            hasStylusRef: input.stylusRef !== null,
            setAgreedPrice,
          },
        });

        return { ok: true as const, lineId: line!.id };
      },
      "db:pack-payment-record",
    );
  } catch (e) {
    if (e instanceof Refused) return { ok: false, reason: e.reason };
    throw e;
  }
}
