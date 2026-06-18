import { describe, expect, it } from "vitest";
import { decodePatientId, encodePatientId, idRange } from "./ids";

describe("patient id encoding", () => {
  it("encodes 181882 to the verified i= param MTgxODgy", () => {
    expect(encodePatientId(181882)).toBe("MTgxODgy");
  });

  it("round-trips encode/decode", () => {
    for (const id of [174159, 181882, 199974, 0, 7]) {
      expect(decodePatientId(encodePatientId(id))).toBe(id);
    }
  });

  it("rejects non-integer / negative ids", () => {
    expect(() => encodePatientId(-1)).toThrow();
    expect(() => encodePatientId(1.5)).toThrow();
  });
});

describe("idRange", () => {
  it("is inclusive of both ends", () => {
    expect([...idRange(3, 6)]).toEqual([3, 4, 5, 6]);
  });

  it("yields a single id when start === end", () => {
    expect([...idRange(5, 5)]).toEqual([5]);
  });

  it("throws when start > end", () => {
    expect(() => [...idRange(6, 3)]).toThrow();
  });
});
