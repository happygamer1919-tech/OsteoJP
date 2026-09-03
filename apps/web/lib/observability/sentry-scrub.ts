import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Strip local-variable captures from every stack frame of every exception on an
 * outbound Sentry event.
 *
 * WHY, because the reason is not visible from the call site. The clinical claim
 * transaction in `lib/clinical/review.ts` calls
 * `projectAiPayloadOntoFichaFields(row.data)` and throws `ClinicalError` inside
 * the same closure. `row.data` holds the AI partner's full clinical payload
 * under `_aiIngestionRaw`. Any mechanism that attaches in-scope variables to a
 * stack frame therefore ships a patient's clinical record to Sentry, which
 * CLAUDE.md rule 7 forbids without qualification.
 *
 * The Sentry Node SDK's `LocalVariables` integration is the mechanism that
 * populates `frame.vars`. It is registered by default and gated on
 * `includeLocalVariables`, which we do not set, so today it is inert. This
 * function does not rely on that: it is the second, independent layer, and it
 * holds even if the integration is re-armed, if the gate's default changes, or
 * if some future integration populates `vars` by another route.
 *
 * Deliberately total. No allowlist, no per-frame condition, no in_app check:
 * an allowlist is a list of things someone remembered, and the payload shape
 * here is defined by an external partner's contract, not by us.
 */
export function stripFrameVars(event: ErrorEvent): ErrorEvent {
  for (const exception of event.exception?.values ?? []) {
    for (const frame of exception.stacktrace?.frames ?? []) {
      delete frame.vars;
    }
  }

  return event;
}


/**
 * INC-nif-validationerror-at-the-desk — a typo is not an ERROR-level event.
 *
 * ==========================================================================
 * IN ADDITION TO `stripFrameVars`, NEVER INSTEAD OF IT
 * ==========================================================================
 * `beforeSend` takes ONE function, so a second concern added carelessly here
 * REPLACES the first, and the replacement is invisible: events keep arriving,
 * they simply stop being scrubbed. `scrubEvent` below composes the two and is
 * what the config wires, so there is one function and both layers run.
 *
 * WHAT IT DOES AND DOES NOT DO. It lowers the LEVEL of a `ValidationError` to
 * `warning` and tags it. It does NOT drop the event:
 *
 *   - dropping would hide the ONE thing these events are still good for, which
 *     is noticing that a path is throwing operator input again. The fix for
 *     Sentry 144696143 is that `createPatient` and `updatePatient` RETURN their
 *     refusals; if a future path throws one instead, the event is how anyone
 *     finds out; and
 *   - a dropped event and a fixed path look identical from the dashboard, which
 *     is PORTAL-REHYDRATE 1.3 - the convenience that maps an unknown case onto
 *     a harmless-looking known one.
 *
 * SO THIS IS A SEVERITY CHANGE AND NOT A SUPPRESSION, and it is the WEAKER of
 * the two halves this card shipped deliberately. The real fix is upstream.
 *
 * MATCHED ON `type`, WHICH IS THE CLASS NAME AS SENTRY RECEIVED IT. Not on the
 * message: the messages are patient-facing Portuguese sentences that change
 * when copy changes, and matching on those would silently stop matching. Not on
 * `instanceof` either - by the time an event reaches `beforeSend` the throw is
 * serialised data, not the object.
 */
export function downgradeValidationError(event: ErrorEvent): ErrorEvent {
  const values = event.exception?.values ?? [];
  if (!values.some((v) => v.type === "ValidationError")) return event;

  event.level = "warning";
  event.tags = { ...event.tags, operator_input: "true" };
  return event;
}

/**
 * The single `beforeSend` the server config installs. Both layers, in order.
 *
 * The scrub runs FIRST and unconditionally, because it is the one that carries
 * a rule-7 obligation: no frame leaves this process with captured locals, and
 * that must not depend on what kind of error it turned out to be.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  return downgradeValidationError(stripFrameVars(event));
}
