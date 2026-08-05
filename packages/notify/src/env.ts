// Environment policy for the notification path.
//
// Two rules, both deliberate:
//
//   1. Live send is OPT-IN. Only the exact string "true" arms it. Unset, "TRUE",
//      "1", "yes", " true " and every other value mean OFF. A typo in a Vercel
//      env var must fail safe, never fail open.
//   2. No silent fallbacks. The senders used to default the Resend from-address
//      to the root domain and the reschedule base URL to the marketing site.
//      Both were guaranteed to fail (or 404) at send time while looking healthy
//      at boot. Those defaults are gone; the vars are required and validated up
//      front by `assertNotificationEnv`.

export type EnvSource = Record<string, string | undefined>;

/**
 * Live sends are off unless the flag is EXACTLY "true". Read at call time, not
 * module load, so tests and env flips take effect without re-import.
 */
export function liveSendEnabled(flag: string, env: EnvSource = process.env): boolean {
  return env[flag] === "true";
}

/**
 * Vars the notification path cannot function without once live send is armed.
 * Names only — values never appear in logs, errors, or this file.
 */
export const REQUIRED_WHEN_LIVE = {
  email: ["RESEND_API_KEY"],
  sms: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  /**
   * Link machinery. Both are needed to RENDER a reminder at all, not merely to
   * send one: dispatch builds the reschedule link before the send gate, so a
   * missing secret throws and a missing base URL used to silently point at the
   * marketing site (a 404 for the patient, no signal for the clinic).
   */
  links: ["REMINDERS_RESCHEDULE_BASE_URL", "REMINDERS_LINK_SECRET"],
} as const;

/**
 * Twilio needs a sender, but either form is acceptable, so this pair is checked
 * as "at least one of" rather than as two required names.
 */
export const TWILIO_SENDER_ONE_OF = [
  "TWILIO_SMS_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
] as const;

/**
 * From-addresses, required PER STREAM rather than globally.
 * LE-reminders-email-from-naming, owner ruling 2026-08-05: SPLIT, not rename.
 *
 * WHY PER-FLAG AND NOT IN `REQUIRED_WHEN_LIVE.email`. That list is demanded
 * whenever ANY flag is armed, and the two apps do not have the same streams:
 * `apps/api` asserts on `REMINDERS_LIVE_SEND` alone and has no invite path at
 * all ("the only body this app can send is patient activation"), so a global
 * `INVITES_EMAIL_FROM` would fail its boot over a variable it can never use.
 * Keying the requirement to the flag that arms the stream keeps each app
 * demanding exactly what it can actually send with.
 *
 * The property #778 established is preserved exactly: arming a stream with no
 * sender configured still fails at BOOT, not at the user. It just fails on that
 * stream's own variable now.
 *
 * A flag with no entry here contributes no from-address requirement, so adding a
 * third stream is a deliberate line in this map rather than a silent inheritance.
 */
export const EMAIL_FROM_BY_FLAG: Record<string, string> = {
  REMINDERS_LIVE_SEND: "REMINDERS_EMAIL_FROM",
  INVITES_LIVE_SEND: "INVITES_EMAIL_FROM",
};

export class NotificationEnvError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(
      `notify/env: notification path is armed but required env vars are missing: ${missing.join(", ")}. ` +
        `Set them (names above, values never logged) or set the live-send flag to a value other than "true".`,
    );
    this.name = "NotificationEnvError";
  }
}

/**
 * Collect the names of every required var that is missing or blank.
 * Pure: returns the list rather than throwing, so callers can log-or-throw.
 */
export function missingNotificationEnv(
  flags: readonly string[],
  env: EnvSource = process.env,
): string[] {
  // Nothing is required while every stream is in sandbox — that is the safe
  // default state and must not block boot in dev, CI, or a preview deploy.
  const anyLive = flags.some((f) => liveSendEnabled(f, env));
  if (!anyLive) return [];

  const present = (name: string) => {
    const v = env[name];
    return typeof v === "string" && v.trim() !== "";
  };

  const missing: string[] = [];
  for (const name of [
    ...REQUIRED_WHEN_LIVE.email,
    ...REQUIRED_WHEN_LIVE.sms,
    ...REQUIRED_WHEN_LIVE.links,
  ]) {
    if (!present(name)) missing.push(name);
  }
  // Each ARMED stream must carry its own from-address. A stream that is off
  // demands nothing, which is what lets apps/api boot without an invites sender
  // it has no path to use.
  for (const flag of flags) {
    if (!liveSendEnabled(flag, env)) continue;
    const name = EMAIL_FROM_BY_FLAG[flag];
    if (name && !present(name) && !missing.includes(name)) missing.push(name);
  }
  if (!TWILIO_SENDER_ONE_OF.some(present)) {
    missing.push(`one of [${TWILIO_SENDER_ONE_OF.join(" | ")}]`);
  }
  return missing;
}

/**
 * Boot-time gate. Throws with the FULL list of missing names, not the first one,
 * so a misconfigured deploy is fixed in one pass instead of one var per redeploy.
 */
export function assertNotificationEnv(
  flags: readonly string[],
  env: EnvSource = process.env,
): void {
  const missing = missingNotificationEnv(flags, env);
  if (missing.length > 0) throw new NotificationEnvError(missing);
}
