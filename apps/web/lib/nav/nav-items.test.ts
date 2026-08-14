import { describe, it, expect } from "vitest";
import { navItemsForRole } from "./nav-items";

const hrefs = (role: Parameters<typeof navItemsForRole>[0]) =>
  navItemsForRole(role).map((i) => i.href);

describe("navItemsForRole — role-aware nav gating", () => {
  // Ruling F (W2-06): the top-level "Registos Clínicos" (/clinical) section left
  // the primary nav; fichas now live in the patient profile tab. /clinical/review
  // (AI review queue) is a separate section and stays.
  it("owner sees Marcações, Invoicing, Review, Estatisticas and Admin, but NOT the top-level /clinical", () => {
    expect(hrefs("owner")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/marcacoes",
      "/invoicing",
      "/clinical/review",
      "/estatisticas",
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

  it("admin sees Invoicing, Estatisticas and Admin but NOT Review and NOT the top-level /clinical", () => {
    expect(hrefs("admin")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/marcacoes",
      "/invoicing",
      "/estatisticas",
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
    expect(hrefs("therapist")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/marcacoes",
      "/horarios",
      "/clinical/review",
    ]);
    expect(hrefs("therapist")).not.toContain("/invoicing");
    expect(hrefs("therapist")).not.toContain("/clinical");
  });

  it("reception sees Marcações, Horários and Invoicing but NEITHER Clinical NOR Review NOR Admin", () => {
    const r = hrefs("reception");
    // PL-09 Phase 5: reception gains the Horários entry (schedule:read without
    // settings:read); order follows the ALL array (after Marcações).
    expect(r).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/marcacoes",
      "/horarios",
      "/invoicing",
    ]);
    expect(r).not.toContain("/clinical");
    expect(r).not.toContain("/clinical/review");
    expect(r).not.toContain("/admin");
  });

  it("RULING A: reception AND therapist see Horários; owner/admin manage schedules in Equipa", () => {
    // This assertion read `["reception"]` until RULING A (Ivan, 2026-08-14),
    // which admitted therapists so they can view and manage their OWN schedule.
    // Changed on the ruling, not to make a build pass.
    //
    // OWNER AND ADMIN ARE STILL EXCLUDED, and that is not an oversight: they
    // hold settings:read and manage schedules inside Equipa, so a second entry
    // would be a duplicate surface for the same job.
    const seesHorarios = (["owner", "admin", "therapist", "reception"] as const).filter(
      (role) => hrefs(role).includes("/horarios"),
    );
    expect(seesHorarios).toEqual(["therapist", "reception"]);
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
