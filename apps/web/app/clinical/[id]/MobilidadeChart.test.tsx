/**
 * MobilidadeChart.test.tsx — W5-20 (SPEC-ficha-medica.md sec 5.10, AMENDMENTS
 * ruling E). Renders the Mobilidade widget with react-dom/server and pins the
 * ruling-E conformance surface:
 *  - header "Mobilidade Activa / Passiva" + the helper line;
 *  - reference spokes (full vertical + full horizontal + two upper diagonals);
 *  - a marker-type toggle (aria-pressed) — not a <select>;
 *  - an "Inserir marcador" arm action;
 *  - a single record-wide "Limpar marcadores";
 *  - three interactive circles (role=application) when editable;
 *  - read-only: no toggle, no Inserir, no Limpar, and the circles are not
 *    interactive applications.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { s } from "@/lib/i18n";

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/ui", () => ({
  Button: ({
    children,
    disabled,
    "aria-pressed": ariaPressed,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    "aria-pressed"?: boolean;
  }) => createElement("button", { disabled, "aria-pressed": ariaPressed }, children as ReactNode),
}));

import { MobilidadeChart, type MobilidadeValue } from "./MobilidadeChart";

function render(readOnly: boolean, value: MobilidadeValue = {}): string {
  return renderToStaticMarkup(
    createElement(MobilidadeChart, { value, onChange: () => {}, readOnly }),
  );
}

describe("MobilidadeChart — ruling-E conformance (editable)", () => {
  const html = render(false);

  it("renders the header and the helper line", () => {
    expect(html).toContain(s["clinical.mobilidadeHeader"]);
    expect(html).toContain(s["clinical.mobilidadeHelper"]);
  });

  it("renders reference spokes on all three circles (4 lines each = 12)", () => {
    const lines = html.match(/<line /g) ?? [];
    expect(lines.length).toBe(12);
    // the two upper diagonals reach the 45° circle-edge points
    expect(html).toContain('x2="14.6"');
    expect(html).toContain('x2="85.4"');
  });

  it("renders a marker-type toggle (aria-pressed), not a <select>", () => {
    expect(html).not.toContain("<select");
    expect(html).toContain(s["clinical.mobilidadeActiva"]);
    expect(html).toContain(s["clinical.mobilidadePassiva"]);
    // Activa is the default selection → aria-pressed true is present somewhere.
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders an 'Inserir marcador' arm action", () => {
    expect(html).toContain(s["clinical.mobilidadeInsert"]);
  });

  it("renders exactly one record-wide 'Limpar marcadores' action", () => {
    const clears = html.split(s["clinical.mobilidadeClear"]).length - 1;
    expect(clears).toBe(1);
  });

  it("renders three interactive circles (role=application)", () => {
    const apps = html.match(/role="application"/g) ?? [];
    expect(apps.length).toBe(3);
    for (const region of ["Cervical", "Dorsal", "Lombar"]) {
      expect(html).toContain(`aria-label="${region}"`);
    }
  });
});

describe("MobilidadeChart — read-only", () => {
  const html = render(true, { cervical: [{ marker_type: "activa", x: 0.3, y: 0.3 }] });

  it("renders no toggle / Inserir / Limpar and no interactive circles", () => {
    expect(html).not.toContain(s["clinical.mobilidadeInsert"]);
    expect(html).not.toContain(s["clinical.mobilidadeClear"]);
    expect(html).not.toContain('role="application"');
    // the placed marker still renders (read-only view keeps stored markers)
    expect(html).toContain('data-marker="activa"');
    // spokes remain in the read-only view (4 per circle × 3)
    expect((html.match(/<line /g) ?? []).length).toBe(12);
  });
});
