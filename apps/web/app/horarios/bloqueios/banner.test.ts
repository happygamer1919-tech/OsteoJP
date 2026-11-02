import { describe, expect, it } from "vitest";
import { s } from "@/lib/i18n";
import { conflictLines } from "@/lib/scheduling/conflict-lines";
import { bannerFor } from "./banner";

describe("Bloqueios: the result sentence", () => {
  it("each refusal names its own repair, an unknown error is generic, nothing is silent", () => {
    expect(bannerFor(undefined)).toBeNull();
    expect(bannerFor("ok")).toEqual({ tone: "ok", text: s["blocks.saved"] });
    expect(bannerFor("err:duplicate")).toEqual({ tone: "err", text: s["blocks.errDuplicate"] });
    expect(bannerFor("err:note_required")).toEqual({ tone: "err", text: s["blocks.errNote"] });
    expect(bannerFor("err:invalid")).toEqual({ tone: "err", text: s["blocks.errInvalid"] });
    expect(bannerFor("err:forbidden")).toEqual({ tone: "err", text: s["blocks.errForbidden"] });
    expect(bannerFor("err:not_found")).toEqual({ tone: "err", text: s["blocks.errNotFound"] });
    expect(bannerFor("err:unavailable")).toEqual({ tone: "err", text: s["blocks.weeklyUnavailable"] });
    expect(bannerFor("err:something_new")).toEqual({ tone: "err", text: s["blocks.err"] });
    expect(bannerFor("err")).toEqual({ tone: "err", text: s["blocks.err"] });
  });

  it("an overlap warning quotes the count and says the appointments were kept", () => {
    const b = bannerFor("warn:3");
    expect(b?.tone).toBe("ok");
    expect(b?.text).toContain("3");
    expect(b?.text).not.toContain("{n}");
  });
});

describe("a weekly block in the booking's conflict panel", () => {
  it("is named 'Bloqueio semanal', not the generic 'Outro'", () => {
    const [line] = conflictLines([
      {
        kind: "time_off",
        id: "weekly:r1:2026-11-09",
        patientName: null,
        startsAt: "2026-11-09T08:00:00.000Z",
        endsAt: "2026-11-09T11:00:00.000Z",
        room: null,
        reason: "weekly",
      },
    ]);
    expect(line!.text.startsWith(`${s["blocks.weeklyBandNote"]}: `)).toBe(true);
    expect(line!.text).not.toContain(s["appointment.timeOffReasonOther"]);
  });
});
