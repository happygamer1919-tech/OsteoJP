// The ONE place the portal resolves the API origin.
//
// LE-env-sweep-scope. This existed as `process.env.NEXT_PUBLIC_API_URL ?? ''`
// copied into three modules, and the `?? ''` is a SILENT DEGRADATION of exactly
// the shape PG7 was opened for.
//
// WHAT THE EMPTY STRING ACTUALLY DID. `fetch('' + '/api/v1/patient/profile')` is
// not a failed call - it is a RELATIVE request to the PORTAL's own origin, which
// has no such route. So a missing variable produced a 404 at the patient rather
// than an error at boot: the dashboard rendered, the request looked like it went
// somewhere, and the failure surfaced as "could not load" to a person who could
// do nothing about it.
//
// That is the same class as the root-domain reschedule fallback #763 removed,
// and the same class as the Resend from-address default before it. Both looked
// healthy at boot and were guaranteed to fail at the recipient.
//
// WHY IT LOGS RATHER THAN THROWS. A module-scope throw fails `next build`, which
// runs without runtime secrets by design - that is the mistake
// /api/v1/auth/otp/trusted made and had to unwind ("a build is not a boot"). A
// loud error naming the VARIABLE, at call time, is neither silent nor confusable
// with user error, and it lets the caller decide what to show.
//
// NAMES ONLY, NEVER VALUES. Standing rule, and it costs nothing here.

let warned = false;

/**
 * The API origin, or `""` when unset — with a loud log the first time.
 *
 * Returning `""` keeps every existing caller's shape unchanged; the log is what
 * makes the degradation non-silent. Callers that can render an explicit
 * unavailable state should prefer `apiBaseOrNull`.
 */
export function apiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    // Once per process: a per-request log on a dead deployment is noise that
    // buries the first occurrence.
    if (!warned) {
      warned = true;
      console.error(
        "[portal] NEXT_PUBLIC_API_URL is not set. Every API call will resolve " +
          "RELATIVE to the portal origin and 404 at the patient. This is a " +
          "deployment misconfiguration, not a user error.",
      );
    }
    return "";
  }
  return base;
}

/**
 * The API origin, or `null` when unset. For callers that already have an
 * "unavailable" branch — the shape `requestOtp` uses for a missing
 * `PORTAL_TENANT_ID`, where the server is broken and the request was fine.
 */
export function apiBaseOrNull(): string | null {
  return apiBase() || null;
}
