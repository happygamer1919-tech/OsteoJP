/* eslint-disable react/display-name -- inline @osteojp/ui stand-in for a render test */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/ui", () => ({
  GlassCard: ({ children, className }: { children?: ReactNode; className?: string }) =>
    createElement("div", { className }, children as ReactNode),
}));

import { GuestRequestsQueue, type GuestRequestRow } from "./guest-requests-queue";

/**
 * ITEM 6 — the new-client mark on reception's guest queue.
 *
 * THE MARK IS THE FEATURE, so it is what is asserted. The ruling requires guest
 * requests to be "visibly marked as a new client", and the possible-existing-
 * patient flag to be shown as a POSSIBILITY that reception acts on — never as a
 * link the system made on its own.
 *
 * EXACTLY ONE OF THE TWO MARKS PER ROW. Rendering both would leave the reader to
 * work out which applies, and rendering neither is the silent case: an unmarked
 * row reads as an ordinary appointment, which is precisely what a guest request
 * is not.
 */
const row = (over: Partial<GuestRequestRow> = {}): GuestRequestRow => ({
  id: "g-1",
  fullName: "Maria Convidada",
  phone: "+351912345678",
  locationName: "Linda-a-Velha",
  // A PREFERENCE, not a slot (GUEST-04 Option A). The string is built by
  // lib/scheduling/guest-preferred-when.ts, which has its own suite; this
  // fixture only has to look like what that function returns.
  when: "07/09/2026, manhã",
  requestedAt: "14/08/2026 18:20",
  possiblePatientMatches: 0,
  ...over,
});

const render = (rows: GuestRequestRow[]) =>
  renderToStaticMarkup(<GuestRequestsQueue rows={rows} />);

describe("guest queue - the new-client mark", () => {
  it("a guest matching NOBODY is marked as a new client", () => {
    const html = render([row()]);
    expect(html).toContain("guest-new-client");
    expect(html).not.toContain("guest-possible-match");
  });

  it("a guest whose phone matches ONE patient is marked as a POSSIBLE match", () => {
    const html = render([row({ possiblePatientMatches: 1 })]);
    expect(html).toContain("guest-possible-match");
    // And NOT as a new client: the two are alternatives, not layers.
    expect(html).not.toContain("guest-new-client");
  });

  it("SEVERAL matches say so, because picking one is not obvious", () => {
    // 0062's precedent: resolvePatientByProvenPhone REFUSES when several
    // patients share a number rather than choosing. The screen carries the same
    // caution instead of showing the singular wording and implying one answer.
    const html = render([row({ possiblePatientMatches: 3 })]);
    expect(html).toContain("guest-possible-match");
    expect(html).toContain("vários registos");
  });

  it("NEGATIVE ARM: every row carries exactly ONE mark, never zero and never two", () => {
    const html = render([
      row({ id: "a", possiblePatientMatches: 0 }),
      row({ id: "b", possiblePatientMatches: 1 }),
      row({ id: "c", possiblePatientMatches: 5 }),
    ]);
    const marks =
      (html.match(/guest-new-client/g) ?? []).length +
      (html.match(/guest-possible-match/g) ?? []).length;
    const rows = (html.match(/guest-request-row/g) ?? []).length;
    expect(rows).toBe(3);
    expect(marks).toBe(3);
  });

  it("NEGATIVE ARM: the queue NEVER renders a link to a matched patient", () => {
    // Flag, never link. If somebody later turns the possible-match chip into an
    // anchor to a patient record, this is the test that stops it: the screen
    // reports what it noticed, and a human decides who this person is.
    const html = render([row({ possiblePatientMatches: 1 })]);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("/patients/");
  });

  it("PG4: the row carries NO service name", () => {
    // Not an omission. lib/notifications/centre.test.ts forbids a service name
    // anywhere on this page, enforced over the whole file, and PG4 is a launch
    // gate with counsel-maintained payload minimisation behind it. The guard was
    // left untouched and the question raised instead - see
    // LE-guest-queue-service-name. Asserted here so re-adding the field has to
    // break a test that explains why, rather than only the file-wide grep.
    const html = render([row()]);
    expect(html).not.toContain("Osteopatia");
    expect(html).not.toContain("Servi\u00e7o");
  });

  it("the WHEN is labelled a preference, not a date", () => {
    // GUEST-04 Option A. The label carries the meaning: this row is what
    // somebody ASKED FOR, and the whole risk of the shape is reception reading
    // it as an appointment that exists. "Data:" beside a date does exactly that.
    const html = render([row()]);
    expect(html).toContain("Preferência");
  });

  it("an empty queue says so, and does not render an empty list", () => {
    // Loaded-and-empty gets its own words, the INC-05 rule: a blank region
    // reads as a broken fetch.
    const html = render([]);
    expect(html).toContain("Sem pedidos de novos clientes");
    expect(html).not.toContain("guest-request-row");
  });
});
