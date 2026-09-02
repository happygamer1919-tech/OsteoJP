"use server";
import { requireRequestContext } from "@/lib/auth/context";
import { getActivePackBalance, listPatientPackInstances } from "./instances";
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

/**
 * PACK-02 — the patient's pacotes that still have sessions, for the Nova
 * marcacao notice.
 *
 * IT IS THE SAME READ THE PATIENT PROFILE USES, filtered. `packIsActive` is the
 * derived balance and not the frozen `status` column, so a pacote appears here
 * on exactly the same rule that makes it appear with sessions left on the
 * profile. Two definitions of "has sessions" would eventually disagree, and the
 * one on the booking screen is the one that would be wrong in front of a
 * patient.
 */
export async function listAvailablePacksForPatientAction(
  patientId: string,
): Promise<{ packId: string; packName: string; sessionsTotal: number; sessionsAvailable: number }[]> {
  const actor = await requireRequestContext();
  if (!patientId) return [];
  const instances = await listPatientPackInstances(actor, patientId);
  return instances
    .filter((i) => i.active)
    .map((i) => ({
      packId: i.packId,
      packName: i.packName,
      sessionsTotal: i.sessionsTotal,
      sessionsAvailable: i.sessionsAvailable,
    }));
}
