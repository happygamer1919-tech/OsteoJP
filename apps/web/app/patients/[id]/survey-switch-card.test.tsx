import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * SAT-01 (S8) on the ficha: the survey switch card (copy texts 58 to 60).
 *
 * What the screen shows for each state of the switch, and what its one form
 * can post. Who sees the card at all is the page's decision
 * (page-survey-switch.test.tsx); the write is survey-switch.db.test.ts.
 */
vi.mock("@osteojp/ui", () => ({
  Card: ({ title, children }: { title?: ReactNode; children?: ReactNode }) =>
    createElement("section", null, createElement("h2", null, title as ReactNode), children as ReactNode),
}));
// Opaque to a render: the form only needs something to point at.
vi.mock("./survey-switch-actions", () => ({ setSurveySwitchAction: vi.fn() }));

const { SurveySwitchCard } = await import("./survey-switch-card");
const { getStrings } = await import("@osteojp/i18n");
const pt = getStrings("pt");
const en = getStrings("en");

const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";

function render(props: Partial<Parameters<typeof SurveySwitchCard>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(SurveySwitchCard, { patientId: PATIENT, locale: "pt", enabled: true, ...props }),
  );
}

/** The value of a hidden input, by name. */
const hidden = (html: string, name: string) =>
  new RegExp(`<input type="hidden" name="${name}" value="([^"]*)"`).exec(html)?.[1];

describe("the survey switch card", () => {
  it("carries the approved title and label (texts 58 and 59)", () => {
    const html = render();
    expect(html).toContain("<h2>Avaliações de satisfação</h2>");
    expect(html).toContain("Enviar avaliação de satisfação depois das consultas");
  });

  it("ON: the switch reads on, the form would turn it OFF, and the note is not shown", () => {
    const html = render({ enabled: true });
    expect(html).toMatch(/<button[^>]*role="switch"[^>]*aria-checked="true"/);
    expect(hidden(html, "enabled")).toBe("false");
    expect(html).not.toContain(pt["patients.surveySwitchOffNote"]);
  });

  it("OFF: the switch reads off, the form would turn it ON, and the note is shown (text 60)", () => {
    const html = render({ enabled: false });
    expect(html).toMatch(/<button[^>]*role="switch"[^>]*aria-checked="false"/);
    expect(hidden(html, "enabled")).toBe("true");
    expect(html).toContain("Desligar não afeta os lembretes de consulta.");
  });

  it("the form posts the patient and the wanted value, and nothing else", () => {
    const html = render();
    expect(html.match(/<form/g)).toHaveLength(1);
    const names = [...html.matchAll(/name="([^"]+)"/g)].map((m) => m[1]).filter((n) => !n!.startsWith("$"));
    expect(names.sort()).toEqual(["enabled", "patientId"]);
    expect(hidden(html, "patientId")).toBe(PATIENT);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*type="submit"/);
  });

  it("the switch is named by its label", () => {
    const html = render();
    expect(html).toMatch(/<span id="survey-switch-label"[^>]*>Enviar avaliação de satisfação depois das consultas<\/span>/);
    expect(html).toMatch(/<button[^>]*aria-labelledby="survey-switch-label"/);
  });

  it("a change that was not saved says so, and only then", () => {
    expect(render()).not.toContain('role="alert"');
    const html = render({ error: true });
    expect(html).toMatch(/<p role="alert"[^>]*>Não foi possível guardar a alteração\.<\/p>/);
  });

  it("is in English when asked", () => {
    const html = render({ locale: "en", enabled: false });
    expect(html).toContain(en["patients.surveySwitchTitle"]);
    expect(html).toContain(en["patients.surveySwitchLabel"]);
    expect(html).toContain(en["patients.surveySwitchOffNote"]);
  });
});
