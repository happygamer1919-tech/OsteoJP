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
      "As marcações não guardam preço: o valor cobrado é o que consta da fatura emitida.",
    );
    expect(pt["admin.serviceTypes.note2"]).toBe("As estatísticas contam apenas as faturas emitidas, não as marcações.");
    expect(en["admin.serviceTypes.note1"]).toBe(
      "Appointments store no price: the amount charged is the one on the issued invoice.",
    );
    expect(en["admin.serviceTypes.note2"]).toBe("Statistics count issued invoices only, not appointments.");
    // The two sentences only: no "Nota 1:" / "Note 1:" label.
    expect(text(html)).not.toMatch(/Not[ae] [12]:/);
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
  });

  it("the refusal names both ways out: choose a Motivo, or set IVA back to the unset value", () => {
    const unset = pt["admin.serviceTypes.vatUnset"];
    expect(unset).toBe("--");
    expect(en["admin.serviceTypes.vatUnset"]).toBe(unset);
    expect(pt["admin.serviceTypes.vatReasonRequired"]).toBe(
      `Com IVA 0% é obrigatório escolher o Motivo IVA, ou voltar a pôr o IVA em "${unset}". Nada foi guardado.`,
    );
    expect(en["admin.serviceTypes.vatReasonRequired"]).toBe(
      `A 0% VAT rate needs a VAT reason, or set VAT back to "${unset}". Nothing was saved.`,
    );
    expect(pt["admin.serviceTypes.newVatReasonRequired"]).toBe(
      `O novo Tipo de Marcação tem IVA 0%: escolha um Motivo IVA ou volte a pôr o IVA em "${unset}". Nada foi inserido.`,
    );
    expect(en["admin.serviceTypes.newVatReasonRequired"]).toBe(
      `The new appointment type has 0% VAT: choose a VAT reason or set VAT back to "${unset}". Nothing was inserted.`,
    );
    expect(pt["admin.serviceTypes.vatReasonRows"]).toBe("Tipos de Marcação a corrigir:");
    expect(en["admin.serviceTypes.vatReasonRows"]).toBe("Appointment types to fix:");
  });

  it("B10: the Motivo picker stays UNCONTROLLED, so React's reset after a save restores the stored code", () => {
    // A controlled select has no default option: after the form action's reset
    // its DOM value drops to the placeholder and the next untouched save posts
    // an empty Motivo for every row (R4, reproduced in headless Chromium).
    const src = readFileSync(join(__dirname, "ServiceTypeVatPair.tsx"), "utf-8");
    // The select's own attributes: from its name up to its first option.
    const at = src.indexOf("name={reasonName}");
    expect(at).toBeGreaterThan(-1);
    const reasonSelect = src.slice(at, src.indexOf("<option", at));
    expect(reasonSelect).toContain('defaultValue={reason ?? ""}');
    expect(reasonSelect).toContain("ref={reasonRef}");
    expect(reasonSelect).not.toMatch(/\svalue=\{/);
    expect(src).not.toMatch(/useState/);
    expect(src).toContain('reasonRef.current.value = ""');
  });

  it("each row is keyed on its id AND its stored updated_at, so a saved row remounts", () => {
    // React resets the form after a save to the defaults set at MOUNT. Keyed on
    // the id alone, a row saved from 0%/M07 to 23% is reset to show 0%/M07 and
    // the next untouched save writes them back (R4, headless Chromium).
    const src = readFileSync(join(__dirname, "ServiceTypesTable.tsx"), "utf-8");
    expect(src).toContain("<Fragment key={`${svc.id}:${svc.updatedAt.getTime()}`}>");
    expect(src).not.toContain("<Fragment key={svc.id}>");
  });

  it("B10: the mirror refusal names both ways out: clear the Motivo, or set IVA to 0%", () => {
    expect(pt["admin.serviceTypes.vatReasonNotExempt"]).toBe(
      "Só o IVA 0% leva Motivo IVA. Retire o Motivo ou ponha o IVA a 0%. Nada foi guardado.",
    );
    expect(en["admin.serviceTypes.vatReasonNotExempt"]).toBe(
      "Only 0% VAT takes a VAT reason. Clear the reason or set VAT to 0%. Nothing was saved.",
    );
    expect(pt["admin.serviceTypes.newVatReasonNotExempt"]).toBe(
      "O novo Tipo de Marcação tem IVA acima de 0%: retire o Motivo IVA ou ponha o IVA a 0%. Nada foi inserido.",
    );
    expect(en["admin.serviceTypes.newVatReasonNotExempt"]).toBe(
      "The new appointment type has VAT above 0%: clear the VAT reason or set VAT to 0%. Nothing was inserted.",
    );
    expect(pt["admin.serviceTypes.vatReasonRule"]).toContain("Com IVA 6%, 13% ou 23%, o Motivo fica vazio.");
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
