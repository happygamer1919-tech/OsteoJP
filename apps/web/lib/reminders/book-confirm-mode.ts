// BOOK-CONFIRM: the three-state switch. Strategy dispatch S-1003-B block 1,
// amended by the owner on 2026-10-03.
//
// When reception accepts an online booking request, the patient gets ONE
// confirmation: an email if there is an email on file, an SMS only as the
// fallback when there is none. That replaces the confirmation the acceptance
// sends today (email AND SMS together). This module decides, per patient,
// whether the replacement applies.
//
//   off     today's behaviour. Also what an unset or unrecognised value reads as.
//   canary  the new behaviour only for a patient whose id is on the list.
//   on      the new behaviour for every accepted online request.
//
// FAIL CLOSED: anything that is not exactly `canary` or `on` is `off`. A typo in
// the value must leave today's messages in place, never switch a new one on.
//
// THE LIST LIVES IN CONFIGURATION AND NEVER IN THE REPOSITORY. It holds patient
// ids, the repository is public, and an id is a pointer at a real person.
//
// Pure module: no DB, no SDK, no `server-only`. Both the dispatch (Inngest) and
// the acceptance server actions read it, so they cannot disagree about who the
// new behaviour applies to.

export type BookConfirmMode = "off" | "canary" | "on";

type Env = Record<string, string | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The switch. Trimmed and lower-cased; everything else is `off`. */
export function bookConfirmMode(env: Env = process.env): BookConfirmMode {
  const raw = (env.BOOK_CONFIRM_MODE ?? "").trim().toLowerCase();
  if (raw === "canary") return "canary";
  if (raw === "on") return "on";
  return "off";
}

/**
 * The canary list: comma-separated patient uuids. An entry that is not a uuid
 * is dropped, so a stray word or an empty segment can never match a patient.
 */
export function bookConfirmCanaryPatientIds(env: Env = process.env): ReadonlySet<string> {
  const raw = env.BOOK_CONFIRM_CANARY_PATIENT_IDS ?? "";
  const ids = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => UUID.test(part));
  return new Set(ids);
}

export type BookConfirmDecision = {
  mode: BookConfirmMode;
  /** True when the new behaviour applies to THIS patient. */
  applies: boolean;
};

/** Does the new behaviour apply to this patient, under the current switch? */
export function bookConfirmAppliesTo(patientId: string, env: Env = process.env): BookConfirmDecision {
  const mode = bookConfirmMode(env);
  if (mode === "on") return { mode, applies: true };
  if (mode === "canary") {
    return { mode, applies: bookConfirmCanaryPatientIds(env).has(patientId.trim().toLowerCase()) };
  }
  return { mode, applies: false };
}
