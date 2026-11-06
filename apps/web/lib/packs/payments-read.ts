import "server-only";
import { sql } from "drizzle-orm";
import { assertCan, can } from "@osteojp/auth";
import { packPaymentsSchemaPresent } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import {
  lisbonMonthBounds,
  summarizePackPayments,
  type PackPaymentKind,
  type PackPaymentLine,
  type PackPaymentMethod,
  type PackPaymentSummary,
} from "./payments";

/**
 * PACK PAYMENTS, the read side. Every decision is in `./payments.ts`; this file
 * fetches rows and nothing else.
 *
 * ==========================================================================
 * GUARDED TWICE: THE CAPABILITY, THEN THE SCHEMA
 * ==========================================================================
 * 1. `pack_payments:read` (owner, admin, reception). A therapist gets `null`
 *    and the screens show no amount (P4). The database says the same: neither
 *    pack money table's SELECT policy admits a therapist.
 * 2. `packPaymentsSchemaPresent`. Both tables come from a PENDING migration;
 *    on a database without them every read here answers `null` (or
 *    "unavailable") and the pages read as before ("Pagamento: em breve"). A
 *    query naming either would raise 42P01 and take the whole page down.
 *
 * ==========================================================================
 * AS THE VIEWER, JOINED TO patients
 * ==========================================================================
 * Every statement runs inside `runScoped`, under the viewer's own JWT, and
 * joins the instance to `patients`, so `patients_select` decides which
 * pacotes' money a located receptionist or admin sees, exactly as Packs em uso
 * decides which pacotes they see. The two money tables' own policies are
 * tenant and role only.
 *
 * THE AGREED PRICE is a row of `pack_instance_agreed_prices` (one at most per
 * instance); no row is "Preço por indicar", never a catalogue number.
 *
 * NEVER THE invoices TABLE. Pack money is not invoiced revenue (P7) and is not
 * a Stylus posting input (S2); `scripts/pack-payments-census.test.mjs` pins
 * that no file reading the payment tables writes invoices, and that no revenue
 * file reads or imports them.
 */

const ids = (instanceIds: readonly string[]) =>
  sql.join(
    instanceIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

/** Null when the viewer may not see amounts or the schema is not there yet. */
export async function readPackPaymentSummaries(
  actor: RequestContext,
  instanceIds: readonly string[],
): Promise<Map<string, PackPaymentSummary> | null> {
  if (!can(actor.role, "pack_payments:read")) return null;
  return runScoped(
    actor,
    async (tx) => {
      if (!(await packPaymentsSchemaPresent(tx))) return null;
      const out = new Map<string, PackPaymentSummary>();
      if (instanceIds.length === 0) return out;
      const instances = (await tx.execute(sql`
        select i.id, ap.agreed_price_cents, i.switch_amount_cents
          from patient_pack_instances i
          join patients p on p.id = i.patient_id and p.tenant_id = i.tenant_id
          left join pack_instance_agreed_prices ap on ap.pack_instance_id = i.id
         where i.id = any(array[${ids(instanceIds)}])
      `)) as unknown as ReadonlyArray<{
        id: string;
        agreed_price_cents: number | null;
        switch_amount_cents: number | null;
      }>;
      const lines = (await tx.execute(sql`
        select l.pack_instance_id, l.kind, l.amount_cents, l.received_on::text as received_on, l.stylus_ref
          from pack_instance_payments l
         where l.pack_instance_id = any(array[${ids(instanceIds)}])
      `)) as unknown as ReadonlyArray<{
        pack_instance_id: string;
        kind: PackPaymentKind;
        amount_cents: number;
        received_on: string;
        stylus_ref: string | null;
      }>;
      const byInstance = new Map<
        string,
        { kind: PackPaymentKind; amountCents: number; receivedOn: string; stylusRef: string | null }[]
      >();
      for (const l of lines) {
        const list = byInstance.get(l.pack_instance_id) ?? [];
        list.push({ kind: l.kind, amountCents: Number(l.amount_cents), receivedOn: l.received_on, stylusRef: l.stylus_ref });
        byInstance.set(l.pack_instance_id, list);
      }
      for (const i of instances) {
        out.set(
          i.id,
          summarizePackPayments(
            i.agreed_price_cents === null ? null : Number(i.agreed_price_cents),
            i.switch_amount_cents === null ? null : Number(i.switch_amount_cents),
            byInstance.get(i.id) ?? [],
          ),
        );
      }
      return out;
    },
    "db:pack-payments-summaries",
  );
}

/**
 * THE RECEIVABLES READ, for "€ POR RECEBER". Every pacote of the patients the
 * viewer may read (not deleted) that HAS a stated price and has received less
 * than is due (price + switch amount), whether or not it is still in use: a
 * pacote whose sessions are all spent but which was never paid in full is
 * exactly the one reception must chase, and an in-use filter would hide it.
 *
 * BOUNDED like Packs em uso: newest purchase first, at most `cap`, one row past
 * it so the page can say it stopped. Null for a viewer without amounts or
 * before the sitting.
 */
export const RECEIVABLES_READ_CAP = 1000;

export async function listReceivableInstanceIds(
  actor: RequestContext,
  opts: { cap?: number } = {},
): Promise<{ ids: string[]; truncated: boolean } | null> {
  if (!can(actor.role, "pack_payments:read")) return null;
  const cap = opts.cap ?? RECEIVABLES_READ_CAP;
  if (!Number.isInteger(cap) || cap < 1) throw new RangeError("cap must be a positive integer");
  return runScoped(
    actor,
    async (tx) => {
      if (!(await packPaymentsSchemaPresent(tx))) return null;
      const rows = (await tx.execute(sql`
        select i.id
          from patient_pack_instances i
          join patients p on p.id = i.patient_id and p.tenant_id = i.tenant_id
          join pack_instance_agreed_prices ap on ap.pack_instance_id = i.id
         where p.deleted_at is null
           and ap.agreed_price_cents + coalesce(i.switch_amount_cents, 0)
               - coalesce((select sum(l.amount_cents) from pack_instance_payments l where l.pack_instance_id = i.id), 0) > 0
         order by i.purchased_at desc, i.id desc
         limit ${cap + 1}
      `)) as unknown as ReadonlyArray<{ id: string }>;
      return { ids: rows.slice(0, cap).map((r) => r.id), truncated: rows.length > cap };
    },
    "db:pack-payments-receivables",
  );
}

/**
 * "Packs recebidos (registo interno, não fiscal)" (P7): the sum of every line
 * of the current Lisbon month, refunds and corrections included, for the
 * pacotes of the patients the viewer may read. Shown on Packs em uso ONLY,
 * never in Faturação or the Painel.
 */
export async function readPacksReceivedThisMonth(
  actor: RequestContext,
  now: Date = new Date(),
): Promise<{ cents: number; first: string; last: string } | null> {
  if (!can(actor.role, "pack_payments:read")) return null;
  const { first, last } = lisbonMonthBounds(now);
  return runScoped(
    actor,
    async (tx) => {
      if (!(await packPaymentsSchemaPresent(tx))) return null;
      const [row] = (await tx.execute(sql`
        select coalesce(sum(l.amount_cents), 0)::bigint as cents
          from pack_instance_payments l
          join patient_pack_instances i on i.id = l.pack_instance_id
          join patients p on p.id = i.patient_id and p.tenant_id = i.tenant_id
         where l.received_on between ${first}::date and ${last}::date
      `)) as unknown as ReadonlyArray<{ cents: string | number }>;
      return { cents: Number(row?.cents ?? 0), first, last };
    },
    "db:pack-payments-month",
  );
}

export type PackPaymentDetail = {
  instanceId: string;
  patientId: string;
  patientName: string;
  packName: string;
  /** "Preço de tabela hoje": the catalogue price NOW, shown beside, never stored. */
  catalogPriceCents: number;
  sessionsTotal: number;
  purchasedAt: Date;
  summary: PackPaymentSummary;
  lines: PackPaymentLine[];
};

/** One pacote's money, for its payment page. Null when not visible; "unavailable" before the sitting. */
export async function getPackPaymentDetail(
  actor: RequestContext,
  instanceId: string,
): Promise<PackPaymentDetail | null | "unavailable"> {
  assertCan(actor.role, "pack_payments:read");
  return runScoped(
    actor,
    async (tx) => {
      if (!(await packPaymentsSchemaPresent(tx))) return "unavailable" as const;
      const [inst] = (await tx.execute(sql`
        select i.id, i.patient_id, p.full_name, sp.name as pack_name, sp.price_cents,
               i.sessions_total, i.purchased_at, ap.agreed_price_cents, i.switch_amount_cents
          from patient_pack_instances i
          join patients p on p.id = i.patient_id and p.tenant_id = i.tenant_id
          join service_packs sp on sp.id = i.pack_id
          left join pack_instance_agreed_prices ap on ap.pack_instance_id = i.id
         where i.id = ${instanceId}::uuid
      `)) as unknown as ReadonlyArray<{
        id: string;
        patient_id: string;
        full_name: string;
        pack_name: string;
        price_cents: number;
        sessions_total: number;
        purchased_at: string | Date;
        agreed_price_cents: number | null;
        switch_amount_cents: number | null;
      }>;
      if (!inst) return null;
      const rows = (await tx.execute(sql`
        select l.id, l.kind, l.amount_cents, l.received_on::text as received_on, l.method,
               l.stylus_ref, l.reason, loc.name as location_name, l.created_at
          from pack_instance_payments l
          left join locations loc on loc.id = l.location_id
         where l.pack_instance_id = ${instanceId}::uuid
         order by l.received_on, l.created_at, l.id
      `)) as unknown as ReadonlyArray<{
        id: string;
        kind: PackPaymentKind;
        amount_cents: number;
        received_on: string;
        method: PackPaymentMethod | null;
        stylus_ref: string | null;
        reason: string | null;
        location_name: string | null;
        created_at: string | Date;
      }>;
      const lines: PackPaymentLine[] = rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        amountCents: Number(r.amount_cents),
        receivedOn: r.received_on,
        method: r.method,
        stylusRef: r.stylus_ref,
        reason: r.reason,
        locationName: r.location_name,
        createdAt: new Date(r.created_at),
      }));
      const agreed = inst.agreed_price_cents === null ? null : Number(inst.agreed_price_cents);
      const sw = inst.switch_amount_cents === null ? null : Number(inst.switch_amount_cents);
      return {
        instanceId: inst.id,
        patientId: inst.patient_id,
        patientName: inst.full_name,
        packName: inst.pack_name,
        catalogPriceCents: Number(inst.price_cents),
        sessionsTotal: Number(inst.sessions_total),
        purchasedAt: new Date(inst.purchased_at),
        summary: summarizePackPayments(agreed, sw, lines),
        lines,
      };
    },
    "db:pack-payment-detail",
  );
}

export type PaymentLocation = { id: string; name: string };

/** The clinics a payment may be recorded at: the tenant's active locations. */
export async function listPaymentLocations(actor: RequestContext): Promise<PaymentLocation[]> {
  assertCan(actor.role, "pack_payments:record");
  return runScoped(actor, async (tx) => {
    const rows = (await tx.execute(sql`
      select id, name from locations where is_active order by name
    `)) as unknown as ReadonlyArray<PaymentLocation>;
    return rows.map((r) => ({ id: r.id, name: r.name }));
  });
}

export type SellablePack = { id: string; name: string; sessionCount: number; catalogPriceCents: number };

/** "Vender pack": the tenant's active pacotes, with today's catalogue price to show BESIDE the field. */
export async function listSellablePacks(actor: RequestContext): Promise<SellablePack[]> {
  assertCan(actor.role, "pack_payments:record");
  return runScoped(actor, async (tx) => {
    const rows = (await tx.execute(sql`
      select id, name, session_count, price_cents from service_packs where is_active order by name
    `)) as unknown as ReadonlyArray<{ id: string; name: string; session_count: number; price_cents: number }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      sessionCount: Number(r.session_count),
      catalogPriceCents: Number(r.price_cents),
    }));
  });
}

/** The chosen patient's name for the sale form, as the viewer may see them; null otherwise. */
export async function getSellPatient(
  actor: RequestContext,
  patientId: string,
): Promise<{ id: string; name: string } | null> {
  assertCan(actor.role, "patients:read");
  return runScoped(actor, async (tx) => {
    const [row] = (await tx.execute(sql`
      select id, full_name from patients where id = ${patientId}::uuid and deleted_at is null
    `)) as unknown as ReadonlyArray<{ id: string; full_name: string }>;
    return row ? { id: row.id, name: row.full_name } : null;
  });
}

/** Whether the money screens can be offered at all on this database. */
export async function packPaymentsAvailable(actor: RequestContext): Promise<boolean> {
  return runScoped(actor, (tx) => packPaymentsSchemaPresent(tx), "db:pack-payments-present");
}
