import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgendaGrid } from "./agenda-grid";
import { therapistColor } from "@/lib/scheduling/therapist-color";
import type { AgendaAppointment } from "@/lib/scheduling/types";

// W9-05 - CB QA items 5, 7, 8 on the agenda appointment card. Rendered to static
// markup (the same technique as appointment-drawer.test.tsx; the grid's now-line
// timer effect does not run under SSR, so the render is deterministic).
//
// CONFIRM_LABEL is the sr-only text ConfirmationIndicator emits for a confirmed
// appointment - its presence/absence is how we prove item 5 (a cancelled card
// suppresses the confirmation tick).
const CONFIRM_LABEL = "Confirmação recebida";

const THERAPIST_A = { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Tiago Reis" };
const THERAPIST_B = { id: "bbbbbbbb-0000-0000-0000-000000000002", name: "Filipa Rocha" };

// A Monday inside the default week view, 09:00-10:00 Lisbon (== 08:00Z summer).
const DAY = "2026-07-20";

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

describe("W9-05 item 7 - therapist identity on the card", () => {
  it("renders the therapist name on the card", () => {
    expect(render([appt()])).toContain(THERAPIST_A.name);
  });

  it("renders a deterministic per-therapist colour spine (the token for that id)", () => {
    const html = render([appt()]);
    expect(html).toContain(therapistColor(THERAPIST_A.id).fill);
  });

  it("gives two different therapists their two different colour tokens", () => {
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
    expect(html).toContain(therapistColor(THERAPIST_A.id).fill);
    expect(html).toContain(therapistColor(THERAPIST_B.id).fill);
    expect(therapistColor(THERAPIST_A.id).fill).not.toBe(therapistColor(THERAPIST_B.id).fill);
    // Colour is never the only cue: both NAMES are present as text.
    expect(html).toContain(THERAPIST_A.name);
    expect(html).toContain(THERAPIST_B.name);
  });
});

describe("W9-05 item 5 - cancelled vs confirmed (owner ruling 2026-07-17)", () => {
  it("a CONFIRMED, non-cancelled card shows the confirmation tick and is NOT struck through", () => {
    const html = render([appt({ status: "scheduled", confirmationState: "confirmed" })]);
    expect(html).toContain(CONFIRM_LABEL);
    expect(html).not.toContain("line-through");
  });

  it("a CANCELLED card is struck through and SUPPRESSES the confirmation tick", () => {
    // The bug: a cancelled-and-previously-confirmed card rendered a check AND a
    // strikethrough, read as "strikethrough on a confirmation". The ruling: the
    // cancelled state suppresses the tick so the two can never combine.
    const html = render([appt({ status: "cancelled", confirmationState: "confirmed" })]);
    expect(html).toContain("line-through");
    expect(html).not.toContain(CONFIRM_LABEL);
  });

  it("strikethrough is bound to cancelled, NOT to the confirmation axis (no remap)", () => {
    // A declined-but-not-cancelled appointment must NOT be struck through.
    const html = render([appt({ status: "scheduled", confirmationState: "declined" })]);
    expect(html).not.toContain("line-through");
  });
});

describe("W9-05 item 8 - same-hour overlap keeps the patient name legible", () => {
  it("renders every overlapping patient's name in a same-hour cluster", () => {
    const html = render([
      appt({ id: "a", patientName: "Maria Silva", practitionerId: THERAPIST_A.id }),
      appt({
        id: "b",
        patientName: "Ana Costa",
        practitionerId: THERAPIST_B.id,
        practitionerName: THERAPIST_B.name,
        room: "2",
      }),
      appt({
        id: "c",
        patientName: "Rui Lopes",
        practitionerId: THERAPIST_A.id,
        room: "3",
      }),
    ]);
    // All three names survive the compact side-by-side layout.
    expect(html).toContain("Maria Silva");
    expect(html).toContain("Ana Costa");
    expect(html).toContain("Rui Lopes");
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

describe("W10-05b - the card face is the patient NAME ONLY (readable at overlap)", () => {
  it("keeps the patient name element and lets it WRAP (no truncate) instead of clipping", () => {
    const html = render([appt({ patientName: "Maria Madalena dos Santos Figueiredo" })]);
    expect(html).toContain('data-testid="agenda-card-patient"');
    // the name text span wraps (break-words), it is NOT a single truncated line
    expect(html).toContain("min-w-0 break-words");
    expect(html).toContain("Maria Madalena dos Santos Figueiredo");
  });

  it("drops the therapist NAME row from the face but KEEPS the therapist colour dot + spine", () => {
    const html = render([appt()]);
    // the therapist-name row testid is gone from the face...
    expect(html).not.toContain('data-testid="agenda-card-therapist"');
    // ...but the colour dot (kept per the ruling: stripe + dot + colour) stays,
    // and the spine token is present.
    expect(html).toContain('data-testid="agenda-card-therapist-dot"');
    expect(html).toContain(therapistColor(THERAPIST_A.id).fill);
  });

  it("keeps strikethrough-cancelled on the name and the W10-05 hover popup intact", () => {
    const cancelledHtml = render([appt({ status: "cancelled" })]);
    expect(cancelledHtml).toContain("line-through");
    // the hover popup (which now carries all the detail that left the face) is untouched
    expect(cancelledHtml).toContain('data-testid="appointment-hover-panel"');
  });

  it("renders every overlapping patient's name at 3-up (names survive, not clipped to a few chars)", () => {
    const html = render([
      appt({ id: "a", patientName: "Maria Silva" }),
      appt({ id: "b", patientName: "Ana Costa", startsAt: `${DAY}T08:00:00Z`, endsAt: `${DAY}T09:00:00Z` }),
      appt({ id: "c", patientName: "Rui Lopes", startsAt: `${DAY}T08:00:00Z`, endsAt: `${DAY}T09:00:00Z` }),
    ]);
    for (const name of ["Maria Silva", "Ana Costa", "Rui Lopes"]) expect(html).toContain(name);
  });
});
