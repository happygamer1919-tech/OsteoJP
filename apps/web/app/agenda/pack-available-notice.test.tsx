/* eslint-disable react/display-name -- inline @osteojp/ui stand-in for a render test */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * PACK-02 — the unprompted notice in Nova marcacao.
 *
 * The pacote dropdown has always been there. It answers a question reception
 * has to think to ask, and the cost of not asking lands on the patient, who
 * pays twice for a session they already own. These tests pin the two things
 * that make a notice useful rather than noise: it carries the COUNT, and it is
 * ABSENT when there is nothing to say.
 */
vi.mock("@osteojp/ui", () => ({
  Button: ({ children, ...rest }: { children?: ReactNode; "data-testid"?: string }) =>
    createElement("button", rest, children as ReactNode),
}));

import type { AvailablePack } from "./pack-available-notice";

const { PackAvailableNotice, offerablePacks } = await import("./pack-available-notice");
const { s } = await import("@/lib/i18n");

const NESA = "svc-nesa";
const FISIO = "svc-fisioterapia";

const pack = (over: Partial<AvailablePack> = {}): AvailablePack => ({
  packId: "pack-1",
  packName: "Pacote 10 sessões",
  baseServiceId: NESA,
  sessionsTotal: 10,
  sessionsAvailable: 4,
  ...over,
});

/**
 * The PACK-02 cases below predate the service filter and pass `serviceId: ""`,
 * which is the "no service chosen yet" arm the owner ruled on: everything the
 * patient owns is shown. Their behaviour is unchanged, and that is asserted
 * rather than assumed — the PACK-03 block below drives the filter directly.
 */
const render = (packs: AvailablePack[], serviceId = ""): string =>
  renderToStaticMarkup(
    createElement(PackAvailableNotice, { packs, serviceId, onUse: vi.fn() }),
  );

describe("PACK-02 — the notice appears only when it has something to say", () => {
  it("renders NOTHING for a patient with no pacote sessions left", () => {
    // Not an empty box and not a "0 available" row. A notice that shows for
    // every patient is a notice reception stops reading, and then it is not
    // there for the one patient it mattered for.
    expect(render([])).toBe("");
  });

  it("renders the notice when there are sessions", () => {
    expect(render([pack()])).toContain(s["appointment.packAvailableNotice"]);
  });
});

describe("PACK-02 — what the notice carries", () => {
  it("names the pacote and THE COUNT, which is the whole point of it", () => {
    const html = render([pack({ sessionsAvailable: 4 })]);
    expect(html).toContain("Pacote 10 sessões");
    expect(html).toContain("4");
    expect(html).toContain(s["packs.remaining"]);
  });

  it("offers a one-click way to use it", () => {
    expect(render([pack()])).toContain('data-testid="pack-use-pack-1"');
    expect(render([pack()])).toContain(s["appointment.packAvailableUse"]);
  });

  it("lists EVERY pacote with sessions, each with its own count and button", () => {
    const html = render([
      pack(),
      pack({ packId: "pack-2", packName: "Pacote 5 sessões", sessionsTotal: 5, sessionsAvailable: 1 }),
    ]);
    expect(html).toContain('data-testid="pack-use-pack-1"');
    expect(html).toContain('data-testid="pack-use-pack-2"');
    expect(html).toContain("Pacote 5 sessões");
    expect(html).toContain("1");
  });

  it("shows a pacote with exactly ONE session left, the case worth catching", () => {
    // The last session is the one most likely to be paid for twice.
    const html = render([pack({ sessionsAvailable: 1 })]);
    expect(html).toContain(s["appointment.packAvailableNotice"]);
    expect(html).toContain("1");
  });
});

/**
 * PACK-03 — A PACOTE BINDS TO ONE SERVICE.
 *
 * The owner saw a NESA pacote offered against a Fisioterapia appointment. The
 * offer was the defect: the schema has always bound a pacote to exactly one
 * service (`service_packs.base_service_id`, NOT NULL) and the retroactive
 * linker has always refused a mismatch — this one surface did not ask.
 */
describe("PACK-03 — the notice offers only pacotes for the service in hand", () => {
  it("HIDES a NESA pacote when the form holds Fisioterapia — the reported defect", () => {
    expect(render([pack({ baseServiceId: NESA })], FISIO)).toBe("");
  });

  it("shows a NESA pacote when the form holds NESA", () => {
    const html = render([pack({ baseServiceId: NESA })], NESA);
    expect(html).toContain(s["appointment.packAvailableNotice"]);
    expect(html).toContain('data-testid="pack-use-pack-1"');
  });

  /**
   * THE NEGATIVE ARM, and it is the one that would catch a filter written as
   * "hide everything unless it matches". With no service chosen the notice must
   * still speak, because saying "this patient has already paid" BEFORE anybody
   * asks is the whole reason it exists — and pressing Use then SETS the service.
   */
  it("shows everything while NO service is chosen, and that is the ruling", () => {
    const html = render([pack({ baseServiceId: NESA })], "");
    expect(html).toContain('data-testid="pack-use-pack-1"');
  });

  it("filters a MIXED list down to the matching pacote only", () => {
    const html = render(
      [
        pack({ packId: "nesa-1", packName: "Pacote NESA 10", baseServiceId: NESA }),
        pack({ packId: "fisio-1", packName: "Pacote Fisio 5", baseServiceId: FISIO }),
      ],
      FISIO,
    );
    expect(html).toContain('data-testid="pack-use-fisio-1"');
    expect(html).not.toContain('data-testid="pack-use-nesa-1"');
    expect(html).not.toContain("Pacote NESA 10");
  });

  /**
   * A NOTICE WITH NOTHING TO SAY SAYS NOTHING. An empty box under "sessões por
   * usar" would read as "this patient has none", which is the opposite of true
   * and is exactly the §1.3 conflation: the unknown case wearing the face of a
   * known one.
   */
  it("renders NOTHING rather than an empty box when every pacote is a mismatch", () => {
    expect(render([pack({ baseServiceId: NESA }), pack({ packId: "p2", baseServiceId: NESA })], FISIO)).toBe("");
  });
});

describe("PACK-03 — offerablePacks, the rule on its own", () => {
  it("is identity when no service is chosen", () => {
    const packs = [pack({ baseServiceId: NESA }), pack({ packId: "p2", baseServiceId: FISIO })];
    expect(offerablePacks(packs, "").map((p) => p.packId)).toEqual(["pack-1", "p2"]);
  });

  it("keeps only exact matches — never a prefix, never a case-fold", () => {
    const packs = [pack({ baseServiceId: NESA })];
    expect(offerablePacks(packs, NESA)).toHaveLength(1);
    expect(offerablePacks(packs, NESA.toUpperCase())).toHaveLength(0);
    expect(offerablePacks(packs, "svc")).toHaveLength(0);
  });

  it("does not mutate what it was given", () => {
    const packs = [pack({ baseServiceId: NESA }), pack({ packId: "p2", baseServiceId: FISIO })];
    offerablePacks(packs, NESA);
    expect(packs).toHaveLength(2);
  });
});
