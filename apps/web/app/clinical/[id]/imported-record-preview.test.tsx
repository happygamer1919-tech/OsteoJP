import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { getStrings } from "@osteojp/i18n";

import { ImportedRecordPreview } from "./imported-record-preview";

const pt = getStrings("pt");
const render = (data: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(ImportedRecordPreview, { data }));

/**
 * THE ONE PROPERTY WORTH GUARDING IS THAT NOTHING IS SILENTLY DROPPED.
 *
 * An absent preview line and a value that was never imported look identical on
 * a screen, and only one of them is a data question. So every key with content
 * must appear — including the ones whose value has no pretty rendering — and
 * the values that ARE absent must be absent for a stated reason rather than by
 * accident.
 *
 * This is a pure render test. It never opens a record and never reads a screen;
 * `apps/web/e2e/imported-record-preview.spec.ts` is what does that.
 */
describe("ImportedRecordPreview — the stored data, under its own names", () => {
  it("renders every key verbatim beside its value", () => {
    const html = render({ queixas: "Lombalgia", especialidade: "Osteopatia" });
    expect(html).toContain("queixas");
    expect(html).toContain("Lombalgia");
    expect(html).toContain("especialidade");
    expect(html).toContain("Osteopatia");
  });

  it("keeps a numeric 0, because zero is an answer and not an absence", () => {
    // The adapter includes escala_eva whenever the column holds a number,
    // precisely so a recorded 0 does not become "not asked". The preview must
    // not undo that with a falsy check.
    const html = render({ escala_eva: 0 });
    expect(html).toContain("escala_eva");
    expect(html).toContain(">0<");
  });

  it("keeps `false`, for the same reason", () => {
    const html = render({ consentimento: false });
    expect(html).toContain("consentimento");
    expect(html).toContain("false");
  });

  it("prints a nested value as JSON rather than skipping it", () => {
    const html = render({ sistemas: { neurologico: "sem alteracoes" } });
    expect(html).toContain("sistemas");
    expect(html).toContain("neurologico");
    expect(html).toContain("sem alteracoes");
  });

  it("omits null, undefined and blank strings — the adapter never stores those", () => {
    const html = render({ vazio: "", ausente: null, indefinido: undefined, real: "presente" });
    expect(html).toContain("real");
    expect(html).toContain("presente");
    expect(html).not.toContain("vazio");
    expect(html).not.toContain("ausente");
    expect(html).not.toContain("indefinido");
  });

  it("says so plainly when the record carries no content at all", () => {
    // "the viewer cannot draw it" and "there is nothing to draw" are different
    // answers, and the clinic must be able to tell them apart.
    const html = render({});
    expect(html).toContain(pt["clinical.importedNoContent"]);
    expect(html).not.toContain(pt["clinical.importedPreviewTitle"]);
  });

  it("renders no input, no textarea and no form — read-only by construction", () => {
    const html = render({ queixas: "Lombalgia", escala_eva: 6 });
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
  });
});
