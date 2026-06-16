"use client";

import { CircleAlert } from "lucide-react";
import {
  type ReactNode,
  createContext,
  useContext,
  useId,
} from "react";

/**
 * Field — SPEC-foundation §4.2.
 *
 * The wrapper that owns the label, helper text, error text, and required
 * marking for a single form control (Input / Textarea / Select). It wires
 * accessibility for the control inside it via context: the control adopts the
 * generated id (label association), `aria-describedby` (helper/error), plus
 * `aria-invalid` and `aria-required`, with no per-screen boilerplate.
 *
 * Anatomy (vertical stack, gap space-2): label · control · helper OR error.
 * Helper text is replaced by the error text when the field is invalid; the
 * error carries role="alert" and a CircleAlert icon.
 *
 * @example
 * <Field label={t("patient.name")} required helperText={t("patient.nameHelp")}>
 *   <Input placeholder={t("patient.namePlaceholder")} />
 * </Field>
 *
 * <Field label={t("patient.email")} error={errors.email}>
 *   <Input type="email" defaultValue={value} />
 * </Field>
 */

export interface FieldContextValue {
  /** id applied to the control and referenced by the label's htmlFor. */
  controlId?: string;
  /** id of the helper/error region, for the control's aria-describedby. */
  descriptionId?: string;
  invalid?: boolean;
  required?: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Consumed by Input/Textarea to inherit Field's id + aria wiring. */
export const useField = (): FieldContextValue | null => useContext(FieldContext);

export interface FieldProps {
  /** Label content (resolved from i18n by the screen). */
  label: ReactNode;
  /** Marks the control required: appends `*` and sets aria-required. */
  required?: boolean;
  /** Guidance shown below the control; hidden while an error is present. */
  helperText?: ReactNode;
  /** Error message; when set, the field renders invalid and replaces helper. */
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  required = false,
  helperText,
  error,
  children,
  className,
}: FieldProps) {
  const reactId = useId();
  const controlId = `${reactId}-control`;
  const descriptionId = `${reactId}-desc`;
  const invalid = error != null && error !== false && error !== "";
  const hasDescription = invalid || (helperText != null && helperText !== "");

  return (
    <div className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}>
      <label
        htmlFor={controlId}
        className="text-xs font-medium text-text-primary"
      >
        {label}
        {required && (
          <span aria-hidden="true" className="text-error">
            {" *"}
          </span>
        )}
      </label>

      <FieldContext.Provider
        value={{
          controlId,
          descriptionId: hasDescription ? descriptionId : undefined,
          invalid,
          required,
        }}
      >
        {children}
      </FieldContext.Provider>

      {invalid ? (
        <p
          id={descriptionId}
          role="alert"
          className="flex items-center gap-1 text-sm text-error"
        >
          <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
          {error}
        </p>
      ) : hasDescription ? (
        <p id={descriptionId} className="text-sm text-text-secondary">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
