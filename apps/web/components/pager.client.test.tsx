/**
 * U1 / B1 (render half) — the Pager emits the controls the spec names.
 *
 * The DECISIONS (clamp, ellipsis placement, "invalid input sends no request")
 * are proven directly in lib/pagination/page-items.test.ts, which needs no DOM.
 * This file proves the component actually RENDERS them: that the five controls
 * exist, that the current page is marked, that the ends are disabled rather than
 * removed, and that N = 1 produces nothing at all.
 *
 * `renderToStaticMarkup`, not a click harness: apps/web runs vitest in the node
 * environment with no jsdom (see vitest.config.ts), which is also why the jump
 * box's behaviour lives in the pure module rather than being clicked here.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { Pager } from "./pager.client";

const render = (props: Parameters<typeof Pager>[0]) =>
  renderToStaticMarkup(createElement(Pager, props));

describe("Pager", () => {
  it("renders NOTHING when there is a single page", () => {
    expect(render({ basePath: "/patients", params: {}, page: 1, pageCount: 1, total: 8 })).toBe("");
  });

  it("offers Primeira, Anterior, Seguinte and Última on a middle page", () => {
    const html = render({ basePath: "/patients", params: {}, page: 10, pageCount: 100, total: 2500 });
    for (const label of ["Primeira", "Anterior", "Seguinte", "Última"]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain('data-testid="pager-goto"');
  });

  it("states the position and the result count", () => {
    const html = render({ basePath: "/patients", params: {}, page: 10, pageCount: 100, total: 2500 });
    // "Página 10 de 100, 2500 resultados" — the numbers are locale-formatted, so
    // assert the parts rather than the whole sentence.
    expect(html).toContain("Página 10 de 100");
    expect(html).toContain("resultados");
  });

  it("links the LAST page directly — the whole point of the ticket", () => {
    const html = render({ basePath: "/patients", params: {}, page: 1, pageCount: 100, total: 2500 });
    expect(html).toContain("/patients?page=100");
  });

  it("omits page=1 so the first page has one canonical URL", () => {
    const html = render({ basePath: "/patients", params: {}, page: 5, pageCount: 10, total: 250 });
    expect(html).toContain('href="/patients"');
    expect(html).not.toContain("page=1&");
    expect(html).not.toContain('href="/patients?page=1"');
  });

  it("carries every other query param across a page turn", () => {
    const html = render({
      basePath: "/patients",
      params: { q: "silva", location: "loc-1" },
      page: 2,
      pageCount: 9,
      total: 210,
    });
    expect(html).toContain("q=silva");
    expect(html).toContain("location=loc-1");
  });

  it("disables the ends instead of removing them, so the strip does not shift", () => {
    const first = render({ basePath: "/x", params: {}, page: 1, pageCount: 50, total: 1000 });
    expect(first).toContain('data-testid="pager-first"');
    expect(first).toContain('aria-disabled="true"');

    const last = render({ basePath: "/x", params: {}, page: 50, pageCount: 50, total: 1000 });
    expect(last).toContain('data-testid="pager-last"');
    expect(last).toContain('aria-disabled="true"');
  });

  it("marks the current page with aria-current", () => {
    const html = render({ basePath: "/x", params: {}, page: 7, pageCount: 20, total: 400 });
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-testid="pager-current"');
  });
});
