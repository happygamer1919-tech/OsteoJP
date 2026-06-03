// Clinical-report PDF renderer (pdf-lib).
//
// Why pdf-lib: pure JS, no native binaries and no headless browser, so it runs
// in Vercel `fra1` / serverless and EU-only with no extra infra, and produces a
// deterministic byte buffer that is easy to smoke-test. The OsteoJP logo is
// drawn as a VECTOR brand mark from the documented brand tokens (teal #45B9A7 /
// magenta #8B1863) — the repo has no official logo asset yet; swap in the real
// raster/SVG from packages/ui once it exists.
//
// Layout: branded header (mark + clinic fiscal identification), printing-location
// contact block, patient + record blocks, the clinical body sections, a
// signature block, and a footer that states this is NOT a fiscal document.
//
// Labels are i18n (PT/EN). No PII or fiscal data is logged here — this module
// only draws into the document.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getStrings, type Locale, type StringKey } from "@osteojp/i18n";
import {
  REPORT_BODY_KEYS,
  type ClinicalReportModel,
  type ReportBodyKey,
} from "./report-model";

// Brand tokens (docs/brand-tokens.md).
const TEAL = rgb(0x45 / 255, 0xb9 / 255, 0xa7 / 255);
const MAGENTA = rgb(0x8b / 255, 0x18 / 255, 0x63 / 255);
const INK = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.4, 0.4, 0.4);

// A4 in points.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

const BODY_LABEL_KEYS: Record<ReportBodyKey, StringKey> = {
  consultationReason: "report.body.consultationReason",
  background: "report.body.background",
  mainComplaints: "report.body.mainComplaints",
  diagnosis: "report.body.diagnosis",
  treatmentGoals: "report.body.treatmentGoals",
  treatmentPlan: "report.body.treatmentPlan",
  observations: "report.body.observations",
};

type Fonts = { regular: PDFFont; bold: PDFFont };

/** Word-wrap `text` to `maxWidth` at `size`, returning lines. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** A cursor that draws top-down and adds pages when it runs out of room. */
class Cursor {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    readonly fonts: Fonts,
  ) {
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  private ensure(space: number) {
    if (this.y - space < MARGIN) {
      this.page = this.doc.addPage([PAGE_W, PAGE_H]);
      this.y = PAGE_H - MARGIN;
    }
  }

  gap(h: number) {
    this.y -= h;
  }

  text(
    value: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const lines = wrapText(value, font, size, CONTENT_W);
    for (const line of lines) {
      this.ensure(size + 4);
      this.y -= size + 2;
      this.page.drawText(line, { x: opts.x ?? MARGIN, y: this.y, size, font, color: opts.color ?? INK });
    }
  }

  /** A labelled value: bold label then the value beneath. Skips empty values. */
  field(label: string, value: string | null) {
    if (!value) return;
    this.text(label, { size: 8, bold: true, color: MUTED });
    this.text(value, { size: 10 });
    this.gap(4);
  }

  rule() {
    this.ensure(8);
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    this.y -= 4;
  }
}

/** Draw the vector brand mark + clinic fiscal identification at the top. */
function drawHeader(cur: Cursor, model: ClinicalReportModel, s: Record<StringKey, string>) {
  const top = cur.y;
  // Brand mark: a teal rounded square with a magenta accent bar.
  cur.page.drawRectangle({ x: MARGIN, y: top - 26, width: 26, height: 26, color: TEAL });
  cur.page.drawRectangle({ x: MARGIN + 20, y: top - 26, width: 6, height: 26, color: MAGENTA });
  cur.page.drawText("OsteoJP", {
    x: MARGIN + 34,
    y: top - 20,
    size: 16,
    font: cur.fonts.bold,
    color: MAGENTA,
  });

  // Clinic fiscal identification, right-aligned-ish in the header.
  const fiscal = cur.fonts.regular;
  const nifLine = `${s["report.clinic.nif"]}: ${model.clinic.nif}`;
  const nameW = fiscal.widthOfTextAtSize(model.clinic.fiscalName, 10);
  const nifW = fiscal.widthOfTextAtSize(nifLine, 9);
  cur.page.drawText(model.clinic.fiscalName, {
    x: PAGE_W - MARGIN - nameW,
    y: top - 12,
    size: 10,
    font: fiscal,
    color: INK,
  });
  cur.page.drawText(nifLine, {
    x: PAGE_W - MARGIN - nifW,
    y: top - 24,
    size: 9,
    font: fiscal,
    color: MUTED,
  });

  cur.y = top - 34;
  cur.rule();
}

/** Draw the printing-location contact block. */
function drawLocation(cur: Cursor, model: ClinicalReportModel, s: Record<StringKey, string>) {
  const c = model.location;
  cur.text(c.name, { size: 11, bold: true, color: TEAL });
  for (const line of c.addressLines) cur.text(line, { size: 9, color: MUTED });
  const cityLine = [c.postalCode, c.city].filter(Boolean).join(" ");
  if (cityLine) cur.text(cityLine, { size: 9, color: MUTED });
  if (c.phones.length > 0) {
    cur.text(`${s["report.contact.phone"]} ${c.phones.join(" · ")}`, { size: 9, color: MUTED });
  }
  if (c.email) cur.text(`${s["report.contact.email"]}: ${c.email}`, { size: 9, color: MUTED });
  cur.gap(6);
  cur.rule();
}

/**
 * Render a finalized clinical record to PDF bytes. The model has already passed
 * the print gate (buildClinicalReportModel → assertPrintable).
 */
export async function renderClinicalReportPdf(
  model: ClinicalReportModel,
  locale: Locale,
): Promise<Uint8Array> {
  const s = getStrings(locale);
  const doc = await PDFDocument.create();
  doc.setTitle(s["report.clinical.title"]);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const cur = new Cursor(doc, fonts);

  drawHeader(cur, model, s);
  drawLocation(cur, model, s);

  // Title.
  cur.text(s["report.clinical.title"], { size: 15, bold: true, color: INK });
  cur.gap(4);

  // Patient block.
  cur.text(s["report.patient.heading"], { size: 11, bold: true, color: MAGENTA });
  cur.field(s["report.patient.name"], model.patient.fullName);
  cur.field(s["report.patient.dob"], model.patient.dateOfBirth);
  cur.field(s["report.patient.nif"], model.patient.nif);
  cur.gap(2);

  // Record block.
  cur.text(s["report.record.heading"], { size: 11, bold: true, color: MAGENTA });
  cur.field(s["report.record.consultationDate"], model.record.consultationDate);
  cur.field(s["report.record.episode"], model.record.episodeId);
  cur.field(s["report.record.version"], String(model.record.version));
  cur.gap(2);
  cur.rule();

  // Clinical body sections, in template order.
  for (const key of REPORT_BODY_KEYS) {
    const field = model.body.find((b) => b.key === key);
    if (!field) continue;
    cur.field(s[BODY_LABEL_KEYS[key]], field.value);
  }

  // Signature block.
  cur.gap(18);
  cur.text(s["report.signature.heading"], { size: 11, bold: true, color: MAGENTA });
  cur.gap(20);
  cur.page.drawLine({
    start: { x: MARGIN, y: cur.y },
    end: { x: MARGIN + 240, y: cur.y },
    thickness: 0.75,
    color: INK,
  });
  cur.gap(2);
  const signer = [model.signature.practitionerName, model.signature.practitionerTitle]
    .filter(Boolean)
    .join(" — ");
  if (signer) cur.text(signer, { size: 10 });
  if (model.signature.signedAt) {
    cur.text(`${s["report.signature.signedAt"]}: ${model.signature.signedAt}`, {
      size: 9,
      color: MUTED,
    });
  }

  // Footer: this is a clinical document, NOT a fiscal one.
  cur.page.drawText(s["report.footer.notFiscalDocument"], {
    x: MARGIN,
    y: MARGIN - 16,
    size: 7,
    font: fonts.regular,
    color: MUTED,
  });

  return doc.save();
}
