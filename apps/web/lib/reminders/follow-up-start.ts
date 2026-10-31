// R37 (R26 CUT, strategy's ruling, Tier B, outside R9): the 24 hour run after a
// concluded visit STARTS ONLY WHEN A MESSAGE CAN RESULT. Verbatim:
//
//   send-follow-up-notification starts only when a message can result:
//   survey off: not started; canary: only the canary patient ids;
//   on: every completed visit. The mode is read when the visit is completed.
//
// WHY. Before this, every row moved to Concluida sent appointment/completed,
// and every one of those events held a run asleep for 24 hours that, with the
// switch off, woke into `dispatchFollowUp` and sent nothing: both follow-up
// bodies are `approved: false` (notification-registry.ts), so all it left was
// a suppressed ledger row. A run that cannot send is a cost with no message.
//
// WHAT A RUN CAN SEND, read off `dispatchSurvey` (dispatch.ts), which is the
// step the run wakes into:
//   the survey     where `surveyAppliesTo` says it applies: every patient
//                  under `on`, a listed patient under `canary`, nobody under
//                  `off`. The SAME function the dispatch reads, so the start
//                  and the send cannot disagree about who is on the list.
//   the follow-up  everywhere the survey does not go (off, and an unlisted
//                  patient under canary), and never on a "Corrigir estado"
//                  run (`surveyOnly`, Q-O). It reaches a patient only if one
//                  of its two bodies is APPROVED in the registry.
// So the run starts when the survey applies, or when the follow-up can go:
// not `surveyOnly` and a follow-up body approved. The approval is READ FROM
// THE REGISTRY, never assumed false: the day JP approves a follow-up body, the
// `off` cut must stop suppressing a message that has become real, and this
// answers true without anyone remembering to edit it.
//
// THE MODE IS READ AT COMPLETION, by the caller, after the commit. A visit
// concluded while the switch is off starts no run, and switching to canary or
// on afterwards does not give it one: it gets no survey. The owner switches
// BEFORE the canary patient's visit is marked Concluida.
//
// THE DISPATCH STILL READS THE MODE WHEN THE RUN WAKES (dispatch.ts, untouched).
// Defence in depth: a run started under canary or on whose switch is turned
// off before it wakes must still not send what it should not, and a run asleep
// from before this cut (one for every concluded visit) is judged there too.
//
// Pure module: no DB, no SDK, no `server-only`, so the sender and the tests
// read the same answer.

import { resolveApproved, type TemplateRegistry } from "@osteojp/notify";
import { webRegistry } from "./notification-registry";
import { surveyAppliesTo, surveySendMode } from "./survey-mode";

type Env = Record<string, string | undefined>;

/**
 * The two bodies `dispatchFollowUp` sends, under the ids and channels it sends
 * them with (dispatch.ts). follow-up-start.test.ts asserts both are registered
 * against appointment/completed, so a rename cannot quietly make this read
 * "unapproved" for a body that has been approved under its new id.
 */
export const FOLLOW_UP_TEMPLATES = [
  { id: "follow_up.email", channel: "email" },
  { id: "follow_up.sms", channel: "sms" },
] as const;

/** Can the follow-up message reach a patient: is either of its bodies approved? */
export function followUpMessageApproved(registry: TemplateRegistry = webRegistry): boolean {
  return FOLLOW_UP_TEMPLATES.some((t) => resolveApproved(registry, t.id, t.channel) !== null);
}

/**
 * Should a completion start the 24 hour run? True exactly when the run, if it
 * woke now, could send a message (see the head of this file).
 *
 * `patientId` is the appointment's patient, read by the caller. `null` means it
 * could not be read: the survey then applies only under `on`, which names
 * nobody, and never under `canary`, which cannot be asked about a patient it
 * was not told. Fail closed: an unknown patient is not on the list.
 */
export function followUpRunCanResult(
  args: { patientId: string | null; surveyOnly: boolean },
  env: Env = process.env,
  registry: TemplateRegistry = webRegistry,
): boolean {
  const survey =
    args.patientId === null
      ? surveySendMode(env) === "on"
      : surveyAppliesTo(args.patientId, env).applies;
  if (survey) return true;
  // Q-O: a correction's run never sends the follow-up, so only the survey counts.
  if (args.surveyOnly) return false;
  return followUpMessageApproved(registry);
}
