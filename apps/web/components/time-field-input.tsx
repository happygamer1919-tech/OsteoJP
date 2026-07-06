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
}: {
  name: string;
  defaultValue?: string;
  step?: number;
  hourLabel?: string;
  minuteLabel?: string;
  className?: string;
}) {
  // Normalise to "HH:mm" so an unchanged submit matches the native input's old
  // value (a DB `time` reads back as "HH:mm:ss").
  const [value, setValue] = useState(defaultValue ? defaultValue.slice(0, 5) : "");
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
