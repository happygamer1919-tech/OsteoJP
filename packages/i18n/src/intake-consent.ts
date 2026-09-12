/**
 * INTAKE-01 / WF-19 - which RGPD text the guest intake consent was given under.
 *
 * THE TERMS MECHANISM, REUSED (owner, 2026-09-09). `patient_terms_acceptances`
 * stores a version LABEL as the document's identity and never its text; the
 * intake row does the same in `guest_clinical_intakes.consent_version`. The
 * label names the consent body the visitor was shown, in either locale.
 *
 * THE RULE, carried over from TERMS_VERSION: when the consent TEXT changes, ADD
 * a new label to the end of this list and never edit an old one. Old rows keep
 * the label they were captured under, which is the only reason the column means
 * anything. The portal's consent copy carries a test that pins the sha256 of the
 * body to CURRENT_INTAKE_CONSENT_VERSION, so an edit to the text under an
 * unchanged label fails.
 *
 * WHY THE API ACCEPTS EVERY LISTED LABEL AND NOT ONLY THE CURRENT ONE. A page
 * rendered just before a label is added posts the label of the text it SHOWED.
 * Storing that older label is the truthful record; refusing it would turn a copy
 * change into a failed booking for whoever had the form open.
 */
export const INTAKE_CONSENT_VERSIONS = ["rgpd-intake-2026-09-11"] as const;

export type IntakeConsentVersion = (typeof INTAKE_CONSENT_VERSIONS)[number];

/** The label the portal sends today: always the LAST entry above. */
export const CURRENT_INTAKE_CONSENT_VERSION: IntakeConsentVersion =
  INTAKE_CONSENT_VERSIONS[INTAKE_CONSENT_VERSIONS.length - 1]!;

/** Validates an untrusted value against the list rather than casting into it. */
export function isIntakeConsentVersion(value: unknown): value is IntakeConsentVersion {
  return (
    typeof value === "string" &&
    (INTAKE_CONSENT_VERSIONS as readonly string[]).includes(value)
  );
}
