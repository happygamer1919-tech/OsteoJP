import { describe, it, expect, vi } from "vitest";

// operator.ts pulls in "server-only" (and, transitively, the supabase server
// client). Neutralise server-only for the node runner; we exercise only the
// pure allowlist gate here.
vi.mock("server-only", () => ({}));

import { isPlatformOperator, parseOperatorAllowlist } from "./operator";

describe("parseOperatorAllowlist", () => {
  it("splits on commas/whitespace, trims, lowercases, drops blanks", () => {
    expect(parseOperatorAllowlist(" Op@OsteoJP.pt , two@x.pt\nthree@x.pt ")).toEqual([
      "op@osteojp.pt",
      "two@x.pt",
      "three@x.pt",
    ]);
  });

  it("returns [] for undefined/empty", () => {
    expect(parseOperatorAllowlist(undefined)).toEqual([]);
    expect(parseOperatorAllowlist("   ")).toEqual([]);
  });
});

describe("isPlatformOperator", () => {
  const allow = ["op@osteojp.pt"];

  it("matches case-insensitively", () => {
    expect(isPlatformOperator("OP@OsteoJP.PT", allow)).toBe(true);
    expect(isPlatformOperator("op@osteojp.pt", allow)).toBe(true);
  });

  it("rejects a non-listed email", () => {
    expect(isPlatformOperator("intruder@x.pt", allow)).toBe(false);
  });

  it("fails closed on null/empty email or empty allowlist", () => {
    expect(isPlatformOperator(null, allow)).toBe(false);
    expect(isPlatformOperator("", allow)).toBe(false);
    expect(isPlatformOperator("op@osteojp.pt", [])).toBe(false);
  });
});
