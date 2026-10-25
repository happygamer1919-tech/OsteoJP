import { afterEach, describe, expect, it, vi } from "vitest";

import { heldLocationIds, ONLINE_BOOKING_HOLD_ENV } from "./online-booking-hold";

const A = "11111111-2222-4333-8444-555555555555";
const B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("R10: heldLocationIds reads ONLINE_BOOKING_HELD_LOCATION_IDS", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the variable it reads", () => {
    expect(ONLINE_BOOKING_HOLD_ENV).toBe("ONLINE_BOOKING_HELD_LOCATION_IDS");
  });

  it("unset, empty or blank holds nothing", () => {
    expect(heldLocationIds({})).toEqual([]);
    expect(heldLocationIds({ ONLINE_BOOKING_HELD_LOCATION_IDS: "" })).toEqual([]);
    expect(heldLocationIds({ ONLINE_BOOKING_HELD_LOCATION_IDS: "   " })).toEqual([]);
    expect(heldLocationIds({ ONLINE_BOOKING_HELD_LOCATION_IDS: " , ," })).toEqual([]);
  });

  it("one id, and a list with spaces, capitals and a repeat", () => {
    expect(heldLocationIds({ ONLINE_BOOKING_HELD_LOCATION_IDS: A })).toEqual([A]);
    expect(
      heldLocationIds({ ONLINE_BOOKING_HELD_LOCATION_IDS: ` ${A} ,${B.toUpperCase()}, ${A}` }),
    ).toEqual([A, B]);
  });

  it("ignores an entry that is not an id, and warns with a count, never the value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      heldLocationIds({ ONLINE_BOOKING_HELD_LOCATION_IDS: `${A},Montemor,${A.slice(0, 35)}` }),
    ).toEqual([A]);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain("2 entries");
    expect(line).not.toContain("Montemor");
    expect(line).not.toContain(A.slice(0, 35));
  });

  it("a value with only bad entries holds nothing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(heldLocationIds({ ONLINE_BOOKING_HELD_LOCATION_IDS: "MN" })).toEqual([]);
  });

  it("reads process.env by default, on every call", () => {
    vi.stubEnv("ONLINE_BOOKING_HELD_LOCATION_IDS", A);
    expect(heldLocationIds()).toEqual([A]);
    vi.stubEnv("ONLINE_BOOKING_HELD_LOCATION_IDS", "");
    expect(heldLocationIds()).toEqual([]);
    vi.unstubAllEnvs();
  });
});
