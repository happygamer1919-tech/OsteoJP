// SAT-01: the three-state switch of the satisfaction survey. Strategy ruling of
// 2026-10-12 (the shape of BOOK-CONFIRM's switch, book-confirm-mode.ts), on R33
// of dispatch S-1004-A (off, canary, on; the list held in configuration).
//
// The survey is one message, 24 hours after a concluded visit or sent by staff,
// that asks the patient to rate the visit. This module decides whether the
// survey exists at all in this deployment, and, per patient, whether a send may
// go out.
//
//   off     nothing is sent and nothing is shown. Also what an unset or
//           unrecognised value reads as.
//   canary  a send goes out only to a patient whose id is on the list.
//   on      a send may go out to every patient.
//
// FAIL CLOSED: anything that is not exactly `canary` or `on` is `off`. A typo in
// the value must leave the survey dark, never switch it on.
//
// THE LIST LIVES IN CONFIGURATION AND NEVER IN THE REPOSITORY. It holds patient
// ids, the repository is public, and an id is a pointer at a real person.
//
// Pure module: no DB, no SDK, no `server-only`. The automatic send, the manual
// send and every screen read it, so they cannot disagree about whether the
// survey is on or about who it applies to.

export type SurveySendMode = "off" | "canary" | "on";

type Env = Record<string, string | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The switch. Trimmed and lower-cased; everything else is `off`. */
export function surveySendMode(env: Env = process.env): SurveySendMode {
  const raw = (env.SURVEY_SEND_MODE ?? "").trim().toLowerCase();
  if (raw === "canary") return "canary";
  if (raw === "on") return "on";
  return "off";
}

/**
 * The canary list: comma-separated patient uuids. An entry that is not a uuid
 * is dropped, so a stray word or an empty segment can never match a patient.
 */
export function surveyCanaryPatientIds(env: Env = process.env): ReadonlySet<string> {
  const raw = env.SURVEY_CANARY_PATIENT_IDS ?? "";
  const ids = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => UUID.test(part));
  return new Set(ids);
}

export type SurveyDecision = {
  mode: SurveySendMode;
  /** True when a survey may be sent to THIS patient. */
  applies: boolean;
};

/** May a survey be sent to this patient, under the current switch? */
export function surveyAppliesTo(patientId: string, env: Env = process.env): SurveyDecision {
  const mode = surveySendMode(env);
  if (mode === "on") return { mode, applies: true };
  if (mode === "canary") {
    return { mode, applies: surveyCanaryPatientIds(env).has(patientId.trim().toLowerCase()) };
  }
  return { mode, applies: false };
}

/**
 * Does the survey show at all: a tab, a section, a button, a setting?
 *
 * Owner, 2026-10-12: while the switch is off, staff and patients see nothing.
 * So this is false for `off`, and for everything that reads as `off`. It is the
 * one answer a screen asks; a screen never reads the variable itself.
 *
 * It says nothing about one patient. Under `canary` the screens exist, and
 * whether a send may go to a given patient is `surveyAppliesTo`.
 */
export function surveyVisible(env: Env = process.env): boolean {
  return surveySendMode(env) !== "off";
}
