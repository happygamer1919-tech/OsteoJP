/* eslint-disable react/display-name -- lightweight inline @osteojp/ui stand-ins for a render test */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * ==========================================================================
 * RB-NOTES — THE RECUPERAÇÃO ROW'S NOTE PREVIEW, READ OFF THE MARKUP.
 * ==========================================================================
 * THE CASE THE CLINIC DESCRIBED, and it is the positive one: a patient rang,
 * cancelled and said he would call back himself; reception wrote that in the
 * notes; the person working this list could not see it and either chased him or
 * snoozed blind. So the excerpt has to be ON THE ROW, and it has to be readable
 * before the WhatsApp button rather than after it.
 *
 * WHAT ONLY A RENDER CAN SAY. `lib/notes/latest-notes.db.test.ts` proves who may
 * be SENT a note. It cannot say whether the row DRAWS one, whether a row with no
 * note draws an empty box, or whether the "Notas" button appears beside a
 * patient who has nothing to show - which is the specific thing the dispatch
 * ruled out: "No notes means render nothing, not an empty affordance."
 */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@osteojp/ui", () => {
  const withClass =
    (tag: string) =>
    ({ children, className }: { children?: ReactNode; className?: string }) =>
      createElement(tag, { className }, children as ReactNode);
  return {
    Button: withClass("button"),
    // The Dialog is only mounted while open; in this static render it never is.
    Dialog: ({ children }: { children?: ReactNode }) =>
      createElement("div", { "data-testid": "dialog" }, children as ReactNode),
  };
});
// The board fetches through a server action; this suite is about the ROW.
vi.mock("@/app/patients/[id]/patient-notes-board", () => ({
  PatientNotesBoard: () => createElement("div", { "data-testid": "patient-notes-board" }),
}));
vi.mock("@/lib/followup/actions", () => ({ postponeFollowup: vi.fn() }));

import { FollowupList, type FollowupRow } from "./followup-list";

function mkRow(over: Partial<FollowupRow> = {}): FollowupRow {
  return {
    patientId: "p-1",
    fullName: "Joao Paulo Baltazar Braz",
    phone: "912 000 001",
    phoneE164: "+351912000001",
    smsCapable: true,
    email: null,
    lastAttendance: "12/08/2026",
    practitionerName: "Terapeuta",
    contacts: [],
    latestNote: null,
    ...over,
  };
}

const render = (rows: FollowupRow[]) => renderToStaticMarkup(<FollowupList rows={rows} />);

const NOTE = "Ligou a cancelar. Disse que telefona ele proprio para remarcar.";

describe("RB-NOTES: the latest patient note on a Recuperação row", () => {
  it("shows the note, at first sight, with no press", () => {
    const html = render([mkRow({ latestNote: { excerpt: { text: NOTE, truncated: false }, total: 1 , kind: "appointment" as const } })]);
    expect(html).toContain("followup-note-preview");
    expect(html).toContain(NOTE);
    expect(html).toContain("Nota da marcação");
  });

  it("puts it ABOVE the contact buttons, because that is what it is for", () => {
    // THE ORDER IS THE FEATURE. Rendered under WhatsApp, the note is read after
    // the press; rendered above it, before. Asserted by position in the markup
    // rather than by a class, so a restyle cannot silently move it.
    const html = render([mkRow({ latestNote: { excerpt: { text: NOTE, truncated: false }, total: 1 , kind: "appointment" as const } })]);
    expect(html.indexOf("followup-note-preview")).toBeGreaterThan(-1);
    expect(html.indexOf("followup-note-preview")).toBeLessThan(html.indexOf("WhatsApp"));
  });

  it("NO NOTE MEANS NOTHING AT ALL - not an empty box and not a dead button", () => {
    const html = render([mkRow({ latestNote: null })]);
    expect(html).not.toContain("followup-note-preview");
    expect(html).not.toContain("followup-notes-button");
    expect(html).not.toContain("Nota do paciente");
    expect(html).not.toContain("Nota da marcação");
    // The row itself is still there and still workable.
    expect(html).toContain("Joao Paulo Baltazar Braz");
    expect(html).toContain("WhatsApp");
  });

  it("offers the full history beside it, and only when there IS one", () => {
    const withNote = render([mkRow({ latestNote: { excerpt: { text: NOTE, truncated: false }, total: 1 , kind: "appointment" as const } })]);
    expect(withNote).toContain("followup-notes-button");
    expect(withNote).toContain("Notas");
  });

  it("says the excerpt is the latest OF SEVERAL rather than the whole history", () => {
    const html = render([mkRow({ latestNote: { excerpt: { text: NOTE, truncated: false }, total: 4 , kind: "appointment" as const } })]);
    expect(html).toContain("Última nota da marcação (de 4)");
  });

  /**
   * NOTES-01, 2026-09-08. THE LABEL FOLLOWS THE KIND, AND THIS IS THE ARM THAT
   * PROVES IT.
   *
   * The row read patient-level notes only, and production holds ONE of those
   * against 43,403 appointment notes - so the line was empty on every row and
   * every test above passed anyway, because they all supplied a note the product
   * could never have found. That is why the fixtures now carry a `kind`: the
   * suite has to be able to tell the two apart, or it goes on proving the
   * wording of a line nobody sees.
   */
  it("labels an APPOINTMENT note as one, and a PATIENT note as one", () => {
    const appt = render([
      mkRow({ latestNote: { excerpt: { text: NOTE, truncated: false }, total: 1, kind: "appointment" as const } }),
    ]);
    expect(appt).toContain("Nota da marcação");
    expect(appt).not.toContain("Nota do paciente");

    const pat = render([
      mkRow({ latestNote: { excerpt: { text: NOTE, truncated: false }, total: 1, kind: "patient" as const } }),
    ]);
    expect(pat).toContain("Nota do paciente");
    expect(pat).not.toContain("Nota da marcação");
  });

  it("the ellipsis comes from `truncated`, never from the text's length", () => {
    const cut = render([mkRow({ latestNote: { excerpt: { text: "cortada", truncated: true }, total: 1 , kind: "appointment" as const } })]);
    expect(cut).toContain("cortada…");
    const whole = render([mkRow({ latestNote: { excerpt: { text: "cortada", truncated: false }, total: 1 , kind: "appointment" as const } })]);
    expect(whole).not.toContain("cortada…");
  });

  it("the note board is NOT mounted until the button is pressed", () => {
    // The board issues a read on mount. Fifty rows mounting fifty boards to draw
    // nothing is the shape this avoids, and it is asserted rather than assumed.
    const html = render([mkRow({ latestNote: { excerpt: { text: NOTE, truncated: false }, total: 1 , kind: "appointment" as const } })]);
    expect(html).not.toContain("patient-notes-board");
  });

  it("one row's note never bleeds onto another", () => {
    const html = render([
      mkRow({ patientId: "p-1", fullName: "Com nota", latestNote: { excerpt: { text: NOTE, truncated: false }, total: 1 , kind: "appointment" as const } }),
      mkRow({ patientId: "p-2", fullName: "Sem nota", latestNote: null }),
    ]);
    // Exactly one preview block and one Notas button across two rows.
    expect(html.split("followup-note-preview").length - 1).toBe(1);
    expect(html.split("followup-notes-button").length - 1).toBe(1);
  });
});
