import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { isForeignKeyViolation } from "./foreign-key-refusal";

/** A driver error as postgres.js raises it: the SQLSTATE is its own `code`. */
function driverError(code: string): Error {
  return Object.assign(new Error("driver error"), { code });
}

describe("isForeignKeyViolation", () => {
  it("is true for an error that carries 23503 itself", () => {
    expect(isForeignKeyViolation(driverError("23503"))).toBe(true);
  });

  it("finds 23503 at `.cause`, under a Drizzle error that carries no code", () => {
    const outer = new DrizzleQueryError("delete from t where id = $1", ["x"], driverError("23503"));
    expect("code" in outer).toBe(false);
    expect(isForeignKeyViolation(outer)).toBe(true);
  });

  it("walks more than one `cause`", () => {
    const inner = new DrizzleQueryError("delete from t", [], driverError("23503"));
    const outer = new Error("wrapped again", { cause: new Error("and again", { cause: inner }) });
    expect(isForeignKeyViolation(outer)).toBe(true);
  });

  it("is false for another SQLSTATE, on the error or at its cause", () => {
    for (const code of ["23505", "23514", "23502", "23P01", "42501", "P0002", "40001"]) {
      expect(isForeignKeyViolation(driverError(code)), code).toBe(false);
      expect(
        isForeignKeyViolation(new DrizzleQueryError("delete from t", [], driverError(code))),
        `${code} at cause`,
      ).toBe(false);
    }
  });

  it("the first layer that carries a code answers: a wrapper's own SQLSTATE is not looked behind", () => {
    const wrapped = Object.assign(new Error("outer", { cause: driverError("23503") }), {
      code: "40001",
    });
    expect(isForeignKeyViolation(wrapped)).toBe(false);
  });

  it("is false for an error with no code anywhere", () => {
    expect(isForeignKeyViolation(new Error("db down"))).toBe(false);
    expect(isForeignKeyViolation(new Error("outer", { cause: new Error("inner") }))).toBe(false);
  });

  it("is false for a non-string code, and never stringifies one", () => {
    expect(isForeignKeyViolation(Object.assign(new Error("x"), { code: 23503 }))).toBe(false);
    expect(
      isForeignKeyViolation(Object.assign(new Error("x"), { code: { toString: () => "23503" } })),
    ).toBe(false);
  });

  it("is false for a non-object, including null and the bare string", () => {
    expect(isForeignKeyViolation(null)).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
    expect(isForeignKeyViolation("23503")).toBe(false);
    expect(isForeignKeyViolation(23503)).toBe(false);
  });

  it("stops on a `cause` chain that points back at itself", () => {
    const a: { cause?: unknown } = new Error("a");
    const b: { cause?: unknown } = new Error("b");
    a.cause = b;
    b.cause = a;
    expect(isForeignKeyViolation(a)).toBe(false);
  });

  it("stops looking below the depth it walks", () => {
    let chain: Error = driverError("23503");
    for (let i = 0; i < 8; i += 1) chain = new Error(`layer ${i}`, { cause: chain });
    expect(isForeignKeyViolation(chain)).toBe(false);
    // One layer fewer and the driver error is the last one read.
    expect(isForeignKeyViolation((chain as { cause?: unknown }).cause)).toBe(true);
  });
});
