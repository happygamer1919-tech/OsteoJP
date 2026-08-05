"use client";

import { useState } from "react";
import { TimeField } from "@osteojp/ui";

/**
 * Form-friendly wrapper around the 24h TimeField (W4-02). For server-action
 * forms that read the value via FormData: renders the 24h picker plus a hidden
 * `<input name>` carrying the current "HH:mm", so the form submits a 24h value
 * with NO native time input (which would render AM/PM under a 12h browser
 * locale). Value in/out is always "HH:mm".
 */
export function TimeFieldInput({
  name,
  defaultValue = "",
  step = 15,
  hourLabel,
  minuteLabel,
  className,
  value: controlled,
  onChange,
}: {
  name: string;
  defaultValue?: string;
  step?: number;
  hourLabel?: string;
  minuteLabel?: string;
  className?: string;
  /** W13-A: pass value+onChange to CONTROL the field. Omit both and it keeps its
   * own state exactly as before — every pre-W13-A call site is unchanged.
   * The split-shift editor needs the values in its parent so it can refuse a
   * second period that starts before the first one ends BEFORE the round trip. */
  value?: string;
  onChange?: (next: string) => void;
}) {
  // Normalise to "HH:mm" so an unchanged submit matches the native input's old
  // value (a DB `time` reads back as "HH:mm:ss").
  const [own, setOwn] = useState(defaultValue ? defaultValue.slice(0, 5) : "");
  const isControlled = controlled != null && onChange != null;
  const value = isControlled ? controlled : own;
  const setValue = isControlled ? onChange : setOwn;
  return (
    <>
      <TimeField
        value={value}
        onChange={setValue}
        step={step}
        hourLabel={hourLabel}
        minuteLabel={minuteLabel}
        className={className}
      />
      <input type="hidden" name={name} value={value} />
    </>
  );
}
