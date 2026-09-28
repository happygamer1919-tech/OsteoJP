/**
 * SKEW-01 S6 - IS THIS PAGE OLDER THAN THE DEPLOYMENT NOW SERVING?
 *
 * Pure and injectable (the unit test drives it with plain functions); the React
 * binding is use-deployment-check.ts.
 *
 *   - `check()` runs on the tab becoming visible and on window focus, at most
 *     once per MIN_CHECK_INTERVAL_MS, and never two at once.
 *   - An unknown client id (no deployment id, as in local dev) means no check
 *     at all: nothing is fetched and nothing reloads.
 *   - A failed or unreadable version fetch does NOTHING visible.
 *   - On a mismatch the page reloads QUIETLY (no toast), but never while a form
 *     may hold unsaved input: `setHeld(true)` defers it, and the deferred reload
 *     happens the moment `setHeld(false)` arrives.
 *   - RELOAD-LOOP GUARD. If the reload does not change the client's id (a build
 *     and a runtime that disagree about the variables, for example), the next
 *     check would see the same mismatch and reload again, every minute, forever.
 *     So the server id a reload was made FOR is remembered per tab
 *     (sessionStorage); a second mismatch against that same id stops the check
 *     for the page's life instead of reloading. If that marker cannot be
 *     written, the page does not reload at all: no guard, no reload.
 */

export const MIN_CHECK_INTERVAL_MS = 60_000;

export interface DeploymentCheckDeps {
  /** The id this page was served with, or null when unknown: then check() never fetches and never reloads. */
  clientBuildId: string | null;
  /** The id the server reports now, or null on ANY failure. Must not reject. */
  fetchServerBuildId(): Promise<string | null>;
  now(): number;
  /** Returns false when a reload was already requested for this page. */
  reloadQuietly(): boolean;
  readReloadMarker(): string | null;
  /** False when the marker could not be stored. */
  writeReloadMarker(serverBuildId: string): boolean;
}

export interface DeploymentCheck {
  check(): Promise<void>;
  setHeld(held: boolean): void;
}

export function createDeploymentCheck(deps: DeploymentCheckDeps): DeploymentCheck {
  let lastCheckAt = Number.NEGATIVE_INFINITY;
  let inFlight = false;
  let held = false;
  let stopped = false;
  let pendingFor: string | null = null;

  function reloadIfFree(): void {
    if (stopped || held || pendingFor === null) return;
    stopped = true;
    let marked = false;
    try {
      marked = deps.writeReloadMarker(pendingFor);
    } catch {
      marked = false;
    }
    if (!marked) return;
    try {
      deps.reloadQuietly();
    } catch {
      // Nothing visible, by design.
    }
  }

  async function check(): Promise<void> {
    if (deps.clientBuildId === null) return;
    if (stopped || inFlight || pendingFor !== null) return;
    const t = deps.now();
    if (t - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
    lastCheckAt = t;
    inFlight = true;
    let serverBuildId: string | null = null;
    try {
      serverBuildId = await deps.fetchServerBuildId();
    } catch {
      serverBuildId = null;
    } finally {
      inFlight = false;
    }
    if (!serverBuildId || serverBuildId === deps.clientBuildId) return;
    let marker: string | null = null;
    try {
      marker = deps.readReloadMarker();
    } catch {
      marker = null;
    }
    if (marker === serverBuildId) {
      // Already reloaded once for this very deployment and still mismatched.
      stopped = true;
      return;
    }
    pendingFor = serverBuildId;
    reloadIfFree();
  }

  return {
    check,
    setHeld(next: boolean) {
      held = next;
      reloadIfFree();
    },
  };
}
