"use client";

import { type LucideIcon } from "lucide-react";
import {
  type InputHTMLAttributes,
  type ReactNode,
  forwardRef,
} from "react";

import { controlSkin, cx } from "./control-skin";
import { useField } from "./Field";

/**
 * Input — SPEC-foundation §4.2.
 *
 * 40px text input with the shared control skin. Inside a Field it inherits the
 * id, `aria-describedby`, `aria-invalid` and `aria-required` automatically;
 * standalone, pass `id`/`invalid`/`aria-*` directly. Optional leading icon
 * (Search pattern, 16px decorative) and trailing slot (e.g. a clear button).
 *
 * @example
 * import { Search } from "lucide-react";
 * <Input leadingIcon={Search} placeholder={t("search.patients")} />
 *
 * <Field label={t("patient.name")} required>
 *   <Input />
 * </Field>
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Leading decorative icon (lucide), 16px, inline with the input text. */
  leadingIcon?: LucideIcon;
  /** Trailing slot for a compact control (≤~20px), e.g. a clear button. */
  trailing?: ReactNode;
  /** Marks the control invalid when used outside a Field. */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    leadingIcon: LeadingIcon,
    trailing,
    invalid: invalidProp,
    id,
    required,
    className,
    "aria-describedby": describedByProp,
    "aria-invalid": ariaInvalidProp,
    ...rest
  },
  ref,
) {
  const field = useField();
  const invalid = invalidProp ?? field?.invalid ?? false;
  const controlId = id ?? field?.controlId;
  const describedBy = describedByProp ?? field?.descriptionId;
  const isRequired = required ?? field?.required;

  return (
    <div className="relative">
      {LeadingIcon && (
        <LeadingIcon
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
      )}
      <input
        ref={ref}
        id={controlId}
        required={isRequired}
        aria-invalid={ariaInvalidProp ?? (invalid || undefined)}
        aria-describedby={describedBy}
        className={cx(
          controlSkin(invalid),
          "h-10",
          LeadingIcon ? "pl-8" : "pl-3",
          trailing ? "pr-8" : "pr-3",
          className,
        )}
        {...rest}
      />
      {trailing && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center">
          {trailing}
        </div>
      )}
    </div>
  );
});
