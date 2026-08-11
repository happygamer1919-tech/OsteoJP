"use client";

import { useState } from "react";
import {
  getStrings,
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
  type StringKey,
} from "@osteojp/i18n";
import { BrandLockup, Button } from "@osteojp/ui";
import { useSyncExternalStore } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { collapseRecoveryOutcome, validateRecoveryEmail } from "./request";

// LE-staff-no-forgot-password - the staff password-recovery REQUEST form.
//
// This is the entry point that did not exist. Everything downstream of it was
// already built and is not touched here: the pt-PT email body
// (supabase/templates/reset-password.html), the inert landing page
// (../update-password/), and the token_hash link shape that #837 established.
// If you are here to "finish" the recovery flow, it is already finished.
//
// ================================================================== //
// THE SUPABASE CALL RUNS IN THE BROWSER, NOT IN A SERVER ACTION.
// DO NOT "SIMPLIFY" IT INTO ONE. THE REASON IS RATE LIMITING.
// ================================================================== //
//
// A server action would look more consistent with ../../login/actions.ts, and
// it would be wrong here. This route triggers an email send from an
// UNAUTHENTICATED caller, and apps/web has no rate limiter of its own
// (SEC-r-token-no-rate-limit; the port is LOOP 6's, not this card's). So
// Supabase's own throttle on /recover is the only control that exists.
//
// That throttle keys on the CALLER. Route this through a server action and
// every request in the world arrives from one server IP: an abuser's flood and
// a real staff member's reset land in the same bucket, so one abuser can deny
// password recovery to the entire clinic - on the exact day someone is locked
// out and needs it. Calling from the browser keeps the limit keyed to whoever
// is actually making the request.
//
// The anon key is public by construction and the sibling recovery screen
// already calls Supabase auth directly from the browser
// (../update-password/UpdatePasswordClient.tsx). This adds no new exposure.
//
// ================================================================== //
// ONE SCREEN FOR EVERY OUTCOME.
// ================================================================== //
//
// Success and every failure render the same confirmation. See
// `collapseRecoveryOutcome` in ./request.ts for why, and for the cost that
// buys. The branch does not live in this file, deliberately: it lives in a pure
// function a test can hold to one value.

const FORM_ID = "forgot-password-form";

function clientLocale(): Locale {
  const lang = navigator.language?.toLowerCase() ?? "";
  const match = LOCALES.find((l) => lang.startsWith(l));
  return match ?? DEFAULT_LOCALE; // PT-first.
}

const noopSubscribe = () => () => {};

/** Same sanctioned pattern as the sibling screen: renders PT on the server and
 *  reconciles to the browser locale without a hydration mismatch. */
function useBrowserLocale(): Locale {
  return useSyncExternalStore(noopSubscribe, clientLocale, () => DEFAULT_LOCALE);
}

export default function ForgotPasswordClient() {
  const [supabase] = useState(createSupabaseBrowserClient);
  const locale = useBrowserLocale();
  const s = getStrings(locale);

  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<StringKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  /**
   * THE ONLY PLACE A RECOVERY EMAIL IS EVER REQUESTED, and it is reached only
   * by a human pressing the button.
   *
   * Nothing happens on mount. That is not merely tidy: this page's URL will end
   * up pasted into chats and support threads, and a mount-time send would turn
   * every such paste - and every link scanner that follows it - into a mail to
   * whoever the URL happened to name.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const invalid = validateRecoveryEmail(email);
    setFieldError(invalid);
    if (invalid) return;

    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    const outcome = collapseRecoveryOutcome(error);
    setSubmitting(false);

    // PG7: the send failing must not be silent, even though it must not be
    // visible to the caller. Name only - never the address.
    if (outcome.logDetail) console.error(`[auth] ${outcome.logDetail}`);

    setSent(true);
  }

  if (sent) {
    return (
      <Shell>
        <div className="space-y-2 text-center">
          <h1 className="text-h3 font-semibold text-text-primary">
            {s["auth.forgotPassword.sentTitle"]}
          </h1>
          <p className="text-body-sm text-text-secondary">
            {s["auth.forgotPassword.sentBody"]}
          </p>
          <p className="text-body-sm text-text-muted">{s["auth.forgotPassword.sentHint"]}</p>
        </div>

        <a
          href="/login"
          className="inline-block w-full rounded border border-border-strong px-3 py-2 text-center font-medium text-text-primary hover:bg-bg"
        >
          {s["auth.forgotPassword.backToLogin"]}
        </a>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-1 text-center">
        <h1 className="text-h3 font-semibold text-text-primary">
          {s["auth.forgotPassword.title"]}
        </h1>
        <p className="text-body-sm text-text-secondary">{s["auth.forgotPassword.subtitle"]}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" id={FORM_ID} data-testid={FORM_ID}>
        <label className="block space-y-1">
          <span className="text-body-sm font-medium text-text-primary">
            {s["auth.forgotPassword.emailLabel"]}
          </span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            placeholder={s["auth.forgotPassword.emailPlaceholder"]}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-border-strong px-3 py-2 text-text-primary"
          />
        </label>

        {fieldError ? (
          <p role="alert" className="text-body-sm text-error">
            {s[fieldError]}
          </p>
        ) : null}

        <Button type="submit" loading={submitting} variant="primary" className="w-full">
          {s["auth.forgotPassword.submit"]}
        </Button>
      </form>

      <a
        href="/login"
        className="block text-center text-body-sm text-text-secondary underline hover:text-text-primary"
      >
        {s["auth.forgotPassword.backToLogin"]}
      </a>
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
