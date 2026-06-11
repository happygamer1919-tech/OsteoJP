"use client";

import { type LucideIcon } from "lucide-react";
import { type MouseEvent, type ReactNode, useId } from "react";

import { Button, type ButtonVariant } from "./Button";
import { useAnimatedDialog } from "./dialog-internal";

/**
 * Dialog — SPEC-foundation §4.6.
 *
 * Centered confirm/destructive dialog (max-width 400px, radius xl, shadow lg).
 * Optional 24px semantic icon, h3 title, body-sm message, footer with ghost
 * cancel + primary|destructive confirm. Focus is trapped and restored, Escape
 * and backdrop-click close it. Never used for forms — forms live in the Drawer.
 *
 * @example
 * <Dialog open={open} onClose={close} title={t("delete.title")}
 *   message={t("delete.message")} confirmVariant="destructive"
 *   confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")}
 *   onConfirm={remove} icon={AlertTriangle} iconTone="error" />
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  message?: ReactNode;
  /** Optional leading icon (24px); color it with iconTone. */
  icon?: LucideIcon;
  iconTone?: "success" | "warning" | "error" | "info";
  confirmLabel: ReactNode;
  onConfirm: () => void;
  confirmVariant?: Extract<ButtonVariant, "primary" | "destructive">;
  confirmLoading?: boolean;
  cancelLabel: ReactNode;
  children?: ReactNode;
}

const ICON_TONE: Record<NonNullable<DialogProps["iconTone"]>, string> = {
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  info: "text-info",
};

export function Dialog({
  open,
  onClose,
  title,
  message,
  icon: Icon,
  iconTone = "info",
  confirmLabel,
  onConfirm,
  confirmVariant = "primary",
  confirmLoading = false,
  cancelLabel,
  children,
}: DialogProps) {
  const { ref, shown } = useAnimatedDialog(open);
  const titleId = useId();

  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={onBackdropClick}
      className={[
        "m-auto w-full max-w-100 rounded-xl bg-surface p-0 shadow-lg",
        "backdrop:bg-text-primary/40",
        "transition-opacity duration-base ease-standard",
        shown ? "opacity-100" : "opacity-0",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start gap-3">
          {Icon && (
            <Icon
              size={24}
              strokeWidth={1.75}
              aria-hidden="true"
              className={`mt-0.5 shrink-0 ${ICON_TONE[iconTone]}`}
            />
          )}
          <div className="flex flex-col gap-1">
            <h3 id={titleId} className="text-xl text-text-primary">
              {title}
            </h3>
            {message != null && (
              <p className="text-sm text-text-secondary">{message}</p>
            )}
            {children}
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            loading={confirmLoading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
