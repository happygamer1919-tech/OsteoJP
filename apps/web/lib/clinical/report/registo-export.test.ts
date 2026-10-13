/**
 * registo-export.test.ts: EXPORT-01. THE PDF OF A REGISTO THE PAGE DRAWS
 * WITHOUT A FORM HOLDS WHAT THE PAGE SHOWS, AN ANNULLED REGISTO PRINTS ITS
 * MARK, AND A DRAFT IS NEVER PRINTED.
 *
 * The comparison is with THE SCREEN, not with the function both read: the real
 * component the registo page draws (`ImportedRecordPreview`, and
 * `StoredRecordContent` under the neutral heading) is rendered to markup, its
 * field names and values are read out of that markup, and the PDF model and the
 * PDF's own drawn text are held against them. If either side stopped using the
 * shared mapping (lib/clinical/stored-content.ts), the two would part here.
 *
 *   G1  an imported registo: the same field names, the same values, the same
 *       order, under the screen's heading and its read-only notice.
 *   G3  an annulled registo prints the mark on every page; a draft is refused
 *       before any model exists, annulled or not.
 *
 * Invented patient, invented text. The reads behind these inputs, on real rows
 * and under RLS, are registo-export.db.test.ts's.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

import { ImportedRecordPreview } from "@/app/clinical/[id]/imported-record-preview";
import { StoredRecordContent } from "@/app/clinical/[id]/stored-record-content";
import { drawnLines, screenFields, squash, words } from "./drawn-lines-test-fixture";
import { renderClinicalReportPdf } from "./pdf";
import {
  buildClinicalReportModel,
  RecordNotPrintableError,
  type ReportInputs,
  type ReportRecordInput,
} from "./report-model";

const pt = getStrings("pt");
const en = getStrings("en");

/** What the importer stores: vendor column names, values of several shapes. */
const IMPORTED_DATA: Record<string, unknown> = {
  queixas: "Lombalgia inventada ha tres semanas",
  motivos: "Dor ao levantar pesos",
  "Diagnóstico Fisio": "Disfunção lombar inventada",
  antecedentes: "Linha um\nLinha dois",
  sessoes: 12,
  alta: false,
  // Skipped on the screen: they mean "not stored".
  vazio: "   ",
  nulo: null,
  // No plain text form: the screen prints its JSON, and so must the PDF.
  escala: { eva: 7, local: "lombar" },
  zonas: ["L4", "L5"],
};

function inputs(over: Partial<ReportRecordInput> = {}): ReportInputs {
  return {
    record: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "locked",
      aiReviewState: null,
      version: 1,
      episodeId: "77777777-7777-4777-8777-777777777771",
      data: IMPORTED_DATA,
      view: "imported",
      annulledAt: null,
      consultationDate: new Date("2024-05-10T23:00:00Z"),
      signedAt: null,
      ...over,
    },
    patient: { fullName: "Zzz Paciente Inventado", dateOfBirth: "1985-03-09", nif: "999000111" },
    practitioner: { fullName: "Zzz Terapeuta Inventado", title: null, signedByName: null },
    clinic: { fiscalName: "Clinica Inventada, Lda.", nif: "999000222" },
    location: { name: "Linda-a-Velha", address: null, phone: null },
  };
}

describe("G1: the PDF of an IMPORTED registo holds the fields the screen shows", () => {
  const html = renderToStaticMarkup(createElement(ImportedRecordPreview, { data: IMPORTED_DATA }));
  const onScreen = screenFields(html);

  it("CONTROL: the screen draws the eight stored fields that hold something, under their source names", () => {
    expect(onScreen.map((f) => f.name)).toEqual([
      "queixas",
      "motivos",
      "Diagnóstico Fisio",
      "antecedentes",
      "sessoes",
      "alta",
      "escala",
      "zonas",
    ]);
    expect(onScreen.find((f) => f.name === "sessoes")?.value).toBe("12");
    expect(onScreen.find((f) => f.name === "alta")?.value).toBe("false");
    expect(onScreen.find((f) => f.name === "escala")?.value).toBe(JSON.stringify({ eva: 7, local: "lombar" }, null, 2));
    expect(html).toContain(pt["clinical.importedPreviewTitle"]);
    expect(html).toContain(pt["clinical.importedPreviewHelp"]);
  });

  it("the PDF model lists the same names with the same values, in the same order", () => {
    const model = buildClinicalReportModel(inputs(), "pt");
    expect(model.stored).not.toBeNull();
    expect(model.stored!.origin).toBe("imported");
    expect(model.stored!.entries).toEqual(onScreen);
    // The template body is not read out of imported content.
    expect(model.body).toEqual([]);
  });

  it("the PDF draws the screen's heading, its read-only notice, and every name and value", async () => {
    const bytes = await renderClinicalReportPdf(buildClinicalReportModel(inputs(), "pt"), "pt");
    const pages = await drawnLines(bytes);
    const lines = pages.flat();
    const text = words(lines);

    expect(lines).toContain(pt["clinical.importedPreviewTitle"]);
    expect(text).toContain(squash(pt["clinical.importedPreviewHelp"]));
    expect(pt["clinical.importedPreviewHelp"]).toMatch(/nomes de campo de origem\. Apenas leitura\.$/);
    for (const field of onScreen) {
      // A name is drawn on a line of its own, exactly as stored.
      expect(lines, field.name).toContain(field.name);
      expect(text, field.name).toContain(squash(field.value));
    }
    // In the screen's order.
    const at = onScreen.map((f) => lines.indexOf(f.name));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    // Nothing the screen skips is drawn.
    expect(lines).not.toContain("vazio");
    expect(lines).not.toContain("nulo");
    // No house field label is put over imported content: `queixas` stays
    // `queixas`, although the template body would read it as its complaints.
    expect(lines).not.toContain(pt["report.body.mainComplaints"]);
    expect(lines).not.toContain(pt["report.body.diagnosis"]);
    expect(lines).not.toContain(pt["report.body.background"]);
  });

  it("the English PDF draws the English heading and notice over the same stored names", async () => {
    const bytes = await renderClinicalReportPdf(buildClinicalReportModel(inputs(), "en"), "en");
    const lines = (await drawnLines(bytes)).flat();
    expect(lines).toContain(en["clinical.importedPreviewTitle"]);
    expect(words(lines)).toContain(squash(en["clinical.importedPreviewHelp"]));
    for (const field of onScreen) expect(lines, field.name).toContain(field.name);
  });

  it("an imported registo with nothing stored prints the screen's own line for that", async () => {
    const empty = { vazio: " ", nulo: null };
    const screen = renderToStaticMarkup(createElement(ImportedRecordPreview, { data: empty }));
    expect(screen).toContain(pt["clinical.importedNoContent"]);
    const model = buildClinicalReportModel(inputs({ data: empty }), "pt");
    expect(model.stored).toEqual({ origin: "imported", entries: [] });
    const lines = (await drawnLines(await renderClinicalReportPdf(model, "pt"))).flat();
    expect(words(lines)).toContain(pt["clinical.importedNoContent"]);
  });

  it("an imported registo nobody signed here prints no signature block; a signed one prints it", async () => {
    const unsigned = (await drawnLines(await renderClinicalReportPdf(buildClinicalReportModel(inputs(), "pt"), "pt"))).flat();
    expect(unsigned).not.toContain(pt["report.signature.heading"]);
    const signedModel = buildClinicalReportModel(
      inputs({ status: "signed", signedAt: new Date("2026-05-21T16:00:00Z") }),
      "pt",
    );
    const signed = (await drawnLines(await renderClinicalReportPdf(signedModel, "pt"))).flat();
    expect(signed).toContain(pt["report.signature.heading"]);
  });

  it("a stored value the PDF font cannot draw, and a word longer than the line, do not fail the document", async () => {
    const long = "x".repeat(400);
    const model = buildClinicalReportModel(
      inputs({ data: { queixas: "Dor ≥ 7 na escala \u{1F600}", referencia: long } }),
      "pt",
    );
    const lines = (await drawnLines(await renderClinicalReportPdf(model, "pt"))).flat();
    expect(lines).toContain("Dor ? 7 na escala ?");
    // Every character of the long word is drawn, over several lines.
    const pieces = lines.filter((l) => /^x+$/.test(l));
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join("")).toBe(long);
  });
});

describe("G1: a registo with no template that the importer did not write prints as its neutral view", () => {
  const data = { nota: "Texto inventado do registo", valor: 3 };
  const html = renderToStaticMarkup(
    createElement(StoredRecordContent, {
      data,
      title: pt["clinical.recordContentTitle"],
      help: pt["clinical.recordContentHelp"],
      emptyText: pt["clinical.recordNoContent"],
      testId: "record-content",
      emptyTestId: "record-content-empty",
    }),
  );

  it("the same names and values as the screen, under the neutral heading, never the imported one", async () => {
    const model = buildClinicalReportModel(inputs({ view: "neutral", data }), "pt");
    expect(model.stored).toEqual({ origin: "other", entries: screenFields(html) });
    const lines = (await drawnLines(await renderClinicalReportPdf(model, "pt"))).flat();
    expect(lines).toContain(pt["clinical.recordContentTitle"]);
    expect(words(lines)).toContain(squash(pt["clinical.recordContentHelp"]));
    expect(lines).not.toContain(pt["clinical.importedPreviewTitle"]);
    expect(lines).toContain("nota");
    expect(lines).toContain("Texto inventado do registo");
  });
});

describe("CONTROL: a registo with a template still prints the template body", () => {
  it("no stored-content block, the house labels, the signature block", async () => {
    const model = buildClinicalReportModel(
      inputs({ view: "form", data: { consultationReason: "Motivo inventado", campo_de_origem: "nao e lido aqui" } }),
      "pt",
    );
    expect(model.stored).toBeNull();
    expect(model.body).toEqual([{ key: "consultationReason", value: "Motivo inventado" }]);
    const lines = (await drawnLines(await renderClinicalReportPdf(model, "pt"))).flat();
    expect(lines).toContain(pt["report.body.consultationReason"]);
    expect(lines).toContain(pt["report.signature.heading"]);
    expect(lines).not.toContain(pt["clinical.importedPreviewTitle"]);
    expect(lines).not.toContain(pt["clinical.recordContentTitle"]);
    expect(lines).not.toContain("campo_de_origem");
    expect(lines).not.toContain("nao e lido aqui");
  });
});

describe("G3: an annulled registo is printed, and every page carries the annulment mark", () => {
  const MARK = pt["clinical.recordAnulado"];
  const annulledAt = new Date("2026-09-22T09:00:00Z");
  /** Enough stored text to run over several pages. */
  const longData = Object.fromEntries(
    Array.from({ length: 90 }, (_, i) => [`campo_${i + 1}`, `Valor inventado ${i + 1} do campo.`]),
  );

  it("the mark is the word the Registos tab's badge shows", () => {
    expect(MARK).toBe("ANULADO");
    expect(en["clinical.recordAnulado"]).toBe("ANNULLED");
  });

  it.each([
    ["an imported registo", { view: "imported" as const }],
    ["a signed registo with a template", { view: "form" as const, status: "signed" as const, signedAt: new Date("2026-05-21T16:00:00Z"), data: { consultationReason: "Motivo inventado" } }],
    ["a registo with no template", { view: "neutral" as const }],
  ])("%s that is annulled is NOT refused: it prints, marked, with the annulment's date", async (_label, over) => {
    const model = buildClinicalReportModel(inputs({ ...over, annulledAt }), "pt");
    expect(model.annulment).toEqual({ annulledAt: "22/09/2026" });
    const pages = await drawnLines(await renderClinicalReportPdf(model, "pt"));
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      // The word across the page, and the boxed word with the date.
      expect(page).toContain(MARK);
      expect(page).toContain(`${MARK} · 22/09/2026`);
    }
    // The content is still there: the mark is added, nothing is withheld.
    expect(pages.flat()).toContain(pt["report.patient.heading"]);
  });

  it("a registo of several pages carries the mark on EVERY page, not only the first", async () => {
    const model = buildClinicalReportModel(inputs({ data: longData, annulledAt }), "pt");
    const pages = await drawnLines(await renderClinicalReportPdf(model, "pt"));
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.map((page) => page.filter((line) => line === MARK).length)).toEqual(pages.map(() => 1));
    expect(pages.map((page) => page.filter((line) => line.startsWith(`${MARK} ·`)).length)).toEqual(
      pages.map(() => 1),
    );
  });

  it("the English PDF prints the English mark", async () => {
    const model = buildClinicalReportModel(inputs({ annulledAt }), "en");
    const pages = await drawnLines(await renderClinicalReportPdf(model, "en"));
    for (const page of pages) expect(page).toContain("ANNULLED");
  });

  it("CONTROL: a registo that is not annulled carries no mark on any page", async () => {
    const model = buildClinicalReportModel(inputs({ data: longData }), "pt");
    expect(model.annulment).toBeNull();
    const pages = await drawnLines(await renderClinicalReportPdf(model, "pt"));
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.flat().filter((line) => line.includes(MARK))).toEqual([]);
  });
});

describe("G3: a draft is never printed", () => {
  it.each([
    ["an imported draft", { view: "imported" as const }],
    ["a draft with a template", { view: "form" as const }],
    ["a draft with no template", { view: "neutral" as const }],
    ["an AI recording draft", { view: "ai_recording" as const }],
    ["an ANNULLED draft", { view: "imported" as const, annulledAt: new Date("2026-09-22T09:00:00Z") }],
  ])("%s: refused before any model exists", (_label, over) => {
    expect(() => buildClinicalReportModel(inputs({ ...over, status: "draft" }), "pt")).toThrow(RecordNotPrintableError);
  });

  it.each(["pending_review", "in_review"])("a registo under AI review (%s) is refused even if it reads finalized", (ai) => {
    expect(() => buildClinicalReportModel(inputs({ aiReviewState: ai }), "pt")).toThrow(RecordNotPrintableError);
  });
});
