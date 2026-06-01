import { describe, expect, it } from "vitest";
import { formatDateShort, formatTime, resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("defaults to pt when nothing is set", () => {
    expect(resolveLocale(null)).toBe("pt");
    expect(resolveLocale({})).toBe("pt");
    expect(resolveLocale({ locale: "fr" })).toBe("pt"); // unknown ignored
  });

  it("honours a valid tenant locale", () => {
    expect(resolveLocale({ locale: "en" })).toBe("en");
    expect(resolveLocale({ locale: "pt" })).toBe("pt");
  });

  it("lets a patient preference win over the tenant default", () => {
    expect(resolveLocale({ locale: "pt" }, "en")).toBe("en");
    expect(resolveLocale({ locale: "en" }, "garbage")).toBe("en"); // bad pref ignored
  });
});

describe("Lisbon formatting", () => {
  // 2026-05-23 is summer (WEST, UTC+1): 13:30 UTC → 14:30 Lisbon.
  const instant = new Date("2026-05-23T13:30:00Z");

  it("formats time as HH:mm in Lisbon wall-clock", () => {
    expect(formatTime(instant, "pt")).toBe("14:30");
    expect(formatTime(instant, "en")).toBe("14:30");
  });

  it("formats the short SMS date as dd/mm", () => {
    expect(formatDateShort(instant)).toBe("23/05");
  });
});
