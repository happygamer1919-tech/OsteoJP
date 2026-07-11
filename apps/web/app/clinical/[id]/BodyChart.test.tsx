/**
 * BodyChart.test.tsx — W5-25 (SPEC-ficha-medica.md AMENDMENTS ruling G).
 *
 * Renders BodyChart with react-dom/server (node env, no jsdom — mirrors the
 * MobilidadeChart / RecordForm render tests) and pins ruling-G conformance:
 *  - each of the nine frozen marker types renders with a DISTINCT shape AND a
 *    distinct colour token (shape carries meaning; colour reinforces);
 *  - an always-visible legend lists all nine pt-PT labels with shape + colour;
 *  - pre-existing markers ({ marker_type, x, y, view }) render with the new
 *    type-driven visuals automatically (no stored-data change);
 *  - the marker array shape is unchanged and placement gating is untouched
 *    (editable => role=application; read-only => no select, no application).
 *
 * @osteojp/ui Button and the SVG BodyFigure set are stubbed; the marker glyphs,
 * legend, and gating are the real component output.
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

// The nine frozen marker_type values (osteopathy-v3.json bodychart enum) with
// their authoritative pt-PT labels (ruling G) and the colour token each maps to.
const NINE: { value: string; label: string; token: string }[] = [
  { value: "blockage_dysfunction", label: "Bloqueio / Disfunção", token: "fill-marker-blockage" },
  { value: "scar", label: "Cicatriz", token: "stroke-marker-scar" },
  { value: "hypertonicity", label: "Hipertonicidade", token: "fill-marker-hypertonicity" },
  { value: "hypotonicity", label: "Hipotonicidade", token: "fill-marker-hypotonicity" },
  { value: "pain_radiation", label: "Irradiação da dor", token: "fill-marker-radiation" },
  { value: "pain_location", label: "Local da dor", token: "fill-marker-location" },
  { value: "paresthesia", label: "Parestesia", token: "stroke-marker-paresthesia" },
  { value: "rotation_right", label: "Rotação direita", token: "fill-marker-rotation-right" },
  { value: "rotation_left", label: "Rotação esquerda", token: "fill-marker-rotation-left" },
];
const markerOptions = NINE.map(({ value, label }) => ({ value, label }));

// One marker of each type, all on the default "anterior" view so they all render
// on-chart at once. Exactly the pre-loop marker shape: { marker_type, x, y, view }.
const ONE_OF_EACH: Marker[] = NINE.map((m, i) => ({
  marker_type: m.value,
  x: 0.1 + i * 0.05,
  y: 0.5,
  view: "anterior",
}));

function render(markers: Marker[] = [], readOnly = false): string {
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

const onChartShapes = (html: string): string[] =>
  [...html.matchAll(/data-marker-type="[^"]+" data-marker-shape="([^"]+)"/g)].map((m) => m[1]);
const legendShapes = (html: string): string[] =>
  [...html.matchAll(/data-legend-type="[^"]+" data-marker-shape="([^"]+)"/g)].map((m) => m[1]);

describe("BodyChart marker differentiation (ruling G) — nine distinct shapes + colours", () => {
  const html = render(ONE_OF_EACH);

  it("renders all nine markers on-chart with NINE DISTINCT shapes", () => {
    const shapes = onChartShapes(html);
    expect(shapes).toHaveLength(9);
    expect(new Set(shapes).size).toBe(9);
    // The authoritative shape set (ruling G).
    expect(new Set(shapes)).toEqual(
      new Set(["square", "cross", "triangle", "diamond", "star", "circle", "ring", "arrow_right", "arrow_left"]),
    );
  });

  it("renders NINE DISTINCT colour tokens (one per type, magenta not reused)", () => {
    const tokens = NINE.map((m) => m.token);
    expect(new Set(tokens).size).toBe(9);
    for (const token of tokens) expect(html).toContain(token);
    // Brand magenta stays reserved for the lockup — the old single-dot fill is gone.
    expect(html).not.toContain("bg-brand-magenta");
  });

  it("never relies on colour alone — every glyph is an SVG shape (greyscale-legible)", () => {
    // Each on-chart marker wraps a <svg> glyph; no bare coloured <span> dots.
    const glyphSvgs = html.match(/<svg /g) ?? [];
    // 9 on-chart + 9 legend + 1 body figure = 19 svgs at minimum.
    expect(glyphSvgs.length).toBeGreaterThanOrEqual(18);
  });
});

describe("BodyChart legend (ruling G) — always visible, nine pt-PT labels + shapes", () => {
  const html = render(ONE_OF_EACH);

  it("renders the legend container and its pt-PT title", () => {
    expect(html).toContain('data-testid="bodychart-legend"');
    expect(html).toContain(s["clinical.bodychartLegendTitle"]);
    expect(s["clinical.bodychartLegendTitle"]).toBe("Legenda dos marcadores");
  });

  it("lists all nine pt-PT type names, each with a distinct shape", () => {
    for (const { label } of NINE) expect(html).toContain(label);
    const shapes = legendShapes(html);
    expect(shapes).toHaveLength(9);
    expect(new Set(shapes).size).toBe(9);
  });

  it("stays visible on read-only records (presentation chrome, not a disclosure)", () => {
    const ro = render(ONE_OF_EACH, true);
    expect(ro).toContain('data-testid="bodychart-legend"');
    for (const { label } of NINE) expect(ro).toContain(label);
  });
});

describe("BodyChart existing markers (ruling G) — type-driven render, no stored-data change", () => {
  it("renders pre-existing { marker_type, x, y, view } markers with the new visuals", () => {
    // A draft saved BEFORE this loop carries only the four keys — no shape/colour
    // was stored. The new render is derived purely from marker_type.
    const preExisting: Marker[] = [
      { marker_type: "scar", x: 0.3, y: 0.2, view: "anterior" },
      { marker_type: "pain_location", x: 0.6, y: 0.7, view: "anterior" },
    ];
    const html = render(preExisting);
    const shapes = onChartShapes(html);
    expect(shapes).toEqual(["cross", "circle"]);
    // The stored marker keys are untouched — the list still shows each label.
    expect(html).toContain("Cicatriz");
    expect(html).toContain("Local da dor");
  });

  it("adds NO new stored key — the render reads only marker_type (shape) and x/y (position)", () => {
    // Exhaustive four-key object; TypeScript's Marker is still
    // { marker_type, x, y, view }. Rendering must not require any other key.
    const marker: Marker = { marker_type: "hypertonicity", x: 0.5, y: 0.5, view: "anterior" };
    expect(Object.keys(marker).sort()).toEqual(["marker_type", "view", "x", "y"]);
    const html = render([marker]);
    expect(html).toContain('data-marker-type="hypertonicity" data-marker-shape="triangle"');
  });
});

describe("BodyChart placement gating (ruling G) — unchanged by the render swap", () => {
  it("editable: the chart is an interactive application with the marker-type select", () => {
    const html = render(ONE_OF_EACH, false);
    expect(html).toContain('role="application"');
    expect(html).toContain("<select");
  });

  it("read-only: markers + legend render, but no application role and no select", () => {
    const html = render(ONE_OF_EACH, true);
    expect(onChartShapes(html)).toHaveLength(9);
    expect(html).toContain('data-testid="bodychart-legend"');
    expect(html).not.toContain('role="application"');
    expect(html).not.toContain("<select");
  });
});
