# BOARD-TEMPLATE.json — the clean template

`docs/board/BOARD-TEMPLATE.json` is a **schema-only, project-neutral copy** of the
board format used by `prelaunch-board.json` and `portal-board.json`.

## It must never carry project content

Not a real card, not a real gate, not a name, not a date that means something.
The moment it carries one, it stops being a template: the next project copies it
and inherits somebody else's launch gate. Copy it **out** to start a new board;
never edit it to record work.

Nothing in this repo reads it. It is not registered in `board-config.mjs`, so
`render-board.mjs` will refuse it, and `validate-board.mjs` reports exactly one
violation against it — the board-name allowlist — by design. That single
violation is the proof it is inert here and the only line a new project has to
change to make it live.

## Starting a new project's board from it

1. Copy to `docs/board/<your-board>.json` and set `board`, `phase`, `as_of`.
2. Add the new board name to `BOARD_NAMES` in `validate-board.mjs`, and add a
   config entry keyed by that exact name in `board-config.mjs`.
3. Set the people who can owe answers in `lanes[blocked_on_people].columns` —
   the validator reads the allowed values of `card.blocked_on` from there.
4. Replace the nine `G1..G9` conditions with the real launch conditions. If the
   count is not nine, change `LAUNCH_GATE_DENOMINATOR` in `validate-board.mjs`
   and `DEFAULT_DENOMINATOR` in `board-config.mjs` to match.
5. Delete the single example card and write real ones.

## Why the placeholders are typed rather than prose

Every enum value, date and lane id in the template is a **real, valid value**,
not the words describing it. A template that cannot pass its own validator
teaches nothing and hides its own mistakes. The "what belongs here" guidance
lives in the `title`, `notes` and `source_note` strings, which are free text and
carry it without breaking the schema.
