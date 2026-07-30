/**
 * PL-14 — the ONE decision every location control asks: does this viewer
 * actually have a location to choose?
 *
 * Owner CR 2026-07-30 (raised by Lurdes, admin @ Linda-a-Velha): a staffer tied
 * to a single clinic must never see a "choose location" control. The platform
 * already knows where she works (staff_locations, 0038 → viewerLocationScope),
 * so the control offered exactly one real answer and was pure noise — and on the
 * Equipa page it was worse, offering Castelo Branco to an LV-only admin because
 * that select was fed the tenant-wide location list.
 *
 * The rule, applied identically to FILTER toolbars and to FORM fields: a
 * location control renders only when it offers MORE THAN ONE real choice.
 *   - one option  → `fixed`: no control at all, the id is applied implicitly and
 *     the name is shown as a static label.
 *   - several     → `picker`, restricted to the viewer's own set. On a filter
 *     toolbar "Todas as localizações" then means "all of MINE" (the caller adds
 *     that entry; it is not an option here).
 *
 * Pure: takes the already-resolved scope (viewerLocationScope: `null` = not
 * location-restricted, i.e. owner or an unassigned staffer) and the location
 * rows the surface would have listed. No DB, no framework — unit-testable, and
 * the same decision on the server and in a client component.
 */

export type LocationOption = { id: string; label: string };

export type LocationControl<T extends LocationOption = LocationOption> =
  /** Exactly one location is reachable: apply it, render no control. */
  | { kind: "fixed"; location: T }
  /** A real choice: render a picker over exactly these options. */
  | { kind: "picker"; options: T[] };

/**
 * Decide what a location control should be for this viewer.
 *
 * `scope` is `viewerLocationScope`'s result: `null` when the viewer is not
 * location-restricted (owner, or reception/admin with no assignment — who fall
 * back to all-locations by design so onboarding never locks anyone out), or the
 * assigned location ids.
 *
 * An empty intersection (the viewer's assignment points only at locations absent
 * from `all` — deactivated, or a list the caller narrowed for another reason)
 * falls back to the FULL list rather than rendering an empty control: a stale
 * assignment must never hide the whole clinic from its own staff.
 */
export function resolveLocationControl<T extends LocationOption>(
  scope: readonly string[] | null,
  all: readonly T[],
): LocationControl<T> {
  const inScope = scope ? all.filter((l) => scope.includes(l.id)) : [...all];
  const options = inScope.length > 0 ? inScope : [...all];
  if (options.length === 1) return { kind: "fixed", location: options[0]! };
  return { kind: "picker", options };
}

/**
 * The location id a surface must USE, given the control and whatever the URL /
 * form asked for. A `fixed` control ignores the request outright — that is the
 * server-side half of "no control": a hand-typed `?location=<other clinic>` is
 * not honoured just because the select is gone. A `picker` honours the request
 * only when it names one of its own options (null = "all of mine").
 */
export function effectiveLocationId(
  control: LocationControl,
  requested: string | null | undefined,
): string | null {
  if (control.kind === "fixed") return control.location.id;
  if (!requested) return null;
  return control.options.some((o) => o.id === requested) ? requested : null;
}

/**
 * The same server-side decision expressed over the SCOPE ALONE, for the many
 * callers that must pin a location before they hold any location rows (a page
 * that fires its reads in parallel, and would otherwise serialize a query just
 * to learn a name it is not going to print).
 *
 * One assigned location  -> that id, always, whatever the URL asked for.
 * Several, or unrestricted -> the request, but only if it is inside the scope;
 * anything else collapses to `null` = "all the locations I may see".
 */
export function scopedLocationId(
  scope: readonly string[] | null,
  requested: string | null | undefined,
): string | null {
  if (scope && scope.length === 1) return scope[0]!;
  if (!requested) return null;
  if (scope && !scope.includes(requested)) return null;
  return requested;
}
