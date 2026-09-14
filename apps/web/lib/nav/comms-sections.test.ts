import { existsSync } from "node:fs";
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
  it("holds Recuperação then Lembretes SMS, each gated by its own route capability", () => {
    expect(COMMS_SECTIONS.map((c) => [c.href, c.capability])).toEqual([
      ["/recuperacao", "followup:read"],
      ["/comunicacoes/lembretes-sms", "reminders:log_read"],
    ]);
  });

  it("owner, admin and reception get both sections; a therapist gets Recuperação only", () => {
    for (const role of ["owner", "admin", "reception"] as const) {
      expect(commsSectionsForRole(role).map((c) => c.href)).toEqual([
        "/recuperacao",
        "/comunicacoes/lembretes-sms",
      ]);
    }
    expect(commsSectionsForRole("therapist").map((c) => c.href)).toEqual(["/recuperacao"]);
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
    expect(entry?.activePrefixes).toEqual(["/recuperacao", "/comunicacoes/lembretes-sms"]);
  });

  it("every section is a real route, and so is the group landing", () => {
    // A tab whose page does not exist is a 404 wearing a nav label.
    const app = new URL("../../app/", import.meta.url);
    for (const path of ["comunicacoes/page.tsx", "recuperacao/page.tsx", "comunicacoes/lembretes-sms/page.tsx"]) {
      expect(existsSync(new URL(path, app)), path).toBe(true);
    }
  });
});
