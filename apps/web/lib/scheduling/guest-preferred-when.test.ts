import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { encodeGuestPreferredWindow, parseCalendarDate } from "@osteojp/db";
import { formatGuestPreferredWhen } from "./guest-preferred-when";

/**
 * GUEST-04 — reception must read a PREFERENCE, never an invented time.
 *
 * THE DEFECT THIS PREVENTS IS SILENT AND IT IS PATIENT-FACING BY PROXY. The row
 * feeds the one screen a receptionist works from before telephoning somebody who
 * is not yet a patient. If it renders "20/08/2026 09:00" for a person who chose
 * "manhã", nothing errors, nothing looks odd, and reception rings to confirm
 * nine o'clock — a time no screen ever offered and nobody ever agreed to.
 */

const windowFor = (ymd: string, period: "manha" | "tarde") =>
  encodeGuestPreferredWindow(parseCalendarDate(ymd)!, period);

describe("formatGuestPreferredWhen", () => {
  it("a MORNING preference reads as a date and a period, with no time", () => {
    const { startsAt, endsAt } = windowFor("2026-08-20", "manha");
    const out = formatGuestPreferredWhen(startsAt, endsAt);
    expect(out).toBe("20/08/2026, manhã");
    // The assertion that matters: no clock time anywhere in the string.
    expect(out).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("an AFTERNOON preference reads the same way", () => {
    const { startsAt, endsAt } = windowFor("2026-01-07", "tarde");
    const out = formatGuestPreferredWhen(startsAt, endsAt);
    expect(out).toBe("07/01/2026, tarde");
    expect(out).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("SUMMER TIME does not shift the date or the period", () => {
    // A summer morning is stored at 08:00Z. Formatted in UTC it would read the
    // right date and, if the decoder were UTC-naive, the wrong period.
    const { startsAt, endsAt } = windowFor("2026-07-15", "manha");
    expect(startsAt.toISOString()).toBe("2026-07-15T08:00:00.000Z");
    expect(formatGuestPreferredWhen(startsAt, endsAt)).toBe("15/07/2026, manhã");
  });

  it("a window that encodes NO period renders the TIME, and is not called a period", () => {
    // Fail-visible, not fail-benign. Nothing shipped writes such a row; if one
    // ever exists, reception must see that it is a specific instant rather than
    // be told a preference that was never expressed.
    const starts = new Date("2026-08-20T13:30:00.000Z");
    const ends = new Date("2026-08-20T14:30:00.000Z");
    const out = formatGuestPreferredWhen(starts, ends);
    expect(out).toBe("20/08/2026 14:30");
    expect(out).not.toContain("manhã");
    expect(out).not.toContain("tarde");
  });

  it("NEGATIVE ARM: the two periods do not render identically", () => {
    // Without this, a formatter that always said "manhã" would pass every
    // positive arm above that happens to use a morning.
    const m = windowFor("2026-08-20", "manha");
    const t = windowFor("2026-08-20", "tarde");
    expect(formatGuestPreferredWhen(m.startsAt, m.endsAt)).not.toBe(
      formatGuestPreferredWhen(t.startsAt, t.endsAt),
    );
  });
});
