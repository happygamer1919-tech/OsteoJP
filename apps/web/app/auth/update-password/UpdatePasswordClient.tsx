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
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validatePassword } from "./password";

// Set-password landing for the staff invite flow (#3).
//
// The invite email's link points at Supabase's recovery `verify` endpoint, which
// — after validating the single-use, expiring token server-side — redirects HERE
// with the result in the URL HASH FRAGMENT (never the query, so it never reaches
// a server log):
//   success: #access_token=...&refresh_token=...&type=recovery
//   failure: #error=...&error_code=otp_expired&error_description=...
//
// So this must be a client component: only the browser sees the fragment. The
// `@supabase/ssr` browser client auto-detects the success fragment, persists the
// session to cookies, and fires onAuthStateChange — at which point the user is
// transiently authenticated and may set a password via updateUser(). We scrub
// the fragment from the URL as soon as it is read.
//
// NOTE: Supabase collapses "expired" and "already used" into the same
// `otp_expired` code (a consumed single-use link is, by then, just invalid), so
// the expired view's copy covers both cases.

const RESOLVE_TIMEOUT_MS = 8000;
const POST_SUCCESS_REDIRECT = "/dashboard";

type Phase =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; reason: "expired" | "invalid" }
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
 * locale on the client without a hydration mismatch — the sanctioned pattern for
 * client-only values.
 */
function useBrowserLocale(): Locale {
  return useSyncExternalStore(noopSubscribe, clientLocale, () => DEFAULT_LOCALE);
}

/** Non-destructive read of Supabase's verify-redirect hash params. */
function parseHashParams(): URLSearchParams {
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  return new URLSearchParams(raw);
}

/**
 * Strip any remaining fragment from the address bar. Called only AFTER the
 * Supabase client has had its chance to consume the token (it removes a valid
 * access-token fragment itself; this also clears a leftover #error fragment).
 * Scrubbing synchronously at mount would race the client's async URL detection
 * and delete a valid token before it is read.
 */
function scrubHash(): void {
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

export default function UpdatePasswordClient() {
  const router = useRouter();
  // One browser client for the lifetime of the page (shared cookie storage).
  // Lazy useState initializer: created once, never re-created across renders.
  const [supabase] = useState(createSupabaseBrowserClient);

  const locale = useBrowserLocale(); // PT-first; EN for en-* browsers.
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<StringKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const s = getStrings(locale);

  useEffect(() => {
    let settled = false;
    const settle = (next: Phase) => {
      if (settled) return;
      settled = true;
      scrubHash(); // safe now: runs from an async callback, after URL detection.
      setPhase(next);
    };

    // Read the verify-redirect fragment synchronously (before the Supabase client
    // consumes/clears it), but resolve the phase only inside the callbacks below
    // — never synchronously in the effect body (avoids cascading renders, and
    // lets the client finish detecting a valid token first).
    const params = parseHashParams();
    const hadHash = [...params.keys()].length > 0;
    const errorCode = params.get("error_code") ?? params.get("error");

    // Success path: the browser client detects the access-token fragment and
    // fires PASSWORD_RECOVERY / SIGNED_IN once the session is established.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) settle({ kind: "ready" });
    });

    // Resolve the non-success outcomes once the client has finished detecting any
    // fragment session (getSession awaits that initialization).
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settle({ kind: "ready" });
      } else if (errorCode) {
        settle({ kind: "error", reason: errorCode === "otp_expired" ? "expired" : "invalid" });
      } else if (!hadHash) {
        // Direct navigation: no token, no session — nothing to act on.
        settle({ kind: "error", reason: "invalid" });
      }
      // else: a success fragment is present but the session is still settling —
      // onAuthStateChange (or the timeout) resolves it.
    });

    // A malformed/partial fragment that yields neither a session nor an error
    // must not hang on the spinner.
    const timer = setTimeout(() => settle({ kind: "error", reason: "invalid" }), RESOLVE_TIMEOUT_MS);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);

    const invalid = validatePassword(password, confirm);
    if (invalid) {
      setFieldError(invalid);
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      // Session expired mid-flow, or the password failed Supabase's own policy.
      setFieldError("auth.setPassword.updateFailed");
      return;
    }

    setPhase({ kind: "success" });
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

      <form onSubmit={handleSubmit} className="space-y-4">
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

        {fieldError ? <p className="text-body-sm text-error">{s[fieldError]}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-brand-teal px-3 py-2 font-medium text-text-inverse hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {submitting ? s["auth.setPassword.submitting"] : s["auth.setPassword.submit"]}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="text-center">
          <span className="text-h2 font-semibold tracking-tight">
            <span className="text-brand-teal">Osteo</span>
            <span className="text-brand-magenta">JP</span>
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
