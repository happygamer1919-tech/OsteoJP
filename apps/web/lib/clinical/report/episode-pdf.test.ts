import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFPage } from "pdf-lib";
import { mergeReportPdfs } from "./episode-pdf";
import { renderClinicalReportPdf } from "./pdf";
import { buildClinicalReportModel, type ReportInputs } from "./report-model";

// EPI-01b, piece 3: the episode's file is the per-record PDFs joined. What is
// pinned here, on real bytes from the real per-record renderer:
//   - every page of the joined file IS the page the per-record PDF prints (the
//     decoded drawing instructions are equal, page for page);
//   - the parts keep the order they were given in, and a part's pages stay
//     together and in their own order;
//   - joining changes nothing about the per-record PDF: the bytes handed in
//     are untouched, and the per-record renderer gives the same bytes for the
//     same input before and after a join.
// Invented patient, invented text.

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function inputs(marker: string, over: Partial<ReportInputs["record"]> = {}): ReportInputs {
  return {
    record: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "signed",
      aiReviewState: null,
      version: 1,
      episodeId: "77777777-7777-4777-8777-777777777771",
      data: { consultationReason: marker, diagnosis: "Texto inventado" },
      consultationDate: new Date("2026-05-20T09:30:00Z"),
      signedAt: new Date("2026-05-21T16:00:00Z"),
      ...over,
    },
    patient: { fullName: "Zzz Paciente Inventado", dateOfBirth: "1985-03-09", nif: "999000111" },
    practitioner: { fullName: "Zzz Terapeuta Inventado", title: null, signedByName: "Zzz Terapeuta Inventado" },
    clinic: { fiscalName: "Clinica Inventada, Lda.", nif: "999000222" },
    location: { name: "Linda-a-Velha", address: null, phone: null },
  };
}

const single = (marker: string, over: Partial<ReportInputs["record"]> = {}) =>
  renderClinicalReportPdf(buildClinicalReportModel(inputs(marker, over), "pt"), "pt");

/** A registo long enough to print on more than one page. */
const longText = Array.from({ length: 140 }, (_, i) => `Linha inventada ${i + 1} do plano.`).join("\n");

/** The drawing instructions of one page, decoded. */
function content(page: PDFPage): string {
  const contents = page.node.Contents();
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => page.doc.context.lookup(ref))
      : [contents];
  return streams
    .map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1"))
    .join("\n");
}

/** How pdf-lib writes a WinAnsi string drawn with a standard font: hex. */
const drawn = (text: string) => Buffer.from(text, "latin1").toString("hex").toUpperCase();

async function pagesOf(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map(content);
}

beforeEach(() => {
  // pdf-lib stamps the creation and modification dates: a fixed clock makes
  // two renders of the same input comparable byte for byte.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("mergeReportPdfs: the pages are the per-record PDF's own", () => {
  it("one registo: the joined file's pages are the per-record PDF's pages, instruction for instruction", async () => {
    const one = await single("MARCA-ALFA");
    const joined = await mergeReportPdfs([one], "Relatório Clínico");
    expect(Buffer.from(joined.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const [a, b] = [await pagesOf(one), await pagesOf(joined)];
    expect(b).toEqual(a);
    // The control: the page really carries the registo's text.
    expect(a.join("\n")).toContain(drawn("MARCA-ALFA"));
  });

  it("three registos, the second two pages long: every page is kept, in the order given", async () => {
    const [first, second, third] = [
      await single("MARCA-ALFA"),
      await single("MARCA-BETA", { data: { consultationReason: "MARCA-BETA", treatmentPlan: longText } }),
      await single("MARCA-GAMA"),
    ];
    const each = [await pagesOf(first), await pagesOf(second), await pagesOf(third)];
    expect(each.map((p) => p.length)).toEqual([1, each[1]!.length, 1]);
    expect(each[1]!.length).toBeGreaterThan(1);

    const joined = await pagesOf(await mergeReportPdfs([first, second, third], "Relatório Clínico"));
    expect(joined).toEqual([...each[0]!, ...each[1]!, ...each[2]!]);
    const where = (marker: string) => joined.findIndex((p) => p.includes(drawn(marker)));
    expect([where("MARCA-ALFA"), where("MARCA-BETA"), where("MARCA-GAMA")]).toEqual([0, 1, joined.length - 1]);
  });

  it("the order is the caller's: the same parts given in reverse come out in reverse", async () => {
    const [first, second] = [await single("MARCA-ALFA"), await single("MARCA-BETA")];
    const forward = await pagesOf(await mergeReportPdfs([first, second], "Relatório Clínico"));
    const backward = await pagesOf(await mergeReportPdfs([second, first], "Relatório Clínico"));
    expect(forward[0]).toContain(drawn("MARCA-ALFA"));
    expect(forward[1]).toContain(drawn("MARCA-BETA"));
    expect(backward).toEqual([forward[1], forward[0]]);
  });

  it("each registo keeps the clinic's header in the joined file: its logo is still drawn on its page", async () => {
    const [first, second] = [await single("MARCA-ALFA"), await single("MARCA-BETA")];
    const doc = await PDFDocument.load(await mergeReportPdfs([first, second], "Relatório Clínico"));
    for (const page of doc.getPages()) {
      // An image is drawn with the `Do` operator, on a named XObject of the page.
      expect(content(page)).toMatch(/\/[^\s]+ Do/);
      expect(page.node.Resources()?.toString()).toContain("/XObject");
    }
  });

  it("the document carries the title it was given", async () => {
    const doc = await PDFDocument.load(await mergeReportPdfs([await single("MARCA-ALFA")], "Relatório Clínico"), {
      updateMetadata: false,
    });
    expect(doc.getTitle()).toBe("Relatório Clínico");
  });
});

describe("the per-record PDF is what it was: a join reads its bytes and changes none", () => {
  it("the same input renders to the same bytes before and after a join, and the bytes handed in are untouched", async () => {
    const before = await single("MARCA-ALFA");
    const pin = sha256(before);
    const other = await single("MARCA-BETA");

    await mergeReportPdfs([before, other], "Relatório Clínico");

    expect(sha256(before)).toBe(pin);
    expect(sha256(await single("MARCA-ALFA"))).toBe(pin);
  });
});
