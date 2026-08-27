# BOARD-TEMPLATE.json — the canonical empty board, field by field

`docs/board/BOARD-TEMPLATE.json` is the **schema-only, project-neutral** copy of
the board format. Copy it out to start a new project's board. This file explains
every field in it, so somebody who has never seen an OsteoJP board can fill it in
without reading anything else.

It replaces the former `BOARD-TEMPLATE.README.md`.

---

## The one rule about this file

**It must never carry project content.** Not a real card, not a real gate, not a
name, not a date that means something. The moment it carries one, it stops being
a template: the next project copies it and inherits somebody else's launch gate.
**Copy it out to start a board; never edit it to record work.**

Nothing in this repo reads it. It is not registered in `board-config.mjs`, so
`render-board.mjs` refuses it, and `validate-board.mjs` reports **exactly one**
violation against it — the board-name allowlist — by design. That single
violation is the proof it is inert here, and it is the one line a new project
changes to make its board live.

### Why the placeholders are typed rather than prose

Every enum value, date and lane id in the template is a **real, valid value**,
not the words describing it. A template that cannot pass its own validator
teaches nothing and hides its own mistakes. The "what belongs here" guidance
lives in the `title`, `notes`, `ruling` and `source_note` strings, which are free
text and carry it without breaking the schema.

### Why each array carries one entry rather than none

`cards[]` has one card and `rulings[]` has one ruling. An empty array is a
shorter file that teaches nothing: the shape of an entry is the part a new
project actually needs, and it cannot be inferred from `[]`. **Delete the example
entries and write real ones** — that is step 6 below.

---

## Starting a new project's board

1. Copy to `docs/board/<your-board>.json` and set `board`, `phase`, `as_of`.
2. Add the new board name to `BOARD_NAMES` in `validate-board.mjs`, and add a
   config entry keyed by that **exact** name in `board-config.mjs`. Without the
   second one the renderer throws rather than falling back — deliberately, so a
   new board cannot render under another board's branding.
3. Set the people who can owe answers in `lanes[blocked_on_people].columns`. The
   validator reads the allowed values of `card.blocked_on` from there.
4. Replace the nine `G1..G9` conditions with the real launch conditions. If the
   count is not nine, change `LAUNCH_GATE_DENOMINATOR` in `validate-board.mjs`
   **and** `DEFAULT_DENOMINATOR` in `board-config.mjs` to match.
5. Empty `rulings[]`, or write the standing decisions the project already has.
6. Delete the single example card and write real ones.
7. Run `node docs/board/validate-board.mjs docs/board/<your-board>.json`. It must
   exit 0 before you render.

---

## Top-level fields

| field | what it is |
|---|---|
| `board` | The board's name. **The validator's allowlist is keyed on this exact string**, and so is `board-config.mjs`. Changing it is what makes a copied template a live board. |
| `schema_version` | Bump when the schema changes shape. The browser's `localStorage` key includes it, so a bump retires every stale local snapshot instead of resurrecting one over a new publish. |
| `phase` | A slug for what the project is doing now. Display only. |
| `as_of` | ISO 8601. When this file was last published. **Not** a staleness check — the renderer derives a content fingerprint for that, because a date cannot express "changed again today". |
| `renders_to` | A sentence saying the artifact is a RENDER of this file and the render is a gitignored build product. It exists so a reader who found the artifact first knows which way the arrow points. |
| `doctrine` | The rules a reader must know before touching the board: evidence is not optional, and what each `gate` value means **on this project**. The gate enum is fixed; its words are read literally, so a board that means something different by `owner_merge` says so here. |
| `lanes` | The seven lanes, in order. **The ids are fixed** — see below. |
| `launch_gate` | The go/no-go conditions. |
| `rulings` | Recorded decisions. Not work. |
| `cards` | The work. |

---

## `lanes[]` — fixed ids, free titles

The **id set and its order are pinned** in `validate-board.mjs` and in
`board-app.js`. A board with different lane ids is rejected. Only the `title` and
`note` are yours to change.

That includes `rodica_batch`, which is a historical name for the stakeholder
inbox lane. It reads oddly on a new project and it stays anyway: the id is
structure, the title is display text, and renaming it would be a schema change
for a label.

| id | what belongs in it |
|---|---|
| `launch_gate` | Nothing. The gate lives in `launch_gate.conditions[]`; cards may never sit here. |
| `blocked_on_people` | Work waiting on a named person. **Derived**, never set by hand. |
| `in_flight` | Work being executed. |
| `rodica_batch` | The inbox: stakeholder reports land here first, and move out when dispatched. |
| `incidents` | Live problems. |
| `loose_ends` | Tracked, not batched, not an incident. |
| `shipped` | Done, with proof. **Derived**, never set by hand. |

`lanes[blocked_on_people].columns` is load-bearing: **those ids are the allowed
values of `card.blocked_on`**, read straight out of this array by the validator
and by `board-config.mjs`. A board that omits `columns` falls back to the
historical `ivan / jp / rodica`.

---

## `launch_gate` — counted, never estimated

| field | what it is |
|---|---|
| `denominator` | How many conditions there are. Pinned in `validate-board.mjs` as `LAUNCH_GATE_DENOMINATOR`; change both together or the board is red. |
| `readiness_passed` | How many are `pass`. The validator recomputes it and fails if the stored number disagrees, so it can never be optimistic. |
| `source_note` | Where the gate list came from, who supplied it, on what date. |
| `conditions[]` | One entry per condition. |

Each condition: `id`, `title`, `state` (`pass` \| `fail`, **no partial credit**),
`blocked_on`, `evidence`, `notes`.

**Two rules with teeth.** A condition is `fail` until its evidence exists —
fail-closed. And `state: "pass"` with `evidence: null` is rejected: a passed gate
without proof is the same lie as a shipped card without one.

**Titles quote their source verbatim and are never edited to record progress.**
Doneness lives in `state`, `evidence` and `notes`.

---

## `rulings[]` — recorded decisions, which are not work

A ruling records a decision somebody took. **It has no acceptance line, so
nothing can ever finish it.** That is why it is a section and not a card: on the
board this template came from, fifteen owner rulings sat in the IN FLIGHT lane
reading `todo` for three weeks, counted as open work that nobody could build.

### The test for whether something belongs here

> **A card with a machine-checkable acceptance is WORK, not a ruling.**

A test on the **content**, never on the id. A decision that mandated a validator
function is work — the function exists or it does not. A decision that some other
card exists to consume is a ruling: what proves it is the state of that other
card.

| field | required | what it is |
|---|---|---|
| `id` | yes | Unique across `cards[]` **and** `rulings[]`. One namespace; the validator refuses an id in both. |
| `ruling` | yes | **The decision, in the words it was taken in.** Quote verbatim where the person who ruled it wrote it down. This is the only field that *is* the ruling. |
| `date` | yes | ISO 8601. When it was ruled. |
| `ruled_by` | yes | Who ruled it. |
| `superseded_by` | yes | `null`, or the id of the ruling that replaced this one. The key must be present even when it is null. |
| `governs` | yes | Non-empty array of the cards or files it binds. Card ids, file paths, or prose where no single id covers it. |
| `title` | no | The decision as a scannable one-line headline. |
| `notes` | no | The full record: why it exists, what it resolves, what it explicitly does **not** change. |
| `external_agenda` | no | Exactly `true`, or absent. Means what it means on a card. |

### The fields a ruling may NOT carry

`status`, `gate`, `evidence`, `acceptance`, `lane`, `home_lane`, `blocked_on`,
`card_kind`, `spec`, `deferred`, `open_on_purpose`, `priority`,
`owner_terminal`, `last_checkpoint`.

**A ruling is not done or not done.** A `status` on one can only be a lie, and
`evidence` would invite somebody to "close" it. The validator **rejects** them
rather than ignoring them, because a silently-dropped field lets the old state
back in through a hand edit.

### Supersession, not editing

A ruling is **never deleted and never edited** to record that it stopped
applying. A later ruling supersedes it, `superseded_by` names that ruling, and
the chain stays readable. The portal shows a superseded ruling struck through and
dimmed — shown, never hidden, because the chain is the only record of *why* a
decision stopped applying.

### They are in no count

Rulings are excluded from every card total, the way `external_agenda` cards
already are. The validator prints them on their own line, the renderer prints
them on their own line, and the portal gives them their own view.

---

## `cards[]` — the work

### Required

| field | what it is |
|---|---|
| `id` | Unique across the board and against `rulings[]`. |
| `title` | Non-empty, plain language. **State the outcome, not the task**: what is true when this card is done. |
| `lane` | **DERIVED, never hand-set.** See below. |
| `home_lane` | The card's KIND: `in_flight` \| `rodica_batch` \| `incidents` \| `loose_ends`. The only lane fact a human sets. |
| `status` | `todo` \| `in_flight` \| `halted` \| `blocked` \| `shipped`. |
| `priority` | `high` \| `medium` \| `low`. |
| `owner_terminal` | Which terminal or person owns the card. |
| `gate` | `green_self_merge` \| `cyan_clear` \| `owner_merge` \| `owner_authorizo` \| `stakeholder`. **The enum is fixed**; say in `doctrine` what each means on your project. |
| `blocked_on` | `null`, one of this board's people columns, or `infra`. |
| `last_checkpoint` | ISO 8601. When the executor last updated this card. Answer latency in the people lane is `now - last_checkpoint`. |
| `evidence` | `null`, or `{ kind, ref, at }`. |
| `notes` | The card's own record: what was decided and **why**, what was tried, what is deliberately not being done. **This is where the reasoning lives, so a fresh reader needs no chat history.** |

`evidence.kind` is one of `pr` \| `journal` \| `sha256` \| `e2e` \| `screenshot`.
`ref` is written so a stranger can re-verify it **without asking anyone**. `at`
is ISO 8601.

### Lane is DERIVED

```
lane(card) =
  status = shipped                                       -> shipped
  home_lane = in_flight AND status = blocked
                       AND blocked_on is a person        -> blocked_on_people
  otherwise                                              -> home_lane
```

The validator computes this and **fails the build if the stored `lane`
disagrees**. Marking a card done moves it to Shipped; naming a person on a
blocked work item moves it under that person; clearing the blocker moves it back.
A card can never sit in a lane its own status contradicts. Incidents and inbox
items keep their kind while blocked — they are categories, not states.

### The rules the validator will not bend

- `status: "shipped"` requires non-null `evidence`. **No exceptions.**
- `status: "blocked"` requires a non-null `blocked_on` — name who you wait on.
- A card in `blocked_on_people` needs a **person**, not `infra`.
- Card and ruling ids are unique, in one shared namespace.
- Cards never live in the `launch_gate` lane.

### Optional card fields

| field | what it is |
|---|---|
| `open_on_purpose` | A non-empty **reason** why this card stays open after its evidence exists — typically because a person still has to observe it on a deployed screen. The reconciler prints every one of these in full on every run: an exemption nobody sees is an exemption nobody revisits. A bare `true` is rejected, because the *why* is the only part a later reader can act on. |
| `deferred` | A non-empty string recording that the owner ruled this **not to be built yet**, saying who ruled it and when. A **field**, not a sentence in `notes`, so an automated sweep can see it — a deferral matched out of prose stops matching the day somebody rewords it, and it fails **open**, so the sweep builds the thing the owner deferred. A shipped card may not carry it. |
| `external_agenda` | Exactly `true`, or absent — never `false`. Marks work tracked on somebody's own agenda: the card stays in the JSON (the ledger is the point) but leaves the rendered board **and every count on it**. |
| `card_kind` | `"loop"`. Declares this card carries a full loop spec. **Declared, never inferred** from the presence of `spec` — inferring it would fail open on exactly the case the rule exists for. |
| `spec` | The seven-section Loop Package, each a non-empty string, plus an optional eighth `briefing`. Only valid with `card_kind: "loop"`. A loop card at `in_flight` or `shipped` missing any of the seven is rejected: **a loop without its spec must not be startable.** |

---

## What runs against a board, and in what order

| script | question it answers |
|---|---|
| `validate-board.mjs <board>` | Is this board **well-formed**? Exit 0 or a printed list of every violation. Read-only, zero dependencies. **This script is the board's definition of done.** |
| `reconcile-board.mjs <board>` | Is this board **true**? Compares cards against merged PRs and against the gate they claim to close, and reconciles the rulings separately. Exits **2**, never 0, if it could not ask. |
| `render-board.mjs <board> [out]` | Produce the artifact. Refuses to render a board that is not green. |

Validate before you render. A red validator must block the render, and it does.

---

## Two things this schema will not let you do, and why

**You cannot mark a card done without proof.** Not in the JSON, not in the
portal, not through the export. The evidence rule is the one rule with no
exceptions, because a board of unproven claims is worse than no board: it is
confidently wrong in the direction everybody wants to believe.

**You cannot record a decision as a task.** That is what `rulings[]` is for, and
why a ruling refuses a `status` field rather than merely omitting one.
