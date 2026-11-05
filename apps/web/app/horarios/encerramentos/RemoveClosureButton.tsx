"use client";

import { X } from "lucide-react";

/**
 * Remove one closure: a real <button> inside a <form> posting to the delete
 * action, a confirm before it posts (a removal has no undo), and an accessible
 * name that says WHICH closure it removes. Rendered only for a closure that has
 * not started; the server refuses a started one anyway.
 */
export function RemoveClosureButton({
  id,
  line,
  action,
  label,
  confirmText,
}: {
  id: string;
  line: string;
  action: (fd: FormData) => Promise<void>;
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`${confirmText}\n${line}`)) e.preventDefault();
      }}
      className="flex-none"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`${label}: ${line}`}
        title={label}
        data-testid="closure-remove"
        className="inline-flex h-7 w-7 items-center justify-center rounded-v2 text-red-700 hover:bg-red-50 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <X aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </form>
  );
}
