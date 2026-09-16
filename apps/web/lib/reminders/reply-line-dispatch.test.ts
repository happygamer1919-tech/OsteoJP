/**
 * THE GATE WHERE THE MESSAGE IS ACTUALLY BUILT.
 *
 * reply-capability.test.ts proves the decision and templates.test.ts proves the
 * two renderings. Neither proves that `dispatchReminder` ASKS - and a gate that
 * is never consulted is the failure this whole change exists to fix, one layer
 * out. So this drives the real dispatch with the real env and reads the body
 * that would have gone to Twilio.
 *
 * The send is captured at the transport seam rather than mocked away, so the
 * assertion is on the string the provider would have received.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  sent: [] as { body: string; templateId: string }[],
}));

vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./clients", async () => {
  const actual = await vi.importActual<typeof import("./clients")>("./clients");
  return {
    ...actual,
    sendSms: vi.fn(async (m: { body: string; templateId: string }) => {
      h.sent.push({ body: m.body, templateId: m.templateId });
      return { channel: "sms" as const, sandbox: true, id: "captured" };
    }),
  };
});

import { dispatchReminder } from "./dispatch";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";

const ENV = ["TWILIO_SMS_FROM", "TWILIO_MESSAGING_SERVICE_SID", "REMINDERS_REPLY_CAPABLE"] as const;
const saved: Record<string, string | undefined> = {};

function row() {
  return {
    appointmentId: APPT,
    startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: "confirmed",
    confirmationState: "confirmed",
    origin: "staff",
    patientId: "33333333-3333-4333-8333-333333333333",
    patientName: "Madalena Sousa",
    patientEmail: "madalena@example.pt",
    patientPhone: "+351 912 345 678",
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: true,
    // SEC-reminder-path-ignores-soft-delete: STATED, not omitted. A fixture that
    // leaves this out asserts nothing about a live SMS gate.
    patientDeletedAt: null,
    practitionerName: "Dr. Joao Pereira",
    locationName: "Castelo Branco",
    locationPhone: "272 328 221",
    tenantSettings: { locale: "pt", contacts: { phone: "272 328 221" } },
    patientHasAcceptedTerms: false,
  };
}

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  h.sent.length = 0;
  h.loadReminderData.mockReset();
  h.loadReminderData.mockResolvedValue(row());
  process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.example.test";
  delete process.env.REMINDERS_LIVE_SEND;
});

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  vi.restoreAllMocks();
});

async function bodySentWith(env: Record<string, string>): Promise<string> {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const out = await dispatchReminder(TENANT, APPT, "24h", "sms");
  expect(out.dispatched).toBe(true);
  expect(h.sent).toHaveLength(1);
  return h.sent[0]!.body;
}

describe("the 24h SMS adapts to the sender, at the dispatch", () => {
  it("ALPHANUMERIC SENDER: no reply instruction, and S2 instead — production today", () => {
    // The exact defect: this body must not ask for a reply the sender cannot
    // receive. It is JP's 2026-08-03 body, byte-identical, PLUS one line.
    //
    // S2 ADDED BY OWNER RULING Q-SMS-S2 (dispatch COMMS-R3, 2026-09-16): when the
    // sender cannot receive a reply the message now SAYS so, because withholding
    // the instruction never stopped patients replying to a one-way sender - and
    // that reply reaches nobody. The literal is pinned here rather than imported
    // so this asserts the RULED WORDING, not merely agreement with a constant.
    return bodySentWith({ TWILIO_SMS_FROM: "OsteoJP" }).then((body) => {
      expect(body).toBe(
        [
          "OsteoJP - Lembrete",
          "Consulta: amanha " +
            new Intl.DateTimeFormat("pt-PT", {
              day: "2-digit",
              month: "2-digit",
              timeZone: "Europe/Lisbon",
            }).format(row().startsAt) +
            " as " +
            new Intl.DateTimeFormat("pt-PT", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "Europe/Lisbon",
            }).format(row().startsAt),
          "Local: Castelo Branco",
          "Remarcar: 272 328 221",
          "Nao lemos respostas.",
        ].join("\n"),
      );
      // Still no reply INSTRUCTION. The regex stays case-sensitive on purpose:
      // S2's "Nao" is not the keyword "NAO", and the distinction is the point.
      expect(body).not.toMatch(/Responda|SIM|NAO/);
    });
  });

  it("E.164 SENDER: the instruction is there — the day the number lands", async () => {
    const body = await bodySentWith({ TWILIO_SMS_FROM: "+351912345678" });
    expect(body).toContain("Responda SIM para confirmar ou NAO para cancelar");
  });

  it("MESSAGING SERVICE, undeclared: no instruction", async () => {
    const body = await bodySentWith({
      TWILIO_MESSAGING_SERVICE_SID: "MG0123456789abcdef0123456789abcd",
    });
    expect(body).not.toMatch(/Responda/);
  });

  it("MESSAGING SERVICE, declared: the instruction is there", async () => {
    const body = await bodySentWith({
      TWILIO_MESSAGING_SERVICE_SID: "MG0123456789abcdef0123456789abcd",
      REMINDERS_REPLY_CAPABLE: "true",
    });
    expect(body).toContain("Responda SIM para confirmar ou NAO para cancelar");
  });

  it("NO SENDER CONFIGURED: no instruction", async () => {
    const body = await bodySentWith({});
    expect(body).not.toMatch(/Responda/);
  });

  /**
   * THE TEMPLATE ID DOES NOT CHANGE WITH THE GATE, and it should not: both
   * renderings are the SAME approved body under one id (WF-18, and the gated
   * form is a strict prefix of the approved amendment). This differs from the
   * fee line, which gets its own id precisely because it is NOT approved -
   * asserted here so the distinction is deliberate rather than assumed.
   */
  it("both renderings send under the same approved template id", async () => {
    await bodySentWith({ TWILIO_SMS_FROM: "OsteoJP" });
    expect(h.sent[0]!.templateId).toBe("reminder.24h.sms");
    h.sent.length = 0;
    await bodySentWith({ TWILIO_SMS_FROM: "+351912345678" });
    expect(h.sent[0]!.templateId).toBe("reminder.24h.sms");
  });

  it("the gate is read PER SEND, so a Vercel change needs no code change", async () => {
    // Same process, two dispatches, one env flip between them. This is what
    // makes "it arms itself" true rather than aspirational: the answer is
    // computed at send time, not captured at module load.
    const off = await bodySentWith({ TWILIO_SMS_FROM: "OsteoJP" });
    expect(off).not.toMatch(/Responda/);
    h.sent.length = 0;
    const on = await bodySentWith({ TWILIO_SMS_FROM: "+351912345678" });
    expect(on).toMatch(/Responda/);
    // WAS `on.startsWith(off)`. Owner ruling Q-SMS-S2 (dispatch COMMS-R3,
    // 2026-09-16) ends that prefix relation by construction: `off` now carries
    // S2 as its last line, so the two renderings DIVERGE at the end instead of
    // one extending the other. What the ruling preserves is what this test was
    // really for - the same approved body underneath, with exactly one line
    // differing by sender - so that is what is asserted now.
    const base = off.split("\n").slice(0, 4).join("\n");
    expect(off).toBe(`${base}\nNao lemos respostas.`);
    expect(on.startsWith(base)).toBe(true);
    expect(on).not.toContain("Nao lemos respostas.");
  });
});
