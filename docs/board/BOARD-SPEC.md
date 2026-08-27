# OsteoJP Pre-Launch Board - specification

Governs the OsteoJP Pre-Launch Board. Authored by YELLOW (docs and governance).
Owner-merge; YELLOW never merges its own PR.

A second board, the **Portal Board**, uses this same schema, the same lane ids
and the same rules. Everything below applies to both unless a line says
otherwise; the differences are collected in "The Portal Board" at the end.

A third file, **`docs/board/BOARD-TEMPLATE.json`**, is the same schema with every
project fact removed: one example card, one example ruling, nine placeholder
gates, and typed placeholder values throughout. `docs/board/BOARD-TEMPLATE.md`
explains every field in it. It exists so this system can be reused on another
project without copying OsteoJP's content, and it **must never carry project
content of its own**. It is not registered in `board-config.mjs` and nothing here
reads it; `validate-board.mjs` reports exactly one violation against it, the
board-name allowlist, which is the single line a new project changes to make its
own board live. Every field in it is explained, field by field, in
`docs/board/BOARD-TEMPLATE.md` (which replaces the former
`BOARD-TEMPLATE.README.md`).

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

Every entry in `cards[]` has these fields. The first block is required; the
second is optional and a card carrying none of it is an ordinary card.

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

**Optional fields.** Absent on almost every card. Each was added for a rule that
needed somewhere to record its exemption or its payload, and each is validated
only when present.

| field | type | notes |
|---|---|---|
| `open_on_purpose` | string | the reconciler's explicit exemption: why this card stays open after its evidence exists. Non-empty or absent - a bare `true` would silence a rule without saying why. Printed in full on every reconciler run |
| `deferred` | string | an owner ruling that this card is not to be built YET. Non-empty or absent, and it must say who ruled it and when. A shipped card may not carry it. A FIELD and not a sentence in `notes`, so the out-of-scope predicate in `PORTAL-REHYDRATE.md` §4.11 can see it - a deferral matched out of prose fails OPEN, and a sweep would then build the deferred thing |
| `card_kind` | enum | `loop`. A card that declares itself a loop, so the loop-spec rule below can find it. Absent on an ordinary card |
| `spec` | object | the Loop Package: the seven sections below, each a non-empty string, plus an optional `briefing`. Only valid on a card whose `card_kind` is `loop` |

### The loop spec (`WF-01`)

Owner ruling, 2026-08-04: **wave docs end after Wave 13; from the next authored
loop onward, the board card IS the loop spec.** The seven sections are
`docs/loops/README.md`'s Loop Package, keyed:

`scope_and_ground_truth`, `ordered_steps`, `definition_of_done`,
`verification`, `restrictions_and_scope_boundary`, `halt_loud_protocol`,
`report_back_format`. `briefing` is an allowed eighth, and it is optional:
every LOOP block in `WAVE-13.md` carried one, but `README.md`'s seven do not
include it.

**The rule the validator enforces: a loop card at `in_flight` or `shipped` must
carry all seven sections, each non-empty.** The ruling's words are "entering
ready or doing" - that vocabulary is `docs/design/BACKLOG.md`'s, and this board
has no such statuses, so the mapping is stated rather than inferred: a card is
ready-or-doing once it has left `todo` for work. `todo`, `blocked` and
`halted` are states of not-working and owe no spec yet.

**Loop-ness is DECLARED, never inferred from the presence of `spec`.** Inferring
it would fail open in exactly the case the ruling names - a loop card with no
spec at all would be indistinguishable from an ordinary card. So the two
half-states are both rejected: a `spec` without `card_kind: "loop"` is a
missing marker, and `card_kind: "loop"` without a full spec is not startable.
**What remains open, and is named rather than papered over:** a loop card
authored with neither field is invisible to the rule, because loop-ness is a
fact about intent that nothing mechanical can read.

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
- `deferred`, when present, is a non-empty string, and the card is not `shipped`.
- `card_kind`, when present, is `loop`.
- A card carrying `spec` must also carry `card_kind: "loop"`, and every key in
  `spec` must be a Loop Package section with a non-empty string value.
- A `card_kind: "loop"` card at `in_flight` or `shipped` carries all seven
  sections. Its own proof, including the negative arm for every section, is
  `docs/board/validate-board.test.mjs`.

## Rulings — recorded decisions, which are not work

**Owner ruling, 2026-08-27: "recorded rulings are not build work and must stop
rendering as to-do tasks."**

`rulings[]` is a top-level section beside `cards[]`. It holds decisions somebody
took. A ruling has **no acceptance line**, so nothing can ever finish it — which
is why fifteen of them sat in the IN FLIGHT lane reading `todo` for three weeks,
being counted as open work that nobody could build.

### What decides whether something is a ruling

> **A card with a machine-checkable acceptance is WORK, not a ruling.**

That is the whole test, and it is a test on the card's CONTENT rather than on its
id. `WF-01` is an owner ruling by title and stayed in `cards[]`, because it
mandated a validator function and a test suite and those either exist or they do
not. `WF-06` is also an owner ruling by title and moved, because what proves it
is the state of the card that consumed it — the card's own evidence field said
so: *"a ruling card carries no work of its own."*

### The fields

| field | type | notes |
|---|---|---|
| `id` | string | unique across `cards[]` **and** `rulings[]` — one namespace |
| `ruling` | string | the decision, in the words it was taken in. Non-empty |
| `date` | ISO 8601 | when it was ruled |
| `ruled_by` | string | who ruled it |
| `superseded_by` | null or id | the ruling that replaced this one |
| `governs` | string[] | the cards or files it binds. **Non-empty** |
| `title` | string | optional. The headline |
| `notes` | string | optional. The full record: why, what it resolves, what it does not |
| `external_agenda` | `true` | optional, and it means here exactly what it means on a card |

### The fields a ruling MAY NOT carry, and why the validator rejects them

`status`, `gate`, `evidence`, `acceptance`, `lane`, `home_lane`, `blocked_on`,
`card_kind`, `spec`, `deferred`, `open_on_purpose`, `priority`,
`owner_terminal`, `last_checkpoint`.

**A ruling is not done or not done.** A `status` on one can only be a lie —
`todo` on a decision already taken is exactly the state this section exists to
end. `evidence` would invite somebody to "close" it. They are **rejected** rather
than ignored, because silently dropping a stray field would let the old state
back in through a hand edit.

### Supersession, not editing

**A ruling is never deleted and never edited to record that it stopped
applying.** A later ruling supersedes it, `superseded_by` names that ruling, and
the chain stays readable. The portal renders a superseded ruling struck through
and dimmed — shown, never hidden, because the chain is the only record of *why* a
decision stopped applying. `WF-09` (batch at 3 waiting) is superseded by `WF-16`
(accumulate silently for the whole wave).

### Every reader treats them separately

- **`validate-board.mjs`** validates the section, refuses the forbidden fields,
  refuses a `superseded_by` naming no ruling, and refuses an id present in both
  sections. It prints the ruling count **on its own line**, never inside the card
  count. The section is **optional**: the platform board has none and is
  byte-for-byte as valid as before.
- **`reconcile-board.mjs`** reconciles them separately, because rules A–F all ask
  about a `status` a ruling does not have. Two rules apply: **governs-ghost** (a
  `governs` entry naming a card id that no longer exists — file paths and prose
  are skipped) and **supersede-cycle**.
- **`render-board.mjs`** passes them through the same `external_agenda` filter as
  the cards, keeps them out of every card count, and prints how many it carried.
- **`board-app.js`** renders them as a **sixth view, "Rulings"** (key `6`), never
  in a lane and never in the List, Board, Focus or Timeline views. Every count on
  the page reads `board.cards`, which no ruling is in.

### Cards are never deleted; a move is a MOVE

Moving a card into `rulings[]` is a move, not a rewrite. The card's former
card-only fields and its evidence field are carried into the ruling's `notes`
under a header saying where they came from, so the move loses nothing, and the
id is removed from `cards[]` in the same commit — the validator refuses an id
present in both.

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
and gives six views over the same data:

| view | what it answers |
|---|---|
| **Focus** | what needs YOU, then what waits on others, then what is moving |
| **Board** | the lanes, with drag-and-drop between them |
| **Launch gate** | the nine go/no-go conditions in full, with their notes |
| **List** | every card, sortable, for scanning |
| **Timeline** | every card by its last checkpoint, newest first |
| **Rulings** | the recorded decisions, which are not cards and not in any count |

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
- Keys: `/` search, `n` new card, `e` export, `u` undo, `1`-`6` views, `Esc` closes.
  The number keys are derived from the view list, so adding a view adds its key.

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
| render tracked? | no, gitignored | no, gitignored |
| executor terminal | GREEN | PURPLE |
| people columns | Ivan / JP / Rodica | Ivan / JP / Lawyer |
| lane 4 title | RODICA BATCH | STAKEHOLDER FEEDBACK |
| launch gate | G1-G9, the pre-launch conditions | PG1-PG9, the portal Definition of Ready |
| rehydrate prompt | - | `docs/board/PORTAL-REHYDRATE.md` |
| rulings section | none | 15 recorded decisions (the `WF-*` family) |

**One renderer, one app, one design system.** Both boards render through
`render-board.mjs`, which inlines `board-app.js` and `board.css` and gives both
boards the same six interactive views. The portal board originally shipped with
a second, static renderer (`render-portal-board.mjs`); it is retired, because a
second renderer that nothing runs is where drift starts. Everything that differs
between the two boards lives in `docs/board/board-config.mjs` and nowhere else.

**A render is a build product.** Both `prelaunch-board.rendered.html` and
`portal-board.rendered.html` are gitignored and regenerated on demand. The
committed JSON is the source of truth, and the published artifact is a render of
it. This settles a conflict between two committed documents: the pre-launch
render was gitignored while the portal render was tracked, and
`PORTAL-REHYDRATE.md` told PURPLE to regenerate it in the same commit, which only
makes sense for a tracked file. The rule is now the same for both boards, and the
rehydrate prompt says regenerate and publish, not regenerate and commit.

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

---

## Evidence standard: the disable-the-property arm (PREFERRED, not required)

**Adopted 2026-08-12 from `slot-lock-concurrency.test.ts`, which is the strongest
evidence artifact on this project.**

`db-tests.yml` does not merely run that suite. It runs it a **second time** with
`A4_DISABLE_LOCK=1` — the flag that turns off the very property the suite exists
to prove — and **requires that run to FAIL**:

```yaml
pnpm exec vitest run tests/slot-lock-concurrency.test.ts --reporter=default
code=$?
if [ "$code" -eq 0 ]; then
  echo "The concurrency suite PASSED with the slot lock disabled."
  echo "It is therefore not detecting the race, and its green run proves nothing."
```

### Why this is the template

A passing test proves the system behaves. **It does not prove the test would
notice if the system stopped.** Every vacuous guard this project has catalogued —
the 123 counted assertions, the self-mocking citation in the LOOP 6 audit, the
`strip()`-blanked anti-SQL assertion, the `getByRole("button")` that could never
match a `role="radio"` — passed happily while proving nothing. **A negative arm is
the only thing that distinguishes an assertion from a sentence.**

What makes this one exceptional is that **the arm runs in CI on every commit**,
not once at authoring time. A negative arm proven by hand during a build is
evidence about the day it was run. This one is evidence about *today*.

### The standard

> **Any gate row whose property can be disabled by a flag, an env var or a
> one-line edit SHOULD carry a CI arm that disables it and requires the check to
> fail.**

**Preferred, not required**, and deliberately so: not every property has a clean
disable switch, and manufacturing one purely to satisfy a standard adds a
production code path that exists only for a test. Where the switch already exists
— or falls out naturally — use it.

### Where it applies today

- `A4_DISABLE_LOCK` → the slot lock. **Live.**
- `OTP_LIVE_SEND` → the OTP transport, already a real flag.
- Any future feature flag guarding a gate-bearing property.

Where it does not fit, the fallback is unchanged and still binding: **negative
arms proven by deletion at authoring time, each recorded with what reddened.**
