import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ROLES } from "@osteojp/auth";

/**
 * ==========================================================================
 * THE PHONE MENU SHOWS THE SAME LIST AS THE SIDEBAR, FOR EVERY ROLE.
 * ==========================================================================
 * Below the `lg` breakpoint the sidebar is hidden and the menu opens from a
 * button, as a drawer (`MobileNav` in `packages/ui/src/components/
 * SidebarAppShell.tsx`). The drawer shows "Ajuda" at the bottom today only
 * because it draws the same `nav` array through the same `NavList` as the
 * sidebar. That is a property of how the code happens to be written, and
 * without this test nothing fails the day the two lists stop matching: a
 * filtered drawer, a shortened one, or a hard-coded one would all ship green.
 *
 * So this renders the REAL staff shell, with the REAL `@osteojp/ui` shell and
 * the REAL nav for each role, and reads both lists off the markup: the one in
 * the desktop `<aside>` and the one in the drawer's `<dialog>`. The drawer is
 * closed in a static render, but a closed `<dialog>` still carries its
 * children, so its list is in the markup to be read.
 *
 * Only the two Next.js modules that need a running router are replaced:
 * `usePathname` returns a fixed path, and `next/link` becomes a plain anchor
 * that keeps `href`.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children?: ReactNode;
    className?: string;
    "aria-current"?: "page";
  }) => createElement("a", { href, className, "aria-current": ariaCurrent }, children),
}));

import { navItemsForRole } from "@/lib/nav/nav-items";
import { StaffShellClient } from "./staff-shell.client";

type Entry = { href: string; label: string };

/** The single `<tag ...>...</tag>` block in `html`; fails when there is not exactly one. */
function onlyBlock(html: string, tag: string): string {
  const blocks = [...html.matchAll(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "g"))].map(
    (m) => m[0],
  );
  expect(blocks, `exactly one <${tag}> in the shell`).toHaveLength(1);
  return blocks[0] ?? "";
}

/** The links of the one `<nav>` inside `region`, in order, with their visible label. */
function navEntries(region: string): Entry[] {
  const nav = onlyBlock(region, "nav");
  return [...nav.matchAll(/<a\b[^>]*?\shref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1] ?? "",
    // The icon is an inline <svg>; the label is the text after it.
    label: (m[2] ?? "").replace(/<svg\b[\s\S]*?<\/svg>/g, "").trim(),
  }));
}

function renderShell(role: (typeof ROLES)[number]): string {
  return renderToStaticMarkup(
    <StaffShellClient items={navItemsForRole(role)} userArea={null}>
      <main>conteudo</main>
    </StaffShellClient>,
  );
}

describe("the phone menu (drawer) and the desktop sidebar", () => {
  it("covers every role (a loop over no roles would pass)", () => {
    expect(ROLES.length).toBeGreaterThanOrEqual(4);
  });

  it.each(ROLES)("%s: the drawer lists exactly the sidebar's entries, in order, ending in Ajuda", (role) => {
    const html = renderShell(role);
    // Exactly two lists in the whole shell: one per surface. A third would be
    // a list this test does not read.
    expect(html.match(/<nav\b/g), "two <nav> lists in the shell").toHaveLength(2);

    const sidebar = navEntries(onlyBlock(html, "aside"));
    const drawer = navEntries(onlyBlock(html, "dialog"));
    const expected = navItemsForRole(role).map(({ href, label }) => ({ href, label }));

    expect(sidebar, `${role}: the sidebar draws the role's nav`).toEqual(expected);
    expect(drawer, `${role}: the drawer draws the same entries as the sidebar`).toEqual(sidebar);
    expect(drawer.at(-1), `${role}: Ajuda is the drawer's last entry`).toEqual({
      href: "/ajuda",
      label: "Ajuda",
    });
  });
});
