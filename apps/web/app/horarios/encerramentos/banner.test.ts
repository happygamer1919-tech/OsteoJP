import { describe, expect, it } from "vitest";
import { closureDates, closureHours, closuresBannerFor, ptDate } from "./banner";

describe("Encerramentos: one sentence per result code", () => {
  it("no code, no banner", () => {
    expect(closuresBannerFor(undefined)).toBeNull();
  });

  it("success, removal and the save that found visits to move", () => {
    expect(closuresBannerFor("ok")?.tone).toBe("ok");
    expect(closuresBannerFor("removed")?.tone).toBe("ok");
    const warn = closuresBannerFor("warn:3")!;
    expect(warn.tone).toBe("warn");
    expect(warn.text).toContain("3");
    expect(warn.text).not.toContain("{n}");
  });

  it("each refusal has its own sentence, and an unknown code is an error, never success", () => {
    const codes = ["err:invalid", "err:duplicate", "err:already_started", "err:unavailable", "err:not_found", "err:hours_required"];
    const texts = codes.map((c) => closuresBannerFor(c)!);
    for (const t of texts) expect(t.tone).toBe("err");
    expect(new Set(texts.map((t) => t.text)).size).toBe(codes.length);
    expect(closuresBannerFor("err:something_new")?.tone).toBe("err");
    expect(closuresBannerFor("garbage")?.tone).toBe("err");
  });
});

describe("Encerramentos: how a closure reads in the list", () => {
  it("dates in the clinic's order, one day or a range", () => {
    expect(ptDate("2026-12-25")).toBe("25/12/2026");
    expect(closureDates("2026-12-25", "2026-12-25")).toBe("25/12/2026");
    expect(closureDates("2027-01-01", "2027-01-02")).toContain("01/01/2027");
    expect(closureDates("2027-01-01", "2027-01-02")).toContain("02/01/2027");
  });

  it("hours: the whole day, or the wall-clock pair", () => {
    expect(closureHours(null, null)).toBe("Dia inteiro");
    expect(closureHours("13:00:00", "20:00:00")).toBe("13:00 - 20:00");
  });
});
