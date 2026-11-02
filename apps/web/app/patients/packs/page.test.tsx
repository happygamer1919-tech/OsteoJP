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

const render = async (sp: Record<string, string> = {}) =>
  renderToStaticMarkup(
    (await PacksInUsePage({ searchParams: Promise.resolve(sp) })) as Parameters<typeof renderToStaticMarkup>[0],
  );

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

  it("passes the trimmed search to the read and prints the count heading", async () => {
    page = { totalInUse: 7, rows: [], truncated: false };
    const html = await render({ q: "  ana  " });
    expect(listPacksInUse).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), "ana");
    expect(html).toContain(s["packsInUse.count"].replace("{n}", "7"));
  });
});
