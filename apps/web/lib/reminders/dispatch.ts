import { CONFIRMABLE_STATUSES } from "./confirmable-statuses";
import "server-only";
import { parseTenantConfig, type ReminderConfig } from "@/lib/admin/settings-config";
import { isGuestLinkedAppointment, loadReminderData } from "./data";
import { resolveLocale, formatTime, formatDateLong, formatDateShort } from "./locale";
import {
  renderEmail,
  renderConfirmationEmail,
  renderConfirmationSms,
  renderBookingApprovedEmail,
  renderBookingApprovedSms,
  renderFollowUpEmail,
  renderFollowUpSms,
  renderNoShowEmail,
  renderNoShowSms,
  type ReminderContext,
  type ReminderOffsetId,
  type FollowUpContext,
  type NoShowContext,
} from "./templates";
import {
  feeNoticeFlagEnabled,
  shouldRenderFeeNotice,
  smsTemplateIdFor,
} from "./fee-notice";
import { confirmLinkEnabled, generateConfirmCode } from "./confirm-code";
import { issueConfirmCode, withdrawConfirmCode } from "./confirm-code-store";
import { renderReminderSmsBody } from "./sms-body";
import {
  ProviderSendError,
  sendEmail,
  sendSms,
  suppressionReasonOf,
  type SendResult,
} from "./clients";
import {
  HANDED_OVER_WHILE_LIVE_SEND_OFF,
  hasBookingApprovedHandOver,
  recordBookingApprovedHandOver,
  recordDispatch,
} from "./dispatch-ledger";
import {
  EARLY_CLAIM_MS,
  releaseReminderClaim,
  reminderMark,
  takeReminderClaim,
  takeReminderClaimClosed,
  type ReminderClaimTaker,
} from "./reminder-claim";
import { sweepLookAheadLimit } from "./sweep";
import { sweepSends } from "./sweep-mode";
import { bookConfirmAppliesTo } from "./book-confirm-mode";
import { surveyAppliesTo, surveySendMode } from "./survey-mode";
import {
  renderSurveyEmailBody,
  renderSurveySmsBody,
  surveyValidUntilDateLong,
} from "./survey-body";
import { generateSurveyCode } from "@/lib/surveys/survey-code";
import { issueSurveyAutomatic } from "@/lib/surveys/survey-store";
import {
  bookingApprovedLocationContact,
  bookingApprovedServiceName,
  planBookingApprovedChannel,
  smsNumberVerdict,
} from "./book-confirm-plan";
import type { Channel } from "@osteojp/notify";
import {
  signRescheduleToken,
  rescheduleTokenExpiry,
  type TokenScope,
} from "./link-token";
import { REMINDER_OFFSETS, channelForOffset } from "./offsets";

// Reminder dispatch: load (tenant-scoped) → resolve locale → render PT/EN →
// send (sandbox-gated). One function, called from the Inngest step. Kept thin
// and side-effect-explicit so the Inngest layer stays about orchestration.

// Statuses where a reminder still makes sense. A cancelled / completed /
// no-show appointment is dropped silently — the run is a no-op, not an error.
const REMINDABLE_STATUSES = new Set(["scheduled", "confirmed"]);

/**
 * The pedido gate. An appointment that is a PEDIDO DE MARCACAO reception has not
 * accepted must not produce a reminder (R10).
 *
 * ==========================================================================
 * IT KEYS ON `origin`, NOT ON `confirmation_state`, AND THAT CHANGE IS A
 * DEFECT FIX, NOT A REFINEMENT. R10's reasoning is untouched; the column it
 * was implemented against was the wrong one.
 * ==========================================================================
 *
 * WHAT THE OLD GATE DID. It was `confirmation_state = 'pending'`. That column
 * is NOT NULL DEFAULT 'pending' (migration 0024), and the staff creation path
 * leaves it unset ON PURPOSE so the default applies - actions.ts says so in as
 * many words: "`confirmation_state` is left unset so its DB default
 * (`pending`) applies; the two axes stay orthogonal". So EVERY appointment in
 * the system, staff-booked and portal alike, is born `pending`, and this gate
 * refused EVERY ONE OF THEM. No reminder of any kind could be dispatched. The
 * only writer that ever clears `pending` is redeem.ts, reached by clicking the
 * confirm link in the 48h email - a reminder this same gate had already
 * refused to send. The pipeline could not reach its own unlock.
 *
 * WHY THE TEST SUITE DID NOT CATCH IT, recorded because the shape recurs.
 * pedido-not-remindable.test.ts has exactly the right negative arm - "a gate
 * that skipped every `scheduled` row would silently kill reminders for
 * ordinary staff-booked appointments" - and its fixture spells that arm with
 * `confirmationState: null`. Null is what rows PREDATING 0024 carry. Nothing
 * the product writes today is null. The arm guarded a state production no
 * longer produces, so it passed while the property it names was false.
 *
 * WHAT A PEDIDO ACTUALLY IS, taken from the database rather than re-derived
 * here. `public.is_unconfirmed_pedido` (0059, rewritten by 0067) is
 * `status = 'scheduled' AND (origin = 'patient_portal' OR an
 * appointment_request notification exists)`, and 0067's header states the
 * property that makes it safe: "a staff booking has neither marker". It does
 * not consult `confirmation_state` at all. This gate now agrees with it on the
 * arm the dispatcher can see in its own scoped read.
 *
 * THE NOTIFICATION ARM IS DELIBERATELY NOT MIRRORED. It exists in the SQL for
 * legacy rows the 0067 backfill could not reach and for the deploy window; on
 * the send path it would buy a second query per reminder to catch rows whose
 * `origin` the same backfill already set. If a legacy pedido slips through, a
 * patient receives one reminder for a request - the pre-R10 behaviour for that
 * row only. That is a stated cost, not an oversight.
 *
 * A SET RATHER THAN AN EQUALITY, kept from the original for the original
 * reason: a future provenance that also means "not agreed yet" must be added
 * HERE rather than discovered as a second reminder defect.
 */
const PEDIDO_ORIGINS = new Set(["patient_portal"]);

/**
 * A pedido is only unaccepted while it is still `scheduled`. Reception
 * accepting one moves it to `confirmed` (migration 0061 part 2 records the
 * therapist-confirm path doing exactly that), and `REMINDABLE_STATUSES`
 * already admits `confirmed` - so an accepted pedido becomes remindable with
 * no further state to write.
 */
function isUnacceptedPedido(data: { status: string; origin: string }): boolean {
  return data.status === "scheduled" && PEDIDO_ORIGINS.has(data.origin);
}

export type DispatchOutcome =
  | {
      dispatched: false;
      reason:
        | "not_found"
        /**
         * SEC-reminder-path-ignores-soft-delete. The patient was soft-deleted
         * AFTER this message was scheduled, and the send was suppressed.
         *
         * ITS OWN REASON, NEVER FOLDED INTO `not_found`, and that is a ruling
         * rather than a preference. `not_found` is also what RLS returns for an
         * appointment outside the caller's tenant - routine, expected, and
         * uninteresting. Collapsing the two would make the ONE outcome anybody
         * needs to see ("we stopped an SMS to somebody reception deleted")
         * indistinguishable from ordinary tenant scoping, in a pipeline where
         * REMINDERS_LIVE_SEND is true and the message reaches a real phone.
         *
         * LE-suppression-observation is waiting to SEE a suppression happen.
         * A suppression that cannot be told apart from a no-op is not one.
         */
        | "patient_deleted"
        | "status"
        /** W13-C: an unconfirmed pedido. Distinct from `status` on purpose - a
         *  pedido IS `scheduled`, so collapsing the two would hide which gate
         *  fired and make the skip unreadable in the logs. */
        | "unconfirmed"
        | "no_contact"
        | "lead_time_off"
        | "channels_off"
        /** The run's channel is not the channel this offset routes to (W14-01).
         *  Distinct from `channels_off`, which means the channel was routed
         *  correctly and then switched off; this means it was never this
         *  offset's channel at all. */
        | "channel_not_for_offset"
        /** Booking confirmation only: the appointment was not created by the
         *  patient through the portal. Decision A, owner 2026-08-31. */
        | "origin"
        /**
         * THE RENDERER REFUSED THE BODY, and this run wrote nothing.
         *
         * A body that would leave GSM-7 or spill into a second segment is not
         * sent, because the split is silent and doubles the cost of every
         * reminder. Before INC-CONFIRM-07 that refusal was a THROW, raised
         * after a confirm code had been minted: Inngest recorded a retryable
         * job failure, the stranded code blocked the retry from minting a fresh
         * one, and the retry then sent the SHORTER body - no link - with
         * nothing anywhere saying the link had been dropped.
         *
         * It is an OUTCOME now, so the run completes, the reason reaches
         * Inngest's own output beside the other skip reasons, and no row is
         * written in front of it.
         */
        | "body_refused"
        /**
         * BOOK-CONFIRM only. The appointment's LOCATION row has no address, or
         * no phone. The booking-approved message prints both and takes them
         * from that row alone, so nothing is sent on either channel and
         * nothing falls back to the tenant's clinic settings.
         */
        | "location_contact_missing"
        /**
         * BOOK-CONFIRM only. The appointment carries no service, and the
         * approved email names one. Refused for the same reason a missing
         * location contact is: the copy is final and has no wording for it.
         */
        | "service_missing"
        /**
         * BOOK-CONFIRM only. A booking-approved message was already handed over
         * for this appointment. One approval, one message.
         */
        | "already_sent"
        /**
         * Reminders only. This reminder, for the start the visit has now, was
         * already handed to the provider: an earlier sender's claim is live and
         * a `sent` ledger row followed it (./reminder-claim.ts). Nothing is
         * sent, and NO LEDGER ROW IS WRITTEN: the send is already on record,
         * and a second row would read as a second attempt.
         *
         * While the sweep is the sender (SWEEP-47) it is also the answer for a
         * reminder another sender holds right now, and for one whose outcome
         * is unknown: a live claim of this reminder exists for this start.
         */
        | "claim_held"
        /**
         * Reminders only. HELD BY A DUPLICATE: the table refused this call's
         * claim because another taker holds the same attempt of this reminder
         * for this start (0106, `reminder_claims_claim_attempt_key`). Nothing
         * is sent, and, as for `claim_held`, NO LEDGER ROW IS WRITTEN: the
         * taker that holds the attempt writes the row for it. Strategy, Q-A
         * of 2026-10-15.
         */
        | "claim_held_by_duplicate"
        /**
         * Reminders only, and only while the sweep is the sender (SWEEP-47).
         * THE REMINDER'S TIME PASSED TOO LONG AGO: more than 3 hours for an
         * SMS, more than 12 for an email (`REMINDER_LATE_LIMIT_MS`). It is
         * recorded as too late and not sent, and it is final for this start:
         * the claim taken for it is kept.
         */
        | "mark_missed"
        /**
         * Reminders only, and only while the sweep is the sender. THE VISIT
         * HAS ALREADY BEGUN, by the dispatcher's own clock at the moment of
         * the send. Nothing is sent, whatever its offset and its channel
         * allow, and it is final for this start: the claim is kept.
         */
        | "start_passed"
        /**
         * Reminders only, and only while the sweep is the sender. The call
         * came over ten minutes BEFORE the reminder's time: a sleeping job
         * that woke at the old time of a visit since moved later. Nothing is
         * sent and no claim is taken; `dueAt` says when the reminder is due.
         */
        | "not_due"
        /**
         * Today's confirmation only. Building the reschedule link threw (its
         * base URL or its signing secret is not configured), so neither the
         * email nor the SMS was attempted. The error still propagates; this is
         * the row it leaves behind.
         */
        | "reschedule_link_error"
        /**
         * The satisfaction survey only. The patient has no email the survey
         * may use and the stored number cannot receive an SMS. Asked BEFORE a
         * code is made, so nothing is issued for a message that cannot go.
         */
        | "invalid_phone"
        | "landline"
        /**
         * The satisfaction survey only: the database's own answers when asked
         * to issue the send (`issue_survey_automatic`, migration 0102).
         * `survey_cooldown` is a send to this patient in the last 60 days.
         * `survey_not_eligible` is the door's one word for a patient who opted
         * out, a visit that already has an answer, and a visit or a channel
         * that changed between this run's read and the door's.
         * `survey_not_allowed` is a session the door does not answer.
         */
        | "survey_cooldown"
        | "survey_not_eligible"
        | "survey_not_allowed";
      /**
       * The refusing sentence, for `body_refused`. Operator-facing and safe:
       * a length and a rule, never a recipient, a patient field or a code.
       */
      detail?: string;
      /** For `not_due`: the instant the reminder falls due, as ISO text. */
      dueAt?: string;
    }
  | { dispatched: true; channels: SendResult[] };

/**
 * Lead-time (hours before start) for each scheduler offset id, derived from
 * REMINDER_OFFSETS so the dispatch gate and the scheduler share one source of
 * truth. The tenant config's REMINDER_LEAD_TIME_OPTIONS is deliberately the same
 * 48/24 set, which is what makes the membership test in planReminderChannels
 * meaningful — the UI can never select a lead time the pipeline can't honor.
 */
const OFFSET_LEAD_HOURS = new Map<ReminderOffsetId, number>(
  REMINDER_OFFSETS.map((o) => [o.id, o.minutesBefore / 60]),
);

export type ReminderPlan =
  | { send: false; reason: "lead_time_off" | "no_contact" | "channels_off" }
  | { send: true; email: boolean; sms: boolean };

/**
 * Decide, from the tenant reminder config, which channels (if any) a reminder
 * for this (offset, patient-contact) should go out on. Pure + exported for
 * direct unit testing without the DB. Precedence, most decisive first:
 *   1. lead_time_off  — the tenant disabled this offset; nothing sends, contact
 *      and channel toggles are irrelevant.
 *   2. no_contact     — the patient has neither email nor phone on file.
 *   3. channels_off   — contact exists, but every channel the patient could be
 *      reached on is disabled (tenant config OR patient opt-out).
 * On the default config (both channels on, both lead times on) and default
 * patient prefs (SMS on, email off), this collapses to the prior contact-
 * presence behavior — which is how "defaults preserve current behavior" holds.
 *
 * patientPrefs defaults to both-enabled to preserve behavior for callers that
 * don't yet supply the field (e.g. existing tests).
 */
export function planReminderChannels(
  reminders: ReminderConfig,
  offsetId: ReminderOffsetId,
  contact: { email: boolean; phone: boolean },
  patientPrefs: { smsEnabled: boolean; emailEnabled: boolean } = { smsEnabled: true, emailEnabled: true },
): ReminderPlan {
  const leadHours = OFFSET_LEAD_HOURS.get(offsetId);
  if (
    leadHours === undefined ||
    !(reminders.leadTimeHours as readonly number[]).includes(leadHours)
  ) {
    return { send: false, reason: "lead_time_off" };
  }
  if (!contact.email && !contact.phone) {
    return { send: false, reason: "no_contact" };
  }
  // ================================================================== //
  // OWNER ROUTING RULE, 2026-08-31: ONE CHANNEL PER OFFSET, SERVER-SIDE.
  // 48h is EMAIL ONLY with no SMS twin. 24h is SMS ONLY with no email twin.
  // ================================================================== //
  // It is applied HERE, in the plan, rather than left to the caller passing
  // the right channel. Before this the rule was true only by construction:
  // `REMINDER_OFFSETS` carries one channel per offset and the scheduler fans
  // out that one, so the pair was always right AS LONG AS the scheduler was
  // the only caller. Nothing refused a wrong pair, and the tenant config can
  // independently switch both channels on - so "48h email only" rested on a
  // fan-out detail rather than on a rule. Now the plan cannot produce a twin
  // even when every toggle above it says yes.
  //
  // The patient's own opt-out survives it, and that is the point of applying
  // the routing FIRST and the preference SECOND rather than replacing one with
  // the other: routing decides WHICH channel this offset may use, the
  // preference decides whether that channel may be used AT ALL for this
  // patient. A patient who switched SMS off gets no 24h SMS, and gets no email
  // in its place, because 24h does not route to email.
  const routed = channelForOffset(offsetId);
  const email =
    routed === "email" && reminders.emailEnabled && patientPrefs.emailEnabled && contact.email;
  const sms =
    routed === "sms" && reminders.smsEnabled && patientPrefs.smsEnabled && contact.phone;
  if (!email && !sms) return { send: false, reason: "channels_off" };
  return { send: true, email, sms };
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * COMMS-01: why an SMS never reached the provider at all, as its own value.
 *
 * THIS WAS `null`, AND `null` COLLAPSED TWO FACTS INTO ONE LEDGER REASON. Both
 * skips below returned null, so the reminder's ledger row could only say
 * `send_refused`, and Lembretes SMS could not tell reception "the number is a
 * typo" from "the number is a landline" - the exact distinction the landline
 * branch exists to keep (PORTAL-REHYDRATE 1.3, the `string | null` instance).
 */
export type SmsSkip = { skipped: "invalid_phone" | "landline" };

function isSmsSkip(r: SendResult | SmsSkip): r is SmsSkip {
  return "skipped" in r;
}

/**
 * Normalize the stored patient phone to E.164 PT and send, or skip with a
 * structured warning when it cannot normalize (docs/QUESTIONS.md 2026-07-06:
 * un-normalized numbers reach Twilio and fail with 21211 once live). The log
 * carries ids only — never the raw number (PII rule #7). Returns an `SmsSkip`
 * naming the reason on skip, so callers push no channel result and the ledger
 * records the specific reason; the appointment still counts as dispatched
 * (email, when planned, goes out independently).
 */
async function sendPatientSms(args: {
  tenantId: string;
  appointmentId: string;
  patientId: string;
  phone: string;
  body: string;
  templateId: string;
  /** SWEEP-47: passed by the reminder dispatch only. */
  attempt?: SendAttempt;
  /**
   * Q-L: raise the sender or body alert (`alertSenderOrBodyRefusal`) here,
   * after the `provider_error` row. Passed by the confirmation, booking
   * approved, follow-up and no-show senders. The reminder paths do not pass
   * it: they raise the alert themselves, after their claim is settled.
   */
  alertsOnOurRefusal?: true;
}): Promise<SendResult | SmsSkip> {
  // ONE VERDICT, SHARED. `smsNumberVerdict` is the two questions this function
  // has always asked (does it normalise; is it a line that can receive SMS), in
  // one place, because the approver's notice must give the SAME answer at
  // approval time that this gives at send time (./book-confirm-plan.ts).
  const verdict = smsNumberVerdict(args.phone);
  if (!verdict.ok && verdict.reason === "invalid_phone") {
    console.warn(
      `[reminders] sms skipped: invalid_phone tenantId=${args.tenantId} appointmentId=${args.appointmentId} patientId=${args.patientId}`,
    );
    return { skipped: "invalid_phone" };
  }

  // ================================================================= //
  // A LANDLINE IS SKIPPED, NOT SENT. Q-LE-REMINDERS-LANDLINE-1, ruled
  // 2026-08-20: skip AND surface it to reception.
  // ================================================================= //
  // `normalizePhonePT` admits the `2` prefix - Portuguese geographic lines,
  // which cannot receive SMS - so before this the clinic paid Twilio for a
  // message the carrier had nowhere to deliver. The patient got no reminder
  // either way; the only difference the skip makes is the bill.
  //
  // ITS OWN REASON, NOT `invalid_phone`, and that distinction is the whole
  // reason this branch is separate. They are different facts about different
  // problems: `invalid_phone` is a number nobody can use and the record is
  // wrong; `landline` is a perfectly good number that cannot receive THIS
  // channel. Reception acts on them differently - one is a typo, the other is a
  // conversation with the patient - and a single log line saying "invalid"
  // would send them to correct a number that is correct.
  //
  // SKIPPING IS HALF THE RULING AND IT IS THE HALF THAT DOES NOT HELP THE
  // PATIENT. The clinic stops paying and the patient still gets nothing. The
  // other half is the reception surface: `listPatientsUnreachableBySms` derives
  // the patients this WILL happen to from their stored number and their upcoming
  // appointments - BEFORE the reminder is due, rather than logging it after.
  if (!verdict.ok) {
    console.warn(
      `[reminders] sms skipped: landline tenantId=${args.tenantId} appointmentId=${args.appointmentId} patientId=${args.patientId}. ` +
        `The stored number is a Portuguese geographic line and cannot receive SMS. ` +
        `This is a DATA problem, not a delivery failure: reception sees the patient on /notificacoes and asks for a mobile.`,
    );
    return { skipped: "landline" };
  }
  const to = verdict.e164;
  // A Twilio rejection leaves a `provider_error` row before it propagates, for
  // the reason in sendRecordingProviderError: the ledger write in the caller
  // sits after this await and a throw jumps over it. Function declarations
  // hoist, so the helper below is available here.
  return sendRecordingProviderError(
    {
      tenantId: args.tenantId,
      appointmentId: args.appointmentId,
      channel: "sms",
      templateId: args.templateId,
    },
    () =>
      sendSms({
        to,
        body: args.body,
        templateId: args.templateId,
        appointmentId: args.appointmentId,
      }),
    args.attempt,
    args.alertsOnOurRefusal === true,
  );
}

/**
 * The ledger reason for a message the notify gate held back: its own reason
 * (`live_send_disabled`, `template_unapproved`, `missing_provider_config`,
 * `invalid_recipient`), so a row says WHICH lock held. `sandbox` only when a
 * result carries none, which is the vocabulary the reminder rows already use.
 */
function gateSuppressionReason(result: SendResult): string {
  return suppressionReasonOf(result) ?? "sandbox";
}

function tenantPhone(settings: unknown): string {
  const s = settings as { contacts?: { phone?: unknown } } | null | undefined;
  const phone = s?.contacts?.phone;
  return typeof phone === "string" ? phone : "";
}

/* ================================================================== */
/* Provider rejections — the ledger's third outcome, finally written   */
/* ================================================================== */

/**
 * THE HOLE THIS CLOSES. 0075 gave `reminder_dispatches` three outcomes - sent,
 * suppressed and `provider_error` - and until now the code wrote two. A message
 * the provider REFUSED produced no row at all, because every ledger write in
 * this file sits AFTER its `await` and a throw jumps straight over it. The
 * wrapper on `dispatchReminder` could not save it either: that wrapper records
 * not-dispatched OUTCOMES, and a throw is not an outcome.
 *
 * So the one case an operator most needs to see - "we handed it over and it came
 * back refused" - was the one case that left nothing behind but a failed Inngest
 * run, which expires. External evidence said zero reminder emails had ever
 * arrived; nothing in this system could tell that apart from zero ever ATTEMPTED.
 * That is the distinction this row exists to make, and it now gets written.
 *
 * IT RETHROWS. The run must still fail: Inngest's retry is the delivery
 * behaviour, and swallowing the error to get a tidy row would trade a real
 * retry for a record of not retrying. The ledger observes, it does not decide -
 * the same rule dispatch-ledger.ts states about never throwing INTO the send.
 */
async function sendRecordingProviderError(
  row: { tenantId: string; appointmentId: string; channel: "sms" | "email"; templateId: string },
  send: () => Promise<SendResult>,
  /** The reminder dispatch's note of how far this call got. Absent for every other caller. */
  attempt?: SendAttempt,
  /** Q-L: raise the sender or body alert after the row (see `sendPatientSms`). */
  alertsOnOurRefusal = false,
): Promise<SendResult> {
  try {
    if (attempt) attempt.handOverStarted = true;
    return await send();
  } catch (e) {
    const code = providerErrorCode(e);
    if (attempt) attempt.refusal = { channel: row.channel, code };
    await recordDispatch({ ...row, outcome: "provider_error", providerErrorCode: code });
    // Q-L: after the row, and it never throws, so `e` goes on unchanged.
    if (alertsOnOurRefusal) await alertSenderOrBodyRefusal({ channel: row.channel, code });
    throw e;
  }
}

/**
 * SWEEP-47. What a caller knows about the hand-over it asks for, for the
 * dispatch while the sweep is the sender.
 */
export type ReminderHandOver = {
  /**
   * The caller's clock: the instant the pass SELECTED at. A sleeping job hands
   * none. IT ANSWERS ONE QUESTION ONLY, whether the call came too early
   * (`not_due`), where a clock that is behind can only hold a reminder back.
   * It is NEVER what "too late" or "the visit has begun" is judged against: a
   * pass stores this instant with its selection, and a run that stalls
   * between selecting and sending would be judged as if no time had passed.
   * Those two are judged on the dispatcher's own clock (`clockOfTheSend`).
   */
  now?: Date;
  /**
   * The day's last pass took this mark before it fell due (the next pass is in
   * the morning). Its claim is then not recorded as early, so it holds.
   *
   * IT IS A REQUEST, NOT A FACT. The pass says it of the mark it selected; the
   * dispatcher grants it only for the mark of the start it has just loaded,
   * and only while that mark is before the limit the day's last pass may take
   * (`reminderIsTakenAhead`). A visit moved later since the selection is not
   * due, whatever the pass said.
   */
  takenAhead?: boolean;
};

/**
 * SWEEP-47. HOW LATE A REMINDER MAY STILL GO OUT, by channel. Owner, answer 8a
 * of 2026-10-12: an SMS up to 3 hours after its time, an email up to 12; later
 * than that it is recorded as too late and not sent. Pinned by a test.
 *
 * Applied only while the sweep is the sender, to either taker, in the one
 * place a reminder is sent from (`dispatchReminderClosed`), AGAINST THE CLOCK
 * OF THE SEND (`clockOfTheSend`), never against a clock the caller hands in.
 */
export const REMINDER_LATE_LIMIT_MS: Readonly<Record<"sms" | "email", number>> = {
  sms: 3 * 60 * 60_000,
  email: 12 * 60 * 60_000,
};

/**
 * Is a reminder whose time was `mark` too late to send at `now`? More than the
 * channel's limit after the mark. Exactly the limit is NOT too late.
 *
 * Pure: `now` is passed in.
 */
export function reminderIsTooLate(mark: Date, channel: "sms" | "email", now: Date): boolean {
  return now.getTime() - mark.getTime() > REMINDER_LATE_LIMIT_MS[channel];
}

/**
 * SWEEP-47. THE CLOCK OF THE SEND: read by the dispatcher, at the moment it is
 * about to send, and by nothing else. It takes no argument and no caller can
 * hand one in, so nothing a pass stored at its selection can stand in for it.
 */
function clockOfTheSend(): Date {
  return new Date();
}

/**
 * SWEEP-47. WHAT THE CLOCK REFUSES, at the instant `now`:
 *
 *   start_passed   THE FLOOR. The visit has begun: its start is at or before
 *                  `now`. Asked first, and of every reminder, an offset this
 *                  build does not know included.
 *   mark_missed    the late rule (`reminderIsTooLate`).
 *
 * Null when the reminder may still go out. Pure: `now` is passed in, and the
 * one caller passes `clockOfTheSend()`.
 *
 * Exported for direct testing.
 */
export function reminderRefusedByTheClock(args: {
  startsAt: Date;
  /** The start minus the offset. Null for an offset this build does not know. */
  mark: Date | null;
  channel: "sms" | "email";
  now: Date;
}): "start_passed" | "mark_missed" | null {
  if (args.startsAt.getTime() <= args.now.getTime()) return "start_passed";
  if (args.mark !== null && reminderIsTooLate(args.mark, args.channel, args.now)) return "mark_missed";
  return null;
}

/**
 * SWEEP-47. MAY THIS MARK BE TAKEN AHEAD OF ITS TIME? Only by the day's last
 * pass, and only a mark that falls due before that pass's limit (23:00 Lisbon,
 * `sweepLookAheadLimit`). `mark` is the mark of the start the dispatcher
 * loaded, never the one the pass selected. `now` is the pass's clock: outside
 * the last pass's window the answer is no for every mark.
 *
 * Exported for direct testing.
 */
export function reminderIsTakenAhead(mark: Date, now: Date): boolean {
  const limit = sweepLookAheadLimit(now);
  return limit !== null && mark.getTime() < limit.getTime();
}

/**
 * SWEEP-47. How far one reminder dispatch got, written by the two places that
 * call a transport. Read by the closed dispatch, which decides from it what
 * becomes of the claim (`dispatchReminderClosed`), and with the switch off by
 * `dispatchReminderInner`, which reads its `refusal` for the alert alone and
 * whose `refusedByTheClock` always answers null. Nothing else reads or writes it.
 */
type SendAttempt = {
  /** A transport was called. From here on the message may have left. */
  handOverStarted: boolean;
  /** The transport threw, with the provider's reason class when it gave one. */
  refusal?: { channel: "sms" | "email"; code: string | null };
  /**
   * WHAT THE CLOCK REFUSES NOW. Asked as the last thing before each transport
   * is called (`refusedAtTheDoor`); it reads the clock of the send each time.
   */
  refusedByTheClock: () => "start_passed" | "mark_missed" | null;
  /** The clock refused at the transport's door. Nothing was sent; the claim is kept. */
  refusedAtTheDoor?: true;
};

/**
 * SWEEP-47. THE LAST THING BEFORE A TRANSPORT IS CALLED, in the closed
 * dispatch only: ask the clock once more. Between the claim and this line a
 * reminder is rendered and rows are written, and each of those is a wait. Null
 * for every other caller, for the dispatch with the switch off (its clock
 * refuses nothing), and whenever the reminder may still go out.
 */
function refusedAtTheDoor(attempt: SendAttempt | undefined): DispatchOutcome | null {
  const reason = attempt?.refusedByTheClock() ?? null;
  if (attempt === undefined || reason === null) return null;
  attempt.refusedAtTheDoor = true;
  return { dispatched: false, reason };
}

/**
 * THE PROVIDER ANSWERS AFTER WHICH A CLAIM IS GIVEN UP, so the reminder can be
 * taken again. ONE LIST PER CHANNEL, PINNED BY A TEST. Each name is here as an
 * answer that says the message was NOT accepted. ANYTHING ELSE IS AN UNKNOWN
 * OUTCOME: an answer that is not here, an error with no code, a call that never
 * came back. The claim then stays live and the reminder is never sent again,
 * because the message may have gone out.
 *
 * READ ONLY WHILE THE SWEEP IS THE SENDER (the switch on, `dispatchReminderClosed`).
 * With the switch off this list is not read: every throw releases its claim,
 * as before.
 *
 * EMAIL: Resend's own error names (`ProviderSendError.code`, ./clients.ts).
 * `application_error` is NOT here: the SDK uses that name for a request whose
 * answer it could not read, and such a request may have been accepted.
 *
 * SMS: Twilio's numeric codes, each taken as a refusal of the send itself,
 * before Twilio accepted the message, so a second try cannot be a second copy.
 * Ruled by strategy on 2026-10-15 (Q-C), after a check on 2026-10-14 that read
 * Twilio's own error page for each code:
 *
 *   20003  not authenticated            21606  our sender cannot send messages
 *   20429  too many requests            21611  our sender's queue is full
 *   21408  destination region disabled 21612  this sender cannot reach this number
 *                                       21617  our message body is too long
 *
 * WHAT THAT CHECK ESTABLISHED, AND WHAT IT DID NOT. Only 20429's page says
 * outright that the request was not processed. The other pages do not say that
 * the error is given by the send call itself rather than later: that is how
 * Twilio's REST errors are known to behave, not what those pages were found to
 * say, and for 21612 the check marked the point UNCLEAR.
 *
 * KEPT, NOT RELEASED, by the same ruling: 21211 (the number is not valid),
 * 21610 (the patient opted out) and 21614 (the number is not a mobile). Each is
 * about the patient's own number, and a retry fails the same way, so the claim
 * stays live and the reminder is not tried again.
 *
 * NO 30xxx CODE, EVER. Those are delivery answers, given after Twilio accepted
 * the message; they reach the status webhook, never this list, and a resend
 * after one could be a second copy.
 *
 * 21606 and 21617 also raise an alert (`SENDER_OR_BODY_REFUSAL_CODES`), on
 * either REMINDER path, the switch off included, and (Q-L, strategy
 * 2026-10-18) on the confirmation, booking approved, follow-up and no-show
 * SMS, after their `provider_error` row. The survey's own SMS raises none.
 *
 * A code missing from this list costs a reminder that is not retried; a code
 * wrongly on it could cost a second copy.
 */
export const CLAIM_RELEASING_PROVIDER_CODES: Readonly<Record<"sms" | "email", readonly string[]>> = {
  email: [
    "validation_error",
    "invalid_from_address",
    "missing_required_field",
    "rate_limit_exceeded",
    "daily_quota_exceeded",
    "monthly_quota_exceeded",
    "missing_api_key",
    "restricted_api_key",
    "invalid_api_key",
  ],
  sms: ["20003", "20429", "21408", "21606", "21611", "21612", "21617"],
};

/**
 * THE REFUSALS THAT ARE OURS, NOT THE PATIENT'S: our sender (21606) or our
 * message body (21617) is wrong, so every patient's SMS is refused the same
 * way. Each also raises an alert (`alertSenderOrBodyRefusal`), on both
 * reminder paths, the switch off included, besides giving the claim up. Strategy, Q-C of
 * 2026-10-15. Q-L of 2026-10-18 raises the same alert on the confirmation,
 * booking approved, follow-up and no-show SMS (`sendPatientSms`'s
 * `alertsOnOurRefusal`), where there is no claim. Pinned by a test, and every
 * code here is on the list above.
 */
export const SENDER_OR_BODY_REFUSAL_CODES: Readonly<Record<"sms" | "email", readonly string[]>> = {
  email: [],
  sms: ["21606", "21617"],
};

/**
 * Raise the alert for a refusal on `SENDER_OR_BODY_REFUSAL_CODES`. A fixed
 * title, tagged with the code and the channel and nothing else: no number, no
 * body, no patient and no appointment.
 *
 * Sentry is imported LAZILY, inside the one branch that needs it, as
 * lib/auth/context.ts and ./inbound-config.ts do. A warning, as the
 * comparable configuration refusal in ./inbound-config.ts is.
 *
 * IT NEVER THROWS: the provider's error on its way out is the one the
 * scheduler must see. A report that cannot be sent is printed instead.
 */
async function alertSenderOrBodyRefusal(refusal: { channel: "sms" | "email"; code: string | null }): Promise<void> {
  if (refusal.code === null || !SENDER_OR_BODY_REFUSAL_CODES[refusal.channel].includes(refusal.code)) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureMessage("reminders/dispatch: the provider refused our sender or our message body", {
      level: "warning",
      tags: { code: refusal.code, channel: refusal.channel },
    });
  } catch (cause) {
    console.error(
      `[reminders] could not report a sender or body refusal code=${refusal.code} channel=${refusal.channel}: ` +
        `${cause instanceof Error ? cause.name : "unknown"}`,
    );
  }
}

/**
 * After a throw: is the claim given up? Yes when no transport was called (the
 * throw came before any hand-over), and yes when the provider's answer is on
 * the list above. Otherwise no.
 *
 * Exported for direct testing.
 */
export function claimIsGivenUpAfterThrow(attempt: {
  handOverStarted: boolean;
  refusal?: { channel: "sms" | "email"; code: string | null };
}): boolean {
  if (!attempt.handOverStarted) return true;
  const refusal = attempt.refusal;
  if (!refusal || refusal.code === null) return false;
  return CLAIM_RELEASING_PROVIDER_CODES[refusal.channel].includes(refusal.code);
}

/**
 * Did this call hand a message to a provider? Only a real hand-over counts: a
 * message the gate held back (`sandbox`), a number that cannot take an SMS and
 * every outcome that is not a dispatch handed nothing over.
 *
 * Exported for direct testing.
 */
export function reminderWasHandedOver(outcome: DispatchOutcome): boolean {
  return outcome.dispatched && outcome.channels.some((c) => !c.sandbox);
}

/**
 * A bounded, PII-free reason class for `provider_error_code`.
 *
 * Two shapes, because the two providers fail differently and neither is ours to
 * change: our own `ProviderSendError` carries Resend's `error.name`, and a
 * Twilio SDK error carries a numeric `code` (21211, 30003) on the error object.
 * Anything else yields NULL rather than a guess - `provider_error` with no code
 * is an honest row, and a made-up code is not.
 *
 * NEVER the provider's message. Both providers put the recipient in theirs.
 */
function providerErrorCode(e: unknown): string | null {
  if (e instanceof ProviderSendError) return e.code;
  if (typeof e === "object" && e !== null && "code" in e) {
    const c = (e as { code: unknown }).code;
    if (typeof c === "number") return String(c);
    // Bounded: the audit metadata contract refuses a string over 64 chars or
    // carrying whitespace, and this column answers to the same instinct.
    if (typeof c === "string" && c.length <= 64 && !/\s/.test(c)) return c;
  }
  return null;
}

/**
 * Base URL for the signed reschedule link. REQUIRED — no fallback.
 *
 * The previous default was `https://osteojp.pt`, the MARKETING site. Unset in
 * prod meant every reminder and no-show email carried a `/r/<token>` link that
 * 404s, with nothing failing anywhere: the send succeeded, the patient hit a dead
 * page, and the clinic learned about it from a phone call. Failing at render is
 * strictly better than shipping a broken link to a patient.
 */
function requiredRescheduleBase(): string {
  const base = process.env.REMINDERS_RESCHEDULE_BASE_URL;
  if (!base || base.trim() === "") {
    throw new Error(
      "reminders/link: REMINDERS_RESCHEDULE_BASE_URL is required and has no default. " +
        "Set it to the deployed app origin (the host that serves /r/<token>), not the marketing site.",
    );
  }
  return base;
}

function rescheduleLink(args: {
  tenantId: string;
  appointmentId: string;
  startsAt: Date;
  scope: TokenScope;
}): string {
  // Stateless, HMAC-signed token (see link-token.ts) — the URL carries only the
  // opaque token, never patient data or a raw id path. Resolves at /r/<token>.
  // EMAIL only: the token is too long for a single-segment SMS, so the SMS copy
  // points to the clinic phone instead.
  //
  // `scope` is REQUIRED rather than defaulted, and that is the point. Counsel's
  // per-offset matrix (docs/rgpd-token-flow.md §5) gives the 48h email confirm
  // AND cancel, and the 24h SMS confirm ONLY, because the SMS arrives at or
  // inside the clinic's 24h cancel cutoff. A default here would let a future
  // offset acquire the permissive scope by saying nothing, which is exactly how
  // an action the clinic has ruled out would ship unnoticed. Every call site
  // must state which matrix row it is.
  const base = requiredRescheduleBase();
  const token = signRescheduleToken({
    tenantId: args.tenantId,
    appointmentId: args.appointmentId,
    exp: rescheduleTokenExpiry(args.startsAt),
    scope: args.scope,
  });
  return `${base.replace(/\/$/, "")}/r/${token}`;
}

/**
 * Build the channel-agnostic render context from loaded data + resolved locale.
 * Exported for direct unit testing without the DB.
 */
export function buildReminderContext(
  data: {
    tenantId: string;
    startsAt: Date;
    patientName: string;
    practitionerName: string;
    locationName: string;
    locationPhone: string | null;
    tenantSettings: unknown;
    appointmentId: string;
  },
  locale: Parameters<typeof formatTime>[1],
): ReminderContext {
  return {
    patientFirstName: firstName(data.patientName),
    appointmentDateLong: formatDateLong(data.startsAt, locale),
    appointmentDateShort: formatDateShort(data.startsAt),
    appointmentTime: formatTime(data.startsAt, locale),
    practitionerName: data.practitionerName,
    clinicLocation: data.locationName,
    clinicPhone: data.locationPhone || tenantPhone(data.tenantSettings),
    rescheduleLink: rescheduleLink({
      tenantId: data.tenantId,
      appointmentId: data.appointmentId,
      startsAt: data.startsAt,
      // The link is carried by the 48h EMAIL only (see rescheduleLink), which is
      // sent outside the 24h cancel cutoff: counsel's matrix row for that offset
      // is confirm AND cancel. The server still re-checks the cutoff at
      // redemption, because this link can be clicked well after it was sent.
      scope: "confirm_cancel",
    }),
  };
}

/**
 * Render and send the reminder for one appointment + offset, honoring the
 * tenant's reminder config (channel toggles + selected lead times) read from
 * tenants.settings. A channel goes out only when it is BOTH enabled in config
 * AND the patient has that contact on file; an offset the tenant turned off is
 * suppressed entirely. Config is read tolerantly (parseTenantConfig), so a
 * tenant with no reminder config saved behaves exactly as before — all channels
 * on, both lead times on. Sends stay sandbox-gated in the wrappers, so by
 * default this renders and returns without any network call.
 *
 * The scheduler still enqueues every offset (it has no per-tenant config); the
 * gate lives here so the scheduling math (#98/#99) stays untouched.
 */
/* ================================================================== */
/* THE ONE DOOR EVERY DISPATCH PATH GOES THROUGH.                       */
/* ================================================================== */
/**
 * Load the appointment and apply the two gates that are true for EVERY message
 * this file can send, whatever kind it is.
 *
 * ==========================================================================
 * WHY IT IS ONE FUNCTION AND NOT A CLAUSE REPEATED FOUR TIMES
 * ==========================================================================
 * Four exported dispatchers - reminder, confirmation, follow-up, no-show - each
 * opened with the identical two lines: load, then `not_found`. A soft-delete
 * gate written four times is a gate a fifth dispatcher will not have, and the
 * fifth dispatcher is the one that sends the message nobody expected. Same
 * reasoning as `insertPatientTx` being the ONE place a patients row is written
 * (PL-34): the invariant lives where it cannot be omitted, not where it has to
 * be remembered.
 *
 * ==========================================================================
 * WHY THE SOFT-DELETE CHECK IS HERE AND NOT IN THE QUERY
 * ==========================================================================
 * `loadReminderData` could have filtered `deleted_at IS NULL` and returned null.
 * That suppresses the send and reports it as `not_found` - the same outcome RLS
 * produces for an appointment in another tenant. The suppression would work and
 * be invisible, which for a live SMS path is the failure mode, not the fix.
 *
 * ==========================================================================
 * AND IT LOGS, BECAUSE A RETURN VALUE IS NOT AN OBSERVATION
 * ==========================================================================
 * The outcome reaches Inngest's run output, which is real but is a place nobody
 * looks until they already suspect something. The `console.warn` is the same
 * shape `sendSmsGuarded` already uses for its two skips - `[reminders] ...
 * skipped: <reason> tenantId=... appointmentId=... patientId=...` - so this
 * suppression lands in the same log stream, greppable by the same prefix, and
 * carries IDS ONLY. No name, no phone number, no body. CLAUDE.md rule 7.
 */
type Dispatchable =
  | { ok: true; data: NonNullable<Awaited<ReturnType<typeof loadReminderData>>> }
  /** `patientId` is present when the row WAS read (a soft-deleted patient), and
   *  absent for `not_found`. An id, never a name. `startsAt` travels with it,
   *  for the reminder claim, which is keyed on the start. */
  | { ok: false; outcome: DispatchOutcome; patientId?: string; startsAt?: Date };

async function loadDispatchable(
  tenantId: string,
  appointmentId: string,
  kind: "reminder" | "confirmation" | "followup" | "noshow" | "survey",
): Promise<Dispatchable> {
  const data = await loadReminderData(tenantId, appointmentId);
  if (!data) return { ok: false, outcome: { dispatched: false, reason: "not_found" } };

  // TRUTHY, not `!== null`. A Date is truthy and both null and undefined are
  // falsy, so a fixture that omits the field reads as LIVE rather than as
  // deleted. The type makes the field required, so real code cannot omit it;
  // what this shape avoids is a test fixture silently suppressing every send.
  // The field's PRESENCE IN THE QUERY is asserted separately (data.test.ts) -
  // if it were ever dropped from the select, this gate would go quiet and only
  // that assertion would notice.
  if (data.patientDeletedAt) {
    console.warn(
      `[reminders] ${kind} skipped: patient_deleted tenantId=${tenantId} ` +
        `appointmentId=${appointmentId} patientId=${data.patientId}. ` +
        `The patient was soft-deleted after this message was scheduled; nothing was sent.`,
    );
    return {
      ok: false,
      outcome: { dispatched: false, reason: "patient_deleted" },
      patientId: data.patientId,
      startsAt: data.startsAt,
    };
  }

  return { ok: true, data };
}

/**
 * OBS-04 — THE LEDGER WRAPPER, AND WHY IT IS A WRAPPER.
 *
 * `dispatchReminder` has TEN return points and every one of them is a fact
 * worth recording: a suppression is "we deliberately sent nothing, and here is
 * why", which is the half that would have made 2026-09-02 legible. Threading a
 * write through ten branches would have missed one, and the one it missed would
 * be the one that mattered - that is how this pipeline came to have a table
 * nobody wrote to in the first place.
 *
 * So the real function is renamed and this wrapper records whatever it returns.
 * A NEW RETURN BRANCH CANNOT ESCAPE THE LEDGER, which is the property worth
 * having and the reason not to do it by hand.
 *
 * THE SENT CASE IS ALREADY RECORDED INSIDE, per channel, because only the inner
 * function knows the provider id, the body length and the segment count. The
 * wrapper therefore records only the NOT-dispatched outcomes, and
 * `dispatched: true` falls through untouched.
 *
 * ONE EXCEPTION, AND IT IS NAMED: `claim_held` writes no row. It means this
 * reminder's `sent` row is ALREADY in the ledger for this start, written by
 * the sender that got there first. A row here would be a second record of one
 * reminder, filed after that sender's claim as if it had tried twice.
 * `claim_held_by_duplicate` is the same exception for the same reason: the
 * taker that holds the attempt records what became of it. With no row, its
 * record is one log line here, which names the reason, the offset and the
 * channel and nothing else: no appointment, patient or tenant, no number, no
 * body (strategy, Q-A of 2026-10-15).
 */
export async function dispatchReminder(
  tenantId: string,
  appointmentId: string,
  offsetId: ReminderOffsetId,
  channel: Channel,
  /** Who is asking, for the reminder claim. The sleeping job passes nothing;
   *  the pass names itself. */
  taker: ReminderClaimTaker = "run",
  /** SWEEP-47: what the pass knows about this hand-over. Read only while the
   *  sweep is the sender; with the send switch off nothing looks at it. */
  handOver: ReminderHandOver = {},
): Promise<DispatchOutcome> {
  const outcome = await dispatchReminderInner(tenantId, appointmentId, offsetId, channel, taker, handOver);
  if (!outcome.dispatched && outcome.reason === "claim_held_by_duplicate") {
    console.warn(`[reminders] reminder skipped: claim_held_by_duplicate offsetId=${offsetId} channel=${channel}`);
  }
  if (!outcome.dispatched && outcome.reason !== "claim_held" && outcome.reason !== "claim_held_by_duplicate") {
    await recordDispatch({
      tenantId,
      appointmentId,
      channel: channel as "sms" | "email",
      // The id the send WOULD have gone out under. A suppression is about a
      // specific message, and a row that cannot say which one is half a record.
      templateId: `reminder.${offsetId}.${channel}`,
      outcome: "suppressed",
      suppressionReason: outcome.reason,
    });
  }
  return outcome;
}

async function dispatchReminderInner(
  tenantId: string,
  appointmentId: string,
  offsetId: ReminderOffsetId,
  /** The single channel this run is for. One run, one channel, one key. */
  channel: Channel,
  taker: ReminderClaimTaker,
  handOver: ReminderHandOver,
): Promise<DispatchOutcome> {
  const gate = await loadDispatchable(tenantId, appointmentId, "reminder");
  // THE CLAIM (./reminder-claim.ts). Taken HERE, after the load and before
  // every gate, because the claim is keyed on the start and only the loaded
  // row knows it. `not_found` has no row and no start, so it takes none.
  const claimStart = gate.ok ? gate.data.startsAt : gate.startsAt;
  if (!claimStart) return dispatchClaimedReminder(tenantId, appointmentId, offsetId, channel, gate);
  // SWEEP-47. WHILE THE SWEEP IS THE SENDER THE CLAIM IS CLOSED: a live claim
  // blocks at any age and a claim that cannot be written stops the send. With
  // the switch off (./sweep-mode.ts) this line is the only thing that ran, and
  // everything below it is the dispatcher as it was, save the alert of Q-C.
  if (sweepSends()) {
    return dispatchReminderClosed(tenantId, appointmentId, offsetId, channel, taker, gate, claimStart, handOver);
  }
  const claim = await takeReminderClaim({ tenantId, appointmentId, offsetId, channel, startsAt: claimStart, taker });
  // THE ONE ANSWER THAT STOPS A SEND: held. This reminder was already sent for
  // this start, or the table refused this claim's attempt because another
  // taker holds it. Every other answer, a claim that could not be read or
  // written included, goes on exactly as before there were claims.
  if (claim.held && claim.duplicate) return { dispatched: false, reason: "claim_held_by_duplicate" };
  if (claim.held) return { dispatched: false, reason: "claim_held" };
  // The note of the provider's answer, read here for the alert alone. Its
  // clock refuses nothing: with the switch off no rule of time exists, so the
  // transport's door never shuts on this path.
  const attempt: SendAttempt = { handOverStarted: false, refusedByTheClock: () => null };
  try {
    return await dispatchClaimedReminder(tenantId, appointmentId, offsetId, channel, gate, attempt);
  } catch (e) {
    // EVERY THROW RELEASES ITS CLAIM, and the error goes on unchanged: the run
    // must still fail, because the scheduler's retry is the delivery
    // behaviour. `releaseReminderClaim` never throws, so it cannot replace
    // `e`. A claim that was never written has nothing to release.
    if (claim.claimId !== null) {
      await releaseReminderClaim({ tenantId, appointmentId, offsetId, channel, claimId: claim.claimId });
    }
    // Q-C: our sender or our body refused raises the alert on this path too,
    // after the release. `alertSenderOrBodyRefusal` never throws either.
    if (attempt.refusal) await alertSenderOrBodyRefusal(attempt.refusal);
    throw e;
  }
}

/**
 * SWEEP-47. THE DISPATCH WHILE THE SWEEP IS THE SENDER, for either taker: the
 * pass, and a sleeping job that woke.
 *
 * ==========================================================================
 * WHAT BECOMES OF THE CLAIM, FOR EVERY WAY THE CALL CAN END
 * ==========================================================================
 *   no claim     NOT DUE: the call came over ten minutes before the reminder's
 *                time (`not_due`). Nothing is taken, so the pass can take it
 *                when it is due. The day's last pass, which takes a mark up to
 *                75 minutes ahead on purpose, says so and is let through, but
 *                only for the mark of the start loaded HERE and only before
 *                that pass's limit: a visit moved later since the pass
 *                selected it is not due.
 *   no claim     the claim could not be read or written: `takeReminderClaimClosed`
 *                throws, nothing is sent and nothing is recorded. Fail closed.
 *   held         a live claim of this reminder exists for this start: sent,
 *                being sent, or of unknown outcome. `claim_held`, no row.
 *   held         the table refused this claim's attempt, which another taker
 *                holds (Q-A, 2026-10-15). `claim_held_by_duplicate`, no row.
 *   KEPT         THE CLOCK REFUSED: the visit has begun (`start_passed`), or
 *                the reminder's time passed longer ago than its channel allows
 *                (`mark_missed`). Recorded, not sent, and final. A visit that
 *                is ALSO cancelled, or whose patient was deleted, is recorded
 *                under that reason instead (`status`, `patient_deleted`), and
 *                is final all the same.
 *   KEPT         a message was handed to the provider. Final for this start:
 *                the claim is never released, so no sender takes it again.
 *   KEPT         the transport threw and its answer is not on the list of
 *                `CLAIM_RELEASING_PROVIDER_CODES`. The message may have gone
 *                out. Never sent again.
 *   GIVEN UP     nothing was handed over: a gate held the reminder back (the
 *                status, an unaccepted request, a channel that is off, a
 *                number that cannot take an SMS, live send off). The claim is
 *                released, and the reminder is tried again while it may still
 *                go out.
 *   GIVEN UP     a throw before any transport was called, or a provider answer
 *                that is on the list. Released; the same error goes on. An
 *                answer that says our sender or our body is wrong
 *                (`SENDER_OR_BODY_REFUSAL_CODES`) also raises an alert.
 *
 * A release that cannot be written leaves the claim live, and the reminder is
 * then not tried again: the same side as every other failure here.
 *
 * ==========================================================================
 * TWO CLOCKS, AND WHICH QUESTION EACH ANSWERS
 * ==========================================================================
 *   the caller's (`handOver.now`)   too EARLY only. A pass stores it with its
 *                                   selection; behind, it holds a reminder back.
 *   the dispatcher's own            TOO LATE and THE VISIT HAS BEGUN. Read
 *   (`clockOfTheSend`)              here, after the claim, and once more at
 *                                   the transport's door. A send step that
 *                                   runs hours after its selection is judged
 *                                   at the hour it runs.
 *
 * ==========================================================================
 * A CLAIM WITH NOTHING AFTER IT
 * ==========================================================================
 * The claim is written before the send. A process that dies between the two
 * leaves a live claim and no ledger row, and that reminder is not taken again
 * by anyone: whether it left is not known, and an unknown outcome is never
 * sent twice. It is not silent: every sending pass counts such claims and
 * names their appointments (`readUnsettledClaims`, ./sweep-send.ts).
 */
async function dispatchReminderClosed(
  tenantId: string,
  appointmentId: string,
  offsetId: ReminderOffsetId,
  channel: Channel,
  taker: ReminderClaimTaker,
  gate: Dispatchable,
  claimStart: Date,
  handOver: ReminderHandOver,
): Promise<DispatchOutcome> {
  // THE CALLER'S CLOCK, for the one question it may answer: too early.
  const now = handOver.now ?? new Date();
  // Null for an offset this build does not know: no time, so neither rule of
  // time applies, and the gates below refuse it as they always did.
  const mark = reminderMark(claimStart, offsetId);
  // Granted for the mark of the start loaded just now, never on the pass's word alone.
  const takenAhead = handOver.takenAhead === true && mark !== null && reminderIsTakenAhead(mark, now);
  if (mark !== null && !takenAhead && mark.getTime() - now.getTime() > EARLY_CLAIM_MS) {
    return { dispatched: false, reason: "not_due", dueAt: mark.toISOString() };
  }
  const claim = await takeReminderClaimClosed({
    tenantId,
    appointmentId,
    offsetId,
    channel,
    startsAt: claimStart,
    taker,
    ...(takenAhead ? { takenAhead: true } : {}),
    ...(handOver.now ? { now: handOver.now } : {}),
  });
  if (claim.held && claim.duplicate) return { dispatched: false, reason: "claim_held_by_duplicate" };
  if (claim.held) return { dispatched: false, reason: "claim_held" };
  // THE CLOCK OF THE SEND, read now and handed in by nobody. After the claim
  // and before every gate, so that a refusal is the claim's last word for
  // this start: it is kept, and no pass and no sleeping job takes this
  // reminder again.
  const refusedByTheClock = () =>
    reminderRefusedByTheClock({ startsAt: claimStart, mark, channel: channel as "sms" | "email", now: clockOfTheSend() });
  const refused = refusedByTheClock();
  if (refused !== null) {
    // A visit that is cancelled, or whose patient was deleted, says so: the
    // clock changes neither, and the row should name what a person did.
    if (!gate.ok) return gate.outcome;
    if (!REMINDABLE_STATUSES.has(gate.data.status)) return { dispatched: false, reason: "status" };
    return { dispatched: false, reason: refused };
  }
  const release = () => releaseReminderClaim({ tenantId, appointmentId, offsetId, channel, claimId: claim.claimId });
  const attempt: SendAttempt = { handOverStarted: false, refusedByTheClock };
  let outcome: DispatchOutcome;
  try {
    outcome = await dispatchClaimedReminder(tenantId, appointmentId, offsetId, channel, gate, attempt);
  } catch (e) {
    if (claimIsGivenUpAfterThrow(attempt)) await release();
    if (attempt.refusal) await alertSenderOrBodyRefusal(attempt.refusal);
    throw e;
  }
  // Refused at the transport's door is the clock's refusal too: final, kept.
  if (!reminderWasHandedOver(outcome) && attempt.refusedAtTheDoor !== true) await release();
  return outcome;
}

/**
 * The reminder itself, once its claim is settled: every gate, the render and
 * the send. Whatever throws out of here is caught by the caller above, which
 * releases the claim.
 */
async function dispatchClaimedReminder(
  tenantId: string,
  appointmentId: string,
  offsetId: ReminderOffsetId,
  channel: Channel,
  gate: Dispatchable,
  /** SWEEP-47: the reminder dispatch's note of how far the call got. */
  attempt?: SendAttempt,
): Promise<DispatchOutcome> {
  if (!gate.ok) return gate.outcome;
  const data = gate.data;
  if (!REMINDABLE_STATUSES.has(data.status)) {
    return { dispatched: false, reason: "status" };
  }
  // The pedido gate. Checked AFTER status so an unaccepted pedido that was also
  // cancelled reports the more specific reason it already reported, keeping the
  // existing outcome stable for callers that count skip reasons.
  if (isUnacceptedPedido(data)) {
    return { dispatched: false, reason: "unconfirmed" };
  }

  // THE ROUTING GUARD. A run whose channel is not this offset's channel is
  // refused before any config is read, so a mis-addressed event - a stale
  // queued run from before a routing change, a hand-fired event, a future
  // caller - cannot deliver a 48h SMS or a 24h email no matter what the tenant
  // config and the patient preferences say. `planReminderChannels` enforces the
  // same rule on the plan; this is the arm that names it in the outcome.
  if (channelForOffset(offsetId) !== channel) {
    return { dispatched: false, reason: "channel_not_for_offset" };
  }

  const config = parseTenantConfig(data.tenantSettings).reminders;
  const plan = planReminderChannels(
    config,
    offsetId,
    { email: !!data.patientEmail, phone: !!data.patientPhone },
    { smsEnabled: data.patientReminderSmsEnabled, emailEnabled: data.patientReminderEmailEnabled },
  );
  if (!plan.send) return { dispatched: false, reason: plan.reason };

  // One run sends ONE channel. The scheduler already fanned out per channel, so
  // narrowing the plan here is what keeps the run and its idempotency key aligned:
  // a run keyed on ...:email must never also send an SMS.
  const wantEmail = channel === "email" && plan.email;
  const wantSms = channel === "sms" && plan.sms;
  if (!wantEmail && !wantSms) return { dispatched: false, reason: "channels_off" };

  const locale = resolveLocale(data.tenantSettings);
  const ctx = buildReminderContext({ ...data, tenantId }, locale);

  const channels: SendResult[] = [];
  if (wantEmail && data.patientEmail) {
    const email = renderEmail(offsetId, locale, ctx);
    const emailTemplateId = `reminder.${offsetId}.email`;
    const refusedEmail = refusedAtTheDoor(attempt);
    if (refusedEmail) return refusedEmail;
    const result = await sendRecordingProviderError(
      { tenantId, appointmentId, channel: "email", templateId: emailTemplateId },
      () =>
        sendEmail({
          to: data.patientEmail!,
          subject: email.subject,
          body: email.body,
          templateId: emailTemplateId,
          appointmentId,
        }),
      attempt,
    );
    // THE 48h EMAIL'S ONLY RECORD. Until now this send produced nothing
    // anywhere queryable: `sendEmail` returns a SendResult that was pushed onto
    // an array and returned into an Inngest run output that expires. External
    // evidence says zero reminder emails have ever arrived while SMS runs, and
    // NOTHING IN THIS SYSTEM COULD TELL "never attempted" FROM "attempted and
    // refused by Resend". `sandbox` is what distinguishes them: it is true when
    // any gate suppressed the send without a network call.
    await recordDispatch({
      tenantId,
      appointmentId,
      channel: "email",
      templateId: emailTemplateId,
      outcome: result.sandbox ? "suppressed" : "sent",
      suppressionReason: result.sandbox ? "sandbox" : null,
      providerMessageId: result.sandbox ? null : result.id,
    });
    channels.push(result);
  }
  if (wantSms && data.patientPhone) {
    // W13-05 DOUBLE GATE, evaluated ONCE, here. `shouldRenderFeeNotice` is the
    // only place the condition exists; everything below consumes its answer.
    //
    // THE ID IS DERIVED FROM THE SAME BOOLEAN AS THE BODY, so a fee-bearing
    // message cannot be sent under the approved plain id. packages/notify's gate
    // resolves approval BY ID, so that pairing is what makes the registry a real
    // third lock rather than a label: while the fee entry is `approved: false`
    // the send is refused as `template_unapproved` and the patient gets nothing.
    const feeNotice = shouldRenderFeeNotice({
      flagEnabled: feeNoticeFlagEnabled(),
      patientHasAcceptedTerms: data.patientHasAcceptedTerms,
    });
    // THE SECOND AND THIRD ANSWERS - the reply instruction and the confirm line
    // - ARE NO LONGER COMPUTED HERE. They moved into `renderReminderSmsBody`,
    // which is the one place either is read, so this path and the owner's
    // delivery test cannot answer the same question differently. The fee notice
    // stays: it is the only addition whose input (`patientHasAcceptedTerms`) is
    // a fact about the patient rather than about the environment.

    // THE THIRD ANSWER. IT NO LONGER WRITES BEFORE THE RENDER.
    //
    // ====================================================================
    // A CODE IS A VALUE FIRST AND A ROW SECOND, AND THE ORDER IS THE FIX.
    // ====================================================================
    // `generateConfirmCode` touches nothing, so the body that carries the code
    // can be rendered - and REFUSED - before anything is written. Issuance is
    // below, once a sendable body is in hand.
    //
    // Until INC-CONFIRM-07 the row came first and `renderSms` threw straight
    // past the withdraw that would have removed it: the code was stranded live,
    // 0072's partial unique index blocked the retry from minting another, and
    // the retry sent the shorter body with no link and no error anywhere.
    const wantsConfirmLink = offsetId === "24h" && confirmLinkEnabled();
    const candidateCode = wantsConfirmLink ? generateConfirmCode() : null;

    let rendered = renderReminderSmsBody({
      offset: offsetId,
      locale,
      ctx,
      confirmCode: candidateCode,
      feeNotice,
    });
    if (!rendered.ok) {
      // LOUD, AND IT NAMES THE CONSEQUENCE. The patient gets no reminder for
      // this run; the operator gets the rule that refused and the length.
      console.error(
        `[reminders] dispatch refused: the ${offsetId} sms body was not sendable, so no message went and no confirm code was minted. ${rendered.refusal}`,
        { tenantId, appointmentId, offsetId, kind: rendered.kind },
      );
      return { dispatched: false, reason: "body_refused", detail: rendered.refusal };
    }

    // THE ROW, NOW. `issueConfirmCode` returns null when a live code already
    // exists for this appointment (0072's partial unique index): we store an
    // HMAC, so the existing code's plaintext is unrecoverable and the code in
    // the body we just rendered names no row.
    const issued = candidateCode
      ? await issueConfirmCode({ tenantId, appointmentId, code: candidateCode })
      : null;

    // A COLLISION MEANS THE BODY IN HAND CARRIES A DEAD LINK, so it is rendered
    // again without one. That is the behaviour this path always had - a reminder
    // that goes out is worth more than a link that cannot be minted - reached in
    // the new order. The second render is strictly shorter, so it can only
    // refuse if the first would have; the arm is handled rather than assumed.
    if (candidateCode !== null && issued === null) {
      const withoutLink = renderReminderSmsBody({
        offset: offsetId,
        locale,
        ctx,
        confirmCode: null,
        feeNotice,
      });
      if (!withoutLink.ok) {
        console.error(
          `[reminders] dispatch refused: a live confirm code already exists for this appointment and the link-less ${offsetId} body is not sendable either. ${withoutLink.refusal}`,
          { tenantId, appointmentId, offsetId, kind: withoutLink.kind },
        );
        return { dispatched: false, reason: "body_refused", detail: withoutLink.refusal };
      }
      rendered = withoutLink;
    }

    const withdrawUnsentCode = async (codeHash: string) => {
      const withdrawn = await withdrawConfirmCode({ tenantId, codeHash });
      if (!withdrawn) {
        // Loud, and it names the consequence rather than the operation: the
        // next reminder for this appointment will carry no confirm link.
        console.error(
          "[reminders] confirm code was minted, the SMS did not send, and the code could not be withdrawn; the retry for this appointment will carry no confirm link",
          { tenantId, appointmentId, offsetId },
        );
      }
    };

    const sms = rendered.body;
    // SWEEP-47: the clock, asked once more with the code already issued. A
    // refusal here withdraws that code, as a send that did not happen does below.
    const refusedSms = refusedAtTheDoor(attempt);
    if (refusedSms) {
      if (issued) await withdrawUnsentCode(issued.codeHash);
      return refusedSms;
    }
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body: sms,
      templateId: smsTemplateIdFor(offsetId, feeNotice),
      attempt,
    });
    const handedOver = isSmsSkip(sent) ? null : sent;
    // A CODE THAT WAS NEVER SENT IS WITHDRAWN, and this is not tidiness. The
    // partial unique index means a stranded live code BLOCKS the retry from
    // minting a fresh one, so the patient's second reminder would arrive
    // without a link and nothing would say why. Withdrawing by the exact hash
    // this call minted means it can never remove a code somebody is holding.
    if (issued && !handedOver) await withdrawUnsentCode(issued.codeHash);
    // LENGTH COMES FROM THE RENDER THAT PRODUCED THIS BODY, so a historical row
    // says what was actually sent rather than what a re-render would produce.
    //
    // `segments` STAYS NULL, DELIBERATELY. 0075 gave the column to a segment
    // COUNT, and this repository has no segment counter: `SmsBodyResult` carries
    // `length` and nothing else, and the only other caller that wanted one
    // (messaging-check.ts) writes `segmentLength: body.length`, which is a
    // character count wearing a segment name. Storing a character count in a
    // column called `segments` would be a wrong number that reads as a right
    // one, and the billing question this table exists to answer would then be
    // answered wrongly and confidently. NULL means "not counted", which is true.
    // COST-24h-sms-worst-case-is-three-segments is the card that owes the count.
    await recordDispatch({
      tenantId,
      appointmentId,
      channel: "sms",
      templateId: smsTemplateIdFor(offsetId, feeNotice),
      outcome: handedOver && !handedOver.sandbox ? "sent" : "suppressed",
      // COMMS-01: the SPECIFIC skip reason (`invalid_phone` or `landline`), never
      // the old catch-all `send_refused`. Rows written before this change still
      // carry `send_refused`, and Lembretes SMS labels it as either of the two.
      suppressionReason: handedOver
        ? handedOver.sandbox
          ? "sandbox"
          : null
        : isSmsSkip(sent)
          ? sent.skipped
          : null,
      bodyLength: rendered.length,
      segments: null,
      providerMessageId: handedOver && !handedOver.sandbox ? handedOver.id : null,
    });
    if (handedOver) channels.push(handedOver);
  }

  return { dispatched: true, channels };
}

/* ================================================================== */
/* Confirmation dispatch                                               */
/* ================================================================== */

// Statuses where a booking confirmation makes sense (pre-visit only): one
// list, shared with the scheduling side (./confirmable-statuses.ts).

/**
 * DECISION A (owner, 2026-08-31): the booking confirmation is sent ONLY for a
 * booking the PATIENT made through the portal. A staff-created appointment
 * sends none - the patient was on the phone or at the desk when it was made,
 * and reception already told them.
 *
 * THE PREDICATE IS `appointments.origin = 'patient_portal'`, which is the
 * authorship the system already records (migration 0067) and the same column
 * `public.is_unconfirmed_pedido` keys on. It is not re-derived from
 * `created_by IS NULL`: 0067's own header records that
 * appointments-created-by-provenance.test.ts proves 7/7 against live Postgres
 * that 0049's WITH CHECK is a DISJUNCTION, so a STAFF principal may legally
 * insert a null creator. Absence of a creator is not evidence of a patient
 * (SR-08).
 *
 * WHY IT IS ENFORCED IN THE DISPATCH AND NOT AT THE THREE ENQUEUE SITES. The
 * staff paths in lib/scheduling/actions.ts are what emit
 * `appointment/scheduled` today, and each of them could be taught to pass a
 * flag. A fourth call site would then inherit nothing. The row itself says who
 * made it, so the rule is asked of the row.
 */
const CONFIRMATION_ORIGINS = new Set(["patient_portal"]);

/**
 * Send the immediate booking confirmation for an appointment. Fires right after
 * appointment creation or reschedule; reuses the same ReminderContext so the
 * email body can include the reschedule link. Channel toggles from the tenant's
 * reminder config apply — the same emailEnabled / smsEnabled switches gate all
 * outbound patient notifications.
 */
/**
 * What the EVENT said this confirmation is for. Both arrive from an event
 * payload, so each is honoured only as the literal `true`.
 */
export type ConfirmationDispatchOptions = {
  /**
   * BOOK-CONFIRM. The marker the four acceptance emitters put on
   * `appointment/scheduled` (lib/scheduling/pedido-acceptance.ts). A
   * reschedule, a create and an uncancel do not carry it, so they take today's
   * path exactly as before, whatever the switch says.
   */
  acceptedPedido?: boolean;
  /**
   * BOOK-CONFIRM, the public-form path (S-1004-A, R40). The marker the booking
   * actions put on the event for the appointment a GUEST request was linked
   * to. It only asks the dispatch to look: nothing is sent on the marker
   * alone, the link row is read first.
   */
  acceptedGuestRequest?: boolean;
  /**
   * Q-K (strategy's ruling). The marker a save puts on the event when it
   * changed the Terapeuta and KEPT the start and the clinic
   * (lib/scheduling/move-confirmation.ts, `moveConfirmation`). Today's
   * confirmation then goes by ONE channel: the email when it is usable, the
   * SMS otherwise. It never adds a message to a patient: at most one leg goes.
   */
  therapistChangeOnly?: boolean;
};

/**
 * Which legs of TODAY'S confirmation go. Pure, exported for direct testing.
 *
 * Every leg sits behind the tenant's and the patient's switch, as it always
 * has, and needs the contact it sends to.
 *
 * Q-K: A CHANGE OF THERAPIST AT THE SAME START sends the email only; the SMS
 * goes only when the patient has NO USABLE EMAIL. "No usable email" is any of:
 * no address on file, email reminders switched off for the clinic, or the
 * patient's own email reminder switch off. Then the SMS goes, under its own
 * usual conditions. (Review of Q-K, round 1: an address with the email
 * switched off used to get nothing at all.) Every other confirmation (a new
 * booking, a change of start or clinic, a visit brought back to Confirmada)
 * sends both legs, exactly as before.
 */
export function planConfirmationChannels(args: {
  hasEmail: boolean;
  hasPhone: boolean;
  tenantEmailEnabled: boolean;
  tenantSmsEnabled: boolean;
  patientEmailEnabled: boolean;
  patientSmsEnabled: boolean;
  therapistChangeOnly: boolean;
}): { email: boolean; sms: boolean } {
  // The email leg is the usable email, in every case.
  const email = args.tenantEmailEnabled && args.patientEmailEnabled && args.hasEmail;
  const sms =
    args.tenantSmsEnabled &&
    args.patientSmsEnabled &&
    args.hasPhone &&
    // A therapist-only change sends the SMS only when the email cannot go.
    !(args.therapistChangeOnly && email);
  return { email, sms };
}

export async function dispatchConfirmation(
  tenantId: string,
  appointmentId: string,
  opts: ConfirmationDispatchOptions = {},
): Promise<DispatchOutcome> {
  const gate = await loadDispatchable(tenantId, appointmentId, "confirmation");
  if (!gate.ok) {
    // THE ROW COULD NOT BE USED (`not_found`, `patient_deleted`). Recorded,
    // like every other outcome of this function, under the id the message
    // WOULD have gone out under. For `not_found` that cannot be known (the
    // patient decides it and was not read), so it is today's id.
    //
    // A `not_found` row lands only if the appointment EXISTS: 0075 makes
    // `appointment_id` a foreign key. When it does not, `recordDispatch`
    // logs the failed write and returns, which is its contract.
    const wouldBeApproved =
      (opts.acceptedPedido === true || opts.acceptedGuestRequest === true) &&
      gate.patientId !== undefined &&
      bookConfirmAppliesTo(gate.patientId).applies;
    if (!gate.outcome.dispatched) {
      await recordDispatch({
        tenantId,
        appointmentId,
        channel: "email",
        templateId: wouldBeApproved ? BOOKING_APPROVED_EMAIL_TEMPLATE_ID : "confirmation.email",
        outcome: "suppressed",
        suppressionReason: gate.outcome.reason,
      });
    }
    return gate.outcome;
  }
  const data = gate.data;

  // ================================================================== //
  // BOOK-CONFIRM: AN ACCEPTANCE, UNDER THE SWITCH, TAKES ITS OWN PATH.
  // ================================================================== //
  // `=== true`, not truthiness: the value arrives from an event payload, and
  // only the literal the emitters write may select the new message.
  const acceptedPedido = opts.acceptedPedido === true;
  const acceptedGuestRequest = opts.acceptedGuestRequest === true;
  if (acceptedPedido || acceptedGuestRequest) {
    const decision = bookConfirmAppliesTo(data.patientId);
    if (decision.applies) {
      if (acceptedPedido) {
        return dispatchBookingApproved(tenantId, appointmentId, data, { guestLinked: false });
      }
      // ============================================================== //
      // THE PUBLIC-FORM PATH. THE LINK ROW IS THE AUTHORITY, NOT THE EVENT.
      // ============================================================== //
      // The appointment reception booked for a guest request is a STAFF
      // booking, so the origin gate below would refuse it. It is admitted
      // past that gate only when `guest_booking_requests` itself says this
      // appointment answers a request for this patient. A marker with no row
      // behind it (a hand-fired event, a replay, a future caller) changes
      // nothing: it falls through to today's path, which sends a staff
      // booking nothing, and says so once, ids only.
      if (await isGuestLinkedAppointment(tenantId, appointmentId, data.patientId)) {
        return dispatchBookingApproved(tenantId, appointmentId, data, { guestLinked: true });
      }
      console.warn(
        `[reminders] book-confirm: a guest-request marker with no link row behind it; ` +
          `treated as an ordinary booking tenantId=${tenantId} appointmentId=${appointmentId} ` +
          `patientId=${data.patientId}`,
      );
    } else if (decision.mode === "canary") {
      // IDS ONLY (rule 7). The canary is on and this patient is not on the
      // list, so this falls through to today's path: today's confirmation for
      // an accepted portal request, and nothing for a guest booking.
      console.info(
        `[reminders] book-confirm canary: patient not on the list, the existing confirmation is used ` +
          `tenantId=${tenantId} appointmentId=${appointmentId} patientId=${data.patientId}`,
      );
    }
  }

  // ================================================================== //
  // TODAY'S CONFIRMATION, AND ITS LEDGER ROW WHEN A GATE HOLDS IT BACK.
  // ================================================================== //
  // Until BOOK-CONFIRM this function wrote NOTHING to `reminder_dispatches`:
  // not a confirmation that went out, not one a gate held back, not an email
  // the provider refused. Only a refused SMS left a row. So "did the
  // confirmation go out for this approval" could not be answered from data.
  //
  // The same wrapper shape as `dispatchReminder`, for its reason: the inner
  // function has seven return points, and a row written by hand at each would
  // miss one. A channel that WAS tried records its own row inside, because
  // only the inner function knows the provider id; this records the outcomes
  // where no channel was tried.
  //
  // FILED UNDER THE EMAIL ID AND THE EMAIL CHANNEL. A gate return is about the
  // confirmation as a whole and the table needs one channel; `email` keeps
  // these rows (one per staff booking, for `origin`) off reception's Lembretes
  // SMS screen, which lists the `sms` channel only.
  const outcome = await dispatchTodaysConfirmation(tenantId, appointmentId, data, {
    therapistChangeOnly: opts.therapistChangeOnly === true,
  });
  if (!outcome.dispatched) {
    await recordDispatch({
      tenantId,
      appointmentId,
      channel: "email",
      templateId: "confirmation.email",
      outcome: "suppressed",
      suppressionReason: outcome.reason,
    });
  }
  return outcome;
}

/**
 * Today's confirmation: the email AND the SMS, each behind the tenant's and the
 * patient's switch. What a reschedule of a portal appointment sends, and what an
 * acceptance sends while BOOK_CONFIRM_MODE does not apply to the patient. The
 * messages are the ones it has always sent; what is new is that each channel
 * tried leaves a ledger row. Q-K: a change of therapist at the same start sends
 * the email alone (`planConfirmationChannels`).
 */
async function dispatchTodaysConfirmation(
  tenantId: string,
  appointmentId: string,
  data: NonNullable<Awaited<ReturnType<typeof loadReminderData>>>,
  opts: { therapistChangeOnly: boolean },
): Promise<DispatchOutcome> {
  if (!CONFIRMABLE_STATUSES.has(data.status)) {
    return { dispatched: false, reason: "status" };
  }
  // Decision A. Checked before contact and channels so the log says the reason
  // that actually applies: a staff booking is not "a patient we could not
  // reach", it is a booking that was never in scope for this message.
  if (!CONFIRMATION_ORIGINS.has(data.origin)) {
    return { dispatched: false, reason: "origin" };
  }
  // ================================================================== //
  // AND IT MUST NOT BE AN UNACCEPTED PEDIDO. The same gate the reminders
  // use, for a stronger reason.
  // ================================================================== //
  // Every portal booking IS a pedido: JP ruled 2026-08-06 ("certo") that all
  // twelve patient-bookable services are request-mode with ZERO
  // auto-confirmed, which apps/api/lib/appointments/booking.ts records at the
  // site that emits the `appointment_request` notification. The row says so
  // too - `confirmation_state` defaults to pending and the portal tells the
  // patient "a aguardar confirmacao pela recepcao".
  //
  // So decision A's predicate, applied alone, would send the body whose PT
  // subject is "Marcacao confirmada" for a request the clinic has not
  // accepted. That is the R10 failure exactly - a message restating a request
  // as a commitment - and it would be worse here than in the reminder case,
  // because this one asserts the confirmation in its first three words.
  //
  // WHAT THIS MEANS IN PRACTICE, stated so it is not discovered later: with
  // request-mode on every bookable service, this gate suppresses the
  // confirmation at BOOKING time for every portal booking. The message becomes
  // deliverable when reception accepts the pedido and the status leaves
  // `scheduled` - at which point the appointment is genuinely confirmed and
  // the approved body is true. ACCEPTANCE RE-EMITS `appointment/scheduled`:
  // each of the four doors that can accept a pedido does (W14-07 for the
  // Pedidos queue, W14-02 for the other three; see
  // lib/scheduling/pedido-acceptance.ts). This sentence said "nothing currently
  // re-emits ... that is carded" until 2026-10-03, which stopped being true
  // when #1085 merged.
  if (isUnacceptedPedido(data)) {
    return { dispatched: false, reason: "unconfirmed" };
  }
  if (!data.patientEmail && !data.patientPhone) {
    return { dispatched: false, reason: "no_contact" };
  }

  const { reminders } = parseTenantConfig(data.tenantSettings);
  const { email, sms } = planConfirmationChannels({
    hasEmail: !!data.patientEmail,
    hasPhone: !!data.patientPhone,
    tenantEmailEnabled: reminders.emailEnabled,
    tenantSmsEnabled: reminders.smsEnabled,
    patientEmailEnabled: data.patientReminderEmailEnabled,
    patientSmsEnabled: data.patientReminderSmsEnabled,
    therapistChangeOnly: opts.therapistChangeOnly,
  });
  if (!email && !sms) return { dispatched: false, reason: "channels_off" };

  const locale = resolveLocale(data.tenantSettings);
  // THE CONTEXT SIGNS A RESCHEDULE LINK, AND SIGNING CAN THROW: with
  // REMINDERS_RESCHEDULE_BASE_URL or REMINDERS_LINK_SECRET unset,
  // `buildReminderContext` throws here, BEFORE either send, and the SMS (which
  // carries no link) is lost with the email. The run still fails, because a
  // missing variable must stay loud and Inngest's retry is the recovery; what
  // changes is that the attempt now leaves a row saying why nothing went.
  let ctx: ReminderContext;
  try {
    ctx = buildReminderContext({ ...data, tenantId }, locale);
  } catch (e) {
    await recordDispatch({
      tenantId,
      appointmentId,
      channel: email ? "email" : "sms",
      templateId: email ? "confirmation.email" : "confirmation.sms",
      outcome: "suppressed",
      suppressionReason: "reschedule_link_error",
    });
    throw e;
  }

  const channels: SendResult[] = [];
  if (email && data.patientEmail) {
    const rendered = renderConfirmationEmail(locale, ctx);
    // A refusal (Resend's, or the armed-but-incomplete environment the gate
    // throws on) leaves a `provider_error` row before it propagates.
    const result = await sendRecordingProviderError(
      { tenantId, appointmentId, channel: "email", templateId: "confirmation.email" },
      () =>
        sendEmail({
          to: data.patientEmail!,
          subject: rendered.subject,
          body: rendered.body,
          templateId: "confirmation.email",
          appointmentId,
        }),
    );
    await recordDispatch({
      tenantId,
      appointmentId,
      channel: "email",
      templateId: "confirmation.email",
      outcome: result.sandbox ? "suppressed" : "sent",
      suppressionReason: result.sandbox ? gateSuppressionReason(result) : null,
      providerMessageId: result.sandbox ? null : result.id,
    });
    channels.push(result);
  }
  if (sms && data.patientPhone) {
    // `renderConfirmationSms` THROWS on a body that would leave GSM-7 or one
    // segment (a clinic name with an accent, or a long one). It always has, and
    // it still does: the run fails exactly as before. What is new is the row,
    // so "the SMS did not go, and why" is readable instead of a failed run that
    // expires. The body prints the date, the time, the clinic's name and its
    // phone and nothing about the patient, so the refusal is safe to keep.
    let body: string;
    try {
      body = renderConfirmationSms(locale, ctx);
    } catch (e) {
      await recordDispatch({
        tenantId,
        appointmentId,
        channel: "sms",
        templateId: "confirmation.sms",
        outcome: "suppressed",
        suppressionReason: "body_refused",
      });
      throw e;
    }
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body,
      templateId: "confirmation.sms",
      alertsOnOurRefusal: true,
    });
    const handedOver = isSmsSkip(sent) ? null : sent;
    await recordDispatch({
      tenantId,
      appointmentId,
      channel: "sms",
      templateId: "confirmation.sms",
      outcome: handedOver && !handedOver.sandbox ? "sent" : "suppressed",
      suppressionReason: handedOver
        ? handedOver.sandbox
          ? gateSuppressionReason(handedOver)
          : null
        : isSmsSkip(sent)
          ? sent.skipped
          : null,
      bodyLength: body.length,
      segments: null,
      providerMessageId: handedOver && !handedOver.sandbox ? handedOver.id : null,
    });
    if (handedOver) channels.push(handedOver);
  }
  return { dispatched: true, channels };
}

/* ================================================================== */
/* BOOK-CONFIRM: the booking-approved dispatch                         */
/* ================================================================== */

/** The registry id of the approved email. */
export const BOOKING_APPROVED_EMAIL_TEMPLATE_ID = "booking_approved.email";
/**
 * The SMS for a patient with no email on file: strategy's copy, dispatch
 * S-1004-A. Until 2026-10-04 the fallback borrowed `confirmation.sms`; that id
 * is today's confirmation again and nothing on this path sends it.
 */
export const BOOKING_APPROVED_SMS_TEMPLATE_ID = "booking_approved.sms";

/**
 * What is recorded, and returned, when the booking-approved email cannot be
 * rendered. FIXED TEXT on purpose: the renderer's own message quotes the
 * fragment it tripped on, and that fragment can be part of a patient's name.
 */
export const BOOKING_APPROVED_RENDER_REFUSAL =
  "A value the email prints (first name, service, therapist or location) contains a {placeholder}-shaped word.";

// The channel plan, the location check, the service check and the SMS-number
// verdict are pure and live in ./book-confirm-plan.ts, because the approver's
// notice asks the SAME four questions at approval time
// (lib/scheduling/book-confirm-notice.ts).
// Re-exported here so this file stays the dispatch's one public surface.
export {
  planBookingApprovedChannel,
  bookingApprovedLocationContact,
  type BookingApprovedPlan,
} from "./book-confirm-plan";

/**
 * Send the ONE confirmation for an accepted online request.
 *
 * EVERY OUTCOME LEAVES A LEDGER ROW, sent or suppressed with its reason. The
 * confirmation path above writes none (only a provider refusal of its SMS is
 * recorded), which is why "did the confirmation go out" cannot be answered from
 * `reminder_dispatches` for it. This path can be answered from the table.
 *
 * IT IS STILL GATED BY REMINDERS_LIVE_SEND AND BY THE TEMPLATE REGISTRY: both
 * sends go through `sendEmail` / `sendPatientSms`, and the notify gate is the
 * only way to a provider.
 */
async function dispatchBookingApproved(
  tenantId: string,
  appointmentId: string,
  data: NonNullable<Awaited<ReturnType<typeof loadReminderData>>>,
  /**
   * `guestLinked` is true ONLY when the caller has read the link row
   * (`isGuestLinkedAppointment`). It admits a staff-origin appointment past
   * the origin gate below, and nothing else about the path changes.
   */
  admit: { guestLinked: boolean },
): Promise<DispatchOutcome> {
  const { reminders } = parseTenantConfig(data.tenantSettings);
  const email = (data.patientEmail ?? "").trim();
  const phone = (data.patientPhone ?? "").trim();
  const plan = planBookingApprovedChannel({
    hasEmail: email !== "",
    hasPhone: phone !== "",
    tenantSmsEnabled: reminders.smsEnabled,
    patientSmsEnabled: data.patientReminderSmsEnabled,
  });
  const channel = plan.send === "none" ? plan.channel : plan.send;
  const templateId =
    channel === "email" ? BOOKING_APPROVED_EMAIL_TEMPLATE_ID : BOOKING_APPROVED_SMS_TEMPLATE_ID;

  /** Nothing was sent, and the ledger says why. */
  const suppress = async (
    reason: Extract<DispatchOutcome, { dispatched: false }>["reason"],
    detail?: string,
  ): Promise<DispatchOutcome> => {
    await recordDispatch({
      tenantId,
      appointmentId,
      channel,
      templateId,
      outcome: "suppressed",
      suppressionReason: reason,
    });
    return { dispatched: false, reason, ...(detail ? { detail } : {}) };
  };

  // The three gates the confirmation above applies, in its order. A REJECTED
  // request is `cancelled`, so it stops at the first one and sends nothing.
  if (!CONFIRMABLE_STATUSES.has(data.status)) return suppress("status");
  // THE ORIGIN GATE, with its one exception: an appointment the caller has
  // read a guest-request LINK ROW for. Everything else of staff origin stops.
  if (!admit.guestLinked && !CONFIRMATION_ORIGINS.has(data.origin)) return suppress("origin");
  if (isUnacceptedPedido(data)) return suppress("unconfirmed");

  if (plan.send === "none") return suppress(plan.reason);

  const contact = bookingApprovedLocationContact(data);
  if (!contact) {
    // IDS ONLY. A DATA problem on the clinic's own row, and the fix is the
    // location's address or phone - not this message.
    console.warn(
      `[reminders] booking-approved skipped: location_contact_missing tenantId=${tenantId} ` +
        `appointmentId=${appointmentId} patientId=${data.patientId}. ` +
        `The appointment's location has no address or no phone; nothing was sent on either channel.`,
    );
    return suppress("location_contact_missing");
  }

  // ================================================================== //
  // ONE MESSAGE PER APPOINTMENT AND START, at the dispatch as well as at
  // the trigger. Lead's decision, 2026-10-03.
  // ================================================================== //
  // A second acceptance at the SAME start sends nothing. An acceptance at a
  // DIFFERENT start sends one new message: a request accepted at one time,
  // returned to Agendada, moved and accepted again must tell the patient the
  // new time, or the only message they hold names an hour that is no longer
  // true - worse than the switch being off.
  //
  // THE START IS NOT IN `reminder_dispatches` (0075 has no column for it and
  // none may be added here), so the hand-over is ALSO written as an audit row
  // that carries it; see `recordBookingApprovedHandOver`. This reads that row
  // for THIS start.
  if (await hasBookingApprovedHandOver({ tenantId, appointmentId, startsAt: data.startsAt })) {
    return suppress("already_sent");
  }

  /**
   * Was this result a hand-over? A real send, or one the gate held back only
   * because live send is OFF: with live send off that is the one trace a
   * hand-over leaves, so a repeat is a repeat there too. Any other hold
   * (an unconfigured provider, an unapproved template) is not one, and
   * approving again after the cause is fixed still sends.
   */
  const markHandedOver = async (result: SendResult, handOverChannel: "email" | "sms") => {
    if (result.sandbox && suppressionReasonOf(result) !== HANDED_OVER_WHILE_LIVE_SEND_OFF) return;
    await recordBookingApprovedHandOver({
      tenantId,
      appointmentId,
      startsAt: data.startsAt,
      channel: handOverChannel,
    });
  };

  const locale = resolveLocale(data.tenantSettings);

  if (plan.send === "email") {
    // THE EMAIL NAMES THE SERVICE, so an appointment with none sends nothing
    // on this leg. The approver's notice asks the same function.
    const serviceName = bookingApprovedServiceName(data);
    if (serviceName === null) return suppress("service_missing");
    // THE RENDER CAN REFUSE, AND ITS OWN WORDS MUST NOT LEAVE THIS FUNCTION.
    // `assertNoUnfilledPlaceholders` throws when a value itself looks like a
    // placeholder - a first name, a service or a clinic stored with braces
    // around a word - and its message QUOTES the fragment it found, which can
    // be part of the patient's name. Uncaught, that was a run that retried
    // forever, wrote no row, and put the fragment in the run history.
    //
    // So it is an outcome, with a row, and the sentence kept is FIXED TEXT:
    // nothing from the error reaches the log, the ledger or the return value.
    let rendered: { subject: string; body: string };
    try {
      rendered = renderBookingApprovedEmail(locale, {
        patientFirstName: firstName(data.patientName),
        appointmentDateLong: formatDateLong(data.startsAt, locale),
        appointmentTime: formatTime(data.startsAt, locale),
        serviceName,
        practitionerName: data.practitionerName,
        locationName: data.locationName,
        locationAddress: contact.address,
        locationPhone: contact.phone,
      });
    } catch {
      console.error(
        `[reminders] booking-approved refused: the email could not be rendered, so no message went. ` +
          `${BOOKING_APPROVED_RENDER_REFUSAL} tenantId=${tenantId} appointmentId=${appointmentId} ` +
          `patientId=${data.patientId}`,
      );
      return suppress("body_refused", BOOKING_APPROVED_RENDER_REFUSAL);
    }
    const result = await sendRecordingProviderError(
      { tenantId, appointmentId, channel: "email", templateId: "booking_approved.email" },
      () =>
        sendEmail({
          to: email,
          subject: rendered.subject,
          body: rendered.body,
          templateId: "booking_approved.email",
          appointmentId,
        }),
    );
    await recordDispatch({
      tenantId,
      appointmentId,
      channel: "email",
      templateId: "booking_approved.email",
      outcome: result.sandbox ? "suppressed" : "sent",
      suppressionReason: result.sandbox ? gateSuppressionReason(result) : null,
      providerMessageId: result.sandbox ? null : result.id,
    });
    await markHandedOver(result, "email");
    return { dispatched: true, channels: [result] };
  }

  // THE SMS, for a patient with no email on file: `booking_approved.sms`,
  // strategy's copy (S-1004-A), with the LOCATION's name and the LOCATION's
  // phone. It replaced the borrowed `confirmation.sms` body on 2026-10-04. The
  // render throws on a body that would leave GSM-7 or one segment (a clinic
  // renamed to something accented or long); here that is an outcome with a
  // ledger row, not a run that retries forever and records nothing. The body
  // prints nothing about the patient, so the refusal's own words are safe.
  let body: string;
  try {
    body = renderBookingApprovedSms(locale, {
      appointmentDateShort: formatDateShort(data.startsAt),
      appointmentTime: formatTime(data.startsAt, locale),
      locationName: data.locationName,
      locationPhone: contact.phone,
    });
  } catch (e) {
    const refusal = e instanceof Error ? e.message : "unknown";
    console.error(
      `[reminders] booking-approved refused: the sms fallback body was not sendable, so no message went. ${refusal}`,
      { tenantId, appointmentId },
    );
    return suppress("body_refused", refusal);
  }
  const sent = await sendPatientSms({
    tenantId,
    appointmentId,
    patientId: data.patientId,
    phone,
    body,
    templateId: "booking_approved.sms",
    alertsOnOurRefusal: true,
  });
  const handedOver = isSmsSkip(sent) ? null : sent;
  await recordDispatch({
    tenantId,
    appointmentId,
    channel: "sms",
    templateId: "booking_approved.sms",
    outcome: handedOver && !handedOver.sandbox ? "sent" : "suppressed",
    suppressionReason: handedOver
      ? handedOver.sandbox
        ? gateSuppressionReason(handedOver)
        : null
      : isSmsSkip(sent)
        ? sent.skipped
        : null,
    bodyLength: body.length,
    segments: null,
    providerMessageId: handedOver && !handedOver.sandbox ? handedOver.id : null,
  });
  if (handedOver) await markHandedOver(handedOver, "sms");
  return { dispatched: true, channels: handedOver ? [handedOver] : [] };
}

/* ================================================================== */
/* Follow-up dispatch                                                  */
/* ================================================================== */

function buildFollowUpContext(
  data: Awaited<ReturnType<typeof loadReminderData>> & object,
  locale: Parameters<typeof formatTime>[1],
): FollowUpContext {
  return {
    patientFirstName: firstName(data.patientName),
    appointmentDateLong: formatDateLong(data.startsAt, locale),
    appointmentDateShort: formatDateShort(data.startsAt),
    // MN-03: the appointment's own location row, as the reminder email reads it.
    clinicLocation: data.locationName,
    clinicPhone: data.locationPhone || tenantPhone(data.tenantSettings),
  };
}

/**
 * Send the post-visit follow-up. Called 24 h after the appointment ends (the
 * Inngest function sleeps before calling). Only fires when status is still
 * "completed" — if the appointment was subsequently re-opened this is a no-op.
 */
export async function dispatchFollowUp(
  tenantId: string,
  appointmentId: string,
): Promise<DispatchOutcome> {
  const gate = await loadDispatchable(tenantId, appointmentId, "followup");
  if (!gate.ok) return gate.outcome;
  const data = gate.data;
  if (data.status !== "completed") return { dispatched: false, reason: "status" };
  if (!data.patientEmail && !data.patientPhone) {
    return { dispatched: false, reason: "no_contact" };
  }

  const { reminders } = parseTenantConfig(data.tenantSettings);
  const email = reminders.emailEnabled && data.patientReminderEmailEnabled && !!data.patientEmail;
  const sms = reminders.smsEnabled && data.patientReminderSmsEnabled && !!data.patientPhone;
  if (!email && !sms) return { dispatched: false, reason: "channels_off" };

  const locale = resolveLocale(data.tenantSettings);
  const ctx = buildFollowUpContext(data, locale);

  const channels: SendResult[] = [];
  if (email && data.patientEmail) {
    const rendered = renderFollowUpEmail(locale, ctx);
    channels.push(
      await sendEmail({
        to: data.patientEmail,
        subject: rendered.subject,
        body: rendered.body,
        templateId: "follow_up.email",
        appointmentId,
      }),
    );
  }
  if (sms && data.patientPhone) {
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body: renderFollowUpSms(locale, ctx),
      templateId: "follow_up.sms",
      alertsOnOurRefusal: true,
    });
    if (!isSmsSkip(sent)) channels.push(sent);
  }
  return { dispatched: true, channels };
}

/* ================================================================== */
/* Satisfaction survey dispatch (SAT-01)                               */
/* ================================================================== */

export const SURVEY_EMAIL_TEMPLATE_ID = "survey.email";
export const SURVEY_SMS_TEMPLATE_ID = "survey.sms";

/**
 * The ledger reason for a patient the canary list does not name. Not a
 * DispatchOutcome reason: that patient's run goes on as it does with the
 * switch off, and returns the follow-up's own outcome.
 */
export const SURVEY_CANARY_NOT_LISTED = "survey_canary_not_listed";

/**
 * The ledger reason when issuing the send threw (the code key is not set, or
 * the database failed). The error still propagates; this is the row it leaves.
 */
export const SURVEY_ISSUE_ERROR = "survey_issue_error";

/**
 * What is recorded, and returned, when the survey email cannot be rendered.
 * FIXED TEXT, for `BOOKING_APPROVED_RENDER_REFUSAL`'s reason: the renderer's
 * own message quotes the fragment it tripped on.
 */
export const SURVEY_RENDER_REFUSAL =
  "A value the email prints (first name or the location's phone) contains a {placeholder}-shaped word.";

export type SurveyChannelPlan =
  | { send: "email" }
  | { send: "sms" }
  | { send: "none"; reason: "no_contact" | "channels_off"; channel: "email" | "sms" };

/**
 * Which ONE channel a survey goes out on (S6). Pure, exported for direct testing.
 *
 *   email reminders on for the clinic, the patient's email switch on and an
 *   email on file                              -> the email, and NO SMS
 *   otherwise, the same three for SMS          -> the SMS
 *   otherwise                                  -> nothing, with the reason
 *
 * Never both. `channel` on a refusal is the channel the row is filed under:
 * the one the patient has a contact for, email first.
 */
export function planSurveyChannel(args: {
  hasEmail: boolean;
  hasPhone: boolean;
  tenantEmailEnabled: boolean;
  tenantSmsEnabled: boolean;
  patientEmailEnabled: boolean;
  patientSmsEnabled: boolean;
}): SurveyChannelPlan {
  if (args.hasEmail && args.tenantEmailEnabled && args.patientEmailEnabled) return { send: "email" };
  if (args.hasPhone && args.tenantSmsEnabled && args.patientSmsEnabled) return { send: "sms" };
  if (!args.hasEmail && !args.hasPhone) return { send: "none", reason: "no_contact", channel: "email" };
  return { send: "none", reason: "channels_off", channel: args.hasEmail ? "email" : "sms" };
}

/**
 * The message 24 hours after a concluded visit. Called by the Inngest function
 * that has always sent the follow-up, under the same id and key, so a run that
 * went to sleep before this code existed wakes into it.
 *
 * THE SWITCH IS READ FIRST, BEFORE ANYTHING ELSE (survey-mode.ts).
 *
 *   off     `dispatchFollowUp`, untouched: the same read, the same two bodies,
 *           the same outcome, and no row anywhere. Nothing of the survey runs.
 *   canary  a patient on the list gets the survey. Everyone else gets what
 *           `off` gives, and one ledger row saying the list did not name them.
 *   on      the survey, INSTEAD of the follow-up (default 7 of the spec).
 *
 * `off` is also what an unset or misspelt value reads as, so it is the state
 * every sleeping run wakes into until the owner sets the variable.
 */
export async function dispatchSurvey(
  tenantId: string,
  appointmentId: string,
): Promise<DispatchOutcome> {
  if (surveySendMode() === "off") return dispatchFollowUp(tenantId, appointmentId);
  return await dispatchSurveyInner(tenantId, appointmentId);
}

/**
 * The survey send. EVERY EXIT LEAVES A LEDGER ROW: sent, suppressed with its
 * reason, or `provider_error`.
 *
 * THE ORDER IS THE RULE (INC-CONFIRM-07, spec 5.1 step 4): the code is a value
 * first; the body that carries it is built and can be REFUSED before anything
 * is written; only then does the database issue the send; only then is the
 * body handed to the provider.
 *
 * THE CODE AND THE LINK ARE NEVER STORED AND NEVER LOGGED (spec 3.6, A7). The
 * database gets the code's HMAC. The ledger row, the log lines and the value
 * this returns carry ids, a reason, a length and the provider's id.
 *
 * WHAT ISSUING BEFORE THE HAND-OVER COSTS. 0102 has no door that withdraws a
 * send. A provider that refuses the message after the issue leaves a send row
 * with no message behind it: the retry is answered `cooldown`, and the patient
 * is not asked again for 60 days. The `provider_error` row is what shows it.
 */
async function dispatchSurveyInner(
  tenantId: string,
  appointmentId: string,
): Promise<DispatchOutcome> {
  const gate = await loadDispatchable(tenantId, appointmentId, "survey");

  /** Nothing was sent, and the ledger says why. */
  const record = (channel: "email" | "sms", reason: string) =>
    recordDispatch({
      tenantId,
      appointmentId,
      channel,
      templateId: channel === "email" ? SURVEY_EMAIL_TEMPLATE_ID : SURVEY_SMS_TEMPLATE_ID,
      outcome: "suppressed",
      suppressionReason: reason,
    });
  const suppress = async (
    reason: Extract<DispatchOutcome, { dispatched: false }>["reason"],
    channel: "email" | "sms",
    detail?: string,
  ): Promise<DispatchOutcome> => {
    await record(channel, reason);
    return { dispatched: false, reason, ...(detail ? { detail } : {}) };
  };
  /** Canary, and the list does not name this patient: recorded, then as `off`. */
  const notListed = async (channel: "email" | "sms"): Promise<DispatchOutcome> => {
    await record(channel, SURVEY_CANARY_NOT_LISTED);
    return dispatchFollowUp(tenantId, appointmentId);
  };

  if (!gate.ok) {
    // No row was read, or the patient was removed. Filed under the email id:
    // no channel was chosen for a patient nobody could be asked about.
    if (gate.patientId !== undefined && !surveyAppliesTo(gate.patientId).applies) {
      return notListed("email");
    }
    return suppress((gate.outcome as Extract<DispatchOutcome, { dispatched: false }>).reason, "email");
  }
  const data = gate.data;

  const { reminders } = parseTenantConfig(data.tenantSettings);
  const email = (data.patientEmail ?? "").trim();
  const phone = (data.patientPhone ?? "").trim();
  const plan = planSurveyChannel({
    hasEmail: email !== "",
    hasPhone: phone !== "",
    tenantEmailEnabled: reminders.emailEnabled,
    tenantSmsEnabled: reminders.smsEnabled,
    patientEmailEnabled: data.patientReminderEmailEnabled,
    patientSmsEnabled: data.patientReminderSmsEnabled,
  });
  const channel = plan.send === "none" ? plan.channel : plan.send;

  // The recipient is `appointments.patient_id`, the one patient the row was
  // read for. A second patient on a shared visit is never asked (default 9).
  if (!surveyAppliesTo(data.patientId).applies) return notListed(channel);

  if (data.status !== "completed") return suppress("status", channel);
  if (plan.send === "none") return suppress(plan.reason, channel);

  const locale = resolveLocale(data.tenantSettings);

  /** Issue the send in the database, or say why it was not issued. */
  const issue = async (code: string): Promise<DispatchOutcome | null> => {
    let issued: Awaited<ReturnType<typeof issueSurveyAutomatic>>;
    try {
      issued = await issueSurveyAutomatic({ tenantId, appointmentId, channel, code });
    } catch (e) {
      await record(channel, SURVEY_ISSUE_ERROR);
      throw e;
    }
    return issued === "issued" ? null : suppress(`survey_${issued}`, channel);
  };

  if (plan.send === "email") {
    // THE LOCATION'S PHONE AND NO OTHER (third-location ruling). The email
    // prints one number for the patient to ring, and it is the appointment's
    // own location's. With none on that row nothing is sent, and nothing falls
    // back to the tenant's clinic settings.
    const locationPhone = (data.locationPhone ?? "").trim();
    if (locationPhone === "") {
      console.warn(
        `[reminders] survey skipped: location_contact_missing tenantId=${tenantId} ` +
          `appointmentId=${appointmentId} patientId=${data.patientId}. ` +
          `The appointment's location has no phone; nothing was sent and no code was made.`,
      );
      return suppress("location_contact_missing", "email");
    }
    // THE RENDER CAN REFUSE (no origin for the link) AND CAN THROW (a first
    // name stored with braces around a word). Both are an outcome with a row,
    // and the thrown message never leaves this function: it quotes what it
    // tripped on.
    // A VALUE, NOT A ROW. Nothing is written until a sendable body is in hand.
    const code = generateSurveyCode();
    let body: { subject: string; body: string } | null = null;
    let refusal = SURVEY_RENDER_REFUSAL;
    try {
      const rendered = renderSurveyEmailBody({
        locale,
        ctx: {
          patientFirstName: firstName(data.patientName),
          appointmentDateLong: formatDateLong(data.startsAt, locale),
          // The day BEFORE the one the link dies on (ruling of 2026-10-13).
          surveyExpiryDateLong: surveyValidUntilDateLong(new Date(Date.now()), locale),
          clinicPhone: locationPhone,
        },
        code,
      });
      if (rendered.ok) body = { subject: rendered.subject, body: rendered.body };
      else refusal = rendered.refusal;
    } catch {
      // `refusal` stays the fixed sentence.
    }
    if (body === null) {
      console.error(
        `[reminders] survey refused: the email could not be built, so no message went and nothing was issued. ` +
          `${refusal} tenantId=${tenantId} appointmentId=${appointmentId}`,
      );
      return suppress("body_refused", "email", refusal);
    }
    const mail = body;

    const refused = await issue(code);
    if (refused) return refused;

    const result = await sendRecordingProviderError(
      { tenantId, appointmentId, channel: "email", templateId: SURVEY_EMAIL_TEMPLATE_ID },
      () =>
        sendEmail({
          to: email,
          subject: mail.subject,
          body: mail.body,
          templateId: SURVEY_EMAIL_TEMPLATE_ID,
          appointmentId,
        }),
    );
    await recordDispatch({
      tenantId,
      appointmentId,
      channel: "email",
      templateId: SURVEY_EMAIL_TEMPLATE_ID,
      outcome: result.sandbox ? "suppressed" : "sent",
      suppressionReason: result.sandbox ? gateSuppressionReason(result) : null,
      providerMessageId: result.sandbox ? null : result.id,
    });
    return { dispatched: true, channels: [result] };
  }

  // THE SMS, for a patient with no email the survey may use. The approved
  // three lines and nothing after them: no reply line is appended here.
  //
  // THE NUMBER IS ASKED FIRST. `sendPatientSms` asks the same question at the
  // hand-over, which is after the issue; a number that cannot receive an SMS
  // would then cost the patient a send row and 60 days for a message that
  // never left.
  const number = smsNumberVerdict(phone);
  if (!number.ok) {
    console.warn(
      `[reminders] survey skipped: ${number.reason} tenantId=${tenantId} ` +
        `appointmentId=${appointmentId} patientId=${data.patientId}. Nothing was sent and no code was made.`,
    );
    return suppress(number.reason, "sms");
  }

  const code = generateSurveyCode();
  const rendered = renderSurveySmsBody({
    locale,
    appointmentDateShort: formatDateShort(data.startsAt),
    code,
  });
  if (!rendered.ok) {
    console.error(
      `[reminders] survey refused: the sms body was not sendable, so no message went and nothing was issued. ${rendered.refusal}`,
      { tenantId, appointmentId, kind: rendered.kind },
    );
    return suppress("body_refused", "sms", rendered.refusal);
  }

  const refused = await issue(code);
  if (refused) return refused;

  const sent = await sendPatientSms({
    tenantId,
    appointmentId,
    patientId: data.patientId,
    phone,
    body: rendered.body,
    templateId: SURVEY_SMS_TEMPLATE_ID,
  });
  const handedOver = isSmsSkip(sent) ? null : sent;
  await recordDispatch({
    tenantId,
    appointmentId,
    channel: "sms",
    templateId: SURVEY_SMS_TEMPLATE_ID,
    outcome: handedOver && !handedOver.sandbox ? "sent" : "suppressed",
    suppressionReason: handedOver
      ? handedOver.sandbox
        ? gateSuppressionReason(handedOver)
        : null
      : isSmsSkip(sent)
        ? sent.skipped
        : null,
    bodyLength: rendered.length,
    segments: null,
    providerMessageId: handedOver && !handedOver.sandbox ? handedOver.id : null,
  });
  return { dispatched: true, channels: handedOver ? [handedOver] : [] };
}

/* ================================================================== */
/* No-show dispatch                                                    */
/* ================================================================== */

function buildNoShowContext(
  data: Awaited<ReturnType<typeof loadReminderData>> & object,
  tenantId: string,
  locale: Parameters<typeof formatTime>[1],
): NoShowContext {
  return {
    patientFirstName: firstName(data.patientName),
    appointmentDateLong: formatDateLong(data.startsAt, locale),
    appointmentDateShort: formatDateShort(data.startsAt),
    appointmentTime: formatTime(data.startsAt, locale),
    clinicLocation: data.locationName,
    clinicPhone: data.locationPhone || tenantPhone(data.tenantSettings),
    rescheduleLink: rescheduleLink({
      tenantId,
      appointmentId: data.appointmentId,
      startsAt: data.startsAt,
      scope: "confirm_cancel",
    }),
  };
}

/**
 * Send the no-show notification. Fires immediately when the Inngest function
 * receives the appointment/noshow event. Guards on status still being "no_show"
 * in case the staff corrects the status before the job runs.
 */
export async function dispatchNoShow(
  tenantId: string,
  appointmentId: string,
): Promise<DispatchOutcome> {
  const gate = await loadDispatchable(tenantId, appointmentId, "noshow");
  if (!gate.ok) return gate.outcome;
  const data = gate.data;
  if (data.status !== "no_show") return { dispatched: false, reason: "status" };
  if (!data.patientEmail && !data.patientPhone) {
    return { dispatched: false, reason: "no_contact" };
  }

  const { reminders } = parseTenantConfig(data.tenantSettings);
  const email = reminders.emailEnabled && data.patientReminderEmailEnabled && !!data.patientEmail;
  const sms = reminders.smsEnabled && data.patientReminderSmsEnabled && !!data.patientPhone;
  if (!email && !sms) return { dispatched: false, reason: "channels_off" };

  const locale = resolveLocale(data.tenantSettings);
  const ctx = buildNoShowContext(data, tenantId, locale);

  const channels: SendResult[] = [];
  if (email && data.patientEmail) {
    const rendered = renderNoShowEmail(locale, ctx);
    channels.push(
      await sendEmail({
        to: data.patientEmail,
        subject: rendered.subject,
        body: rendered.body,
        templateId: "no_show.email",
        appointmentId,
      }),
    );
  }
  if (sms && data.patientPhone) {
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body: renderNoShowSms(locale, ctx),
      templateId: "no_show.sms",
      alertsOnOurRefusal: true,
    });
    if (!isSmsSkip(sent)) channels.push(sent);
  }
  return { dispatched: true, channels };
}
