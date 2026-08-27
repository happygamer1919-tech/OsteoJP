import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * EXTERNAL AGENDA — THE BOARD AND THE LEDGER AGREE, IN BOTH DIRECTIONS.
 *
 * ==========================================================================
 * WHY THIS GUARD AND NOT A PARAGRAPH.
 * ==========================================================================
 * `external_agenda: true` REMOVES a card from the rendered artifact and from
 * every count on it. `docs/board/EXTERNAL-AGENDA.md` is then the ONLY surface on
 * which that card still exists for a reader who does not open a 400KB JSON file.
 *
 * SO THE TWO CAN DRIFT IN TWO DIRECTIONS, AND BOTH ARE SILENT:
 *
 *   a card flagged and NOT listed disappears completely. Not from the ledger -
 *   from the project. Nothing renders it, nothing counts it, and nothing says it
 *   is missing. That is the worst outcome this field can produce, and it is one
 *   forgotten paste away.
 *
 *   a card listed and NOT flagged is the opposite: the ledger claims the work
 *   left the board while the board still shows it, so it is tracked twice -
 *   exactly the duplicate tracking the ruling exists to end.
 *
 * Neither shows up as a failure anywhere else, which is why this runs in the
 * required check rather than being trusted to a review.
 *
 * ==========================================================================
 * WHY HERE AND NOT IN validate-board.mjs.
 * ==========================================================================
 * That validator is SHARED WITH THE PLATFORM BOARD, and this ledger is a
 * portal-board artefact. PORTAL-REHYDRATE 4.11's scope note is explicit:
 * anything added to a shared instrument is additive or it does not ship. The
 * validator checks the field's SHAPE, which is board-agnostic; this file checks
 * the portal board's own bookkeeping.
 */

const BOARD = "docs/board/portal-board.json";
const LEDGER = "docs/board/EXTERNAL-AGENDA.md";

const board = JSON.parse(readFileSync(BOARD, "utf8"));
const ledger = readFileSync(LEDGER, "utf8");

/** Ids in the ledger table: a row starts `| \`<id>\` |`. Prose mentions of a
 *  card id elsewhere in the file are deliberately NOT rows - the "what is
 *  deliberately NOT here" section names three cards that must stay on the board,
 *  and a looser match would read those as ledger entries and invert the check. */
const rows = [...ledger.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);

/**
 * BOTH SECTIONS, AND THAT IS THE POINT OF READING IT THIS WAY.
 *
 * `external_agenda` means the same thing on a ruling as on a card: the owner
 * tracks the subject somewhere else, so this board does not render it and does
 * not count it. When the WF-* family moved from `cards[]` to `rulings[]` on
 * 2026-08-27, WF-13 (credential rotation) and WF-15 (legal leaves engineering)
 * went with it carrying the flag.
 *
 * READING ONLY `cards` WOULD HAVE INVERTED THIS GUARD SILENTLY, and in the worst
 * of its two directions: the two ledger rows would have looked like rows naming
 * nothing, so the fix that suggests itself is to DELETE them - which is exactly
 * the "disappears completely, not from the ledger but from the project" outcome
 * the header calls the worst thing this field can produce. The section a record
 * lives in is not what decides whether it is tracked elsewhere.
 */
const entries = [...board.cards, ...(board.rulings ?? [])];
const flagged = entries.filter((c) => c.external_agenda === true).map((c) => c.id);

test("the scan is not vacuous", () => {
  // LEARNINGS entry 5. Two empty lists agree perfectly, and this file would go
  // green over a board where the field had been stripped and a ledger that had
  // been emptied - reporting harmony between two absences.
  assert.ok(board.cards.length >= 100, `board parsed to ${board.cards.length} cards`);
  assert.ok(
    entries.length > board.cards.length,
    "the board has no rulings section - either it was dropped or this guard is reading only half the file",
  );
  assert.ok(flagged.length > 0, "no card carries external_agenda - either the field was dropped or this guard is checking nothing");
  assert.ok(rows.length > 0, `${LEDGER} parsed to no table rows - the table shape changed and this guard is checking nothing`);
});

test("every flagged card has a row in the ledger", () => {
  const missing = flagged.filter((id) => !rows.includes(id));
  assert.deepEqual(
    missing,
    [],
    `these cards are hidden from the rendered board and appear NOWHERE else:\n  ${missing.join("\n  ")}\n` +
      `Add a row to ${LEDGER} saying where each one stands, or drop the external_agenda field.`,
  );
});

test("every ledger row names a flagged card", () => {
  const stale = rows.filter((id) => !flagged.includes(id));
  assert.deepEqual(
    stale,
    [],
    `${LEDGER} says these left the board and the board still renders them, so they are tracked twice:\n  ${stale.join("\n  ")}`,
  );
});

test("every ledger row names a card that EXISTS", () => {
  // The third drift, and the quietest: a row for an id nobody can look up. It
  // passes both checks above the moment the card is deleted, because a deleted
  // card is not flagged and is not rendered either.
  const ids = new Set(entries.map((c) => c.id));
  const ghosts = rows.filter((id) => !ids.has(id));
  assert.deepEqual(ghosts, [], `ledger rows naming no card on the board:\n  ${ghosts.join("\n  ")}`);
});

test("no flagged card is left in a lane the render would have shown", () => {
  // CARDS ONLY. A ruling carries no `lane` at all - the validator rejects one
  // that does - so there is no lane for it to return to and nothing to check.
  // Not a display rule - a bookkeeping one. `lane` is DERIVED and the validator
  // recomputes it, so a flagged card still carries a real lane and must: if the
  // flag is ever removed, the card has to come back to the right column rather
  // than to whatever was left behind.
  const LANES = ["shipped", "blocked_on_people", "in_flight", "rodica_batch", "incidents", "loose_ends"];
  for (const id of flagged) {
    const card = board.cards.find((c) => c.id === id);
    if (!card) continue;
    assert.ok(
      LANES.includes(card.lane),
      `${id} is flagged external_agenda and carries lane "${card.lane}", which is not a lane it could return to`,
    );
  }
});
