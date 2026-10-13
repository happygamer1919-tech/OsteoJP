import { beforeEach, describe, expect, it, vi } from "vitest";

// M-4b: THE WRITERS THAT CHANGE ONE EXISTING REGISTO NAME THE DEADLOCK TOO.
//
// M-4 (records.deadlock.test.ts) made a deadlock victim (SQLSTATE 40P01) a
// NAMED refusal, `concurrent_change`, in the writers that file a registo and
// in the draft save. The six writers below only change a registo that exists,
// and answered a deadlock as any unknown error. They now carry the same
// mapping (`namingDeadlock`, records.ts), around their whole transaction:
//
//   records.ts  signAndLockRecord         (sign and lock a draft)
//               hardDeleteClinicalRecord  (delete a draft)
//               annulRecord               (annul a signed registo)
//   review.ts   editReviewNarrative       (the review's narrative save)
//               saveReviewFicha           (the review's ficha save)
//               finalizeReview            (the review's finalize)
//
// As in M-4's suite, each writer is shown twice: with the transaction itself
// rejecting, and with its FIRST statement rejecting inside the callback.
// Either way: `concurrent_change`, no audit row, one log line with no
// identifier in it, and the transaction is opened once (nothing is retried).
//
// CONTROLS, per writer: a foreign-key violation (23503) and an error with no
// SQLSTATE reach the caller as the very error that was raised, a ClinicalError
// raised inside the transaction keeps its own code, and a transaction that
// commits answers what it answered before.
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
import { annulRecord, hardDeleteClinicalRecord, signAndLockRecord } from "./records";
import { editReviewNarrative, finalizeReview, saveReviewFicha } from "./review";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);

const TENANT = "11111111-1111-4111-8111-111111111111";
const THERAPIST_ID = "22222222-2222-4222-8222-222222222222";
const RECORD = "55555555-5555-4555-8555-555555555555";
const TEMPLATE = "77777777-7777-4777-8777-777777777777";
const HASH = "0123456789abcdef0123456789abcdef";
const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: THERAPIST_ID };

const driverError = (code: string) => Object.assign(new Error("a driver message that is never read"), { code });
/** The shape Drizzle raises: its own error, the driver's at `.cause`. */
const wrapped = (cause: unknown) => new Error("Failed query: update clinical_records", { cause });

/**
 * The six writers that change one existing registo. `answers`: what the
 * writer hands back when its transaction commits with `{ dataHash }`: the two
 * saves hand the transaction's answer on, the other four answer nothing.
 */
const writers = [
  ["signAndLockRecord", () => signAndLockRecord(therapist, RECORD, HASH), false],
  ["hardDeleteClinicalRecord", () => hardDeleteClinicalRecord(therapist, RECORD), false],
  ["annulRecord", () => annulRecord(therapist, RECORD, null), false],
  ["editReviewNarrative", () => editReviewNarrative(therapist, RECORD, { notes: "x" }), true],
  ["saveReviewFicha", () => saveReviewFicha(therapist, RECORD, { notes: "x" }, null, TEMPLATE), true],
  ["finalizeReview", () => finalizeReview(therapist, RECORD, HASH), false],
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

describe("M-4b: a write to one existing registo rolled back as a deadlock victim is concurrent_change", () => {
  for (const [name, call, answers] of writers) {
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
        await quietly(async (warn) => {
          const other = wrapped(driverError("23503"));
          arrange(other);
          expect(await outcomeOf(call())).toBe(other);
          expect(mockAudit).not.toHaveBeenCalled();
          expect(mockRunScoped).toHaveBeenCalledTimes(1);
          expect(warn).not.toHaveBeenCalled();
        });
      });

      it(`${name}, ${where} CONTROL: an error with no SQLSTATE reaches the caller as it was raised`, async () => {
        await quietly(async (warn) => {
          const other = new Error("connection reset");
          arrange(other);
          expect(await outcomeOf(call())).toBe(other);
          const alsoWrapped = wrapped(new Error("deadlock detected"));
          arrange(alsoWrapped);
          expect(await outcomeOf(call())).toBe(alsoWrapped);
          expect(warn).not.toHaveBeenCalled();
        });
      });
    }

    it(`${name}: the refusal logs one line, and the line carries no identifier (rule 7)`, async () => {
      await quietly(async (warn) => {
        places[0][1](wrapped(driverError("40P01")));
        await outcomeOf(call());
        expect(warn).toHaveBeenCalledTimes(1);
        // The WHOLE call: one argument, a string. An error passed as a second
        // argument would carry the failed query and its parameters.
        expect(warn.mock.calls[0]).toHaveLength(1);
        expect(typeof warn.mock.calls[0]![0]).toBe("string");
        const line = warn.mock.calls[0]!.map(String).join(" ");
        expect(line).toContain("concurrent_change");
        for (const id of [TENANT, THERAPIST_ID, RECORD, TEMPLATE, HASH, "Failed query"]) {
          expect(line).not.toContain(id);
        }
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
      const answer = { dataHash: HASH };
      mockRunScoped.mockImplementation(() => Promise.resolve(answer as never));
      // The two saves hand the transaction's answer on; the others answer nothing.
      expect(await call()).toBe(answers ? answer : undefined);
      expect(mockRunScoped).toHaveBeenCalledTimes(1);
    });
  }
});
