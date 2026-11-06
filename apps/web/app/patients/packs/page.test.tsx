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
let byIds: unknown[] = [];
const listPacksByIds = vi.fn(async () => byIds);
vi.mock("@/lib/packs/in-use-read", () => ({
  listPacksInUse: (...a: unknown[]) => (listPacksInUse as (...x: unknown[]) => unknown)(...a),
  listPacksByIds: (...a: unknown[]) => (listPacksByIds as (...x: unknown[]) => unknown)(...a),
}));

type Summary = import("@/lib/packs/payments").PackPaymentSummary;
let payments: Map<string, Summary> | null = null;
let month: { cents: number; first: string; last: string } | null = null;
let receivables: { ids: string[]; truncated: boolean } | null = null;
const readPackPaymentSummaries = vi.fn(async () => payments);
const listReceivableInstanceIds = vi.fn(async () => receivables);
vi.mock("@/lib/packs/payments-read", () => ({
  RECEIVABLES_READ_CAP: 1000,
  readPackPaymentSummaries: (...a: unknown[]) => (readPackPaymentSummaries as (...x: unknown[]) => unknown)(...a),
  listReceivableInstanceIds: (...a: unknown[]) => (listReceivableInstanceIds as (...x: unknown[]) => unknown)(...a),
  readPacksReceivedThisMonth: async () => month,
}));

vi.mock("@osteojp/ui", () => ({
  StatusBadge: ({ children }: { children?: ReactNode }) => createElement("span", null, children as ReactNode),
  GlassPanel: ({ children }: { children?: ReactNode }) => createElement("section", null, children as ReactNode),
  EmptyState: ({ title }: { title?: ReactNode }) => createElement("div", null, title as ReactNode),
}));
vi.mock("../_components/search-box", () => ({ SearchBox: () => createElement("form", { role: "search" }) }));

const { default: PacksInUsePage } = await import("./page");
const { s } = await import("@/lib/i18n");
const { PACKS_IN_USE_READ_CAP } = await import("@/lib/packs/in-use");
const { summarizePackPayments } = await import("@/lib/packs/payments");
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
  payments = null;
  month = null;
  receivables = null;
  byIds = [];
  listPacksInUse.mockClear();
  listPacksByIds.mockClear();
  readPackPaymentSummaries.mockClear();
  listReceivableInstanceIds.mockClear();
});

const view = (id: string, name: string): PackInUseView => ({
  instanceId: id,
  patientId: `p-${id}`,
  patientName: name,
  packName: "Pack",
  packPriceCents: 45000,
  sessionsTotal: 10,
  purchasedAt: new Date("2026-10-01T10:00:00Z"),
  reserved: 1,
  free: 9,
  done: 1,
  upcoming: 0,
  legacyConsumed: 0,
  sessions: [],
  lastUsedAt: null,
});

describe("Packs em uso page, pack payments", () => {
  it("a THERAPIST: no payment read at all, no filter, no Vender pack, no total, no 'em breve' (P4)", async () => {
    role = "therapist";
    page = { totalInUse: 1, rows: [view("a", "Ana")], truncated: false };
    const html = await render();
    expect(readPackPaymentSummaries).not.toHaveBeenCalled();
    expect(html).not.toContain("packs-in-use-pay-filter");
    expect(html).not.toContain("packs-in-use-sell");
    expect(html).not.toContain("packs-in-use-received-month");
    expect(html).not.toContain(s["packsInUse.paymentSoon"]);
  });

  it("a money role BEFORE the sitting (the read answers null): 'Pagamento: em breve' and nothing else", async () => {
    role = "reception";
    page = { totalInUse: 1, rows: [view("a", "Ana")], truncated: false };
    const html = await render({ pagamento: "por-receber" });
    expect(readPackPaymentSummaries).toHaveBeenCalledWith(expect.objectContaining({ role: "reception" }), ["a"]);
    expect(html).toContain(s["packsInUse.paymentSoon"]);
    expect(html).not.toContain("packs-in-use-pay-filter");
    expect(html).not.toContain("packs-in-use-sell");
    // The filter cannot apply without payments: every row is still shown.
    expect(html).toContain(">Ana</a>");
  });

  it("after the sitting: the filter, Vender pack, the month total marked internal and not fiscal", async () => {
    role = "reception";
    page = { totalInUse: 1, rows: [view("a", "Ana")], truncated: false };
    payments = new Map([["a", summarizePackPayments(45000, null, [])]]);
    month = { cents: 12050, first: "2026-11-01", last: "2026-11-30" };
    const html = await render();
    expect(html).toContain("packs-in-use-pay-filter");
    expect(html).toContain('href="/patients/packs/vender"');
    expect(html).toContain("novembro de 2026");
    expect(html).toContain("(registo interno, não fiscal): 120,50€");
    expect(html).not.toContain(s["packsInUse.paymentSoon"]);
    expect(html).toContain(s["packsInUse.footnotePayments"]);
  });

  it("'€ POR RECEBER' draws the RECEIVABLES read, not the in-use list: a fully used, unpaid pacote is on it", async () => {
    role = "admin";
    // In use: Ana (unpaid) and Bruno (paid). Not in use: Duarte, every session
    // spent and money still owed. The receivables read names Ana and Duarte.
    page = { totalInUse: 2, rows: [view("a", "Ana"), view("b", "Bruno")], truncated: false };
    const spent = { ...view("d", "Duarte"), free: 0, reserved: 10, upcoming: 0 };
    receivables = { ids: ["a", "d"], truncated: false };
    byIds = [view("a", "Ana"), spent];
    payments = new Map([
      ["a", summarizePackPayments(45000, null, [])],
      ["b", summarizePackPayments(45000, null, [{ kind: "pagamento", amountCents: 45000, receivedOn: "2026-11-01", stylusRef: "FR 1E/1" }])],
      ["d", summarizePackPayments(45000, null, [{ kind: "pagamento", amountCents: 10000, receivedOn: "2026-10-01", stylusRef: "FR 1E/2" }])],
    ]);
    const html = await render({ pagamento: "por-receber", q: "  " });
    expect(listReceivableInstanceIds).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }));
    // NIT 3: the in-use read is not run and thrown away.
    expect(listPacksInUse).not.toHaveBeenCalled();
    expect(listPacksByIds).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), ["a", "d"], "");
    expect(html).toContain(">Ana</a>");
    expect(html).toContain(">Duarte</a>");
    expect(html).not.toContain(">Bruno</a>");
    expect(html).toContain(s["packsInUse.countPorReceber"].replace("{n}", "2"));
    expect(sortLink(html, "lastUse")).toContain("pagamento=por-receber");
    const filterOn = html.match(/<a [^>]*data-pay-filter="por-receber"[^>]*>/)![0];
    expect(filterOn).toContain('aria-current="true"');
  });

  it("'€ POR RECEBER' says so when the receivables read stopped at its cap, and when nothing is owed", async () => {
    role = "reception";
    payments = new Map();
    receivables = { ids: [], truncated: true };
    const html = await render({ pagamento: "por-receber" });
    expect(html).toContain('data-testid="packs-in-use-truncated"');
    expect(html).toContain(s["packsInUse.truncatedPorReceber"].replaceAll("{n}", "1000"));
    expect(s["packsInUse.truncatedPorReceber"]).toMatch(/pesquisa procura apenas nesses \{n\} packs mais recentes/);
    expect(html).toContain(s["packsInUse.porReceberEmptyTitle"]);
  });

  it("the month total carries its scope note", async () => {
    role = "owner";
    payments = new Map();
    month = { cents: 0, first: "2026-11-01", last: "2026-11-30" };
    const html = await render();
    expect(html).toContain(s["packsInUse.receivedMonthScope"]);
  });

  it("a therapist's ?pagamento=por-receber is ignored: no payments, so no filter", async () => {
    role = "therapist";
    page = { totalInUse: 1, rows: [view("a", "Ana")], truncated: false };
    const html = await render({ pagamento: "por-receber" });
    expect(html).toContain(">Ana</a>");
    expect(html).toContain(s["packsInUse.count"].replace("{n}", "1"));
  });
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
