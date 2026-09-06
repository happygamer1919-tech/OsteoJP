/* eslint-disable react/display-name -- inline @osteojp/ui stand-in for a render test */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/ui", () => ({
  GlassCard: ({ children, className }: { children?: ReactNode; className?: string }) =>
    createElement("div", { className }, children as ReactNode),
}));
// GUEST-06 made this a client component. Two consequences for a render test:
// `useRouter` needs an app-router context that renderToStaticMarkup has no way
// to mount, and the module now imports the convert server action, which pulls in
// the database. Both are stubbed; neither is under test here - the action has
// its own suite (lib/scheduling/guest-convert.test.ts) and the press rule and
// deep link have theirs (lib/scheduling/guest-convert-handoff.test.ts).
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/lib/scheduling/guest-convert", () => ({
  convertGuestRequest: async () => ({ ok: false, error: "validation" }),
  dismissGuestRequest: async () => ({ ok: false, error: "validation" }),
  listGuestRequestMatches: async () => ({ ok: true, data: [] }),
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
  converted: false,
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
      (html.match(/guest-possible-match/g) ?? []).length +
      (html.match(/guest-converted-no-booking/g) ?? []).length;
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

/**
 * GUEST-06 — the convert control.
 *
 * WHAT THIS FILE CAN AND CANNOT ASSERT. `renderToStaticMarkup` produces the
 * FIRST paint and no more: there is no click, so the resolution panel (which
 * only exists after state changes) is unreachable here. What is asserted is
 * therefore what the screen offers before anybody touches it — and, importantly,
 * what it does NOT offer. The behaviour behind the button is covered by the two
 * suites named in the mock comment above.
 */
describe("guest queue - the convert control", () => {
  it("offers a convert control on every row", () => {
    const html = render([row({ id: "a" }), row({ id: "b", possiblePatientMatches: 2 })]);
    expect((html.match(/guest-convert-button/g) ?? []).length).toBe(2);
    expect(html).toContain("Criar paciente e marcar");
  });

  it("offers the SAME control whether or not the row is flagged", () => {
    // The difference between the two rows is what the press DOES, not what it
    // looks like. A flagged row with a differently-worded button would invite
    // reception to learn "the orange one is the careful one" and act on the
    // colour rather than on the question.
    const clean = render([row({ possiblePatientMatches: 0 })]);
    const flagged = render([row({ possiblePatientMatches: 1 })]);
    expect(clean).toContain("Criar paciente e marcar");
    expect(flagged).toContain("Criar paciente e marcar");
  });

  it("NEGATIVE ARM: the resolution panel is NOT in the first paint of a flagged row", () => {
    // It must be reached by pressing, having been asked the question. If it ever
    // rendered eagerly, the "É este paciente" buttons would be one stray click
    // away with no question posed - which is exactly the auto-merge this card
    // exists to prevent, wearing a dialog's clothes.
    const html = render([row({ possiblePatientMatches: 2 })]);
    expect(html).not.toContain("guest-resolve-panel");
    expect(html).not.toContain("guest-resolve-use-existing");
  });

  it("NEGATIVE ARM: no patient name reaches the page before reception asks for one", () => {
    // The match LIST is fetched on demand, never rendered with the queue. A
    // staff member who never opens a row never receives the names of patients
    // who happen to share a number with a stranger - the same payload
    // minimisation PG4 applies to the notification centre above it.
    const html = render([row({ possiblePatientMatches: 3 })]);
    expect(html).toContain("guest-possible-match");
    expect(html).not.toContain("guest-resolve-match");
    expect(html).not.toContain("NIF");
  });

  it("still renders no link, with the convert control present", () => {
    // The GUEST-03 invariant, re-asserted now that the row has an action on it:
    // convert is a decision reception makes, not a link the system followed.
    const html = render([row({ possiblePatientMatches: 1 })]);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("/patients/");
  });
});

/**
 * LE-guest-convert-abandoned-booking, OPTION B — the converted-but-unbooked row.
 *
 * THE ROW STAYING IS THE FEATURE. Before the owner's ruling the convert moved
 * the request to `confirmed` and the queue lost it immediately, so a receptionist
 * interrupted between creating the person and booking them left somebody with a
 * record, no appointment and nothing chasing it. The queue now keeps the row and
 * says what it is; these assert what that row offers and what it stops offering.
 */
describe("guest queue - converted but not booked", () => {
  it("says CONVERTIDO - SEM MARCAÇÃO, in those words", () => {
    const html = render([row({ converted: true })]);
    expect(html).toContain("guest-converted-no-booking");
    expect(html).toContain("Convertido - sem marcação");
  });

  it("REPLACES the who-is-this marks rather than joining them", () => {
    // Both arms, because the two are reached by different branches: a converted
    // row that matched nobody and a converted row that matched somebody must
    // both drop the earlier mark. The question "who is this" has been answered
    // on this row; what is left to show is what remains to be DONE.
    const clean = render([row({ converted: true, possiblePatientMatches: 0 })]);
    expect(clean).not.toContain("guest-new-client");
    const flagged = render([row({ converted: true, possiblePatientMatches: 2 })]);
    expect(flagged).not.toContain("guest-possible-match");
  });

  it("offers the DISMISS and NOT the convert, because a second convert can only fail", () => {
    const html = render([row({ converted: true })]);
    expect(html).toContain("guest-dismiss-button");
    expect(html).toContain("Dispensar");
    expect(html).not.toContain("guest-convert-button");
    expect(html).not.toContain("Criar paciente e marcar");
  });

  it("NEGATIVE ARM: an UNconverted row still offers convert and NOT the dismiss", () => {
    // The pair above is only meaningful against this one. Without it the suite
    // would pass just as well if the component had stopped rendering the
    // convert button altogether.
    const html = render([row({ converted: false })]);
    expect(html).toContain("guest-convert-button");
    expect(html).not.toContain("guest-dismiss-button");
  });

  it("NEGATIVE ARM: a converted row still renders no link to the patient it created", () => {
    // The GUEST-03 invariant survives the new state. The row now KNOWS a patient
    // id exists, which is exactly when a link becomes tempting.
    const html = render([row({ converted: true })]);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("/patients/");
  });
});
