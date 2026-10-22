import { classifyActionError } from "@/lib/actions/classify-action-error";

import type { LoginState } from "./actions";

/**
 * OSTEOJP-WEB-7 - A /login TAB OLDER THAN THE DEPLOYMENT NOW SERVING.
 *
 * A tab opened before a deploy still names the OLD server action when the form
 * is submitted. Once that deployment is past Vercel Skew Protection's max age,
 * the new deployment does not know the action id: the POST answers 404 with
 * `x-nextjs-action-not-found: 1` and Next rejects the call with
 * UnrecognizedActionError. Unhandled, that rejection went to the error boundary
 * and the person signing in was stuck.
 *
 * Ruling (Tier A): catch exactly that error, show one line, reload the page.
 *
 *   - DETECTION is classifyActionError(...) === "skew": Next 16's public
 *     `unstable_isUnrecognizedActionError` plus the class-name fallback, the
 *     same predicate the /agenda action runner uses. Every other rejection,
 *     including Next's own redirect after a successful sign-in, is rethrown
 *     untouched.
 *   - The reload is DEFERRED by RELOAD_DELAY_MS so the line can be read.
 *   - RELOAD-LOOP GUARD. The time of the last reload is kept per tab in
 *     sessionStorage. A second stale failure within RELOAD_GUARD_MS of it shows
 *     the line and does NOT reload again. If the marker cannot be read or
 *     written (storage blocked), the page still reloads: here a reload only ever
 *     follows the person's own submit, so it cannot cycle by itself, and
 *     refusing it would leave them on the broken tab this fix exists to leave.
 *   - Nothing typed is read, logged or sent by this module. The FormData is
 *     handed to the server action exactly as before and nowhere else.
 */

export const RELOAD_MARKER_KEY = "osteojp.login.staleActionReloadAt";
export const RELOAD_GUARD_MS = 60_000;
export const RELOAD_DELAY_MS = 1_200;

export type LoginClientState = LoginState & { staleAction: boolean };

export interface StaleReloadDeps {
  now(): number;
  readMarker(): string | null;
  writeMarker(value: string): void;
  reload(): void;
  schedule(fn: () => void, ms: number): void;
}

export type StaleOutcome = "reloading" | "guarded";

export function handleStaleAction(deps: StaleReloadDeps): StaleOutcome {
  const t = deps.now();
  let last: number | null = null;
  try {
    const raw = deps.readMarker();
    last = raw === null ? null : Number(raw);
  } catch {
    last = null;
  }
  if (last !== null && Number.isFinite(last) && t - last >= 0 && t - last < RELOAD_GUARD_MS) {
    return "guarded";
  }
  try {
    deps.writeMarker(String(t));
  } catch {
    // Storage blocked: reload anyway (see the header).
  }
  deps.schedule(() => {
    try {
      deps.reload();
    } catch {
      // Nothing more to do; the line is already on screen.
    }
  }, RELOAD_DELAY_MS);
  return "reloading";
}

type ServerLogin = (prev: LoginState, formData: FormData) => Promise<LoginState>;

export function withStaleActionReload(
  action: ServerLogin,
  deps: StaleReloadDeps,
): (prev: LoginClientState, formData: FormData) => Promise<LoginClientState> {
  return async (prev, formData) => {
    try {
      const next = await action({ error: prev.error }, formData);
      return { ...next, staleAction: false };
    } catch (error) {
      if (classifyActionError(error) !== "skew") throw error;
      handleStaleAction(deps);
      return { error: null, staleAction: true };
    }
  };
}

/** The browser instance. Every member touches `window` only when called. */
export const browserStaleReloadDeps: StaleReloadDeps = {
  now: () => Date.now(),
  readMarker: () => window.sessionStorage.getItem(RELOAD_MARKER_KEY),
  writeMarker: (value) => window.sessionStorage.setItem(RELOAD_MARKER_KEY, value),
  reload: () => window.location.reload(),
  schedule: (fn, ms) => {
    window.setTimeout(fn, ms);
  },
};
