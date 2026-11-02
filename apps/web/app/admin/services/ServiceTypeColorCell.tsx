"use client";
import { useState } from "react";

/**
 * Tipos de Marcacao: the colour cell. A colour picker always holds a colour, so
 * "no colour" needs its own control: the "Sem cor" box. Ticked, the save stores
 * no colour whatever the picker shows; picking a colour unticks it, so a colour
 * can be set on a type that had none (white included) and cleared again.
 *
 * Both inputs post to the table's one form by id (`form`), like every other
 * table control.
 */
export function ServiceTypeColorCell({
  id,
  form,
  color,
  shownWhenUnset,
  colorLabel,
  noColorLabel,
  typeName,
}: {
  id: string;
  form: string;
  color: string | null;
  shownWhenUnset: string;
  colorLabel: string;
  noColorLabel: string;
  typeName: string;
}) {
  const [noColor, setNoColor] = useState(color === null);
  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="color"
        name={`color__${id}`}
        form={form}
        defaultValue={(color ?? shownWhenUnset).toLowerCase()}
        onChange={() => setNoColor(false)}
        aria-label={`${colorLabel} (${typeName})`}
        className={`h-6 w-6 cursor-pointer rounded-full border border-v2-border bg-transparent p-0 ${focusRing} ${noColor ? "opacity-40" : ""}`}
      />
      <label className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-v2-text-secondary">
        <input
          type="checkbox"
          name={`noColor__${id}`}
          form={form}
          checked={noColor}
          onChange={(e) => setNoColor(e.target.checked)}
          aria-label={`${noColorLabel} (${typeName})`}
          className={focusRing}
        />
        {noColorLabel}
      </label>
    </span>
  );
}
