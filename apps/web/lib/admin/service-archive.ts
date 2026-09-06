/**
 * Pure decision core for the pacote-guarded service ARCHIVE (PACK-04, owner
 * ruling 2026-09-05). Kept free of `server-only` and the DB so it is
 * unit-testable in isolation, exactly like ./service-delete.
 *
 * ==========================================================================
 * WHY ARCHIVING NEEDED A GUARD AT ALL, WHEN DELETING ALREADY HAD ONE
 * ==========================================================================
 * `service_packs.base_service_id` is already one of the four hard-delete
 * blockers (./service-delete), so a service carrying a pacote can NEVER be
 * hard-deleted - it can only ever be ARCHIVED. And archiving is exactly what
 * breaks the pacote. The guard set closed one door and left the other open, and
 * the open one is the one the clinic actually uses.
 *
 * WHAT THAT COST, on production, measured rather than imagined: three services
 * were archived by renaming them to the literal string `-` and clearing
 * is_active, and ALL THREE carry a pacote. One of them, `7e3359a7`, is the row
 * the pacote "Pacote 10 - NESA" is bound to. A patient holding 7 of 10 sessions
 * could not draw a single one, because every NESA appointment carries the LIVE
 * NESA service id and the pacote points at the archived row - so the panel
 * answered `service_mismatch` on every option and the patient's screen said
 * "O utente nao tem pacotes com sessoes disponiveis para este servico."
 *
 * Nothing warned, at any point. The binding survived the archive silently.
 *
 * ==========================================================================
 * REFUSE, NOT REPOINT. The owner ruled either is acceptable; this is refuse.
 * ==========================================================================
 * Three reasons, in the order they decided it:
 *
 *   1. A SILENT AUTOMATIC REPOINT IS THE SAME CLASS OF INVISIBLE DATA CHANGE
 *      THAT CREATED THIS. The archive already moved a pacote's meaning without
 *      telling anybody; a repoint that also fires without telling anybody
 *      differs only in being harder to notice afterwards.
 *
 *   2. THERE IS NO CORRECT TARGET A MACHINE CAN DERIVE. Archiving a service is
 *      the clinic saying "we no longer offer this". Nothing in the data says
 *      which live service the people who BOUGHT that pacote actually bought.
 *      That was a judgement only the owner could make for the NESA one, and he
 *      could only make it because he knows what the clinic sells. A wrong
 *      repoint silently moves a real patient's paid sessions onto a service
 *      they did not buy, which is worse than the defect it would be fixing.
 *
 *   3. IT DOES NOT TRAP THE CLINIC, and this is why refusing is affordable.
 *      `updatePack` already lets an admin change a pacote's base service. So
 *      the workflow the refusal points at is a real one that exists today:
 *      repoint the pacote (or archive it), then archive the service.
 *
 * ==========================================================================
 * EVERY PACK COUNTS, INCLUDING AN ALREADY-ARCHIVED ONE
 * ==========================================================================
 * No `is_active` condition, deliberately, and it matches the hard-delete
 * blocker byte for byte: that one counts any `service_packs` row referencing
 * the service. Two guards on the same relationship that disagree about which
 * rows count would be a bug waiting for whichever door someone tried second.
 *
 * An archived pacote can still hold patient instances with sessions left on
 * them, so it is not a harmless row either.
 */

/** The identifying half of a `service_packs` row - all the guard needs. */
export type PackBinding = {
  id: string;
  name: string;
  baseServiceId: string;
};

/** A pacote that blocks the archive, in the order the message names them. */
export type BlockingPack = { id: string; name: string };

/**
 * The pacotes bound to `serviceId`, sorted by name so the refusal message and
 * the disabled control's tooltip read the same on every render. Sorting by a
 * uuid would be stable and meaningless; sorting by nothing would let two
 * screens disagree.
 */
export function packsBoundToService(
  packs: readonly PackBinding[],
  serviceId: string,
): BlockingPack[] {
  return packs
    .filter((p) => p.baseServiceId === serviceId)
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * True when archiving `serviceId` is allowed.
 *
 * ONLY ARCHIVING IS GUARDED. Restoring a service (`is_active` false -> true)
 * is always permitted: it can only ever REPAIR a binding, never break one, and
 * a guard that refused it would strand the three services already in this
 * state - which is the position production is in right now.
 */
export function canArchiveService(
  packs: readonly PackBinding[],
  serviceId: string,
): boolean {
  return packsBoundToService(packs, serviceId).length === 0;
}

/**
 * The named reason, for the AdminError message and for the tooltip.
 *
 * IT NAMES THE PACOTES rather than counting them. "1 pacote" tells an admin
 * that something is in the way; "Pacote 10 - NESA" tells them which screen to
 * go and fix, and this defect existed for weeks precisely because nothing
 * anywhere said the name of the thing that was broken.
 */
export function archiveBlockedReason(
  blocking: readonly BlockingPack[],
): string {
  return blocking.map((p) => p.name).join(", ");
}
