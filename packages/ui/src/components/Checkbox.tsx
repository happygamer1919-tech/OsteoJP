"use client";

import { Check, Minus } from "lucide-react";
import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  forwardRef,
  useEffect,
  useRef,
} from "react";

import { cx } from "./control-skin";

/**
 * Checkbox — SPEC-foundation §4.3.
 *
 * 20px box (radius-sm), border-strong; checked fills accent-2-600 with a white
 * Check; supports the indeterminate state (white Minus). Optional label sits to
 * the right, body-sm; clicking the label toggles. Global focus ring.
 *
 * @example
 * <Checkbox label={t("consent.marketing")} />
 * <Checkbox label={t("table.selectAll")} indeterminate={someSelected} />
 */
export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Label rendered to the right of the box; clicking it toggles the box. */
  label?: ReactNode;
  /** Visually + programmatically indeterminate (mixed) state. */
  indeterminate?: boolean;
}

const setRef = <T,>(ref: Ref<T> | undefined, value: T | null): void => {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, indeterminate = false, className, disabled, ...rest }, ref) {
    const innerRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
      <label
        className={cx(
          "inline-flex items-center gap-2",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          className,
        )}
      >
        <span className="relative inline-flex size-5 shrink-0">
          <input
            ref={(node) => {
              innerRef.current = node;
              setRef(ref, node);
            }}
            type="checkbox"
            disabled={disabled}
            className={cx(
              "peer size-5 appearance-none rounded-sm border border-border-strong bg-surface",
              "transition-colors duration-fast ease-standard",
              "checked:border-accent-2-600 checked:bg-accent-2-600",
              "indeterminate:border-accent-2-600 indeterminate:bg-accent-2-600",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted",
            )}
            {...rest}
          />
          <Check
            size={14}
            strokeWidth={1.75}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-auto hidden text-text-inverse peer-checked:block peer-indeterminate:hidden"
          />
          <Minus
            size={14}
            strokeWidth={1.75}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-auto hidden text-text-inverse peer-indeterminate:block"
          />
        </span>
        {label != null && (
          <span className="select-none text-sm text-text-primary">{label}</span>
        )}
      </label>
    );
  },
);
