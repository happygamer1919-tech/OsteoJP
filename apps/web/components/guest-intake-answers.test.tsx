import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { toGuestIntakeDisplay, type GuestIntakeRecord } from "@/lib/guest-intake/view";
import { GuestIntakeAnswers } from "./guest-intake-answers";

const record: GuestIntakeRecord = {
  guestBookingRequestId: "22222222-2222-4222-8222-222222222222",
  dateOfBirth: "1975-06-01",
  reason: "Cervicalgia\ndepois de uma queda",
  healthConditions: "<b>hipertensão</b>",
  medication: null,
  fallsAccidents: null,
  surgeries: null,
  pacemaker: "nao_perguntado",
  pregnancy: "nao",
  consentVersion: "rgpd-intake-2026-09-11",
  consentAt: "2026-09-11T09:00:00.000Z",
  createdAt: "2026-09-11T09:00:00.000Z",
};

const render = () =>
  renderToStaticMarkup(<GuestIntakeAnswers display={toGuestIntakeDisplay(record)} />);

describe("GuestIntakeAnswers - the read-only block", () => {
  it("renders every question with words, never-asked included", () => {
    const html = render();
    for (const field of [
      "dateOfBirth",
      "reason",
      "healthConditions",
      "medication",
      "fallsAccidents",
      "surgeries",
      "pacemaker",
      "pregnancy",
    ]) {
      expect(html).toContain(`data-field="${field}"`);
    }
    expect(html).toContain("Nunca perguntado");
    expect(html).toContain("Sem resposta");
    // No empty <dd>: a blank beside a safety question reads as "no".
    expect(html).not.toMatch(/<dd[^>]*><\/dd>/);
  });

  it("negative control: the empty-<dd> matcher does see an empty cell", () => {
    expect('<dl><dd class="x"></dd></dl>').toMatch(/<dd[^>]*><\/dd>/);
  });

  it("keeps the person's text verbatim and ESCAPED - an answer never becomes markup", () => {
    const html = render();
    expect(html).toContain("Cervicalgia\ndepois de uma queda");
    expect(html).toContain("&lt;b&gt;hipertensão&lt;/b&gt;");
    expect(html).not.toContain("<b>hipertensão</b>");
  });

  it("is attributed, dated and carries the not-a-clinician caveat", () => {
    const html = render();
    expect(html).toContain("Respostas dadas pela própria pessoa");
    expect(html).toContain("Recebido em");
    expect(html).toContain("11/09/2026, 10:00");
    expect(html).toContain("rgpd-intake-2026-09-11");
    expect(html).toContain("não alteram as contraindicações");
  });
});
