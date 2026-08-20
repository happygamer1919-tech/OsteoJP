// The ONE place the portal resolves its Supabase configuration.
//
// LE-env-sweep-scope, the portal half. `NEXT_PUBLIC_SUPABASE_URL` was read in
// THREE modules with three different failure behaviours, and one of them was
// silent.
//
// WHAT THE SILENT ONE ACTUALLY DID. `app/portal/account/actions.ts` read
// `process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''`, fed it to `new URL()`, and
// caught the throw with `return null`. So a MISSING VARIABLE produced exactly
// the same value as A PATIENT WHO IS NOT SIGNED IN — and the caller, which
// builds the Authorization header, treats null as "no session" and sends the
// request with no header at all. The API answers 401, the account screen says
// the edit failed, and nothing anywhere names the variable.
//
// That is PORTAL-REHYDRATE 1.3's first instance verbatim: `string | null` where
// four distinct causes return the same null and the caller skips on all of them.
// The four here are (1) the variable is absent, (2) it is set to something that
// is not a URL, (3) there is no session cookie, (4) the cookie will not parse.
// The first two are DEPLOYMENT FAULTS and the last two are ordinary. Only the
// first two are logged, because logging the ordinary ones would bury them.
//
// WHY IT LOGS RATHER THAN THROWS, and the reasoning is `lib/api/base.ts`'s
// because the situation is the same: a module-scope throw fails `next build`,
// which runs without runtime secrets by design — the mistake
// /api/v1/auth/otp/trusted made and had to unwind. "A build is not a boot."
//
// THE TWO CLIENT FACTORIES WERE ALREADY LOUD, and that is why this file does
// not change their behaviour. `@supabase/ssr` throws "Your project's URL and
// API key are required to create a Supabase client!" on a falsy value
// (verified in createBrowserClient.js). They route through here for ONE reason:
// so the log names WHICH variable before the library's generic message, and so
// the source-level guard in env.test.ts can assert that no module re-derives
// this for itself.
//
// NAMES ONLY, NEVER VALUES. Standing rule 3, and it costs nothing here.

let warnedUrl = false;
let warnedKey = false;
let warnedBadUrl = false;

/**
 * The Supabase project URL, or `""` when unset — with a loud log the first time.
 *
 * Returning `""` keeps every caller's shape unchanged. `@supabase/ssr` already
 * throws on a falsy value, so the factories stay as loud as they were; the log
 * is what makes the account-screen path non-silent.
 */
export function supabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    // Once per process: a per-request log on a dead deployment is noise that
    // buries the first occurrence.
    if (!warnedUrl) {
      warnedUrl = true;
      console.error(
        "[portal] NEXT_PUBLIC_SUPABASE_URL is not set. The Supabase clients " +
          "cannot be created and the account screen cannot find a session " +
          "cookie, so a signed-in patient will look signed OUT. This is a " +
          "deployment misconfiguration, not a user error.",
      );
    }
    return "";
  }
  return value;
}

/** The anon key, or `""` when unset — with a loud log the first time. */
export function supabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    if (!warnedKey) {
      warnedKey = true;
      console.error(
        "[portal] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. The Supabase " +
          "clients cannot be created. This is a deployment misconfiguration, " +
          "not a user error.",
      );
    }
    return "";
  }
  return value;
}

/**
 * The auth cookie name Supabase stores its session under, or `null`.
 *
 * THE POINT OF THIS FUNCTION IS THE LOG, not the derivation. It exists so that
 * the caller's `catch { return null }` cannot swallow a SET-BUT-UNPARSEABLE
 * variable into the same null as "this patient is not signed in". A value that
 * is present and not a URL is the second deployment fault, and it is the one a
 * missing-variable check does not catch.
 */
export function supabaseAuthCookieName(): string | null {
  const url = supabaseUrl();
  if (!url) return null; // already logged, and already named, by supabaseUrl()
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    if (!warnedBadUrl) {
      warnedBadUrl = true;
      console.error(
        "[portal] NEXT_PUBLIC_SUPABASE_URL is set but is not a valid URL, so " +
          "the session cookie name cannot be derived and a signed-in patient " +
          "will look signed OUT. This is a deployment misconfiguration, not a " +
          "user error.",
      );
    }
    return null;
  }
}

/** Test-only. The warn-once latches are module state and would leak between cases. */
export function __resetEnvWarnings(): void {
  warnedUrl = false;
  warnedKey = false;
  warnedBadUrl = false;
}
