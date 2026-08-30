/**
 * OBS-02 - drop events raised by code that is not ours.
 *
 * ==========================================================================
 * WHAT THIS IS FOR
 * ==========================================================================
 * A browser extension injected into a staff member's tab throws, and Sentry
 * attributes the exception to this application because it happened in our page.
 * `executors/200.js` is the observed example. None of it is our code, none of it
 * is actionable, and on launch day it sits on top of the one channel that is
 * supposed to tell us something is wrong.
 *
 * ==========================================================================
 * THE RULE, AND WHY IT IS THIS ONE
 * ==========================================================================
 * Everything this app ships to a browser is served from `/_next/`. So:
 *
 *   an event whose stack has frames, and NONE of whose frames is under
 *   `/_next/`, did not come from our code.
 *
 * ==========================================================================
 * IT FAILS OPEN, DELIBERATELY, AND THAT IS THE WHOLE DESIGN
 * ==========================================================================
 * A filter on an error channel can fail in two directions, and they are not
 * equally bad. Dropping noise we should have kept costs an issue nobody reads.
 * Dropping a REAL error costs the thing the channel exists for - and it does it
 * silently, which is the failure shape this project keeps cataloguing.
 *
 * So every uncertain case is KEPT:
 *   - no exception values     -> keep (messages, captureMessage, transactions)
 *   - no stacktrace           -> keep (cross-origin "Script error." has none)
 *   - no frames               -> keep
 *   - any frame under /_next/ -> keep, even if extension frames sit above it
 *
 * Only an event we can positively show is entirely foreign is dropped. That is
 * why the predicate asks "is ANY frame ours" rather than "is the TOP frame
 * theirs": an extension that wraps one of our callbacks puts its own frame on
 * top of ours, and that event is still about our code.
 *
 * Server and edge configs are deliberately NOT given this filter. A server frame
 * is never extension code, so there the same rule could only ever lose a real
 * error.
 */

/** Everything this app serves to a browser lives under this path. */
const OWN_CODE_MARKER = "/_next/";

type Frame = { filename?: string; abs_path?: string };

/**
 * True when the event can be POSITIVELY shown to contain no frame of our own.
 * Anything we cannot decide returns false, and is therefore kept.
 */
export function isForeignFrameEvent(event: {
  exception?: { values?: Array<{ stacktrace?: { frames?: Frame[] } }> };
}): boolean {
  const values = event.exception?.values;
  if (!Array.isArray(values) || values.length === 0) return false;

  let sawAnyFrame = false;
  for (const value of values) {
    const frames = value?.stacktrace?.frames;
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      const path = frame?.filename ?? frame?.abs_path;
      if (typeof path !== "string" || path === "") continue;
      sawAnyFrame = true;
      if (path.includes(OWN_CODE_MARKER)) return false; // one of ours: keep.
    }
  }
  // Frames existed and not one of them was ours.
  return sawAnyFrame;
}
