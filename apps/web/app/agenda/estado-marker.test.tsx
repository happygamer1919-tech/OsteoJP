import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EstadoMarker } from "./estado-marker";
import { ESTADO_COLOR_CLASS, ESTADOS, type Estado } from "@/lib/scheduling/estado";

// W12-11 R10: the leading estado glyph. Rendered to static markup (node env).

const LABEL: Record<Estado, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  concluida: "Concluída",
  cancelada: "Cancelada",
  falta: "Falta",
};

describe("EstadoMarker — five-estado glyph language (colour-not-only)", () => {
  it("carries data-estado, the estado colour token, and the estado in aria-label for every estado", () => {
    for (const estado of ESTADOS) {
      const html = renderToStaticMarkup(<EstadoMarker estado={estado} />);
      expect(html).toContain(`data-estado="${estado}"`);
      expect(html).toContain(ESTADO_COLOR_CLASS[estado]);
      // estado is announced as TEXT via aria-label, never colour alone (WCAG 1.4.1)
      expect(html).toContain(`aria-label="Estado: ${LABEL[estado]}"`);
      expect(html).toContain('role="img"');
    }
  });

  it("renders NO visible text on the compact face (showLabel omitted)", () => {
    const html = renderToStaticMarkup(<EstadoMarker estado="confirmada" />);
    const visible = html.replace(/<[^>]*>/g, "").trim();
    expect(visible).toBe("");
  });

  it("renders the visible estado label in the hover (showLabel)", () => {
    const html = renderToStaticMarkup(<EstadoMarker estado="cancelada" showLabel />);
    const visible = html.replace(/<[^>]*>/g, "").trim();
    expect(visible).toBe("Cancelada");
  });

  it("Cancelada uses a red glyph and is NOT a strikethrough; Confirmada uses green (tick)", () => {
    const cancelada = renderToStaticMarkup(<EstadoMarker estado="cancelada" />);
    expect(cancelada).toContain("text-error");
    expect(cancelada).not.toContain("line-through");

    const confirmada = renderToStaticMarkup(<EstadoMarker estado="confirmada" />);
    expect(confirmada).toContain("text-success");
  });
});
