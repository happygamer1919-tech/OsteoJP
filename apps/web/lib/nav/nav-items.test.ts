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

  // W6-05: Estatisticas is owner-only (statistics:read).
  it("Estatisticas is limited to the owner", () => {
    const seesStats = (["owner", "admin", "therapist", "reception"] as const).filter((r) =>
      hrefs(r).includes("/estatisticas"),
    );
    expect(seesStats).toEqual(["owner"]);
  });

  it("admin sees Invoicing and Admin but NOT Review and NOT the top-level /clinical", () => {
    expect(hrefs("admin")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/marcacoes",
      "/invoicing",
      "/admin",
    ]);
    expect(hrefs("admin")).not.toContain("/clinical");
    expect(hrefs("admin")).not.toContain("/clinical/review");
  });

  // W10-04 isolation (owner ruling 2026-07-21): the therapist role loses
  // Faturação (owner/admin/reception only); Review stays.
  it("therapist sees Review but NOT Invoicing, NOT Admin, NOT the top-level /clinical", () => {
    expect(hrefs("therapist")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/marcacoes",
      "/clinical/review",
    ]);
    expect(hrefs("therapist")).not.toContain("/invoicing");
    expect(hrefs("therapist")).not.toContain("/clinical");
  });

  it("reception sees Marcações and Invoicing but NEITHER Clinical NOR Review NOR Admin", () => {
    const r = hrefs("reception");
    expect(r).toEqual(["/dashboard", "/agenda", "/patients", "/marcacoes", "/invoicing"]);
    expect(r).not.toContain("/clinical");
    expect(r).not.toContain("/clinical/review");
    expect(r).not.toContain("/admin");
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
