"use client";

import { type InputHTMLAttributes, forwardRef } from "react";

import { cx } from "./control-skin";

/**
 * Switch — SPEC-foundation §4.3.
 *
 * Settings toggle: a 36×20 track (full radius), neutral-300 off / accent-2-600
 * on, with a 16px white thumb that travels at --duration-fast. Implemented as a
 * native checkbox with role="switch" (so it participates in forms, is keyboard
 * operable, and exposes aria-checked from the checked state); the peer-driven
 * thumb is purely visual.
 *
 * The paired status text (Ligado/Desligado) is the screen's responsibility. As
 * the switch has no visible text of its own, the screen must supply an
 * accessible name via `aria-label` or `aria-labelledby`.
 *
 * @example
 * <Switch aria-label={t("settings.reminders")} defaultChecked />
 */
export type SwitchProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "role"
>;

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, disabled, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby, ...rest },
  ref,
) {
  if (
    process.env.NODE_ENV !== "production" &&
    !ariaLabel &&
    !ariaLabelledby
  ) {
    console.warn(
      "Switch: provide an `aria-label` or `aria-labelledby` — the switch has no visible text.",
    );
  }

  return (
    <span className="relative inline-flex shrink-0">
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={cx(
          "peer h-5 w-9 appearance-none rounded-full bg-neutral-300",
          "transition-colors duration-fast ease-standard",
          "checked:bg-accent-2-600",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
          disabled ? "" : "cursor-pointer",
          className,
        )}
        {...rest}
      />
      <span
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-surface shadow-sm",
          "transition-transform duration-fast ease-standard",
          "peer-checked:translate-x-4",
        )}
      />
    </span>
  );
});
