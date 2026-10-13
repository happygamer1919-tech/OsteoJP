// TEST FIXTURE (EXPORT-01): the text a report PDF draws, read back from its
// bytes, so a test can say what is on each page. Used by the registo export
// suites; nothing in the app imports it.
//
// pdf-lib writes a string drawn with a standard font as hex before `Tj`, one
// operator per drawn line, so the lines come back exactly as they were drawn
// (a wrapped paragraph is several lines).

import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFPage } from "pdf-lib";

/** The drawing instructions of one page, decoded. */
function content(page: PDFPage): string {
  const contents = page.node.Contents();
  const streams =
    contents instanceof PDFArray ? contents.asArray().map((ref) => page.doc.context.lookup(ref)) : [contents];
  return streams
    .map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString("latin1"))
    .join("\n");
}

/** The text drawn on each page, in drawing order, one drawn line per entry. */
export async function drawnLines(bytes: Uint8Array): Promise<string[][]> {
  const doc = await PDFDocument.load(bytes);
  return doc
    .getPages()
    .map((page) =>
      [...content(page).matchAll(/<([0-9A-F]*)> Tj/g)].map((m) => Buffer.from(m[1]!, "hex").toString("latin1")),
    );
}

/** Whitespace collapsed, so a wrapped paragraph compares with its source text. */
export const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** Drawn lines as a single run of words. */
export const words = (lines: readonly string[]) => squash(lines.join(" "));

const unescapeHtml = (html: string) =>
  html
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * The field names and values a stored-content view draws on the SCREEN, read
 * out of its rendered markup (`<dt>` and `<dd>` pairs), in order.
 */
export function screenFields(html: string): { name: string; value: string }[] {
  return [...html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)].map((m) => ({
    name: unescapeHtml(m[1]!.replace(/<[^>]+>/g, "")),
    value: unescapeHtml(m[2]!.replace(/<[^>]+>/g, "")),
  }));
}
