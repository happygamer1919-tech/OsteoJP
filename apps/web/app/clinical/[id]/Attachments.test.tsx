import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * THE ANEXOS PICKER ADVERTISES THE RULE THE SERVER APPLIES, AND THE HANDLER
 * APPLIES IT BEFORE ASKING FOR AN UPLOAD URL (H5).
 *
 * WHAT EACH BLOCK COVERS, MEASURED AT BOTH ENDS. Two separate things changed
 * here: the `accept` attribute on the input, and the `onSelect` pre-validation
 * with the refusal paragraph it renders. Against `origin/main` the first render
 * arm is red, because the input carried no `accept` there. Against the previous
 * commit on this branch, which already carried `accept`, BOTH RENDER ARMS ARE
 * GREEN - so neither of them covers the pre-validation, and reverting that check
 * would leave both of them passing. The third block is the one that covers it.
 *
 * WHAT THIS FILE CAN AND CANNOT ASSERT. The web test environment is `node` and
 * the render is `react-dom/server`: there is markup, and there are no events.
 * There is no DOM environment anywhere in this repository - every vitest config
 * is `environment: "node"`, and no jsdom, happy-dom or @testing-library is
 * installed - so a click test would require a new third-party dependency, which
 * is owner-gated and is not added for a test. The new path is therefore asserted
 * two ways: its decision function is covered as a pure function
 * (lib/patients/document-validation.test.ts), and the wiring it depends on -
 * that the handler calls that shared function, and that the two strings it names
 * exist - is read off the source and the string table, which is the technique
 * this suite already uses for its exception lists.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@osteojp/ui", () => ({
  Button: ({ children }: { children: ReactNode }) => createElement("button", null, children),
}));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({}) }));
vi.mock("./CameraCapture", () => ({ CameraCapture: () => null }));
vi.mock("./actions", () => ({
  confirmAttachmentAction: vi.fn(),
  createUploadUrlAction: vi.fn(),
  downloadUrlAction: vi.fn(),
}));

const { Attachments } = await import("./Attachments");
const { ALLOWED_DOCUMENT_MIME, DOCUMENT_ACCEPT } = await import(
  "@/lib/patients/document-validation"
);

const render = (readOnly: boolean) =>
  renderToStaticMarkup(
    createElement(Attachments, { recordId: "rec-1", items: [], readOnly }),
  );

describe("Anexos file picker", () => {
  // NEITHER ARM IN THIS BLOCK COVERS THE PRE-VALIDATION. The `accept`
  // attribute arrived in an earlier commit on this branch and the read-only
  // branch predates the branch entirely: revert the `onSelect` check and both
  // of these stay green. The block below is the one that goes red.
  it("advertises exactly the types the upload gate accepts", () => {
    const html = render(false);
    expect(html).toContain(`accept="${DOCUMENT_ACCEPT}"`);
    // Read off the allowlist rather than a copy of it: a type added to the gate
    // and not to the picker is the defect this arm exists for.
    for (const mime of ALLOWED_DOCUMENT_MIME) expect(html).toContain(mime);
  });

  it("renders no picker at all on a finalised registo", () => {
    expect(render(true)).not.toContain("type=\"file\"");
  });
});

/**
 * THE REFUSAL PATH, READ AT THE SOURCE. This is the arm that goes red if the
 * `onSelect` pre-validation is reverted, if the handler stops calling the shared
 * gate, or if one of the two strings it names is removed from the table while
 * the component still asks for it - the failure a picker-only test cannot see,
 * because the person would then be shown an empty paragraph.
 */
describe("the change handler refuses with the Documentos rule and the Documentos wording", () => {
  const SRC = readFileSync(join(__dirname, "Attachments.tsx"), "utf8");
  const PT = JSON.parse(
    readFileSync(
      join(__dirname, "..", "..", "..", "..", "..", "packages", "i18n", "src", "strings.pt.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;

  it("read the component and the string table at all", () => {
    // Vacuous-pass guard: every assertion below is satisfied by an empty read
    // of the wrong file, so prove both were found first.
    expect(SRC).toContain("export function Attachments");
    expect(Object.keys(PT).length).toBeGreaterThan(100);
  });

  it("calls the SHARED validator, imported from the pure module", () => {
    // Not a second copy of the rule, and not an import of lib/patients/documents
    // (that would close a cycle through storage.ts).
    expect(SRC).toMatch(/from "@\/lib\/patients\/document-validation"/);
    expect(SRC).toMatch(/validateDocumentUpload\(\s*\{[^}]*mimeType[^}]*sizeBytes[^}]*\}\s*\)/);
  });

  it("renders the refusal it sets, rather than the generic error", () => {
    expect(SRC).toMatch(/\{refusal && <p role="alert"/);
  });

  it.each(["patients.documentInvalidType", "patients.documentTooLarge"])(
    "names %s, and that key carries a non-empty pt-PT string",
    (key) => {
      expect(SRC, `${key} is not referenced by Attachments.tsx`).toContain(key);
      expect(typeof PT[key], `${key} is missing from strings.pt.json`).toBe("string");
      expect((PT[key] as string).trim().length).toBeGreaterThan(0);
    },
  );
});
