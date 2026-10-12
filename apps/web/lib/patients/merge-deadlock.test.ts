import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M-4: a patient merge that Postgres rolls back as a deadlock victim (SQLSTATE
 * 40P01) is the form's `concurrent_change`: a value, as the merge's other
 * refusals are, so the danger zone shows the retry sentence instead of an
 * opaque digest. Nothing is merged and nothing is retried.
 *
 * The error is read where the transaction's error lands, so the arms raise it
 * both from the call of `public.merge_patients` and from the transaction
 * itself. It is built in the shape Drizzle raises (its own error, the driver's
 * at `.cause`), and with the SQLSTATE on the outer error, which the reader
 * accepts too. The wrapped shape is pinned against a real deadlock on the real
 * driver in lib/clinical/deadlock-victim.db.test.ts. No database here.
 *
 * CONTROLS: a foreign-key violation (23503), a serialization failure (40001,
 * the same class and another refusal) and an error with no SQLSTATE still
 * throw as the very error that was raised, and `no_data_found` is still
 * `not_found`.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("../auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("./audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/admin/appointment-delete-password", () => ({
  verifyDeletePassword: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { requireRequestContext, runScoped } from "../auth/context";
import type { RequestContext } from "../auth/context";
import { mergePatients } from "./actions";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const pgError = (code: string, message = "a driver message that is never read") =>
  Object.assign(new Error(message), { code });
const wrapped = (cause: unknown) => new Error("Failed query: select public.merge_patients($1, $2, $3)", { cause });

describe("mergePatients: rolled back as a deadlock victim is concurrent_change", () => {
  const mockCtx = vi.mocked(requireRequestContext);
  const mockRunScoped = vi.mocked(runScoped);
  const mockRevalidate = vi.mocked(revalidatePath);
  const owner: RequestContext = { tenantId: "tenant-A", role: "owner", userId: "owner-1" };

  /** A transaction whose one statement, the call of the function, raises `failure`. */
  function statementRaises(failure: unknown) {
    const select = vi.fn();
    const tx = {
      execute: async () => {
        throw failure;
      },
      select,
    };
    mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve().then(() => cb(tx as never)));
    return { select };
  }
  /** A transaction that itself rejects with `failure`, its callback never run. */
  function transactionRaises(failure: unknown) {
    mockRunScoped.mockImplementation(() => Promise.reject(failure));
  }
  const merge = () => mergePatients({ survivorId: A, loserId: B });
  const quietly = async <T>(fn: (warn: ReturnType<typeof vi.spyOn>) => Promise<T>): Promise<T> => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      return await fn(warn);
    } finally {
      warn.mockRestore();
    }
  };

  beforeEach(() => {
    mockCtx.mockReset();
    mockRunScoped.mockReset();
    mockRevalidate.mockClear();
    mockCtx.mockResolvedValue(owner);
  });

  it("40P01 from the function's call, wrapped as Drizzle raises it: concurrent_change, the survivor is not read, nothing retried", async () => {
    await quietly(async () => {
      const { select } = statementRaises(wrapped(pgError("40P01")));
      expect(await merge()).toEqual({ ok: false, error: "concurrent_change" });
      expect(select).not.toHaveBeenCalled();
      expect(mockRunScoped).toHaveBeenCalledTimes(1);
      // Nothing was merged, so neither patient's pages are refreshed.
      expect(mockRevalidate).not.toHaveBeenCalled();
    });
  });

  it("40P01 on the outer error is concurrent_change too", async () => {
    await quietly(async () => {
      statementRaises(pgError("40P01"));
      expect(await merge()).toEqual({ ok: false, error: "concurrent_change" });
    });
  });

  it("40P01 raised by the transaction itself is concurrent_change", async () => {
    await quietly(async () => {
      transactionRaises(wrapped(pgError("40P01")));
      expect(await merge()).toEqual({ ok: false, error: "concurrent_change" });
      expect(mockRunScoped).toHaveBeenCalledTimes(1);
    });
  });

  it("the refusal logs one line, and the line carries no identifier (rule 7)", async () => {
    await quietly(async (warn) => {
      statementRaises(wrapped(pgError("40P01", `Process 1 waits for ShareLock on transaction 2; tuple of ${A}`)));
      await merge();
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]![0]);
      expect(line).toContain("concurrent_change");
      for (const id of [A, B, owner.tenantId, owner.userId, "Process"]) expect(line).not.toContain(id);
    });
  });

  it("CONTROL: a foreign-key violation, a serialization failure and an error with no SQLSTATE still throw as they were raised", async () => {
    await quietly(async (warn) => {
      for (const failure of [
        wrapped(pgError("23503")),
        wrapped(pgError("40001", "could not serialize access")),
        new Error("connection reset"),
        wrapped(new Error("deadlock detected")),
      ]) {
        statementRaises(failure);
        await expect(merge()).rejects.toBe(failure);
        transactionRaises(failure);
        await expect(merge()).rejects.toBe(failure);
      }
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it("CONTROL: the function's `no_data_found` is still the form's `not_found`", async () => {
    statementRaises(wrapped(pgError("P0002", `merge_patients: target patient ${A} not found in tenant ${B}`)));
    expect(await merge()).toEqual({ ok: false, error: "not_found" });
  });
});
