import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { StuckConsultations, type StuckConsultationRow } from "./stuck-consultations";
import { s } from "@/lib/i18n";

/**
 * AI-04 — the stuck-recording list on reception's notifications page.
 *
 * WHAT IS ON TRIAL HERE is not the layout. It is the two ways this component
 * could report "nothing is wrong" while something is:
 *
 *   1. an EMPTY list rendering as an ABSENT section, so a reader cannot tell a
 *      healthy clinic from a section that never loaded (INC-05's shape); and
 *   2. a row DISAPPEARING because a name could not be resolved, which is the
 *      §1.3 collapse applied to an alarm — the screen carries on reporting
 *      something reasonable, and the reasonable thing is "no recordings lost".
 *
 * Both are asserted in the direction that fails when the defect returns.
 */

const row = (over: Partial<StuckConsultationRow> = {}): StuckConsultationRow => ({
  id: "c-1",
  patientName: "Maria Exemplo",
  clinicianName: "Dra A",
  when: "12/08/2026 09:30",
  lastAttempt: "12/08/2026 18:00",
  attemptCount: 8,
  lastError: "503",
  ...over,
});

const html = (rows: StuckConsultationRow[]) =>
  renderToStaticMarkup(<StuckConsultations rows={rows} />);

describe("StuckConsultations", () => {
  it("renders an EXPLICIT empty state rather than nothing at all", () => {
    const out = html([]);
    expect(out).toContain(s["consultations.stuck.empty"]);
    // THE HINT IS THE HALF THAT MATTERS. Without it, an empty box says "you are
    // fine", which is a stronger claim than the data supports: if the retry job
    // stopped running, nothing would ever reach this state and the box would
    // look exactly the same.
    expect(out).toContain(s["consultations.stuck.emptyHint"]);
  });

  it("KEEPS THE ROW when the patient name could not be resolved", () => {
    const out = html([row({ patientName: null })]);
    // The row survives: its instant is still on the screen.
    expect(out).toContain("12/08/2026 09:30");
    // And the gap is rendered AS a gap rather than as a blank that reads like a
    // patient with no name.
    expect(out).toContain(s["consultations.stuck.unknownPatient"]);
  });

  it("KEEPS THE ROW when the clinician could not be resolved", () => {
    const out = html([row({ clinicianName: null })]);
    expect(out).toContain("12/08/2026 09:30");
    expect(out).toContain(s["consultations.stuck.unknownClinician"]);
  });

  it("shows the consultation instant, the attempt count and the technical reason", () => {
    const out = html([row()]);
    expect(out).toContain("Maria Exemplo");
    expect(out).toContain("Dra A");
    expect(out).toContain("12/08/2026 09:30");
    expect(out).toContain("8");
    expect(out).toContain("503");
    expect(out).toContain(s["consultations.stuck.lastError"]);
  });

  it("says so when no technical reason was recorded, instead of leaving the label bare", () => {
    const out = html([row({ lastError: null })]);
    expect(out).toContain(s["consultations.stuck.noError"]);
  });

  it("omits the last-attempt clause entirely when there was never an attempt", () => {
    const out = html([row({ lastAttempt: null })]);
    expect(out).not.toContain(s["consultations.stuck.lastAttempt"]);
    // The row itself is still there — a missing timestamp removes a clause, not
    // the alarm.
    expect(out).toContain("Maria Exemplo");
  });

  it("renders every row it is given, in the order it is given", () => {
    const out = html([
      row({ id: "c-1", patientName: "AAA Primeiro" }),
      row({ id: "c-2", patientName: "ZZZ Segundo" }),
    ]);
    expect(out.indexOf("AAA Primeiro")).toBeGreaterThan(-1);
    expect(out.indexOf("ZZZ Segundo")).toBeGreaterThan(out.indexOf("AAA Primeiro"));
    // The empty state must not appear alongside rows.
    expect(out).not.toContain(s["consultations.stuck.empty"]);
  });
});

/**
 * THE WIRING, GUARDED AT SOURCE LEVEL.
 *
 * Every assertion above passes with this component rendered nowhere. The whole
 * of AI-04 is "reception has no screen for it", so a refactor that drops the
 * section from `page.tsx` puts the card straight back where it started while
 * the suite stays green - and a screen that is absent produces no failure
 * anywhere, by construction.
 *
 * `page.tsx` is a server component with an async body and four database reads;
 * rendering it in this environment is not available, so the wiring is asserted
 * on the source. That is a weaker instrument than a render and it is the
 * strongest one there is here, which is why it names what it does and does not
 * prove: it proves the section is WIRED IN, not that it DISPLAYS.
 */
describe("the notifications page keeps the section wired in", () => {
  const src = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("fetches the stuck consultations", () => {
    expect(src).toContain("listStuckConsultations(ctx)");
  });

  it("renders the section, with its heading", () => {
    expect(src).toContain("<StuckConsultations rows={stuckRows} />");
    expect(src).toContain('s["consultations.stuck.title"]');
  });

  it("does not gate the section behind a role branch in the page", () => {
    // The scope lives in the query (both patient scopes), never in the page. A
    // `canRead... &&` wrapper here would be the SEC-01 mistake inverted: hiding
    // rows the caller is entitled to, in a place a reader would then trust as
    // the boundary.
    expect(src).not.toMatch(/&&\s*\(?\s*<section[^>]*stuck-consultations/);
  });
});
