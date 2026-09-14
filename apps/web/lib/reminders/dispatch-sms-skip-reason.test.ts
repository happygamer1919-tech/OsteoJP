/**
 * COMMS-01 - the SMS ledger row names WHY an SMS never reached the provider.
 *
 * Before this, both skips in `sendPatientSms` returned null and the reminder's
 * ledger row said `send_refused` for both, so Lembretes SMS could not tell
 * reception "the number is a typo" from "the number is a landline". This drives
 * the real dispatch path with the data seam and the ledger replaced, and reads
 * what it would write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loadReminderData: vi.fn(),
  recordDispatch: vi.fn<(row: Record<string, unknown>) => Promise<void>>(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./dispatch-ledger", () => ({
  recordDispatch: h.recordDispatch,
  recordProviderStatus: vi.fn(async () => {}),
}));

import { dispatchReminder } from "./dispatch";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "11111111-1111-1111-1111-111111111111";
const STARTS_AT = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

function fixture(patientPhone: string) {
  return {
    appointmentId: APPOINTMENT_ID,
    startsAt: STARTS_AT,
    status: "confirmed",
    patientId: "33333333-3333-3333-3333-333333333333",
    patientName: "Madalena Sousa",
    patientEmail: null,
    patientPhone,
    patientReminderSmsEnabled: true,
    patientReminderEmailEnabled: false,
    patientDeletedAt: null,
    practitionerName: "Dr. João Pereira",
    locationName: "Linda-a-Velha",
    locationPhone: "+351 210 000 000",
    tenantSettings: { locale: "pt", contacts: { phone: "+351 210 000 000" } },
  };
}

const ENV_KEYS = ["REMINDERS_LIVE_SEND", "REMINDERS_LINK_SECRET", "REMINDERS_RESCHEDULE_BASE_URL"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Dry run: live send off, so a well-formed mobile is a sandbox result.
  process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://osteojp.pt";
  h.loadReminderData.mockReset();
  h.recordDispatch.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function smsLedgerRow(phone: string): Promise<Record<string, unknown>> {
  h.loadReminderData.mockResolvedValue(fixture(phone));
  const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, "24h", "sms");
  expect(outcome).toMatchObject({ dispatched: true });
  const smsRows = h.recordDispatch.mock.calls.map((c) => c[0]).filter((r) => r.channel === "sms");
  expect(smsRows).toHaveLength(1);
  return smsRows[0]!;
}

describe("the SMS ledger reason for a number that never reached the provider", () => {
  it("an unnormalisable number is recorded as invalid_phone", async () => {
    expect(await smsLedgerRow("not a real number")).toMatchObject({
      outcome: "suppressed",
      suppressionReason: "invalid_phone",
      providerMessageId: null,
    });
  });

  it("a Portuguese landline is recorded as landline", async () => {
    expect(await smsLedgerRow("214191988")).toMatchObject({
      outcome: "suppressed",
      suppressionReason: "landline",
      providerMessageId: null,
    });
  });

  it("CONTROL: a mobile with live send off is still sandbox, not a skip", async () => {
    expect(await smsLedgerRow("+351 912 345 678")).toMatchObject({
      outcome: "suppressed",
      suppressionReason: "sandbox",
    });
  });

  it("no arm writes the old catch-all send_refused", async () => {
    for (const phone of ["not a real number", "214191988", "+351 912 345 678"]) {
      const row = await smsLedgerRow(phone);
      expect(row.suppressionReason).not.toBe("send_refused");
      h.recordDispatch.mockClear();
    }
  });
});
