/**
 * NESA contraindication warning logic (W2-08, ruling A). Pure + framework-free
 * so the match rule is unit-testable in the node vitest environment.
 *
 * The warning is a SOFT signal only — it NEVER blocks booking. It fires when the
 * selected patient carries ANY true contraindication flag AND the selected
 * service is contraindication-sensitive; it names the matched flag(s).
 */
export type PatientContraindications = {
  epilepsy: boolean;
  pregnancy: boolean;
  pacemaker: boolean;
};

export type ContraindicationKey = "epilepsy" | "pregnancy" | "pacemaker";

/**
 * The contraindications that matched: non-empty only when the service is
 * sensitive AND the patient has at least one true flag. Order is stable
 * (epilepsy, pregnancy, pacemaker) for deterministic rendering/tests.
 */
export function matchedContraindications(
  patient: PatientContraindications | null,
  serviceSensitive: boolean,
): ContraindicationKey[] {
  if (!patient || !serviceSensitive) return [];
  const matched: ContraindicationKey[] = [];
  if (patient.epilepsy) matched.push("epilepsy");
  if (patient.pregnancy) matched.push("pregnancy");
  if (patient.pacemaker) matched.push("pacemaker");
  return matched;
}
