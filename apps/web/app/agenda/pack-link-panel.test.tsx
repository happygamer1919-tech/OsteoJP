/* eslint-disable react/display-name -- inline @osteojp/ui stand-in for a render test */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { LinkablePacksView } from "@/lib/packs/link";

/**
 * PACK-01 — the panel says WHICH of the four things is true.
 *
 * The whole point of this component is that an empty offer list is not one
 * fact. These tests assert each branch by the sentence it prints AND by the
 * absence of the other three, because the failure being guarded against is not
 * "nothing renders" - it is "the wrong one of four renders", which looks
 * perfectly fine on screen.
 */
// The stand-in FORWARDS data-testid, because the per-instance testid is how a
// test tells one pacote's button from another's - and "Associar" alone cannot,
// since it is also a substring of the panel's own title.
vi.mock("@osteojp/ui", () => ({
  Button: ({
    children,
    disabled,
    ...rest
  }: {
    children?: ReactNode;
    disabled?: boolean;
    "data-testid"?: string;
  }) =>
    createElement(
      "button",
      { ...rest, "data-disabled": disabled ? "1" : "0" },
      children as ReactNode,
    ),
}));

const { PackLinkPanel } = await import("./pack-link-panel");
const { s } = await import("@/lib/i18n");

const option = (over: Partial<LinkablePacksView["options"][number]> = {}) => ({
  instanceId: "inst-1",
  packName: "Pacote 10 sessões",
  baseServiceName: "Massagem",
  sessionsTotal: 10,
  sessionsAvailable: 7,
  ...over,
});

const render = (
  view: LinkablePacksView,
  busyInstanceId: string | null = null,
  error: Parameters<typeof PackLinkPanel>[0]["error"] = null,
): string =>
  renderToStaticMarkup(
    createElement(PackLinkPanel, { view, busyInstanceId, error, onLink: vi.fn() }),
  );

/** Every sentence the panel can print, so each test can assert the other three are absent. */
const SENTENCES = [
  s["appointment.packLinkedTo"],
  s["appointment.packLinkCancelled"],
  s["appointment.packLinkNoService"],
  s["appointment.packLinkNone"],
] as const;

const onlySentence = (html: string, expected: string) => {
  expect(html).toContain(expected);
  for (const other of SENTENCES) {
    if (other !== expected) expect(html).not.toContain(other);
  }
};

describe("PACK-01 — the four outcomes are four different sentences", () => {
  it("ALREADY LINKED names the pacote and its balance, and does not read as 'no pacotes'", () => {
    const html = render({
      blocked: "already_linked",
      linkedTo: { packName: "Pacote 10 sessões", sessionsTotal: 10, sessionsAvailable: 4 },
      options: [],
    });
    onlySentence(html, s["appointment.packLinkedTo"]);
    expect(html).toContain("Pacote 10 sessões");
    expect(html).toContain("4/10");
    // The offer must be GONE, not merely empty-looking. Asserted on the
    // button, not on the word: "Associar" is also a substring of the panel's
    // own title "Associar a um pacote", so a text search would pass here even
    // with the whole offer list rendered.
    expect(html).not.toContain("<button");
  });

  it("ALREADY LINKED still says so when the instance itself could not be read", () => {
    // linkedTo null is reachable: the row could have been archived. The fact
    // that it IS linked is still true and must still be said.
    const html = render({ blocked: "already_linked", linkedTo: null, options: [] });
    onlySentence(html, s["appointment.packLinkedTo"]);
  });

  it("CANCELLED says a cancelled visit consumes nothing", () => {
    onlySentence(
      render({ blocked: "cancelled_consumes_nothing", linkedTo: null, options: [] }),
      s["appointment.packLinkCancelled"],
    );
  });

  it("NO SERVICE asks for the service rather than blaming the pacotes", () => {
    onlySentence(
      render({ blocked: "no_service", linkedTo: null, options: [] }),
      s["appointment.packLinkNoService"],
    );
  });

  it("NOTHING FITS is the only branch that says the patient has no usable pacote", () => {
    onlySentence(render({ blocked: null, linkedTo: null, options: [] }), s["appointment.packLinkNone"]);
  });
});

describe("PACK-01 — the offer list", () => {
  it("prints each pacote with its DERIVED balance and an Associar button", () => {
    const html = render({ blocked: null, linkedTo: null, options: [option()] });
    expect(html).toContain("Pacote 10 sessões");
    expect(html).toContain("7/10");
    expect(html).toContain("<button");
    // And none of the four "cannot" sentences.
    for (const sentence of SENTENCES) expect(html).not.toContain(sentence);
  });

  it("offers every eligible pacote, not just the first", () => {
    const html = render({
      blocked: null,
      linkedTo: null,
      options: [option(), option({ instanceId: "inst-2", packName: "Pacote 5 sessões", sessionsTotal: 5, sessionsAvailable: 2 })],
    });
    expect(html).toContain('data-testid="pack-link-inst-1"');
    expect(html).toContain('data-testid="pack-link-inst-2"');
    expect(html).toContain("2/5");
  });

  it("DISABLES EVERY BUTTON while any link is in flight, not only the one pressed", () => {
    // Two pacotes on one visit is exactly what "cannot link twice" forbids, and
    // a second click on the OTHER button is the easiest way to attempt it.
    const html = render(
      { blocked: null, linkedTo: null, options: [option(), option({ instanceId: "inst-2" })] },
      "inst-1",
    );
    expect(html).not.toContain('data-disabled="0"');
    expect((html.match(/data-disabled="1"/g) ?? []).length).toBe(2);
  });

  it("leaves the buttons live when nothing is in flight", () => {
    const html = render({ blocked: null, linkedTo: null, options: [option()] });
    expect(html).toContain('data-disabled="0"');
  });
});

describe("PACK-01 — the failure message", () => {
  it("is absent by default", () => {
    expect(render({ blocked: null, linkedTo: null, options: [option()] }))
      .not.toContain('data-testid="pack-link-error"');
  });

  it("prints the race message and keeps the list on screen", () => {
    // The refetch that follows a refusal may still show options; the person
    // needs both the reason and something to press.
    const html = render({ blocked: null, linkedTo: null, options: [option()] }, null, "appointment.packLinkTaken");
    expect(html).toContain(s["appointment.packLinkTaken"]);
    expect(html).toContain('role="alert"');
    expect(html).toContain("<button");
  });
});
