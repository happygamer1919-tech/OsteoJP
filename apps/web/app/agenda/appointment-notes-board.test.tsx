import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * PL-16 — the appointment notes BOARD. Owner CR 2026-07-30: the booking panel
 * showed one textarea holding the latest note, which reads as a single
 * overwritable note; reception and therapists exchange notes there, so it must
 * be a thread with an explicit "Adicionar nota" and per-note authorship.
 *
 * The thread itself is fetched in an effect, which does not run under
 * renderToStaticMarkup - so this pins the SHELL: the add affordance is present
 * and no composer is open until it is pressed. The list rendering (author line,
 * edit pen, edited stamp) is the shipped PL-13 NotesList, covered by its own
 * tests and by the e2e edit flow.
 */
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/patients/actions", () => ({
  getAppointmentNotesAction: vi.fn(async () => ({ ok: true, notes: [] })),
  appendAppointmentNoteAction: vi.fn(async () => ({ ok: true })),
  editAppointmentNoteAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@osteojp/ui", () => ({
  Button: ({ children }: { children?: ReactNode }) =>
    createElement("button", null, children as ReactNode),
}));

import { AppointmentNotesBoard } from "./appointment-notes-board";

describe("AppointmentNotesBoard (PL-16)", () => {
  const html = renderToStaticMarkup(
    createElement(AppointmentNotesBoard, { appointmentId: "appt-1" }),
  );

  it("offers an explicit 'Adicionar nota' button above the thread", () => {
    expect(html).toContain('data-testid="appointment-note-add"');
    expect(html).toContain("Adicionar nota");
  });

  it("does not open a composer until the button is pressed", () => {
    expect(html).not.toContain('data-testid="appointment-note-composer"');
  });

  it("renders the thread under the Notas heading", () => {
    expect(html).toContain('data-testid="appointment-notes-board"');
    expect(html).toContain("Notas");
  });
});
