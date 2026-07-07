import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendSms } from "./clients";
import {
  isGsm7,
  renderConfirmationSms,
  renderFollowUpSms,
  renderNoShowSms,
  renderSms,
  SMS_SEGMENT_LIMIT,
  type FollowUpContext,
  type NoShowContext,
  type ReminderContext,
} from "./templates";
import type { Locale } from "@osteojp/i18n";

// Twilio-integration proof suite (qa/twilio-proof). Three concerns, one file:
//
//   1. Worst-case SMS rendering — EVERY SMS template kind, both locales, filled
//      with the longest realistic values, stays pure GSM-7 and single-segment.
//   2. The exact payload handed to the Twilio SDK — sender resolution
//      (TWILIO_SMS_FROM alphanumeric "OsteoJP" vs TWILIO_MESSAGING_SERVICE_SID
//      fallback), launch-gate behaviour, and 4xx/5xx error propagation.
//   3. Phone handling as it actually is — characterization tests pinning that
//      NO E.164 normalization exists in the send path (see KNOWN GAP below).
//
// Complements clients.test.ts (sandbox/PII basics) and
// reminders-e2e.smoke.test.ts (dispatch-level dry run); no overlap is asserted
// twice deliberately except where a regression here would be silent there.

const twilioCreate = vi.fn();
const twilioFactory = vi.fn();

vi.mock("twilio", () => ({
  default: (...args: unknown[]) => {
    twilioFactory(...args);
    return { messages: { create: twilioCreate } };
  },
}));

const ENV_KEYS = [
  "REMINDERS_LIVE_SEND",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_SMS_FROM",
  "TWILIO_MESSAGING_SERVICE_SID",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  twilioCreate.mockReset();
  twilioFactory.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/* ================================================================== */
/* 1. Worst-case SMS rendering                                         */
/* ================================================================== */

// Longest realistic fills. Location: Montemor-o-Novo is the longest of the
// three real clinics. Phone: full spaced PT landline. Patient name: SMS copy
// deliberately carries NO name (docs/sms-templates.md), so a long name is
// asserted to be absent rather than length-budgeted.
const LONGEST_LOCATION = "Montemor-o-Novo";
const LONGEST_PHONE = "+351 210 000 000";
const LONGEST_FIRST_NAME = "Maximiliano-Alexandre";

const WORST_CTX: ReminderContext = {
  patientFirstName: LONGEST_FIRST_NAME,
  appointmentDateLong: "23 de maio de 2026",
  appointmentDateShort: "23/05",
  appointmentTime: "14:30",
  practitionerName: "Dr. Constantino Albuquerque",
  clinicLocation: LONGEST_LOCATION,
  clinicPhone: LONGEST_PHONE,
  rescheduleLink: "https://osteojp.pt/r/oversized-token-never-in-sms",
};

const WORST_FOLLOW_UP: FollowUpContext = {
  patientFirstName: LONGEST_FIRST_NAME,
  appointmentDateLong: "23 de maio de 2026",
  appointmentDateShort: "23/05",
  clinicPhone: LONGEST_PHONE,
};

const WORST_NO_SHOW: NoShowContext = {
  patientFirstName: LONGEST_FIRST_NAME,
  appointmentDateLong: "23 de maio de 2026",
  appointmentDateShort: "23/05",
  appointmentTime: "14:30",
  clinicPhone: LONGEST_PHONE,
  rescheduleLink: "https://osteojp.pt/r/oversized-token-never-in-sms",
};

// name → render thunk, covering every SMS template kind the pipeline can send.
const SMS_RENDERS: ReadonlyArray<[string, (locale: Locale) => string]> = [
  ["reminder 48h", (l) => renderSms("48h", l, WORST_CTX)],
  ["reminder 24h", (l) => renderSms("24h", l, WORST_CTX)],
  ["confirmation", (l) => renderConfirmationSms(l, WORST_CTX)],
  ["follow_up", (l) => renderFollowUpSms(l, WORST_FOLLOW_UP)],
  ["no_show", (l) => renderNoShowSms(l, WORST_NO_SHOW)],
];

describe("worst-case SMS rendering — GSM-7, single segment, both locales", () => {
  for (const [kind, render] of SMS_RENDERS) {
    for (const locale of ["pt", "en"] as const) {
      it(`${kind} (${locale}) with longest location + phone is pure GSM-7 and <= ${SMS_SEGMENT_LIMIT} chars`, () => {
        const msg = render(locale);
        expect(isGsm7(msg)).toBe(true);
        expect(msg.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
        // No accented character may survive into SMS copy (GSM-7 rule).
        expect(msg).not.toMatch(/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/);
      });
    }
  }

  it("SMS templates carry no patient name, so a long name cannot grow the segment", () => {
    for (const [, render] of SMS_RENDERS) {
      for (const locale of ["pt", "en"] as const) {
        expect(render(locale)).not.toContain(LONGEST_FIRST_NAME);
      }
    }
  });

  it("SMS templates carry no reschedule link (link lives in email only)", () => {
    for (const locale of ["pt", "en"] as const) {
      expect(renderSms("48h", locale, WORST_CTX)).not.toContain("osteojp.pt/r/");
      expect(renderNoShowSms(locale, WORST_NO_SHOW)).not.toContain("osteojp.pt/r/");
    }
  });
});

/* ================================================================== */
/* 2. Twilio payload, sender resolution, gate, errors                  */
/* ================================================================== */

function armLiveCreds(): void {
  process.env.REMINDERS_LIVE_SEND = "true";
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "tok_test";
}

describe("sender resolution — from is TWILIO_SMS_FROM, falling back to the messaging service SID", () => {
  it("uses the alphanumeric sender 'OsteoJP' as `from` when TWILIO_SMS_FROM is set to it", async () => {
    armLiveCreds();
    process.env.TWILIO_SMS_FROM = "OsteoJP";
    twilioCreate.mockResolvedValue({ sid: "SM_alpha" });

    const res = await sendSms({ to: "+351912345678", body: "b" });

    expect(twilioFactory).toHaveBeenCalledWith("AC_test", "tok_test");
    expect(twilioCreate).toHaveBeenCalledWith({
      to: "+351912345678",
      from: "OsteoJP",
      body: "b",
    });
    expect(res).toEqual({ channel: "sms", sandbox: false, id: "SM_alpha" });
  });

  it("falls back to TWILIO_MESSAGING_SERVICE_SID as `from` when TWILIO_SMS_FROM is unset", async () => {
    armLiveCreds();
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_test";
    twilioCreate.mockResolvedValue({ sid: "SM_mg" });

    await sendSms({ to: "+351912345678", body: "b" });

    expect(twilioCreate).toHaveBeenCalledWith({
      to: "+351912345678",
      from: "MG_test",
      body: "b",
    });
  });

  it("TWILIO_SMS_FROM wins when both are set", async () => {
    armLiveCreds();
    process.env.TWILIO_SMS_FROM = "OsteoJP";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_test";
    twilioCreate.mockResolvedValue({ sid: "SM_x" });

    await sendSms({ to: "+351912345678", body: "b" });

    expect(twilioCreate).toHaveBeenCalledWith(
      expect.objectContaining({ from: "OsteoJP" }),
    );
  });

  it("the code never reads TWILIO_SENDER_ID (the var docs/cutover-runbook.md names)", async () => {
    // Runbook §1.5 / §env-table instructs setting TWILIO_SENDER_ID=OsteoJP in
    // Vercel prod. The code only reads TWILIO_SMS_FROM. This pins the mismatch:
    // with ONLY TWILIO_SENDER_ID set, the send is suppressed as unconfigured.
    armLiveCreds();
    process.env.TWILIO_SENDER_ID = "OsteoJP"; // not in ENV_KEYS; clean up below
    try {
      const res = await sendSms({ to: "+351912345678", body: "b" });
      expect(res.sandbox).toBe(true);
      expect(twilioFactory).not.toHaveBeenCalled();
    } finally {
      delete process.env.TWILIO_SENDER_ID;
    }
  });
});

describe("launch gate — REMINDERS_LIVE_SEND must be exactly 'true'", () => {
  for (const value of [undefined, "false", "1", "TRUE", "yes"]) {
    it(`no Twilio construction with full creds when flag is ${JSON.stringify(value)}`, async () => {
      process.env.TWILIO_ACCOUNT_SID = "AC_test";
      process.env.TWILIO_AUTH_TOKEN = "tok_test";
      process.env.TWILIO_SMS_FROM = "OsteoJP";
      if (value !== undefined) process.env.REMINDERS_LIVE_SEND = value;

      const res = await sendSms({ to: "+351912345678", body: "b" });

      expect(res).toEqual({ channel: "sms", sandbox: true, id: "sandbox:sms" });
      expect(twilioFactory).not.toHaveBeenCalled();
      expect(twilioCreate).not.toHaveBeenCalled();
    });
  }
});

describe("Twilio API errors propagate (Inngest step retry semantics)", () => {
  // The Twilio SDK rejects with a RestException carrying status + code. sendSms
  // has no catch — the rejection must surface to the Inngest step so the run is
  // marked failed and retried, never swallowed into a fake success.
  function restException(status: number, code: number, message: string) {
    return Object.assign(new Error(message), { status, code });
  }

  beforeEach(() => {
    armLiveCreds();
    process.env.TWILIO_SMS_FROM = "OsteoJP";
  });

  it("rejects on 4xx (21211 invalid 'To' number) instead of returning a result", async () => {
    twilioCreate.mockRejectedValue(
      restException(400, 21211, "The 'To' number is not a valid phone number."),
    );
    await expect(sendSms({ to: "+351912345678", body: "b" })).rejects.toMatchObject({
      status: 400,
      code: 21211,
    });
  });

  it("rejects on 5xx (Twilio internal error)", async () => {
    twilioCreate.mockRejectedValue(restException(500, 20500, "Internal server error"));
    await expect(sendSms({ to: "+351912345678", body: "b" })).rejects.toMatchObject({
      status: 500,
    });
  });
});

/* ================================================================== */
/* 3. Phone handling — E.164 normalization in the send path            */
/* ================================================================== */

describe("phone normalization — every stored format reaches Twilio as E.164 +351", () => {
  // Closes the gap the #485 characterization tests pinned: normalizePhonePT
  // (phone.ts) now runs inside sendSms, so no un-normalized number can reach
  // messages.create. Full format coverage lives in phone.test.ts; this proves
  // the wiring at the Twilio boundary.

  beforeEach(() => {
    armLiveCreds();
    process.env.TWILIO_SMS_FROM = "OsteoJP";
    twilioCreate.mockResolvedValue({ sid: "SM_norm" });
  });

  const STORED_FORMATS: ReadonlyArray<[stored: string, e164: string]> = [
    ["912 345 678", "+351912345678"],
    ["00351912345678", "+351912345678"],
    ["9 1 2 3 4 5 6 7 8", "+351912345678"],
    ["+351 912-345-678", "+351912345678"],
    ["+351912345678", "+351912345678"], // already E.164, passthrough
  ];

  for (const [stored, e164] of STORED_FORMATS) {
    it(`normalizes ${JSON.stringify(stored)} → ${e164} before messages.create`, async () => {
      const res = await sendSms({ to: stored, body: "b" });
      expect(twilioCreate).toHaveBeenCalledWith(
        expect.objectContaining({ to: e164 }),
      );
      expect(res.sandbox).toBe(false);
    });
  }

  for (const garbage of ["not-a-phone", "12345", "+441234567890", ""]) {
    it(`rejects ${JSON.stringify(garbage)}: skip result, Twilio never called, number never logged`, async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const res = await sendSms({ to: garbage, body: "b" });
        expect(res).toEqual({ channel: "sms", sandbox: true, id: "skipped:invalid_phone" });
        expect(twilioFactory).not.toHaveBeenCalled();
        expect(twilioCreate).not.toHaveBeenCalled();
        // PII rule (#7): the warning names the reason, never the raw value.
        const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
        expect(logged).toContain("invalid_phone");
        if (garbage) expect(logged).not.toContain(garbage);
      } finally {
        warn.mockRestore();
      }
    });
  }

  it("skips invalid numbers even in sandbox mode (guard runs before the gate)", async () => {
    delete process.env.REMINDERS_LIVE_SEND;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await sendSms({ to: "garbage", body: "b" });
      expect(res.id).toBe("skipped:invalid_phone");
    } finally {
      warn.mockRestore();
    }
  });
});
