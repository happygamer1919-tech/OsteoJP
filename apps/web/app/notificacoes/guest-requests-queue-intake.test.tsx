import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/ui", () => ({
  GlassCard: ({ children, className }: { children?: ReactNode; className?: string }) =>
    createElement("div", { className }, children as ReactNode),
}));
// Same stubs as guest-requests-queue.test.tsx, for the same reasons: no app
// router under renderToStaticMarkup, and the convert action pulls in the
// database. Neither is under test here.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/lib/scheduling/guest-convert", () => ({
  convertGuestRequest: async () => ({ ok: false, error: "validation" }),
  dismissGuestRequest: async () => ({ ok: false, error: "validation" }),
  listGuestRequestMatches: async () => ({ ok: true, data: [] }),
}));

import { toGuestIntakeDisplay } from "@/lib/guest-intake/view";
import { GuestRequestsQueue, type GuestRequestRow } from "./guest-requests-queue";

/**
 * INTAKE-01 - the intake BESIDE THE REQUEST, and its three states. The one that
 * matters most is `undefined`: before 0087 is applied the queue must render
 * exactly as it does today, with no trace of the feature.
 */
const row = (over: Partial<GuestRequestRow> = {}): GuestRequestRow => ({
  id: "g-1",
  fullName: "Maria Convidada",
  phone: "+351912345678",
  locationName: "Linda-a-Velha",
  when: "07/09/2026, manhã",
  requestedAt: "14/08/2026 18:20",
  possiblePatientMatches: 0,
  converted: false,
  ...over,
});

const display = toGuestIntakeDisplay({
  guestBookingRequestId: "g-1",
  dateOfBirth: "1990-05-17",
  reason: "Dor no ombro",
  healthConditions: null,
  medication: "Nenhuma",
  fallsAccidents: null,
  surgeries: null,
  pacemaker: "nao",
  pregnancy: "nao_perguntado",
  consentVersion: "rgpd-intake-2026-09-11",
  consentAt: "2026-09-11T10:00:00.000Z",
  createdAt: "2026-09-11T10:00:00.000Z",
});

const render = (rows: GuestRequestRow[]) =>
  renderToStaticMarkup(<GuestRequestsQueue rows={rows} />);

describe("guest queue - the clinical questionnaire beside the request", () => {
  it("FEATURE OFF (intake undefined): the row carries no trace of the intake", () => {
    const html = render([row()]);
    expect(html).not.toContain("guest-intake");
    expect(html).not.toContain("questionário");
  });

  it("negative control: the same matchers DO see the block when it is there", () => {
    const html = render([row({ intake: display })]);
    expect(html).toContain("guest-intake");
    expect(html).toContain("questionário");
  });

  it("FEATURE ON, no intake on this request (null): said in words", () => {
    const html = render([row({ intake: null })]);
    expect(html).toContain('data-testid="guest-intake-missing"');
    expect(html).toContain("Este pedido não tem questionário clínico.");
    expect(html).not.toContain('data-testid="guest-intake-answers"');
  });

  it("an intake renders collapsed, inside <details>, with the answers in words", () => {
    const html = render([row({ intake: display })]);
    expect(html).toMatch(/<details[^>]*data-testid="guest-intake"(?![^>]*\sopen)/);
    expect(html).toContain("Ver questionário clínico");
    expect(html).toContain("Dor no ombro");
    expect(html).toContain("Nunca perguntado");
  });

  it("each row shows ITS OWN intake, and a row without one does not borrow a neighbour's", () => {
    const html = render([
      row({ id: "g-1", intake: display }),
      row({ id: "g-2", fullName: "Outra Pessoa", intake: null }),
    ]);
    expect(html.match(/data-testid="guest-intake-answers"/g)).toHaveLength(1);
    expect(html.match(/data-testid="guest-intake-missing"/g)).toHaveLength(1);
  });

  it("a converted row still shows its intake (reception may need it while booking)", () => {
    const html = render([row({ converted: true, intake: display })]);
    expect(html).toContain('data-testid="guest-converted-no-booking"');
    expect(html).toContain('data-testid="guest-intake-answers"');
  });
});
