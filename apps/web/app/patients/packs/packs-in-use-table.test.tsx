import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { summarizePackInstance, type PackInstanceRow } from "@/lib/packs/in-use";
import { s } from "@/lib/i18n";
import { summarizePackPayments, type PackPaymentSummary } from "@/lib/packs/payments";
import { PacksInUseTable, formatPackDateTime, packTitle } from "./packs-in-use-table";

/**
 * "Packs em uso" table: Fisiozero's columns in Fisiozero's order, the pack
 * cell as "[name] • [total]€", an empty PAGAMENTO cell, and the session list.
 */

const NOW = new Date("2026-11-02T12:00:00Z");

const base: PackInstanceRow = {
  instanceId: "inst-1",
  patientId: "pat-1",
  patientName: "Ana Silva",
  packName: "Fisioterapia 10",
  packPriceCents: 45000,
  sessionsTotal: 10,
  legacyConsumed: 0,
  purchasedAt: new Date("2026-10-01T10:00:00Z"),
};

const render = (row: PackInstanceRow, starts: Date[]) =>
  renderToStaticMarkup(
    createElement(PacksInUseTable, {
      rows: [
        summarizePackInstance(
          row,
          starts.map((d, i) => ({ appointmentId: `a-${i}`, startsAt: d })),
          NOW,
        ),
      ],
    }),
  );

describe("PacksInUseTable", () => {
  it("prints the six headers in Fisiozero's order", () => {
    const html = render(base, []);
    const order = [
      "packsInUse.colPatient",
      "packsInUse.colPack",
      "packsInUse.colStarted",
      "packsInUse.colPayment",
      "packsInUse.colReserved",
      "packsInUse.colFree",
    ] as const;
    const at = order.map((k) => html.indexOf(`>${s[k]}</th>`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(s["packsInUse.colPatient"]).toBe("NOME UTENTE");
    expect(s["packsInUse.colFree"]).toBe("LIVRES");
  });

  it("the pack cell reads '[name] • [total]€', the total being the pack price", () => {
    expect(packTitle({ packName: "Fisioterapia 10", packPriceCents: 45000 })).toBe("Fisioterapia 10 • 450€");
    expect(render(base, [])).toContain("Fisioterapia 10 • 450€");
  });

  it("INICIOU is the purchase date, in Lisbon", () => {
    expect(render(base, [])).toContain("01/10/2026");
  });

  it("PAGAMENTO is an empty cell without payments (a therapist, or before the sitting): no payment is invented", () => {
    const html = render(base, []);
    expect(html).toMatch(/<td[^>]*data-testid="packs-in-use-payment"[^>]*><\/td>/);
    expect(html).not.toContain("packs-in-use-received");
    expect(html).not.toContain("packs-in-use-paid-on");
  });

  const withPayments = (p: PackPaymentSummary) =>
    renderToStaticMarkup(
      createElement(PacksInUseTable, {
        rows: [summarizePackInstance(base, [], NOW)],
        payments: new Map([["inst-1", p]]),
      }),
    );

  it("a partly paid pacote: 'Por receber' as a word, what is owed, 'Recebido: 120€' under the pacote, no 'Pagou a'", () => {
    const html = withPayments(
      summarizePackPayments(45000, null, [{ kind: "pagamento", amountCents: 12000, receivedOn: "2026-10-02", stylusRef: "FR 1E/1" }]),
    );
    expect(html).toContain('data-pay-state="due"');
    expect(html).toContain(`>${s["packsInUse.payStateDue"]}<`);
    expect(html).toContain(s["packsInUse.outstanding"].replace("{amount}", "330"));
    expect(html).toContain(s["packsInUse.received"].replace("{amount}", "120"));
    expect(html).not.toContain("packs-in-use-paid-on");
    expect(html).toContain('href="/patients/packs/inst-1/pagamentos"');
    expect(html).not.toContain("packs-in-use-no-stylus");
  });

  it("a paid pacote: 'Recebido' and 'Pagou a dd/mm/aaaa' under the patient", () => {
    const html = withPayments(
      summarizePackPayments(45000, null, [{ kind: "pagamento", amountCents: 45000, receivedOn: "2026-10-02", stylusRef: null }]),
    );
    expect(html).toContain('data-pay-state="paid"');
    expect(html).toContain(s["packsInUse.paidOn"].replace("{date}", "02/10/2026"));
    expect(html).toContain(s["packsInUse.noStylusRef"].replace("{n}", "1"));
  });

  it("an overpaid pacote is flagged 'Recebido a mais' with the excess", () => {
    const html = withPayments(
      summarizePackPayments(45000, null, [{ kind: "pagamento", amountCents: 50000, receivedOn: "2026-10-02", stylusRef: "FR 1E/1" }]),
    );
    expect(html).toContain('data-pay-state="paid"');
    expect(html).toContain(s["packsInUse.overpaid"].replace("{amount}", "50"));
    expect(withPayments(summarizePackPayments(45000, null, []))).not.toContain("packs-in-use-overpaid");
  });

  it("an unpriced pacote reads 'Preço por indicar', never 'Por receber' from the catalogue price", () => {
    const html = withPayments(summarizePackPayments(null, null, []));
    expect(html).toContain('data-pay-state="unpriced"');
    expect(html).toContain(s["packsInUse.payStateUnpriced"]);
    expect(html).not.toContain(s["packsInUse.outstanding"].split(":")[0]!);
  });

  it("RESERVADAS and LIVRES are the balance", () => {
    const html = render(base, [new Date("2026-10-20T09:00:00Z"), new Date("2026-11-09T09:00:00Z")]);
    expect(html).toMatch(/>2<\/td><td[^>]*>8<\/td><\/tr>/);
  });

  it("the session list is numbered, dated in Lisbon, and counts done and to do", () => {
    const html = render(base, [new Date("2026-10-20T09:00:00Z"), new Date("2026-11-09T09:00:00Z")]);
    expect(html).toContain('<ol start="1"');
    // 09:00Z is 10:00 in Lisbon in October (WEST) and 09:00 in November (WET).
    expect(html).toContain(`<li>${formatPackDateTime(new Date("2026-10-20T09:00:00Z"))}</li>`);
    expect(formatPackDateTime(new Date("2026-10-20T09:00:00Z"))).toBe("20/10/2026 10:00");
    expect(formatPackDateTime(new Date("2026-11-09T09:00:00Z"))).toBe("09/11/2026 09:00");
    expect(html).toContain("Realizadas: 1 • Por Realizar: 1");
  });

  it("legacy sessions come first: the list is numbered after them, and says how many", () => {
    const html = render({ ...base, legacyConsumed: 3 }, [new Date("2026-11-09T09:00:00Z")]);
    expect(html).toContain('<ol start="4"');
    expect(html).toContain(s["packsInUse.legacySessions"].replace("{n}", "3"));
    expect(html).toContain("Realizadas: 3 • Por Realizar: 1");
  });

  it("no session yet: says so", () => {
    expect(render(base, [])).toContain(s["packsInUse.noSessions"]);
  });

  it("links the patient's name to the ficha", () => {
    expect(render(base, [])).toContain('href="/patients/pat-1"');
  });

  it("defaults: the table is named packs-in-use-table, as the e2e spec reads it", () => {
    expect(render(base, [])).toContain('data-testid="packs-in-use-table"');
  });
});

describe("PacksInUseTable inside the ficha (PACK-FICHA-01): showPatient={false}", () => {
  const html = renderToStaticMarkup(
    createElement(PacksInUseTable, {
      rows: [summarizePackInstance(base, [{ appointmentId: "a-0", startsAt: new Date("2026-10-20T09:00:00Z") }], NOW)],
      showPatient: false,
      testId: "patient-packs-running-table",
    }),
  );

  it("drops NOME UTENTE: no header, no name, no link", () => {
    expect(html).not.toContain(`>${s["packsInUse.colPatient"]}</th>`);
    expect(html).not.toContain("Ana Silva");
    expect(html).not.toContain('href="/patients/pat-1"');
  });

  it("keeps the other five headers in the same order", () => {
    const order = [
      "packsInUse.colPack",
      "packsInUse.colStarted",
      "packsInUse.colPayment",
      "packsInUse.colReserved",
      "packsInUse.colFree",
    ] as const;
    const at = order.map((k) => html.indexOf(`>${s[k]}</th>`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("the row starts with the pack cell and still carries the session list and the counts", () => {
    expect(html).toMatch(/data-testid="packs-in-use-row"><td[^>]*><details>/);
    expect(html).toContain("Fisioterapia 10 • 450€");
    expect(html).toContain(formatPackDateTime(new Date("2026-10-20T09:00:00Z")));
    expect(html).toMatch(/>1<\/td><td[^>]*>9<\/td><\/tr>/);
  });

  it("takes its own test id", () => {
    expect(html).toContain('data-testid="patient-packs-running-table"');
    expect(html).not.toContain('data-testid="packs-in-use-table"');
  });
});
