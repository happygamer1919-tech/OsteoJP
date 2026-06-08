import { describe, expect, it } from "vitest";
import { authenticateCallback, safeKeyEqual } from "./callback";
import { IfThenPayCallbackAuthError } from "./errors";
import { SAMPLE_CALLBACK_PARAMS } from "./fixtures";

const EXPECTED = "anti-phishing-secret";

describe("safeKeyEqual (constant-time compare)", () => {
  it("is true only for an exact match", () => {
    expect(safeKeyEqual("abc", "abc")).toBe(true);
    expect(safeKeyEqual("abc", "abd")).toBe(false);
    expect(safeKeyEqual("abc", "ab")).toBe(false); // length mismatch
    expect(safeKeyEqual("", "")).toBe(true);
    // @ts-expect-error guarding the non-string path
    expect(safeKeyEqual(undefined, "abc")).toBe(false);
  });
});

describe("authenticateCallback — anti-spoof gate", () => {
  it("rejects a missing key", () => {
    expect(() =>
      authenticateCallback({ ...SAMPLE_CALLBACK_PARAMS }, EXPECTED),
    ).toThrow(IfThenPayCallbackAuthError);
  });

  it("rejects a wrong key (non-retryable, no value echoed)", () => {
    const err = (() => {
      try {
        authenticateCallback({ ...SAMPLE_CALLBACK_PARAMS, key: "forged" }, EXPECTED);
      } catch (e) {
        return e as IfThenPayCallbackAuthError;
      }
    })()!;
    expect(err).toBeInstanceOf(IfThenPayCallbackAuthError);
    expect(err.retryable).toBe(false);
    expect(err.message).not.toContain("forged");
  });

  it("rejects a valid key but missing orderId", () => {
    expect(() =>
      authenticateCallback({ key: EXPECTED, amount: "60.00" }, EXPECTED),
    ).toThrow(IfThenPayCallbackAuthError);
  });

  it("accepts a valid key and normalizes the callback (key is discarded)", () => {
    const cb = authenticateCallback({ ...SAMPLE_CALLBACK_PARAMS, key: EXPECTED }, EXPECTED);
    expect(cb).toEqual({
      orderId: SAMPLE_CALLBACK_PARAMS.orderId,
      amountCents: 6000,
      method: "multibanco", // entity+reference present → Multibanco
      requestId: "req-test-1",
      paidAt: "2026-06-02 10:30:00",
    });
    // The anti-phishing key must NOT appear anywhere on the normalized object.
    expect(JSON.stringify(cb)).not.toContain(EXPECTED);
  });

  it("infers mbway when there is no entity/reference", () => {
    const cb = authenticateCallback(
      { key: EXPECTED, orderId: "o1", amount: "60.00" },
      EXPECTED,
    );
    expect(cb.method).toBe("mbway");
  });

  it("honours an explicit payment_type", () => {
    const cb = authenticateCallback(
      { key: EXPECTED, orderId: "o1", amount: "60.00", entity: "1", payment_type: "mbway" },
      EXPECTED,
    );
    expect(cb.method).toBe("mbway");
  });
});
