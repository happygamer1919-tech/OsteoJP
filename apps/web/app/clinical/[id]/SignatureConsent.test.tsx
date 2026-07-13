/**
 * SignatureConsent.test.tsx - W5-16 (SPEC-ficha-medica.md sec 5.14 / 7).
 *
 * Renders the signature + consent section with react-dom/server (node env) and
 * pins the structure W5-16 delivers:
 * - the Consinto block renders THREE items, each with an EXPLICIT check-or-X
 *    state, never a bare unchecked box (an unset item shows an explicit chip);
 * - a draft shows the grant/deny toggles + a canvas; a finalized (read-only)
 *    record shows NO canvas and NO toggles (the persisted state is static);
 * - the final consent wording (W5-33) renders the two items.
 *
 * The supabase browser client + server actions are stubbed (out of scope for a
 * pure structure render).
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { emptyConsentState, type ConsentState } from "@/lib/clinical/consent";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({}) }));
vi.mock("./actions", () => ({
  createSignatureUploadUrlAction: async () => ({ ok: false }),
  confirmSignatureAction: async () => ({ ok: false }),
  generateRgpdFormUrlAction: async () => ({ url: null }),
}));
vi.mock("@osteojp/ui", () => ({
  Button: ({ children, "data-consent-action": dca }: { children?: ReactNode; "data-consent-action"?: string }) =>
    createElement("button", { "data-consent-action": dca }, children as ReactNode),
}));
vi.mock("lucide-react", () => ({
  Check: () => createElement("span", { "data-icon": "check" }),
  X: () => createElement("span", { "data-icon": "x" }),
}));

import { SignatureConsent } from "./SignatureConsent";

function render(consent: ConsentState, readOnly = false): string {
  return renderToStaticMarkup(
    createElement(SignatureConsent, {
      patientId: "00000000-0000-0000-0000-000000000001",
      recordId: "00000000-0000-0000-0000-000000000002",
      readOnly,
      consent,
      onSetDecision: () => {},
    }),
  );
}

describe("Consinto block (SPEC 7.3, W5-33) - two items, explicit check/X, never a bare box", () => {
  it("renders exactly two consent items (treatment + RGPD)", () => {
    const html = render(emptyConsentState());
    const items = html.match(/data-consent-item="/g) ?? [];
    expect(items.length).toBe(2);
    expect(html).toContain('data-consent-item="treatment"');
    expect(html).toContain('data-consent-item="rgpd"');
  });

  it("an UNSET item shows an explicit state chip, not a bare unchecked box", () => {
    const html = render(emptyConsentState());
    // Each item carries an explicit data-consent-state - never absent.
    const states = html.match(/data-consent-state="unset"/g) ?? [];
    expect(states.length).toBe(2);
  });

  it("a granted item renders the explicit check state; a denied item the X state", () => {
    const html = render({ treatment: "granted", rgpd: "denied" });
    expect(html).toContain('data-consent-state="granted"');
    expect(html).toContain('data-consent-state="denied"');
  });

  it("a draft exposes grant + deny toggles for each item and a signature canvas", () => {
    const html = render(emptyConsentState(), /* readOnly */ false);
    for (const key of ["treatment", "rgpd"]) {
      expect(html).toContain(`data-consent-action="${key}:grant"`);
      expect(html).toContain(`data-consent-action="${key}:deny"`);
    }
    expect(html).toContain('data-testid="signature-canvas"');
  });
});

describe("Read-only on finalized records (rule 4)", () => {
  const html = render({ treatment: "granted", rgpd: "denied" }, /* readOnly */ true);

  it("renders NO signature canvas and NO grant/deny toggles", () => {
    expect(html).not.toContain('data-testid="signature-canvas"');
    expect(html).not.toContain('data-consent-action=');
  });

  it("still shows the persisted decisions as static explicit states", () => {
    expect(html).toContain('data-consent-state="granted"');
    expect(html).toContain('data-consent-state="denied"');
  });
});

describe("final consent wording (W5-33)", () => {
  it("renders the two final consent items (treatment + RGPD), no placeholder", () => {
    const html = render(emptyConsentState());
    expect(html).toContain('data-consent-item="treatment"');
    expect(html).toContain('data-consent-item="rgpd"');
    expect(html).not.toContain("PENDENTE");
    // TEXT 1 lead-in (treatment consent).
    expect(html).toContain("Declaro que fui informado/a");
  });
});
