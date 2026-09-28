import { unstable_isUnrecognizedActionError, unstable_rethrow } from "next/navigation";

/**
 * SKEW-01 - WHAT A REJECTED SERVER-ACTION CALL MEANS, DECIDED ONCE.
 *
 * Every class below is read off Next 16.2.6's own client code, not guessed:
 *
 *   "skew"      The server answered `x-nextjs-action-not-found: 1` (the action
 *               id belongs to another deployment). fetchServerAction checks that
 *               header first and throws UnrecognizedActionError
 *               (next/dist/client/components/router-reducer/reducers/
 *               server-action-reducer.js:76-83). Classified with Next's public
 *               predicate, which is instanceof-based (unrecognized-action-
 *               error.js:29-31). The `name` check is a fallback for a second copy
 *               of the class in another chunk; the class sets that name itself
 *               (unrecognized-action-error.js:23-28).
 *
 *   "network"   The POST never got an answer. The action fetch has no try/catch
 *               (server-action-reducer.js:70-74), so the browser's raw TypeError
 *               reaches the caller unchanged. Classified with instanceof, NEVER by
 *               message: Chromium says "Failed to fetch", Firefox "NetworkError
 *               when attempting to fetch resource.", WebKit "Load failed". A
 *               server-side TypeError does not land here: React Flight
 *               deserialises a server error as a plain Error.
 *
 *   "handled-redirect"
 *               The action called redirect() (logout, and requireRequestContext
 *               in lib/auth/context.ts:230). Next rejects the caller's promise
 *               with a redirect error it marks `handled = true` AND performs the
 *               navigation itself from the reducer (server-action-reducer.js:
 *               215-234, then the navigate at :293/:301; the flag is set at
 *               :308-312). The navigation is already under way, so the caller
 *               must do nothing more: rethrowing would make app-router.js:
 *               181-197 push the same URL a second time.
 *
 *   "control-flow"
 *               Any other Next control-flow error (a redirect error without the
 *               flag, notFound). No action this wrapper covers produces one
 *               today; if one ever does it is handed back to Next, never
 *               swallowed (see run-action.ts).
 *
 *   "other"     Everything else, including the AUTH_UNAVAILABLE outage throw
 *               (lib/auth/context.ts:216), which reaches the client as a plain
 *               Error with Next's production message, and E394 "An unexpected
 *               response was received from the server." (server-action-
 *               reducer.js:114-123).
 */
export type ActionErrorClass = "skew" | "network" | "handled-redirect" | "control-flow" | "other";

function isNextControlFlow(error: unknown): boolean {
  try {
    // Public API: rethrows exactly Next's internal control-flow errors.
    unstable_rethrow(error);
    return false;
  } catch {
    return true;
  }
}

function isHandled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "handled" in error &&
    (error as { handled?: unknown }).handled === true
  );
}

export function classifyActionError(error: unknown): ActionErrorClass {
  if (isNextControlFlow(error)) return isHandled(error) ? "handled-redirect" : "control-flow";
  if (
    unstable_isUnrecognizedActionError(error) ||
    (error instanceof Error && error.name === "UnrecognizedActionError")
  ) {
    return "skew";
  }
  if (error instanceof TypeError) return "network";
  return "other";
}
