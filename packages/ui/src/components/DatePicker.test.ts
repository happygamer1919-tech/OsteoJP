import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

import { DatePicker, datePickerAnchor } from "./DatePicker";

/**
 * SCHED-06 - an empty date field opens its calendar on TODAY, never on 1900.
 *
 * THE DEFECT, as the owner met it: open Nova marcacao, choose a pacote, ask for
 * a second session, open that row's date picker. The calendar header read
 * "janeiro de 1900".
 *
 * THE MECHANISM, reproduced before it was fixed. The component positioned
 * itself with `value ?? todayIso()`. `??` admits the EMPTY STRING, which is
 * what every caller here holds in form state for "not picked yet" - the pacote
 * row is seeded `{ date: "", time: "" }`. "" then went through parseIso:
 * `"".split("-").map(Number)` is `[0]`, `0 ?? 1970` keeps the 0 because 0 is
 * not nullish, and the view became `{y: 0, m: 0}`. `new Date(0, 0, 1)` is
 * 1 January 1900 - JavaScript maps years 0-99 onto 1900-1999.
 *
 * WHY THE TESTS ARE ON THE PURE ANCHOR AND NOT ON THE MONTH HEADER. The header
 * only exists while the popover is open, and opening it needs a click; this
 * package's unit project runs in `environment: "node"` and renders through
 * `react-dom/server`, so there is no DOM to click and no header to read. The
 * anchor IS the value the header formats, so testing it tests the thing that
 * was wrong rather than a proxy for it - and the first case below asserts the
 * header STRING, through the same Intl format the component uses, so the
 * failure reads in the same words the owner used.
 */

const TODAY = (): string => {
  const t = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`;
};

/** The month header the popover would print for an anchor. */
const header = (iso: string): string => {
  const [y, m] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(
    new Date(y!, m! - 1, 1),
  );
};

describe("DatePicker - the calendar's opening month (SCHED-06)", () => {
  it("an EMPTY initial value anchors on today, and the header is NOT janeiro de 1900", () => {
    const anchor = datePickerAnchor("");
    expect(anchor).toBe(TODAY());
    // The owner's own words, pinned. Pre-fix this read "janeiro de 1900".
    expect(header(anchor)).toBe(header(TODAY()));
    expect(header(anchor)).not.toContain("1900");
  });

  it("null and undefined anchor on today too - the case `??` already handled stays handled", () => {
    expect(datePickerAnchor(null)).toBe(TODAY());
    expect(datePickerAnchor(undefined)).toBe(TODAY());
  });

  it("a real ISO value is used as-is, so the fix cannot swallow a picked date", () => {
    expect(datePickerAnchor("2026-09-15")).toBe("2026-09-15");
    expect(datePickerAnchor("1998-01-01")).toBe("1998-01-01");
    // `today` is injectable so this asserts the value WINS rather than
    // coinciding with the real today.
    expect(datePickerAnchor("2026-09-15", "2030-12-31")).toBe("2026-09-15");
  });

  it("a MALFORMED value anchors on today rather than fabricating a date from a partial parse", () => {
    // Each of these produced a real-looking date before: the parse answers
    // every input, so nothing downstream could tell them from a picked date.
    for (const bad of ["2026-9-3", "2026-09", "15/09/2026", "hoje", "-", "0000-00-00x"]) {
      expect(datePickerAnchor(bad, "2026-09-02")).toBe("2026-09-02");
    }
  });

  it("YEAR ZERO IS UNREACHABLE from any input - the 1900 window is closed, not narrowed", () => {
    for (const v of ["", null, undefined, "0", "0-0-0", "x", "  "]) {
      const anchor = datePickerAnchor(v, "2026-09-02");
      expect(Number(anchor.slice(0, 4))).toBeGreaterThan(1900);
    }
  });
});

describe("DatePicker - the trigger agrees with the calendar (SCHED-06)", () => {
  const render = (value: string | null): string =>
    renderToStaticMarkup(
      createElement(DatePicker, {
        value,
        onChange: () => {},
        placeholder: "Escolher data",
        triggerLabel: "Escolher data",
      }),
    );

  it("shows the placeholder for an empty value", () => {
    expect(render("")).toContain("Escolher data");
  });

  it("shows the placeholder for a MALFORMED value instead of formatting one", () => {
    // The behaviour this pins: a value the calendar refuses to stand on must
    // not be printed as a date on the trigger either. Pre-fix the trigger
    // tested `value` for truthiness, so "2026-9-3" rendered "03/09/2026" while
    // the calendar it opened sat on an entirely different month.
    const html = render("2026-9-3");
    expect(html).toContain("Escolher data");
    expect(html).not.toContain("2026");
  });

  it("still formats a real value", () => {
    expect(render("2026-09-15")).toContain("15/09/2026");
  });
});
