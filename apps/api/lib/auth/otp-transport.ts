// W13-03 (Wave 13 LOOP 3) — the OTP code transport. PG1, Decision D.
//
// LOOP 3 step 1: "Define the transport interface first: send a code to a phone
// number. Nothing above it knows about Twilio." This module is that boundary.
// The OTP flow depends on `OtpTransport` and never on a provider.
//
// WHY THIS IS NOT THE NOTIFICATION TRANSPORT, which already exists in
// @osteojp/notify and would have been the obvious reuse. The notify path gates
// every send on TWO things: an approved template in the registry, and a
// live-send flag. Both are right for clinical copy and wrong for a login code:
//
//   * REMINDERS_LIVE_SEND is false through all acceptance testing (WF-12) and is
//     armed as a launch-day step. Routing OTP through it would mean that on
//     launch morning, before the reminder flag is armed, NO PATIENT CAN LOG IN.
//     Authentication cannot share a kill switch with marketing-adjacent sends.
//   * The approval registry exists so unreviewed CLINICAL copy cannot reach a
//     patient. A 6-digit code with a fixed sentence around it is not clinical
//     copy, and putting it through JP's review queue would consume a clinical
//     owner's attention on a string that says "o seu codigo e 123456".
//
// So it gets its own interface and its OWN flag, which is what LOOP 3 step 3
// asks for. What it does NOT get is a second way to escape a gate: the flag
// below defaults OFF and the loop does not turn it on.
//
// PII RULE (#7). The code and the phone number are the two things this module
// handles and NEITHER is ever logged. Not at info, not at error, not truncated,
// not "just the last four". A log line that carries an OTP is a credential in a
// log aggregator, and a log line that carries a phone is patient PII in one.

/**
 * Env reader shape. A plain record rather than NodeJS.ProcessEnv, matching
 * @osteojp/notify's EnvSource: these functions only READ named keys, and the
 * stricter type forces every test to build a full ProcessEnv to check one flag.
 */
export type EnvSource = Record<string, string | undefined>;

/** E.164, already normalized by the caller. */
export type OtpRecipient = string;

export type OtpSendResult = {
  /** false when nothing left the process (sink, or provider not configured). */
  delivered: boolean;
  /** Provider message id, or a sink marker. Never the code. */
  id: string;
};

/**
 * The whole interface. One method, because there is one thing to do, and a
 * narrow seam is what keeps Twilio out of everything above it.
 */
export type OtpTransport = {
  send(to: OtpRecipient, code: string): Promise<OtpSendResult>;
};

/**
 * Is the real provider armed? Exact-string "true", matching every other flag in
 * this codebase (`liveSendEnabled`), so a stray "TRUE" or "1" leaves it off.
 * Read at call time rather than module load so tests and env flips take effect
 * without re-import.
 */
export function otpLiveSendEnabled(env: EnvSource = process.env): boolean {
  return env.OTP_LIVE_SEND === "true";
}

/**
 * The test sink (LOOP 3 step 2). Captures codes in-process, sends nothing.
 *
 * IT EXISTS FOR TESTS AND FOR THE DEFAULT PATH BOTH. With the flag off this is
 * what runs, so a misconfigured deployment delivers nothing rather than
 * delivering through a half-configured provider — and says so in the return
 * value instead of pretending.
 *
 * `codes` is readable so a test can assert what was issued without reaching into
 * the database. It is deliberately NOT exported as a singleton: each test builds
 * its own sink, so suites cannot leak codes into each other.
 */
export type OtpTestSink = OtpTransport & {
  readonly sent: ReadonlyArray<{ to: string; code: string }>;
  reset(): void;
};

export function createOtpTestSink(): OtpTestSink {
  const sent: Array<{ to: string; code: string }> = [];
  let seq = 0;
  return {
    sent,
    reset() {
      sent.length = 0;
      seq = 0;
    },
    async send(to, code) {
      sent.push({ to, code });
      return { delivered: false, id: `sink:otp:${++seq}` };
    },
  };
}

/**
 * A DEPLOYMENT fault, not a delivery failure, and the difference is the whole
 * reason this class exists.
 *
 * The OTP request route answers `204` no matter what, because every additional
 * distinguishable outcome is a signal an attacker can read. So it now CATCHES
 * what the transport throws and answers `204` anyway — which is right for a
 * carrier refusing one number, and WRONG for "the flag is armed and there are no
 * credentials", because that fails for EVERY patient and must stay loud.
 *
 * TELLING THE TWO APART BY MESSAGE STRING WOULD BE THE DEFECT, NOT THE FIX.
 * A `.includes("not configured")` match couples the route to prose that anyone
 * may reword, and it fails OPEN: reword the message and a total outage starts
 * being swallowed as a per-number delivery failure, silently. A class survives
 * rewording, and `instanceof` is checkable by the compiler.
 *
 * Nothing else in this module throws this. A Twilio rejection, a network fault
 * and an unroutable prefix are all ordinary `Error`s and all mean the same
 * thing operationally: this one send did not happen.
 */
export class OtpTransportMisconfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpTransportMisconfigured";
  }
}

/**
 * The Twilio adapter (LOOP 3 step 3), behind the flag, LEFT OFF.
 *
 * ENV FAILURES HERE ARE LOUD, inheriting PG7's posture: "no silent default on a
 * notification or token path." If the flag is armed and the credentials are
 * absent this THROWS at send time rather than returning a cheerful
 * `delivered: false`, because a login code that silently never sends is
 * indistinguishable to the patient from a wrong phone number, and the clinic
 * would debug the wrong thing.
 *
 * The client is constructed lazily, per send, and only on the live path. That
 * matters more than it looks: constructing it at module load would make every
 * unit test in this app either mock Twilio or carry credentials.
 */
export function createTwilioOtpTransport(): OtpTransport {
  return {
    async send(to, code) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_MESSAGING_SERVICE_SID;

      if (!sid || !token || !from) {
        // Names only, never values. This is the loud failure PG7 requires.
        throw new OtpTransportMisconfigured(
          "otp/twilio: OTP_LIVE_SEND is armed but the transport is not configured. " +
            "Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and one of " +
            "TWILIO_SMS_FROM | TWILIO_MESSAGING_SERVICE_SID.",
        );
      }

      const { default: twilio } = await import("twilio");
      const client = twilio(sid, token);
      const msg = await client.messages.create({
        to,
        from,
        body: otpMessageBody(code),
      });
      return { delivered: true, id: msg.sid };
    },
  };
}

/**
 * The message body.
 *
 * DELIBERATELY MINIMAL, and each omission is a decision. No clinic branding
 * beyond the name, no appointment detail, no link — an SMS that arrives at a
 * phone the attacker controls should reveal nothing about the account it belongs
 * to. It does not say WHOSE account, WHICH clinic visit, or anything a
 * social-engineering call could then quote back.
 *
 * The "never shares" line is anti-phishing copy and is not decoration: the
 * standard attack on SMS OTP is a caller claiming to be the clinic and asking
 * the patient to read the code out.
 *
 * pt-PT, matching every other patient-facing string. The clinic operates in one
 * locale and this is not a template needing a registry entry — see the header.
 */
export function otpMessageBody(code: string): string {
  return (
    `OsteoJP: o seu codigo de acesso e ${code}. ` +
    `Expira em breve. A clinica nunca lhe pede este codigo por telefone.`
  );
}

/**
 * The transport the flow actually uses. Sink unless the flag is armed.
 *
 * A FUNCTION AND NOT A CONSTANT so the flag is read per call. As a module-level
 * constant, flipping OTP_LIVE_SEND would require a redeploy to take effect and,
 * worse, tests would silently share whichever value happened to be set when the
 * module first loaded.
 */
export function resolveOtpTransport(env: EnvSource = process.env): OtpTransport {
  return otpLiveSendEnabled(env) ? createTwilioOtpTransport() : createOtpTestSink();
}
