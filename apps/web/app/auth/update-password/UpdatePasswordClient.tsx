"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  getStrings,
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
  type StringKey,
} from "@osteojp/i18n";
import { BrandLockup, Button } from "@osteojp/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validatePassword } from "./password";
import { readLinkParams, verifiableOtpType, type LinkParams } from "./link-params";

// Set-password landing. Serves BOTH staff flows: the invite and the password
// recovery. They differ only in the email that sent you here.
//
// ================================================================== //
// THE GET IS INERT. NOTHING IS SPENT BY LOADING THIS PAGE.
// ================================================================== //
//
// The emailed link now carries `?token_hash=<hash>&type=recovery|invite` as
// ORDINARY QUERY PARAMS pointing here. This page renders the password form and
// verifies NOTHING. `verifyOtp` runs only from the explicit submit.
//
// THAT IS STRICTER THAN SUPABASE'S OWN RECOMMENDED PATTERN, deliberately. Their
// sample verifies on the GET and redirects, which is still prefetch-vulnerable:
// a mail-provider scanner following the link to OUR domain would spend the token
// HERE instead of at Supabase. Same failure, moved one hop.
//
// THE SHAPE IS COPIED, NOT INVENTED. apps/web/app/r/[token]/page.tsx has done
// exactly this since the reminder lane shipped - its own comment at :217 reads
// "Still performs nothing", and redemption happens through an explicit POST. The
// auth lane simply never adopted it.
//
// ================================================================== //
// WHY THE OLD SHAPE FAILED, since this page kept the legacy path.
// ================================================================== //
//
// The old link went to Supabase's /auth/v1/verify, which consumed the token
// SERVER-SIDE and redirected here with the result in the URL HASH. Three
// independent things went wrong with that, and the fix is invariant across all
// three - which is why no further diagnosis was needed to build it:
//
//   PREFETCH. A scanner following the emailed link spent the token before the
//     human clicked. Now the emailed link spends nothing.
//   PKCE. @supabase/ssr hardcodes flowType "pkce", under which the verify
//     redirect returns `?code=` in the QUERY - but this page read only the
//     fragment, so it saw nothing and settled "invalid". Now there is no
//     fragment to read and `verifyOtp` needs no code_verifier, which an emailed
//     link opened in a fresh browser could never have had.
//   RACE. The client's async URL detection versus the effect body reading the
//     hash. There is no longer a race to lose: the token sits in a query param
//     that auth-js does not touch (it deletes "code", not "token_hash").
//
// THE LEGACY HASH PATH IS STILL HANDLED, because links sent before this shipped
// are in real inboxes and their holders are staff who need to get in.
//
// ================================================================== //
// THE ERROR SCREEN CAN NOW SAY WHAT FAILED.
// ================================================================== //
//
// The old page called scrubHash() on EVERY outcome including the error path, so
// the one screen a human was looking at had just erased the evidence. Five
// verification rounds produced no diagnosis because of it. Params are now
// captured BEFORE anything scrubs, and surfaced behind a disclosure on the error
// view - with token and session values redacted to a length, never printed.

const RESOLVE_TIMEOUT_MS = 8000;
const POST_SUCCESS_REDIRECT = "/dashboard";

type Phase =
  | { kind: "loading" }
  /** A token_hash is present and unredeemed. The form is shown; nothing has been
   *  spent. `verifyOtp` runs on submit. */
  | { kind: "ready"; verify: { tokenHash: string; type: "recovery" | "invite" } }
  /** Legacy path: a session already exists (the hash carried a valid one), so
   *  the password can be set directly. */
  | { kind: "ready"; verify: null }
  | { kind: "error"; reason: "expired" | "invalid"; detail: string }
  | { kind: "success" };

function clientLocale(): Locale {
  const lang = navigator.language?.toLowerCase() ?? "";
  const match = LOCALES.find((l) => lang.startsWith(l));
  return match ?? DEFAULT_LOCALE; // PT-first.
}

const noopSubscribe = () => () => {};

/**
 * Resolve the browser language without a setState-in-effect. useSyncExternalStore
 * renders DEFAULT_LOCALE (PT) on the server, then reconciles to the browser
 * locale on the client without a hydration mismatch.
 */
function useBrowserLocale(): Locale {
  return useSyncExternalStore(noopSubscribe, clientLocale, () => DEFAULT_LOCALE);
}

/**
 * THE URL AS IT ARRIVED, captured ONCE and never re-read.
 *
 * Module-level because `useSyncExternalStore` requires a referentially stable
 * snapshot, and because the capture must happen before ANYTHING can rewrite the
 * URL - the Supabase client's detectSessionInUrl, or our own scrubHash. The old
 * page re-read `window.location` inside an effect that ran after both, which is
 * how the evidence kept disappearing.
 */
let capturedLink: LinkParams | null = null;
function captureLink(): LinkParams {
  capturedLink ??= readLinkParams(window.location.search, window.location.hash);
  return capturedLink;
}

/**
 * Strip the fragment from the address bar. LEGACY PATH ONLY: the token_hash flow
 * has no fragment, and the query param is left alone so a reload still works.
 *
 * Safe to call at any time now, because `captureLink` already ran.
 */
function scrubHash(): void {
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

/**
 * The phase implied by the URL alone, with NO async step and NO side effect.
 *
 * THIS IS WHERE THE GET STAYS INERT. The token_hash branch resolves here,
 * synchronously, during render: no network call, no session lookup, no token
 * spent. A scanner that follows the emailed link gets an HTML page and leaves
 * the token exactly as it found it.
 *
 * It is a pure derivation rather than an effect for a second reason: setting
 * state synchronously inside an effect triggers cascading renders (and the lint
 * rule that says so is right). Deriving means there is no state to set.
 *
 * `null` means "the URL alone cannot decide" - the legacy fragment path, which
 * the effect below resolves through Supabase's async session detection.
 */
function phaseFromUrl(link: LinkParams | null): Phase | null {
  if (!link) return { kind: "loading" }; // server render: no URL to read yet.

  const otpType = verifiableOtpType(link.type);
  if (link.tokenHash && otpType) {
    return { kind: "ready", verify: { tokenHash: link.tokenHash, type: otpType } };
  }
  if (link.errorCode) {
    return {
      kind: "error",
      reason: link.errorCode === "otp_expired" ? "expired" : "invalid",
      detail: link.raw,
    };
  }
  // A token_hash with an unusable `type` is a malformed or crafted link. It is
  // NOT redeemed against a guessed type - verifiableOtpType refuses anything but
  // recovery and invite, so a link asking for a different verification cannot
  // borrow this page to perform it.
  if (link.tokenHash) return { kind: "error", reason: "invalid", detail: link.raw };
  return null; // legacy fragment path
}

export default function UpdatePasswordClient() {
  const router = useRouter();
  // One browser client for the lifetime of the page (shared cookie storage).
  const [supabase] = useState(createSupabaseBrowserClient);

  const locale = useBrowserLocale(); // PT-first; EN for en-* browsers.
  // Server snapshot is null (there is no URL there); the client reconciles to the
  // captured params without a hydration mismatch. Same sanctioned pattern as the
  // locale above.
  const link = useSyncExternalStore(noopSubscribe, captureLink, () => null);

  // `null` means "nothing has overridden the URL's own verdict yet".
  const [override, setOverride] = useState<Phase | null>(null);
  const phase: Phase = override ?? phaseFromUrl(link) ?? { kind: "loading" };

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<StringKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const s = getStrings(locale);

  // LEGACY PATH ONLY. Runs when the URL alone could not decide, which today means
  // a verify-redirect fragment from a link sent before this fix shipped. Every
  // setState here is inside an async callback, never in the effect body.
  const needsSessionCheck = link !== null && phaseFromUrl(link) === null;
  useEffect(() => {
    if (!needsSessionCheck) return;

    let settled = false;
    const settle = (next: Phase) => {
      if (settled) return;
      settled = true;
      scrubHash(); // safe: captureLink already ran, during render.
      setOverride(next);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) settle({ kind: "ready", verify: null });
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settle({ kind: "ready", verify: null });
      } else if (!capturedLink?.hadHash) {
        // Direct navigation: no token, no fragment, no session. Nothing to act on.
        settle({ kind: "error", reason: "invalid", detail: capturedLink?.raw ?? "" });
      }
      // else: a success fragment is present but the session is still settling —
      // onAuthStateChange (or the timeout) resolves it.
    });

    const timer = setTimeout(
      () => settle({ kind: "error", reason: "invalid", detail: capturedLink?.raw ?? "" }),
      RESOLVE_TIMEOUT_MS,
    );

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [supabase, needsSessionCheck]);

  // The error screen is reached with a fragment still in the address bar when the
  // failure came from a legacy verify redirect. Scrub it now that the params are
  // captured and rendered - a side effect, so it belongs in an effect.
  useEffect(() => {
    if (phase.kind === "error") scrubHash();
  }, [phase.kind]);

  /**
   * THE ONLY PLACE A TOKEN IS EVER SPENT, and it is reached only by a human
   * pressing the button. Two steps on the new path:
   *   1. verifyOtp redeems the one-time token and establishes the session.
   *   2. updateUser sets the password under that session.
   * On the legacy path the session already exists and step 1 is skipped.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);

    const invalid = validatePassword(password, confirm);
    if (invalid) {
      setFieldError(invalid);
      return;
    }
    if (phase.kind !== "ready") return;

    setSubmitting(true);

    if (phase.verify) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: phase.verify.tokenHash,
        type: phase.verify.type,
      });
      if (error) {
        setSubmitting(false);
        // The token was expired, already used, or not ours. This is the ONE
        // outcome the user can do nothing about from this screen, so it moves to
        // the error view rather than showing an inline field error.
        setOverride({
          kind: "error",
          reason: "expired",
          detail: `verifyOtp: ${error.message}`,
        });
        return;
      }
    }

    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      // The password failed Supabase's own policy, or the session lapsed.
      setFieldError("auth.setPassword.updateFailed");
      return;
    }

    setOverride({ kind: "success" });
    router.replace(POST_SUCCESS_REDIRECT);
  }

  if (phase.kind === "loading") {
    return (
      <Shell>
        <p className="text-center text-body-sm text-text-secondary">
          {s["auth.setPassword.loading"]}
        </p>
      </Shell>
    );
  }

  if (phase.kind === "error") {
    const titleKey: StringKey =
      phase.reason === "expired"
        ? "auth.setPassword.expiredTitle"
        : "auth.setPassword.invalidTitle";
    const bodyKey: StringKey =
      phase.reason === "expired"
        ? "auth.setPassword.expiredBody"
        : "auth.setPassword.invalidBody";
    return (
      <Shell>
        <div className="space-y-2 text-center">
          <h1 className="text-h3 font-semibold text-text-primary">{s[titleKey]}</h1>
          <p className="text-body-sm text-text-secondary">{s[bodyKey]}</p>
        </div>

        {/* The diagnostic line. Collapsed, so a staff member who just wants back
            in is not shown machine detail - but a failure screen that cannot say
            what failed cost this project five verification rounds. */}
        <details className="rounded border border-border bg-bg p-3">
          <summary className="cursor-pointer text-body-sm text-text-secondary">
            {s["auth.setPassword.detailsSummary"]}
          </summary>
          <pre
            data-testid="link-diagnostics"
            className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-body-sm text-text-muted"
          >
            {phase.detail}
          </pre>
        </details>

        <a
          href="/login"
          className="inline-block w-full rounded border border-border-strong px-3 py-2 text-center font-medium text-text-primary hover:bg-bg"
        >
          {s["auth.setPassword.backToLogin"]}
        </a>
      </Shell>
    );
  }

  if (phase.kind === "success") {
    return (
      <Shell>
        <div className="space-y-2 text-center">
          <h1 className="text-h3 font-semibold text-text-primary">
            {s["auth.setPassword.successTitle"]}
          </h1>
          <p className="text-body-sm text-text-secondary">{s["auth.setPassword.successBody"]}</p>
        </div>
      </Shell>
    );
  }

  // ready
  return (
    <Shell>
      <div className="space-y-1 text-center">
        <h1 className="text-h3 font-semibold text-text-primary">{s["auth.setPassword.title"]}</h1>
        <p className="text-body-sm text-text-secondary">{s["auth.setPassword.subtitle"]}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" data-testid="set-password-form">
        <label className="block space-y-1">
          <span className="text-body-sm font-medium text-text-primary">
            {s["auth.setPassword.passwordLabel"]}
          </span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-border-strong px-3 py-2 text-text-primary"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-body-sm font-medium text-text-primary">
            {s["auth.setPassword.confirmLabel"]}
          </span>
          <input
            type="password"
            name="confirm"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded border border-border-strong px-3 py-2 text-text-primary"
          />
        </label>

        <p className="text-body-sm text-text-muted">{s["auth.setPassword.hint"]}</p>

        {fieldError ? <p role="alert" className="text-body-sm text-error">{s[fieldError]}</p> : null}

        <Button type="submit" loading={submitting} variant="primary" className="w-full">
          {s["auth.setPassword.submit"]}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="flex justify-center">
          <BrandLockup variant="lockup" />
        </div>
        {children}
      </div>
    </main>
  );
}
