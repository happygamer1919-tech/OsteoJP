# OsteoJP Pre-Launch Board - specification

Governs the OsteoJP Pre-Launch Board. Authored by YELLOW (docs and governance).
Owner-merge; YELLOW never merges its own PR.

A second board, the **Portal Board**, uses this same schema, the same lane ids
and the same rules. Everything below applies to both unless a line says
otherwise; the differences are collected in "The Portal Board" at the end.

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
| `lane` | enum | **DERIVED, never hand-set** - see "Lane is derived" below |
| `home_lane` | enum | the card's KIND: `in_flight` \| `rodica_batch` \| `incidents` \| `loose_ends` |
| `priority` | enum | `high` \| `medium` \| `low` (default `medium`) |
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

## Lane is derived

A card's lane is a FUNCTION of what is true about the card. It is not a field a
human sets, and the validator rejects a file where the two disagree:

```
lane(card) =
  status = shipped                                          -> shipped
  home_lane = in_flight AND status = blocked
                       AND blocked_on in ivan|jp|rodica     -> blocked_on_people
  otherwise                                                 -> home_lane
```

`home_lane` is the card's KIND and the only lane fact anyone sets: is this a work
item, an incident, something from Rodica's inbox, or a loose end? Incidents and
inbox items keep their kind while blocked - they are categories, not states -
which is why the derivation only routes `in_flight` work into the people lane.

Consequences, and the reason the rule exists:

- Marking a card done MOVES it to Shipped. It cannot sit in "In flight" wearing a
  "Shipped" badge, which is exactly what the old board allowed.
- Naming a person on a blocked work item moves it under that person.
- Clearing the blocker moves it back.
- The portal computes this on every change; `validate-board.mjs` computes the
  same function and fails the build if the stored `lane` disagrees. One rule, two
  independent implementations, no drift.

### Rules the validator enforces (beyond field types)

- `status=shipped` requires non-null `evidence`. **No exceptions.**
- `state=pass` (launch gate) requires non-null `evidence`.
- `status=blocked` requires `blocked_on != null` - name who or what we wait on.
- A card in the `blocked_on_people` lane requires `blocked_on` in
  `ivan | jp | rodica` (that lane is split by person).
- Card `id`s are unique; gate `id`s are unique.
- `lane` values are real lanes; cards never live in `launch_gate` (the gate has
  its own `conditions[]`).
- `lane` equals `deriveLane(card)` - a stored lane that contradicts the card's own
  status is a red gate, not a cosmetic issue.
- `home_lane` is one of the four KIND lanes; `shipped` and `blocked_on_people` are
  states, so they are never a home.
- `priority` is `high` \| `medium` \| `low`.

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

## The portal (what the artifact is)

The artifact is a working surface, not a picture of one. It renders from the JSON
and gives five views over the same data:

| view | what it answers |
|---|---|
| **Focus** | what needs YOU, then what waits on others, then what is moving |
| **Board** | the lanes, with drag-and-drop between them |
| **Launch gate** | the nine go/no-go conditions in full, with their notes |
| **List** | every card, sortable, for scanning |
| **Timeline** | every card by its last checkpoint, newest first |

Interaction rules worth knowing before editing the app:

- **Evidence is enforced in the UI.** Marking a card done, or a gate PASS, opens
  a prompt for the evidence the validator will demand. The portal never records a
  state the repo would reject.
- **Drag-and-drop writes state, not position.** Dropping on Shipped ships the
  card (with the evidence prompt); dropping on Blocked-on-people blocks it and
  names a person; dropping on a kind lane sets its kind and reopens it if it was
  shipped.
- Edits live in the viewer's `localStorage`, keyed by board name + schema
  version. **Export** shows a diff against the committed seed, mirrors the
  validator, and offers the JSON plus a plain-language change brief to hand back.
- Everything is undoable (`Ctrl/Cmd+Z`, or the Undo button), and "Discard local
  changes" restores the committed board exactly.
- Keys: `/` search, `n` new card, `e` export, `u` undo, `1`-`5` views, `Esc` closes.

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

## The Portal Board

The portal workstream has its own board with this exact structure. Only the
differences are listed here; everything else in this file governs it unchanged.

| | Pre-Launch Board | Portal Board |
|---|---|---|
| name | `OsteoJP - Pre-Launch Board` | `OsteoJP - Portal Board` |
| source of truth | `docs/board/prelaunch-board.json` | `docs/board/portal-board.json` |
| renderer | `render-board.mjs` | `render-board.mjs` (the same one) |
| render output | `prelaunch-board.rendered.html` | `portal-board.rendered.html` |
| executor terminal | GREEN | PURPLE |
| people columns | Ivan / JP / Rodica | Ivan / JP / Lawyer |
| lane 4 title | RODICA BATCH | STAKEHOLDER FEEDBACK |
| launch gate | G1-G9, the pre-launch conditions | PG1-PG9, the portal Definition of Ready |
| rehydrate prompt | - | `docs/board/PORTAL-REHYDRATE.md` |

**One renderer, one app, one design system.** Both boards render through
`render-board.mjs`, which inlines `board-app.js` and `board.css` and gives both
boards the same five interactive views. The portal board originally shipped with
a second, static renderer (`render-portal-board.mjs`); it is retired, because a
second renderer that nothing runs is where drift starts. Everything that differs
between the two boards lives in `docs/board/board-config.mjs` and nowhere else.

Four rules make one validator serve both:

- **`validate-board.mjs` accepts either board name** and takes a path argument.
  `node docs/board/validate-board.mjs docs/board/portal-board.json`.
- **The people set is read from the board's own `blocked_on_people.columns`.**
  The BLOCKED ON PEOPLE lane is split by person, and which people differ per
  board. `blocked_on` is therefore `null | <that board's columns> | infra`. A
  board that omits `columns` keeps the historical Ivan/JP/Rodica set.
- **Lane ids are identical on both boards, including `rodica_batch`.** The
  validator and `board-app.js` both pin the exact lane-id set, so the portal
  board keeps the id and changes only the title and the meaning. A lane's title
  is display text; its id is structure.
- **The `gate` enum is NOT extended.** There is no `purple_self_merge`.
  `green_self_merge` denotes an **executor-terminal self-merge**, and the
  executor is GREEN on the pre-launch board and PURPLE on the portal board. Each
  board states this mapping in its own `doctrine` field.

**The fingerprint.** Neither board stores one. It is derived at RENDER time as
`sha256(JSON.stringify(board))` truncated to 16 hex characters - defined by
`render-board.mjs:71` and mirrored byte-for-byte by `render-portal-board.mjs`.
It exists so a browser holding an older snapshot can detect that a newer board
was published, which a date-based check could not do (see PL-28). Storing it in
the JSON would make it a hash of a file containing itself; do not add the key.
