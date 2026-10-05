"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@osteojp/ui";

/**
 * The submit button of the delivery test, and its SENDING state.
 *
 * The only client code on this screen. A server action gives the page no
 * moment between the press and the redirect, so without this the button looks
 * idle while a real SMS is on its way, and a second press sends a second one
 * and spends a second attempt of the daily limit. `useFormStatus` is the
 * form's own pending flag: while it is set the button reads "A enviar…", is
 * marked busy, and takes no further press.
 *
 * The polite live region is always in the DOM and only its text changes, which
 * is what makes a screen reader announce the change.
 */
export function SendButton({
  label,
  sendingLabel,
  disabled,
  describedBy,
}: {
  label: string;
  sendingLabel: string;
  disabled: boolean;
  describedBy?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <Button
        type="submit"
        variant="primary"
        // DISABLED WHILE PENDING, not the Button's `loading`: `loading` hides
        // the label behind a spinner and still lets Enter submit again. The
        // label has to stay readable, because it is the sending state.
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        aria-describedby={describedBy}
        data-testid="messaging-check-send"
        className="w-full sm:w-auto"
      >
        {pending ? sendingLabel : label}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? sendingLabel : ""}
      </span>
    </>
  );
}
