import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgendaGrid } from "./agenda-grid";
import type { BlockSpan } from "@/lib/scheduling/blocked-time-core";

/**
 * SCHED-19 + SCHED-25 — THE GREY BAND'S TWO ARMS.
 *
 * ==========================================================================
 * WHY THIS IS A UNIT TEST AND NOT AN e2e ASSERTION
 * ==========================================================================
 * The FILLED arm is already driven end to end by `agenda-block-slot.spec.ts`:
 * dialog -> action -> `time_off.note` -> read path -> client boundary -> band.
 * Nothing here replaces that, and nothing here would have caught a break in it.
 *
 * THE EMPTY ARM CANNOT BE DRIVEN END TO END ANY MORE, AND THAT IS THE POINT.
 * From SCHED-25 every door that writes a block requires a note, so no e2e can
 * produce a note-less block through the product — which is exactly when a render
 * path stops being exercised and starts rotting. The rows it serves are real and
 * permanent: 19 of one therapist's 35 blocks predate the rule and have no note,
 * and they will still be on the agenda long after this change.
 *
 * So the empty arm is pinned HERE, where a band can be handed a `note: null`
 * that the product will not create, and asserted to say the note is MISSING
 * rather than to say nothing at all.
 *
 * Rendered to static markup (node env, no jsdom), the same way `agenda-grid`'s
 * own tests render this grid.
 */

// A Monday inside the default week view. Lisbon is UTC+1 in July (WEST), so a
// 09:00-11:00 Lisbon block is stored 08:00Z-10:00Z.
const DAY = "2026-07-20";

function band(note: string | null): BlockSpan {
  return {
    id: "block-1",
    startsAt: `${DAY}T08:00:00.000Z`,
    endsAt: `${DAY}T10:00:00.000Z`,
    reason: "other",
    note,
  };
}

function render(note: string | null): string {
  return renderToStaticMarkup(
    <AgendaGrid
      view="day"
      anchor={DAY}
      appointments={[]}
      blocks={[band(note)]}
      onSelectAppointment={() => {}}
      onSelectSlot={() => {}}
    />,
  );
}

describe("the blocked band says why, or says that it cannot", () => {
  it("renders the note as the headline when the block has one (SCHED-19)", () => {
    const html = render("Atende em LV");

    expect(html).toContain('data-testid="agenda-blocked-note"');
    expect(html).toContain("Atende em LV");
    // The category is still there beside it. The note REPLACED nothing: a reader
    // who does not know what the hatch means still gets told.
    expect(html).toContain("Tempo bloqueado");
    // And the empty-state footnote is NOT on a band that has a note, which is
    // the assertion that keeps the two arms from both rendering.
    expect(html).not.toContain('data-testid="agenda-blocked-no-note"');
  });

  /**
   * THE ARM SCHED-25 ADDED. Before it, this band rendered "Tempo bloqueado" and
   * nothing else — identical to a band whose note failed to reach the client,
   * which is a real failure mode this repo has already had (the note was not in
   * `blockSelection` at all until SCHED-19). One rendering for two causes is the
   * conflation PORTAL-REHYDRATE §1.3 is about: the reader takes it for the
   * benign one, because the benign one is what the screen reports.
   */
  it("says the note is MISSING on a pre-SCHED-25 block, not merely nothing (SCHED-25)", () => {
    const html = render(null);

    expect(html).toContain('data-testid="agenda-blocked-no-note"');
    expect(html).toContain("Tempo bloqueado");
    expect(html).toContain("sem nota");
    expect(html).not.toContain('data-testid="agenda-blocked-note"');
  });

  /**
   * A note that is only whitespace is the EMPTY case, not the filled one. The
   * write layer trims, so the product cannot store one — but a row written
   * before SCHED-25 can hold `"   "`, and rendering an empty highlighted chip
   * would be worse than the footnote: it would claim a reason exists.
   */
  it("treats a whitespace-only legacy note as no note", () => {
    const html = render("   ");

    expect(html).toContain('data-testid="agenda-blocked-no-note"');
    expect(html).not.toContain('data-testid="agenda-blocked-note"');
  });
});
