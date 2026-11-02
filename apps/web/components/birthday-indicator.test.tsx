/**
 * Indicação de Aniversários: the top-bar icon, and where the shell draws it.
 *
 * The icon itself is rendered to static markup. AppShell is an async server
 * component that reads a Supabase session, so what it does with the setting is
 * pinned on its source, as notification-bell.test.tsx pins the bell's place.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/agenda" }));

import {
  attachDismissListeners,
  closeOnEscape,
  closeOnOutsidePointer,
} from "./birthday-disclosure.client";
import { BirthdayIndicator } from "./birthday-indicator";

const SHELL = readFileSync(join(__dirname, "app-shell.tsx"), "utf8");

const ROWS = [
  { id: "11111111-1111-4111-8111-111111111111", fullName: "Ana Exemplo", age: 46 },
  { id: "22222222-2222-4222-8222-222222222222", fullName: "Bruno Modelo", age: 1 },
];

describe("the birthday icon", () => {
  it("shows today's count and opens a list linking each patient to their ficha", () => {
    const html = renderToStaticMarkup(<BirthdayIndicator rows={ROWS} />);
    expect(html).toMatch(/data-testid="birthday-count"[^>]*>2</);
    expect(html).toContain('href="/patients/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('href="/patients/22222222-2222-4222-8222-222222222222"');
    expect(html).toContain("Ana Exemplo");
    expect(html).toContain("faz 46 anos");
    expect(html).toContain("faz 1 ano");
  });

  it("is a native disclosure: a <summary> the keyboard reaches, links inside as tab stops", () => {
    const html = renderToStaticMarkup(<BirthdayIndicator rows={ROWS} />);
    expect(html).toMatch(/^<details/);
    expect(html).toContain("<summary");
    expect(html).not.toContain('tabindex="-1"');
    expect(html).toContain("focus-visible:ring-2");
  });

  it("has an accessible name that carries the count; the glyph and the badge are hidden from it", () => {
    const html = renderToStaticMarkup(<BirthdayIndicator rows={ROWS} />);
    expect(html).toContain('<span class="sr-only">Aniversariantes de hoje, 2 aniversariantes</span>');
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toMatch(/aria-hidden="true"[^>]*data-testid="birthday-count"/);
  });

  it("says one birthday in the singular", () => {
    const html = renderToStaticMarkup(<BirthdayIndicator rows={ROWS.slice(0, 1)} />);
    expect(html).toContain("Aniversariantes de hoje, 1 aniversariante<");
  });

  it("at ZERO shows the icon with no count, and the list says there are none (provisional)", () => {
    const html = renderToStaticMarkup(<BirthdayIndicator rows={[]} />);
    expect(html).toContain("<summary");
    expect(html).not.toContain('data-testid="birthday-count"');
    expect(html).toContain('<span class="sr-only">Aniversariantes de hoje</span>');
    expect(html).toContain("Sem aniversariantes hoje.");
    expect(html).not.toContain("/patients/");
  });

  it("is a 44px target, like the bell beside it", () => {
    expect(renderToStaticMarkup(<BirthdayIndicator rows={[]} />)).toContain("size-11");
  });
});

describe("it closes", () => {
  const fakeEvent = (key: string) => {
    const calls: string[] = [];
    return { e: { key, preventDefault: () => calls.push("prevent") }, calls };
  };
  /** A fake open <details>; `inside` is the one node it contains. */
  const fakeDetails = (open: boolean) => {
    const focused: string[] = [];
    const inside = { id: "inside" };
    const d = {
      open,
      querySelector: () => ({ focus: () => focused.push("summary") }),
      contains: (n: unknown) => n === inside,
    } as unknown as HTMLDetailsElement;
    return { d, focused, inside };
  };
  /** A fake document recording the listeners it holds. */
  const fakeDoc = () => {
    const held = new Map<string, Set<(e: never) => void>>();
    return {
      held,
      addEventListener: (t: string, fn: (e: never) => void) => {
        if (!held.has(t)) held.set(t, new Set());
        held.get(t)!.add(fn);
      },
      removeEventListener: (t: string, fn: (e: never) => void) => {
        held.get(t)?.delete(fn);
      },
      fire: (t: string, e: unknown) => {
        for (const fn of held.get(t) ?? []) (fn as (e: unknown) => void)(e);
      },
      count: () => [...held.values()].reduce((n, set) => n + set.size, 0),
    };
  };

  it("Escape closes an open list and puts focus back on the summary", () => {
    const { e, calls } = fakeEvent("Escape");
    const { d, focused } = fakeDetails(true);
    expect(closeOnEscape(e, d)).toBe(true);
    expect(d.open).toBe(false);
    expect(focused).toEqual(["summary"]);
    expect(calls).toEqual(["prevent"]);
  });

  it("any other key, or a closed list, is left alone", () => {
    const tab = fakeDetails(true);
    expect(closeOnEscape(fakeEvent("Tab").e, tab.d)).toBe(false);
    expect(tab.d.open).toBe(true);
    const closed = fakeDetails(false);
    const { e, calls } = fakeEvent("Escape");
    expect(closeOnEscape(e, closed.d)).toBe(false);
    expect(calls).toEqual([]);
    expect(closeOnEscape(e, null)).toBe(false);
  });

  it("a pointer press OUTSIDE closes it; a press inside does not", () => {
    const { d, inside } = fakeDetails(true);
    expect(closeOnOutsidePointer(inside, d)).toBe(false);
    expect(d.open).toBe(true);
    expect(closeOnOutsidePointer({ id: "elsewhere" }, d)).toBe(true);
    expect(d.open).toBe(false);
  });

  it("while open, Escape and an outside press work from ANYWHERE in the document (focus need not be inside)", () => {
    const doc = fakeDoc();
    const esc = fakeDetails(true);
    attachDismissListeners(doc, esc.d);
    expect([...doc.held.keys()].sort()).toEqual(["keydown", "pointerdown"]);
    doc.fire("keydown", fakeEvent("Escape").e);
    expect(esc.d.open).toBe(false);
    expect(esc.focused).toEqual(["summary"]);

    const doc2 = fakeDoc();
    const out = fakeDetails(true);
    attachDismissListeners(doc2, out.d);
    doc2.fire("pointerdown", { target: out.inside });
    expect(out.d.open).toBe(true);
    doc2.fire("pointerdown", { target: { id: "elsewhere" } });
    expect(out.d.open).toBe(false);
  });

  it("the cleanup removes exactly the two listeners it added", () => {
    const doc = fakeDoc();
    const cleanup = attachDismissListeners(doc, fakeDetails(true).d);
    expect(doc.count()).toBe(2);
    cleanup();
    expect(doc.count()).toBe(0);
  });

  it("listens only while open (the toggle event), and is keyed on the pathname", () => {
    const src = readFileSync(join(__dirname, "birthday-disclosure.client.tsx"), "utf8");
    expect(src).toMatch(/onToggle=\{\(e\) => setOpen\(e\.currentTarget\.open\)\}/);
    expect(src).toMatch(/if \(!open \|\| !ref\.current\) return;\s*return attachDismissListeners\(document, ref\.current\);\s*\}, \[open\]\);/);
    expect(src).toMatch(/const pathname = usePathname\(\);/);
    expect(src).toMatch(/<OpenAwareDetails key=\{pathname \?\? ""\}/);
    // and the icon renders closed
    expect(renderToStaticMarkup(<BirthdayIndicator rows={ROWS} />)).not.toMatch(/<details[^>]*\sopen/);
  });

  it("a long name cannot push the row wider than the list (min-w-0)", () => {
    const html = renderToStaticMarkup(<BirthdayIndicator rows={ROWS} />);
    expect(html).toMatch(/<a href="\/patients\/[^"]+" class="[^"]*\bmin-w-0\b/);
    expect(html).toMatch(/<span class="[^"]*\bmin-w-0\b[^"]*\bbreak-words\b[^"]*">Ana Exemplo</);
  });
});

describe("the shell draws it only when the setting is ON, and only from lg up", () => {
  it("renders <BirthdayIndicator> only behind a non-null birthdays value", () => {
    // loadBirthdayIndication answers null while the switch is OFF (the default),
    // birthdays.test.ts pins that; here the shell must draw nothing for null.
    expect(SHELL).toMatch(/\{birthdays && \(\s*<BirthdayIndicator /);
    expect(SHELL.match(/<BirthdayIndicator /g)).toHaveLength(1);
    expect(SHELL).toMatch(/loadBirthdayIndication\(ctx, id\.birthdayIconOn\)/);
  });

  it("is hidden below lg: the shell passes max-lg:hidden, and the icon carries it", () => {
    expect(SHELL).toMatch(/<BirthdayIndicator className="max-lg:hidden" /);
    const html = renderToStaticMarkup(<BirthdayIndicator className="max-lg:hidden" rows={[]} />);
    expect(html).toMatch(/^<details class="relative max-lg:hidden"/);
  });

  it("reads the identity, the bell count and the birthdays in parallel", () => {
    expect(SHELL).toMatch(/const \[identity, unread, birthdays\] = await Promise\.all\(\[/);
    expect(SHELL).not.toMatch(/await loadBirthdayIndication/);
    expect(SHELL).not.toMatch(/await unreadCount/);
    expect(SHELL).not.toMatch(/await staffShellIdentity/);
  });

  it("sits outside the profile link, like the bell", () => {
    const at = SHELL.indexOf("<BirthdayIndicator");
    const linkOpen = SHELL.indexOf('<Link\n        href="/perfil"');
    const linkClose = SHELL.indexOf("</Link>", linkOpen);
    expect(at).toBeGreaterThan(-1);
    expect(at > linkOpen && at < linkClose).toBe(false);
  });
});
