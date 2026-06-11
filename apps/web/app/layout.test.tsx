import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { htmlLang } from "@osteojp/i18n";

// next/font/google is a Next compile-time macro; calling it in a plain vitest
// run throws. Stub it to a bare { variable } so RootLayout renders in node.
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter" }),
}));

import RootLayout from "./layout";

// BUG-08 follow-up (#93): per-input lang="pt-PT" only wins in Chromium; Firefox
// and Safari derive native date-picker format from the DOCUMENT <html lang>.
// The root layout previously hardcoded lang="en", so the patient DOB, the
// appointment-modal date and the clinical RecordForm date rendered mm/dd there.
// This guards the document lang against silently reverting to "en".
describe("RootLayout — document language", () => {
  it("renders <html lang='pt-PT'> by default so native date pickers use dd/mm/aaaa", () => {
    const html = renderToStaticMarkup(<RootLayout>{null}</RootLayout>);
    const htmlTag = html.match(/<html[^>]*>/)?.[0] ?? "";
    expect(htmlTag).not.toBe("");
    expect(htmlTag).toContain('lang="pt-PT"');
    expect(htmlTag).not.toContain('lang="en"');
  });

  it("sources the document lang from the i18n locale (not a hardcoded literal)", () => {
    // If the locale->tag mapping or DEFAULT_LOCALE changes, this is the seam
    // that must stay in sync — htmlLang() is the single source of truth.
    expect(htmlLang()).toBe("pt-PT");
  });
});
