/**
 * GuiaoPanel.test.tsx - W5-34.
 *
 * Renders the read-only "Guião do Exame Subjetivo" reference (react-dom/server,
 * node env) and pins what the loop guarantees:
 * - it is a native <details> panel, COLLAPSED by default (no `open` attribute),
 *    on the top-level panel AND every section (so it never pushes the recording
 *    controls out of reach on first paint);
 * - it is READ-ONLY: no <input>, <textarea>, <select> or <button> anywhere;
 * - every section title from the guião doc is present;
 * - verbatim pt-PT content renders (diacritics survive), zero em/en dashes.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GuiaoPanel } from "./GuiaoPanel";
import { GUIAO_SECTIONS, GUIAO_TITLE } from "./guiao-content";

const html = renderToStaticMarkup(createElement(GuiaoPanel));

describe("GuiaoPanel - collapsed-by-default native details", () => {
  it("renders the top-level panel with its title", () => {
    expect(html).toContain('data-testid="guiao-panel"');
    expect(html).toContain(GUIAO_TITLE);
  });

  it("is collapsed by default: no <details ... open> anywhere", () => {
    // react-dom serializes a truthy `open` prop as the `open` attribute; its
    // absence proves every <details> (panel + sections) starts closed.
    expect(html).not.toMatch(/<details[^>]*\sopen(\s|>|=)/);
  });

  it("renders one collapsible per guião section, all present", () => {
    for (const section of GUIAO_SECTIONS) {
      expect(html).toContain(`data-testid="guiao-section-${section.id}"`);
      expect(html).toContain(section.title);
    }
    const sectionEls = html.match(/data-testid="guiao-section-/g) ?? [];
    expect(sectionEls.length).toBe(GUIAO_SECTIONS.length);
  });
});

describe("GuiaoPanel - read-only, no inputs (never interferes with controls)", () => {
  it("contains no form controls of any kind", () => {
    expect(html).not.toMatch(/<input/i);
    expect(html).not.toMatch(/<textarea/i);
    expect(html).not.toMatch(/<select/i);
    expect(html).not.toMatch(/<button/i);
  });

  it("uses no fixed/absolute positioning that could overlay the controls", () => {
    expect(html).not.toMatch(/\b(fixed|absolute)\b/);
  });
});

describe("GuiaoPanel - verbatim pt-PT content", () => {
  it("renders diacritic content from the guião doc", () => {
    expect(html).toContain("Motivo da consulta");
    expect(html).toContain("Numa escala de 0-10");
    expect(html).toContain("Pesquisa de flags e revisão de sistemas");
  });

  it("contains zero em or en dashes (house rule)", () => {
    // Unicode escapes so this guard does not itself introduce the chars it
    // bans (U+2013 en dash, U+2014 em dash).
    expect(html).not.toMatch(/[\u2013\u2014]/);
  });
});
