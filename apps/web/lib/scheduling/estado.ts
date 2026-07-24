import type { StringKey } from "@osteojp/i18n";

import type {
  AppointmentConfirmationStateValue,
  AppointmentStatusValue,
} from "./types";

/**
 * Estado — the five patient-facing appointment states Rodica specified
 * (SPEC-estados-lifecycle.md §2), DERIVED from the two EXISTING orthogonal axes
 * and writing NEITHER:
 *
 *   - lifecycle `appointment_status`      (scheduled | confirmed | completed | cancelled | no_show)
 *   - confirmation `appointment_confirmation_state` (pending | confirmed | declined)
 *
 * There is NO merged "estado" column and NO migration — the estado is a pure
 * PRESENTATION over the two axes, the same discipline as record_status vs
 * ai_review_state (CLAUDE.md rule 4). This module is pure and side-effect free
 * so the derivation can be unit-tested without React, the DB, or i18n runtime.
 */
export type Estado =
  | "agendada"
  | "confirmada"
  | "concluida"
  | "cancelada"
  | "falta";

export const ESTADOS: readonly Estado[] = [
  "agendada",
  "confirmada",
  "concluida",
  "cancelada",
  "falta",
] as const;

/**
 * Canonical derivation (SPEC §2.1). Terminal lifecycle states
 * (completed/cancelled/no_show) dominate regardless of the confirmation axis;
 * only a non-terminal appointment lets the confirmation axis distinguish
 * Agendada from Confirmada.
 *
 * The two "confirmed" notions (SPEC §2.2): a staff-set lifecycle
 * `status = confirmed` AND a patient `confirmation_state = confirmed` both map
 * to Confirmada, so a staff-confirmed appointment is never mislabelled Agendada.
 * (If the owner later wants Confirmada to mean patient-confirmed ONLY, drop the
 * `status === "confirmed"` clause — a one-line change here, no schema touch.)
 */
export function deriveEstado(
  status: AppointmentStatusValue,
  confirmation: AppointmentConfirmationStateValue,
): Estado {
  if (status === "completed") return "concluida";
  if (status === "cancelled") return "cancelada";
  if (status === "no_show") return "falta";
  // status is scheduled | confirmed (non-terminal)
  if (confirmation === "confirmed" || status === "confirmed") return "confirmada";
  // A negative reply also flips status to cancelled (SPEC §4.4); this guards the
  // interim window where only the confirmation axis carries the decline.
  if (confirmation === "declined") return "cancelada";
  return "agendada";
}

/**
 * R10 (owner ruling on Q-W12-01): the patient NAME is struck through ONLY for
 * Falta (no_show) — "name crossed with a line". Cancelada gets a DISTINCT red
 * leading glyph and is NEVER struck, so the two never look alike. This replaces
 * the interim W11-00 invariant (cancelled = line-through).
 */
export function estadoStrikesName(estado: Estado): boolean {
  return estado === "falta";
}

/** i18n label key per estado. Reuses the existing lifecycle-status labels. */
export const ESTADO_LABEL_KEY: Record<Estado, StringKey> = {
  agendada: "appointment.status.scheduled",
  confirmada: "appointment.status.confirmed",
  concluida: "appointment.status.completed",
  cancelada: "appointment.status.cancelled",
  falta: "appointment.status.no_show",
};

/**
 * Semantic colour token per estado for the leading glyph (SPEC §2 colours):
 * yellow = Agendada, green = Confirmada/Concluida, red = Cancelada/Falta.
 * EXISTING tokens only — no new hex (brand rule). Colour is never the sole
 * cue: every estado is also carried as TEXT (aria-label + hover), WCAG 1.4.1.
 */
export const ESTADO_COLOR_CLASS: Record<Estado, string> = {
  agendada: "text-warning",
  confirmada: "text-success",
  concluida: "text-success",
  cancelada: "text-error",
  falta: "text-error",
};
