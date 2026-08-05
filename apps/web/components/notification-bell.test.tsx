/**
 * W13-02 (Wave 13 LOOP 2) — the bell. PG4.
 *
 * THE SYMPTOM WAS REAL AND THIS IS THE GUARD THAT WOULD HAVE CAUGHT IT.
 *
 * The owner reported, from the running UI, that the notification bell navigates
 * to the same destination as "O meu perfil". LOOP 2 required that report to be
 * verified against the code before anything was fixed, and it verified:
 *
 *   1. packages/ui/src/components/UserAreaCluster.tsx held the bell as a
 *      `<span aria-hidden="true">` with no href and no handler — decorative by
 *      design, per its own doc comment, "until a notifications surface exists".
 *   2. apps/web/components/app-shell.tsx wrapped the WHOLE cluster in
 *      `<Link href="/perfil">`.
 *   3. So a click on the decorative bell hit the enclosing profile link. Both
 *      "O meu perfil" and the bell resolved to /perfil, which is exactly what
 *      the owner saw.
 *
 * VERDICT: REAL, and fixed by giving the bell its own component and its own
 * destination, and by placing it OUTSIDE the profile link. No committed test
 * expressed the placement invariant, which is why a decorative element could
 * drift inside a link and stay there. It does now.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { NotificationBell } from "@osteojp/ui";

const SHELL = readFileSync(join(__dirname, "app-shell.tsx"), "utf8");

describe("the bell has its own destination", () => {
  it("renders a link to the centre, not to the profile", () => {
    const html = renderToStaticMarkup(
      <NotificationBell href="/notificacoes" label="Notificações" />,
    );
    expect(html).toContain('href="/notificacoes"');
    expect(html).not.toContain("/perfil");
  });

  it("is NOT aria-hidden, because it is interactive now", () => {
    // The retired span was aria-hidden, which was right for something nobody
    // could click. An aria-hidden LINK is focusable by keyboard yet invisible to
    // a screen reader — worse than either state alone.
    const html = renderToStaticMarkup(
      <NotificationBell href="/notificacoes" label="Notificações" />,
    );
    expect(html).not.toContain('aria-hidden="true"><svg');
    expect(html).toContain('aria-label="Notificações"');
  });

  it("puts the unread count in the ACCESSIBLE NAME, not only in the badge", () => {
    const html = renderToStaticMarkup(
      <NotificationBell
        href="/notificacoes"
        label="Notificações"
        unreadCount={3}
        unreadLabel={(n) => `${n} por ler`}
      />,
    );
    // A badge is visual information; without a text equivalent a screen-reader
    // user hears "Notificações" whether there are 0 or 40.
    expect(html).toContain('aria-label="Notificações, 3 por ler"');
  });

  it("meets the WCAG 2.2 AA target size of 44px", () => {
    // size-11 is 44px. The retired decorative span was size-10 (40px), which was
    // acceptable for a non-target and is not acceptable for a control.
    const html = renderToStaticMarkup(
      <NotificationBell href="/notificacoes" label="Notificações" />,
    );
    expect(html).toContain("size-11");
  });

  it("shows no badge at zero, and caps the badge at 99+", () => {
    const zero = renderToStaticMarkup(
      <NotificationBell href="/notificacoes" label="N" unreadCount={0} />,
    );
    expect(zero).not.toContain("99+");
    expect(zero).not.toMatch(/>0</);

    const many = renderToStaticMarkup(
      <NotificationBell href="/notificacoes" label="N" unreadCount={1200} />,
    );
    expect(many).toContain("99+");
  });
});

describe("PLACEMENT GUARD: the bell is not inside the profile link", () => {
  // This is the assertion that maps one-to-one onto the reported defect. It is a
  // source guard rather than a render assertion because AppShell is an async
  // server component that reads a Supabase session, and the invariant is
  // structural: what matters is that the bell element is not nested within the
  // profile <Link>…</Link> span in the JSX.
  it("<NotificationBell> appears outside the <Link href=\"/perfil\"> element", () => {
    const bellAt = SHELL.indexOf("<NotificationBell");
    expect(bellAt).toBeGreaterThan(-1);

    // The user-area profile link: the opening tag through its closing </Link>.
    const linkOpen = SHELL.indexOf('<Link\n        href="/perfil"');
    expect(linkOpen).toBeGreaterThan(-1);
    const linkClose = SHELL.indexOf("</Link>", linkOpen);
    expect(linkClose).toBeGreaterThan(linkOpen);

    // The bell must not sit between them. Under the old code the bell was inside
    // UserAreaCluster, which IS between them, and this test would have failed.
    const insideProfileLink = bellAt > linkOpen && bellAt < linkClose;
    expect(insideProfileLink).toBe(false);
  });

  it("the shell points the bell at the centre route", () => {
    expect(SHELL).toContain('href="/notificacoes"');
  });

  it("UserAreaCluster no longer renders a bell at all", () => {
    // Retiring it, rather than leaving it switchable, is what stops the defect
    // returning: there is no decorative bell left to be wrapped in a link.
    const cluster = readFileSync(
      join(__dirname, "../../../packages/ui/src/components/UserAreaCluster.tsx"),
      "utf8",
    );
    const code = cluster
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("Bell");
    expect(code).not.toContain("showBell");
  });
});
