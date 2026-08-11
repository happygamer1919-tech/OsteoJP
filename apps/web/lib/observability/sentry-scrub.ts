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
