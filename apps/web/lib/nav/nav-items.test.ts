import { describe, it, expect } from "vitest";
import { navItemsForRole } from "./nav-items";

const hrefs = (role: Parameters<typeof navItemsForRole>[0]) =>
  navItemsForRole(role).map((i) => i.href);

describe("navItemsForRole — role-aware nav gating", () => {
  it("owner sees every section incl. Clinical, Marcações, Invoicing, Review and Admin", () => {
    expect(hrefs("owner")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/clinical",
      "/marcacoes",
      "/invoicing",
      "/clinical/review",
      "/admin",
    ]);
  });

  it("admin sees Clinical, Invoicing and Admin but NOT Review (oversight, not clinician)", () => {
    expect(hrefs("admin")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/clinical",
      "/marcacoes",
      "/invoicing",
      "/admin",
    ]);
    expect(hrefs("admin")).not.toContain("/clinical/review");
  });

  it("therapist sees Clinical, Invoicing and Review but NOT Admin", () => {
    expect(hrefs("therapist")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/clinical",
      "/marcacoes",
      "/invoicing",
      "/clinical/review",
    ]);
  });

  it("reception sees Marcações and Invoicing but NEITHER Clinical NOR Review NOR Admin", () => {
    const r = hrefs("reception");
    expect(r).toEqual(["/dashboard", "/agenda", "/patients", "/marcacoes", "/invoicing"]);
    expect(r).not.toContain("/clinical");
    expect(r).not.toContain("/clinical/review");
    expect(r).not.toContain("/admin");
  });

  it("Admin link is limited to owner and admin only", () => {
    const seesAdmin = (["owner", "admin", "therapist", "reception"] as const).filter(
      (role) => hrefs(role).includes("/admin"),
    );
    expect(seesAdmin).toEqual(["owner", "admin"]);
  });

  it("Invoicing link appears for all roles (invoices:read is universal)", () => {
    const seesInvoicing = (["owner", "admin", "therapist", "reception"] as const).filter(
      (role) => hrefs(role).includes("/invoicing"),
    );
    expect(seesInvoicing).toEqual(["owner", "admin", "therapist", "reception"]);
  });
});
