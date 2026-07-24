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
    patientName: "Maria Silva",
    appointmentId: "appt-1",
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
