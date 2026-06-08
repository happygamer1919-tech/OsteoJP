"use client";
import { useActionState } from "react";
import { s } from "@/lib/i18n";
import { login, type LoginState } from "./actions";

const initial: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6 shadow-sm"
      >
        <div className="text-center">
          <span className="text-h2 font-semibold tracking-tight">
            <span className="text-brand-teal">Osteo</span>
            <span className="text-brand-magenta">JP</span>
          </span>
          <h1 className="mt-1 text-body-sm text-text-secondary">
            {s["superadmin.login.subtitle"]}
          </h1>
        </div>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={s["superadmin.login.email"]}
          className="w-full rounded border border-border-strong px-3 py-2 text-text-primary placeholder:text-text-muted"
        />
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder={s["superadmin.login.password"]}
          className="w-full rounded border border-border-strong px-3 py-2 text-text-primary placeholder:text-text-muted"
        />
        {state.error ? <p className="text-sm text-error">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-brand-teal px-3 py-2 font-medium text-text-inverse hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {pending ? s["superadmin.login.pending"] : s["superadmin.login.submit"]}
        </button>
      </form>
    </main>
  );
}
