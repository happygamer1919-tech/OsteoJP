import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// W8-02 — the staff management modal must surface the new phone + job-title
// fields in its edit form. This renders the modal and pins that both inputs
// (name="phone", name="jobTitle") appear with their pt-PT labels, are prefilled
// from the current values, and post to the SAME editStaffAction handler as the
// name/email fields. @osteojp/ui + the server actions are stubbed; @/lib/i18n is
// REAL so the actual labels ("Telefone", "Cargo") appear in the markup.

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({
  editStaffAction: vi.fn(),
  changeRoleAction: vi.fn(),
  deleteStaffAction: vi.fn(),
  setActiveAction: vi.fn(),
}));
vi.mock("@osteojp/ui", () => ({
  Button: ({ children }: { children?: ReactNode }) =>
    createElement("button", null, children as ReactNode),
  // The dialog renders its children into the DOM regardless of open state; the
  // stub just returns a stable ref + shown=true so the static markup includes
  // the whole edit form.
  useAnimatedDialog: () => ({ ref: { current: null }, shown: true }),
}));

import { StaffManageModal } from "./StaffManageModal";

const baseProps = {
  userId: "ther-1",
  fullName: "Tiago Reis",
  email: "tiago@osteojp.pt",
  roleSlug: "therapist",
  isActive: true,
  roleOptions: [{ slug: "therapist", label: "Terapeuta" }],
  canDelete: false,
};

describe("StaffManageModal — W8-02 phone + job title", () => {
  it("renders phone + job title inputs with pt-PT labels", () => {
    const html = renderToStaticMarkup(
      createElement(StaffManageModal, { ...baseProps, phone: "", jobTitle: "" }),
    );
    expect(html).toContain('name="phone"');
    expect(html).toContain('name="jobTitle"');
    // pt-PT labels from the real i18n dictionary.
    expect(html).toContain("Telefone");
    expect(html).toContain("Cargo");
    // Phone input is a tel field.
    expect(html).toMatch(/name="phone"[^>]*type="tel"|type="tel"[^>]*name="phone"/);
  });

  it("prefills both fields from the current staff values", () => {
    const html = renderToStaticMarkup(
      createElement(StaffManageModal, {
        ...baseProps,
        phone: "+351 900 000 000",
        jobTitle: "Osteopata",
      }),
    );
    expect(html).toContain("+351 900 000 000");
    expect(html).toContain("Osteopata");
  });

  it("keeps phone + job title in the SAME edit form as name/email", () => {
    const html = renderToStaticMarkup(
      createElement(StaffManageModal, { ...baseProps, phone: "", jobTitle: "" }),
    );
    // A single <form> holds fullName, email, jobTitle, and phone — one submit
    // through editStaffAction, no separate handler for the new fields.
    const firstForm = html.slice(html.indexOf("<form"), html.indexOf("</form>"));
    for (const field of ['name="fullName"', 'name="email"', 'name="jobTitle"', 'name="phone"']) {
      expect(firstForm).toContain(field);
    }
  });
});
