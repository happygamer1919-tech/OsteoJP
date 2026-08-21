"use server";
import { requireRequestContext } from "@/lib/auth/context";
import { getActivePackBalance } from "./instances";

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
