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

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { clinicLogoMarkBytes } from "../assets/clinic-logo-asset";
import type { DeclaracaoModel } from "./declaracao-model";

// (The teal brand hex lives in the embedded mark itself now - W5-31's
// hand-drawn teal rectangle was replaced by the real logo raster in W9-03.)
const MAGENTA = rgb(0x8b / 255, 0x18 / 255, 0x63 / 255);
const INK = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.4, 0.4, 0.4);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 64;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Verbatim Fisiozero template text (pt-PT). Placeholders interpolated for para 1.
export const DECLARACAO_TITLE = "Declaração de Presença";
export function declaracaoParagraph1(m: DeclaracaoModel): string {
  return `Para os devidos efeitos se declara que ${m.patientName} esteve em tratamento nas nossas instalações no dia ${m.dia} entre as ${m.horaInicio} e as ${m.horaFim}.`;
}
export const DECLARACAO_PARAGRAPH_2 =
  "Por ser verdade se passa a presente declaração que vai assinada pelo responsável dos serviços e autenticada com o carimbo em uso nesta clínica.";

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

  // 1. Clinic logo - the REAL centered OsteoJP brand mark + wordmark (W9-03).
  //
  // W5-31 drew a teal rectangle + magenta bar + the word "OsteoJP" here as a
  // stand-in, because pdf-lib embeds PNG/JPEG only and the committed brand
  // assets are SVG. The stand-in rendered fine but was not the logo, which is
  // what CB reported as "the logo does not render" (QA item 2). This embeds the
  // canonical mark raster instead; the wordmark stays type, as before.
  const markH = 34;
  const logoPng = await doc.embedPng(clinicLogoMarkBytes());
  const markW = (logoPng.width / logoPng.height) * markH; // preserve aspect
  const wordmark = "OsteoJP";
  const wordmarkSize = 22;
  const wordmarkW = bold.widthOfTextAtSize(wordmark, wordmarkSize);
  const blockW = markW + 10 + wordmarkW;
  const startX = (PAGE_W - blockW) / 2;
  page.drawImage(logoPng, { x: startX, y: y - markH, width: markW, height: markH });
  page.drawText(wordmark, {
    x: startX + markW + 10,
    y: y - markH + (markH - wordmarkSize) / 2 + 3,
    size: wordmarkSize,
    font: bold,
    color: MAGENTA,
  });
  y -= markH + 40;

  // 2. Title, centered.
  center(DECLARACAO_TITLE, y, 20, bold, INK);
  y -= 60;

  // 3. Paragraph 1 (interpolated), left-aligned wrapped.
  for (const line of wrapText(declaracaoParagraph1(model), regular, 12, CONTENT_W)) {
    page.drawText(line, { x: MARGIN, y, size: 12, font: regular, color: INK });
    y -= 18;
  }
  y -= 12;

  // 4. Paragraph 2 (verbatim), left-aligned wrapped.
  for (const line of wrapText(DECLARACAO_PARAGRAPH_2, regular, 12, CONTENT_W)) {
    page.drawText(line, { x: MARGIN, y, size: 12, font: regular, color: INK });
    y -= 18;
  }
  y -= 48;

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

  return doc.save();
}
