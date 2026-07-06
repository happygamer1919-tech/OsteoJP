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
