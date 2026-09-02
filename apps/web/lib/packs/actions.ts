"use server";
import { requireRequestContext } from "@/lib/auth/context";
import { getActivePackBalance } from "./instances";
import {
  linkAppointmentToPack,
  listLinkablePacks,
  type LinkablePacksView,
  type PackLinkResult,
} from "./link";

/**
 * Server actions for the pacote surfaces.
 *
 * RB-02 DELETED `adjustPackSessionAction`. It was the staff manual
 * consume/restore control on the patient profile, and it burned a session with
 * NO appointment row - no who, no when, no slot. It existed for the under-24h /
 * no-show rule, which is now a consequence of the data: a no-show is an
 * appointment with `status = 'no_show'` and the derived balance counts it.
 *
 * IT IS DELETED RATHER THAN HIDDEN. A server action left in place with its UI
 * removed is still callable by anything that can POST, and it would still write
 * a balance that nothing can reconcile.
 */

export async function getPatientPackBalanceAction(
  patientId: string,
  packId: string,
): Promise<{ sessionsTotal: number; sessionsAvailable: number } | null> {
  const actor = await requireRequestContext();
  if (!patientId || !packId) return null;
  return getActivePackBalance(actor, patientId, packId);
}

/**
 * PACK-01 — the pacotes an EXISTING appointment may be linked to.
 *
 * Read-only and eligible-only. The screen never offers an option the write
 * would refuse; the refusal reasons exist for the write path, where the state
 * may have moved since this ran.
 */
export async function listLinkablePacksAction(
  appointmentId: string,
): Promise<LinkablePacksView> {
  const actor = await requireRequestContext();
  if (!appointmentId) return { blocked: null, linkedTo: null, options: [] };
  return listLinkablePacks(actor, appointmentId);
}

/**
 * PACK-01 — link one existing appointment to one pacote instance.
 *
 * Every guard is re-decided inside the write transaction, and the UPDATE
 * carries `pack_instance_id IS NULL` in its WHERE clause, so two receptionists
 * racing for the last session cannot both win. See lib/packs/link.ts.
 */
export async function linkAppointmentToPackAction(
  appointmentId: string,
  instanceId: string,
): Promise<PackLinkResult> {
  const actor = await requireRequestContext();
  if (!appointmentId || !instanceId) return { ok: false, reason: "not_found" };
  return linkAppointmentToPack(actor, appointmentId, instanceId);
}
