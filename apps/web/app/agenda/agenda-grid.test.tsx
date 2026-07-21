import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgendaGrid } from "./agenda-grid";
import { therapistColor } from "@/lib/scheduling/therapist-color";
import type { AgendaAppointment } from "@/lib/scheduling/types";

// W9-05 / W10-05 / W10-05b / W11-00 - the agenda appointment card. Rendered to
// static markup (the same technique as appointment-drawer.test.tsx; the grid's
// now-line timer effect does not run under SSR, so the render is deterministic).
//
// W11-00 (owner visual gate, diagnosis-first): #618 (W10-05b) stripped the card
// FACE to the patient name only. The pre-W11-00 assertions here asserted the
// therapist name + confirmation label on the FULL render string - which now pass
// ONLY because that text lives in the W10-05 HOVER PANEL (a sibling of the face
// button), NOT because it is on the face. So a regression that put detail back on
// the face would pass. These assertions are now FACE-SCOPED: the face is the
// <button> carrying `agenda-card-patient`; the hover is the sibling
// `agenda-card-hover`. The face is asserted to be the name ONLY - present and
// wrapping - and FREE of time / service / therapist-name / icon / badge text.
//
// CONFIRM_LABEL is the sr-only text ConfirmationIndicator emits for a confirmed
// appointment. Post-#618 it lives in the hover panel, never on the face; its
// presence/absence still proves item 5 (a cancelled card suppresses the tick).
const CONFIRM_LABEL = "Confirmação recebida";

const THERAPIST_A = { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Tiago Reis" };
const THERAPIST_B = { id: "bbbbbbbb-0000-0000-0000-000000000002", name: "Filipa Rocha" };

// A Monday inside the default week view, 09:00-10:00 Lisbon (== 08:00Z summer).
const DAY = "2026-07-20";
// The start/end as they would print in a time ROW on the face (Europe/Lisbon,
// WEST = UTC+1 in July). The name-only face must carry NEITHER.
const FACE_TIME_START = "09:00";
const FACE_TIME_END = "10:00";

function appt(over: Partial<AgendaAppointment> = {}): AgendaAppointment {
  return {
    id: "appt-1",
    patientId: "pat-1",
    patientName: "Maria Silva",
    practitionerId: THERAPIST_A.id,
    practitionerName: THERAPIST_A.name,
    patientTwoId: null,
    patientTwoName: null,
    practitionerTwoId: null,
    practitionerTwoName: null,
    locationId: "loc-1",
    locationName: "Linda-a-Velha",
    serviceId: "svc-1",
    serviceName: "Osteopatia",
    room: null,
    startsAt: `${DAY}T08:00:00Z`,
    endsAt: `${DAY}T09:00:00Z`,
    status: "scheduled",
    notes: null,
    recurrenceRule: null,
    recurrenceParentId: null,
    confirmationState: "confirmed",
    confirmationReceivedAt: `${DAY}T07:00:00Z`,
    confirmationChannel: null,
    hasNote: false,
    createdBy: "u-1",
    createdByName: "Rececao Teste",
    createdAt: `${DAY}T06:00:00Z`,
    ...over,
  } as AgendaAppointment;
}

function render(appts: AgendaAppointment[]) {
  return renderToStaticMarkup(
    <AgendaGrid
      view="week"
      anchor={DAY}
      appointments={appts}
      onSelectAppointment={() => {}}
      onSelectSlot={() => {}}
    />,
  );
}

// --- Face-scoping helpers (node env, no jsdom; parse the static-markup string) --
//
// The face is the <button> containing `agenda-card-patient`. It has NO nested
// <button>, so a non-greedy match stops at its own closing tag. The grid's empty
// 30-min slot buttons are excluded by the `agenda-card-patient` filter.
const BUTTON_RE = /<button\b[^>]*>[\s\S]*?<\/button>/g;

/** Every appointment FACE (the button), excluding the hover sibling + slots. */
function faces(html: string): string[] {
  return (html.match(BUTTON_RE) ?? []).filter((b) =>
    b.includes('data-testid="agenda-card-patient"'),
  );
}

/** The single face whose visible text carries `name` (for multi-card renders). */
function faceFor(html: string, name: string): string {
  const match = faces(html).find((f) => visibleText(f).includes(name));
  if (!match) throw new Error(`no face carrying "${name}"`);
  return match;
}

/** Visible text of a fragment: tags (and their attributes, e.g. title) removed. */
function visibleText(fragment: string): string {
  return fragment.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** The data-testid values present inside a fragment. */
function testids(fragment: string): string[] {
  return [...fragment.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]).sort();
}

/** Assert a face is the patient name ONLY: name present + wrapping; no detail. */
function expectNameOnlyFace(face: string, patientName: string, therapistName: string) {
  const text = visibleText(face);
  // (a) the patient full name is on the face and WRAPS (never truncates).
  expect(text).toContain(patientName);
  expect(face).toContain("break-words");
  expect(face).not.toContain("truncate");
  // (b) ABSENCE of every detail row that W10-05 crowded onto the face.
  expect(text).not.toContain(therapistName); // therapist name -> hover only
  expect(text).not.toContain("Osteopatia"); // service text -> hover only
  expect(text).not.toContain(FACE_TIME_START); // time row -> gone
  expect(text).not.toContain(FACE_TIME_END);
  expect(text).not.toContain(CONFIRM_LABEL); // confirmation tick -> hover only
  // (c) the face carries NO icon/badge: its only testids are the name + the dot.
  expect(testids(face)).toEqual(["agenda-card-patient", "agenda-card-therapist-dot"]);
}

describe("W9-05 item 7 - per-therapist colour on the FACE, name in the hover", () => {
  it("puts the therapist colour token (spine + dot) on the face", () => {
    const face = faceFor(render([appt()]), "Maria Silva");
    expect(face).toContain(therapistColor(THERAPIST_A.id).fill);
    expect(face).toContain('data-testid="agenda-card-therapist-dot"');
  });

  it("gives two different therapists two different colour tokens, each on its own face", () => {
    const html = render([
      appt({ id: "a", practitionerId: THERAPIST_A.id, practitionerName: THERAPIST_A.name }),
      appt({
        id: "b",
        patientName: "Ana Costa",
        practitionerId: THERAPIST_B.id,
        practitionerName: THERAPIST_B.name,
        startsAt: `${DAY}T10:00:00Z`,
        endsAt: `${DAY}T11:00:00Z`,
      }),
    ]);
    expect(faceFor(html, "Maria Silva")).toContain(therapistColor(THERAPIST_A.id).fill);
    expect(faceFor(html, "Ana Costa")).toContain(therapistColor(THERAPIST_B.id).fill);
    expect(therapistColor(THERAPIST_A.id).fill).not.toBe(therapistColor(THERAPIST_B.id).fill);
  });

  it("keeps the therapist NAME off the face - it lives in the hover panel (colour-not-only cue)", () => {
    const html = render([appt()]);
    // face-scoped: the therapist name is NOT visible text on the face...
    expect(visibleText(faceFor(html, "Maria Silva"))).not.toContain(THERAPIST_A.name);
    // ...but it is present in the render (the hover panel carries it as text).
    expect(html).toContain(THERAPIST_A.name);
  });
});

describe("W9-05 item 5 - cancelled vs confirmed (owner ruling 2026-07-17)", () => {
  it("strikes the FACE name through on cancelled, never on a live card (face-scoped)", () => {
    expect(faceFor(render([appt({ status: "cancelled" })]), "Maria Silva")).toContain(
      "line-through",
    );
    expect(faceFor(render([appt({ status: "scheduled" })]), "Maria Silva")).not.toContain(
      "line-through",
    );
  });

  it("a CANCELLED card SUPPRESSES the confirmation tick everywhere (face + hover)", () => {
    // The bug: a cancelled-and-previously-confirmed card rendered a check AND a
    // strikethrough, read as "strikethrough on a confirmation". The ruling: the
    // cancelled state suppresses the tick so the two can never combine.
    const confirmed = render([appt({ status: "scheduled", confirmationState: "confirmed" })]);
    const cancelled = render([appt({ status: "cancelled", confirmationState: "confirmed" })]);
    expect(confirmed).toContain(CONFIRM_LABEL); // present (in the hover) on a live card
    expect(cancelled).not.toContain(CONFIRM_LABEL); // suppressed once cancelled
    // and the tick is never on the FACE, cancelled or not.
    expect(visibleText(faceFor(confirmed, "Maria Silva"))).not.toContain(CONFIRM_LABEL);
  });

  it("binds strikethrough to cancelled, NOT to the confirmation axis (no remap)", () => {
    // A declined-but-not-cancelled appointment must NOT be struck through.
    const face = faceFor(render([appt({ status: "scheduled", confirmationState: "declined" })]), "Maria Silva");
    expect(face).not.toContain("line-through");
  });
});

describe("W10-05 - the unified hover popup (mini-dashboard, staff-side)", () => {
  const NOTE = "Paciente com lesao no ombro direito";

  it("renders the unified hover panel on EVERY card (with a note)", () => {
    const html = render([appt({ notes: NOTE })]);
    expect(html).toContain('data-testid="agenda-card-hover"');
    expect(html).toContain('data-testid="appointment-hover-panel"');
    expect(html).toContain('role="tooltip"'); // display-only, revealed on hover/focus
    // the note preview section + text appear when a note exists
    expect(html).toContain('data-testid="hover-note"');
    expect(html).toContain(NOTE);
  });

  it("renders the unified hover panel on a card WITHOUT a note (no note preview section)", () => {
    const html = render([appt({ notes: null })]);
    // the panel still renders on every card (unlike the old note-only popover)
    expect(html).toContain('data-testid="agenda-card-hover"');
    expect(html).toContain('data-testid="appointment-hover-panel"');
    // but there is no note-preview section
    expect(html).not.toContain('data-testid="hover-note"');
  });

  it("shows no note-preview section for a whitespace-only note", () => {
    const html = render([appt({ notes: "   " })]);
    expect(html).toContain('data-testid="appointment-hover-panel"');
    expect(html).not.toContain('data-testid="hover-note"');
  });

  it("restates lifecycle + provenance as text (patient, therapist, location, created-by)", () => {
    const html = render([appt({ createdBy: null, createdByName: null })]);
    // provenance: a NULL createdBy renders the portal label
    expect(html).toContain("Reserva online (portal)");
    // the panel carries the dashboard fields as text (colour-not-only)
    expect(html).toContain('data-testid="hover-state"');
    expect(html).toContain('data-testid="hover-created"');
  });
});

describe("W11-00 (W10-05b) - the card FACE is the patient NAME ONLY, face-scoped", () => {
  it("renders ONLY the patient name on the face - wrapping, no time/service/therapist/icon", () => {
    const html = render([appt({ patientName: "Maria Madalena dos Santos Figueiredo" })]);
    expectNameOnlyFace(
      faceFor(html, "Maria Madalena dos Santos Figueiredo"),
      "Maria Madalena dos Santos Figueiredo",
      THERAPIST_A.name,
    );
  });

  it("keeps the therapist colour dot + spine and the service tint, but no detail text", () => {
    const face = faceFor(render([appt()]), "Maria Silva");
    // KEPT cues (per the ruling: stripe + dot + colour, service-tint body).
    expect(face).toContain('data-testid="agenda-card-therapist-dot"');
    expect(face).toContain(therapistColor(THERAPIST_A.id).fill);
    // the therapist-NAME row testid is gone from the face.
    expect(face).not.toContain('data-testid="agenda-card-therapist"');
    expectNameOnlyFace(face, "Maria Silva", THERAPIST_A.name);
  });

  it("keeps strikethrough-cancelled on the face name and the hover popup intact", () => {
    const html = render([appt({ status: "cancelled" })]);
    expect(faceFor(html, "Maria Silva")).toContain("line-through");
    // the hover popup (which carries all the detail that left the face) is untouched
    expect(html).toContain('data-testid="appointment-hover-panel"');
  });

  it("keeps EVERY overlapping face name-only at 3-up (names readable, no detail leaks)", () => {
    const html = render([
      appt({ id: "a", patientName: "Maria Silva", practitionerId: THERAPIST_A.id, practitionerName: THERAPIST_A.name }),
      appt({
        id: "b",
        patientName: "Ana Costa",
        practitionerId: THERAPIST_B.id,
        practitionerName: THERAPIST_B.name,
        startsAt: `${DAY}T08:00:00Z`,
        endsAt: `${DAY}T09:00:00Z`,
      }),
      appt({
        id: "c",
        patientName: "Rui Lopes",
        practitionerId: THERAPIST_A.id,
        practitionerName: THERAPIST_A.name,
        startsAt: `${DAY}T08:00:00Z`,
        endsAt: `${DAY}T09:00:00Z`,
      }),
    ]);
    // three overlapping faces, each still the name only.
    expect(faces(html)).toHaveLength(3);
    expectNameOnlyFace(faceFor(html, "Maria Silva"), "Maria Silva", THERAPIST_A.name);
    expectNameOnlyFace(faceFor(html, "Ana Costa"), "Ana Costa", THERAPIST_B.name);
    expectNameOnlyFace(faceFor(html, "Rui Lopes"), "Rui Lopes", THERAPIST_A.name);
  });
});
