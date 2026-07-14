"use client";

import { useState, useTransition } from "react";
import { DEFAULT_LOCALE, getStrings, type StringKey } from "@osteojp/i18n";
import { Button, Input } from "@osteojp/ui";

import { validatePassword } from "../auth/update-password/password";
import { changeOwnPasswordAction, updateOwnProfileAction } from "./actions";

const s = getStrings(DEFAULT_LOCALE);

/**
 * W6-02 (b) - self-service profile form. Two independent sections: edit own name
 * and change own password. Email is the sign-in identifier (the users unique key
 * + Supabase auth identity) and is shown read-only here. Own-account scoping is
 * enforced server-side in actions.ts; this form never sends a user id.
 */
export function ProfileClient({ initialName, email }: { initialName: string; email: string }) {
  return (
    <main className="mx-auto max-w-xl space-y-8 py-2">
      <div className="space-y-1">
        <h1 className="text-2xl text-v2-text-primary">{s["profile.title"]}</h1>
        <p className="text-sm text-v2-text-secondary">{s["profile.subtitle"]}</p>
      </div>
      <NameSection initialName={initialName} email={email} />
      <PasswordSection />
    </main>
  );
}

function NameSection({ initialName, email }: { initialName: string; email: string }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (name.trim().length === 0) {
      setError(s["profile.nameRequired"]);
      return;
    }
    startTransition(async () => {
      const r = await updateOwnProfileAction(name);
      if (r.ok) {
        setDone(true);
      } else {
        setError(r.error === "validation" ? s["profile.nameRequired"] : s["profile.error"]);
      }
    });
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg text-v2-text-primary">{s["profile.personalSection"]}</h2>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-v2-text-primary">{s["profile.nameLabel"]}</span>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDone(false);
            }}
            aria-label={s["profile.nameLabel"]}
            maxLength={200}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-v2-text-primary">{s["profile.emailLabel"]}</span>
          <Input value={email} readOnly disabled aria-label={s["profile.emailLabel"]} />
          <span className="text-xs text-v2-text-secondary">{s["profile.emailReadonlyHint"]}</span>
        </label>

        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        {done && <p className="text-sm text-success">{s["profile.nameSaved"]}</p>}

        <Button type="submit" disabled={pending} variant="primary" size="sm">
          {s["profile.save"]}
        </Button>
      </form>
    </section>
  );
}

function PasswordSection() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    const invalid: StringKey | null = validatePassword(password, confirm);
    if (invalid) {
      setError(s[invalid]);
      return;
    }
    startTransition(async () => {
      const r = await changeOwnPasswordAction(password, confirm);
      if (r.ok) {
        setDone(true);
        setPassword("");
        setConfirm("");
      } else {
        setError(s["profile.passwordError"]);
      }
    });
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg text-v2-text-primary">{s["profile.passwordSection"]}</h2>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-v2-text-primary">
            {s["profile.newPasswordLabel"]}
          </span>
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label={s["profile.newPasswordLabel"]}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-v2-text-primary">
            {s["profile.confirmPasswordLabel"]}
          </span>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-label={s["profile.confirmPasswordLabel"]}
          />
        </label>

        <p className="text-xs text-v2-text-secondary">{s["profile.passwordHint"]}</p>

        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        {done && <p className="text-sm text-success">{s["profile.passwordChanged"]}</p>}

        <Button type="submit" disabled={pending} variant="primary" size="sm">
          {s["profile.changePassword"]}
        </Button>
      </form>
    </section>
  );
}
