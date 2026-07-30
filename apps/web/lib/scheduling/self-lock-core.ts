import type { Role } from "@osteojp/auth";

/**
 * PL-10 (therapist self-booking self-lock, owner DoD 2026-07-30).
 *
 * Pure, environment-free decision helpers for the create-appointment drawer's
 * therapist self-lock. Kept out of the "use client" component so they unit-test
 * in the node vitest environment (no jsdom / effects needed).
 */

/**
 * Is the CREATE form self-locked to the viewer as the practitioner?
 *
 * Only role "therapist" self-locks: their appointment's practitioner is forced
 * to themselves and the Terapeuta selector is hidden. Owner (JP, a practising
 * clinician) is role "owner", NOT "therapist", so the owner is NEVER self-locked
 * and keeps the full dropdown; admin and reception likewise keep it.
 *
 * Edit mode is never self-locked — the practitioner is already fixed on the
 * saved row and edit stays on its existing (out-of-scope) rules.
 */
export function isTherapistSelfLocked(
  role: Role,
  mode: "create" | "edit",
): boolean {
  return mode === "create" && role === "therapist";
}

/**
 * Should the therapist -> primary-service PRESELECTION fire?
 *
 * The therapist->service mapping is a PRESELECTION, never a RESTRICTION (PL-06a):
 * it only supplies the default Serviço and never narrows the option list. It
 * fires when the user actively changes Terapeuta OR — new in PL-10 — on OPEN when
 * the form is therapist self-locked (a self-locked therapist cannot change the
 * Terapeuta field, so the preselect must run without any manual change).
 *
 * It stays a preselect: the drawer's applyDefaultService still refuses to
 * overwrite a service the user has already picked, so this can only fill an
 * empty Serviço, never rewrite a chosen one.
 */
export function shouldPreselectPrimaryService(
  userChangedTherapist: boolean,
  selfLocked: boolean,
): boolean {
  return userChangedTherapist || selfLocked;
}
