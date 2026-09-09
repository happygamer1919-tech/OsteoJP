import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * LE-inspector-and-editor-select-different-therapists — THE CARD SAYS WHETHER
 * IT IS THE ONE THE INSPECTOR IS SHOWING, AND OFFERS TO BECOME IT.
 *
 * WHAT THIS PINS THAT NOTHING ELSE DOES. The link is the ONLY thing tying a
 * schedule card to the page-level inspector, and it is one `href` string: a
 * rewrite that dropped `?t=`, dropped the `#inspetor` fragment, or pointed at
 * the wrong id would still render a link, still look right, and quietly restore
 * the two-selections-that-disagree structure the card was opened for.
 *
 * The chip half is the same property from the other side: a card that IS the
 * selected one must not also offer to become it, because two affordances
 * saying "Ver no inspetor" leave the reader comparing a name up there with a
 * name down here - which is the comparison that failed in the first place.
 */
vi.mock("@osteojp/ui", () => ({
  StatusChip: ({ children }: { children?: ReactNode }) =>
    createElement("span", { "data-chip": "" }, children),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

const { CardHeading } = await import("./CardHeading");
const { s } = await import("@/lib/i18n");

const render = (over: Partial<Parameters<typeof CardHeading>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(CardHeading, {
      id: "t2",
      label: "Bernardo Calmeiro",
      period: "week",
      inInspector: false,
      ...over,
    }),
  );

describe("CardHeading (LE-inspector-and-editor)", () => {
  it("an unselected card links to the inspector, carrying its own id and the period", () => {
    const html = render();
    expect(html).toContain('href="/horarios?t=t2&amp;p=week#inspetor"');
    expect(html).toContain(s["inspector.showInInspector"]);
    expect(html).toContain("Bernardo Calmeiro");
  });

  it("the link keeps the period the page is already on", () => {
    // Otherwise pressing it from a card silently narrows a fortnight back to a
    // week, and the reader gets a different answer than the one they were
    // looking at - a second, quieter version of the same surprise.
    expect(render({ period: "fortnight" })).toContain(
      'href="/horarios?t=t2&amp;p=fortnight#inspetor"',
    );
  });

  it("the selected card says so and does NOT offer the link", () => {
    const html = render({ inInspector: true });
    expect(html).toContain(s["inspector.shownInInspector"]);
    expect(html).not.toContain(s["inspector.showInInspector"]);
    expect(html).not.toContain("href=");
  });

  it("an id with URL-significant characters is encoded, not concatenated", () => {
    // Ids are uuids today. This is here because the failure mode of a hand-built
    // query string is a link that works on every row until one does not.
    expect(render({ id: "a&b" })).toContain('href="/horarios?t=a%26b&amp;p=week#inspetor"');
  });
});
