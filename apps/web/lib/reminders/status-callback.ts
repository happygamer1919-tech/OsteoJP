import type { EnvSource } from "@osteojp/notify";

// OBS-04 — the StatusCallback URL we hand Twilio with EVERY message.
//
// ==========================================================================
// PER MESSAGE, NOT A CONSOLE SETTING. THE OWNER'S RULING, 2026-09-04.
// ==========================================================================
// Twilio can be told where to post delivery statuses in two places: on the
// Messaging Service in the console, or as a `statusCallback` parameter on each
// `messages.create`. They look equivalent and they are not.
//
// A console setting is a CLICK NOBODY CAN AUDIT. It is not in this repository,
// it does not appear in a diff, no test can assert it, and the only way to know
// it is still set is for a person to log in and look. That is the same class of
// dependency that produced SR-43 - the sender was configured somewhere nobody
// could see, it was wrong, and every message failed for two days while the
// system reported nothing.
//
// A parameter on the send is CODE. It is in the diff, it is asserted by
// `status-callback.test.ts`, and if it ever stops being sent the reason is a
// commit rather than a memory.
//
// ==========================================================================
// IT IS ABSENT RATHER THAN GUESSED WHEN THE ORIGIN IS NOT CONFIGURED
// ==========================================================================
// `callbackUrl` returns null when the variable is unset or blank, and the
// transport then omits the parameter entirely. It does NOT fall back to a
// default host, to the request's own origin, or to a relative path:
//
//   - a relative path is not accepted by Twilio, so it would fail at send time
//     and take the MESSAGE down with it - the reminder would stop going out
//     because the telemetry could not be addressed, which is exactly backwards;
//   - a guessed host silently posts every delivery status at somebody else's
//     server, and the failure is invisible from here.
//
// So a missing variable costs the STATUS, never the MESSAGE. The dispatch row
// is still written at send time with `outcome = 'sent'`; it simply never
// receives a `provider_status`, and a row whose status stayed NULL is a
// legible, queryable state rather than a lost one.
//
// PORTAL-REHYDRATE 1.3: `null` here has exactly ONE cause, an absent or blank
// variable. A set-but-wrong origin is not detectable from this process and is
// deliberately not folded into the same value — the same reasoning
// `confirmLinkHostOrNull` states one file over.

/** The origin the callback is addressed at. Same shape as the inbound webhook's. */
export const STATUS_CALLBACK_BASE_VAR = "REMINDERS_STATUS_CALLBACK_BASE_URL" as const;

/** The route Twilio posts a delivery status to. */
export const STATUS_CALLBACK_PATH = "/api/webhooks/twilio/status" as const;

/**
 * The absolute URL Twilio should post delivery statuses to, or null when the
 * origin is not configured.
 *
 * Trailing slashes are stripped so a variable set as `https://app.example/` and
 * one set as `https://app.example` produce the same URL rather than one with a
 * doubled slash that Twilio would sign differently.
 */
export function statusCallbackUrl(env: EnvSource = process.env): string | null {
  const base = env[STATUS_CALLBACK_BASE_VAR]?.trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}${STATUS_CALLBACK_PATH}`;
}

/**
 * The parameter fragment to spread into `messages.create`, or nothing.
 *
 * A SPREAD RATHER THAN A NULLABLE FIELD, because Twilio's client rejects
 * `statusCallback: undefined` differently from an absent key depending on
 * version, and "absent" is what we mean. The call site reads
 * `...statusCallbackParam()` beside `...twilioSenderParam(...)`, which is the
 * shape that file already uses for exactly this reason.
 */
export function statusCallbackParam(
  env: EnvSource = process.env,
): { statusCallback: string } | Record<string, never> {
  const url = statusCallbackUrl(env);
  return url === null ? {} : { statusCallback: url };
}
