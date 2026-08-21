import { describe, it, expect } from "vitest";
import { can } from "@osteojp/auth";
import { navItemsForRole } from "./nav-items";

const hrefs = (role: Parameters<typeof navItemsForRole>[0]) =>
  navItemsForRole(role).map((i) => i.href);

describe("navItemsForRole — role-aware nav gating", () => {
  // Ruling F (W2-06): the top-level "Registos Clínicos" (/clinical) section left
  // the primary nav; fichas now live in the patient profile tab. /clinical/review
  // (AI review queue) is a separate section and stays.
  it("owner sees Marcações, Invoicing, Review, Estatisticas, HORÁRIOS and Admin, but NOT the top-level /clinical", () => {
    // NAV-01 (Ivan, 2026-08-18) added "/horarios" here, BETWEEN Estatísticas and
    // Administração, in his own words. The owner could not reach the complex
    // scheduling page from his sidebar at all before this.
    expect(hrefs("owner")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/marcacoes",
      // RB-01 (2026-08-20): Recuperação, beside Marcações rather than in the
      // Estatísticas → Horários → Administração run, because NAV-01 ruled that
      // run and the test below asserts it BY INDEX.
      "/recuperacao",
      "/invoicing",
      "/clinical/review",
      "/estatisticas",
      "/horarios",
      "/admin",
    ]);
  });

  // PL-09 Phase 3 (was W6-05 owner-only): Estatisticas is owner + admin. The
  // admin dashboard is location-scoped in the queries; therapist/reception have
  // no statistics:read.
  it("Estatisticas shows for owner and admin only (statistics:read)", () => {
    const seesStats = (["owner", "admin", "therapist", "reception"] as const).filter((r) =>
      hrefs(r).includes("/estatisticas"),
    );
    expect(seesStats).toEqual(["owner", "admin"]);
  });

  it("admin sees Invoicing, Estatisticas, Horários and Admin but NOT Review and NOT the top-level /clinical", () => {
    expect(hrefs("admin")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/marcacoes",
      // RB-01 (2026-08-20): Recuperação, beside Marcações. Admin holds
      // `followup:read`.
      "/recuperacao",
      "/invoicing",
      "/estatisticas",
      "/horarios",
      "/admin",
    ]);
    expect(hrefs("admin")).not.toContain("/clinical");
    expect(hrefs("admin")).not.toContain("/clinical/review");
  });

  // W10-04 isolation (owner ruling 2026-07-21): the therapist role loses
  // Faturação (owner/admin/reception only); Review stays.
  it("therapist sees Review and Horários but NOT Invoicing, NOT Admin, NOT the top-level /clinical", () => {
    // RULING A added "/horarios" here. The list is asserted in FULL rather than
    // by `toContain`, so a future capability change that quietly adds a fifth
    // surface to a clinician's sidebar has to break this test first.
    //
    // NAV-01 (2026-08-18) MOVED IT, and moved nothing else. It used to sit
    // between /marcacoes and /clinical/review; the single entry now lives
    // between Estatísticas and Administração by the owner's ruling, and since a
    // therapist sees neither of those, Horários is simply LAST for them. Same
    // href, same label, same capability - only the position changed, which is
    // the unavoidable cost of one ordered list and one entry per destination.
    expect(hrefs("therapist")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/marcacoes",
      "/clinical/review",
      "/horarios",
    ]);
    expect(hrefs("therapist")).not.toContain("/invoicing");
    expect(hrefs("therapist")).not.toContain("/clinical");
    // ======================================================================
    // RB-01, 2026-08-20: THE THERAPIST SIDEBAR IS UNCHANGED BY RECUPERAÇÃO.
    // ======================================================================
    // The full list above already proves it, and this line is here anyway,
    // because the full list will be edited again by the next feature and this
    // assertion says WHY the absence matters rather than leaving it as one of
    // six entries somebody could add a seventh to without thinking.
    //
    // The list is a tenant-wide set of patients with telephone numbers and
    // email addresses. SEC-01 is what happens when that reaches a therapist.
    expect(hrefs("therapist")).not.toContain("/recuperacao");
  });

  it("reception sees Marcações, Horários and Invoicing but NEITHER Clinical NOR Review NOR Admin", () => {
    const r = hrefs("reception");
    // PL-09 Phase 5: reception gains the Horários entry. NAV-01 (2026-08-18)
    // moved that entry to the end of the ALL array, so for reception - who sees
    // neither Estatísticas nor Administração - it is now the last item rather
    // than sitting after Marcações. Membership is unchanged.
    expect(r).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/marcacoes",
      // RB-01 (2026-08-20): Recuperação. It is RECEPTION'S queue above all -
      // ringing a patient who has not rebooked is front-desk work.
      "/recuperacao",
      "/invoicing",
      "/horarios",
    ]);
    expect(r).not.toContain("/clinical");
    expect(r).not.toContain("/clinical/review");
    expect(r).not.toContain("/admin");
  });

  it("NAV-01: EVERY role that may reach /horarios has the entry - nav matches access", () => {
    // THE HISTORY OF THIS ONE ASSERTION IS THE POINT OF READING IT.
    //   `["reception"]`               - PL-09 Phase 5.
    //   `["therapist", "reception"]`  - RULING A (Ivan, 2026-08-14).
    //   all four                      - NAV-01 (Ivan, 2026-08-18).
    // Each change is an owner ruling recorded on arrival, never a test edited to
    // make a build pass.
    //
    // OWNER AND ADMIN WERE EXCLUDED BY `hideIfCapability: "settings:read"`, on
    // the reasoning that they manage schedules inside Equipa and a second entry
    // would duplicate that surface. That reasoning expired: /horarios is now the
    // COMPLEX scheduling page (SCHED-03/04/05) and Equipa's horários layer is
    // the simple one. The owner could not reach the richer page from his sidebar.
    //
    // THE PROPERTY IS NOW DERIVED RATHER THAN LISTED, which is what stops it
    // going stale again: the entry must appear for exactly the roles that hold
    // `schedule:read`, the same capability horarios/page.tsx redirects on. Grant
    // the capability to a fifth role and the nav follows without an edit here;
    // widen the nav without the capability and this fails.
    const seesHorarios = (["owner", "admin", "therapist", "reception"] as const).filter(
      (role) => hrefs(role).includes("/horarios"),
    );
    const mayReachHorarios = (["owner", "admin", "therapist", "reception"] as const).filter(
      (role) => can(role, "schedule:read"),
    );
    expect(seesHorarios).toEqual(mayReachHorarios);
    expect(seesHorarios).toEqual(["owner", "admin", "therapist", "reception"]);
  });

  it("NAV-01 sits BETWEEN Estatísticas and Administração, in the owner's words", () => {
    // Position was the ruling, not an incidental. Asserted by INDEX rather than
    // by membership, because "the entry exists" and "the entry is where he asked
    // for it" are different claims and only the second was ruled on.
    const o = hrefs("owner");
    expect(o[o.indexOf("/horarios") - 1]).toBe("/estatisticas");
    expect(o[o.indexOf("/horarios") + 1]).toBe("/admin");
  });

  it("NO role sees the top-level Registos Clínicos (/clinical) section (ruling F)", () => {
    for (const role of ["owner", "admin", "therapist", "reception"] as const) {
      expect(hrefs(role)).not.toContain("/clinical");
    }
  });

  it("Admin link is limited to owner and admin only", () => {
    const seesAdmin = (["owner", "admin", "therapist", "reception"] as const).filter(
      (role) => hrefs(role).includes("/admin"),
    );
    expect(seesAdmin).toEqual(["owner", "admin"]);
  });

  // W10-04 isolation: Faturação is owner/admin/reception only (invoices:issue);
  // the therapist role (invoices:read only) does not see it.
  it("Invoicing link appears for owner, admin, reception but NOT therapist", () => {
    const seesInvoicing = (["owner", "admin", "therapist", "reception"] as const).filter(
      (role) => hrefs(role).includes("/invoicing"),
    );
    expect(seesInvoicing).toEqual(["owner", "admin", "reception"]);
  });
});
