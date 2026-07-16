import { describe, it, expect } from "vitest";
import {
  instanceStatus,
  resolvePackAdjust,
  resolvePackBooking,
} from "./instances-core";

describe("resolvePackBooking — registration + decrement (W8-01c)", () => {
  it("registers a fresh instance and consumes session 1 when none is active", () => {
    expect(resolvePackBooking(null, 10)).toEqual({
      action: "register",
      sessionsTotal: 10,
      sessionsRemaining: 9,
    });
    expect(resolvePackBooking(null, 5)).toEqual({
      action: "register",
      sessionsTotal: 5,
      sessionsRemaining: 4,
    });
  });

  it("a single-session pack registers already exhausted (remaining 0, never negative)", () => {
    expect(resolvePackBooking(null, 1)).toEqual({
      action: "register",
      sessionsTotal: 1,
      sessionsRemaining: 0,
    });
  });

  it("decrements the active instance by exactly 1", () => {
    expect(resolvePackBooking({ sessionsTotal: 10, sessionsRemaining: 7 }, 10)).toEqual({
      action: "decrement",
      sessionsRemaining: 6,
    });
  });

  it("an exhausted instance (remaining 0) is treated as none active → registers fresh", () => {
    expect(resolvePackBooking({ sessionsTotal: 10, sessionsRemaining: 0 }, 10)).toEqual({
      action: "register",
      sessionsTotal: 10,
      sessionsRemaining: 9,
    });
  });

  it("decrementing the last session lands at 0, never below", () => {
    expect(resolvePackBooking({ sessionsTotal: 10, sessionsRemaining: 1 }, 10)).toEqual({
      action: "decrement",
      sessionsRemaining: 0,
    });
  });
});

describe("resolvePackAdjust — manual consume/restore (W8-01c)", () => {
  it("consume decrements by 1", () => {
    expect(resolvePackAdjust({ sessionsTotal: 10, sessionsRemaining: 5 }, "consume")).toEqual({
      ok: true,
      sessionsRemaining: 4,
    });
  });

  it("consume refuses below 0 (no negative balance)", () => {
    expect(resolvePackAdjust({ sessionsTotal: 10, sessionsRemaining: 0 }, "consume")).toEqual({
      ok: false,
      reason: "exhausted",
    });
  });

  it("restore increments by 1 (e.g. reversing an under-24h no-show)", () => {
    expect(resolvePackAdjust({ sessionsTotal: 10, sessionsRemaining: 4 }, "restore")).toEqual({
      ok: true,
      sessionsRemaining: 5,
    });
  });

  it("restore refuses above the total (no over-grant)", () => {
    expect(resolvePackAdjust({ sessionsTotal: 10, sessionsRemaining: 10 }, "restore")).toEqual({
      ok: false,
      reason: "complete",
    });
  });

  it("restore lifts an exhausted instance back to active", () => {
    const r = resolvePackAdjust({ sessionsTotal: 10, sessionsRemaining: 0 }, "restore");
    expect(r).toEqual({ ok: true, sessionsRemaining: 1 });
    expect(instanceStatus(r.ok ? r.sessionsRemaining : 0)).toBe("active");
  });
});

describe("instanceStatus", () => {
  it("is active while sessions remain, exhausted at zero", () => {
    expect(instanceStatus(3)).toBe("active");
    expect(instanceStatus(1)).toBe("active");
    expect(instanceStatus(0)).toBe("exhausted");
  });
});
