// Clinical-report PDF renderer (pdf-lib).
//
// Why pdf-lib: pure JS, no native binaries and no headless browser, so it runs
// in Vercel `fra1` / serverless and EU-only with no extra infra, and produces a
// deterministic byte buffer that is easy to smoke-test. The header embeds the
// real OsteoJP logo raster (the canonical Logotipo_OsteoJP_2023 lockup) — the
// same asset the Declaração already ships — so every printed document carries one
// brand identity (W12-30 A1; superseded the earlier drawn teal/magenta stand-in).
//
// Layout: branded header (logo + clinic fiscal identification), printing-location
// contact block, patient + record blocks, the clinical body sections, a
// signature block, and a footer that states this is NOT a fiscal document.
//
// EXPORT-01: a record the registo page draws without a form (an imported one,
// or any other with no template) prints its stored content instead of the
// template body: the page's own heading and read-only notice, then every stored
// key under its own name (the model carries the pairs; nothing is interpreted
// here). An annulled record prints its annulment mark on every page.
//
// Labels are i18n (PT/EN). No PII or fiscal data is logged here — this module
// only draws into the document.

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { getStrings, type Locale, type StringKey } from "@osteojp/i18n";
import { clinicLogoBytes } from "../assets/clinic-logo-asset";
import {
  REPORT_BODY_KEYS,
  type ClinicalReportModel,
  type ReportBodyKey,
  type StoredOrigin,
} from "./report-model";

// Brand tokens (docs/brand-tokens.md). Section headings use INK, not magenta:
// magenta is an accent reserved for the logo lockup, never the standing heading
// colour (W12-30 A3). The hairline rule uses brand neutral-200 (W12-30 A5).
const TEAL = rgb(0x45 / 255, 0xb9 / 255, 0xa7 / 255);
const INK = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0xe2 / 255, 0xe8 / 255, 0xee / 255); // neutral-200 #E2E8EE
// The annulment mark: the brand error colour (docs/brand-tokens.md, --error),
// the colour of the ANULADO badge on the Registos tab.
const ERROR = rgb(0xb2 / 255, 0x3a / 255, 0x3a / 255); // error-700 #B23A3A

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

/**
 * The heading, the read-only notice and the "nothing stored" line of a record
 * printed from its stored content: the registo page's own keys for that view
 * (imported-record-preview.tsx, and the neutral view in page.tsx).
 */
const STORED_KEYS: Record<StoredOrigin, { title: StringKey; help: StringKey; empty: StringKey }> = {
  imported: {
    title: "clinical.importedPreviewTitle",
    help: "clinical.importedPreviewHelp",
    empty: "clinical.importedNoContent",
  },
  other: {
    title: "clinical.recordContentTitle",
    help: "clinical.recordContentHelp",
    empty: "clinical.recordNoContent",
  },
};

type Fonts = { regular: PDFFont; bold: PDFFont };

const charsets = new WeakMap<PDFFont, Set<number>>();

/**
 * `text` with every character the font cannot draw replaced by "?". A standard
 * font draws WinAnsi only and pdf-lib throws on anything else, so one such
 * character in a stored value would otherwise fail the whole document. Line
 * breaks and other whitespace pass through: the wrap below consumes them.
 */
function drawable(text: string, font: PDFFont): string {
  let set = charsets.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charsets.set(font, set);
  }
  let out = "";
  for (const ch of text) {
    out += /\s/.test(ch) || set.has(ch.codePointAt(0)!) ? ch : "?";
  }
  return out;
}

/** Word-wrap `text` to `maxWidth` at `size`, returning lines. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (let word of paragraph.split(/\s+/)) {
      // A single word wider than the line (a long token in stored content) is
      // cut at the margin, so it wraps instead of running off the page.
      while (font.widthOfTextAtSize(word, size) > maxWidth) {
        let cut = 1;
        while (cut < word.length - 1 && font.widthOfTextAtSize(word.slice(0, cut + 1), size) <= maxWidth) cut += 1;
        if (line) lines.push(line);
        lines.push(word.slice(0, cut));
        line = "";
        word = word.slice(cut);
      }
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
    const lines = wrapText(drawable(value, font), font, size, CONTENT_W);
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
      color: RULE,
    });
    this.y -= 4;
  }
}

/** Draw the real embedded logo lockup + clinic fiscal identification at the top. */
function drawHeader(
  cur: Cursor,
  model: ClinicalReportModel,
  s: Record<StringKey, string>,
  logo: PDFImage,
) {
  const top = cur.y;
  // Brand identity: the real OsteoJP logo raster (the same canonical lockup the
  // Declaração embeds), replacing the earlier drawn teal-square + magenta-bar
  // stand-in — one brand mark across every printed document (W12-30 A1).
  const logoH = 40;
  const logoW = (logo.width / logo.height) * logoH;
  cur.page.drawImage(logo, { x: MARGIN, y: top - logoH, width: logoW, height: logoH });

  // Clinic fiscal identification, right-aligned-ish in the header.
  const fiscal = cur.fonts.regular;
  const nifLine = `${s["report.clinic.nif"]}: ${model.clinic.nif}`;
  const nameW = fiscal.widthOfTextAtSize(model.clinic.fiscalName, 10);
  const nifW = fiscal.widthOfTextAtSize(nifLine, 9);
  cur.page.drawText(model.clinic.fiscalName, {
    x: PAGE_W - MARGIN - nameW,
    y: top - 15,
    size: 10,
    font: fiscal,
    color: INK,
  });
  cur.page.drawText(nifLine, {
    x: PAGE_W - MARGIN - nifW,
    y: top - 27,
    size: 9,
    font: fiscal,
    color: MUTED,
  });

  cur.y = top - logoH - 6;
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
 * The annulment mark, on EVERY page of an annulled record: the word the
 * Registos tab's badge shows (with the annulment's date) in a box in the top
 * margin, and the same word across the page. Drawn last, over the finished
 * pages, so a record that runs to several pages cannot lose it on one of them.
 */
function drawAnnulmentMark(doc: PDFDocument, fonts: Fonts, label: string, annulledAt: string | null) {
  const boxText = annulledAt ? `${label} · ${annulledAt}` : label;
  const boxSize = 11;
  const boxW = fonts.bold.widthOfTextAtSize(boxText, boxSize) + 16;
  const boxH = 18;
  const boxX = (PAGE_W - boxW) / 2;
  const boxY = PAGE_H - 34;
  const acrossSize = 84;
  const acrossW = fonts.bold.widthOfTextAtSize(label, acrossSize);
  for (const page of doc.getPages()) {
    page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, borderColor: ERROR, borderWidth: 1.5 });
    page.drawText(boxText, { x: boxX + 8, y: boxY + 5, size: boxSize, font: fonts.bold, color: ERROR });
    page.drawText(label, {
      x: PAGE_W / 2 - (acrossW * Math.SQRT1_2) / 2,
      y: PAGE_H / 2 - (acrossW * Math.SQRT1_2) / 2,
      size: acrossSize,
      font: fonts.bold,
      color: ERROR,
      opacity: 0.15,
      rotate: degrees(45),
    });
  }
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
  const logo = await doc.embedJpg(clinicLogoBytes());
  const cur = new Cursor(doc, fonts);

  drawHeader(cur, model, s, logo);
  drawLocation(cur, model, s);

  // Title.
  cur.text(s["report.clinical.title"], { size: 15, bold: true, color: INK });
  cur.gap(4);

  // Patient block.
  cur.text(s["report.patient.heading"], { size: 11, bold: true, color: INK });
  cur.field(s["report.patient.name"], model.patient.fullName);
  cur.field(s["report.patient.dob"], model.patient.dateOfBirth);
  cur.field(s["report.patient.nif"], model.patient.nif);
  cur.gap(2);

  // Record block.
  cur.text(s["report.record.heading"], { size: 11, bold: true, color: INK });
  cur.field(s["report.record.consultationDate"], model.record.consultationDate);
  cur.field(s["report.record.episode"], model.record.episodeId);
  cur.field(s["report.record.version"], String(model.record.version));
  cur.gap(2);
  cur.rule();

  if (model.stored) {
    // A record with no form: what is stored, as the registo page lists it. The
    // page's heading and read-only notice, then each stored key under the name
    // it is stored with, or the page's own line when nothing is stored.
    const keys = STORED_KEYS[model.stored.origin];
    cur.text(s[keys.title], { size: 11, bold: true, color: INK });
    cur.text(s[keys.help], { size: 9, color: MUTED });
    cur.gap(6);
    if (model.stored.entries.length === 0) cur.text(s[keys.empty], { size: 10 });
    for (const entry of model.stored.entries) cur.field(entry.name, entry.value);
  } else {
    // Clinical body sections, in template order.
    for (const key of REPORT_BODY_KEYS) {
      const field = model.body.find((b) => b.key === key);
      if (!field) continue;
      cur.field(s[BODY_LABEL_KEYS[key]], field.value);
    }
  }

  // The footer and the annulment mark close every document, with or without
  // the signature block below.
  const finish = () => {
    // Footer: this is a clinical document, NOT a fiscal one.
    cur.page.drawText(s["report.footer.notFiscalDocument"], {
      x: MARGIN,
      y: MARGIN - 16,
      size: 7,
      font: fonts.regular,
      color: MUTED,
    });
    if (model.annulment) {
      drawAnnulmentMark(doc, fonts, s["clinical.recordAnulado"], model.annulment.annulledAt);
    }
    return doc.save();
  };

  // Stored content that nobody signed here prints no signature block: an empty
  // signature line under it would invite a signature the record does not have.
  if (model.stored && !model.signature.signedAt) return finish();

  // Signature block.
  cur.gap(18);
  cur.text(s["report.signature.heading"], { size: 11, bold: true, color: INK });
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

  return finish();
}
