/**
 * Item 4: the silent fallbacks in the reminder path are gone.
 *
 * Each of these used to look healthy at boot and fail (or 404) at the moment a
 * real patient was on the other end. The fix in every case is the same: fail
 * where an engineer sees it, not where a patient does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { verifyRescheduleToken, signRescheduleToken } from "./link-token";

const SECRET_ENV = "REMINDERS_LINK_SECRET";
const BASE_ENV = "REMINDERS_RESCHEDULE_BASE_URL";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of [SECRET_ENV, BASE_ENV]) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of [SECRET_ENV, BASE_ENV]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe("reschedule base URL has no marketing-site fallback", () => {
  it("throws at render when REMINDERS_RESCHEDULE_BASE_URL is unset", async () => {
    process.env[SECRET_ENV] = "test-secret";
    delete process.env[BASE_ENV];

    const { buildReminderContext } = await import("./dispatch");
    expect(() =>
      buildReminderContext(
        {
          tenantId: "t1",
          startsAt: new Date("2026-09-01T09:00:00Z"),
          patientName: "Maria Silva",
          practitionerName: "Dr. Joao",
          locationName: "Linda-a-Velha",
          locationPhone: "+351210000000",
          tenantSettings: null,
          appointmentId: "a1",
        },
        "pt",
      ),
    ).toThrow(/REMINDERS_RESCHEDULE_BASE_URL is required/);
  });

  it("never silently emits a link on the marketing domain", async () => {
    process.env[SECRET_ENV] = "test-secret";
    process.env[BASE_ENV] = "https://app.osteojp.pt";

    const { buildReminderContext } = await import("./dispatch");
    const ctx = buildReminderContext(
      {
        tenantId: "t1",
        startsAt: new Date("2026-09-01T09:00:00Z"),
        patientName: "Maria Silva",
        practitionerName: "Dr. Joao",
        locationName: "Linda-a-Velha",
        locationPhone: "+351210000000",
        tenantSettings: null,
        appointmentId: "a1",
      },
      "pt",
    );

    expect(ctx.rescheduleLink).toContain("https://app.osteojp.pt/r/");
    // The old default. A link on this host 404s for the patient.
    expect(ctx.rescheduleLink).not.toBe("https://osteojp.pt");
    expect(ctx.rescheduleLink.startsWith("https://osteojp.pt/")).toBe(false);
  });
});

describe("link verification no longer hides a missing secret", () => {
  it("logs loudly when the secret is absent, instead of reading as a bad token", () => {
    process.env[SECRET_ENV] = "test-secret";
    const token = signRescheduleToken({
      tenantId: "t1",
      appointmentId: "a1",
      exp: Math.floor(Date.now() / 1000) + 3600, scope: "confirm_cancel" 
    });

    delete process.env[SECRET_ENV];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = verifyRescheduleToken(token);

      // Still null: the caller must not be able to distinguish a misconfigured
      // deployment from a forged token.
      expect(result).toBeNull();
      // But no longer silent.
      const logged = err.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toContain(SECRET_ENV);
      expect(logged).toContain("not configured");
    } finally {
      err.mockRestore();
    }
  });

  it("stays silent for a genuinely bad token when the secret IS configured", () => {
    process.env[SECRET_ENV] = "test-secret";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(verifyRescheduleToken("bogus.token")).toBeNull();
      // A forged token is not a misconfiguration and must not page anyone.
      expect(err).not.toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });
});
