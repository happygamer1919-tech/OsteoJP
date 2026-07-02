/**
 * Zero-pads `patients.patient_number` for display only (JP ruling,
 * docs/design/DECISIONS.md 2026-07-02): the column stays a plain unpadded
 * integer — never store or query the padded string form. Numbers past 4
 * digits render at their natural width.
 */
export function formatPatientNumber(n: number): string {
  return String(n).padStart(4, "0");
}
