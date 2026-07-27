# OsteoJP Pre-Launch Board - specification

Governs the OsteoJP Pre-Launch Board. Authored by YELLOW (docs and governance).
Owner-merge; YELLOW never merges its own PR.

## Why this file exists

The board artifact was titled "OsteoJP - Wave 12 board" and lived ONLY as a
claude.ai artifact. An artifact is not a committed repo file, which violates the
standing rule "ground truth lives in committed repo files." Renamed to
**"OsteoJP - Pre-Launch Board"** and re-based on a committed source of truth.

- **Source of truth:** `docs/board/prelaunch-board.json` (committed).
- **The artifact is a RENDER of the JSON**, nothing more. The JSON leads; the
  artifact follows.
- **A board claim is never truth on its own.** The `evidence` field carries the
  proof. A card that says "shipped" with no evidence is not shipped; it is a lie
  the validator rejects.
- **GREEN updates the JSON at every checkpoint and re-renders.** The render step
  never invents state the JSON does not have.

## The board's own definition of done

`docs/board/validate-board.mjs`. Run it from the repo root:

```
node docs/board/validate-board.mjs
```

Exit 0 = the board is well-formed and every shipped/passed claim carries
evidence. Exit non-zero = at least one violation, all printed. This script IS the
board's definition of done: the board is only "green" when the validator is green.
Wire it into CI or a pre-commit hook the same way the app gates run; a red
validator is a red gate.

The single non-negotiable rule it enforces: **a card may not enter
`status=shipped` with `evidence=null`** (and, symmetrically, a launch gate may
not be `state=pass` with `evidence=null` - a passed gate without proof is the
same anti-pattern). Zero dependencies, read-only, never writes.

## Card schema

Every entry in `cards[]` has exactly these fields:

| field | type | notes |
|---|---|---|
| `id` | string | unique across the board |
| `title` | string | non-empty, plain language |
| `lane` | enum | one of the lanes below, except `launch_gate` |
| `status` | enum | `todo` \| `in_flight` \| `halted` \| `blocked` \| `shipped` |
| `owner_terminal` | string | which terminal owns the card (yellow / green / cyan / ivan / rodica ...) |
| `gate` | enum | `green_self_merge` \| `cyan_clear` \| `owner_merge` \| `owner_authorizo` \| `stakeholder` |
| `evidence` | null or object | `null`, or `{ kind, ref, at }` |
| `blocked_on` | enum | `null` \| `ivan` \| `jp` \| `rodica` \| `infra` |
| `last_checkpoint` | ISO 8601 | date or timestamp of the last GREEN update to this card |
| `notes` | string | context; quote the reporter verbatim where relevant |

`evidence`, when present, is `{ kind, ref, at }`:

- `kind`: `pr` \| `journal` \| `sha256` \| `e2e` \| `screenshot`
- `ref`: non-empty string (PR number, journal idx, hash, spec path, image path)
- `at`: ISO 8601 date or timestamp

### Rules the validator enforces (beyond field types)

- `status=shipped` requires non-null `evidence`. **No exceptions.**
- `state=pass` (launch gate) requires non-null `evidence`.
- `status=blocked` requires `blocked_on != null` - name who or what we wait on.
- A card in the `blocked_on_people` lane requires `blocked_on` in
  `ivan | jp | rodica` (that lane is split by person).
- Card `id`s are unique; gate `id`s are unique.
- `lane` values are real lanes; cards never live in `launch_gate` (the gate has
  its own `conditions[]`).

## Lanes, in render order

1. **LAUNCH GATE** - the explicit go/no-go conditions, each pass or fail, nothing
   else. Lives in `launch_gate.conditions[]`, not in `cards[]`.
2. **BLOCKED ON PEOPLE** - split into **Ivan / JP / Rodica** columns. Answer
   latency is `now - last_checkpoint`, rendered per card so a stalled question is
   visible.
3. **IN FLIGHT** - cards actively being executed.
4. **RODICA BATCH** - the live inbox. Cards move OUT of this lane into In Flight
   when dispatched. This is where a fresh Rodica report lands first.
5. **INCIDENTS** - live incidents (e.g. synthetic data on prod).
6. **LOOSE ENDS** - everything tracked but not batched, incident, or gate.
7. **SHIPPED** - collapsed by default, **count only**, expandable. Every card
   here carries evidence (the validator guarantees it).

## Launch gate

Nine conditions, each **pass or fail, no partial credit**:

| id | condition |
|---|---|
| G1 | working-hours seeded for the real team (`availability_templates` non-empty) |
| G2 | `REMINDERS_LIVE_SEND` resolved and canary sender confirmed |
| G3 | `NEW_DB_PASSWORD` rotated with full propagation |
| G4 | prod free of synthetic data (CYAN PASS, post INC-02) |
| G5 | Rodica batch cleared or explicitly deferred with her sign-off |
| G6 | nine staff mailboxes created on webhs, invite tested to Chris Macov |
| G7 | estados flags ON |
| G8 | lawyer sign-off on the RGPD package incl. Twilio DPF/SCC line |
| G9 | Rodica green light + freeze lift |

**Launch readiness = gates passed / 9.** It is COUNTED, never estimated. It is
NOT a percentage of work done: nine independent conditions, each proven pass with
evidence or it is fail. `launch_gate.readiness_passed` must equal the number of
`state=pass` conditions or the validator fails. Fail-closed: a condition is `fail`
until its evidence exists.

## Rendering the artifact

The artifact is regenerated FROM this JSON, never hand-edited. To render:

1. Run `node docs/board/validate-board.mjs` - must be green first.
2. Read `prelaunch-board.json`.
3. Render lanes 1-7 in `order`. LAUNCH GATE renders
   `launch_gate.conditions[]` as pass/fail chips with the readiness figure
   `passed/9`. BLOCKED ON PEOPLE renders three columns keyed on `blocked_on`,
   each card showing its answer latency from `last_checkpoint`. SHIPPED renders
   collapsed with a count.
4. Update the existing artifact in place (`url=` param); never mint a new URL.

If the artifact and the JSON disagree, the JSON wins and the artifact is
re-rendered. The artifact is a mirror, not a second source.

## Checkpoint discipline (GREEN)

At every checkpoint: update the affected card(s) in the JSON (status, evidence,
`last_checkpoint`), run the validator, then re-render the artifact. Never mark a
card shipped before its evidence exists - the validator will reject the commit,
which is the point.
