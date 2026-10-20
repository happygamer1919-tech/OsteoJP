import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Q-M (owner ruling, 2026-10-20): the owner or an admin (users:manage, the
// only roles that can save it) ticks SEVERAL services per therapist in Equipa.
// Pinned here:
//  1. every active service is a tickable checkbox posting `serviceIds`, and
//     each mapped service starts ticked, so several can be held at once;
//  2. the PRIMARY is ticked and DISABLED (the staff agenda preselects it, and
//     it moves only through the primary select), so it is never posted;
//  3. the pt-PT help line says the portal offers the therapist only for the
//     ticked services;
//  4. with no primary yet, no checkbox is offered at all.
// @/lib/i18n is REAL so the actual pt-PT strings appear in the markup.

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({ setTherapistServicesAction: vi.fn() }));
vi.mock("@osteojp/ui", () => ({
  Button: ({ children }: { children?: ReactNode }) =>
    createElement("button", null, children as ReactNode),
}));

import { TherapistServicesFields } from "./TherapistServicesFields";

const SERVICES = [
  { id: "svc-osteo", name: "Osteopatia" },
  { id: "svc-fisio", name: "Fisioterapia" },
  { id: "svc-acup", name: "Acupuntura" },
];

/** The `<input>` tag for one service's checkbox, by its value. */
function checkbox(html: string, id: string): string {
  const m = html.match(new RegExp(`<input[^>]*value="${id}"[^>]*>`));
  if (!m) throw new Error(`no checkbox for ${id}`);
  return m[0];
}

const render = (primaryId: string, mappedServiceIds: string[]) =>
  renderToStaticMarkup(
    createElement(TherapistServicesFields, {
      therapistId: "ther-1",
      services: SERVICES,
      primaryId,
      mappedServiceIds,
    }),
  );

describe("TherapistServicesFields (Q-M): several services per therapist", () => {
  it("offers every active service as a checkbox named serviceIds, in one form", () => {
    const html = render("svc-osteo", ["svc-osteo"]);
    for (const svc of SERVICES) {
      expect(checkbox(html, svc.id)).toContain('type="checkbox"');
      expect(checkbox(html, svc.id)).toContain('name="serviceIds"');
    }
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html).toContain('name="therapistId" value="ther-1"');
  });

  it("several mapped services start ticked at once; an unmapped one does not", () => {
    const html = render("svc-osteo", ["svc-osteo", "svc-fisio", "svc-acup"]);
    expect(checkbox(html, "svc-fisio")).toMatch(/checked/);
    expect(checkbox(html, "svc-acup")).toMatch(/checked/);

    const fewer = render("svc-osteo", ["svc-osteo", "svc-fisio"]);
    expect(checkbox(fewer, "svc-fisio")).toMatch(/checked/);
    expect(checkbox(fewer, "svc-acup")).not.toMatch(/checked/);
  });

  it("the primary is ticked and DISABLED, so this form can never move it", () => {
    const html = render("svc-osteo", ["svc-osteo", "svc-fisio"]);
    expect(checkbox(html, "svc-osteo")).toMatch(/checked/);
    expect(checkbox(html, "svc-osteo")).toMatch(/disabled/);
    expect(checkbox(html, "svc-fisio")).not.toMatch(/disabled/);
    expect(html).toContain("(principal)");
  });

  it("carries the pt-PT help line about the portal and the ticked services", () => {
    const html = render("svc-osteo", ["svc-osteo"]);
    expect(html).toContain("Serviços que realiza");
    expect(html).toContain(
      "No portal, este terapeuta só é oferecido aos pacientes para os serviços assinalados.",
    );
    expect(html).toContain("Guardar");
    // Two forms, two buttons: the help says each part saves on its own.
    expect(html).toContain(
      "Cada parte guarda-se em separado: Definir muda o serviço principal, Guardar guarda os serviços assinalados.",
    );
  });

  it("with no primary yet, offers no checkbox and asks for the primary first", () => {
    const html = render("", []);
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("Defina primeiro o serviço principal.");
  });
});
