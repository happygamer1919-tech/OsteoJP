import { beforeEach, describe, expect, it, vi } from "vitest";

// M-4: a registo write that Postgres rolls back as a deadlock victim (SQLSTATE
// 40P01) is a NAMED refusal, `concurrent_change`, in the three writers a staff
// member saves a registo through: createDraftRecord (a new registo),
// updateRecordData (a draft's save) and createAddendum (a new version).
//
// The victim is chosen at whichever statement of the transaction was waiting,
// so the mapping sits around the whole transaction (`namingDeadlock`,
// records.ts). Each writer is therefore shown twice: with the transaction
// itself rejecting, and with its FIRST statement rejecting inside the
// callback. Either way: `concurrent_change`, no audit row, one log line with no
// identifier in it, and the transaction is opened once (nothing is retried).
//
// CONTROLS, per writer: a foreign-key violation (23503) and an error with no
// SQLSTATE reach the caller as the very error that was raised, and a
// ClinicalError raised inside the transaction keeps its own code.
//
// The error is built in the shape Drizzle raises (its own error, the driver's
// at `.cause`), and also with the SQLSTATE on the outer error, which the
// reader accepts too. The wrapped shape is pinned against a real deadlock on
// the real driver in deadlock-victim.db.test.ts.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));

import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit } from "./audit";
import { ClinicalError, isClinicalError } from "./errors";
import { createAddendum, createDraftRecord, updateRecordData } from "./records";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);

const TENANT = "11111111-1111-4111-8111-111111111111";
const THERAPIST_ID = "22222222-2222-4222-8222-222222222222";
const PATIENT = "44444444-4444-4444-8444-444444444444";
const RECORD = "55555555-5555-4555-8555-555555555555";
const TEMPLATE = "77777777-7777-4777-8777-777777777777";
const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: THERAPIST_ID };

const driverError = (code: string) => Object.assign(new Error("a driver message that is never read"), { code });
/** The shape Drizzle raises: its own error, the driver's at `.cause`. */
const wrapped = (cause: unknown) => new Error("Failed query: insert into clinical_records", { cause });

/** The three writers a staff member saves a registo through. */
const writers = [
  ["createDraftRecord", () => createDraftRecord(therapist, { patientId: PATIENT, formTemplateId: TEMPLATE })],
  ["updateRecordData", () => updateRecordData(therapist, RECORD, { notes: "x" })],
  ["createAddendum", () => createAddendum(therapist, RECORD)],
] as const;

/** Where the failure is raised: by the transaction itself, or by its first statement. */
const places = [
  ["the transaction rejects", (failure: unknown) => mockRunScoped.mockImplementation(() => Promise.reject(failure))],
  [
    "the first statement rejects inside the transaction",
    (failure: unknown) =>
      mockRunScoped.mockImplementation((_ctx, cb) =>
        Promise.resolve().then(() =>
          cb({
            select: () => {
              throw failure;
            },
          } as never),
        ),
      ),
  ],
] as const;

async function outcomeOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return isClinicalError(e) ? e.code : e;
  }
  return "resolved";
}

const quietly = async <T>(fn: (warn: ReturnType<typeof vi.spyOn>) => Promise<T>): Promise<T> => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    return await fn(warn);
  } finally {
    warn.mockRestore();
  }
};

beforeEach(() => {
  mockRunScoped.mockReset();
  mockAudit.mockClear();
});

describe("M-4: a registo write rolled back as a deadlock victim is concurrent_change", () => {
  for (const [name, call] of writers) {
    for (const [where, arrange] of places) {
      it(`${name}, ${where}: 40P01 wrapped as Drizzle raises it is concurrent_change; no audit row, nothing retried`, async () => {
        await quietly(async () => {
          arrange(wrapped(driverError("40P01")));
          expect(await outcomeOf(call())).toBe("concurrent_change");
          expect(mockAudit).not.toHaveBeenCalled();
          expect(mockRunScoped).toHaveBeenCalledTimes(1);
        });
      });

      it(`${name}, ${where}: 40P01 on the outer error is concurrent_change too`, async () => {
        await quietly(async () => {
          arrange(driverError("40P01"));
          expect(await outcomeOf(call())).toBe("concurrent_change");
          expect(mockRunScoped).toHaveBeenCalledTimes(1);
        });
      });

      it(`${name}, ${where} CONTROL: a foreign-key violation (23503) reaches the caller as it was raised`, async () => {
        const other = wrapped(driverError("23503"));
        arrange(other);
        expect(await outcomeOf(call())).toBe(other);
        expect(mockAudit).not.toHaveBeenCalled();
      });

      it(`${name}, ${where} CONTROL: an error with no SQLSTATE reaches the caller as it was raised`, async () => {
        const other = new Error("connection reset");
        arrange(other);
        expect(await outcomeOf(call())).toBe(other);
        const alsoWrapped = wrapped(new Error("deadlock detected"));
        arrange(alsoWrapped);
        expect(await outcomeOf(call())).toBe(alsoWrapped);
      });
    }

    it(`${name}: the refusal logs one line, and the line carries no identifier (rule 7)`, async () => {
      await quietly(async (warn) => {
        places[0][1](wrapped(driverError("40P01")));
        await outcomeOf(call());
        expect(warn).toHaveBeenCalledTimes(1);
        const line = String(warn.mock.calls[0]![0]);
        expect(line).toContain("concurrent_change");
        for (const id of [PATIENT, TENANT, THERAPIST_ID, RECORD, TEMPLATE]) expect(line).not.toContain(id);
      });
    });

    it(`${name} CONTROL: a ClinicalError raised inside the transaction keeps its own code, and logs nothing here`, async () => {
      await quietly(async (warn) => {
        places[0][1](new ClinicalError("not_found"));
        expect(await outcomeOf(call())).toBe("not_found");
        expect(warn).not.toHaveBeenCalled();
      });
    });

    it(`${name} CONTROL: a transaction that commits answers what it answered before`, async () => {
      const answer = { id: RECORD, episodeId: null, dataHash: "0123456789abcdef0123456789abcdef" };
      mockRunScoped.mockImplementation(() => Promise.resolve(answer as never));
      expect(await call()).toBe(answer);
    });
  }
});
