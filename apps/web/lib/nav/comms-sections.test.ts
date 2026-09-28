import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { can, ROLES } from "@osteojp/auth";

import { COMMS_SECTIONS, commsSectionsForRole } from "./comms-sections";
import { navItemsForRole } from "./nav-items";

/**
 * COMMS-01 (owner dispatch 2026-09-14, BL-2): the Comunicações group.
 * One list of sections drives the sidebar entry, the /comunicacoes redirect and
 * the tab bar, so these assertions are about that list agreeing with access.
 */
describe("the Comunicações group", () => {
  it("holds Recuperação, Lembretes SMS and Respostas SMS, each gated by its own route capability", () => {
    expect(COMMS_SECTIONS.map((c) => [c.href, c.capability])).toEqual([
      ["/recuperacao", "followup:read"],
      ["/comunicacoes/lembretes-sms", "reminders:log_read"],
      // T5 F4: the reply review queue, gated by the capability its page asserts.
      ["/reminders/review", "sms_replies:read"],
    ]);
  });

  it("owner, admin and reception get all three sections; a therapist gets Recuperação only", () => {
    for (const role of ["owner", "admin", "reception"] as const) {
      expect(commsSectionsForRole(role).map((c) => c.href)).toEqual([
        "/recuperacao",
        "/comunicacoes/lembretes-sms",
        "/reminders/review",
      ]);
    }
    expect(commsSectionsForRole("therapist").map((c) => c.href)).toEqual(["/recuperacao"]);
  });

  it("T5 F4: the Respostas SMS tab reaches EXACTLY the roles that may read the reply queue", () => {
    // Derived from the matrix, not from a role list: a role that gains or loses
    // sms_replies:read gains or loses the tab with it.
    for (const role of ROLES) {
      const tab = commsSectionsForRole(role).find((c) => c.href === "/reminders/review");
      expect(Boolean(tab), role).toBe(can(role, "sms_replies:read"));
    }
    expect(commsSectionsForRole("reception").find((c) => c.href === "/reminders/review")?.label).toBe(
      "Respostas SMS",
    );
  });

  it("the sidebar entry shows EXACTLY for the roles that may open at least one section", () => {
    for (const role of ROLES) {
      const mayOpenOne = COMMS_SECTIONS.some((c) => can(role, c.capability));
      const hrefs = navItemsForRole(role).map((i) => i.href);
      expect(hrefs.includes("/comunicacoes"), role).toBe(mayOpenOne);
      // The old standalone entry is gone for everybody: one entry per destination.
      expect(hrefs, role).not.toContain("/recuperacao");
    }
  });

  it("the entry lights for every section's own URL", () => {
    const entry = navItemsForRole("reception").find((i) => i.href === "/comunicacoes");
    expect(entry?.activePrefixes).toEqual(["/recuperacao", "/comunicacoes/lembretes-sms", "/reminders/review"]);
  });

  it("every section is a real route, and so is the group landing", () => {
    // A tab whose page does not exist is a 404 wearing a nav label.
    const app = new URL("../../app/", import.meta.url);
    for (const path of [
      "comunicacoes/page.tsx",
      "recuperacao/page.tsx",
      "comunicacoes/lembretes-sms/page.tsx",
      "reminders/review/page.tsx",
    ]) {
      expect(existsSync(new URL(path, app)), path).toBe(true);
    }
  });

  it("T5 F1 + F4: every section renders inside the app shell (side menu and top bar)", () => {
    // Recuperação had no layout.tsx and rendered bare; /reminders/review had none
    // either. A section's route, or a parent of it below app/, must carry a
    // layout that renders AppShell, as every other staff section does.
    const app = new URL("../../app/", import.meta.url);
    const shellLayout = (dir: string) => {
      const file = new URL(`${dir}/layout.tsx`, app);
      return existsSync(file) && /<AppShell[\s>]/.test(readFileSync(file, "utf8"));
    };
    for (const { href } of COMMS_SECTIONS) {
      const segments = href.replace(/^\//, "").split("/");
      const dirs = segments.map((_, i) => segments.slice(0, i + 1).join("/"));
      expect(dirs.some(shellLayout), `${href} has no AppShell layout on its path`).toBe(true);
    }
  });
});
