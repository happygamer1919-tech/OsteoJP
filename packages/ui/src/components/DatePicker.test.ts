import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

import { DatePicker, datePickerAnchor, formatTypedDate, parseTypedDate } from "./DatePicker";

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

/**
 * SCHED-07 / SR-38 — typed entry, and the validation that makes it safe.
 *
 * The ruling is that typed entry is never removed from a field this component
 * replaces. That makes the PARSER the load-bearing part: a picker that accepts
 * a typo as a real date is worse than one that cannot be typed into at all,
 * because the wrong date is silent and the missing keyboard is obvious.
 */
describe("parseTypedDate — what a person can type", () => {
  it("accepts dd/mm/aaaa, the pt-PT form", () => {
    expect(parseTypedDate("15/09/2026")).toBe("2026-09-15");
    expect(parseTypedDate("01/01/1998")).toBe("1998-01-01");
  });

  it("accepts - and . as separators, which keyboards and habits both produce", () => {
    expect(parseTypedDate("15-09-2026")).toBe("2026-09-15");
    expect(parseTypedDate("15.09.2026")).toBe("2026-09-15");
  });

  it("accepts single-digit day and month", () => {
    expect(parseTypedDate("1/2/2026")).toBe("2026-02-01");
    expect(parseTypedDate("9/9/2026")).toBe("2026-09-09");
  });

  it("accepts a bare 8-digit ddmmaaaa, which is how fast typists enter dates", () => {
    expect(parseTypedDate("15092026")).toBe("2026-09-15");
    expect(parseTypedDate("01011998")).toBe("1998-01-01");
  });

  it("tolerates surrounding and inner whitespace", () => {
    expect(parseTypedDate("  15 / 09 / 2026 ")).toBe("2026-09-15");
  });
});

describe("parseTypedDate — what it REFUSES, which is the point", () => {
  it("REFUSES 31/02, instead of rolling it over to 3 March", () => {
    // `new Date(2026, 1, 31)` is 3 March. A Date constructor turns a typo into a
    // real date nobody typed, and nothing downstream can tell. This is the one
    // assertion this parser exists for.
    expect(parseTypedDate("31/02/2026")).toBeNull();
    expect(parseTypedDate("30/02/2024")).toBeNull();
    expect(parseTypedDate("31/04/2026")).toBeNull();
  });

  it("knows leap years both ways", () => {
    expect(parseTypedDate("29/02/2024")).toBe("2024-02-29");
    expect(parseTypedDate("29/02/2026")).toBeNull();
  });

  it("REFUSES a two-digit year, because it is ambiguous exactly where it hurts", () => {
    // On a birth date "50" is a coin flip between 1950 and 2050. Refusing is the
    // only answer that cannot be silently wrong.
    expect(parseTypedDate("15/09/26")).toBeNull();
    expect(parseTypedDate("01/01/98")).toBeNull();
  });

  it("refuses impossible components and plain rubbish", () => {
    for (const bad of ["00/09/2026", "15/00/2026", "15/13/2026", "32/09/2026",
                       "", "   ", "hoje", "2026-09-15", "15/09", "15/09/20267", "abc/de/fghi"]) {
      expect(parseTypedDate(bad)).toBeNull();
    }
  });

  it("refuses an ISO string, so the two input shapes cannot be confused", () => {
    // The component's VALUE is ISO; what a person TYPES is dd/mm/aaaa. Accepting
    // both here would make the field's contract depend on which one arrived.
    expect(parseTypedDate("2026-09-15")).toBeNull();
  });
});

describe("formatTypedDate — the round trip", () => {
  it("renders an ISO value as dd/mm/aaaa", () => {
    expect(formatTypedDate("2026-09-15")).toBe("15/09/2026");
    expect(formatTypedDate("1998-01-01")).toBe("01/01/1998");
  });

  it("is empty for every value the calendar refuses to stand on", () => {
    for (const v of ["", null, undefined, "2026-9-3", "hoje"]) {
      expect(formatTypedDate(v)).toBe("");
    }
  });

  it("ROUND-TRIPS with parseTypedDate for every date it can produce", () => {
    for (const iso of ["2026-09-15", "1998-01-01", "2024-02-29", "2000-12-31", "1950-06-07"]) {
      expect(parseTypedDate(formatTypedDate(iso))).toBe(iso);
    }
  });
});

/**
 * SCHED-07 CONVERSION: the two props the sweep needed, and what each is for.
 *
 * The picker had to post a value before a single `<input type="date" name=…>`
 * could be converted, and it had to refuse an empty required field on the
 * VISIBLE control - a hidden input is skipped by constraint validation, so a
 * required date could otherwise be submitted blank with nothing named on screen.
 */
describe("posting and validation", () => {
  const html = (props: Record<string, unknown>): string =>
    renderToStaticMarkup(createElement(DatePicker, { value: null, onChange: () => {}, ...props } as never));

  it("posts NOTHING when no name is given, exactly as before", () => {
    expect(html({})).not.toContain('type="hidden"');
  });

  it("posts the ISO value under the given name", () => {
    const out = html({ name: "startDate", value: "2026-09-07" });
    expect(out).toContain('type="hidden"');
    expect(out).toContain('name="startDate"');
    expect(out).toContain('value="2026-09-07"');
  });

  it("posts an EMPTY string rather than a half-typed one when there is no date", () => {
    // The caller reads "" as "not set"; anything else would be a value nobody
    // chose reaching a server action.
    const out = html({ name: "startDate", value: null });
    expect(out).toContain('name="startDate" value=""');
  });

  it("puts required on the visible text field, not on the hidden one", () => {
    const out = html({ name: "startDate", required: true });
    expect(out).toMatch(/<input[^>]*type="text"[^>]*required/);
    expect(out).not.toMatch(/<input type="hidden"[^>]*required/);
  });
});
