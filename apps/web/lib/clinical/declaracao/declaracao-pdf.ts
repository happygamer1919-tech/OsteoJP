// W5-31 — Declaração de Presença renderer (Fisiozero attendance-declaration
// template), pdf-lib. Reuses the repo's existing PDF engine (lib/clinical/report,
// lib/clinical/rgpd) — pure JS, serverless/EU-safe, NO new vendor. StandardFonts.
// Helvetica renders pt-PT accents (WinAnsi / CP1252), same font path the RGPD PDF
// already validates.
//
// The declaration BODY is verbatim pt-PT legal text (constants below). The
// responsável name is NOT hardcoded here — it arrives on `model.responsavel`
// (config layer, declaracao-settings.ts). The signature + carimbo image is
// embedded only when `model.stampBytes` is present, else blank vertical space is
// left for a physical stamp.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { clinicLogoBytes } from "../assets/clinic-logo-asset";
import type { DeclaracaoModel } from "./declaracao-model";

// (The teal brand hex lives in the embedded mark itself now - W5-31's
// hand-drawn teal rectangle was replaced by the real logo raster in W9-03.)
// (The magenta wordmark hex lived in the drawn stand-in; the embedded lockup
// carries the brand colours now - W9-03b.)
const INK = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.4, 0.4, 0.4);
// W12-30 C1: brand tokens for the branded contacts + fiscal footer. Teal names
// the clinic (matching the report/RGPD location block); neutral-200 is the
// hairline rule.
const TEAL = rgb(0x45 / 255, 0xb9 / 255, 0xa7 / 255);
const RULE = rgb(0xe2 / 255, 0xe8 / 255, 0xee / 255); // neutral-200 #E2E8EE

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 64;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Verbatim Fisiozero template text (pt-PT). Placeholders interpolated for para 1.
export const DECLARACAO_TITLE = "Declaração de Presença";
export function declaracaoParagraph1(m: DeclaracaoModel): string {
  // W12-24: name the NIF right after the patient when present (identifies the
  // person on a semi-legal document); omitted entirely when no NIF was entered.
  const nif = m.nif ? `, portador(a) do NIF ${m.nif},` : "";
  return `Para os devidos efeitos se declara que ${m.patientName}${nif} esteve em tratamento nas nossas instalações no dia ${m.dia} entre as ${m.horaInicio} e as ${m.horaFim}.`;
}
export const DECLARACAO_PARAGRAPH_2 =
  "Por ser verdade se passa a presente declaração que vai assinada pelo responsável dos serviços e autenticada com o carimbo em uso nesta clínica.";

/**
 * The ordered body paragraphs drawn between the title and the "{localidade}, {dia}"
 * line. PL-03a: the optional free-text observações sits BETWEEN the treatment
 * sentence (paragraph 1) and the "Por ser verdade" paragraph (paragraph 2), and
 * ONLY when non-empty - so an empty observações leaves the body identical to
 * before (no stray block). Pure + exported so the ordering is unit-testable
 * without extracting text from the rendered PDF.
 */
export function declaracaoBodyParagraphs(m: DeclaracaoModel): string[] {
  return [
    declaracaoParagraph1(m),
    ...(m.observacoes ? [m.observacoes] : []),
    DECLARACAO_PARAGRAPH_2,
  ];
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * W12-30 C1 — the branded contacts + fiscal footer required on every printed
 * declaration (CLAUDE.md print-branding rule). Anchored to the page foot and
 * centered to match the declaration's centered layout. Reuses the SAME data the
 * report/RGPD footers draw (model.contact from resolveLocationContact,
 * model.fiscal from resolveClinicFiscal). The verbatim legal BODY is untouched;
 * this only adds the surrounding chrome.
 */
function drawFooter(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  model: DeclaracaoModel,
): void {
  const c = model.contact;
  const lines: { text: string; size: number; color: ReturnType<typeof rgb>; font: PDFFont }[] = [];
  if (c) {
    lines.push({ text: c.name, size: 9, color: TEAL, font: fonts.bold });
    for (const a of c.addressLines) {
      lines.push({ text: a, size: 8, color: MUTED, font: fonts.regular });
    }
    const cityLine = [c.postalCode, c.city].filter(Boolean).join(" ");
    if (cityLine) lines.push({ text: cityLine, size: 8, color: MUTED, font: fonts.regular });
    if (c.phones.length > 0) {
      lines.push({ text: `Tel.: ${c.phones.join(" · ")}`, size: 8, color: MUTED, font: fonts.regular });
    }
    if (c.email) {
      lines.push({ text: `Email: ${c.email}`, size: 8, color: MUTED, font: fonts.regular });
    }
  }
  // Clinic fiscal identity always prints (placeholders when the tenant has none).
  lines.push({
    text: `${model.fiscal.fiscalName} · NIF: ${model.fiscal.nif}`,
    size: 8,
    color: MUTED,
    font: fonts.regular,
  });

  const lineGap = 3;
  const totalTextH = lines.reduce((h, l) => h + l.size + lineGap, 0);
  const footerBottom = 40; // sits just above the physical page foot
  const ruleY = footerBottom + totalTextH + 8;

  // Hairline rule above the block (brand neutral-200), spanning the content width.
  page.drawLine({
    start: { x: MARGIN, y: ruleY },
    end: { x: PAGE_W - MARGIN, y: ruleY },
    thickness: 0.5,
    color: RULE,
  });

  let y = ruleY - 10;
  for (const l of lines) {
    const w = l.font.widthOfTextAtSize(l.text, l.size);
    page.drawText(l.text, { x: (PAGE_W - w) / 2, y, size: l.size, font: l.font, color: l.color });
    y -= l.size + lineGap;
  }
}

/** Render the Declaração de Presença to PDF bytes. The legal body is verbatim
 *  pt-PT, so no locale is taken (unlike the RGPD/report renderers). */
export async function renderDeclaracaoPdf(model: DeclaracaoModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(DECLARACAO_TITLE);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const center = (text: string, y: number, size: number, font: PDFFont, color = INK) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (PAGE_W - w) / 2, y, size, font, color });
  };

  let y = PAGE_H - MARGIN;

  // 1. Clinic logo - the canonical OsteoJP lockup, centered (W9-03b).
  //
  // W5-31 drew a rectangle + text stand-in; W9-03 embedded the icon-512 mark next
  // to a Helvetica "OsteoJP" wordmark (the best raster available then). W9-03b
  // embeds the OWNER-SUPPLIED canonical logo (Logotipo_OsteoJP_2023): a single
  // image carrying the figure mark, the "osteojp" wordmark, and the tagline. No
  // more drawn wordmark - the lockup is the whole thing.
  const logo = await doc.embedJpg(clinicLogoBytes());
  const logoH = 76; // portrait lockup; width derives from the native aspect
  const logoW = (logo.width / logo.height) * logoH;
  page.drawImage(logo, { x: (PAGE_W - logoW) / 2, y: y - logoH, width: logoW, height: logoH });
  y -= logoH + 30;

  // 2. Title, centered.
  center(DECLARACAO_TITLE, y, 20, bold, INK);
  y -= 60;

  // 3. Body paragraphs: the treatment sentence, then the optional free-text
  //    observações (PL-03a), then "Por ser verdade" - each left-aligned wrapped,
  //    with 12px between paragraphs. An empty observações yields exactly the two
  //    original paragraphs at the original positions.
  for (const para of declaracaoBodyParagraphs(model)) {
    for (const line of wrapText(para, regular, 12, CONTENT_W)) {
      page.drawText(line, { x: MARGIN, y, size: 12, font: regular, color: INK });
      y -= 18;
    }
    y -= 12;
  }
  // The loop already applied 12px after the last paragraph; add 36 more so the
  // gap before the localidade line stays the original 48px.
  y -= 36;

  // 5. "{localidade}, {dia}" — centered.
  center(`${model.localidade}, ${model.dia}`, y, 12, regular, INK);
  y -= 40;

  // 6. Signature + carimbo image slot — embedded if present, else blank space.
  if (model.stampBytes) {
    const png = await doc.embedPng(model.stampBytes);
    const maxW = 300;
    const scale = maxW / png.width;
    const w = maxW;
    const h = png.height * scale;
    page.drawImage(png, { x: (PAGE_W - w) / 2, y: y - h, width: w, height: h });
    y -= h + 10;
  } else {
    // Blank vertical space for a physical signature + stamp.
    y -= 90;
  }

  // 7. Responsável line — from the model (tenant setting), never hardcoded here.
  center(`(${model.responsavel})`, y, 12, regular, MUTED);

  // 8. Branded contacts + fiscal footer (W12-30 C1) — print-branding rule.
  drawFooter(page, { regular, bold }, model);

  return doc.save();
}
