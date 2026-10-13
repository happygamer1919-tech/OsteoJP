// SAT-01 (S8) - the patient's survey switch on the ficha: who is offered it.
//
// One pure rule, so the page that draws the switch and the write behind it ask
// the same question and a table test can read the answer role by role.
//
// TWO CONDITIONS, BOTH REQUIRED.
//
//   THE SURVEY EXISTS IN THIS DEPLOYMENT. While SURVEY_SEND_MODE reads off,
//   staff see nothing of the survey (owner, 2026-10-12): no section, no switch,
//   and the write refuses. The caller passes `surveyVisible()`; this module
//   never reads the variable.
//
//   THE ROLE. Owner, admin and reception (spec section 2, the row "The
//   patient's survey switch"). A therapist is not offered it. The database
//   would let a therapist set it for a patient they treat (the `patients_update`
//   policy, R34), so this is the application's line and not the database's;
//   whether a treating therapist also gets the switch is an open question, and
//   until it is ruled they are not handed it.

import type { Role } from "@osteojp/auth";

const SWITCH_ROLES: readonly Role[] = ["owner", "admin", "reception"];

/** Is this viewer offered the patient's survey switch, to see and to change? */
export function offersSurveySwitch(role: Role, surveyIsVisible: boolean): boolean {
  return surveyIsVisible && SWITCH_ROLES.includes(role);
}
