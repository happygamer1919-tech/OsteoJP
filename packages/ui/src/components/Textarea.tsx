"use client";

import { type TextareaHTMLAttributes, forwardRef } from "react";

import { controlSkin, cx } from "./control-skin";
import { useField } from "./Field";

/**
 * Textarea — SPEC-foundation §4.2.
 *
 * Multi-line control sharing the Input skin; min-height 96px, vertical resize
 * only. Inherits id + aria wiring from a surrounding Field, or accepts them
 * directly when standalone.
 *
 * @example
 * <Field label={t("clinical.notes")}>
 *   <Textarea rows={4} />
 * </Field>
 */
export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Marks the control invalid when used outside a Field. */
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
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
      <textarea
        ref={ref}
        id={controlId}
        required={isRequired}
        aria-invalid={ariaInvalidProp ?? (invalid || undefined)}
        aria-describedby={describedBy}
        className={cx(
          controlSkin(invalid),
          "min-h-24 resize-y px-3 py-2",
          className,
        )}
        {...rest}
      />
    );
  },
);
