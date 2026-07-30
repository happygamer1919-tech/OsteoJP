import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PatientNoteRevision } from "@/lib/patients/note-revisions";

/**
 * PL-17 — a note in the patient's Notas tab must say WHICH marcação it
 * documents (owner CR 2026-07-30: "you can see the notes but it is not written
 * to which appointment related") and offer a way into it. A patient-level note
 * and every legacy revision have no visit, and must show neither.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/patients/actions", () => ({ editAppointmentNoteAction: vi.fn() }));
vi.mock("@osteojp/ui", () => ({
  Button: ({ children }: { children?: ReactNode }) =>
    createElement("button", null, children as ReactNode),
}));

import { NotesList } from "./notes-list";

const base: PatientNoteRevision = {
  id: "note-1",
  content: "Paciente trouxe exames.",
  authorName: "Lurdes",
  createdAt: "2026-07-28T09:00:00.000Z",
  editedAt: null,
  editedByName: null,
  editable: true,
  appointment: null,
};

const linked: PatientNoteRevision = {
  ...base,
  id: "note-2",
  appointment: {
    id: "appt-9",
    startsAt: "2026-07-30T08:00:00.000Z",
    practitionerName: "Durbis Brito",
  },
};

describe("NotesList — note to marcação link (PL-17)", () => {
  it("names the marcação a note belongs to, with its therapist", () => {
    const html = renderToStaticMarkup(
      createElement(NotesList, { notes: [linked], onOpenAppointment: vi.fn() }),
    );
    expect(html).toContain('data-testid="note-appointment-line"');
    expect(html).toContain("Marcação de");
    expect(html).toContain("Durbis Brito");
  });

  it("offers the open-marcação button when the caller can host the panel", () => {
    const html = renderToStaticMarkup(
      createElement(NotesList, { notes: [linked], onOpenAppointment: vi.fn() }),
    );
    expect(html).toContain('data-testid="note-open-appointment"');
    expect(html).toContain("Abrir marcação");
  });

  it("names the marcação but offers no button when there is nowhere to open it", () => {
    const html = renderToStaticMarkup(createElement(NotesList, { notes: [linked] }));
    expect(html).toContain('data-testid="note-appointment-line"');
    expect(html).not.toContain('data-testid="note-open-appointment"');
  });

  it("shows no marcação line at all for a patient-level note", () => {
    const html = renderToStaticMarkup(
      createElement(NotesList, { notes: [base], onOpenAppointment: vi.fn() }),
    );
    expect(html).not.toContain('data-testid="note-appointment-line"');
    expect(html).toContain("Paciente trouxe exames.");
  });
});
