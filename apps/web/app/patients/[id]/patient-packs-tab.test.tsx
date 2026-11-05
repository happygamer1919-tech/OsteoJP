import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { s } from "@/lib/i18n";
import {
  PATIENT_PACKS_READ_CAP,
  buildPatientPacks,
  type PackInstanceRow,
  type PackSession,
  type PatientPacksPage,
} from "@/lib/packs/in-use";
import { PatientPacksTab } from "./patient-packs-tab";

/**
 * PACK-FICHA-01: the ficha's Packs tab. What it draws for one patient: the
 * running pacotes, the finished ones, the empty state, the payment note, the
 * cap note and the link to the clinic-wide list.
 */

const NOW = new Date("2026-11-05T12:00:00Z");
const P = "pat-ficha";
const day = 86_400_000;

const row = (instanceId: string, over: Partial<PackInstanceRow> = {}): PackInstanceRow => ({
  instanceId,
  patientId: P,
  patientName: "Zzz Paciente Teste",
  packName: `Pack ${instanceId}`,
  packPriceCents: 45000,
  sessionsTotal: 10,
  legacyConsumed: 0,
  purchasedAt: new Date("2026-10-01T10:00:00Z"),
  ...over,
});
const at = (days: number): PackSession => ({
  appointmentId: `a-${days}`,
  startsAt: new Date(NOW.getTime() + days * day),
});

const page = (
  rows: PackInstanceRow[],
  sessions: Record<string, PackSession[]> = {},
  truncated = false,
): PatientPacksPage => ({
  ...buildPatientPacks(P, rows, new Map(Object.entries(sessions)), NOW),
  truncated,
});

const render = (p: PatientPacksPage) => renderToStaticMarkup(createElement(PatientPacksTab, { page: p }));

describe("PatientPacksTab", () => {
  it("no pacotes: the empty state and no table", () => {
    const html = render(page([]));
    expect(html).toContain(s["patientPacks.emptyTitle"]);
    expect(html).toContain(s["patientPacks.emptyBody"]);
    expect(html).not.toContain("<table");
  });

  it("a running pacote: its row with the pack, the start date, RESERVADAS and LIVRES, and the session dates", () => {
    const html = render(page([row("run", { packName: "Fisioterapia 10" })], { run: [at(-3), at(4)] }));
    expect(html).toContain('data-testid="patient-packs-running-table"');
    expect(html).toContain("Fisioterapia 10 • 450€");
    expect(html).toContain("01/10/2026");
    expect(html).toMatch(/>2<\/td><td[^>]*>8<\/td><\/tr>/);
    expect(html).toContain("Realizadas: 1 • Por Realizar: 1");
    expect(html).not.toContain('data-testid="patient-packs-finished"');
  });

  it("no NOME UTENTE column inside the patient's own file", () => {
    const html = render(page([row("run")]));
    expect(html).not.toContain(`>${s["packsInUse.colPatient"]}</th>`);
  });

  it("a finished pacote goes under Packs terminados, with the rule said once", () => {
    const html = render(
      page([row("run"), row("spent", { sessionsTotal: 2 })], { spent: [at(-9), at(-2)] }),
    );
    expect(html).toContain(s["patientPacks.runningTitle"]);
    expect(html).toContain(s["patientPacks.finishedTitle"]);
    expect(html).toContain(s["patientPacks.finishedHint"]);
    const finishedAt = html.indexOf('data-testid="patient-packs-finished-table"');
    expect(finishedAt).toBeGreaterThan(html.indexOf('data-testid="patient-packs-running-table"'));
    expect(html.slice(finishedAt)).toContain("Pack spent");
    expect(html.slice(finishedAt)).not.toContain("Pack run");
  });

  it("only finished pacotes: the running section says none is running", () => {
    const html = render(page([row("spent", { sessionsTotal: 1 })], { spent: [at(-2)] }));
    expect(html).toContain(s["patientPacks.noneRunning"]);
    expect(html).not.toContain('data-testid="patient-packs-running-table"');
    expect(html).toContain('data-testid="patient-packs-finished-table"');
  });

  it("PAGAMENTO stays empty and the tab says 'Pagamento: em breve'", () => {
    const html = render(page([row("run")]));
    expect(html).toContain(s["packsInUse.paymentSoon"]);
    expect(s["packsInUse.paymentSoon"]).toBe("Pagamento: em breve");
    expect(html).toMatch(/<td[^>]*data-testid="packs-in-use-payment"[^>]*><\/td>/);
  });

  it("links to the clinic-wide Packs em uso", () => {
    expect(render(page([]))).toContain('href="/patients/packs"');
  });

  it("the cap note only when the read was cut", () => {
    expect(render(page([row("run")]))).not.toContain('data-testid="patient-packs-truncated"');
    const html = render(page([row("run")], {}, true));
    expect(html).toContain('data-testid="patient-packs-truncated"');
    expect(html).toContain(s["patientPacks.truncated"].replace("{n}", String(PATIENT_PACKS_READ_CAP)));
  });

  it("the section headers carry the purple rule and a count (W7-03)", () => {
    const html = render(page([row("a"), row("b")]));
    expect(html).toContain("border-accent-1-700");
    expect(html).toMatch(/Packs a decorrer<\/h2><span[^>]*>2<\/span>/);
  });
});
