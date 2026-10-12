import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * REG-03: which check violation is the merge function's own refusal of one
 * patient as both sides, and what `mergePatients` answers for it and for any
 * other. The messages below are the ones the database raises:
 * `public.merge_patients` and the registo immutability trigger, both in
 * packages/db/migrations/0005_patient_merge_multilocation.sql, and PostgreSQL's
 * own for a CHECK constraint. The wrapped shape (Drizzle's error, the driver's
 * at `.cause`) and both real messages are pinned against the real driver in
 * merge-refusals.db.test.ts. No database here: the action's arms run on a mock
 * transaction whose one statement raises the error under test.
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

import { requireRequestContext, runScoped } from "../auth/context";
import type { RequestContext } from "../auth/context";
import { mergePatients } from "./actions";
import { isSelfMergeRefusal, SELF_MERGE_REFUSAL } from "./merge-refusal";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

/** The function's own refusal, as it writes it: the fixed start and the patient id. */
const SELF = `${SELF_MERGE_REFUSAL} (${A})`;
/** The registo immutability trigger's two refusals, the same SQLSTATE. */
const IMMUTABLE_UPDATE = `clinical_records ${B}: status=locked is finalized and immutable; create a new versioned record (addendum) instead`;
const IMMUTABLE_DELETE = `clinical_records ${B}: status=signed is finalized and immutable; cannot delete`;
/** PostgreSQL's own message for a CHECK constraint. */
const CHECK_CONSTRAINT = 'new row for relation "patients" violates check constraint "patients_some_check"';

const pgError = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(message), { code, ...extra });
/** The shape Drizzle raises: its own error, the driver's at `.cause`. */
const wrapped = (cause: unknown, message = "Failed query: select public.merge_patients($1, $2, $3)") =>
  new Error(message, { cause });

describe("isSelfMergeRefusal: the merge function's own refusal of one patient as both sides", () => {
  it("the driver's own error (the outer error carries the SQLSTATE and the message)", () => {
    expect(isSelfMergeRefusal(pgError("23514", SELF))).toBe(true);
  });

  it("wrapped once, as Drizzle raises it: the outer error carries no SQLSTATE, the cause carries both", () => {
    const e = wrapped(pgError("23514", SELF));
    expect((e as { code?: unknown }).code).toBeUndefined();
    expect(isSelfMergeRefusal(e)).toBe(true);
  });

  it("wrapped twice", () => {
    expect(isSelfMergeRefusal(wrapped(wrapped(pgError("23514", SELF))))).toBe(true);
  });

  it("the patient id the message ends with is not read", () => {
    expect(isSelfMergeRefusal(wrapped(pgError("23514", `${SELF_MERGE_REFUSAL} (${B})`)))).toBe(true);
    expect(isSelfMergeRefusal(wrapped(pgError("23514", SELF_MERGE_REFUSAL)))).toBe(true);
  });

  it("THE SAME SQLSTATE from the registo immutability trigger is not it, on update or on delete", () => {
    for (const message of [IMMUTABLE_UPDATE, IMMUTABLE_DELETE]) {
      expect(isSelfMergeRefusal(pgError("23514", message)), message).toBe(false);
      expect(isSelfMergeRefusal(wrapped(pgError("23514", message))), message).toBe(false);
    }
  });

  it("THE SAME SQLSTATE from a CHECK constraint is not it", () => {
    const e = pgError("23514", CHECK_CONSTRAINT, { constraint_name: "patients_some_check" });
    expect(isSelfMergeRefusal(e)).toBe(false);
    expect(isSelfMergeRefusal(wrapped(e))).toBe(false);
  });

  it("ANOTHER SQLSTATE carrying the function's message is not it", () => {
    for (const code of ["P0001", "P0002", "23503", "23505", "42501", "XX000"]) {
      expect(isSelfMergeRefusal(pgError(code, SELF)), code).toBe(false);
      expect(isSelfMergeRefusal(wrapped(pgError(code, SELF))), code).toBe(false);
    }
  });

  it("the message must BEGIN with the function's text: the same words later in another message are not it", () => {
    expect(isSelfMergeRefusal(wrapped(pgError("23514", `x ${SELF}`)))).toBe(false);
    expect(isSelfMergeRefusal(wrapped(pgError("23514", `${IMMUTABLE_UPDATE} ${SELF}`)))).toBe(false);
  });

  it("the SQLSTATE and the message are read on ONE layer: the function's text on the wrapper does not name another check violation", () => {
    expect(isSelfMergeRefusal(wrapped(pgError("23514", IMMUTABLE_UPDATE), SELF))).toBe(false);
    expect(isSelfMergeRefusal(wrapped(pgError("23514", CHECK_CONSTRAINT), SELF))).toBe(false);
  });

  it("decided on the FIRST layer that carries a check violation, never on a deeper one", () => {
    const e = Object.assign(new Error(IMMUTABLE_UPDATE, { cause: pgError("23514", SELF) }), { code: "23514" });
    expect(isSelfMergeRefusal(e)).toBe(false);
  });

  it("a check violation with no message, or one that is not text, is not it", () => {
    expect(isSelfMergeRefusal({ code: "23514" })).toBe(false);
    expect(isSelfMergeRefusal({ code: "23514", message: 23514 })).toBe(false);
    expect(isSelfMergeRefusal({ cause: { code: "23514", message: null } })).toBe(false);
  });

  it("an error with no SQLSTATE anywhere, and a value that is not an error, are not it", () => {
    expect(isSelfMergeRefusal(new Error(SELF))).toBe(false);
    expect(isSelfMergeRefusal(wrapped(new Error(SELF)))).toBe(false);
    for (const v of [null, undefined, SELF, 23514, {}, []]) expect(isSelfMergeRefusal(v)).toBe(false);
  });

  it("a cause that points at itself ends the walk", () => {
    const loop: { message: string; cause?: unknown } = { message: SELF };
    loop.cause = loop;
    expect(isSelfMergeRefusal(loop)).toBe(false);
  });

  it("the walk stops at four layers", () => {
    const four = wrapped(wrapped(wrapped(pgError("23514", SELF))));
    expect(isSelfMergeRefusal(four)).toBe(true);
    expect(isSelfMergeRefusal(wrapped(four))).toBe(false);
  });
});

describe("mergePatients: which check violation is the self-merge answer", () => {
  const mockCtx = vi.mocked(requireRequestContext);
  const mockRunScoped = vi.mocked(runScoped);
  const owner: RequestContext = { tenantId: "tenant-A", role: "owner", userId: "owner-1" };

  /** A transaction whose one statement, the call of the function, raises `failure`. */
  function refusing(failure: unknown) {
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
  const merge = () => mergePatients({ survivorId: A, loserId: B });

  beforeEach(() => {
    mockCtx.mockReset();
    mockRunScoped.mockReset();
    mockCtx.mockResolvedValue(owner);
  });

  it("the function's own refusal, wrapped as Drizzle raises it, is InvalidMergeError", async () => {
    const { select } = refusing(wrapped(pgError("23514", SELF)));
    await expect(merge()).rejects.toMatchObject({
      name: "InvalidMergeError",
      message: "Cannot merge a patient into itself",
    });
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
  });

  it("a check violation from the registo immutability trigger leaves the action as the error it is, never as InvalidMergeError", async () => {
    for (const message of [IMMUTABLE_UPDATE, IMMUTABLE_DELETE]) {
      const failure = wrapped(pgError("23514", message));
      const { select } = refusing(failure);
      const outcome = await merge().then(
        () => "resolved",
        (e: unknown) => e,
      );
      expect(outcome, message).toBe(failure);
      expect((outcome as Error).name).not.toBe("InvalidMergeError");
      expect(select).not.toHaveBeenCalled();
    }
  });

  it("a check violation from a CHECK constraint leaves the action as the error it is", async () => {
    const failure = wrapped(pgError("23514", CHECK_CONSTRAINT, { constraint_name: "patients_some_check" }));
    refusing(failure);
    await expect(merge()).rejects.toBe(failure);
  });

  it("CONTROL: the function's `no_data_found` is still the form's `not_found`, and any other error still throws", async () => {
    refusing(wrapped(pgError("P0002", `merge_patients: target patient ${A} not found in tenant ${B}`)));
    expect(await merge()).toEqual({ ok: false, error: "not_found" });

    const other = wrapped(pgError("40001", "could not serialize access"));
    refusing(other);
    await expect(merge()).rejects.toBe(other);
  });
});
