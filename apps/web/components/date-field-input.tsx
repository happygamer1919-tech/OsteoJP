"use client";

import { useState } from "react";
import { DatePicker } from "@osteojp/ui";

/**
 * Form-friendly wrapper around the shared DatePicker (SCHED-07), mirroring
 * `TimeFieldInput` exactly: it holds the value for an UNCONTROLLED form, and the
 * picker itself posts the ISO "yyyy-mm-dd" under `name`.
 *
 * IT EXISTS BECAUSE THE PICKER POSTS NOTHING ON ITS OWN. Before SCHED-07 the
 * DatePicker was a button and a popover with no `name`, so converting a native
 * `<input type="date" name=…>` to it would have left the server action receiving
 * NOTHING while the screen looked filled in - the §1.3 shape, on a save path.
 * Five of the converted fields are exactly that: TherapistBlocks posts
 * `startDate`, `endDate` and `until` by name and never reads them in React.
 *
 * `required` REACHES THE VISIBLE FIELD, so the browser's own message points at
 * something the user can see and focus. A hidden input is exempt from
 * constraint validation; this was the trap that made the first draft of this
 * component wrong.
 */
export function DateFieldInput({
  name,
  defaultValue = "",
  required = false,
  label,
  min,
  max,
  className,
  value: controlled,
  onChange,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  /** Accessible name for the picker's text field. */
  label?: string;
  min?: string;
  max?: string;
  className?: string;
  /** Pass both to CONTROL the field; omit both and it keeps its own state. */
  value?: string;
  onChange?: (next: string) => void;
}) {
  // "yyyy-mm-dd": a DB `date` reads back as exactly that, and a server action
  // that echoes a value into defaultValue must round-trip unchanged.
  const [own, setOwn] = useState(defaultValue ? defaultValue.slice(0, 10) : "");
  const isControlled = controlled != null && onChange != null;
  const value = isControlled ? controlled : own;
  const setValue = isControlled ? onChange : setOwn;
  return (
    <DatePicker
      value={value === "" ? null : value}
      onChange={setValue}
      name={name}
      required={required}
      min={min}
      max={max}
      triggerLabel={label}
      className={className}
    />
  );
}
