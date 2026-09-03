// INC-nif-validationerror-at-the-desk — WHERE a refused write's sentence goes.
//
// Pure (no React, no DB, no framework) so the placement rule is provable
// without rendering anything. The form imports it; so does the test that pins
// it against the form's own source.
//
// ==========================================================================
// WHY THE RULE IS A VALUE AND NOT A JUDGEMENT MADE AT EACH FIELD
// ==========================================================================
// The message must appear EXACTLY ONCE. Twice is not a cosmetic problem: three
// e2e cases in `nif-required.spec.ts` assert the sentence is visible with a
// plain `getByText`, and Playwright's strict mode fails a locator that resolves
// to two elements — so a second copy turns a passing gate red for a reason that
// reads as unrelated. Zero is worse: the refusal happens and the desk is told
// nothing, which is the whole of the defect this card exists for.
//
// So the form renders inline where it has a slot, form-level where it has not,
// and this file is the one place that says which is which.

import type { PatientField } from "./validation";

/**
 * The fields the patient form renders an inline slot for.
 *
 * IT IS RESTATED HERE RATHER THAN DERIVED FROM THE COMPONENT, and a restated
 * rule drifts — so `form-error.test.ts` reads `patient-form.tsx`'s SOURCE and
 * fails if the two disagree. Same shape as the handover-count guard, which
 * restates `render-board.mjs`'s filter and then pins the renderer's source.
 */
export const INLINE_ERROR_FIELDS = new Set<PatientField>([
  "fullName",
  "dateOfBirth",
  "sex",
  "nif",
  "nifExemptReason",
  "email",
  "phone",
  "postalCode",
  "city",
  "profession",
]);

/**
 * THREE FIELDS THAT LOOK LIKE THEY BELONG ABOVE AND DO NOT, named so the next
 * reader does not "fix" the omission.
 *
 * `primaryLocationId` — its Field is rendered in ONE of three shapes depending
 * on how many clinics the viewer can file under, and in the zero-clinic shape
 * there is no slot at all. A slot that exists in two states out of three is a
 * message that disappears in the third, which is the one outcome worse than
 * showing it above the buttons. Its two refusals are an empty REQUIRED picker,
 * which the browser blocks before the request leaves, and an id that does not
 * resolve under the caller's tenant, which no operator can type.
 *
 * `referralSource` and `contraindicationOtherNote` — both live behind a
 * conditional "Outro" branch, same argument.
 *
 * `nifExemptReason` IS above despite being conditional, and it is the one case
 * where the invariant holds structurally: `resolveNif` raises it ONLY on the
 * exemption branch, which is reached only when the box is ticked, which is the
 * only state that renders the input. `form-error.test.ts` pins that.
 */

/**
 * Where the sentence for `field` belongs.
 *
 * `form` is returned for a field with no slot — `healthInsuranceNumbers` is the
 * live example, a fieldset of repeatable rows with no single box to point at —
 * and for `form` itself, which is a refusal about the whole payload rather than
 * about any one input.
 *
 * NOT A FALLBACK IN THE §1.3 SENSE, and the distinction is worth stating
 * because the shape looks like one. Nothing unknown reaches here: `PatientField`
 * is a closed union, every arm is listed above or deliberately absent, and the
 * message is SHOWN either way. What varies is only whether it is shown beside a
 * box or above the buttons.
 */
export function errorSlot(field: PatientField): "inline" | "form" {
  return INLINE_ERROR_FIELDS.has(field) ? "inline" : "form";
}
