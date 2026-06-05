// Therapist assignment for a patient self-booking. The patient does NOT choose a
// therapist; the server assigns one. Pure (no DB): the caller resolves the set of
// AVAILABLE candidates (works at the location + no conflict for the window — see
// store.ts) and the patient's prior therapist, and this decides who gets it.
//
// Soft preference (not a hard rule): if the patient's most-recent prior therapist
// is in the available set, prefer them (continuity of care); otherwise fall back
// to the first available candidate in the caller's deterministic order. No
// available candidate → null (the route answers "no slot").

export type TherapistCandidate = {
  /** users.id of an available therapist. */
  practitionerId: string;
  /** Stable display-order key (e.g. full name); used only to make the fallback
   *  deterministic when there is no prior-therapist match. */
  sortKey: string;
};

/**
 * Pick the therapist for a booking from the AVAILABLE candidates, applying the
 * returning-patient soft preference.
 *
 * @param available  therapists with no conflict for the requested window.
 * @param priorTherapistId  the patient's most-recent therapist, or null/none.
 * @returns the chosen practitionerId, or null when nobody is available.
 */
export function chooseTherapist(
  available: TherapistCandidate[],
  priorTherapistId: string | null,
): string | null {
  if (available.length === 0) return null;

  // Soft preference: reuse the prior therapist IF they are available.
  if (priorTherapistId) {
    const prior = available.find((c) => c.practitionerId === priorTherapistId);
    if (prior) return prior.practitionerId;
  }

  // Deterministic fallback: lowest sortKey (then id) among the available set, so
  // the same inputs always yield the same assignment.
  const ordered = [...available].sort(
    (a, b) =>
      a.sortKey.localeCompare(b.sortKey) ||
      a.practitionerId.localeCompare(b.practitionerId),
  );
  return ordered[0].practitionerId;
}
