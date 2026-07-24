import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgendaGrid } from "./agenda-grid";
import { therapistColor } from "@/lib/scheduling/therapist-color";
import type { AgendaAppointment } from "@/lib/scheduling/types";

// W11-00 v3 (owner ruling 2026-07-21 evening, Fisiozero list model): an
// appointment is NOT a card. It is one line - the patient full name coloured in
// the assigned therapist hue - and same-slot appointments stack VERTICALLY (one
// name per line, full column width), never side by side. Nothing else is on the
// grid face: no card container, background, stripe, dot, tint, icon, time,
// service, or therapist text. The W10-05 hover popup is UNCHANGED and carries all
// detail. Cancelled => line-through; a non-cancelled line is never struck.
//
// Rendered to static markup (node env, no jsdom); the grid's now-line timer does
// not run under SSR, so the render is deterministic. The face is the <button>
// carrying `agenda-card-patient`; the hover is the `agenda-card-hover` sibling.

const CONFIRM_LABEL = "Confirmação recebida"; // sr-only, lives in the hover only.

const THERAPIST_A = { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Tiago Reis" };
const THERAPIST_B = { id: "bbbbbbbb-0000-0000-0000-000000000002", name: "Filipa Rocha" };

// A Monday inside the default week view, 09:00-10:00 Lisbon (== 08:00Z summer).
const DAY = "2026-07-20";
const FACE_TIME_START = "09:00"; // Europe/Lisbon (WEST = UTC+1 in July)
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

// --- Face-scoping helpers (node env; parse the static-markup string) ----------
// The face is the <button> containing `agenda-card-patient`; no nested <button>,
// so a non-greedy match stops at its own closing tag. Empty 30-min slot buttons
// are excluded by the `agenda-card-patient` filter.
const BUTTON_RE = /<button\b[^>]*>[\s\S]*?<\/button>/g;

function faces(html: string): string[] {
  return (html.match(BUTTON_RE) ?? []).filter((b) =>
    b.includes('data-testid="agenda-card-patient"'),
  );
}

function faceFor(html: string, name: string): string {
  const match = faces(html).find((f) => visibleText(f).includes(name));
  if (!match) throw new Error(`no face carrying "${name}"`);
  return match;
}

/** Visible text of a fragment: tags (and their attributes) removed. */
function visibleText(fragment: string): string {
  return fragment.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** The data-testid values present inside a fragment. */
function testids(fragment: string): string[] {
  return [...fragment.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]).sort();
}

/** Assert a face is the therapist-coloured patient NAME line and nothing else. */
function expectNameLine(face: string, patientName: string, therapistId: string, therapistName: string) {
  // (2/6) the visible face text is EXACTLY the patient name, and it wraps.
  expect(visibleText(face)).toBe(patientName);
  expect(face).toContain("break-words");
  expect(face).not.toContain("truncate");
  // (3/9c) the name carries the therapist TEXT colour (same source as spine/dot).
  expect(face).toContain(therapistColor(therapistId).text);
  // (2/9a) NO card chrome: no background/tint, no stripe, no dot, no icon/badge.
  expect(face).not.toMatch(/\bbg-/); // no background block or service tint
  expect(face).not.toContain("w-1.5"); // no therapist spine
  expect(face).not.toContain("agenda-card-therapist-dot"); // no status/therapist dot
  expect(testids(face)).toEqual(["agenda-card-patient"]); // name element ONLY
  // (2) no time / service / therapist-name text on the face.
  expect(visibleText(face)).not.toContain(therapistName);
  expect(visibleText(face)).not.toContain("Osteopatia");
  expect(visibleText(face)).not.toContain(FACE_TIME_START);
  expect(visibleText(face)).not.toContain(FACE_TIME_END);
  expect(visibleText(face)).not.toContain(CONFIRM_LABEL);
}

describe("W11-00 v3 - appointment is a therapist-coloured name line (no card chrome)", () => {
  it("renders ONLY the patient name, coloured in the therapist hue, wrapping not truncating", () => {
    const html = render([appt({ patientName: "Maria Madalena dos Santos Figueiredo" })]);
    expectNameLine(
      faceFor(html, "Maria Madalena dos Santos Figueiredo"),
      "Maria Madalena dos Santos Figueiredo",
      THERAPIST_A.id,
      THERAPIST_A.name,
    );
  });

  it("uses the SAME therapist source of truth as the old spine/dot (text = fill hue)", () => {
    const c = therapistColor(THERAPIST_A.id);
    // the text utility mirrors the fill utility on the same -700 token.
    expect(c.text).toBe(c.fill.replace(/^bg-/, "text-"));
    expect(c.text).toMatch(/-700$/);
    expect(faceFor(render([appt()]), "Maria Silva")).toContain(c.text);
  });

  it("gives two therapists two different name colours, no card tint on either", () => {
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
    expect(faceFor(html, "Maria Silva")).toContain(therapistColor(THERAPIST_A.id).text);
    expect(faceFor(html, "Ana Costa")).toContain(therapistColor(THERAPIST_B.id).text);
    expect(therapistColor(THERAPIST_A.id).text).not.toBe(therapistColor(THERAPIST_B.id).text);
  });

  // W12-11 R10 (Q-W12-01 ruling): the strikethrough now belongs to Falta
  // (no_show), NOT to Cancelada. Cancelada is a distinct red glyph and is never
  // struck. This supersedes the interim W11-00 `cancelled = line-through`.
  it("strikes through a Falta (no_show) name, and NO other estado — Cancelada is never struck", () => {
    expect(faceFor(render([appt({ status: "no_show" })]), "Maria Silva")).toContain("line-through");
    for (const status of ["scheduled", "confirmed", "completed", "cancelled"] as const) {
      expect(faceFor(render([appt({ status })]), "Maria Silva")).not.toContain("line-through");
    }
    // a declined-but-still-scheduled appointment derives Cancelada -> not struck
    expect(
      faceFor(render([appt({ status: "scheduled", confirmationState: "declined" })]), "Maria Silva"),
    ).not.toContain("line-through");
  });
});

// W12-11 R10: the five-estado glyph language. A small leading EstadoMarker
// precedes the name on the face; the estado is announced via aria-label (no
// visible text), so the visible face stays exactly the name. Cancelada = a
// distinct RED glyph (never a strikethrough); Falta = red glyph + strikethrough;
// Confirmada = green tick.
describe("W12-11 R10 - estado glyph on the agenda face (colour-not-only)", () => {
  function markerFor(html: string, name: string): string {
    const face = faceFor(html, name);
    const m = face.match(/data-estado="[^"]*"[^>]*/);
    if (!m) throw new Error(`no estado marker on the face for "${name}"`);
    return m[0];
  }

  it("renders the derived estado marker with the estado colour token for each estado", () => {
    // scheduled + pending -> Agendada (yellow)
    expect(markerFor(render([appt({ status: "scheduled", confirmationState: "pending" })]), "Maria Silva"))
      .toMatch(/data-estado="agendada"[\s\S]*text-warning|text-warning[\s\S]*data-estado="agendada"/);
    // confirmed -> Confirmada (green)
    expect(markerFor(render([appt({ status: "scheduled", confirmationState: "confirmed" })]), "Maria Silva"))
      .toContain('data-estado="confirmada"');
    // cancelled -> Cancelada (RED glyph, NOT a strikethrough)
    const cancelledFace = faceFor(render([appt({ status: "cancelled" })]), "Maria Silva");
    expect(cancelledFace).toContain('data-estado="cancelada"');
    expect(cancelledFace).toContain("text-error");
    expect(cancelledFace).not.toContain("line-through");
    // no_show -> Falta (RED glyph AND strikethrough)
    const faltaFace = faceFor(render([appt({ status: "no_show" })]), "Maria Silva");
    expect(faltaFace).toContain('data-estado="falta"');
    expect(faltaFace).toContain("line-through");
  });

  it("keeps the visible face text exactly the patient name (estado is aria-only on the face)", () => {
    const face = faceFor(render([appt({ status: "confirmed" })]), "Maria Silva");
    expect(visibleText(face)).toBe("Maria Silva");
  });
});

describe("W11-00 v3 - same-slot appointments stack vertically (no side-by-side split)", () => {
  it("renders every same-slot name as its own line, ordered alphabetically", () => {
    const html = render([
      appt({ id: "c", patientName: "Rui Lopes" }),
      appt({ id: "a", patientName: "Ana Costa", practitionerId: THERAPIST_B.id, practitionerName: THERAPIST_B.name }),
      appt({ id: "b", patientName: "Maria Silva" }),
    ]);
    // three distinct name lines, each name-only and correctly coloured.
    expect(faces(html)).toHaveLength(3);
    expectNameLine(faceFor(html, "Ana Costa"), "Ana Costa", THERAPIST_B.id, THERAPIST_B.name);
    expectNameLine(faceFor(html, "Maria Silva"), "Maria Silva", THERAPIST_A.id, THERAPIST_A.name);
    expectNameLine(faceFor(html, "Rui Lopes"), "Rui Lopes", THERAPIST_A.id, THERAPIST_A.name);
    // alphabetical order within the slot: Ana < Maria < Rui in the markup.
    const html2 = html;
    expect(html2.indexOf("Ana Costa")).toBeLessThan(html2.indexOf("Maria Silva"));
    expect(html2.indexOf("Maria Silva")).toBeLessThan(html2.indexOf("Rui Lopes"));
  });

  it("has NO horizontal-split width style on any name line (widths are full column)", () => {
    const html = render([
      appt({ id: "a", patientName: "Maria Silva" }),
      appt({ id: "b", patientName: "Ana Costa" }),
    ]);
    // the old model set `width: calc(...% - 4px)` per overlap column; v3 never does.
    expect(html).not.toMatch(/width:\s*calc\([^)]*%/);
  });
});

describe("W10-05 / W12-33 - the unified hover popup (portaled, sole detail carrier)", () => {
  const NOTE = "Paciente com lesao no ombro direito";

  it("renders the hover panel on EVERY line (with a note)", () => {
    const html = render([appt({ notes: NOTE })]);
    expect(html).toContain('data-testid="agenda-card-hover"');
    expect(html).toContain('data-testid="appointment-hover-panel"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('data-testid="hover-note"');
    expect(html).toContain(NOTE);
  });

  it("renders the hover panel on a line WITHOUT a note (no note-preview section)", () => {
    const html = render([appt({ notes: null })]);
    expect(html).toContain('data-testid="agenda-card-hover"');
    expect(html).toContain('data-testid="appointment-hover-panel"');
    expect(html).not.toContain('data-testid="hover-note"');
  });

  // W12-33 defect B: the separate confirmation line is shown ONLY when it is
  // non-redundant with the estado (Agendada + pending). It is collapsed for
  // Confirmada and every terminal estado, so the popup never shows a
  // confirmation-pending line alongside "Confirmada".
  it("shows the confirmation line only for Agendada; collapses it for Confirmada / terminal estados", () => {
    const PENDING = "Confirmação pendente";
    const agendada = render([appt({ status: "scheduled", confirmationState: "pending" })]);
    const confirmada = render([appt({ status: "scheduled", confirmationState: "confirmed" })]);
    // the exact owner-reported defect: staff-confirmed (estado Confirmada) while
    // the patient axis is still pending must NOT print both at once.
    const staffConfirmed = render([appt({ status: "confirmed", confirmationState: "pending" })]);
    const cancelled = render([appt({ status: "cancelled", confirmationState: "confirmed" })]);

    // Agendada carries the pending line (non-redundant signal), in the hover only.
    expect(agendada).toContain(PENDING);
    expect(visibleText(faceFor(agendada, "Maria Silva"))).not.toContain(PENDING);
    // Confirmada never shows a separate confirmation line (received OR pending).
    expect(confirmada).not.toContain(CONFIRM_LABEL);
    expect(confirmada).not.toContain(PENDING);
    expect(staffConfirmed).toContain('data-estado="confirmada"');
    expect(staffConfirmed).not.toContain(PENDING);
    // Terminal estado suppresses it too.
    expect(cancelled).not.toContain(CONFIRM_LABEL);
    expect(cancelled).not.toContain(PENDING);
  });

  it("restates lifecycle + provenance as text (colour-not-only)", () => {
    const html = render([appt({ createdBy: null, createdByName: null })]);
    expect(html).toContain("Reserva online (portal)");
    expect(html).toContain('data-testid="hover-state"');
    expect(html).toContain('data-testid="hover-created"');
  });
});

// W12-02: CB reported a 09:00 appointment reading as if it were on the 09:30 row.
// The placement math was correct; the STRONG hour rule was drawn on the slot's
// BOTTOM edge (border-b on m%60===0), so the bold "09:00" line landed one 30-min
// slot below - on the 09:30 gridline - while the label + booking sat at the slot
// top. The fix moves the strong rule to the slot TOP edge (border-t) so the rule,
// the label, and an on-the-hour booking coincide. These assertions FAIL on the
// pre-fix code (border-b) and pass on the fix.
describe("W12-02 - strong hour rule on the on-the-hour slot TOP, coincident with the booking", () => {
  // Empty 30-min slot buttons carry aria-label "<day> HH:MM" + an inline
  // top/height; the appointment face buttons carry agenda-card-patient and no
  // time. The appt fixture starts 08:00Z == 09:00 Lisbon (WEST) -> top 96px.
  function emptySlotsAt(html: string, hhmm: string): string[] {
    return (html.match(BUTTON_RE) ?? []).filter(
      (b) =>
        !b.includes('data-testid="agenda-card-patient"') &&
        new RegExp(`aria-label="[^"]*${hhmm}"`).test(b),
    );
  }

  it("draws the strong hour rule on the 09:00 slot TOP, coincident with a 09:00 booking", () => {
    const html = render([appt()]); // Maria Silva at 09:00 Lisbon

    const nine = emptySlotsAt(html, "09:00");
    expect(nine.length).toBeGreaterThan(0); // one empty 09:00 slot per day column
    for (const b of nine) {
      // Strong hour rule on the TOP edge (the fix) ...
      expect(b).toContain("border-t border-v2-border");
      // ... never the bottom edge (the pre-fix bug that pushed it to 09:30).
      expect(b).not.toContain("border-b");
      // and the slot sits at the 09:00 row top.
      expect(b).toMatch(/top:\s*96px/);
    }

    // The 09:00 booking's name line is in a group positioned at the SAME 96px
    // top, so the bold rule, the hour label, and the booking all coincide.
    expect(html).toMatch(/<div[^>]*style="[^"]*top:96px[^"]*"[^>]*>[\s\S]*?Maria Silva/);
  });

  it("keeps the :30 gridline faint (surface-muted), never strong", () => {
    const half = emptySlotsAt(render([]), "09:30");
    expect(half.length).toBeGreaterThan(0);
    for (const b of half) {
      expect(b).toContain("border-t border-surface-muted");
      expect(b).not.toContain("border-v2-border");
    }
  });
});
