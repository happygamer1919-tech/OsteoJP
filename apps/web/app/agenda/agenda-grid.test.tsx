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

describe("W9-06 item 9 - the note hover card (staff-side)", () => {
  const NOTE = "Paciente com lesao no ombro direito";

  it("renders the note content in a hover card when the marcacao has a note", () => {
    const html = render([appt({ notes: NOTE })]);
    expect(html).toContain(NOTE);
    expect(html).toContain('data-testid="agenda-card-note"');
    // The popover is display-only (role=tooltip), revealed on group hover/focus.
    expect(html).toContain('role="tooltip"');
  });

  it("renders NO note affordance when there is no note", () => {
    const html = render([appt({ notes: null })]);
    expect(html).not.toContain('data-testid="agenda-card-note"');
  });

  it("trims whitespace-only notes to nothing (no empty hover card)", () => {
    const html = render([appt({ notes: "   " })]);
    expect(html).not.toContain('data-testid="agenda-card-note"');
  });
});
