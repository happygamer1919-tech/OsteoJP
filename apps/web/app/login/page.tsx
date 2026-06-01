"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <form action={formAction} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Entrar na OsteoJP</h1>
        <input name="email" type="email" autoComplete="email" required placeholder="Email"
          className="w-full rounded border px-3 py-2" />
        <input name="password" type="password" autoComplete="current-password" required placeholder="Palavra-passe"
          className="w-full rounded border px-3 py-2" />
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        <button type="submit" disabled={pending}
          className="w-full rounded bg-[#45B9A7] px-3 py-2 text-white disabled:opacity-50">
          {pending ? "A entrar..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
