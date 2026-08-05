/**
 * W13-02 (Wave 13 LOOP 2) — IN-APP ONLY, proven on the TRANSPORT. PG4.
 *
 * The Definition of Done says: "A test proves the centre is in-app only: no
 * email and no SMS is dispatched by any of the four events. Assert on the
 * transport, not on intent." So this file does not read comments or check a
 * flag; it replaces the actual senders with spies, drives all four kinds all the
 * way through the real consumer, and asserts the spies were never called.
 *
 * TWO INDEPENDENT GUARDS, because they fail in different ways:
 *
 *   1. THE RUNTIME GUARD (below). Catches a call that exists today. It would
 *      fail the moment someone added `await sendSms(...)` to the fan-out.
 *   2. THE STATIC GUARD (below). Catches a transport that is IMPORTED but only
 *      reached on a branch this test does not take — an email leg behind a flag,
 *      an SMS fallback in an error path. The runtime guard cannot see those, and
 *      "not behind a flag, not for later" is the actual restriction LOOP 2
 *      carries.
 *
 * WHY THIS MATTERS ENOUGH TO TEST TWICE. PG5 owns every outbound channel and is
 * gated by REMINDERS_LIVE_SEND, which is currently the only thing between an
 * approved body and a real patient's phone. An email or SMS leg growing quietly
 * out of PG4 would bypass that gate entirely: it would be a send path that the
 * live-send flag never sees.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  receptionRows: [{ id: "recep-1" }] as { id: string }[],
  practitionerRows: [{ id: "prac-1" }] as { id: string }[],
  inserted: [] as Record<string, unknown>[],
  selectCalls: 0,
  sendSms: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@osteojp/db", () => {
  const chain = (rows: unknown[]) => {
    const p = Promise.resolve(rows);
    const self: Record<string, unknown> = {
      from: () => self,
      innerJoin: () => self,
      where: () => p,
      then: p.then.bind(p),
    };
    return self;
  };
  return {
    getDbAdmin: () => ({
      select: () => {
        H.selectCalls += 1;
        return chain(H.selectCalls % 2 === 1 ? H.receptionRows : H.practitionerRows);
      },
      insert: () => ({
        values: (rows: Record<string, unknown>[]) => {
          H.inserted.push(...rows);
          return { onConflictDoNothing: async () => undefined };
        },
      }),
    }),
    users: { id: "id", tenantId: "tenant_id", isActive: "is_active", roleId: "role_id" },
    roles: { id: "id", slug: "slug" },
    staffNotifications: {},
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (a: unknown, b: unknown) => [a, b],
  inArray: (a: unknown, b: unknown) => [a, b],
}));

// THE TRANSPORTS. If the fan-out ever reaches one, these record it.
vi.mock("@/lib/notify/clients", () => ({
  sendSms: H.sendSms,
  sendEmail: H.sendEmail,
  liveSendEnabled: () => true, // deliberately ON: a flag must not be the reason
  createSender: () => ({ sendSms: H.sendSms, sendEmail: H.sendEmail }),
}));

import { persistingConsumer } from "./centre";
import {
  emitPatientChange,
  setPatientChangeConsumer,
  resetPatientChangeConsumer,
  type PatientChangeEvent,
  type PatientChangeKind,
} from "./patient-change";

const NOW = new Date("2026-08-05T09:00:00.000Z");

const ALL_KINDS: PatientChangeKind[] = [
  "booked",
  "cancelled",
  "rescheduled",
  "appointment_request",
];

const event = (kind: PatientChangeKind): PatientChangeEvent => ({
  kind,
  tenantId: "t1",
  appointmentId: "appt-1",
  patientId: "pat-1",
  audience: { reception: true, practitionerIds: ["prac-1"] },
  previousStartsAt: NOW.toISOString(),
  newStartsAt: NOW.toISOString(),
  occurredAt: NOW.toISOString(),
});

beforeEach(() => {
  H.inserted = [];
  H.selectCalls = 0;
  H.sendSms.mockClear();
  H.sendEmail.mockClear();
});

describe("runtime guard: no transport is reached by any of the four events", () => {
  it("dispatches zero emails and zero SMS across all four kinds", async () => {
    setPatientChangeConsumer(persistingConsumer);
    try {
      for (const kind of ALL_KINDS) {
        H.selectCalls = 0;
        const out = await emitPatientChange(event(kind));
        // Proves the path actually RAN — a test where nothing happened would
        // also record zero sends, and would prove nothing at all.
        expect(out.delivered).toBe(true);
      }
      expect(H.inserted.length).toBe(ALL_KINDS.length * 2);
      expect(H.sendSms).not.toHaveBeenCalled();
      expect(H.sendEmail).not.toHaveBeenCalled();
    } finally {
      resetPatientChangeConsumer();
    }
  });
});

describe("static guard: no transport is even imported by the centre", () => {
  // Read from source rather than the module graph: an import that is present but
  // unreached on this test's branch is exactly what the runtime guard misses.
  const FILES = ["centre.ts", "patient-change.ts"];
  const FORBIDDEN = [
    "notify/clients",
    "reminders/clients",
    "sendSms",
    "sendEmail",
    "twilio",
    "resend",
    "nodemailer",
    "@sendgrid",
    "web-push",
  ];

  for (const file of FILES) {
    it(`${file} imports no email, SMS or push transport`, () => {
      const src = readFileSync(join(__dirname, file), "utf8");
      // Strip block and line comments: this file's own prose names the very
      // strings it forbids, and so does centre.ts's header. Matching on a
      // comment would make the test fail for documenting itself.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const bad of FORBIDDEN) {
        expect(code.toLowerCase()).not.toContain(bad.toLowerCase());
      }
    });
  }
});
