"use client";
import {
  BrandLockup,
  Banner,
  Button,
  Field,
  HeritageCorners,
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
    <main className="relative min-h-dvh bg-bg">
      {/* Heritage frame — staff /login is the one staff surface that earns the
          full corners-plus-edges treatment (SPEC-foundation §7.6, auth-only).
          The card sits in the protected inner region; the frame never touches
          it or its focus rings. */}
      <HeritageCorners variant="corners-plus-edges" tone="magenta" />

      <div className="relative z-10 flex min-h-dvh items-center justify-center px-8 py-8 md:px-16 md:py-16">
        <form
          action={formAction}
          noValidate
          onSubmit={(e) => {
            if (!validate(e.currentTarget)) e.preventDefault();
          }}
          className="glass-card w-full max-w-sm rounded-v2 p-8 shadow-v2-float"
        >
          <div className="mb-6 flex justify-center">
            <BrandLockup variant="lockup" size="xl" />
          </div>

          <div className="mb-6 flex flex-col gap-1 text-center">
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
              />
            </Field>

            <Field label={s["login.passwordLabel"]} required error={fieldErrors.password}>
              <Input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                disabled={pending}
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
      </div>
    </main>
  );
}
