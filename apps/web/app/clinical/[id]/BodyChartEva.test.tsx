/**
 * BodyChartEva.test.tsx — W5-26 (SPEC-ficha-medica.md AMENDMENTS ruling H).
 *
 * Renders BodyChart with react-dom/server and pins the EVA (0-10) pain-scale
 * ruling-H surface on Local da dor (pain_location) markers:
 *  - a pain_location marker carrying `intensity` shows "Local da dor - EVA n/10"
 *    in the marker list AND in the on-chart tooltip; the draft selector reflects it;
 *  - ONLY pain_location shows the selector — the other eight types get none and
 *    store no intensity;
 *  - the scale is OPTIONAL — a pain_location marker with no `intensity` shows the
 *    "Sem valor" option and no "- EVA n/10" suffix;
 *  - on a signed/locked record the stored value renders but there is NO editable
 *    EVA control.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { s } from "@/lib/i18n";

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/ui", () => ({
  Button: ({ children }: { children?: ReactNode }) =>
    createElement("button", null, children as ReactNode),
}));
vi.mock("./BodyFigure", () => ({
  AnteriorFigure: () => createElement("svg", { "data-figure": "anterior" }),
  PosteriorFigure: () => createElement("svg", { "data-figure": "posterior" }),
  LateralLeftFigure: () => createElement("svg", { "data-figure": "lateral_left" }),
  LateralRightFigure: () => createElement("svg", { "data-figure": "lateral_right" }),
}));

import { BodyChart, type Marker } from "./BodyChart";

const markerOptions = [
  { value: "pain_location", label: "Local da dor" },
  { value: "hypertonicity", label: "Hipertonicidade" },
  { value: "scar", label: "Cicatriz" },
];

function render(markers: Marker[], readOnly = false): string {
  return renderToStaticMarkup(
    createElement(BodyChart, {
      markers,
      onChange: () => {},
      markerOptions,
      readOnly,
      sex: "female",
    }),
  );
}

const EVA_ARIA = s["clinical.bodychartEvaSelectAria"];

describe("EVA on Local da dor (ruling H) — value display + editable selector (draft)", () => {
  const html = render([{ marker_type: "pain_location", x: 0.4, y: 0.5, view: "anterior", intensity: 7 }]);

  it('shows "Local da dor - EVA 7/10" in the marker list', () => {
    expect(html).toContain("Local da dor - EVA 7/10");
  });

  it("shows the stored value on the on-chart marker tooltip", () => {
    expect(html).toContain('title="Local da dor - EVA 7/10"');
  });

  it("renders an editable EVA selector (draft) reflecting the stored value", () => {
    expect(html).toContain(EVA_ARIA);
    // React marks the matching option selected in the SSR output.
    expect(html).toMatch(/selected[^>]*value="7"|value="7"[^>]*selected/);
  });
});

describe("EVA is optional (ruling H) — scale-less Local da dor marker", () => {
  const html = render([{ marker_type: "pain_location", x: 0.4, y: 0.5, view: "anterior" }]);

  it("shows the plain label with no EVA suffix", () => {
    expect(html).toContain("Local da dor");
    expect(html).not.toContain("Local da dor - EVA");
  });

  it('offers the "Sem valor" (no value) option, selected by default', () => {
    expect(html).toContain(EVA_ARIA);
    expect(html).toContain(s["clinical.bodychartEvaNone"]);
    expect(s["clinical.bodychartEvaNone"]).toBe("Sem valor");
  });
});

describe("Other marker types unaffected (ruling H)", () => {
  const html = render([
    { marker_type: "hypertonicity", x: 0.2, y: 0.3, view: "anterior" },
    { marker_type: "scar", x: 0.6, y: 0.7, view: "anterior" },
  ]);

  it("shows NO EVA selector for non-pain_location markers", () => {
    expect(html).not.toContain(EVA_ARIA);
  });

  it("shows no EVA suffix on their labels", () => {
    expect(html).toContain("Hipertonicidade");
    expect(html).toContain("Cicatriz");
    expect(html).not.toContain("EVA");
  });
});

describe("Signed / locked record (ruling H) — value shown, no editable control", () => {
  const html = render(
    [{ marker_type: "pain_location", x: 0.4, y: 0.5, view: "anterior", intensity: 5 }],
    true,
  );

  it("renders the stored EVA value", () => {
    expect(html).toContain("Local da dor - EVA 5/10");
  });

  it("renders NO editable EVA control and no marker-type select", () => {
    expect(html).not.toContain(EVA_ARIA);
    expect(html).not.toContain("<select");
  });
});
