import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BatchFailure } from "@/lib/scheduling/batch-core";
import { BatchFailureDialog } from "./batch-failure-dialog";

const F1: BatchFailure = {
  startsAt: "2026-08-06T14:00:00.000Z",
  date: "2026-08-06",
  hhmm: "14:00",
  reason: "busy",
  nearestAlternative: { startsAt: "2026-08-06T15:00:00.000Z", date: "2026-08-06", hhmm: "15:00" },
};

function render(failures: BatchFailure[], bookedCount = 3): string {
  return renderToStaticMarkup(
    createElement(BatchFailureDialog, {
      bookedCount,
      failures,
      onRebook: vi.fn(),
      onClose: vi.fn(),
    }),
  );
}

describe("BatchFailureDialog (W2-05)", () => {
  it("renders a failure row with the busy reason and the nearest alternative", () => {
    const html = render([F1]);
    expect(html).toContain("2026-08-06"); // failed slot date
    expect(html).toContain("14:00"); // failed slot time
    expect(html).toContain("Ocupado"); // reason
    expect(html).toContain("15:00"); // nearest alternative time
    expect(html).toContain("Remarcar"); // per-row rebook action
    expect(html).toContain("Marcadas: 3"); // booked summary
  });

  it("shows the all-resolved message when there are no remaining failures", () => {
    const html = render([]);
    expect(html).toContain("Todas as marcações em falta foram remarcadas");
  });

  // W3-02: the dialog is a native <dialog> (shown with showModal at runtime) so
  // it stacks in the browser top layer ABOVE the appointment Drawer instead of
  // rendering inert behind it as an in-flow `fixed inset-0` overlay did.
  it("renders as a native <dialog> in the top layer, not an in-flow overlay", () => {
    const html = render([F1]);
    expect(html).toContain("<dialog");
    // The old broken pattern was a fixed, in-flow div behind the modal drawer.
    expect(html).not.toContain("fixed inset-0");
  });
});
