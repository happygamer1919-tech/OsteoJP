"use client";

import { X } from "lucide-react";
import { type MouseEvent, type ReactNode, useId, useState } from "react";

import { Button, type ButtonVariant } from "./Button";
import { Dialog } from "./Dialog";
import { useAnimatedDialog } from "./dialog-internal";

/**
 * Drawer — SPEC-foundation §4.6.
 *
 * The create/edit surface: slides from the right (480px desktop, full-width
 * under 640px) over a 40% backdrop. Sticky header (h2 title + ghost X), a
 * scrollable body, and a sticky footer (ghost cancel + primary confirm). Focus
 * is trapped and restored; Escape, the X, the footer cancel, and backdrop click
 * all request close. When `dirty` is set, a close request opens the discard
 * confirm Dialog instead of closing immediately.
 *
 * @example
 * <Drawer open={open} onClose={close} dirty={form.isDirty}
 *   title={t("patient.new")} cancelLabel={t("common.cancel")}
 *   confirmLabel={t("common.save")} onConfirm={submit} confirmLoading={saving}
 *   discard={{ title: t("discard.title"), message: t("discard.message"),
 *     confirmLabel: t("discard.confirm"), cancelLabel: t("discard.keep") }}>
 *   <PatientForm />
 * </Drawer>
 */
export interface DrawerDiscardCopy {
  title: ReactNode;
  message: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
}

export interface DrawerProps {
  open: boolean;
  /** Called when the drawer actually closes (after discard confirm if dirty). */
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  cancelLabel: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  confirmVariant?: Extract<ButtonVariant, "primary" | "destructive">;
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
  /** Unsaved changes: close attempts route through the discard Dialog. */
  dirty?: boolean;
  /** Copy for the discard confirm Dialog (required when `dirty` can be true). */
  discard?: DrawerDiscardCopy;
  /** Accessible name for the X button (e.g. t("common.close")). */
  closeLabel: string;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  cancelLabel,
  confirmLabel,
  onConfirm,
  confirmVariant = "primary",
  confirmLoading = false,
  confirmDisabled = false,
  dirty = false,
  discard,
  closeLabel,
}: DrawerProps) {
  const { ref, shown } = useAnimatedDialog(open);
  const titleId = useId();
  const [discardOpen, setDiscardOpen] = useState(false);

  const requestClose = () => {
    if (dirty && discard) setDiscardOpen(true);
    else onClose();
  };

  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) requestClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={onBackdropClick}
      className={[
        "fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full sm:w-120",
        "rounded-l-xl bg-surface p-0 shadow-lg",
        "backdrop:bg-text-primary/40",
        "transition-transform duration-base ease-standard",
        shown ? "translate-x-0" : "translate-x-full",
      ].join(" ")}
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 id={titleId} className="text-2xl text-text-primary">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={X}
            aria-label={closeLabel}
            onClick={requestClose}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>

        <footer className="flex shrink-0 justify-end gap-3 border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={requestClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            loading={confirmLoading}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </footer>
      </div>

      {discard && (
        <Dialog
          open={discardOpen}
          onClose={() => setDiscardOpen(false)}
          title={discard.title}
          message={discard.message}
          confirmVariant="destructive"
          confirmLabel={discard.confirmLabel}
          cancelLabel={discard.cancelLabel}
          onConfirm={() => {
            setDiscardOpen(false);
            onClose();
          }}
        />
      )}
    </dialog>
  );
}
