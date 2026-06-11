"use client";

import { ChevronDown } from "lucide-react";
import { type SelectHTMLAttributes, forwardRef } from "react";

import { controlSkin, cx } from "./control-skin";
import { useField } from "./Field";

/**
 * Select — SPEC-foundation §4.3.
 *
 * A styled native `<select>` using the shared Input skin, with a ChevronDown
 * trailing affordance. Same states as Input (focus, invalid, disabled) and the
 * same Field-context wiring (id, aria-describedby, aria-invalid, aria-required).
 * The searchable listbox / combobox pattern is Wave 2, not built here.
 *
 * @example
 * <Field label={t("appointment.location")} required>
 *   <Select defaultValue="">
 *     <option value="" disabled>{t("common.choose")}</option>
 *     <option value="lav">Linda-a-Velha</option>
 *   </Select>
 * </Field>
 */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Marks the control invalid when used outside a Field. */
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    invalid: invalidProp,
    id,
    required,
    className,
    children,
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
      <select
        ref={ref}
        id={controlId}
        required={isRequired}
        aria-invalid={ariaInvalidProp ?? (invalid || undefined)}
        aria-describedby={describedBy}
        className={cx(
          controlSkin(invalid),
          "h-10 cursor-pointer appearance-none pl-3 pr-8",
          "disabled:cursor-not-allowed",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        strokeWidth={1.75}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
});
