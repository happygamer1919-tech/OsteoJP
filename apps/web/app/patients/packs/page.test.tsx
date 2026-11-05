import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Packs em uso" page: the note shown when the read stopped at its cap (the
 * count is then a floor, and the search looked only within the packs read),
 * and what the page hands the read.
 */

vi.mock("server-only", () => ({}));

class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));

let role: "owner" | "admin" | "therapist" | "reception" = "admin";
vi.mock("@/lib/auth/context", () => ({
  getRequestContext: async () => ({ tenantId: "t-1", role, userId: "u-1" }),
}));

let page = { totalInUse: 0, rows: [] as unknown[], truncated: false };
const listPacksInUse = vi.fn(async () => page);
vi.mock("@/lib/packs/in-use-read", () => ({
  listPacksInUse: (...a: unknown[]) => (listPacksInUse as (...x: unknown[]) => unknown)(...a),
}));

vi.mock("@osteojp/ui", () => ({
  GlassPanel: ({ children }: { children?: ReactNode }) => createElement("section", null, children as ReactNode),
  EmptyState: ({ title }: { title?: ReactNode }) => createElement("div", null, title as ReactNode),
}));
vi.mock("../_components/search-box", () => ({ SearchBox: () => createElement("form", { role: "search" }) }));

const { default: PacksInUsePage } = await import("./page");
const { s } = await import("@/lib/i18n");
const { PACKS_IN_USE_READ_CAP } = await import("@/lib/packs/in-use");
type PackInUseView = import("@/lib/packs/in-use").PackInUseView;

const render = async (sp: Record<string, string> = {}) =>
  renderToStaticMarkup(
    (await PacksInUsePage({ searchParams: Promise.resolve(sp) })) as Parameters<typeof renderToStaticMarkup>[0],
  );

/** The opening <a ...> tag of one sort option, whatever its attribute order. */
const sortLink = (html: string, key: string): string => {
  const tag = html.match(new RegExp(`<a [^>]*data-sort="${key}"[^>]*>`));
  if (!tag) throw new Error(`no sort link ${key}`);
  return tag[0];
};

beforeEach(() => {
  role = "admin";
  page = { totalInUse: 0, rows: [], truncated: false };
  listPacksInUse.mockClear();
});

describe("Packs em uso page", () => {
  it("shows the truncation note, naming the cap and that search covers only the packs read", async () => {
    page = { totalInUse: 0, rows: [], truncated: true };
    const html = await render();
    const note = s["packsInUse.truncated"].replace("{n}", String(PACKS_IN_USE_READ_CAP));
    expect(html).toContain('data-testid="packs-in-use-truncated"');
    expect(html).toContain(note);
    expect(s["packsInUse.truncated"]).toMatch(/pesquisa/);
  });

  it("no note when the read was complete", async () => {
    const html = await render();
    expect(html).not.toContain('data-testid="packs-in-use-truncated"');
  });

  it("renders the sort control, name current by default, keeping the search in both links", async () => {
    const html = await render({ q: "ana" });
    expect(html).toContain('data-testid="packs-in-use-sort"');
    expect(html).toContain(s["packsInUse.sortName"]);
    expect(html).toContain(s["packsInUse.sortLastUse"]);
    const byName = sortLink(html, "name");
    const byLastUse = sortLink(html, "lastUse");
    expect(byName).toContain('href="/patients/packs?q=ana"');
    expect(byName).toContain('aria-current="true"');
    expect(byLastUse).toContain('href="/patients/packs?q=ana&amp;sort=lastUse"');
    expect(byLastUse).not.toContain("aria-current");
  });

  it("?sort=lastUse marks it current and orders the rows by last use, never used last", async () => {
    const NOW = Date.now();
    const v = (id: string, name: string, last: number | null): PackInUseView => ({
      instanceId: id,
      patientId: `p-${id}`,
      patientName: name,
      packName: "Pack",
      packPriceCents: 1000,
      sessionsTotal: 5,
      purchasedAt: new Date(NOW - 100 * 86_400_000),
      reserved: 1,
      free: 4,
      done: 1,
      upcoming: 0,
      legacyConsumed: 0,
      sessions: [],
      lastUsedAt: last === null ? null : new Date(NOW - last * 86_400_000),
    });
    // The read returns the default order (A to Z); the page re-sorts.
    page = {
      totalInUse: 3,
      rows: [v("a", "Ana", null), v("b", "Bruno", 30), v("c", "Carla", 2)],
      truncated: false,
    };
    const html = await render({ sort: "lastUse" });
    expect(sortLink(html, "lastUse")).toContain('aria-current="true"');
    expect(sortLink(html, "name")).not.toContain("aria-current");
    const order = ["Ana", "Bruno", "Carla"].map((n) => html.indexOf(`>${n}</a>`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order[2]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[0]!);
  });

  it("an unknown ?sort= falls back to the default order", async () => {
    const html = await render({ sort: "bogus" });
    expect(sortLink(html, "name")).toContain('aria-current="true"');
  });

  it("passes the trimmed search to the read and prints the count heading", async () => {
    page = { totalInUse: 7, rows: [], truncated: false };
    const html = await render({ q: "  ana  " });
    expect(listPacksInUse).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "ana");
    expect(html).toContain(s["packsInUse.count"].replace("{n}", "7"));
  });
});
