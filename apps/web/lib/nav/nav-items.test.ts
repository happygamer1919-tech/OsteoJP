import { describe, it, expect } from "vitest";
import { navItemsForRole } from "./nav-items";

const hrefs = (role: Parameters<typeof navItemsForRole>[0]) =>
  navItemsForRole(role).map((i) => i.href);

describe("navItemsForRole — role-aware nav gating", () => {
  it("owner and admin see every section incl. Clinical and Admin", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(hrefs(role)).toEqual([
        "/dashboard",
        "/agenda",
        "/patients",
        "/clinical",
        "/admin",
      ]);
    }
  });

  it("therapist sees Clinical but NOT Admin", () => {
    expect(hrefs("therapist")).toEqual([
      "/dashboard",
      "/agenda",
      "/patients",
      "/clinical",
    ]);
  });

  it("reception sees NEITHER Clinical NOR Admin", () => {
    const r = hrefs("reception");
    expect(r).toEqual(["/dashboard", "/agenda", "/patients"]);
    expect(r).not.toContain("/clinical");
    expect(r).not.toContain("/admin");
  });

  it("Admin link is limited to owner and admin only", () => {
    const seesAdmin = (["owner", "admin", "therapist", "reception"] as const).filter(
      (role) => hrefs(role).includes("/admin"),
    );
    expect(seesAdmin).toEqual(["owner", "admin"]);
  });
});
