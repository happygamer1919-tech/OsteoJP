import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Users } from "lucide-react";

import { EmptyState } from "./EmptyState";

/**
 * W7-03 ornament guard. The decorative azulejo motif band (HeritageBand) used to
 * render ABOVE the empty-state icon whenever a call site passed `heritage`. It is
 * the "unwanted line" the owner kept reporting, and it is now removed
 * platform-wide: the prop is gone, the component is deleted, and no call site can
 * bring it back.
 *
 * An empty state is exactly: icon badge, title, subtitle, optional action.
 */
describe("EmptyState W7-03 - no motif band, ever", () => {
  const html = renderToStaticMarkup(
    createElement(EmptyState, {
      icon: Users,
      title: "Ainda não há pacientes",
      description: "Adicione o primeiro paciente para começar.",
    }),
  );

  it("renders the icon badge, title and description", () => {
    expect(html).toContain("Ainda não há pacientes");
    expect(html).toContain("Adicione o primeiro paciente para começar.");
    expect(html).toContain("<svg");
  });

  it("renders NO motif band: no mask-image, no azulejo asset, nothing above the icon", () => {
    expect(html).not.toContain("mask-image");
    expect(html).not.toContain("maskImage");
    expect(html).not.toContain("azulejo");
    // The band was the accent-2-200 mask strip; it must not appear.
    expect(html).not.toContain("bg-accent-2-200");
  });

  it("carries the brand in the badge instead: accent-1 purple (AA 8.43:1)", () => {
    expect(html).toContain("bg-accent-1-50");
    expect(html).toContain("text-accent-1-700");
  });

  it("the HeritageBand component no longer exists in the UI package", () => {
    const componentsDir = __dirname;
    const files = readdirSync(componentsDir);
    expect(files).not.toContain("HeritageBand.tsx");

    // And nothing re-exports it.
    const index = readFileSync(join(componentsDir, "..", "..", "index.ts"), "utf8");
    expect(index).not.toContain("HeritageBand");
  });

  it("EmptyState exposes no `heritage` prop to put the ornament back", () => {
    const src = readFileSync(join(__dirname, "EmptyState.tsx"), "utf8");
    // Only the explanatory comment may mention it; no prop, no render.
    expect(src).not.toContain("heritage?: boolean");
    expect(src).not.toContain("{heritage &&");
  });
});
