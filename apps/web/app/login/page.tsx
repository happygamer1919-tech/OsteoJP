"use client";
import {
  BrandLockup,
  Banner,
  Button,
  Field,
  Input,
} from "@osteojp/ui";
import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";

import { login, type LoginState } from "./actions";
import { s } from "@/lib/i18n";

const initial: LoginState = { error: null };

type FieldErrors = { email?: string; password?: string };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initial);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Inline (client) validation per SPEC-staff-screens §11.5: empty/format errors
  // render as Field role="alert" text. Auth failures come back from the server
  // action and render as the single error Banner below — never both for the same
  // cause, and never a raw auth code or PII.
  function validate(form: HTMLFormElement): boolean {
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const next: FieldErrors = {};
    if (!email) next.email = s["login.errEmailRequired"];
    else if (!/.+@.+\..+/.test(email)) next.email = s["login.errEmailInvalid"];
    if (!password) next.password = s["login.errPasswordRequired"];
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    // Split-screen (W5-18): brand atmosphere panel + form surface. On lg the two
    // panels sit side by side, each full-height; below lg they stack — the brand
    // panel collapses to a compact header above the form card. Auth logic, the
    // server action, the route, and the field `name` attributes are unchanged
    // from the shipped W5-01 login; this loop rebuilds the visual layer only.
    <main className="grid min-h-dvh grid-cols-1 bg-v2-surface lg:grid-cols-2">
      {/* Brand atmosphere panel. Soft sage-to-off-white gradient carrying the
          large centered logo and one muted tagline line. Compact on mobile
          (auto height, reduced padding), full-height column on desktop. */}
      <section className="relative flex flex-col items-center justify-center gap-6 overflow-hidden bg-gradient-to-br from-v2-green-50 to-v2-bg px-8 py-10 text-center lg:py-16">
        <div className="login-rise flex flex-col items-center gap-5">
          <BrandLockup variant="lockup" size="xl" />
          <p className="max-w-xs text-base text-v2-text-secondary">
            {s["login.tagline"]}
          </p>
        </div>
      </section>

      {/* Form surface: clean white panel, centered card. */}
      <section className="flex items-center justify-center bg-v2-surface px-6 py-10 md:px-12">
        <form
          action={formAction}
          noValidate
          onSubmit={(e) => {
            if (!validate(e.currentTarget)) e.preventDefault();
          }}
          className="login-rise w-full max-w-sm"
        >
          <div className="mb-6 flex flex-col gap-1">
            <h1 className="text-xl text-v2-text-primary">
              {s["login.title"]}
            </h1>
            <p className="text-sm text-v2-text-secondary">
              {s["login.subtitle"]}
            </p>
          </div>

          {state.error ? (
            <div className="mb-4 overflow-hidden rounded-lg">
              <Banner tone="error">{state.error}</Banner>
            </div>
          ) : null}

          <div className="flex flex-col gap-4">
            <Field label={s["login.emailLabel"]} required error={fieldErrors.email}>
              <Input
                name="email"
                type="email"
                autoComplete="email"
                disabled={pending}
                placeholder={s["login.emailPlaceholder"]}
                className="h-11"
              />
            </Field>

            <Field label={s["login.passwordLabel"]} required error={fieldErrors.password}>
              <Input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                disabled={pending}
                className="h-11"
                trailing={
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                    aria-label={
                      showPassword
                        ? s["login.hidePassword"]
                        : s["login.showPassword"]
                    }
                    className="flex size-6 items-center justify-center rounded text-text-secondary transition motion-safe:active:scale-[0.97] hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  >
                    {showPassword ? (
                      <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                }
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={pending}
              className="mt-2 w-full"
            >
              {s["login.submit"]}
            </Button>
          </div>

          {/*
            §11.5 item 3 (secondary paths) and item 4 (pt-PT/en-GB language
            switcher) are intentionally omitted, consistent with the shipped
            portal login pattern:
            - The staff app exposes no magic-link or password-reset entry from
              /login today (only the post-reset /auth/update-password landing),
              and §11.5 scopes secondary paths to "as the app already supports
              them" — so none are rendered.
            - There is no i18n runtime in apps/web yet, so a language switcher
              would be a dead control. The portal login omits it for the same
              reason; this stays omitted until the i18n runtime lands (W4-09 is
              the strings sweep, not the runtime).
          */}
        </form>
      </section>
    </main>
  );
}
