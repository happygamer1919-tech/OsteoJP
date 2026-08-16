import { vi, describe, it, expect } from "vitest";

vi.mock("server-only", () => ({}));
// The module reaches for the drizzle handle at CALL time, so importing it does
// not open a connection. These tests exercise the pure boundary conversion only.

import { machineStamp } from "./recording";
import { toRetryRow, type ConsultationRetryRow } from "./consultation-store";

// 0064 — the shape that crosses the Inngest step boundary, and the property that
// makes a retry's idempotency key identical to the first fire's.

const ROW = {
  id: "c-1",
  tenantId: "t-1",
  patientId: "p-1",
  doctorId: "d-1",
  audioObjectKey: "t-1/p-1/2026-08-16T09-00-00-000Z/consultation.webm",
  consultationStartedAt: new Date("2026-08-16T09:00:00.000Z"),
  consultationEndedAt: new Date("2026-08-16T09:42:00.000Z"),
  attemptCount: 2,
  lastAttemptAt: new Date("2026-08-16T10:05:00.000Z"),
};

describe("toRetryRow", () => {
  it("converts every Date to ISO text and keeps null as null", () => {
    expect(toRetryRow(ROW)).toEqual({
      id: "c-1",
      tenantId: "t-1",
      patientId: "p-1",
      doctorId: "d-1",
      audioObjectKey: "t-1/p-1/2026-08-16T09-00-00-000Z/consultation.webm",
      consultationStartedAt: "2026-08-16T09:00:00.000Z",
      consultationEndedAt: "2026-08-16T09:42:00.000Z",
      attemptCount: 2,
      lastAttemptAt: "2026-08-16T10:05:00.000Z",
    });
    expect(toRetryRow({ ...ROW, lastAttemptAt: null }).lastAttemptAt).toBeNull();
  });

  it("survives the JSON round trip that Inngest's step.run performs", () => {
    // step.run MEMOISES ITS RETURN VALUE AS JSON. A Date typed through that
    // boundary compiles fine and arrives as a string, and the first thing to
    // touch it (`lastAttemptAt.getTime()`) throws inside the scanner rather
    // than at the boundary. An all-scalar row cannot do that.
    const row: ConsultationRetryRow = toRetryRow(ROW);
    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
  });
});

describe("the retry's timestamps are byte-identical to the first fire's", () => {
  it("a machineStamp survives Date -> toISOString unchanged", () => {
    // THE PROPERTY THE WHOLE TABLE DEPENDS ON. The first fire sends the string
    // the recorder produced. A retry sends the value read back from the row and
    // re-formatted. The partner's idempotency key is derived from those strings
    // plus patient_id, so if the two forms differed by even a character the
    // retry would present a NEW key and their side would create a SECOND
    // clinical record. `machineStamp()` is `toISOString()`, so the canonical
    // form is the only form on this path — this pins that it stays so.
    const stamps = [
      machineStamp(new Date("2026-08-16T09:00:00.000Z")),
      machineStamp(new Date("2026-08-16T09:42:07.123Z")),
      machineStamp(new Date("2026-12-31T23:59:59.999Z")),
    ];
    for (const s of stamps) {
      expect(new Date(s).toISOString()).toBe(s);
    }
  });

  it("and the guard is not vacuous: a non-canonical ISO string does NOT round-trip", () => {
    // The trap this is protecting against, shown rather than described. Both of
    // these name the same instant as the first stamp above and are not the same
    // TEXT, so either would be a different idempotency key on the wire.
    for (const notCanonical of ["2026-08-16T09:00:00Z", "2026-08-16T10:00:00+01:00"]) {
      expect(new Date(notCanonical).toISOString()).not.toBe(notCanonical);
    }
  });
});
