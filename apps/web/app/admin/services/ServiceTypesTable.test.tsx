import { createElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The Tipos de Marcacao table as strategy's answers of 2026-11-04 shape it:
 *   Q4  the SMS tag stays, with a muted "not yet applied" line under it;
 *   Q5  the IVA 0% rule is stated next to the IVA columns, and the new-type
 *       row starts with no rate (a prefilled 0% would refuse every insert);
 *   Q6  the accountant note sits next to the IVA columns;
 *   Q7  the type colour is never painted as a fill (the picker is the swatch);
 *   Q8  OsteoJP's own two notes under the table, not Fisiozero's;
 *   Q9  FollowUP is not rendered at all.
 */

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/ui", () => ({
  GlassPanel: ({ title, children }: { title?: ReactNode; children?: ReactNode }) =>
    createElement("section", null, createElement("h2", null, title as ReactNode), children as ReactNode),
  Button: ({ children, ...rest }: { children?: ReactNode } & Record<string, unknown>) =>
    createElement(
      "button",
      { type: rest.type as string, disabled: rest.disabled as boolean },
      children as ReactNode,
    ),
  StatusBadge: ({ children }: { children?: ReactNode }) => createElement("span", null, children as ReactNode),
}));
// Server actions are never called by a render; stand-ins keep next/cache out.
vi.mock("./actions", () => ({
  createServiceTypeAction: async () => {},
  deleteServiceAction: async () => {},
  saveServiceTypesTableAction: async () => {},
  setServiceContraindicationAction: async () => {},
  setServiceLocationPricesAction: async () => {},
}));

const { ServiceTypesTable } = await import("./ServiceTypesTable");
const pt = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "..", "..", "packages/i18n/src/strings.pt.json"), "utf-8"),
) as Record<string, string>;
const en = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "..", "..", "packages/i18n/src/strings.en.json"), "utf-8"),
) as Record<string, string>;

const ID = "11111111-1111-4111-8111-111111111111";
const svc = {
  id: ID,
  name: "Fisioterapia",
  durationMin: 45,
  priceCents: 5000,
  currency: "EUR",
  isActive: true,
  contraindicationSensitive: false,
  patientBookable: false,
  color: "#C27E3A",
  vatRate: 0,
  vatExemptionCode: "M07",
  followUpDays: 2,
  smsReminders: true,
  updatedAt: new Date(1_793_600_000_000),
};

const html = renderToStaticMarkup(
  createElement(ServiceTypesTable, {
    services: [svc],
    packs: [],
    serviceBlockers: new Map<string, never[]>(),
    activeLocations: [],
    overrideByServiceLocation: new Map<string, number>(),
    offeredServiceLocation: new Set<string>(),
  }),
);

/** Text with the HTML entities renderToStaticMarkup writes turned back. */
const text = (h: string) => h.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

describe("Q9: FollowUP is not on the screen", () => {
  it("no FollowUP header, select or option, in the table or the new-type row", () => {
    expect(html).not.toMatch(/name="followUp/);
    expect(text(html)).not.toContain(pt["admin.serviceTypes.colFollowUp"]);
    expect(text(html)).not.toContain(pt["admin.serviceTypes.followUp2Days"]);
    expect(text(html)).not.toContain(pt["admin.serviceTypes.followUpNone"]);
  });
});

describe("Q8: OsteoJP's own notes, never Fisiozero's", () => {
  it("prints the two notes under the table, in the words strategy gave", () => {
    expect(pt["admin.serviceTypes.note1"]).toBe(
      "Nota 1: As marcações não guardam preço: o valor cobrado é o que consta da fatura emitida.",
    );
    expect(pt["admin.serviceTypes.note2"]).toBe(
      "Nota 2: As estatísticas contam apenas as faturas emitidas, não as marcações.",
    );
    expect(en["admin.serviceTypes.note1"]).toBe(
      "Note 1: Appointments store no price: the amount charged is the one on the issued invoice.",
    );
    expect(en["admin.serviceTypes.note2"]).toBe("Note 2: Statistics count issued invoices only, not appointments.");
    const notes = text(html).split('data-testid="service-types-notes"')[1] ?? "";
    expect(notes).toContain(pt["admin.serviceTypes.note1"]);
    expect(notes).toContain(pt["admin.serviceTypes.note2"]);
  });

  it("no Fisiozero note wording survives in either locale", () => {
    for (const strings of [pt, en]) {
      for (const v of Object.values(strings)) {
        expect(v).not.toMatch(/marcações já efetuadas em Calendário|Pagamento do Utente/);
        expect(v).not.toMatch(/already made in the Calendar|patient's payment is recorded/);
      }
    }
  });
});

describe("Q5 and Q6: next to the IVA columns", () => {
  it("states the 0% rule and the accountant note, in pt and en", () => {
    const vat = text(html).split('data-testid="service-types-vat-notes"')[1]?.split("</div>")[0] ?? "";
    expect(vat).toContain(pt["admin.serviceTypes.vatReasonRule"]);
    expect(vat).toContain(
      "Os valores de IVA e Motivo são confirmados pelo contabilista antes de qualquer faturação os usar.",
    );
    expect(en["admin.serviceTypes.vatAccountantNote"]).toBe(
      "VAT rates and exemption reasons are confirmed by the accountant before any invoicing uses them.",
    );
    expect(en["admin.serviceTypes.vatReasonRule"]).toBeTruthy();
    expect(pt["admin.serviceTypes.vatReasonRequired"]).toBeTruthy();
    expect(en["admin.serviceTypes.vatReasonRequired"]).toBeTruthy();
    expect(pt["admin.serviceTypes.newVatReasonRequired"]).toBeTruthy();
    expect(en["admin.serviceTypes.newVatReasonRequired"]).toBeTruthy();
  });

  it("the new-type row's IVA starts unset, not 0%", () => {
    const newRow = html.split('data-testid="service-types-new-row"')[1] ?? "";
    const vatSelect = newRow.match(/<select name="vat"[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(vatSelect).toMatch(/<option value="" selected="">/);
    expect(vatSelect).not.toMatch(/<option value="0" selected="">/);
  });

  it("a stored type keeps showing its rate and Motivo", () => {
    expect(html).toMatch(new RegExp(`<select name="vat__${ID}"[\\s\\S]*?<option value="0" selected="">`));
    expect(html).toMatch(new RegExp(`<select name="vatReason__${ID}"[\\s\\S]*?<option value="M07" selected="">`));
  });
});

describe("Q4: the SMS tag stays, marked as not yet applied", () => {
  it("renders the tag as today, with the muted hint it is described by", () => {
    expect(html).toContain(`name="sms__${ID}"`);
    expect(html).toMatch(new RegExp(`name="sms__${ID}"[^>]*checked=""`));
    expect(html).toContain(`aria-describedby="service-type-sms-hint-${ID}"`);
    expect(html).toMatch(
      new RegExp(`<span id="service-type-sms-hint-${ID}"[^>]*>${pt["admin.serviceTypes.smsNotYetApplied"]}</span>`),
    );
    expect(pt["admin.serviceTypes.smsNotYetApplied"]).toBe("Ainda sem efeito nos lembretes.");
    expect(en["admin.serviceTypes.smsNotYetApplied"]).toBe("Not yet applied to reminders.");
  });
});

describe("Q7: the type colour is never a fill", () => {
  it("the rendered table has no inline style naming the colour", () => {
    expect(html).not.toMatch(/style="[^"]*(background|fill)/i);
    expect(html.toLowerCase()).not.toMatch(/style="[^"]*#c27e3a/);
  });

  it("neither source paints a background or fill from a value", () => {
    for (const f of ["ServiceTypesTable.tsx", "ServiceTypeColorCell.tsx"]) {
      const src = readFileSync(join(__dirname, f), "utf-8");
      expect(src).not.toMatch(/backgroundColor|background:|\bfill\s*[:=]/);
      expect(src).not.toMatch(/style=\{/);
    }
  });
});
