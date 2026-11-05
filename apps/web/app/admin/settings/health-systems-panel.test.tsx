import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The panel's forms post to server actions; stub them so it renders in node.
vi.mock("./actions", () => ({
  addHealthSystemAction: vi.fn(),
  setHealthSystemActiveAction: vi.fn(),
  setHealthSystemsPriceTableAction: vi.fn(),
}));

import { HealthSystemsPanel, healthSystemsBanner } from "./health-systems-panel";

const render = (props: Partial<Parameters<typeof HealthSystemsPanel>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(HealthSystemsPanel, { entries: [], priceTableEnabled: false, message: null, ...props }),
  );

// Fisiozero's labels, verbatim (owner request 2026-11-02: copy the structure
// exactly; only the design and colours are OsteoJP's).
describe("Sistemas / SubSistemas panel: Fisiozero's structure", () => {
  it("has the title, the text box, the plus button with its tooltip, the dotted rule and the switch row, in that order", () => {
    const html = render();
    const order = [
      "Sistemas / SubSistemas",
      'placeholder="Novo Sistema Sub/Sistema..."',
      'title="Adicionar novo Sistema / SubSistema"',
      "border-dotted",
      "Usa tabela de preços de Sistemas (ainda sem efeito)",
      "Ao cruzar Tipos de Marcações com Sistemas/Subsistemas o preço será automaticamente atualizado nas marcações.",
      'role="switch"',
    ];
    let at = -1;
    for (const needle of order) {
      const i = html.indexOf(needle, at + 1);
      expect(i, needle).toBeGreaterThan(at);
      at = i;
    }
  });

  it("the switch is OFF by default and says so to assistive technology", () => {
    expect(render()).toContain('aria-checked="false"');
    expect(render({ priceTableEnabled: true })).toContain('aria-checked="true"');
  });

  it("the switch posts the OPPOSITE of its current state", () => {
    expect(render()).toContain('name="enabled" value="true"');
    expect(render({ priceTableEnabled: true })).toContain('name="enabled" value="false"');
  });

  it("an empty list says so", () => {
    expect(render()).toContain("Ainda não há Sistemas / SubSistemas.");
  });

  it("one line per entry, with its state and the control that flips it; no delete control", () => {
    const html = render({
      entries: [
        { id: "a", name: "ADSE", active: true },
        { id: "b", name: "SAMS", active: false },
      ],
    });
    expect(html.match(/<li/g)?.length).toBe(2);
    expect(html).toContain("ADSE");
    expect(html).toContain("Desativar");
    expect(html).toContain("Reativar");
    expect(html).toContain('name="id" value="a"');
    expect(html).toMatch(/name="id" value="a"\/><input type="hidden" name="active" value="false"/);
    expect(html).toMatch(/name="id" value="b"\/><input type="hidden" name="active" value="true"/);
    expect(html).not.toMatch(/Eliminar|Apagar/);
    // A screen reader hears which entry each button acts on.
    expect(html).toContain('aria-label="Desativar ADSE"');
    expect(html).toContain('aria-label="Reativar SAMS"');
  });
});

describe("Sistemas / SubSistemas panel: messages", () => {
  it("maps only its own hs- codes", () => {
    expect(healthSystemsBanner("ok")).toBeNull();
    expect(healthSystemsBanner(undefined)).toBeNull();
    expect(healthSystemsBanner("err:invalid")).toBeNull();
    expect(healthSystemsBanner("hs-ok")).toEqual({ ok: true, text: "Definições guardadas." });
    expect(healthSystemsBanner("hs-err:name_taken")?.ok).toBe(false);
    expect(healthSystemsBanner("hs-err:invalid")?.ok).toBe(false);
    expect(healthSystemsBanner("hs-err:forbidden")?.ok).toBe(false);
    expect(healthSystemsBanner("hs-reactivated")?.ok).toBe(true);
  });

  it("the duplicate message says accents do not count (ruling Q12)", () => {
    expect(healthSystemsBanner("hs-err:name_taken")?.text).toBe(
      "Já existe um Sistema / SubSistema com esse nome (maiúsculas, espaços e acentos não contam: Médis e Medis são o mesmo nome).",
    );
  });

  it("the price switch says it is not in effect yet (ruling Q13)", () => {
    expect(render()).toContain("Usa tabela de preços de Sistemas (ainda sem efeito)");
  });
});
