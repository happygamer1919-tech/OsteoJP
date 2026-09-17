/**
 * U1 / B1 — the pager's decisions, proven without a DOM.
 *
 * Every case here is one the three existing prev/next pagers could not have
 * failed, because they never had a number strip, a clamp or a jump box. They
 * are the behaviours the owner asked for ("reaching page 100 takes 100 clicks"),
 * so they are asserted rather than eyeballed in a screenshot.
 */
import { describe, expect, it } from "vitest";

import { clampPage, PAGE_WINDOW, pageItems, parseGotoPage } from "./page-items";

describe("clampPage", () => {
  it("forces a page below 1 up to the first page", () => {
    expect(clampPage(0, 100)).toBe(1);
    expect(clampPage(-7, 100)).toBe(1);
  });

  it("forces a page above N down to the last page", () => {
    expect(clampPage(101, 100)).toBe(100);
    expect(clampPage(999_999, 12)).toBe(12);
  });

  it("leaves a page inside the range alone", () => {
    expect(clampPage(10, 100)).toBe(10);
    expect(clampPage(1, 1)).toBe(1);
  });

  it("treats a nonsense pageCount as a single page rather than returning 0", () => {
    // A link to `?page=0` is a request that cannot be satisfied.
    expect(clampPage(5, 0)).toBe(1);
    expect(clampPage(5, Number.NaN)).toBe(1);
  });

  it("never returns NaN for a NaN page", () => {
    expect(clampPage(Number.NaN, 50)).toBe(1);
  });
});

describe("pageItems", () => {
  it("is EMPTY at N = 1, so the whole pager can be hidden", () => {
    expect(pageItems(1, 1)).toEqual([]);
    expect(pageItems(1, 0)).toEqual([]);
  });

  it("puts the ellipsis only at the END when the current page is at the start", () => {
    // 1 2 3 4 ... 100 — nothing is hidden BEFORE the current page, and exactly
    // one gap sits between the window and the last page.
    const items = pageItems(2, 100);
    expect(items.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(items.filter((i) => i === "ellipsis")).toHaveLength(1);
    expect(items.slice(-2)).toEqual(["ellipsis", 100]);
  });

  it("puts the ellipsis on BOTH sides when the current page is in the middle", () => {
    // 1 ... 8 9 [10] 11 12 ... 100 — the exact strip the spec names.
    expect(pageItems(10, 100)).toEqual([1, "ellipsis", 8, 9, 10, 11, 12, "ellipsis", 100]);
  });

  it("puts the ellipsis only at the START when the current page is at the end", () => {
    const items = pageItems(99, 100);
    expect(items[0]).toBe(1);
    expect(items[1]).toBe("ellipsis");
    expect(items.at(-1)).toBe(100);
    expect(items.filter((i) => i === "ellipsis")).toHaveLength(1);
  });

  it("ALWAYS offers the first and the last page, from anywhere", () => {
    // This is the defect the ticket is about: the last page must be one action
    // away, not ninety-nine.
    for (const page of [1, 2, 37, 50, 99, 100]) {
      const items = pageItems(page, 100);
      expect(items[0], `page ${page} must offer page 1`).toBe(1);
      expect(items.at(-1), `page ${page} must offer page 100`).toBe(100);
    }
  });

  it("marks the current page and its window", () => {
    const items = pageItems(50, 100);
    for (let p = 50 - PAGE_WINDOW; p <= 50 + PAGE_WINDOW; p += 1) {
      expect(items).toContain(p);
    }
  });

  it("renders a one-page gap as that page rather than an ellipsis", () => {
    // 1 2 3 4 5 6 7 — "1 ... 3" would be wider than the "2" it hides.
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("never repeats a page when the window overlaps the first or last", () => {
    for (const [page, count] of [
      [1, 3],
      [2, 4],
      [3, 3],
      [100, 100],
      [1, 100],
    ] as const) {
      const numbers = pageItems(page, count).filter((i): i is number => typeof i === "number");
      expect(new Set(numbers).size, `page ${page} of ${count}`).toBe(numbers.length);
    }
  });

  it("clamps an out-of-range current page instead of producing a broken strip", () => {
    expect(pageItems(500, 10)).toEqual(pageItems(10, 10));
  });
});

describe("parseGotoPage — an invalid entry must send NO request", () => {
  it("returns null for empty and whitespace", () => {
    expect(parseGotoPage("", 100)).toBeNull();
    expect(parseGotoPage("   ", 100)).toBeNull();
  });

  it("returns null for anything non-numeric", () => {
    // Number("abc") is NaN and Number("") is 0; both would navigate somewhere.
    for (const junk of ["abc", "12abc", "1.5", "-2", "1e3", "+4", "٣", "1,5"]) {
      expect(parseGotoPage(junk, 100), junk).toBeNull();
    }
  });

  it("accepts digits and clamps them into range", () => {
    expect(parseGotoPage("7", 100)).toBe(7);
    expect(parseGotoPage("  7  ", 100)).toBe(7);
    expect(parseGotoPage("0", 100)).toBe(1);
    expect(parseGotoPage("101", 100)).toBe(100);
  });

  it("accepts the first and last page explicitly", () => {
    expect(parseGotoPage("1", 100)).toBe(1);
    expect(parseGotoPage("100", 100)).toBe(100);
  });
});
