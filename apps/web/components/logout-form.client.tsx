"use client";

import type { FormEvent } from "react";

import { logout } from "@/app/logout/actions";
import { runAction } from "@/lib/actions/run-action";

/**
 * SKEW-01 - "Terminar sessão", the one server-action call in the shell.
 *
 * It was `<form action={logout}>` inside the SERVER component AppShell, so no
 * client code ran it and nothing could catch a skewed action id or a dropped
 * connection. It is now this small client component, and it works both ways:
 *
 *   WITHOUT JAVASCRIPT it is still a plain form. React server-renders a form
 *   whose action is a server reference as a real POST carrying the action id
 *   (the reference defines $$FORM_ACTION: next/dist/compiled/
 *   react-server-dom-turbopack/cjs/react-server-dom-turbopack-client.node.
 *   production.js, registerBoundServerReference), exactly as it did from the
 *   server component.
 *
 *   WITH JAVASCRIPT `onSubmit` prevents the default and calls the action
 *   through runAction. React then skips its own form-action dispatch, because
 *   it runs the form action only when the submit event was NOT default-
 *   prevented (next/dist/compiled/react-dom/cjs/react-dom-client.production.js,
 *   extractEvents$1). The action's redirect to /login is performed by Next's
 *   router itself (classify-action-error.ts, "handled-redirect").
 *
 * The shell renders the user area twice (header and desktop slot), so there
 * are two of these on a page; each is independent.
 */
export function LogoutForm({ label, className }: { label: string; className?: string }) {
  function signOut() {
    void runAction(() => logout(), { kind: "write", retry: signOut });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    signOut();
  }

  return (
    <form action={logout} onSubmit={onSubmit}>
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
