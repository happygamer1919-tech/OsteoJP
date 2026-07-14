import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

import { BarChart } from "./bar-chart";

/**
 * W7-03: the Estatisticas chart takes a purple accent per the 55/25/20 equity.
 * The PEAK bar fills accent-1-700 (logo purple); every other bar stays cyan.
 * The accent is tied to MEANING (the highest value), and colour is never the
 * only cue: every value is printed as text beside its bar.
 */
const render = (data: { label: string; value: number }[]) =>
  renderToStaticMarkup(
    createElement(BarChart, {
      data,
      formatValue: (v: number) => String(v),
      emptyLabel: "Sem dados",
    }),
  );

describe("BarChart W7-03 purple peak accent", () => {
  it("fills the peak bar with accent-1-700 (purple) and the rest with brand teal", () => {
    const html = render([
      { label: "Jan", value: 10 },
      { label: "Fev", value: 40 },
      { label: "Mar", value: 25 },
    ]);
    expect(html).toContain("var(--color-accent-1-700)");
    expect(html).toContain("var(--color-brand-teal)");
    // Exactly one peak.
    expect(html.match(/data-peak="true"/g)?.length).toBe(1);
    expect(html.match(/data-peak="false"/g)?.length).toBe(2);
  });

  it("still prints every value as text, so colour carries no exclusive meaning", () => {
    const html = render([
      { label: "Jan", value: 10 },
      { label: "Fev", value: 40 },
    ]);
    expect(html).toContain("Jan");
    expect(html).toContain("Fev");
    expect(html).toContain(">10<");
    expect(html).toContain(">40<");
  });

  it("highlights nothing when every value is zero (no all-purple chart)", () => {
    const html = render([
      { label: "Jan", value: 0 },
      { label: "Fev", value: 0 },
    ]);
    expect(html).not.toContain("var(--color-accent-1-700)");
    expect(html.match(/data-peak="true"/g)).toBeNull();
  });

  it("renders the empty label when there is no data", () => {
    expect(render([])).toContain("Sem dados");
  });
});
