import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// W12-40 — the consolidated member-management modal. Two things are pinned:
//  1. The Contacto section (default) still holds phone + job title in the SAME
//     edit form as name/email, posting to the one editStaffAction (W8-02).
//  2. The section switcher reflects the member: a therapist with hours shows the
//     Serviço principal + Horários sections; a reception member shows neither.
// @osteojp/ui, the server actions, TherapistBlocks and TimeFieldInput are stubbed;
// @/lib/i18n is REAL so the actual pt-PT labels appear in the markup.

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({
  editStaffAction: vi.fn(),
  changeRoleAction: vi.fn(),
  deleteStaffAction: vi.fn(),
  setActiveAction: vi.fn(),
  setPrimaryServiceAction: vi.fn(),
}));
vi.mock("../working-hours/actions", () => ({
  saveTherapistScheduleAction: vi.fn(),
}));
vi.mock("../working-hours/TherapistBlocks", () => ({
  TherapistBlocks: () => createElement("div", { "data-stub": "blocks" }),
}));
vi.mock("@/components/time-field-input", () => ({
  TimeFieldInput: () => createElement("input", { "data-stub": "time" }),
}));
vi.mock("@osteojp/ui", () => ({
  Button: ({ children }: { children?: ReactNode }) =>
    createElement("button", null, children as ReactNode),
  // The section switcher: render each item's label so the test can assert which
  // sections a member exposes.
  SegmentedControl: ({ items }: { items: { value: string; label: string }[] }) =>
    createElement(
      "div",
      { role: "tablist" },
      items.map((i) => createElement("span", { key: i.value }, i.label)),
    ),
  // The dialog stub renders its children regardless of open state so the static
  // markup includes the (default) Contacto section.
  useAnimatedDialog: () => ({ ref: { current: null }, shown: true }),
}));

import { StaffManageModal } from "./StaffManageModal";

const baseProps = {
  userId: "ther-1",
  fullName: "Tiago Reis",
  email: "tiago@osteojp.pt",
  phone: "",
  jobTitle: "",
  roleSlug: "therapist",
  isActive: true,
  roleOptions: [{ slug: "therapist", label: "Terapeuta" }],
  canDelete: false,
  services: [{ id: "svc-1", name: "Osteopatia" }],
  currentPrimaryId: "",
  days: [],
  locations: [{ id: "loc-1", name: "Linda-a-Velha" }],
  blocks: [],
};

const therapistProps = { ...baseProps, isTherapist: true, showHours: true };

describe("StaffManageModal — W12-40 consolidated member management", () => {
  it("Contacto is the default section with phone + job title in the SAME edit form", () => {
    const html = renderToStaticMarkup(
      createElement(StaffManageModal, { ...therapistProps, phone: "", jobTitle: "" }),
    );
    expect(html).toContain('name="phone"');
    expect(html).toContain('name="jobTitle"');
    // pt-PT labels from the real i18n dictionary.
    expect(html).toContain("Telefone");
    expect(html).toContain("Cargo");
    expect(html).toMatch(/name="phone"[^>]*type="tel"|type="tel"[^>]*name="phone"/);
    // A single <form> holds fullName, email, jobTitle, and phone — one submit.
    const firstForm = html.slice(html.indexOf("<form"), html.indexOf("</form>"));
    for (const field of ['name="fullName"', 'name="email"', 'name="jobTitle"', 'name="phone"']) {
      expect(firstForm).toContain(field);
    }
  });

  it("prefills phone + job title from the current staff values", () => {
    const html = renderToStaticMarkup(
      createElement(StaffManageModal, {
        ...therapistProps,
        phone: "+351 900 000 000",
        jobTitle: "Osteopata",
      }),
    );
    expect(html).toContain("+351 900 000 000");
    expect(html).toContain("Osteopata");
  });

  it("a therapist with hours exposes the Serviço principal + Horários sections", () => {
    const html = renderToStaticMarkup(
      createElement(StaffManageModal, therapistProps),
    );
    expect(html).toContain("Contacto");
    expect(html).toContain("Função e acesso");
    expect(html).toContain("Serviço principal");
    expect(html).toContain("Horários");
  });

  it("a reception member exposes neither Serviço principal nor Horários", () => {
    const html = renderToStaticMarkup(
      createElement(StaffManageModal, {
        ...baseProps,
        roleSlug: "reception",
        roleOptions: [{ slug: "reception", label: "Receção" }],
        isTherapist: false,
        showHours: false,
      }),
    );
    expect(html).toContain("Contacto");
    expect(html).toContain("Função e acesso");
    expect(html).not.toContain("Serviço principal");
    expect(html).not.toContain("Horários");
  });
});
