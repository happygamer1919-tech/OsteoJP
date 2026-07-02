import { describe, expect, it } from "vitest";
import { formatPatientNumber } from "./format";

describe("formatPatientNumber", () => {
  it("zero-pads a single-digit number to 4 digits", () => {
    expect(formatPatientNumber(1)).toBe("0001");
  });

  it("zero-pads a 3-digit number", () => {
    expect(formatPatientNumber(123)).toBe("0123");
  });

  it("renders a 4-digit number unchanged", () => {
    expect(formatPatientNumber(1000)).toBe("1000");
  });

  it("does not truncate numbers past 4 digits", () => {
    expect(formatPatientNumber(12345)).toBe("12345");
  });
});
