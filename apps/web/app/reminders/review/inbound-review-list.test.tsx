import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InboundReviewList } from "./inbound-review-list";
import type { InboundReviewItem } from "@/lib/reminders/inbound-store";

// Rendered to static markup (node env). Verifies the review-list surface: the
// empty state, and a row with the "resposta por rever" flag + the three actions.

function item(over: Partial<InboundReviewItem> = {}): InboundReviewItem {
  return {
    id: "in-1",
    receivedAt: "2026-07-20T08:00:00Z",
    body: "Pode ser mais tarde?",
    classification: "review",
    reviewReason: "ambiguous",
    patientName: "Maria Silva",
    appointmentId: "appt-1",
    appointmentStartsAt: "2026-07-21T09:00:00Z",
    appointmentStatus: "scheduled",
    ...over,
  };
}

describe("InboundReviewList", () => {
  it("renders the empty state when there are no replies to review", () => {
    const html = renderToStaticMarkup(<InboundReviewList items={[]} />);
    expect(html).toContain("Sem respostas por rever");
    expect(html).not.toContain('data-testid="inbound-review-list"');
  });

  it("renders each flagged reply with its body, patient, flag, and the three actions", () => {
    const html = renderToStaticMarkup(<InboundReviewList items={[item()]} />);
    expect(html).toContain('data-testid="inbound-review-list"');
    expect(html).toContain("resposta por rever"); // the unmatched flag
    expect(html).toContain("Maria Silva");
    expect(html).toContain("Pode ser mais tarde?"); // the reply body
    // mark-as-confirmed / cancelled / read actions
    expect(html).toContain("Marcar como confirmada");
    expect(html).toContain("Marcar como cancelada");
    expect(html).toContain("Marcar como lida");
  });

  it("falls back to a placeholder when the sender did not match a patient", () => {
    const html = renderToStaticMarkup(
      <InboundReviewList items={[item({ patientName: null })]} />,
    );
    expect(html).toContain("Paciente não identificado");
  });
});

describe("the matched appointment is shown, because reception has to know which one", () => {
  it("renders the appointment instant when the reply matched one", () => {
    const html = renderToStaticMarkup(<InboundReviewList items={[item()]} />);
    // 21/07/2026 10:00 in Europe/Lisbon (WEST, UTC+1) for the 09:00Z fixture.
    expect(html).toContain("21/07/2026");
    expect(html).toContain("scheduled");
  });

  it("says so plainly when the reply matched NO appointment", () => {
    // The commonest review case and the one a queue must not render as a blank.
    // Reception cannot press "confirmada" on nothing, and the row has to say
    // why rather than showing an empty line where an appointment would be.
    const html = renderToStaticMarkup(
      <InboundReviewList
        items={[item({ appointmentId: null, appointmentStartsAt: null, appointmentStatus: null })]}
      />,
    );
    expect(html).toContain("Sem consulta associada");
  });

  it("says the patient is unidentified rather than rendering an empty name", () => {
    const html = renderToStaticMarkup(<InboundReviewList items={[item({ patientName: null })]} />);
    expect(html).toContain("Paciente não identificado");
  });
});
