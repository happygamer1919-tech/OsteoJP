import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { can, ROLES } from "@osteojp/auth";

import { COMMS_SECTIONS, SURVEY_LIST_HREF, commsSectionsForRole, commsSectionsThatExist } from "./comms-sections";
import { navItemsForRole } from "./nav-items";

/**
 * COMMS-01 (owner dispatch 2026-09-14, BL-2): the Comunicações group.
 * One list of sections drives the sidebar entry, the /comunicacoes redirect and
 * the tab bar, so these assertions are about that list agreeing with access.
 */
// SAT-01: one section exists only while the survey switch says so. Every test
// of the group as it has always been runs with the switch unset, which is how
// production runs today; the survey's own tests are the second describe.
const savedSurveyMode = process.env.SURVEY_SEND_MODE;
function restoreSurveyMode() {
  if (savedSurveyMode === undefined) delete process.env.SURVEY_SEND_MODE;
  else process.env.SURVEY_SEND_MODE = savedSurveyMode;
}

describe("the Comunicações group", () => {
  beforeEach(() => {
    delete process.env.SURVEY_SEND_MODE;
  });
  afterEach(restoreSurveyMode);

  it("holds Recuperação, Lembretes SMS, Respostas SMS and the survey list, each gated by its own route capability", () => {
    expect(COMMS_SECTIONS.map((c) => [c.href, c.capability])).toEqual([
      ["/recuperacao", "followup:read"],
      ["/comunicacoes/lembretes-sms", "reminders:log_read"],
      // T5 F4: the reply review queue, gated by the capability its page asserts.
      ["/reminders/review", "sms_replies:read"],
      // SAT-01: last, so no earlier section moved.
      [SURVEY_LIST_HREF, "surveys:read"],
    ]);
    // The survey list is the ONLY section behind a switch.
    expect(COMMS_SECTIONS.filter((c) => c.exists).map((c) => c.href)).toEqual([SURVEY_LIST_HREF]);
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
      const mayOpenOne = commsSectionsThatExist().some((c) => can(role, c.capability));
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
      "comunicacoes/avaliacoes-de-satisfacao/page.tsx",
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

/**
 * SAT-01 (spec 7.3; owner, 2026-10-12: while the survey is switched off, staff
 * see nothing new). The survey list is a section of this group only while
 * `SURVEY_SEND_MODE` reads `canary` or `on`. The three readers (the sidebar
 * entry, the /comunicacoes redirect, the tab bar) all start from the same list,
 * so these assertions are about that list.
 */
describe("the survey list section follows the survey switch", () => {
  afterEach(restoreSurveyMode);

  const setMode = (mode: string | undefined) => {
    if (mode === undefined) delete process.env.SURVEY_SEND_MODE;
    else process.env.SURVEY_SEND_MODE = mode;
  };
  const OLD_THREE = ["/recuperacao", "/comunicacoes/lembretes-sms", "/reminders/review"];

  it.each([undefined, "", "off", "ON", "On", " on", "on ", "Canary", "true", "1"])(
    "SURVEY_SEND_MODE=%j: no role has the section, and the group is exactly what it was",
    (mode) => {
      setMode(mode);
      expect(commsSectionsThatExist().map((c) => c.href)).toEqual(OLD_THREE);
      for (const role of ROLES) {
        const hrefs = commsSectionsForRole(role).map((c) => c.href);
        expect(hrefs, role).not.toContain(SURVEY_LIST_HREF);
        expect(hrefs, role).toEqual(role === "therapist" ? ["/recuperacao"] : OLD_THREE);
        // The sidebar entry does not light for the address either.
        const entry = navItemsForRole(role).find((i) => i.href === "/comunicacoes");
        expect(entry?.activePrefixes, role).toEqual(OLD_THREE);
        // No label of the survey anywhere in the role's navigation.
        expect(JSON.stringify(navItemsForRole(role)), role).not.toContain("Avaliações de satisfação");
      }
    },
  );

  it.each(["canary", "on"])("SURVEY_SEND_MODE=%s: every staff role has the section, last, under its approved label", (mode) => {
    setMode(mode);
    for (const role of ROLES) {
      const sections = commsSectionsForRole(role);
      expect(sections.at(-1)?.href, role).toBe(SURVEY_LIST_HREF);
      // Copy text 36, character for character.
      expect(sections.at(-1)?.label, role).toBe("Avaliações de satisfação");
      expect(sections.map((c) => c.href), role).toEqual(
        role === "therapist" ? ["/recuperacao", SURVEY_LIST_HREF] : [...OLD_THREE, SURVEY_LIST_HREF],
      );
      // /comunicacoes still lands where it did: the first section did not change.
      expect(sections[0]?.href, role).toBe("/recuperacao");
      const entry = navItemsForRole(role).find((i) => i.href === "/comunicacoes");
      expect(entry?.activePrefixes, role).toEqual([...OLD_THREE, SURVEY_LIST_HREF]);
    }
  });

  it("the switch is read on every call, so a change of it is seen without a reload of the module", () => {
    setMode("on");
    expect(commsSectionsForRole("reception").map((c) => c.href)).toContain(SURVEY_LIST_HREF);
    setMode("off");
    expect(commsSectionsForRole("reception").map((c) => c.href)).not.toContain(SURVEY_LIST_HREF);
    expect(navItemsForRole("reception").find((i) => i.href === "/comunicacoes")?.activePrefixes).not.toContain(
      SURVEY_LIST_HREF,
    );
  });

  it("the section's gate is the capability its page and its query assert", () => {
    const app = new URL("../../app/", import.meta.url);
    const page = readFileSync(new URL("comunicacoes/avaliacoes-de-satisfacao/page.tsx", app), "utf8");
    expect(page).toContain('can(ctx.role, "surveys:read")');
    const query = readFileSync(new URL("../surveys/survey-list.ts", import.meta.url), "utf8");
    expect(query).toContain('assertCan(ctx.role, "surveys:read")');
  });
});
