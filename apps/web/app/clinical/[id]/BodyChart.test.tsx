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

// The nine frozen marker_type values (osteopathy bodychart enum) with their
// authoritative pt-PT labels and the palette HUE token each maps to. W5-28 keeps
// the W5-25 hue per type (`marker-<type>`); the fill/stroke UTILITY may differ per
// Fisiozero glyph (some are stroke-based), so the proof asserts the hue token, not
// the fill/stroke prefix. `shape` is the new Fisiozero glyph identifier.
const NINE: { value: string; label: string; token: string; shape: string }[] = [
  { value: "blockage_dysfunction", label: "Bloqueio / Disfunção", token: "marker-blockage", shape: "triangle_up" },
  { value: "scar", label: "Cicatriz", token: "marker-scar", shape: "scar_hatch" },
  { value: "hypertonicity", label: "Hipertonicidade", token: "marker-hypertonicity", shape: "crosshatch" },
  { value: "hypotonicity", label: "Hipotonicidade", token: "marker-hypotonicity", shape: "hatch_ellipse" },
  { value: "pain_radiation", label: "Irradiação da dor", token: "marker-radiation", shape: "lightning" },
  { value: "pain_location", label: "Local da dor", token: "marker-location", shape: "target" },
  { value: "paresthesia", label: "Parestesia", token: "marker-paresthesia", shape: "dotted_ellipse" },
  { value: "rotation_right", label: "Rotação direita", token: "marker-rotation-right", shape: "arrow_cw" },
  { value: "rotation_left", label: "Rotação esquerda", token: "marker-rotation-left", shape: "arrow_ccw" },
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

  it("renders all nine markers on-chart with the NINE DISTINCT Fisiozero glyphs", () => {
    const shapes = onChartShapes(html);
    expect(shapes).toHaveLength(9);
    expect(new Set(shapes).size).toBe(9);
    // The authoritative Fisiozero glyph set (W5-28, supersedes the ruling-G shapes).
    expect(new Set(shapes)).toEqual(
      new Set(["triangle_up", "scar_hatch", "crosshatch", "hatch_ellipse", "lightning", "target", "dotted_ellipse", "arrow_cw", "arrow_ccw"]),
    );
  });

  it("maps each marker_type to its exact Fisiozero glyph", () => {
    for (const { value, shape } of NINE) {
      expect(html).toContain(`data-marker-type="${value}" data-marker-shape="${shape}"`);
    }
  });

  it("renders NINE DISTINCT colour HUE tokens (one per type, unchanged from W5-25, magenta not reused)", () => {
    const tokens = NINE.map((m) => m.token);
    expect(new Set(tokens).size).toBe(9);
    // Each type keeps its W5-25 palette hue (`marker-<type>`), whether applied via
    // fill- or stroke- for its Fisiozero glyph.
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
    expect(shapes).toEqual(["scar_hatch", "target"]);
    // The stored marker keys are untouched — the list still shows each label.
    expect(html).toContain("Cicatriz");
    expect(html).toContain("Local da dor");
  });

  it("adds NO new stored key — the render reads only marker_type (shape) and x/y (position)", () => {
    // W5-25 added no stored key. (W5-26 later adds an OPTIONAL `intensity` on
    // pain_location markers only; a non-pain marker still has exactly these four
    // keys.) Rendering the shape must not require any key beyond marker_type/x/y/view.
    const marker: Marker = { marker_type: "hypertonicity", x: 0.5, y: 0.5, view: "anterior" };
    expect(Object.keys(marker).sort()).toEqual(["marker_type", "view", "x", "y"]);
    const html = render([marker]);
    expect(html).toContain('data-marker-type="hypertonicity" data-marker-shape="crosshatch"');
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
