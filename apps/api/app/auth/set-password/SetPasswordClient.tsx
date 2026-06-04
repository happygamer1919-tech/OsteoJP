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

// Patient activation landing. Mirrors the staff set-password client: the recovery
// link redirects here with the result in the URL HASH FRAGMENT (never the query,
// so it never reaches a server log):
//   success: #access_token=...&refresh_token=...&type=recovery
//   failure: #error=...&error_code=otp_expired&...
// Only the browser sees the fragment, so this is a client component. The
// @supabase/ssr browser client auto-detects the success fragment, persists the
// session, and lets the patient set a password via updateUser(). We scrub the
// fragment as soon as it is read.

const RESOLVE_TIMEOUT_MS = 8000;
const POST_SUCCESS_REDIRECT = "/"; // patient portal root (Wave B fills it in).

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

function useBrowserLocale(): Locale {
  return useSyncExternalStore(noopSubscribe, clientLocale, () => DEFAULT_LOCALE);
}

function parseHashParams(): URLSearchParams {
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  return new URLSearchParams(raw);
}

function scrubHash(): void {
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

export default function SetPasswordClient() {
  const router = useRouter();
  const [supabase] = useState(createSupabaseBrowserClient);

  const locale = useBrowserLocale();
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
      scrubHash();
      setPhase(next);
    };

    const params = parseHashParams();
    const hadHash = [...params.keys()].length > 0;
    const errorCode = params.get("error_code") ?? params.get("error");

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) settle({ kind: "ready" });
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settle({ kind: "ready" });
      } else if (errorCode) {
        settle({ kind: "error", reason: errorCode === "otp_expired" ? "expired" : "invalid" });
      } else if (!hadHash) {
        settle({ kind: "error", reason: "invalid" });
      }
    });

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
