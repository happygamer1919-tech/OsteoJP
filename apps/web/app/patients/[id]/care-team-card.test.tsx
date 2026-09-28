import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * CARE-02c on the card, and CARE-02b's read-only mode.
 *
 * The panel lists manual AND automatic entries, each with how it got there and
 * the date (Europe/Lisbon), and offers Remover on a MANUAL entry only. The
 * server refuses the same removal (care-team.test.ts); this pins the screen.
 */
vi.mock("@osteojp/ui", () => ({
  Card: ({ title, children }: { title?: ReactNode; children?: ReactNode }) =>
    createElement("section", null, title as ReactNode, children as ReactNode),
}));
// The server actions are opaque to a render: a form only needs SOMETHING to
// point at, and importing the real module would pull the auth context in.
vi.mock("./care-team-actions", () => ({
  assignTherapistAction: vi.fn(),
  removeTherapistAction: vi.fn(),
}));

const { CareTeamCard } = await import("./care-team-card");
const { getStrings } = await import("@osteojp/i18n");
const pt = getStrings("pt");

/**
 * 23:30 UTC on 20 September is 00:30 on the 21st in Lisbon (UTC+1 in summer).
 * A formatter without the Lisbon zone prints the 20th, so this is the instant
 * the date assertion uses.
 */
const LATE_EVENING_UTC = new Date("2026-09-20T23:30:00.000Z");

const manual = {
  userId: "u-manual",
  fullName: "Terapeuta Manual",
  source: "manual" as const,
  assignedAt: new Date("2026-09-10T10:00:00.000Z"),
};
const automatic = {
  userId: "u-auto",
  fullName: "Terapeuta Automatico",
  source: "automatic" as const,
  assignedAt: LATE_EVENING_UTC,
};

function render(props: Partial<Parameters<typeof CareTeamCard>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(CareTeamCard, {
      patientId: "p1",
      locale: "pt",
      members: [manual, automatic],
      candidates: [{ id: "u-free", label: "Terapeuta Livre" }],
      ...props,
    }),
  );
}

/** The markup of one <li>, found by its data-source. */
function item(html: string, source: "manual" | "automatic"): string {
  const m = html.match(new RegExp(`<li[^>]*data-source="${source}"[^>]*>([\\s\\S]*?)</li>`));
  expect(m, `no ${source} entry rendered`).not.toBeNull();
  return m![1]!;
}

describe("CareTeamCard lists both kinds, labelled and dated", () => {
  it("renders the manual AND the automatic entry", () => {
    const html = render();
    expect(html).toContain("Terapeuta Manual");
    expect(html).toContain("Terapeuta Automatico");
    expect(html.match(/data-testid="care-team-member"/g)).toHaveLength(2);
  });

  it("labels each with its source and its date, in pt-PT", () => {
    const html = render();
    expect(item(html, "manual")).toContain(
      pt["patients.careTeamSourceManual"].replace("{date}", "10/09/2026"),
    );
    expect(item(html, "automatic")).toContain(
      pt["patients.careTeamSourceAuto"].replace("{date}", "21/09/2026"),
    );
  });

  it("dates are Lisbon days: an assignment at 00:30 Lisbon is not shown on the UTC day before", () => {
    expect(item(render(), "automatic")).not.toContain("20/09/2026");
  });

  it("offers Remover on the MANUAL entry", () => {
    expect(item(render(), "manual")).toContain(pt["patients.careTeamRemove"]);
  });

  it("offers NO Remover on the AUTOMATIC entry", () => {
    const auto = item(render(), "automatic");
    expect(auto).not.toContain(pt["patients.careTeamRemove"]);
    expect(auto).not.toContain("<form");
  });

  it("explains the automatic entries in the help text", () => {
    expect(render()).toContain(pt["patients.careTeamAutoHelp"]);
  });

  it("keeps Atribuir for the therapists not yet on the team", () => {
    const html = render();
    expect(html).toContain(pt["patients.careTeamAdd"]);
    expect(html).toContain("Terapeuta Livre");
  });

  it("the copy carries no dash of any kind", () => {
    for (const k of [
      "patients.careTeamSourceManual",
      "patients.careTeamSourceAuto",
      "patients.careTeamAutoHelp",
    ] as const) {
      for (const loc of ["pt", "en"] as const) {
        expect(getStrings(loc)[k]).not.toMatch(/[‐-―−-]/);
      }
    }
  });
});

describe("CARE-02b: the read-only card", () => {
  it("lists both kinds with their labels and no control at all", () => {
    const html = render({ readOnly: true });
    expect(html).toContain("Terapeuta Manual");
    expect(html).toContain("Terapeuta Automatico");
    expect(html).not.toContain("<form");
    expect(html).not.toContain(pt["patients.careTeamRemove"]);
    expect(html).not.toContain(pt["patients.careTeamAdd"]);
  });
});
