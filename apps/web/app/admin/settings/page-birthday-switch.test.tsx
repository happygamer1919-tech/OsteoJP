/**
 * Indicação de Aniversários on Administração > Definições: the switch as the
 * page draws it. The REAL page renders, with its reads and its actions stubbed.
 *
 * The switch is a submit button with role="switch" that posts the value it
 * would CHANGE TO, so two things are pinned for each stored state: the hidden
 * value is the inverse of what is stored, and aria-checked is what is stored.
 * Swapping either one would save the same value on every press, or announce
 * the wrong state, and still render a switch.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({ headerIcon: false }));

vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: async () => ({ tenantId: "t-1", role: "admin", userId: "u-1" }),
}));
vi.mock("@/lib/admin/settings", () => ({
  getTenantSettings: async () => ({
    name: "Clinica",
    nif: "",
    contacts: { email: "", phone: "", address: "" },
    config: {
      locale: "pt",
      reminders: { emailEnabled: true, smsEnabled: true, leadTimeHours: [48, 24] },
      billing: { currency: "EUR", vatRate: 23, invoiceEmail: "" },
    },
    birthdayIndication: { headerIcon: h.headerIcon },
  }),
}));
// The Sistemas / SubSistemas panel shares this page: its reads and its
// actions are stubbed too, so the page renders without a database.
vi.mock("@/lib/admin/health-systems", () => ({
  listHealthSystems: async () => [],
  getHealthSystemsPriceTable: async () => false,
}));
vi.mock("./actions", () => ({
  saveSettings: async () => {},
  changeDeletePasswordAction: async () => {},
  saveBirthdayIndicationAction: async () => {},
  addHealthSystemAction: async () => {},
  setHealthSystemActiveAction: async () => {},
  setHealthSystemsPriceTableAction: async () => {},
}));

import SettingsPage from "./page";

async function render(): Promise<string> {
  const el = await SettingsPage({ searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(el);
}

/** The birthday panel's form, from its heading to its closing tag. */
function panel(html: string): string {
  const at = html.indexOf("Indicação de Aniversários");
  expect(at, "the panel heading is on the page").toBeGreaterThan(-1);
  return html.slice(at, html.indexOf("</form>", at));
}

const switchTag = (html: string): string =>
  html.match(/<button[^>]*data-testid="settings-birthday-header-icon"[^>]*>/)?.[0] ?? "";

beforeEach(() => {
  h.headerIcon = false;
});

describe("the Notificação de aniversariantes switch", () => {
  it("OFF: posts true, and reads as not checked", async () => {
    const p = panel(await render());
    expect(p).toContain('<input type="hidden" name="birthdayHeaderIcon" value="true"/>');
    const tag = switchTag(p);
    expect(tag).toContain('role="switch"');
    expect(tag).toContain('aria-checked="false"');
  });

  it("ON: posts false, and reads as checked", async () => {
    h.headerIcon = true;
    const p = panel(await render());
    expect(p).toContain('<input type="hidden" name="birthdayHeaderIcon" value="false"/>');
    expect(switchTag(p)).toContain('aria-checked="true"');
  });

  it("carries Fisiozero's label and sub-text as its name and description", async () => {
    const p = panel(await render());
    expect(p).toContain('<span id="birthday-header-icon-label"');
    expect(p).toContain(">Notificação de aniversariantes</span>");
    expect(p).toContain(">Ícone no topo da página</span>");
    const tag = switchTag(p);
    expect(tag).toContain('aria-labelledby="birthday-header-icon-label"');
    expect(tag).toContain('aria-describedby="birthday-header-icon-hint"');
    expect(tag).toContain('type="submit"');
  });

  it("is the FIRST panel on the page, as in Fisiozero", async () => {
    const html = await render();
    expect(html.indexOf("Indicação de Aniversários")).toBeLessThan(html.indexOf('name="name"'));
  });
});
