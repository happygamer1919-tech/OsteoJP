/**
 * GUEST-06 — converting a guest booking request, and the four things the server
 * refuses to do while converting it.
 *
 * ============================================================================
 * WHY THESE DRIVE THE ACTION AND NOT THE QUEUE COMPONENT
 * ============================================================================
 * The queue asks before it converts a flagged row. That is the COURTESY half,
 * and STAFF-02's test file states the standing reason it cannot be the tested
 * half: "a restricted dropdown is defeated by a stale tab, a second window, or
 * any request that did not come from the form." Every refusal below is asserted
 * against `convertGuestRequest` with an input the form would never send.
 *
 * ============================================================================
 * EVERY REFUSAL ALSO ASSERTS THAT NOTHING WAS WRITTEN
 * ============================================================================
 * `H.inserted` and `H.updated` record whether the patient insert and the request
 * update actually reached the database. An error code alone would not
 * distinguish "refused" from "wrote the row and then returned an error", and the
 * expensive half of a mis-link is the row, not the message. ACC-vacuous-guard
 * criterion F: a guard proves the test RAN; only the assertion proves it tested
 * the right subject.
 *
 * `isLocationBookable` IS THE REAL FUNCTION, deliberately unmocked. Only the
 * assignment SET is controlled. Mocking the predicate would have left these
 * tests asserting that a mock returns what it was told to.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const REQUEST_ID = "gbr-1";
const LV = "loc-lv";
const CB = "loc-cb";
const SERVICE = "svc-fisio";

const H = vi.hoisted(() => ({
  role: "reception" as "reception" | "admin" | "therapist" | "owner",
  /** The actor's bookable locations. `null` = unrestricted. */
  scope: null as string[] | null,
  /** Rows the fake transaction hands back, in the order they are asked for. */
  script: [] as unknown[][],
  /** Set when insertPatientTx actually ran. */
  inserted: false,
  /** Set when the guest_booking_requests UPDATE actually ran. */
  updated: false,
  /**
   * EVERY PAYLOAD HANDED TO `.set()`, because option B is defined by a column
   * this action must STOP writing. "Did not move the status" is not observable
   * from an error code or from `updated`; it is only observable from the object
   * itself, so the harness keeps it.
   */
  sets: [] as Record<string, unknown>[],
  /** Audit entries written. */
  audits: [] as { action: string; entityId: string; metadata?: unknown }[],
  /** 0101: the fields the patient insert was handed, so "a new patient gets the email" is observable. */
  insertFields: null as Record<string, unknown> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: async () => ({
    role: H.role,
    userId: "u-carlos",
    tenantId: "t-1",
  }),
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => unknown) => {
    let i = 0;
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      orderBy: () => chain,
      update: () => chain,
      set: (payload: Record<string, unknown>) => {
        H.sets.push(payload);
        return chain;
      },
      returning: () => {
        H.updated = true;
        return chain;
      },
      // The chain is THENABLE, which is what lets one fake stand in for both a
      // `.where(...)` that terminates and a `.where(...).limit(1)` that does not.
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(H.script[i++] ?? []).then(res, rej),
    });
    return fn(chain);
  },
}));

vi.mock("@/lib/auth/viewer-locations", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/viewer-locations")>();
  return {
    // The REAL predicate. Only the scope it is asked about is controlled.
    isLocationBookable: real.isLocationBookable,
    bookingLocationScope: async () => H.scope,
  };
});

vi.mock("@/lib/patients/insert", () => ({
  insertPatientTx: async (_tx: unknown, _ctx: unknown, fields: Record<string, unknown>) => {
    H.inserted = true;
    H.insertFields = fields;
    return { id: "p-new" };
  },
}));

vi.mock("@/lib/patients/audit", () => ({
  writeAudit: async (_tx: unknown, _ctx: unknown, entry: Record<string, unknown>) => {
    H.audits.push(entry as { action: string; entityId: string });
  },
}));

import { convertGuestRequest, dismissGuestRequest, listGuestRequestMatches } from "./guest-convert";

/** A pending request at LV, as the queue would be showing it. */
function pendingRequest(over: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    status: "pending",
    // BOTH NULL, AND SPELLED OUT RATHER THAN OMITTED. The guards compare
    // STRICTLY against null, so a fixture that left these undefined would refuse
    // every convert - and it would refuse it for a reason that cannot happen
    // against a real row, where a NULL column comes back as null. Strict is the
    // right comparison here because the unknown case then fails CLOSED.
    convertedPatientId: null,
    handledAt: null,
    fullName: "Maria Silva",
    phone: "912345678",
    phoneE164: "+351912345678",
    serviceId: SERVICE,
    locationId: LV,
    // 21/08/2026, the "tarde" encoding: 13:00-19:00 Lisbon.
    requestedStartsAt: new Date("2026-08-21T12:00:00.000Z"),
    ...over,
  };
}

beforeEach(() => {
  H.role = "reception";
  H.scope = null;
  H.script = [];
  H.inserted = false;
  H.updated = false;
  H.sets = [];
  H.audits = [];
  H.insertFields = null;
});

describe("the happy path, so every refusal below is a refusal and not a broken fixture", () => {
  it("creates the patient, marks the request handled, and returns the booking prefill", async () => {
    H.script = [[pendingRequest()], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.patientId).toBe("p-new");
    expect(H.inserted, "the patient must actually be inserted").toBe(true);
    expect(H.updated, "the request must actually be written to").toBe(true);
    // The prefill is the whole point of the action: it is what carries the guest
    // request into the ordinary staff booking path.
    expect(result.data.prefill.serviceId).toBe(SERVICE);
    expect(result.data.prefill.locationId).toBe(LV);
    // THE DATE, IN LISBON, AND NOT THE TIME. 12:00Z is 13:00 Lisbon in August;
    // the assertion is on the calendar day the guest asked for.
    expect(result.data.prefill.date).toBe("2026-08-21");
  });

  it("writes an audit row naming the branch taken, with no name or number in it", async () => {
    H.script = [[pendingRequest()], [{ id: REQUEST_ID }]];

    await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });

    expect(H.audits).toHaveLength(1);
    expect(H.audits[0]!.action).toBe("patient.guest_request_converted");
    expect(H.audits[0]!.entityId).toBe("p-new");
    // Hard rule 7: ids, counts and field NAMES only. A serialised audit row that
    // contained the caller's name or number would be PII in the audit log.
    const serialised = JSON.stringify(H.audits[0]);
    expect(serialised).not.toContain("Maria");
    expect(serialised).not.toContain("912345678");
  });

  it("attaches an EXISTING patient when reception says it is one, and creates nobody", async () => {
    H.script = [[pendingRequest()], [{ id: "p-existing" }], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, {
      kind: "existing_patient",
      patientId: "p-existing",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.patientId).toBe("p-existing");
    // The point of the arm: no second record for a person who already has one.
    expect(H.inserted, "an existing-patient convert must NOT create a patient").toBe(false);
    expect(H.updated).toBe(true);
  });
});

describe("the role gate — convert is front-desk work", () => {
  it.each(["owner", "admin", "reception"] as const)("permits %s", async (role) => {
    H.role = role;
    H.script = [[pendingRequest()], [{ id: REQUEST_ID }]];
    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });
    expect(result.ok).toBe(true);
  });

  it("REFUSES a therapist, and writes nothing", async () => {
    // A therapist holds patients:write and appointments:write like everybody
    // else, so a capability gate would have permitted this. The refusal is the
    // role check in `isFrontDesk`.
    H.role = "therapist";
    H.script = [[pendingRequest()], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(H.inserted).toBe(false);
    expect(H.updated).toBe(false);
  });

  it("REFUSES a therapist the match list too", async () => {
    H.role = "therapist";
    H.script = [[pendingRequest()], []];
    const result = await listGuestRequestMatches(REQUEST_ID);
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("STAFF-02 — the location scope, on the convert as on the booking", () => {
  it("REFUSES an LV-only receptionist converting a CB request, and writes nothing", async () => {
    H.scope = [LV];
    H.script = [[pendingRequest({ locationId: CB })], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });

    expect(result).toEqual({ ok: false, error: "location_not_assigned" });
    expect(H.inserted, "no patient may be created for a clinic out of scope").toBe(false);
    expect(H.updated).toBe(false);
  });

  it("permits the same receptionist converting an LV request", async () => {
    // The counterweight. Without it the refusal above would pass just as well
    // against a convert that refused EVERYTHING.
    H.scope = [LV];
    H.script = [[pendingRequest({ locationId: LV })], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });

    expect(result.ok).toBe(true);
    expect(H.inserted).toBe(true);
  });

  it("REFUSES the match list for an out-of-scope request", async () => {
    // Otherwise an out-of-scope receptionist could not convert but could still
    // read another clinic's patient names off the resolution dialog.
    H.scope = [LV];
    H.script = [[pendingRequest({ locationId: CB })], []];

    const result = await listGuestRequestMatches(REQUEST_ID);

    expect(result).toEqual({ ok: false, error: "location_not_assigned" });
  });
});

describe("flag-never-link — the server derives the match set and refuses everything else", () => {
  it("REFUSES an existing_patient whose id is not in this number's match set", async () => {
    // THE CENTRAL REFUSAL OF THIS CARD. The browser can name any patient id;
    // the server re-derives the set and this one is not in it, so the select
    // returns no row.
    H.script = [[pendingRequest()], [], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, {
      kind: "existing_patient",
      patientId: "p-somebody-else",
    });

    expect(result).toEqual({ ok: false, error: "match_not_found" });
    expect(H.inserted).toBe(false);
    expect(H.updated, "an unmatched link must not mark the request handled").toBe(false);
  });

  it("REFUSES an existing_patient when the request's number never normalised", async () => {
    // phone_e164 is GENERATED ALWAYS and null for a number the expression cannot
    // parse. There is no match set at all, so there is nothing to link to — and
    // `NULL = NULL` would have answered "no rows" for a reason nobody chose.
    H.script = [[pendingRequest({ phoneE164: null })], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, {
      kind: "existing_patient",
      patientId: "p-existing",
    });

    expect(result).toEqual({ ok: false, error: "match_not_found" });
    expect(H.updated).toBe(false);
  });

  it("returns an EMPTY match list for an unnormalised number rather than failing", async () => {
    // The read side of the same case. Reception is offered "create new" only,
    // which is the honest set of options.
    H.script = [[pendingRequest({ phoneE164: null })]];

    const result = await listGuestRequestMatches(REQUEST_ID);

    expect(result).toEqual({ ok: true, data: [] });
  });

  it("STILL permits new_patient when the number matches — households share one", async () => {
    // Not a hole. A mother booking for her son is not a duplicate, and refusing
    // this would send reception to create the record by hand with the request
    // no longer attached to it. What the dialog removes is reaching this arm
    // WITHOUT having been shown the alternatives.
    H.script = [[pendingRequest()], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });

    expect(result.ok).toBe(true);
    expect(H.inserted).toBe(true);
  });
});

describe("the resolution is REQUIRED — there is no arm that decides for the caller", () => {
  it.each([
    ["omitted", undefined],
    ["null", null],
    ["an unknown kind", { kind: "auto" }],
    ["existing_patient with no id", { kind: "existing_patient" }],
  ])("REFUSES %s with validation, and writes nothing", async (_label, resolution) => {
    H.script = [[pendingRequest()], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(
      REQUEST_ID,
      resolution as never,
    );

    expect(result).toEqual({ ok: false, error: "validation" });
    expect(H.inserted).toBe(false);
    expect(H.updated).toBe(false);
  });
});

describe("a request that is no longer pending", () => {
  it("REFUSES an already-confirmed request with already_handled", async () => {
    H.script = [[pendingRequest({ status: "confirmed" })], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });

    expect(result).toEqual({ ok: false, error: "already_handled" });
    expect(H.inserted).toBe(false);
    expect(H.updated).toBe(false);
  });

  it("REFUSES a declined request too", async () => {
    H.script = [[pendingRequest({ status: "declined" })], [{ id: REQUEST_ID }]];
    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });
    expect(result).toEqual({ ok: false, error: "already_handled" });
  });

  it("REFUSES an unknown id with not_found", async () => {
    H.script = [[]];
    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });
    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(H.inserted).toBe(false);
  });

  it("REFUSES an empty request id before it reaches the database", async () => {
    const result = await convertGuestRequest("", { kind: "new_patient" });
    expect(result).toEqual({ ok: false, error: "validation" });
  });

  it("loses the RACE cleanly when another receptionist converts first", async () => {
    // The conditional UPDATE matched no row: somebody else moved the status
    // between this transaction's SELECT and its UPDATE. The patient insert is
    // rolled back with it, so the loser leaves nothing behind.
    H.script = [[pendingRequest()], []];

    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });

    expect(result).toEqual({ ok: false, error: "already_handled" });
  });
});

/**
 * LE-guest-convert-abandoned-booking — OPTION B, ruled by the owner 2026-09-06.
 *
 * The convert used to write `status = 'confirmed'`, which took the row out of a
 * queue that reads `status = 'pending'` before anybody had booked anything. The
 * request now STAYS PENDING and reception clears it with a separate dismiss.
 *
 * WHAT MAKES THESE ASSERTIONS RATHER THAN RESTATEMENTS: the first one reads the
 * payload handed to `.set()`, so it fails if a later edit reinstates the status
 * write, which no error code and no `updated` flag would notice.
 */
describe("option B — the convert leaves the request in the queue", () => {
  it("writes converted_patient_id and does NOT touch status, handled_at or handled_by", async () => {
    H.script = [[pendingRequest()], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });

    expect(result.ok).toBe(true);
    expect(H.sets).toHaveLength(1);
    expect(H.sets[0]).toEqual({ convertedPatientId: "p-new" });
    // Spelled out as well as compared whole, so a failure names the column.
    expect(Object.keys(H.sets[0]!)).not.toContain("status");
    expect(Object.keys(H.sets[0]!)).not.toContain("handledAt");
    expect(Object.keys(H.sets[0]!)).not.toContain("handledBy");
  });

  it("REFUSES a second convert on a row somebody already converted, and creates nobody", async () => {
    // THE GUARD THAT REPLACED THE STATUS ONE. With the status no longer moving,
    // `status = 'pending'` alone would let a second press create a SECOND
    // patient for one request - the duplicate this whole flow exists to avoid.
    H.script = [[pendingRequest({ convertedPatientId: "p-already" })], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });

    expect(result).toEqual({ ok: false, error: "already_handled" });
    expect(H.inserted).toBe(false);
    expect(H.updated).toBe(false);
  });

  it("REFUSES a convert on a row somebody dismissed, and creates nobody", async () => {
    H.script = [[pendingRequest({ handledAt: new Date() })], [{ id: REQUEST_ID }]];

    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });

    expect(result).toEqual({ ok: false, error: "already_handled" });
    expect(H.inserted).toBe(false);
    expect(H.updated).toBe(false);
  });
});

/**
 * THE DISMISS. "A dismiss on the queue row, not a status change on the request"
 * — the owner's words, and the first test is the one that holds him to them.
 */
describe("option B — the dismiss", () => {
  it("stamps handled_at and handled_by, and touches NOTHING else", async () => {
    H.script = [[pendingRequest({ convertedPatientId: "p-1" })], [{ id: REQUEST_ID }]];

    const result = await dismissGuestRequest(REQUEST_ID);

    expect(result).toEqual({ ok: true });
    expect(H.sets).toHaveLength(1);
    expect(Object.keys(H.sets[0]!).sort()).toEqual(["handledAt", "handledBy"]);
    expect(H.sets[0]!.handledBy).toBe("u-carlos");
    // The status stays `pending` for ever, which is the truth: this request
    // never became a booking, and `confirmed` would say it had.
    expect(Object.keys(H.sets[0]!)).not.toContain("status");
  });

  it("REFUSES a request nobody converted, so the queue cannot be emptied by hiding rows", async () => {
    H.script = [[pendingRequest()], [{ id: REQUEST_ID }]];

    const result = await dismissGuestRequest(REQUEST_ID);

    expect(result).toEqual({ ok: false, error: "not_converted" });
    expect(H.updated).toBe(false);
    expect(H.sets).toHaveLength(0);
  });

  it("REFUSES a clinic outside the actor's assignment, and says THAT rather than the state", async () => {
    // STAFF-02 applies to the back half of the convert too. The order matters:
    // a receptionist who may not read this request must be told they may not,
    // not told whether somebody has converted it.
    H.scope = [CB];
    H.script = [[pendingRequest({ convertedPatientId: "p-1" })], [{ id: REQUEST_ID }]];

    const result = await dismissGuestRequest(REQUEST_ID);

    expect(result).toEqual({ ok: false, error: "location_not_assigned" });
    expect(H.updated).toBe(false);
  });

  it("REFUSES an already-dismissed row with already_handled", async () => {
    H.script = [[pendingRequest({ convertedPatientId: "p-1", handledAt: new Date() })]];

    const result = await dismissGuestRequest(REQUEST_ID);

    expect(result).toEqual({ ok: false, error: "already_handled" });
    expect(H.updated).toBe(false);
  });

  it("loses the RACE cleanly when another receptionist dismisses first", async () => {
    // The conditional UPDATE matched no row: `handled_at` was written between
    // this SELECT and this UPDATE.
    H.script = [[pendingRequest({ convertedPatientId: "p-1" })], []];

    const result = await dismissGuestRequest(REQUEST_ID);

    expect(result).toEqual({ ok: false, error: "already_handled" });
  });

  it("REFUSES a therapist, who may not work the front desk", async () => {
    H.role = "therapist";
    const result = await dismissGuestRequest(REQUEST_ID);
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(H.updated).toBe(false);
  });

  it("writes an audit row against the PATIENT, with no name or number in it", async () => {
    H.script = [[pendingRequest({ convertedPatientId: "p-1" })], [{ id: REQUEST_ID }]];

    await dismissGuestRequest(REQUEST_ID);

    expect(H.audits).toHaveLength(1);
    expect(H.audits[0]!.action).toBe("patient.guest_request_dismissed");
    expect(H.audits[0]!.entityId).toBe("p-1");
    const serialised = JSON.stringify(H.audits[0]);
    expect(serialised).not.toContain("Maria");
    expect(serialised).not.toContain("912345678");
  });
});

/**
 * 0101, strategy ruling R40 - the email a visitor gave on the public form.
 *
 * THE RULE (the lead's decision of 2026-10-05, after review): ONLY A NEW PATIENT
 * gets it. The convert NEVER writes the form's address to an EXISTING patient's
 * record, whether that record has an address or not: the form is public and the
 * address unverified, so filling an empty record from it would let whoever
 * posted the form with somebody else's mobile take over that person's
 * confirmations and reminders. What the row looks like afterwards is proven
 * against Postgres in guest-convert-email.db.test.ts and followed through the
 * booking and the dispatch in guest-link.db.test.ts. This file proves what a
 * database cannot: what the action attempts, and what it never writes down.
 */
describe("R40: the guest's email on convert", () => {
  const ADDRESS = "guest.fixture@example.invalid";

  it("a NEW patient is inserted WITH the guest's email", async () => {
    H.script = [[pendingRequest({ email: ADDRESS })], [{ id: REQUEST_ID }]];
    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });
    expect(result.ok).toBe(true);
    expect(H.insertFields?.email).toBe(ADDRESS);
    // And no second write to patients: the insert carried it.
    expect(H.sets).toEqual([{ convertedPatientId: "p-new" }]);
  });

  it.each([null, undefined, "", "   ", "\t\n"])("a request with no email (%j) inserts the patient with email NULL: none means NULL or nothing after a trim", async (email) => {
    H.script = [[pendingRequest({ email })], [{ id: REQUEST_ID }]];
    const result = await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });
    expect(result.ok).toBe(true);
    expect(H.insertFields).toHaveProperty("email", null);
  });

  it("a padded address is carried TRIMMED to the new patient", async () => {
    H.script = [[pendingRequest({ email: `  ${ADDRESS}  ` })], [{ id: REQUEST_ID }]];
    await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });
    expect(H.insertFields?.email).toBe(ADDRESS);
  });

  it("AN EXISTING PATIENT IS NEVER WRITTEN TO: one update, of the REQUEST, and no patient.update audit", async () => {
    // Had the action tried a second update, the harness would have recorded its `.set()`.
    H.script = [[pendingRequest({ email: ADDRESS })], [{ id: "p-existing" }], [{ id: REQUEST_ID }], [{ id: "p-existing" }]];
    const result = await convertGuestRequest(REQUEST_ID, { kind: "existing_patient", patientId: "p-existing" });
    expect(result.ok).toBe(true);
    expect(H.inserted, "nobody is created").toBe(false);
    expect(H.sets).toEqual([{ convertedPatientId: "p-existing" }]);
    expect(H.sets.some((set) => "email" in set)).toBe(false);
    expect(H.audits.map((a) => a.action)).toEqual(["patient.guest_request_converted"]);
  });

  it("THE CONTROL for the arm above: the SAME request converted to a NEW patient does carry the address, so its absence there is the rule", async () => {
    H.script = [[pendingRequest({ email: ADDRESS })], [{ id: REQUEST_ID }]];
    await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });
    expect(H.insertFields?.email).toBe(ADDRESS);
  });

  it("an existing patient and a request with NO email: the same single update", async () => {
    H.script = [[pendingRequest({ email: null })], [{ id: "p-existing" }], [{ id: REQUEST_ID }]];
    const result = await convertGuestRequest(REQUEST_ID, { kind: "existing_patient", patientId: "p-existing" });
    expect(result.ok).toBe(true);
    expect(H.sets).toEqual([{ convertedPatientId: "p-existing" }]);
    expect(H.audits.map((a) => a.action)).toEqual(["patient.guest_request_converted"]);
  });

  it("THE MATCH LIST says, per patient, whether the form's address is NOT on the record, and never returns the patient's own address", async () => {
    H.script = [
      [pendingRequest({ email: ADDRESS })],
      [
        { id: "p-none", fullName: "A", nif: null, patientNumber: 1, email: null },
        { id: "p-blank", fullName: "B", nif: null, patientNumber: 2, email: "   " },
        { id: "p-other", fullName: "C", nif: null, patientNumber: 3, email: "held.fixture@example.invalid" },
        { id: "p-same", fullName: "D", nif: null, patientNumber: 4, email: " GUEST.fixture@example.invalid " },
      ],
    ];
    const result = await listGuestRequestMatches(REQUEST_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((m) => [m.id, m.formEmailNotOnRecord])).toEqual([
      ["p-none", true],
      ["p-blank", true],
      ["p-other", true],
      ["p-same", false],
    ]);
    for (const m of result.data) expect(Object.keys(m).sort()).toEqual(["formEmailNotOnRecord", "fullName", "id", "nif", "patientNumber"]);
    expect(JSON.stringify(result.data)).not.toContain("held.fixture");
  });

  it("a request with NO email flags nobody: there is nothing to warn about", async () => {
    H.script = [[pendingRequest({ email: null })], [{ id: "p-none", fullName: "A", nif: null, patientNumber: 1, email: null }]];
    const result = await listGuestRequestMatches(REQUEST_ID);
    expect(result).toEqual({ ok: true, data: [{ id: "p-none", fullName: "A", nif: null, patientNumber: 1, formEmailNotOnRecord: false }] });
  });

  it("THE ADDRESS IS NEVER IN AN AUDIT ROW OR A LOG LINE, on either branch", async () => {
    const lines: string[] = [];
    const spies = (["error", "warn", "info", "log"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      }),
    );
    try {
      H.script = [[pendingRequest({ email: ADDRESS })], [{ id: REQUEST_ID }]];
      await convertGuestRequest(REQUEST_ID, { kind: "new_patient" });
      H.script = [[pendingRequest({ email: ADDRESS })], [{ id: "p-existing" }], [{ id: REQUEST_ID }]];
      await convertGuestRequest(REQUEST_ID, { kind: "existing_patient", patientId: "p-existing" });
    } finally {
      for (const s of spies) s.mockRestore();
    }
    // THE PREMISE: audit rows were written, so the absence below is not of an empty list.
    expect(H.audits.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(H.audits)).not.toContain("example.invalid");
    expect(lines.join("\n")).not.toContain("example.invalid");
  });
});
