"use client";

import { useTransition } from "react";

import { markAllNotificationsRead } from "./actions";

/**
 * W13-02 — "mark all read".
 *
 * A client component ONLY for the pending state. It holds no notification data
 * and no counter: the unread count is derived server-side from
 * `read_at IS NULL` on every render (LOOP 2's Definition of Done requires that),
 * so this button's job is to call the action and let the server re-render. A
 * local optimistic counter here would be the exact "client-only counter that a
 * reload resets" the DoD forbids.
 */
export function MarkAllReadButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void markAllNotificationsRead())}
      className="inline-flex h-11 items-center rounded-v2 px-3 text-sm font-medium text-v2-text-secondary transition-colors hover:bg-surface-muted hover:text-v2-text-primary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      {label}
    </button>
  );
}
