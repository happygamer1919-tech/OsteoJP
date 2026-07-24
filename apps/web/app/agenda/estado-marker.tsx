import { Ban, Check, Circle, CircleCheck, UserX, type LucideIcon } from "lucide-react";

import { s } from "@/lib/i18n";
import {
  ESTADO_COLOR_CLASS,
  ESTADO_LABEL_KEY,
  type Estado,
} from "@/lib/scheduling/estado";

/**
 * EstadoMarker — the small leading estado glyph (W12-11 R10, Q-W12-01 ruling).
 *
 * Renders Rodica's five-estado glyph language as a compact coloured icon before
 * the patient name, on the agenda face AND the Marcações row. The estado is
 * ALSO conveyed as TEXT: `aria-label` always ("Estado: <label>"), and a visible
 * label when `showLabel` (the hover panel). Colour is never the sole cue
 * (WCAG 1.4.1) — same discipline as ConfirmationIndicator.
 *
 * Glyphs (SPEC §2, amended by R10):
 *   Agendada   circle       (yellow)  — scheduled + pending
 *   Confirmada tick          (green)  — patient/staff confirmed
 *   Concluída  circle-check  (green)  — completed
 *   Cancelada  ban           (red)    — DISTINCT red glyph, NEVER a strikethrough
 *   Falta      user-x        (red)    — paired with the NAME strikethrough (R10)
 *
 * On the compact face `showLabel` is false, so the marker contributes NO visible
 * text (the name stays authoritative and the face text is exactly the name);
 * the estado is still announced via the aria-label attribute.
 */
const ESTADO_ICON: Record<Estado, LucideIcon> = {
  agendada: Circle,
  confirmada: Check,
  concluida: CircleCheck,
  cancelada: Ban,
  falta: UserX,
};

export function EstadoMarker({
  estado,
  showLabel,
  className,
}: {
  estado: Estado;
  /** Render the estado label as visible text (hover) instead of aria-only (face/row). */
  showLabel?: boolean;
  className?: string;
}) {
  const Icon = ESTADO_ICON[estado];
  const label = s[ESTADO_LABEL_KEY[estado]];
  return (
    <span
      data-estado={estado}
      role="img"
      aria-label={`${s["appointment.status"]}: ${label}`}
      className={`inline-flex shrink-0 items-center gap-1 ${ESTADO_COLOR_CLASS[estado]} ${className ?? ""}`}
    >
      <Icon size={14} strokeWidth={1.9} aria-hidden="true" />
      {showLabel ? <span className="text-xs font-medium">{label}</span> : null}
    </span>
  );
}
