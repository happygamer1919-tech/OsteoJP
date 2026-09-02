/* eslint-disable react/display-name -- inline @osteojp/ui stand-ins for a render test */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { packSessionsAvailable, packSessionsConsumed } from "@osteojp/db";
import type { PackInstanceView } from "@/lib/packs/instances";

/**
 * PACK-02 — the patient profile prints USED beside REMAINING.
 *
 * ==========================================================================
 * THE ONE THAT MATTERS IS THE OVERDRAW, and it is why `used` is
 * `packSessionsConsumed` and not `total - available`.
 * ==========================================================================
 * `packSessionsAvailable` is CLAMPED at zero, deliberately: "minus one session"
 * is not something a clinic can act on. `packSessionsConsumed` is NOT clamped,
 * because what has been spent is a fact. On an overdrawn instance the two
 * disagree, and `total - available` would print "10 de 10 usadas" while eleven
 * sessions had actually been booked - a display agreeing with itself and
 * disagreeing with the diary, which is exactly what removing the stored counter
 * was for.
 */
vi.mock("@osteojp/ui", () => ({
  Card: ({ title, children }: { title?: ReactNode; children?: ReactNode }) =>
    createElement("section", null, title as ReactNode, children as ReactNode),
  StatusChip: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children as ReactNode),
}));

const { PatientPacks } = await import("./patient-packs");
const { s } = await import("@/lib/i18n");

/** Built through the REAL formulas, so the test cannot drift from them. */
const view = (
  over: Partial<{ sessionsTotal: number; legacyConsumed: number; linkedAppointments: number }> = {},
): PackInstanceView => {
  const inputs = { sessionsTotal: 10, legacyConsumed: 0, linkedAppointments: 3, ...over };
  return {
    id: "inst-1",
    packId: "pack-1",
    packName: "Pacote 10 sessões",
    baseServiceName: "Massagem",
    sessionsTotal: inputs.sessionsTotal,
    sessionsAvailable: packSessionsAvailable(inputs),
    sessionsConsumed: packSessionsConsumed(inputs),
    active: packSessionsAvailable(inputs) > 0,
  };
};

const render = (instances: PackInstanceView[]): string =>
  renderToStaticMarkup(createElement(PatientPacks, { instances }));

const used = (n: number, total = 10) =>
  s["packs.usedOfTotal"].replace("{used}", String(n)).replace("{total}", String(total));

describe("PACK-02 — used and remaining", () => {
  it("prints both numbers for an ordinary pacote", () => {
    const html = render([view()]);
    expect(html).toContain(`7 ${s["packs.remaining"]}`);
    expect(html).toContain(used(3));
  });

  it("counts the pre-0067 consumption too, not only linked appointments", () => {
    // legacy_consumed records how many, never which. It still spent them.
    const html = render([view({ legacyConsumed: 2, linkedAppointments: 1 })]);
    expect(html).toContain(`7 ${s["packs.remaining"]}`);
    expect(html).toContain(used(3));
  });

  it("an EXHAUSTED pacote reads 0 remaining and all of them used", () => {
    const html = render([view({ linkedAppointments: 10 })]);
    expect(html).toContain(`0 ${s["packs.remaining"]}`);
    expect(html).toContain(used(10));
  });

  it("AN OVERDRAWN PACOTE TELLS THE TRUTH: 0 remaining, ELEVEN used of ten", () => {
    // `total - available` would say "10 de 10". The diary holds eleven.
    const html = render([view({ linkedAppointments: 11 })]);
    expect(html).toContain(`0 ${s["packs.remaining"]}`);
    expect(html).toContain(used(11));
    expect(html).not.toContain(used(10));
  });

  it("renders every pacote the patient holds", () => {
    const html = render([view(), { ...view({ linkedAppointments: 1 }), id: "inst-2", packName: "Pacote 5" }]);
    expect(html).toContain("Pacote 10 sessões");
    expect(html).toContain("Pacote 5");
  });

  it("renders nothing at all for a patient with no pacotes", () => {
    expect(render([])).toBe("");
  });

  it("keeps the note explaining where the sessions went", () => {
    expect(render([view()])).toContain(s["packs.derivedNote"]);
  });
});
