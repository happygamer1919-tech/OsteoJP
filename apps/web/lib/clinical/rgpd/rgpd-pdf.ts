// RGPD print-and-sign form renderer (SPEC-ficha-medica.md sec 7.2), pdf-lib.
//
// Why pdf-lib: it is ALREADY the repo's PDF engine (lib/clinical/report/pdf.ts)
// — pure JS, no native binary and no headless browser, so it runs in Vercel
// `fra1` / serverless, EU-only, with NO new dependency (CLAUDE.md owner-gate on
// new vendors is NOT triggered). Deterministic byte buffer, easy to smoke-test.
//
// Layout: an A4 page with the OsteoJP branded header (vector mark + clinic
// fiscal identification), the printing-location contact block, the patient
// identity line, the three RGPD/consent bodies (PENDENTE-JP placeholder wording
// from the i18n consent keys), an explicit Consinto / Não consinto tick line per
// item, and a hand-signature block for print-and-sign.
//
// Labels + bodies are i18n (PT/EN). No PII is logged here — this module only
// draws into the document.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getStrings, type Locale, type StringKey } from "@osteojp/i18n";
import { CONSENT_ITEM_KEYS, CONSENT_ITEM_STRINGS } from "../consent";
import type { RgpdFormModel } from "./rgpd-model";

// Brand tokens (CLAUDE.md).
const TEAL = rgb(0x45 / 255, 0xb9 / 255, 0xa7 / 255);
const MAGENTA = rgb(0x8b / 255, 0x18 / 255, 0x63 / 255);
const INK = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.4, 0.4, 0.4);

// A4 in points.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

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

/** A cursor that draws top-down and adds A4 pages when it runs out of room. */
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
      this.page.drawText(line, {
        x: opts.x ?? MARGIN,
        y: this.y,
        size,
        font,
        color: opts.color ?? INK,
      });
    }
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
function drawHeader(cur: Cursor, model: RgpdFormModel, s: Record<StringKey, string>) {
  const top = cur.y;
  // Brand mark: a teal rounded square with a magenta accent bar (matches the
  // clinical-report header — one visual language).
  cur.page.drawRectangle({ x: MARGIN, y: top - 26, width: 26, height: 26, color: TEAL });
  cur.page.drawRectangle({ x: MARGIN + 20, y: top - 26, width: 6, height: 26, color: MAGENTA });
  cur.page.drawText("OsteoJP", {
    x: MARGIN + 34,
    y: top - 20,
    size: 16,
    font: cur.fonts.bold,
    color: MAGENTA,
  });

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

/** Draw the printing-location contact block (address, phones, email). */
function drawLocation(cur: Cursor, model: RgpdFormModel, s: Record<StringKey, string>) {
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

/** Draw one consent item: body wording + an explicit Consinto / Não consinto tick line. */
function drawConsentItem(
  cur: Cursor,
  s: Record<StringKey, string>,
  label: string,
  body: string,
) {
  cur.text(label, { size: 10, bold: true, color: MAGENTA });
  cur.text(body, { size: 9, color: INK });
  cur.gap(2);
  // Explicit blank tick boxes for the printed form — the patient hand-ticks one.
  cur.text(
    `[  ] ${s["clinical.consent.consent"]}      [  ] ${s["clinical.consent.decline"]}`,
    { size: 9, color: MUTED },
  );
  cur.gap(8);
}

/**
 * Render the A4 RGPD print-and-sign form to PDF bytes. The body wording is the
 * PENDENTE-JP placeholder from the i18n consent keys — this document is a DRAFT
 * for print-and-sign until JP finalizes the wording (Q-W5-3).
 */
export async function renderRgpdFormPdf(
  model: RgpdFormModel,
  locale: Locale,
): Promise<Uint8Array> {
  const s = getStrings(locale);
  const doc = await PDFDocument.create();
  doc.setTitle(s["clinical.consent.pdfTitle"]);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const cur = new Cursor(doc, fonts);

  drawHeader(cur, model, s);
  drawLocation(cur, model, s);

  // Title + PENDENTE-JP draft notice.
  cur.text(s["clinical.consent.pdfTitle"], { size: 15, bold: true, color: INK });
  cur.text(s["clinical.consent.pdfDraftNotice"], { size: 8, color: MUTED });
  cur.gap(6);

  // Patient identity line.
  cur.text(s["clinical.consent.patientHeading"], { size: 11, bold: true, color: MAGENTA });
  cur.text(`${s["report.patient.name"]}: ${model.patient.fullName}`, { size: 10 });
  if (model.patient.nif) {
    cur.text(`${s["report.patient.nif"]}: ${model.patient.nif}`, { size: 10 });
  }
  cur.gap(4);
  cur.rule();

  // The three RGPD/consent bodies (PENDENTE-JP), each with an explicit tick line.
  for (const key of CONSENT_ITEM_KEYS) {
    const item = CONSENT_ITEM_STRINGS[key];
    drawConsentItem(cur, s, s[item.label], s[item.body]);
  }

  // Hand-signature block for print-and-sign.
  cur.gap(10);
  cur.rule();
  cur.text(s["clinical.consent.signHeading"], { size: 11, bold: true, color: MAGENTA });
  cur.gap(24);
  cur.page.drawLine({
    start: { x: MARGIN, y: cur.y },
    end: { x: MARGIN + 240, y: cur.y },
    thickness: 0.75,
    color: INK,
  });
  cur.gap(2);
  cur.text(s["clinical.consent.signLine"], { size: 9, color: MUTED });
  cur.gap(8);
  cur.text(`${s["clinical.consent.signDate"]}: ____ / ____ / ________`, { size: 9, color: MUTED });

  // Footer: not a fiscal document.
  cur.page.drawText(s["report.footer.notFiscalDocument"], {
    x: MARGIN,
    y: MARGIN - 16,
    size: 7,
    font: fonts.regular,
    color: MUTED,
  });

  return doc.save();
}
