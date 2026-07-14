import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

// W6-06b - the 55/25/20 equity uses PURPLE (accent-1) for selected states. The
// patient-profile tabs are the priority surface: the active tab underline must be
// accent-1-700 (purple), not the old accent-2-600 (cyan). Renders the real
// @osteojp/ui Tabs through ProfileTabs (only next/navigation is stubbed).

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ProfileTabs } from "./profile-tabs";

describe("ProfileTabs W6-06b purple selected state", () => {
  it("gives the active tab the accent-1-700 (purple) underline, not accent-2-600", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileTabs, {
        patientId: "p1",
        current: "registos",
        label: "Secções",
        items: [
          { value: "resumo", label: "Resumo" },
          { value: "registos", label: "Registos" },
          { value: "documentos", label: "Documentos" },
        ],
      }),
    );
    expect(html).toContain("border-accent-1-700");
    expect(html).not.toContain("border-accent-2-600");
  });

  // W7-03: W6-06b purpled ONLY the 2px hairline under a near-black label, which
  // the owner reported as imperceptible. The active LABEL is purple too now.
  it("W7-03: the active tab LABEL is purple, not just the underline", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileTabs, {
        patientId: "p1",
        current: "registos",
        label: "Secções",
        items: [
          { value: "resumo", label: "Resumo" },
          { value: "registos", label: "Registos" },
          { value: "documentos", label: "Documentos" },
        ],
      }),
    );
    // The selected tab carries BOTH the purple underline and the purple label.
    expect(html).toContain("border-accent-1-700 text-accent-1-700");
    // Inactive tabs stay neutral, so purple still means "selected".
    expect(html).toContain("border-transparent text-text-secondary");
  });
});
