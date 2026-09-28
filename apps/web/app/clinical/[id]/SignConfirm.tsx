"use client";
import { Button, Dialog, type ButtonSize } from "@osteojp/ui";
import { useState, useTransition } from "react";

import { createSignSequence, type SignSaveResult } from "@/lib/clinical/sign-sequence";
import { s } from "@/lib/i18n";

/**
 * SIGN-CONFIRM-AND-SAVE-FIRST: the sign button, behind a confirmation.
 *
 * Used for "Assinar e bloquear" on a registo and for "Finalizar (assinar e
 * bloquear)" on Revisao Consulta, both of which used to sign on one press, in a
 * form of their own, leaving unsaved edits out of an immutable registo.
 *
 *  - The press opens a Dialog that says what happens (the ficha is locked for
 *    good) and, when the form holds unsaved changes, that they are saved first.
 *    Cancel closes it and changes nothing.
 *  - Confirm runs `createSignSequence` (lib/clinical/sign-sequence.ts): save
 *    first when there is anything to save, sign only after the save answered
 *    ok, sign once. A failed save keeps the dialog open with the reason, and
 *    nothing is signed.
 *  - Confirm is disabled, and Cancel does nothing, while the save or the sign is
 *    in flight. The sequence's own latch covers the clicks that land before the
 *    button re-renders disabled.
 *  - The trigger is disabled while a Gravar save is in flight, so a sign never
 *    races the save the person just started.
 *
 * The sign's rejection (the server actions end in a redirect, which Next
 * reports as a rejection) is rethrown inside the transition, so the route's
 * boundaries handle it exactly as they handled the old form's action.
 */
export function SignConfirm<R extends SignSaveResult>({
  label,
  message,
  isDirty,
  save,
  sign,
  dataHash,
  saveFailureReason,
  disabled = false,
  size,
}: {
  /** The button's label, which is also the dialog's title and its confirm label. */
  label: string;
  /** What signing does, from packages/i18n. */
  message: string;
  isDirty: () => boolean;
  /** Submit the form through its existing save path and wait for the answer. */
  save: () => Promise<R | null>;
  /** The server sign or finalize action, given the fingerprint it may sign. */
  sign: (expectedDataHash: string) => Promise<void>;
  /** Fingerprint of the content the form last loaded or saved. */
  dataHash: string;
  /** The words for a save that did not succeed (null: it threw). */
  saveFailureReason: (result: R | null) => string;
  disabled?: boolean;
  size?: ButtonSize;
}) {
  const [open, setOpen] = useState(false);
  const [unsavedAtOpen, setUnsavedAtOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inFlight, startTransition] = useTransition();
  const [sequence] = useState(createSignSequence);

  const openDialog = () => {
    setError(null);
    setUnsavedAtOpen(isDirty());
    setOpen(true);
  };

  const closeDialog = () => {
    if (inFlight) return;
    setOpen(false);
    setError(null);
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await sequence.run({
        isDirty,
        save,
        sign,
        currentDataHash: () => dataHash,
      });
      if (outcome.kind === "save_failed") setError(saveFailureReason(outcome.result));
      if (outcome.kind === "signed") setOpen(false);
    });
  };

  return (
    <>
      <Button type="button" size={size} disabled={disabled} onClick={openDialog}>
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={closeDialog}
        title={label}
        message={message}
        confirmLabel={label}
        onConfirm={confirm}
        confirmLoading={inFlight}
        confirmDisabled={inFlight}
        cancelLabel={s["common.cancel"]}
      >
        {unsavedAtOpen && (
          <p className="mt-2 text-sm text-text-secondary" data-testid="sign-saves-first">
            {s["clinical.signSavesFirst"]}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-error" data-testid="sign-save-failed">
            {s["clinical.signSaveFailed"]} {error}
          </p>
        )}
      </Dialog>
    </>
  );
}
