/**
 * PACK-07 — the pure decision core for the held-pacote SESSION COUNT guard.
 *
 * Kept free of `server-only` and the DB so it is unit-testable in isolation,
 * exactly like ./service-archive and ./service-delete.
 *
 * ==========================================================================
 * WHAT WAS WRONG, AND IT IS WORSE THAN "AN UNGUARDED FIELD"
 * ==========================================================================
 * `updatePack` writes `session_count` on `service_packs` - the CATALOGUE row -
 * with `services:write` and no check at all. An admin who wants to move a
 * patient from a 5 to a 10 does the obvious thing: opens Administração >
 * Serviços, finds "Pacote 5", types 10, saves. The screen says saved.
 *
 * NOTHING HAPPENS FOR THAT PATIENT, AND SOMETHING HAPPENS TO EVERYBODY ELSE.
 *
 *   `patient_pack_instances.sessions_total` is a SNAPSHOT taken at purchase, and
 *   the derived balance reads it - `sessionsTotal - legacyConsumed - linked
 *   appointments` (packages/db/pack-balance.ts). Not one term of that formula
 *   comes from `service_packs`. So the holder's balance does not move by a
 *   single session.
 *
 *   Every FUTURE buyer of that pacote gets 10 under the same name and the same
 *   price the admin did not change, because `bookPackSessionTx` reads
 *   `pack.sessionCount` when it opens a NEW instance.
 *
 * So the edit silently does the opposite of what it looks like: it leaves the
 * person it was aimed at untouched and quietly re-prices the product for
 * everyone it was not aimed at. Nothing warns, at any point.
 *
 * ==========================================================================
 * IT IS THE PACK-04 FAMILY, AND THE GUARD IS SHAPED THE SAME WAY ON PURPOSE
 * ==========================================================================
 * There, `base_service_id` lives on the catalogue row, so ARCHIVING a service
 * moved the meaning of every holder's pacote and the binding survived silently.
 * Here the value ALSO lives on the catalogue row and the holder ALSO cannot
 * feel it. Same relationship, same invisibility, opposite direction - so the
 * refusal is written to look like `service-archive.ts` rather than inventing a
 * second vocabulary for the same class of mistake.
 *
 * REFUSE, NOT PROPAGATE. Writing the new count onto existing instances was the
 * obvious alternative and it is the worse one, for the reason PACK-04 records
 * about a silent automatic repoint: it is an invisible data change to somebody's
 * PAID balance, made by a machine, on the strength of an admin's guess about
 * what a catalogue edit means. And it cannot be right in general - a pacote sold
 * at 5 for one price and re-listed at 10 for another is a NEW product, not a
 * correction to the old one. Moving one patient between the two is
 * PACK-06, which is a change to the INSTANCE and is a different act with a
 * different blast radius.
 *
 * IT DOES NOT TRAP THE CLINIC. Everything else on the row stays editable - name,
 * price, base service, location - so a typo in any of them is still one edit
 * away. What the refusal points at is "create the 10 as its own pacote", which
 * is the thing the admin actually wanted and which the screen already supports.
 *
 * ==========================================================================
 * EVERY INSTANCE COUNTS, INCLUDING AN EXHAUSTED ONE
 * ==========================================================================
 * No balance condition and no `status` condition, deliberately, and it matches
 * the HARD-DELETE blocker byte for byte: `getReferencedPackIds` counts any
 * `patient_pack_instances` row referencing the pack. Two guards on the same
 * relationship that disagreed about which rows count would be a bug waiting for
 * whichever door somebody tried second - which is precisely how PACK-04 got in,
 * with delete guarded and archive open.
 *
 * An exhausted instance is not a harmless row either: it is the record of what
 * a patient BOUGHT, and a catalogue that no longer agrees with it makes that
 * record unreadable.
 */

/** What the decision reads about the pack being saved. */
export type PackSessionCountChange = {
  /** `session_count` as stored today. */
  current: number;
  /** `session_count` the admin is submitting. */
  requested: number;
  /** How many `patient_pack_instances` rows reference this pack. */
  heldBy: number;
};

/**
 * True when this save is allowed.
 *
 * THE PREDICATE IS ABOUT THE CHANGE, NOT ABOUT THE PACK. A pack with holders is
 * still fully editable; what is refused is exactly one field moving on exactly
 * such a pack. A guard that refused the whole save would stop an admin fixing a
 * price on the clinic's most-sold pacote, which is a real thing they do.
 *
 * A NO-OP SAVE IS ALWAYS ALLOWED, and that is not a loophole - it is what makes
 * every other field editable. Re-submitting the same number changes nothing for
 * a holder and nothing for a future buyer, so there is nothing to refuse.
 */
export function canChangePackSessionCount(change: PackSessionCountChange): boolean {
  if (change.requested === change.current) return true;
  return change.heldBy === 0;
}

/**
 * The named reason, for the AdminError message and the disabled control's title.
 *
 * IT REPORTS A COUNT AND NOT NAMES, WHICH IS A DELIBERATE DIVERGENCE FROM
 * PACK-04. That guard names the PACOTES it is protecting, because a pacote is a
 * catalogue row and the admin needs to know which screen to go and fix. The
 * things in the way here are PATIENTS, and Administração > Serviços is not a
 * patient surface - putting people's names on it to explain a refused number
 * would disclose who bought what to answer a question the count already answers.
 *
 * The count is also the actionable half: "3 patients hold this" tells the admin
 * to create a new pacote instead, which is the whole instruction.
 */
export function sessionCountBlockedReason(change: PackSessionCountChange): string {
  return (
    `session_count ${change.current} -> ${change.requested} refused: ` +
    `${change.heldBy} patient pack instance(s) reference this pack. Their ` +
    `sessions_total is a purchase-time snapshot and would not move; only future ` +
    `buyers would be affected. Create a separate pacote instead (PACK-07).`
  );
}
