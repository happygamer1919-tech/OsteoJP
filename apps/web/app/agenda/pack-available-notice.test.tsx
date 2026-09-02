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

const { PackAvailableNotice } = await import("./pack-available-notice");
const { s } = await import("@/lib/i18n");

const pack = (over: Partial<AvailablePack> = {}): AvailablePack => ({
  packId: "pack-1",
  packName: "Pacote 10 sessões",
  sessionsTotal: 10,
  sessionsAvailable: 4,
  ...over,
});

const render = (packs: AvailablePack[]): string =>
  renderToStaticMarkup(createElement(PackAvailableNotice, { packs, onUse: vi.fn() }));

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
