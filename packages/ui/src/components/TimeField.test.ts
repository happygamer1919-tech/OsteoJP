import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { TimeField } from "./TimeField";

// W4-02 — TimeField is the 24h, locale-independent time picker that replaces the
// native <input type="time"> (which renders AM/PM under a 12h browser locale).
// These pin: 24h hour column (00–23), NO meridiem/AM-PM element, and the value
// is always "HH:mm" (no data-semantic change vs the native input).
function render(value: string, step = 15): string {
  return renderToStaticMarkup(createElement(TimeField, { value, onChange: () => {}, step }));
}

describe("TimeField (W4-02 24h picker)", () => {
  it("renders a 24h hour column (00–23) with no AM/PM / meridiem element", () => {
    const html = render("14:30");
    // Full 24h range present as zero-padded options.
    for (const h of ["00", "09", "13", "20", "23"]) {
      expect(html).toContain(`>${h}<`);
    }
    // Never a 12h/meridiem control.
    expect(html).not.toMatch(/\b[AP]M\b/);
    expect(html.toLowerCase()).not.toContain("meridiem");
    // 24h signature the 12h picker cannot show: midnight 00 and the 13–23 block.
    for (const h of ["00", "13", "17", "22", "23"]) expect(html).toContain(`>${h}<`);
    // No native time input remains (would follow the browser locale).
    expect(html).not.toContain('type="time"');
  });

  it("reflects the 24h value it is given (round-trip stays HH:mm)", () => {
    // A 24h afternoon value renders its hour selected — the same "14:30" a native
    // input would store; the widget never changes the stored value.
    const html = render("14:30");
    expect(html).toContain("14");
    expect(html).toContain("30");
  });

  it("bounds the hour column to [min,max] when given (working-hours case)", () => {
    // step 15 within 08:00–20:00 exposes 08..20, never 00 or 23.
    const html = renderToStaticMarkup(
      createElement(TimeField, { value: "", onChange: () => {}, min: "08:00", max: "20:00" }),
    );
    expect(html).toContain(">08<");
    expect(html).toContain(">20<");
    expect(html).not.toContain(">23<");
  });
});

// ============================================================================
// OFF-STEP VALUES. A LIVE DEFECT REPORTED FROM RECEPTION, 2026-08-13.
// ============================================================================
// An appointment stored at 11:25 rendered in the edit panel as 11:00, while the
// agenda grid, the hover card, the Marcações list AND the same panel's own
// Ocupado block all showed 11:25. The minute options are generated on `step`
// (00/15/30/45), so a controlled <select> handed 25 matched no option and the
// browser painted the first visible one.
//
// NO DATA WAS CORRUPTED — the parent's form state still held "11:25" — but a
// receptionist reading 11:00 tells a patient to arrive 25 minutes early.
//
// SELECTION IS ASSERTED AS `selected=""` ON THE OPTION, which is what
// renderToStaticMarkup emits; React does not put `value` on the <select> in SSR.
// The first draft of these tests asserted `value="11:25"` and failed against a
// CORRECT fix — the assertions were wrong, not the component.

/** The two columns, split apart: hours first, minutes second. */
function columns(html: string): { hours: string; minutes: string } {
  const first = html.indexOf("<select");
  const second = html.indexOf("<select", first + 1);
  return { hours: html.slice(first, second), minutes: html.slice(second) };
}
const optionValues = (col: string): number[] =>
  [...col.matchAll(/<option value="(\d+)"/g)].map((m) => Number(m[1]));

describe("TimeField renders values that do not fall on its own step", () => {
  it("offers the off-step minute AND selects it", () => {
    // The regression. Without the fix the minute column is 00/15/30/45 only, 25
    // matches nothing, and the browser falls back to the first visible option.
    const { hours, minutes } = columns(render("11:25"));
    expect(minutes, "25 must exist, or the field cannot show its own value").toContain(
      '<option value="25"',
    );
    expect(minutes, "and it must be the selected one").toContain(
      '<option value="25" selected=""',
    );
    expect(hours).toContain('<option value="11" selected=""');
  });

  it("keeps the injected minute in ORDER, not appended at the end", () => {
    // A column reading 00,15,30,45,25 is a usability defect of its own — the eye
    // cannot scan it — and it would pass a naive "contains 25" check.
    const { minutes } = columns(render("11:25"));
    expect(optionValues(minutes)).toEqual([0, 15, 25, 30, 45]);
  });

  it("does NOT offer the off-step minute on any OTHER hour", () => {
    // The injection is for the value's own hour only. Adding 25 to every hour
    // would silently widen what a caller's `step` permits a user to pick.
    const { minutes } = columns(render("12:15"));
    expect(optionValues(minutes)).toEqual([0, 15, 30, 45]);
  });

  it("leaves an ON-step value's options exactly as they were", () => {
    // The fix must be inert for every value that already worked, or it is a
    // behaviour change dressed as a bug fix.
    const { minutes } = columns(render("11:30"));
    expect(optionValues(minutes)).toEqual([0, 15, 30, 45]);
  });

  it("displays an hour outside [min,max] rather than silently showing another", () => {
    // The same failure one column over: an existing appointment at 07:30 opened
    // in a field bounded to the working day would have shown 08:30.
    const html = renderToStaticMarkup(
      createElement(TimeField, {
        value: "07:30",
        onChange: () => {},
        step: 15,
        min: "08:00",
        max: "20:00",
      }),
    );
    const { hours } = columns(html);
    expect(hours).toContain('<option value="7" selected=""');
  });
});
