import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE AUDIT METADATA CONTRACT IS THE RULE, NOT A COMMENT.
 *
 * `writeAppointmentAudit` has said "IDs, status and ISO timestamps only — never
 * patient PII (names, contacts, clinical notes)" since it was written.
 * `cancelAppointment` wrote `reason: reason?.trim() || null` into it the whole
 * time, and the agenda drawer passes `form.notes` — THE APPOINTMENT'S OWN NOTES
 * FIELD, pre-filled from the row — as that argument. So a clinical note about a
 * named patient was copied verbatim into `audit_log` on every cancel taken from
 * the agenda, into a table that is append-only and retained for ever.
 *
 * `clinical/records.ts` had the identical decision at `annulRecord` and took the
 * other branch: `metadata: { hadReason: Boolean(trimmed) }`, with the prose in
 * `record_annulments.reason`, a real domain column. This suite makes scheduling
 * match, and — the half that matters next month — makes the CONTRACT refuse,
 * so the next caller does not have to remember.
 *
 * THREE ARMS, and the third is the one that survives a new action being written:
 *   1. the guard, directly, on the shapes it must accept and refuse;
 *   2. the cancel path, behaviourally, through the real action;
 *   3. the source, so a future `metadata: { ... }` in this file that hands a
 *      raw argument through cannot pass unnoticed.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("@osteojp/auth", () => ({
  assertCan: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./analytics", () => ({ writeAppointmentStatusChangedEvent: vi.fn(async () => {}) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: vi.fn(async () => {}),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("./conflict", () => ({
  findConflicts: vi.fn(async () => []),
  findConflictsForWindow: vi.fn(async () => []),
  blockingConflicts: (c: unknown[]) => c,
}));
vi.mock("@/lib/notifications/centre", () => ({
  emitConfirmedNotification: vi.fn(async () => ({ delivered: true })),
  emitCancelledNotification: vi.fn(async () => ({ delivered: true })),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { assertPiiFreeAuditMetadata, AuditMetadataError } from "@/lib/audit/metadata-contract";
import { cancelAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";
import type { AppointmentStatusValue } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);

const actor: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "user-1" };

/** THE STRING THE OLD CODE PUT IN THE LOG. Prose, about a patient, in pt-PT. */
const CLINICAL_NOTE = "Dores lombares desde segunda, pediu para remarcar para a proxima semana";

let seriesRow = {
  id: "appt-1",
  startsAt: new Date("2026-09-01T09:00:00.000Z"),
  endsAt: new Date("2026-09-01T10:00:00.000Z"),
  practitionerId: "therapist-1",
  locationId: "loc-1",
  room: null as string | null,
  status: "confirmed" as AppointmentStatusValue,
  recurrenceParentId: null,
};

/** Every row this fake tx is asked to insert, so the assertion can read the
 *  AUDIT ROW ITSELF rather than a mock of the helper that writes it. Mocking
 *  `./audit` here would mock away the very guard under test. */
let inserted: Array<Record<string, unknown>>;

function fakeTx() {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    then: (resolve: (rows: unknown[]) => unknown) => resolve([]),
    limit: async () => [seriesRow],
  };
  return {
    execute: async () => [],
    select: () => chain,
    update: () => ({ set: () => ({ where: async () => [] }) }),
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        inserted.push(v);
        return [];
      },
    }),
  };
}

/** The metadata of the first audit row actually inserted. */
const meta = () =>
  inserted.find((r) => typeof r.action === "string" && String(r.action).startsWith("appointment."))
    ?.metadata as Record<string, unknown> | undefined;

beforeEach(() => {
  inserted = [];
  seriesRow = { ...seriesRow, status: "confirmed" };
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
});

// ====================================================================
// 1. THE GUARD, DIRECTLY.
// ====================================================================
describe("assertPiiFreeAuditMetadata accepts what the callers actually write", () => {
  it("passes the five real metadata shapes in this module", () => {
    // Copied from the create / clone / update / reschedule / hard_delete call
    // sites. If a future edit makes one of these fail, the guard is wrong, not
    // the caller — and this arm says so before production does.
    const real = [
      {
        patientId: "0f8f6a9e-6f31-4e0a-9a5c-2d1c3b4a5e6f",
        practitionerId: "9d1c2b3a-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
        locationId: "11111111-2222-3333-4444-555555555555",
        serviceId: null,
        packId: null,
        status: "scheduled",
        startsAt: "2026-09-01T09:00:00.000Z",
        seriesId: null,
        occurrence: 3,
        count: 12,
        allowConflict: false,
      },
      { changed: ["notes", "status", "room"], scope: "series", allowConflict: true },
      { changed: ["status"], scope: "one", from_status: "scheduled", to_status: "confirmed", via: "portal_request_confirm" },
      { practitionerId: "9d1c2b3a-4e5f-6a7b-8c9d-0e1f2a3b4c5d", startsAt: "2026-09-01T09:00:00.000Z", endsAt: "2026-09-01T10:00:00.000Z", scope: "one", allowConflict: false },
      { hadReason: true, reasonRef: { entityType: "appointment", entityId: "appt-1" }, scope: "one", fromStatus: "confirmed", toStatus: "cancelled" },
    ];
    for (const m of real) expect(() => assertPiiFreeAuditMetadata(m, "test")).not.toThrow();
  });

  it("accepts an empty metadata object", () => {
    expect(() => assertPiiFreeAuditMetadata({}, "test")).not.toThrow();
  });
});

describe("assertPiiFreeAuditMetadata refuses free text", () => {
  it("refuses the exact string the old cancel path wrote", () => {
    expect(() => assertPiiFreeAuditMetadata({ reason: CLINICAL_NOTE }, "test")).toThrow(AuditMetadataError);
  });

  it("refuses a SHORT string that still contains a space — two words is already prose", () => {
    // The length rule alone would let "Maria Silva" through, and a patient name
    // is the PII this contract names first.
    expect(() => assertPiiFreeAuditMetadata({ reason: "Maria Silva" }, "test")).toThrow(AuditMetadataError);
  });

  it("refuses a long string with no whitespace — a pasted identifier document, say", () => {
    expect(() => assertPiiFreeAuditMetadata({ note: "x".repeat(65) }, "test")).toThrow(AuditMetadataError);
  });

  it("refuses prose NESTED in an object, not only at the top level", () => {
    expect(() =>
      assertPiiFreeAuditMetadata({ reasonRef: { entityType: "appointment", why: CLINICAL_NOTE } }, "test"),
    ).toThrow(AuditMetadataError);
  });

  it("refuses prose inside an ARRAY — `changed` is a list and a list can carry values", () => {
    expect(() => assertPiiFreeAuditMetadata({ changed: ["status", CLINICAL_NOTE] }, "test")).toThrow(
      AuditMetadataError,
    );
  });

  // THE MESSAGE IS EVIDENCE THAT TRAVELS. It reaches logs and Sentry, so a
  // message that quoted the offending value to explain itself would put the PII
  // in two more places than it started in.
  it("names the key and NEVER quotes the value", () => {
    let msg = "";
    try {
      assertPiiFreeAuditMetadata({ reason: CLINICAL_NOTE }, "test");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("reason");
    expect(msg).not.toContain(CLINICAL_NOTE);
    expect(msg).not.toContain("Dores");
  });

  it("names the PATH of a nested offender, so the caller knows which key to fix", () => {
    let msg = "";
    try {
      assertPiiFreeAuditMetadata({ ref: { why: CLINICAL_NOTE } }, "test");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("ref.why");
  });
});

// ====================================================================
// 2. THE CANCEL PATH, BEHAVIOURALLY, THROUGH THE REAL ACTION AND THE REAL
//    HELPER. Nothing here mocks `./audit`.
// ====================================================================
describe("cancelAppointment records a boolean and a reference, never the text", () => {
  it("with a reason: hadReason true, a reference, and the prose NOWHERE in the row", async () => {
    const r = await cancelAppointment("appt-1", CLINICAL_NOTE);
    expect(r.ok).toBe(true);

    const m = meta();
    expect(m).toBeDefined();
    expect(m).toHaveProperty("hadReason", true);
    expect(m).toMatchObject({ reasonRef: { entityType: "appointment", entityId: "appt-1" } });

    // THE ASSERTION THAT WOULD HAVE CAUGHT THIS ON DAY ONE: not "the `reason`
    // key is gone" — a rename would pass that — but the TEXT is absent from the
    // serialised row, wherever anyone put it.
    expect(JSON.stringify(m)).not.toContain(CLINICAL_NOTE);
    expect(JSON.stringify(m)).not.toContain("Dores");
    expect(m).not.toHaveProperty("reason");
  });

  it("with no reason: hadReason false EXPLICITLY, and a null reference", async () => {
    // Written even when false, for the reason SEC-allowconflict-not-audited
    // already established next door: a field present only when true is exactly
    // as unreadable as one never written.
    await cancelAppointment("appt-1");
    expect(meta()).toHaveProperty("hadReason", false);
    expect(Object.keys(meta()!)).toContain("hadReason");
    expect(meta()).toHaveProperty("reasonRef", null);
  });

  it("with whitespace only: that is NOT a reason", async () => {
    await cancelAppointment("appt-1", "   ");
    expect(meta()).toHaveProperty("hadReason", false);
  });

  it("still records both ends of the transition — this change takes nothing away", async () => {
    await cancelAppointment("appt-1", CLINICAL_NOTE);
    expect(meta()).toMatchObject({ fromStatus: "confirmed", toStatus: "cancelled", scope: "one" });
  });
});

// ====================================================================
// 3. THE SOURCE ARM. The two above cover the paths that exist today. This one
//    covers the path somebody writes next month.
// ====================================================================
describe("the source keeps the contract", () => {
  const ACTIONS = readFileSync(join(__dirname, "actions.ts"), "utf8");
  const AUDIT = readFileSync(join(__dirname, "audit.ts"), "utf8");

  it("the guard is invoked by the helper, not merely exported beside it", () => {
    // A guard nobody calls is the vacuous-pass shape criterion F names: it
    // proves a function exists, never that anything runs it.
    expect(AUDIT).toMatch(/assertPiiFreeAuditMetadata\(args\.metadata, "scheduling/);
  });

  it("no appointment audit metadata hands a raw `reason` through again", () => {
    const body = ACTIONS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // The exact shape that was there, and the near misses a rename would reach
    // for. `hadReason` and `reasonRef` are the permitted names and are excluded
    // by the word boundary on `reason`.
    expect(body).not.toMatch(/\breason:\s*reason/);
    expect(body).not.toMatch(/\breason:\s*[A-Za-z_$][\w$]*\?\.trim/);
    expect(body).not.toMatch(/\breason:\s*trimmed/);
  });

  it("found the cancel metadata block it is asserting over", () => {
    // Vacuous-pass guard: the three negative assertions above would all pass
    // over a file that no longer contains the cancel path at all.
    expect(ACTIONS).toMatch(/action: "appointment\.cancel"/);
    expect(ACTIONS).toMatch(/hadReason,/);
  });
});
