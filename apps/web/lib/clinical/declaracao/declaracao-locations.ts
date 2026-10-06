import "server-only";

import type { RequestContext } from "@osteojp/auth";
import { bookingLocationScope, isLocationBookable } from "@/lib/auth/viewer-locations";
import { listActiveLocations } from "@/lib/invoices/queries";

/** A location the dialog can offer for a manual declaration. */
export type DeclaracaoLocationOption = { id: string; name: string };

/**
 * R45: the locations the acting staff member may issue a MANUAL declaration
 * for, under their stored names. A manual entry has no marcação to take its
 * location from, and the location is never guessed, so the dialog asks.
 *
 * NOT A NEW RULE. It is the tenant's active locations, narrowed by the write
 * scope every booking already answers to (`bookingLocationScope`, STAFF-02):
 * the owner and a staff member with no assignment get every active location,
 * everyone else their own `staff_locations`. generate.ts refuses a declaration
 * on the same predicate, `isLocationBookable`, so this list is the courtesy
 * and that refusal is the control.
 */
export async function listDeclaracaoLocations(
  ctx: RequestContext,
): Promise<DeclaracaoLocationOption[]> {
  const [scope, active] = await Promise.all([bookingLocationScope(ctx), listActiveLocations(ctx)]);
  return active
    .filter((l) => isLocationBookable(scope, l.id))
    .map((l) => ({ id: l.id, name: l.name }));
}
