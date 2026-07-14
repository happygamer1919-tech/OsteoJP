import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

/**
 * W7-03: the "Ações destrutivas" block is CONTAINED, not relocated.
 *
 * It is mounted outside the tabpanels, so before this loop it sat permanently
 * expanded at the bottom of EVERY tab. It is now a <details> disclosure,
 * collapsed by default and carrying the error token. Its DOM position is
 * unchanged - relocating it is a product decision (Q-W7-03-1), never taken here.
 *
 * Presentation only: the destructive controls and their server-side password gate
 * are untouched.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../../lib/patients/actions", () => ({
  hardDeletePatient: vi.fn(),
  mergePatients: vi.fn(),
  restorePatient: vi.fn(),
  softDeletePatient: vi.fn(),
}));

import { PatientActions } from "./patient-actions";

const render = (canHardDelete = false) =>
  renderToStaticMarkup(
    createElement(PatientActions, {
      patientId: "p1",
      isDeleted: false,
      canHardDelete,
      hardDeleteBlocked: null,
    }),
  );

describe("PatientActions W7-03 containment", () => {
  it("is a collapsed <details> disclosure, not a permanently open block", () => {
    const html = render();
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    // Collapsed by default: no `open` attribute on the details element.
    expect(html).not.toMatch(/<details[^>]*\sopen\b/);
  });

  it("uses the destructive (error) token so the section reads as dangerous", () => {
    const html = render();
    expect(html).toContain("border-error-200");
    expect(html).toContain("text-error");
    expect(html).toContain("Ações destrutivas");
  });

  it("still renders the destructive controls inside (nothing was removed)", () => {
    const html = render(true);
    expect(html).toContain("Eliminar");
  });

  it("keeps the password-gated hard delete behind the admin flag", () => {
    expect(render(false)).not.toContain("Eliminar definitivamente");
    expect(render(true)).toContain("Eliminar definitivamente");
  });
});
