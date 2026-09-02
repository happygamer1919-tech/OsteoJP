import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  appointments,
  packLinkedCountSql,
  patientPackInstances,
  servicePacks,
  services,
  type DbTx,
} from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "@/lib/admin/audit";
import {
  packLinkAppointmentBlock,
  packLinkRefusal,
  type LinkableAppointment,
  type LinkablePackInstance,
  type PackLinkRefusal,
} from "./link-core";

/**
 * PACK-01 — attaching an EXISTING appointment to a pacote the patient already
 * holds.
 *
 * ==========================================================================
 * NO MIGRATION. The link is `appointments.pack_instance_id`, a real FK added by
 * 0067, and the balance has been derived from it ever since:
 * `sessionsTotal - legacyConsumed - linked appointments that are not cancelled`.
 * So writing this column IS consuming the session; there is no counter to keep
 * in step and nothing else to update.
 * ==========================================================================
 *
 * WHY IT IS ITS OWN ACTION AND NOT A FIELD ON `updateAppointment`. That action
 * is SERIES-AWARE: `resolveSeries` can widen one edit to a whole recurrence, so
 * a pack field on it would silently attach N appointments to one pacote and
 * overdraw it in a single click. Linking is always exactly one visit.
 */

/**
 * The count of linked, session-consuming appointments, per instance.
 *
 * IDENTICAL TO instances.ts, DOWN TO THE QUOTED IDENTIFIER, and copied rather
 * than reinvented. `packLinkedCountSql`'s own header records what happened the
 * one time this was written the obvious way: an unquoted bare `id` inside
 * `FROM appointments a` resolved to `a.id`, so the predicate read
 * `a.pack_instance_id = a.id` and counted ZERO for every instance, silently.
 * The outer reference must be spelled in full and quoted.
 */
const linkedCount = sql<number>`${sql.raw(
  packLinkedCountSql('"patient_pack_instances"."id"'),
)}`;

export type LinkablePackOption = {
  instanceId: string;
  packName: string;
  baseServiceName: string;
  sessionsTotal: number;
  sessionsAvailable: number;
};

/**
 * What the screen should say about this appointment and pacotes.
 *
 * THREE OUTCOMES AND NOT TWO, because an empty list has two very different
 * meanings and they need different words. `blocked` is a fact about the VISIT
 * (already linked, cancelled, no service) that no pacote can satisfy; an empty
 * `options` with `blocked: null` means the patient simply has none that fit.
 * Collapsed into one empty list, "this visit is already linked" would read as
 * "this patient has no pacote" and somebody would go and sell them another.
 */
export type LinkablePacksView = {
  blocked: ReturnType<typeof packLinkAppointmentBlock>;
  /** The pacote it ALREADY draws from, set only when blocked is already_linked. */
  linkedTo: { packName: string; sessionsTotal: number; sessionsAvailable: number } | null;
  options: LinkablePackOption[];
};

/**
 * The pacotes this appointment may draw from.
 *
 * `options` holds ONLY the eligible ones. The screen does not offer something
 * it would then refuse; the per-instance refusal reasons exist for the WRITE
 * path, where the state may have moved since this read.
 */
export async function listLinkablePacks(
  actor: RequestContext,
  appointmentId: string,
): Promise<LinkablePacksView> {
  assertCan(actor.role, "appointments:read");
  return runScoped(actor, async (tx) => {
    const empty: LinkablePacksView = { blocked: null, linkedTo: null, options: [] };
    const appt = await readAppointment(tx, appointmentId);
    if (!appt || appt.patientId == null) return empty;

    const instances = await readInstances(tx, appt.patientId);
    const available = (i: LinkablePackInstance) =>
      Math.max(0, i.sessionsTotal - i.legacyConsumed - i.linkedAppointments);

    const blocked = packLinkAppointmentBlock(appt);
    if (blocked) {
      // NAME THE PACOTE IT IS ALREADY ON. "Already linked" without saying to
      // what sends reception to the patient profile to find out, which is the
      // question the drawer is standing in front of.
      const linked =
        appt.packInstanceId == null
          ? null
          : (instances.find((i) => i.id === appt.packInstanceId) ?? null);
      return {
        blocked,
        linkedTo: linked
          ? {
              packName: linked.packName,
              sessionsTotal: linked.sessionsTotal,
              sessionsAvailable: available(linked),
            }
          : null,
        options: [],
      };
    }

    return {
      blocked: null,
      linkedTo: null,
      options: instances
        .filter((i) => packLinkRefusal(appt, i) === null)
        .map((i) => ({
          instanceId: i.id,
          packName: i.packName,
          baseServiceName: i.baseServiceName,
          sessionsTotal: i.sessionsTotal,
          sessionsAvailable: available(i),
        })),
    };
  });
}

export type PackLinkResult =
  | { ok: true; sessionsAvailableAfter: number }
  | { ok: false; reason: PackLinkRefusal | "not_found" };

/**
 * Link one appointment to one instance.
 *
 * ==========================================================================
 * THE GUARD RUNS AGAIN HERE, INSIDE THE TRANSACTION, AND THAT IS NOT BELT AND
 * BRACES. `listLinkablePacks` answered a question at some earlier moment; by
 * the time this runs, a colleague may have spent the last session on another
 * visit. Re-deciding from rows read in THIS transaction is the only thing that
 * makes "cannot exceed the session count" true rather than usually true.
 * ==========================================================================
 *
 * THE UPDATE ALSO CARRIES `pack_instance_id IS NULL` IN ITS WHERE CLAUSE, so
 * even the window between the re-read and the write cannot double-link: the
 * database refuses the second writer rather than the second writer trusting
 * what it read. `rowCount === 0` then means somebody got there first, which is
 * reported as `already_linked` - the truth - and not as a generic error.
 */
export async function linkAppointmentToPack(
  actor: RequestContext,
  appointmentId: string,
  instanceId: string,
): Promise<PackLinkResult> {
  assertCan(actor.role, "appointments:write");
  return runScoped(actor, async (tx) => {
    const appt = await readAppointment(tx, appointmentId);
    if (!appt || appt.patientId == null) return { ok: false, reason: "not_found" as const };

    const instances = await readInstances(tx, appt.patientId);
    const inst = instances.find((i) => i.id === instanceId);
    if (!inst) return { ok: false, reason: "not_found" as const };

    const refusal = packLinkRefusal(appt, inst);
    if (refusal) return { ok: false, reason: refusal };

    const updated = await tx
      .update(appointments)
      .set({ packInstanceId: instanceId })
      .where(and(eq(appointments.id, appointmentId), isNull(appointments.packInstanceId)))
      .returning({ id: appointments.id });

    if (updated.length === 0) return { ok: false, reason: "already_linked" as const };

    await writeAudit(tx, actor, {
      action: "pack_instance.link_appointment",
      entityType: "appointment",
      entityId: appointmentId,
      // IDS AND COUNTS ONLY, never a patient name or a note (rule 7). The
      // BEFORE balance is recorded rather than the after: it is the number the
      // decision was made against, and the after is derivable from the row.
      metadata: {
        packInstanceId: instanceId,
        packId: inst.packId,
        sessionsTotal: inst.sessionsTotal,
        sessionsAvailableBefore: inst.sessionsTotal - inst.legacyConsumed - inst.linkedAppointments,
      },
    });

    return {
      ok: true,
      sessionsAvailableAfter:
        inst.sessionsTotal - inst.legacyConsumed - inst.linkedAppointments - 1,
    };
  });
}

async function readAppointment(tx: DbTx, id: string): Promise<LinkableAppointment | null> {
  const [row] = await tx
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      serviceId: appointments.serviceId,
      status: appointments.status,
      packInstanceId: appointments.packInstanceId,
    })
    .from(appointments)
    .where(eq(appointments.id, id))
    .limit(1);
  return row ?? null;
}

async function readInstances(
  tx: DbTx,
  patientId: string,
): Promise<(LinkablePackInstance & { packId: string })[]> {
  const rows = await tx
    .select({
      id: patientPackInstances.id,
      patientId: patientPackInstances.patientId,
      packId: patientPackInstances.packId,
      packName: servicePacks.name,
      baseServiceId: servicePacks.baseServiceId,
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

  return rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    packId: r.packId,
    packName: r.packName,
    baseServiceId: r.baseServiceId,
    baseServiceName: r.baseServiceName,
    sessionsTotal: r.sessionsTotal,
    legacyConsumed: r.legacyConsumed,
    linkedAppointments: r.linked,
  }));
}
