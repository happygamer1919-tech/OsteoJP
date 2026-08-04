# TASK: bring the client-portal board to feature parity with the platform board's interactive portal

> **How to read this document.** Every em dash in it sits inside a quoted string copied verbatim from the codebase. Those quotes are load-bearing: the strings are shipped UI copy and changing them breaks the byte-parity constraint in §6. Nothing you newly write (config values, commit messages, PR summary, `BOARD-SPEC.md` amendment, `PORTAL-REHYDRATE.md` update, code comments) may contain an em dash. Use periods, commas, colons or parentheses.

## 1. What you are being asked to do

The platform board (`docs/board/prelaunch-board.json`) renders to a fully interactive five-view portal via `docs/board/render-board.mjs` + `docs/board/board-app.js` + `docs/board/board.css`. The client-portal board (`docs/board/portal-board.json`) currently renders to a static page via `docs/board/render-portal-board.mjs`: 0 buttons, 0 inputs, 0 draggable elements, 2 of 19 interactive capabilities present. Your job is to make the client-portal board render to the same interactive portal, with the same five views, the same interaction model, the same state and export model, and the same design system, WITHOUT changing the behaviour of the platform board by even one pixel. The platform board is a live surface the owner uses daily. It must survive this untouched.

"Untouched" is defined precisely in §6 and is machine-verified, not eyeballed. Read §6 before you plan, because it constrains the design: the platform board's `#board-data` island must stay byte-identical, its renderer stdout must stay string-identical, and the CONFIG derived from `prelaunch-board.json` must deep-equal today's hardcoded literals.

---

## 2. DO THIS FIRST: audit and capture the baseline, do not rewrite

Do not write a line of implementation code until you have read these files in full and captured the baseline. Absolute paths:

**Reference implementation (the target, do not degrade it):**
1. `/Users/ivan/Documents/Projects/GitHub/OsteoJP/docs/board/board-app.js` (1244 lines, the client runtime)
2. `/Users/ivan/Documents/Projects/GitHub/OsteoJP/docs/board/board.css` (598 lines, the design system)
3. `/Users/ivan/Documents/Projects/GitHub/OsteoJP/docs/board/render-board.mjs` (106 lines, the interactive renderer)
4. `/Users/ivan/Documents/Projects/GitHub/OsteoJP/docs/board/validate-board.mjs` (the executable definition of done)
5. `/Users/ivan/Documents/Projects/GitHub/OsteoJP/docs/board/BOARD-SPEC.md` (governing doctrine)
6. `/Users/ivan/Documents/Projects/GitHub/OsteoJP/docs/board/prelaunch-board.json` (the platform board data)

**The existing attempt (yours to replace or repoint, not to defend):**
7. `/Users/ivan/Documents/Projects/GitHub/OsteoJP/docs/board/render-portal-board.mjs`
8. `/Users/ivan/Documents/Projects/GitHub/OsteoJP/docs/board/portal-board.json`
9. `/Users/ivan/Documents/Projects/GitHub/OsteoJP/docs/board/portal-board-render.html`
10. `/Users/ivan/Documents/Projects/GitHub/OsteoJP/docs/board/PORTAL-REHYDRATE.md`

### 2.1 Capture the baseline BEFORE any edit. This is a deliverable, not a preamble.

There is **no committed reference render**. `docs/board/prelaunch-board.rendered.html` is gitignored (`.gitignore:55`, confirmed by `git check-ignore`) and absent from `git ls-files`. Any fingerprint quoted in a handoff document, this prompt included, is a value observed on somebody's untracked local file on some past day. Do not trust it, do not compare against it, do not treat the untracked file on disk as authoritative. Capture your own.

Write the baseline into your session scratchpad directory (not the repo, not `/tmp`):

```
SCRATCH=<your scratchpad dir>/board-parity
mkdir -p "$SCRATCH/baseline"
cp docs/board/board-app.js docs/board/board.css docs/board/render-board.mjs "$SCRATCH/baseline/"
node docs/board/render-board.mjs docs/board/prelaunch-board.json "$SCRATCH/baseline/prelaunch.rendered.html" > "$SCRATCH/baseline/render-stdout.txt"
grep '^<script type="application/json" id="board-data">' "$SCRATCH/baseline/prelaunch.rendered.html" | shasum -a 256 > "$SCRATCH/baseline/island.sha256"
node docs/board/validate-board.mjs > "$SCRATCH/baseline/validate-prelaunch.txt"
node docs/board/validate-board.mjs docs/board/portal-board.json > "$SCRATCH/baseline/validate-portal.txt"
```

Render to an explicit out path so you do not disturb the untracked file already on disk. Record, from your own capture and not from this prompt: the fingerprint, the card count, the gate count, the per-lane tally, and the island sha256, for both boards. Card and gate counts move as the owner works, so any figure written here (49 cards / 8 of 9 gates on the platform board, 18 cards / 1 of 9 on the portal board) is indicative only. Yours is the truth.

### 2.2 Produce a GAP TABLE, with a census, and report it before writing code

| Capability | Platform board (board-app.js) | Portal board (current) | Action |
|---|---|---|---|

One row per capability, minimum these **19 rows**: Focus view, Board view with lanes, Launch gate view, List view (sortable), Timeline view, drag and drop, card drawer, create/edit modal, filters (status/who/priority), search, stat-tile filtering, undo (Ctrl/Cmd+Z), toasts, export + diff vs seed + handoff brief, localStorage persistence, evidence-gated ship prompt, keyboard shortcuts, staleness / newer-board notice, `<noscript>` fallback. Cite the `board-app.js` line ranges that implement each on the platform side.

Alongside the table, report:

- **(a) Your own hardcode census.** Run `grep -n` yourself for each site listed in §5.1 and §5.2, against the live files, and report the actual line numbers and match counts. The line numbers in this prompt were correct when it was written and are a starting point, not a source. Where your grep disagrees with this prompt, your grep wins and you say so.
- **(b) The captured baseline** from §2.1: fingerprint, island sha256, counts, per-lane tally, for both boards.
- **(c) The parity assertion you plan to write**, named field by field: exactly which CONFIG fields the Node assertion in §6.2 will deep-equal against today's literals.

**Stop and report all three before coding.** If anything is ambiguous, ask, once, per §9's "confirm, do not guess" item.

---

## 3. The reference implementation, in full

Everything in this section is what parity means. Treat it as the acceptance spec. Where a behaviour looks like a bug but is marked **intended-frozen**, do not fix it: fixing it changes the platform board.

### 3.1 The five views

`render()` (board-app.js:601-612) does ONE `innerHTML` write into `#app`:

```
document.getElementById("app").innerHTML = cmdbarHTML() + seedNoticeHTML() + cockpitHTML() + main + footerHTML();
```

Then `persistUi()`, then `renderDrawer()` if `drawerId` is set. **Every state change re-renders the whole page.** Cockpit, seed notice and footer render in all five views. The filter row renders in Focus, Board, List, Timeline, and NOT in Launch gate.

**The source set for Focus, Board and Timeline is `visibleCards()` (board-app.js:262):** `(board.cards || []).filter(matches)`.

**`matches(c)` (253-261)** is where the who-filter meets the people set, and it is a site you must repoint:

```js
if (ui.fStatus.length && ui.fStatus.indexOf(c.status) < 0) return false;
if (ui.fWho.length && ui.fWho.indexOf(c.blocked_on || "none") < 0) return false;   // note the "none" sentinel
if (ui.fPrio.length && ui.fPrio.indexOf(c.priority || "medium") < 0) return false;
var q = ui.q.trim().toLowerCase();
if (!q) return true;
return [c.id, c.title, c.notes, c.owner_terminal, (c.evidence || {}).ref]
  .filter(Boolean).join(" ").toLowerCase().indexOf(q) >= 0;
```

Search is a lowercased substring match over exactly those five fields joined by spaces. It does not search `blocked_on`, `gate`, `status` or `last_checkpoint`. Keep that.

**`filtersActive()` (270)** is `!!(ui.q.trim() || ui.fStatus.length || ui.fWho.length || ui.fPrio.length)`. Two things branch on it: the Board view's empty-lane message, and whether the `Clear filters` chip renders at all. Note it includes the query, which is not part of the filter row.

**`.card.hit`** is declared in `board.css:364` (`border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-soft)`) but **`board-app.js` never emits the `hit` class**. Search matches therefore get no ring today. That is dead CSS. Leave it dead: adding the ring is a visible change to the platform board and belongs in a separate ticket.

**Focus (`focusHTML`, 412-449)** is the default view (`ui.view = "focus"`). Five `<section class="focusgroup">` blocks, each `<h3>Label<span class="n">count</span></h3>` + `<div class="fbody">`. Shared sort comparator: `daysSince(b.last_checkpoint) - daysSince(a.last_checkpoint)`, most stale first.

| Group | Selection | Sort | Empty state |
|---|---|---|---|
| Your move (count = `onIvan.length + gatesIvan.length`) | `status==="blocked" && blocked_on===OWNER`, plus gate conditions with `state!=="pass" && blocked_on===OWNER` | stale desc | "No card is waiting on you." |
| Waiting on others | `status==="blocked" && blocked_on ∈ (people minus OWNER, plus "infra")` | stale desc | "Nobody else is holding anything up." |
| Moving now | `status==="in_flight"` | stale desc | "Nothing is in flight." |
| Next up | `status==="todo"` | stale desc | "Nothing queued." |
| Recently shipped | `status==="shipped"` | `String(b.last_checkpoint).localeCompare(String(a.last_checkpoint))`, a STRING compare, not a date compare, then `.slice(0,6)` | "Nothing shipped yet." |

Empty states are `<p class="lede">`. Your-move carries a permanent lede: "Everything that cannot move until you personally act. Launch-gate conditions sit here too, because those are the ones holding the launch."

Gate pseudo-cards (425-434) render BEFORE the card list as `<article class="card s-blocked" tabindex="0">`, deliberately with **no `draggable` and no `data-card`** so drag cannot pick them up. Row 1: gate id in `.cid`, `tag("st-blocked","Launch gate")`, `<span class="stale">` with the person name. Row 2: `evidenceBit(g.evidence)` plus `Mark pass` (`data-act="gate-toggle"`, class `iconbtn go`) and `Open` (`data-act="gate-edit"`).

**Board (`laneHTML`, 314-344)** is `filtersHTML() + '<div class="lanes">' + ALL_LANES.map(laneHTML).join("") + "</div>"`. Six lanes in fixed order: blocked_on_people, in_flight, rodica_batch, incidents, loose_ends, shipped. `launch_gate` is NOT a lane here.

The grid is part of the spec, not an accident (board.css:308-334):

```css
.lanes { display: grid; gap: 12px; align-items: start; grid-template-columns: repeat(auto-fit, minmax(268px, 1fr)); }
.lane[data-lane="shipped"] { grid-column: 1 / -1; }
.lane[data-lane="shipped"] > .lb { display: grid; gap: 9px; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); align-items: start; }
```

Shipped is the only special-cased lane: it spans the full width as a band under the working lanes. Note `auto-fit` on the outer container versus `auto-fill` inside the shipped body, at the same 268px minimum. `auto-fit` collapses empty tracks so few lanes stretch to fill; `auto-fill` keeps the track rhythm so a short shipped list does not produce one giant card. Same minimum in both, so a shipped card is exactly as wide as a working card. Intended-frozen.

Each lane is `<section class="lane" data-lane="…">` with `<div class="lh">` = `.rail` + `.t` label + `.c` count (of filtered cards), then `<div class="lb">`.

Sorting inside a lane (`cardsInLane`, 263-269): primary `PRIO.indexOf(priority||"medium")` ascending, tiebreak `String(b.last_checkpoint).localeCompare(String(a.last_checkpoint))`.

`blocked_on_people` is sub-grouped by person (321-331): `<div class="subhead ivan|jp|…">Name · N</div>` then that person's cards, iterating the people set in order. A person with zero cards emits nothing. All-empty message: "Nobody owes an answer right now."

Shipped collapses (319-324). When `!ui.shippedOpen` the body is a single `<button class="addcard" data-act="shipped-toggle">Show N shipped</button>`, but the `<section data-lane="shipped">` still exists so it **still accepts drops while collapsed**. Expanded, the trailing button reads `Hide shipped`.

Every non-shipped lane ends with `<button class="addcard" data-act="add" data-lane="{lane}">+ Add here</button>`.

Empty state on non-people lanes: "Nothing here matches the filter." when `filtersActive()`, else "Empty."

**Launch gate (`gateViewHTML`, 452-471)**: `<h2 class="section">Launch gate · {passed} of {denominator} cleared</h2>`, then `<div class="gategrid">` of `<article class="gaterow pass|fail">`, one per condition in JSON order, not filtered, not sorted. Row content: `.g1` = `<span class="gid">` + `whoTag(blocked_on)` + `<button class="gstate" data-act="gate-toggle" title="Toggle pass / fail">PASS|FAIL</button>`; then `.gtitle`; then `evidenceBit`; then, if notes exist, `<div class="gnotes clip?">` plus, **only when `notes.length > 220`**, a `<button class="gmore" data-act="gate-notes">` toggling "Read the full note" / "Show less"; then `<button class="btn btn-sm" data-act="gate-edit">Edit condition</button>`.

**Empty state: none.** Zero conditions yields an empty `.gategrid` with the heading still reading `Launch gate · 0 of 9 cleared`. There is no "nothing here" text and none is to be added. Intended-frozen.

**List (`listHTML`, 497-514)**: `filtersHTML()` + `<h2 class="section">All cards · {n}</h2>` + `.tablewrap > table.board`. Columns in order: ID, Title, Status, Lane, Waiting on, Gate, Checkpoint, Evidence. The first seven are sortable `<th data-act="sort" data-k="id|title|status|lane|who|gate|checkpoint">`; **Evidence is not sortable**. Active header appends `<span class="arrow">▲</span>` / `▼`. Sort values: `id`, `title`, `String(STATUS_ORDER.indexOf(status))`, `laneOf(c)`, `blocked_on||""`, `gate`, default `last_checkpoint||""`, all compared as strings. Default sort `{key:"checkpoint", dir:-1}`. The whole `<tr>` carries `data-act="open" data-id="…"`.

**Empty state: none.** An empty result set renders the eight headers over an empty `<tbody>`, with the heading reading `All cards · 0`. Intended-frozen.

**Timeline (`timelineHTML`, 517-535)**: groups `visibleCards()` by `dateOnly(last_checkpoint)` with bucket key `"unknown"` for missing. Days sorted `Object.keys(byDay).sort().reverse()`. Within a day, `STATUS_ORDER.indexOf(b.status) - STATUS_ORDER.indexOf(a.status)` (descending: shipped, halted, blocked, in_flight, todo). Markup `<div class="tl-day">` → `<div class="tl-date">2026-08-04<span class="rel">today</span></div>` (`relDay`: "today" / "yesterday" / "N days ago"), then `.tl-items` of `<div class="tl-item s-{status}" data-act="open" data-id="…">` with `.tl-dot`, `.tl-id`, `.tl-t`.

- Non-empty heading: `<h2 class="section">Timeline · every card by its last checkpoint</h2>`.
- Empty: `<h2 class="section">Timeline</h2><p class="lede">Nothing matches.</p>`. Different heading. Both are required.
- **The `"unknown"` bucket sorts FIRST, above today**, because the keys are sorted ascending then reversed and `"u" > "2"`. An implementer reading "newest first" will call this a bug and fix it. Do not. **Intended-frozen.** Changing it changes the platform board's Timeline the moment any card loses its checkpoint.

### 3.2 Every control

**Command bar (`cmdbarHTML`, 538-552)**: brandmark `<span class="brandmark"><i></i>…</span>` (static); view switcher of 5 `<button data-act="view" data-v="…" aria-pressed>`; search `<div class="searchwrap"><input id="q" type="search" placeholder="Search cards, notes, evidence…"><span class="hint">/</span></div>`; save chip `<button class="savechip dirty?" data-act="export">` reading "{n} local change(s)" or "matches the repo"; `Undo` button with `disabled` when `undoStack.length === 0`; `+ New`; `Export` (primary).

**Cockpit (`cockpitHTML`, 353-386)**: four stat tiles, each `<button class="stat {cls}" data-act="stat" data-key="…" aria-pressed>` with `.k` label, `.v` number, `.m` meta. They ARE filters:

| key | cls | value | label | meta |
|---|---|---|---|---|
| `shipped` | ok | count shipped | Shipped | "{n} of {total} cards" |
| `in_flight` | go | count in_flight | In flight | "being executed" |
| `blocked` | stop | count blocked | Blocked | "waiting on someone" |
| `mine` | todo | count blocked && blocked_on===OWNER | On you | "nothing waiting" if 0, else "your move" |

Handler (1172-1182): the three status tiles set `ui.fStatus=[key]` (or `[]` if already sole) AND clear `ui.fWho`; `mine` sets `ui.fWho=[OWNER]` AND clears `ui.fStatus`. Mutually exclusive single-select, distinct from the multi-select chips.

Gate card (377-385): `<div class="gatecard [complete]">`, header `<span class="lbl">Launch gate</span>` + `<span class="read"><b>{passed}</b> / {denom}</span>`, then `.pips` of one `<button class="[pass]" data-act="gate-toggle" data-gid="G1" title="G1 · {title}">G1</button>` per condition (live toggles, not decoration), then a `<p class="note">` explaining that the denominator is counted not estimated and listing the open conditions with their blocker, or "All nine cleared."

**Filter row (`filtersHTML`, 393-405)**: `<button class="chip" data-act="{act}" data-v="{val}" aria-pressed>Label<span class="n">{count}</span></button>`. Counts are over ALL cards, not the filtered set. Five status chips (`f-status`), `<span class="sep"></span>`, one who chip per person plus `infra` (`f-who`), `<span class="sep"></span>`, one priority chip (`f-prio`, value `"high"`, label "High priority", medium and low have no chip). When `filtersActive()`, a trailing `<button class="btn btn-sm ghost push" data-act="clear-filters">Clear filters</button>` which also clears `ui.q`. All three chip families are multi-select toggles.

**Card (`cardHTML`, 293-312)**: `<article class="card s-{status}" draggable="true" data-card="{id}" tabindex="0">`. Row 1: `.cid` · status tag · priority tag **only when `priority !== "medium"`** · `staleBit`. Row 2: `gateTag` · `whoTag` · `evidenceBit` · `<span class="qa">` with exactly two buttons: `Reopen` if shipped else `Done` (`iconbtn go`, title "Mark done - asks for the evidence the repo validator requires"), plus `Open`.

`staleBit` (286-291): shipped shows the date; others show `{n}d` with class `stale bad` at >=14 days, `stale warn` at >=7. `evidenceBit` (276-285): "no evidence yet" in `<span class="ev none">` when null; else a kind prefix ("PR ", "journal ", "sha ", "e2e ", "shot "), suppressed when the ref already starts with that word, ref truncated to 34 chars with trailing dashes/spaces stripped plus `…`, `title` = full ref, `· YYYY-MM-DD` suffix.

**Three ways to add a card**: `+ New` in the cmdbar (kind `in_flight`), `+ Add here` per lane (handler maps `blocked_on_people` → `in_flight` because that is not a kind), and key `n`.

**Footer (`footerHTML`, 553-560)**: two mono spans (snapshot date; source path, readiness, `keys / n e u 1-5`) plus `<button class="btn btn-sm ghost" data-act="reset">Discard local changes</button>`.

**Seed notice (`seedNoticeHTML`, 586-599)**: `<div class="notice"><span class="dot"></span>` plus message plus `Load the new board` (`take-seed`) and `Keep mine` (`dismiss-notice`).

### 3.3 Interaction model

**Drag and drop (1075-1122)**, delegated at document level. Draggable: `.card[data-card]` only. Drop targets: `.lane[data-lane]`, which exist only in Board. Hover sets `.drop` on exactly one lane. Dropping on the card's current lane is a silent no-op. **The drop rewrites the truth, not the position:**

| Target lane | Mutation |
|---|---|
| `shipped` | delegates to `shipCard(id)`, which opens the evidence modal if there is no `evidence.ref`; the move happens only if evidence is supplied |
| `blocked_on_people` | `home_lane="in_flight"`, `status="blocked"`, and if `blocked_on` is not a person it defaults to OWNER |
| any kind lane | `home_lane=lane`; if `status==="shipped"` → `"in_flight"`; else if `status==="blocked" && lane==="in_flight" && blocked_on ∈ PEOPLE` → `"in_flight"` |

Non-ship paths set `last_checkpoint = today()` and go through `mutate("Moved {id} to {laneLabel[lane]}", …)`, so they are undoable and toasted. That toast is one of the label read sites in §5.1 and it is NOT CSS-uppercased.

**Card drawer (`renderDrawer`, 840-888)**: a `.drawer-scrim` appended to `<body>`, closed by mousedown on the scrim or Escape, re-rendered on every `render()` while `drawerId` is set, auto-closing if the card no longer exists. Header `.sub` = "{id} · {kindLabel[homeOf(c)]}", `<h3>` title, `<button class="xbtn" data-act="drawer-close">×</button>`. Four segmented controls (`.segrow`, every button `aria-pressed`):

| Segment | Legend | Buttons | act |
|---|---|---|---|
| Status | "Status — this moves the card by itself" | 5 from `STATUS_ORDER` | `set-status` |
| Waiting on | "Waiting on" | people + `infra` + `null` rendered as "Nobody" | `set-who` |
| Kind | "Kind" | 4 from `KIND_LANES` | `set-home` |
| Priority | "Priority" | 3 from `PRIO` | `set-prio` |

Under Status, a live derivation readout: "Now in <b>{laneLabel[laneOf(c)]}</b> — {laneHint[laneOf(c)]}." Then a read-only `<dl class="kv">`: Evidence, Merge gate, Terminal, Checkpoint. Then a `.notesblock` only when `c.notes` is truthy. Footer: `Mark done` (or `Reopen`) · `Edit fields` · spacer · `Delete` (`btn danger`).

Side effects (1149-1167): `set-status` with `"shipped"` routes to `shipCard`; setting `blocked` with no `blocked_on` auto-assigns OWNER; `set-who` clearing the person while `status==="blocked"` flips status to `in_flight`; `set-status` and `set-who` set `last_checkpoint = today()`, `set-home` and `set-prio` do not.

So `status`, `blocked_on`, `home_lane`, `priority` are drawer-editable; `id`, `title`, `gate`, `owner_terminal`, `last_checkpoint`, `evidence`, `notes` need the Edit modal.

**Modals (`openModal` 626-642)**: `.scrim > .modal[.wide][role=dialog][aria-modal=true]`, head with `<h3>` + optional `.subh` + `.xbtn`, a hidden `.modal-note` error strip, body, optional `.modal-foot`. Closes on scrim mousedown or Escape. Auto-focuses the first `input,select,textarea`.

- **Create/Edit card (`openCardModal`, 709-757)**, `wide`. Fields in order: `f-id` (ID), `f-home` (Kind select), `f-title` (full width), `f-status`, `f-who`, `f-prio`, `f-gate`, `f-owner` (placeholder from config, currently "green / cyan / ivan"), `f-cp` (`type="date"`), evidence trio `f-k`/`f-r`/`f-a` with the hint "A shipped card and a passed condition MUST carry evidence — the one rule the repo validator will not bend.", `f-notes` (textarea, full). New-card defaults: `id: suggestId()` = first free `"NEW-{n}"`, `status:"todo"`, `gate` and `owner_terminal` from config, `last_checkpoint: today()`, `priority:"medium"`. Validation messages, each aborting via `modalNote`: "The card needs an ID." / 'The ID "X" is already used by another card.' / "The card needs a title." / "A shipped card needs evidence. Add the reference, or set the status back." / "A blocked card must name who or what it waits on." On success it sets `next.lane = laneOf(next)` and opens the drawer for the new card.
- **Gate edit (`openGateModal`, 759-795)**, `wide`, title "Launch condition {id}", subtitle "go / no-go". The id input is `disabled`. Save blocks on "A passed condition needs evidence — that is what makes readiness counted rather than claimed." Note the comment at 773-774: read every field BEFORE calling `mutate()`, because the re-render detaches the nodes.
- **Ship with proof (`shipCard`, 679-700)**: silent if `evidence.ref` exists. Otherwise a modal "Mark {id} as done" / "evidence required" whose body is the prose "A card cannot be shipped without proof — a PR number, a journal entry, a hash, a passing test run or a screenshot. The repo validator rejects a shipped card with no evidence, so the board asks for it here rather than letting you record something it will refuse." Prefilled `{kind:"pr", at: today()}`. Error: "Add the evidence reference (the PR number, for example) before marking this done."
- **Gate toggle (`toggleGate`, 797-814)**: pass → fail is immediate and does NOT clear evidence. fail → pass with existing evidence is immediate. Otherwise a modal "Clear {gid}?" / "evidence required" prefilled `{kind:"screenshot", at: today()}`, primary button `Mark PASS`, error "Name the proof: an attestation, a screenshot reference, a hash."
- **Delete (`confirmDelete`, 816-832)** and **Reset (`confirmReset`, 1056-1072)**: reset removes `STORAGE_KEY`, re-seeds from `SEED`, resets `basedOnFingerprint`, empties `undoStack`, and is itself NOT undoable.

**Undo (199-218)**: `mutate(label, fn)` pushes `{label, snap: clone(board)}` BEFORE applying, caps the stack at 30, then `commit(label)` = `syncDerived()` → `writeSnapshot()` → `render()` → `toast(label, true)`. `undo()` restores and toasts "Undid: {label}" without an undo button. Reachable from the cmdbar button, the button inside every mutation toast, key `u`, and Ctrl/Cmd+Z. `undoStack` is memory-only.

**Toasts (615-623)**: `.toasts` host lazily appended to `<body>`; 5200 ms with undo, 2600 ms without; no manual dismiss.

**Keyboard (1221-1237)**: `Ctrl/Cmd+Z` works even while typing; `Escape` closes modal, else drawer, else clears `#q`; `/` focuses search; `n` new card; `e` export; `u` undo; `1`-`5` switch views.

**Search (1211-1219)**: on `input`, capture `selectionStart`, set `ui.q`, full re-render, then re-`getElementById("q")`, refocus, `setSelectionRange(pos,pos)`. That caret restoration is what makes a full-innerHTML rewrite survivable. Keep it.

### 3.4 State model

```js
var SEED = JSON.parse(document.getElementById("board-data").textContent);   // line 27
var PORTAL_GEN  = "p2";
var STORAGE_KEY = "osteojp-board:" + (SEED.board || "board") + ":v" + (SEED.schema_version || 1) + ":" + PORTAL_GEN;
var UI_KEY      = STORAGE_KEY + ":ui";
```

`STORAGE_KEY` is **already board-scoped**, so the two boards cannot collide in localStorage. That is one blocker you do not have.

Board key persists `clone(board)` plus `payload.__basedOn = basedOnFingerprint`; `__basedOn` is stripped on load and never appears in Export (it describes provenance, not content). UI key persists exactly `{view, fStatus, fWho, fPrio, sort, shippedOpen}`. Not persisted: `ui.q`, `ui.openGateNotes`, `undoStack`, `seedNoticeDismissed`, `drawerId`, `modal`, `dragId`. Every localStorage access is wrapped in try/catch so a storage-denied browser degrades to session-only. Boot: `loadUi(); board = load(); render();`

**`SEED` is immutable; `board` is not.** This distinction becomes safety-critical once anything is configured off the data, and §5.1 turns it into a hard rule: the board key persists `clone(board)` including `lanes`, so a viewer holding a stale snapshot carries a second, mutable copy of `lanes[blocked_on_people].columns`. Reading the people set off `board` would let a stale snapshot silently redefine `PEOPLE` and therefore `deriveLane`, and the in-browser `validate()` would start disagreeing with `validate-board.mjs` on the same file.

`normalize(b)` defaults `priority` to `"medium"` and forces `c.home_lane = homeOf(c)`, `c.lane = laneOf(c)`. `syncDerived()` recomputes every `c.lane` AND `launch_gate.readiness_passed`. Both are outputs, never inputs.

**Staleness (`seedIsNewer`, 576-585)**: if `SEED.fingerprint` is absent, fall back to `SEED.as_of > board.as_of`; otherwise `basedOnFingerprint !== SEED.fingerprint`. A snapshot with no `__basedOn` is treated as stale by design. The docblock at 562-575 records why: on 2026-07-31 four republishes all carried `as_of: "2026-07-31"`, so the date comparison never fired and the owner sat on a snapshot showing nothing shipped while main had 30 shipped. `take-seed` adopts `basedOnFingerprint = SEED.fingerprint` (or the notice reappears immediately) and clears `undoStack`. `dismiss-notice` is in-memory only.

**Diff (`diffVsSeed`, 221-250)** compares the live board against the immutable `SEED` on `title`, `status`, `home_lane`, `gate`, `blocked_on`, `priority`, `notes`, `owner_terminal`, `last_checkpoint`, plus `evidence` as a whole via `JSON.stringify`. `lane` is deliberately not diffed because it is derived. Gates diff on `state`, `evidence`, `notes` and report only `{id, from, to}`.

### 3.5 Export

Opened by the `Export` button, the save chip, or `e`. `wide`, three body sections:

1. **"What changed"**: `<ul class="checklist">` of `<li class="info">` per changed card, added id, removed id, gate flip. Zero changes: "Nothing has been changed in this browser — the board still matches the committed JSON."
2. **"Validator · N issue(s)"**: output of the in-browser `validate(board)`. Clean → one `<li class="ok"><b>VALID</b><span>Passes every rule the repo validator enforces — safe to paste back.</span></li>`. Dirty → one `<li class="warn">` per violation.
3. **"board JSON"**: `<textarea class="codebox" id="x-json" readonly>` plus a hint naming the target path and the validate command.

Footer: `Close` · `Copy change brief` · spacer · `Download .json` · `Copy JSON` (primary). `copyText(json)` runs unconditionally on open, so the JSON is on the clipboard before you click.

`exportJSON` (938-943): `syncDerived()`, `clone(board)`, `out.as_of = today()`, `JSON.stringify(out, null, 2)`.

`handoffBrief()` (944-983) emits Markdown with `## Changed` / `## Added` / `## Removed` / `## Launch gate` sections. Field rules: `notes` collapses to "notes edited"; `evidence` renders "evidence set to {kind} {ref}" or "evidence cleared"; everything else "{field}: {from} -> {to}" with null shown as `none`. No-change case: "No local changes: the board matches the committed JSON."

`saveFile` (996-1017) prefers `window.claude.downloads.save({filename, data})`, treats error code `"declined"` as silent, `"unavailable"` → "Download unavailable here — copied instead", anything else → "Download failed — copied instead", both falling back to `copyText`; without the runtime API it builds a `Blob` and clicks a synthetic `<a download>`.

**The validate command is emitted in two places and it is a config field, not an interpolation.** `board-app.js:1041` (the export hint) and `:981` (the brief footer) both say "run `node docs/board/validate-board.mjs`" with **no path argument**, which on the portal board would validate the wrong file. Do not fix this by interpolating `sourcePath` into the string: that changes the platform board's bytes. Add an explicit `validateCommand` CONFIG field, pinned to `"node docs/board/validate-board.mjs"` for the platform board and `"node docs/board/validate-board.mjs docs/board/portal-board.json"` for the portal board. Same treatment for the surrounding sentence if any other word would have to change.

### 3.6 Design system

Read `board.css` and honour it. Do not redesign. The load-bearing decisions:

- **Neutral is green-biased, not grey**, so it sits under the OsteoJP teal without going cold. Six surface steps (`--paper`, `--paper-2`, `--card`, `--card-2`, `--line`, `--line-2`), three ink steps (`--ink`, `--ink-2`, `--ink-3`).
- **ONE accent (teal) carries structure, focus and primary action**: `--brand`, `--brand-soft`, `--brand-ink`.
- **The brand magenta `--gate` is RESERVED for the launch gate alone.** Only `.gatecard` and `.pips` reference it. The gate is a different axis from delivery work (nine human/prod conditions, not a percentage of build), and its own colour is what stops the two meters reading as one. Do not spend magenta anywhere else.
- **Semantic state is a separate scale**: `--ok` / `--go` / `--stop` / `--hold` / `--todo`, each with a `-soft` tint. `--ok #12866a` is deliberately not `--brand #1e7a6b`: close teals, different axes.
- **Per-person colours** `--ivan`, `--jp`, `--rodica`, `--infra`. Three are aliases of semantic colours, which is why they read as one system. See §5.1 for the hard rule a new person id imposes.
- **Every datum is monospace with tabular figures; prose is system-ui. That split is the whole typographic idea.** `--mono` and `--sans` are tuned system stacks because the CSP blocks font hosts and a linked webfont fails silently.
- **State is never colour-only.** Every `.tag.st-*` carries the status word, `.gstate` is a text button, `.stat` pairs `.k`/`.v`/`.m`, lane rails sit beside a text `.t`. Enforce this in anything you add.
- **Selected state is read from `[aria-pressed="true"]`, not an `.active` class**, so the visual state cannot drift from the announced state.
- Radii `--r-sm 7px` / `--r-md 10px` / `--r-lg 14px` / `--r-xl 18px` (modal only). Shadows: `--shadow-1` resting, `--shadow-2` card hover, `--shadow-3` overlays. Light shadows are green-black `rgba(13,40,34,…)`, not neutral.
- `.card` uses `border-left: 3px solid var(--bd, var(--ink-3))` and variants set only `--bd`, so an unknown status degrades to grey instead of vanishing. `.gaterow` uses the same trick with `--gc` defaulting to `--stop`, i.e. fail is the default.
- Breakpoints, complete: `max-width:900px` cockpit → 1 col; `max-width:620px` modal body → 1 col; `max-width:560px` stats → 2 cols; `hover:none` makes `.card .qa` permanently visible; the dark media query; `prefers-reduced-motion: reduce` zeroing durations (not `animation:none`, so end states survive).
- z-index: 40 cmdbar, 60 drawer scrim, 70 modal scrim, 90 toasts. Toasts above modals deliberately.
- `:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }` is global and nothing overrides it. There is no `outline: none` anywhere in the file. Keep it that way.

**Theming, two mechanisms, both required.** `:root` declares light plus `color-scheme: light dark`. `@media (prefers-color-scheme: dark) :root` overrides colour and shadow tokens. Then `:root[data-theme="dark"]` AND `:root[data-theme="light"]` restate both complete palettes, because the artifact viewer's toggle stamps `data-theme` on the root and the attribute (specificity 0,1,1) must beat the media query (0,1,0) in BOTH directions. The light restatement is what makes system-dark → toggle-light work.

**Two known dark-mode defects. DO NOT FIX THEM IN THIS TICKET.**

1. `color-scheme: light dark` is only on `:root` and never restated per `[data-theme]`, so scrollbars, native `<select>` popups and date pickers follow the OS, not the toggle.
2. Hard-coded `#fff` on light dark-mode swatches: `.btn.primary` on dark `--brand #45b9a7`, the five `.segrow.status button[aria-pressed="true"]` fills, and `.pips button.pass` for system-dark viewers who never touched the toggle (the `#170a12` patch at board.css:286 is scoped to `:root[data-theme="dark"]` only).

Both are real and both should eventually be replaced with a theme-driven ink token. Both are also **visible changes to the platform board's dark mode**, which contradicts §1 and the §6.3 expectation that CSS deltas are exactly the generalisation and nothing else. Fixing them here would make the byte diff unreviewable, because a reviewer could no longer tell an intended generalisation from an unrelated colour edit. So: **scope them out.** Add them to the portal board (or the platform board, owner's call) as a new card in the same PR's summary, titled something like "dark-mode ink token replaces hard-coded #fff", with these exact five sites listed. Do not open a second front inside a byte-parity ticket. Your only CSS change in this ticket is the additive per-person token work in §5.1.

---

## 4. The data contract

### 4.1 Top-level JSON

`board` (string, validator-enforced against `BOARD_NAMES`), `schema_version`, `phase`, `as_of`, `renders_to`, `doctrine`, `lanes` (enforced), `launch_gate` (enforced), `cards` (enforced). Unknown top-level keys are ignored. **There is no `fingerprint` key and it must never be added**: it is derived at render time and a stored hash of a file containing itself is self-referential.

### 4.2 Lanes

`lanes[].id` must deep-equal, in this order, no additions, no omissions, no reordering:
`launch_gate`, `blocked_on_people`, `in_flight`, `rodica_batch`, `incidents`, `loose_ends`, `shipped`.

Lane ids are identical on both boards **including `rodica_batch`**, which the portal board titles "STAKEHOLDER FEEDBACK". The title is display text; the id is structure.

`columns` on the `blocked_on_people` lane is the one structurally load-bearing optional field: it defines that board's people set and is read before any card is checked. Absent or empty → the historical `["ivan","jp","rodica"]`.

**Verified fact you must not re-litigate: `prelaunch-board.json` DOES carry `lanes[blocked_on_people].columns = ["ivan","jp","rodica"]`,** and `portal-board.json` carries `["ivan","jp","lawyer"]`. Both live boards therefore take the JSON path. The `["ivan","jp","rodica"]` fallback is exercised by neither. See §6.5: the fallback is not what preserves the platform board, so do not reason as though it were, and test it with a synthetic fixture rather than assuming the platform render covers it.

**Lane titles as committed** (read them yourself, do not trust this table alone):

| lane id | prelaunch title | portal title |
|---|---|---|
| `launch_gate` | LAUNCH GATE | LAUNCH GATE |
| `blocked_on_people` | BLOCKED ON PEOPLE | BLOCKED ON PEOPLE |
| `in_flight` | IN FLIGHT | IN FLIGHT |
| `rodica_batch` | RODICA BATCH | STAKEHOLDER FEEDBACK |
| `incidents` | INCIDENTS | INCIDENTS |
| `loose_ends` | LOOSE ENDS | LOOSE ENDS |
| `shipped` | SHIPPED | SHIPPED |

These are shouty. `LANE_LABEL` in `board-app.js:38-45` is sentence case ("Blocked on people", "In flight", "Rodica inbox", "Incidents", "Loose ends", "Shipped"). They are different registers and the app's is not derivable from the JSON's. §5.1 resolves this. `lane.note` is a full sentence and is not a usable source for anything.

### 4.3 Card object, 12 keys

`id`, `title`, `lane`, `home_lane`, `status`, `priority`, `owner_terminal`, `gate`, `evidence`, `blocked_on`, `last_checkpoint`, `notes`. `owner_terminal` and `notes` are not validated at all. `evidence` and `blocked_on` are read as `?? null`, so an omitted key is `null` rather than a violation; the others are not coalesced.

### 4.4 Every enum

- **Status**: `todo` | `in_flight` | `halted` | `blocked` | `shipped`. Note `board-app.js`'s `STATUS_ORDER` is `["todo","in_flight","blocked","halted","shipped"]`, a different ORDER from the validator's `STATUS`. Same set, so validation agrees, but the client order is load-bearing for List sorting and Timeline intra-day ordering. Treat it as UI ordering, not a copy of the validator enum.
- **Kinds / `home_lane`** (`KIND_LANES`): `in_flight` | `rodica_batch` | `incidents` | `loose_ends`. `shipped` and `blocked_on_people` are STATES, never a home.
- **Priority**: `high` | `medium` | `low`, default `medium`. `PRIO` doubles as a sort order.
- **People**: per board, from `lanes[blocked_on_people].columns`. Pre-launch `ivan`/`jp`/`rodica`; portal `ivan`/`jp`/`lawyer`.
- **`blocked_on`**: `null` | that board's people | `infra`.
- **Gates**, exactly five and NOT extended per board: `green_self_merge` | `cyan_clear` | `owner_merge` | `owner_authorizo` | `stakeholder`. There is no `purple_self_merge`. `green_self_merge` means **executor-terminal self-merge**, and the executor is GREEN on the pre-launch board, PURPLE on the portal board. Each board declares that mapping in its own `doctrine`.
- **Evidence kinds**: `pr` | `journal` | `sha256` | `e2e` | `screenshot`.
- **Gate states**: `pass` | `fail`. Two values, by design, no partial credit.
- **`LAUNCH_GATE_DENOMINATOR = 9`**, and `conditions.length` must be 9, on both boards.
- ISO form: `/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/`, and it must also `Date.parse` to a real date. A timestamp with a time component but no zone offset is rejected.

### 4.5 The lane DERIVATION rule

Lane is a function of the card, never a field a human sets. Two independent implementations must agree, and the validator fails the build when the stored `lane` disagrees.

```js
function deriveLane(card) {
  if (card.status === "shipped") return "shipped";
  const home = KIND_LANES.includes(card.home_lane) ? card.home_lane : "in_flight";
  if (home === "in_flight" && card.status === "blocked" && PEOPLE.includes(card.blocked_on)) {
    return "blocked_on_people";
  }
  return home;
}
```

In order: shipped wins unconditionally (a shipped incident is in Shipped, not Incidents); otherwise `home` is `home_lane` if it is a kind lane else `in_flight`; then only `in_flight` WORK blocked on a PERSON routes to the people lane. Incidents, `rodica_batch` items and loose ends **keep their kind while blocked**, because they are categories, not states. A card blocked on `infra` never enters `blocked_on_people`. Because `PEOPLE` is board-relative, `blocked_on: "lawyer"` routes to `blocked_on_people` on the portal board and is an invalid value on the pre-launch board.

`board-app.js`'s `homeOf` has one extra tolerance the validator lacks (falls back to `c.lane` if that is a kind lane). Harmless; keep it or drop it, but do not let the two derivations disagree on well-formed input.

### 4.6 The evidence doctrine

Two symmetric halves, and the single non-negotiable rule:

- A card may not enter `status=shipped` with `evidence=null`. No exceptions.
- A launch-gate condition may not be `state=pass` with `evidence=null`.

"A board claim is never truth on its own. A card that says 'shipped' with no evidence is not shipped; it is a lie the validator rejects." Enforced in three places: `validate-board.mjs` (exit 1), the renderer (`RENDER BLOCKED - board is not green:` then exit 1, checked before any file is read or written, so a red board leaves the previous artifact untouched), and the portal UI (the ship prompt and the gate-pass prompt). "The portal never records a state the repo would reject."

"Has evidence" means WELL-FORMED evidence: a `checkEvidence` failure on `kind`, `ref` or `at` makes `hasEvidence` false, so a malformed evidence object on a shipped card fires both the field violations and the shipped-without-evidence violation.

**RECEIPT vs ATTESTATION.** This is project doctrine carried in the boards' own notes, NOT in BOARD-SPEC.md, and it is NOT enforced by the validator, which treats all five kinds alike.

- **ATTESTATION**: a person's word, recorded with who attested and when. Written as `owner-attested <date>: …` in `evidence.ref`, typically `kind: "screenshot"`. A legitimate close, but the grade must be LABELLED so a later reader does not mistake a claim for a record.
- **RECEIPT**: an independently checkable machine record. A merged PR number, the sha256 of a read-only prod script plus its output, an e2e run, a Twilio message SID with delivery timestamp, a `__drizzle_migrations` count delta.

From G2's notes, verbatim: "If the Twilio message SID or the delivery timestamp is to hand, appending it here would turn an attestation into a receipt - not required to close, but it is the difference between a claim and a record."

Evidence can be **retracted**. `LE-marcacoes-tab-edit-flake` went from `shipped` back to `todo` with evidence CLEARED, because the receipt attached was real but insufficient: "leaving the receipt attached would let the next reader think the question is settled." Evidence certifies a property; when the property stops being true, the evidence is stale and the state goes backwards.

Do not build UI that hides this distinction. The evidence `ref` string is where the grade is carried, so never truncate it in a way that loses the `owner-attested` prefix (the existing `evidenceBit` keeps the full string in `title`, which is the right pattern).

---

## 5. The approach you must take

**Generalise `board-app.js` behind an injected CONFIG object. Do not fork it. Do not bolt views onto `render-portal-board.mjs`.**

`render-portal-board.mjs`'s own header states the coupling, verbatim:

> Why this is a SECOND renderer and not an argument to render-board.mjs: that script inlines board-app.js, the interactive five-view portal, which hardcodes the Ivan/JP/Rodica people set, the "Pre-Launch" brandmark and the prelaunch-board.json export path in a dozen places. Repointing it at the portal board would mean rewriting the platform board's live app, which is a behaviour change to a working surface for no gain here. This file emits a STATIC page instead: no state, no localStorage, no export, nothing to drift. If the portal board ever needs the interactive views, generalise board-app.js deliberately - do not bolt it on here.

That diagnosis is correct and the count is fair (roughly 15 hardcode sites). The conclusion is now obsolete, because the portal board DOES need the interactive views. Note the last sentence: "generalise board-app.js deliberately - do not bolt it on here." Do exactly that.

Three facts that make this smaller than the comment implies:
1. `board-app.js` never reads `board.lanes` at all. Zero hits for `board.lanes`, `SEED.lanes` or `.columns`. So there is no existing lane-reading code to untangle, only constants to source.
2. **The identical generalisation was already done next door, in about six lines.** `validate-board.mjs:128-139` reads the people set off `blocked_on_people.columns` with a documented fallback that "keeps the pre-launch board's behaviour byte-for-byte unchanged". Copy that pattern and that fallback discipline.
3. `STORAGE_KEY` is already board-scoped, so the two boards already cannot collide in localStorage.

Forking 1243 lines guarantees drift: two copies of `deriveLane`, two copies of the evidence gate, two copies of the diff engine, and the first bug fixed in one and not the other is a board that lies. One app, one config.

### 5.0 Where CONFIG lives, how it reaches the page, and what may never derive it

Four rules, all mandatory. They exist so the parity check in §6.2 is possible at all.

1. **All derivation happens in Node, in a new sibling module `docs/board/board-config.mjs`.** It exports `BOARD_CONFIGS` (the per-board literal blocks, keyed on `board.board`) and `deriveConfig(board)` (merges the JSON-sourced fields over the per-board block and returns a plain object). It has zero dependencies and no side effects, so a test can import it without rendering anything. `render-board.mjs` imports it. The parity script imports it. This is a new local file, not a new third-party dependency.
2. **The renderer injects the result as a SEPARATE data island.** Emit `<script type="application/json" id="board-config">` with the same `\u003c` escaping as the board island. `#board-data` stays **exactly** `JSON.stringify({ ...board, fingerprint })` and nothing else. Merging CONFIG into the board island would change its bytes (breaking §6.2's hash check) and would put non-board keys into `SEED`, which `diffVsSeed` and `exportJSON` would then round-trip into the committed JSON. A `var BOARD_CONFIG = {...};` prelude emitted immediately before the `board-app.js` script block is the acceptable alternative; merging into `#board-data` is not.
3. **`board-app.js` reads CONFIG once at boot, from `#board-config`, and freezes it.** If the island is absent it falls back to ONE documented frozen object literal holding today's pre-launch values, commented in the style of `validate-board.mjs:48-54`. That literal is the only place in `board-app.js` where the strings `"ivan"`, `"rodica"`, `"Pre-Launch"` or `"prelaunch-board.json"` may appear.
4. **CONFIG is derived from `SEED`, never from `board`, and never re-derived.** The JSON-sourced fields (`people`, `denominator`, `boardName`) are computed by `deriveConfig` in Node from the board file, and in the fallback path only from `SEED`. `take-seed`, `undo`, `reset` and every `mutate()` must leave CONFIG untouched. Rationale in §3.4: the persisted snapshot carries a mutable copy of `lanes`, and a stale snapshot must never be able to redefine the people set, `deriveLane`, or the in-browser `validate()`.

**Watch the `</script>` hazard while you are in the renderer.** `render-board.mjs:52-53` interpolates `board.css` and `board-app.js` **verbatim**; only the data island gets the `\u003c` treatment. Any new string you add to `board-app.js` (or to a config literal inside it) that contains the sequence `</script>` silently terminates the script block and breaks the entire page with no error at render time. You are editing exactly that file.

### 5.1 Exactly what must become configuration

Two sources, and the difference matters. A field is JSON-sourced only when the JSON already carries the fact in a usable form. Everything else is a pinned per-board literal in `board-config.mjs`.

**JSON-sourced (computed by `deriveConfig(board)` in Node, from the board file):**

| CONFIG field | Source | Fallback |
|---|---|---|
| `people` | `lanes.find(l => l.id === "blocked_on_people").columns`, when a non-empty array | the per-board block's `people`, else `["ivan","jp","rodica"]` |
| `denominator` | `launch_gate.denominator` | `9` |
| `boardName` | `board` | `"board"` |

**NOT JSON-sourced. Pinned per board in `board-config.mjs`.** Lane titles in the JSON are shouty ("BLOCKED ON PEOPLE", "IN FLIGHT", "RODICA BATCH") while `LANE_LABEL` is sentence case ("Blocked on people", "In flight", "Rodica inbox"). Sourcing `laneLabels` from `lanes[].title` would rewrite visible platform copy in three places. Sourcing display names from ids would turn `jp` into "Jp". So:

| CONFIG field | Pre-launch value (pin to today's literal, byte for byte) | Portal value |
|---|---|---|
| `owner` (the "you" in "Your move" and "On you") | `"ivan"` | `"ivan"` |
| `whoLabels` | `{ivan:"Ivan", jp:"JP", rodica:"Rodica", infra:"Infra"}` | `{ivan:"Ivan", jp:"JP", lawyer:"Lawyer", infra:"Infra"}` |
| `laneLabels` | `{blocked_on_people:"Blocked on people", in_flight:"In flight", rodica_batch:"Rodica inbox", incidents:"Incidents", loose_ends:"Loose ends", shipped:"Shipped"}` | same, except `rodica_batch:"Stakeholder feedback"` |
| `laneHints` | `{blocked_on_people:"someone owes an answer", in_flight:"being executed now", rodica_batch:"fresh reports land here", incidents:"live problems", loose_ends:"tracked, not batched", shipped:"done, with proof"}` | same, except `rodica_batch:"stakeholder answers land here"` |
| `kindLabels` | `{in_flight:"Work item", rodica_batch:"Rodica inbox", incidents:"Incident", loose_ends:"Loose end"}` | same, except `rodica_batch:"Stakeholder note"` |
| `brandmark` | `"OsteoJP · Pre-Launch"` | `"OsteoJP · Portal"` (default, see §9) |
| `footerLabel` | `"osteojp · pre-launch portal"` | `"osteojp · portal board"` (default, see §9) |
| `briefTitle` | `"Made in the Pre-Launch Portal"` | `"Made in the Portal Board"` (default, see §9) |
| `pageTitle` (the `<title>`) | `"OsteoJP · Pre-Launch Portal"` | `"OsteoJP · Portal Board"` |
| `sourcePath` | `"docs/board/prelaunch-board.json"` | `"docs/board/portal-board.json"` |
| `exportFilename` | `"prelaunch-board.json"` | `"portal-board.json"` |
| `validateCommand` | `"node docs/board/validate-board.mjs"` | `"node docs/board/validate-board.mjs docs/board/portal-board.json"` |
| `ownerTerminalDefault` | `"green"` | `"purple"` (confirm, see §9) |
| `ownerTerminalPlaceholder` | `"green / cyan / ivan"` | `"purple / ivan"` (confirm, see §9) |
| `newIdPrefix` | `"NEW-"` | `"NEW-"` |

`whoOrder` is derived inside the app as `[null, ...people, "infra"]`, and `WHO` is `whoLabels`. Title-casing an id is permitted only as a last-resort fallback for an id the map omits, never as the primary mechanism, because `jp` title-cases to "Jp".

**Where the labels are read, and which reads are CSS-uppercased.** `laneLabels` has five read sites in `board-app.js`:

| Line | Site | CSS-uppercased? |
|---|---|---|
| 321 | collapsed Shipped lane header (`.lane > .lh .t`) | YES, `board.css:318` `text-transform: uppercase` |
| 337 | lane header (`.lane > .lh .t`) | YES, same rule |
| 503 | List view Lane cell (`<td>`) | NO |
| 859 | drawer derivation readout ("Now in <b>X</b> — hint.") | NO |
| 1079 | the drag-drop move toast ("Moved {id} to {label}") | NO |

So a sentence-case label displays as "STAKEHOLDER FEEDBACK" in the lane header and as "Stakeholder feedback" in the List cell, the drawer and the toast. That asymmetry is existing behaviour, it is intended, and pinning sentence-case values is what preserves it. `kindLabels` is read at 719 (Kind select), 851 (drawer subtitle), 866 (Kind segmented control) and 969 (handoff brief); none are uppercased, so `"Rodica inbox"` as a *kind* label is what makes the drawer read "PL-11 · Rodica inbox" today, and the portal must not inherit that word.

**Every hardcoded site that must be repointed at CONFIG.** Verify each line number yourself per §2.2(a):

- People set, 11 sites: 70 (`WHO` display-name map), 71 (`WHO_ORDER`, the `blocked_on` domain), 72 (`PEOPLE`, the single most load-bearing literal), 134 (lane derivation), 326 (people-lane sub-grouping and column order), 358 (the "On you" tile), 369 (that tile's pressed state), 399 (a SECOND independent copy of the set for the filter chips, with `infra` appended), 417-419 (the Focus "Your move" vs "Waiting on others" split, cards AND gates), 934 (in-browser validation), and 1083 / 1154 / 1174 where `"ivan"` is the implicit default assignee in three separate mutation paths.
- Lane and kind vocabulary: 38-45 (`LANE_LABEL`), 46-53 (`LANE_HINT`), 54-59 (`KIND_LABEL`). All three become CONFIG maps. The lane IDs stay `rodica_batch` on both boards; only the display strings differ.
- Brandmark and copy: 1 (file header comment), 541 (brandmark), 555-557 (footer, including `sourcePath`), 951 (brief header), 981 (brief footer: `sourcePath` + `validateCommand`), 1041 (export hint: `sourcePath` + `validateCommand`), 1053 (download filename).
- The denominator, 8 sites: 359, 363, 453, 469, 557 all use `lg.denominator || 9`; **382-383 spell the word "Nine" and "All nine cleared." in prose**; 904-905 are HARD EQUALITY (`if (lg.denominator !== 9)`) not a fallback. Keep 9 as the constant since the spec pins it on both boards, but source it from one named place and derive the prose from it via a number-word map, so "Nine go/no-go conditions" and "All nine cleared." stay byte-identical on the platform board.
- `PORTAL_GEN` `"p2"` (32) and the `"osteojp-board:"` storage prefix (33).
- Behavioural constants worth naming rather than leaving inline: stale thresholds 14 / 7 days (289), evidence-ref truncation 34 chars (283), gate-note clip 220 chars (464), undo cap 30 (207), toast lifetimes 5200 / 2600 ms (622), "Copied" flash 1400 ms (985), object-URL revoke 800 ms (1015), Focus "Recently shipped" cap 6 (423). Naming them must not change their values.

**Person ids couple directly to CSS class names. This is a rule, not a note about `lawyer`.** `whoTag` emits `class="tag who {id}"` and the people-lane subhead emits `class="subhead {id}"`, so every value in a board's `columns` lands raw in a class attribute and as a `whoLabels` key. Therefore:

- Ids must be lowercase `[a-z0-9_-]` only. No spaces, no capitals, no dots.
- Every id in any board's `columns` needs a `--{id}` token declared in **all four theme blocks** (light `:root`, the dark media query, `:root[data-theme="dark"]`, `:root[data-theme="light"]`), plus a `.tag.who.{id} { color: var(--{id}) }` rule and a `.lane .subhead.{id} { color: var(--{id}) }` rule. Today `board.css` has `.who.{ivan,jp,rodica,infra}` (388-392) and `.subhead.{ivan,jp,rodica}` (339-341). There is no `.subhead.infra` because `infra` is never a people column.
- Missing any of these renders that person unstyled and uncoloured, silently.
- For `lawyer`, pick a hue that is not already spent: `--ivan` aliases `--go` (blue), `--jp` aliases `--hold` (purple), `--rodica` aliases `--stop` (red), `--infra` is a unique green-grey, `--brand` and `--ok` are teal, `--todo` is amber-brown. `--gate` magenta is reserved and may not be reused. Proposed default: light `#b4551f`, dark `#e79a63` (burnt orange). Compute and report the contrast ratio against `--card` in both themes; it must clear 4.5:1, and it must be visibly separable from `--stop` and `--todo`. If it is not, pick another and report why.
- These CSS additions are purely additive (new tokens and new selectors). They must not modify any existing declaration, so the platform board's rendered pixels are unchanged.

### 5.2 Renderer strategy

**(A) Make `render-board.mjs` board-agnostic. This is the choice. Implement it unless you find a blocking reason, in which case stop and report rather than switching silently.**

`render-board.mjs` takes its per-board config from `deriveConfig(board)` (§5.0), keyed on `board.board`. An unknown board name is a hard error with a clear message, not a silent fallback to pre-launch config.

**The renderer's own hardcodes, in full.** Strategy (A) means every one of these is repointed at CONFIG or at argv:

| Line | Site |
|---|---|
| 2-3 | header comment naming "Pre-Launch Board" and `docs/board/prelaunch-board.json` |
| 21 | usage line naming both default paths |
| 33 | `const boardPath = resolve(process.argv[2] ?? \`${HERE}/prelaunch-board.json\`)` |
| 34 | `const outPath = resolve(process.argv[3] ?? \`${HERE}/prelaunch-board.rendered.html\`)` |
| 79 | `<title>OsteoJP · Pre-Launch Portal</title>` |
| 89 | the `<noscript>` sentence, which names `docs/board/prelaunch-board.json` |

The defaults at 33/34 must keep resolving to the pre-launch pair when no argv is given, so every existing invocation and every muscle-memory command keeps working. The `<title>` comes from `pageTitle` and the `<noscript>` path from `sourcePath`. Do not leave the `<noscript>` naming the wrong file on the portal board: it is the one thing a JS-disabled reader sees.

**Alternative (B), for the record only**: keep two renderers, both inlining the same generalised `board-app.js` and `board.css`, differing only in the injected CONFIG. Smaller blast radius on the platform board's render path, more files, and a second place for drift to start. Reject it unless (A) proves impossible, and say so if you do.

**Emitted document shape, unchanged in order, with exactly one addition:** `<meta charset>`, `<title>`, `<meta viewport>`, `<meta color-scheme>`, `<style>` with all of `board.css`, `<div class="wrap" id="app">` containing only the `<noscript>` fallback, `<script type="application/json" id="board-data">` (the island, `<` escaped to `\u003c`), **`<script type="application/json" id="board-config">` (new)**, `<script>` with all of `board-app.js`. The mount point matters: `board-app.js:609` writes into `getElementById("app")`, and the current `render-portal-board.mjs:236` emits `<div class="wrap">` pre-filled with static HTML. That is the only structural mismatch on the portal side.

The fingerprint is `createHash("sha256").update(JSON.stringify(board)).digest("hex").slice(0,16)`, computed at render time from the re-serialized parsed object (so reformatting the JSON does not change it, but key order and any value change does). It goes into the board island as `{...board, fingerprint}`. Never into the JSON. **It must not include the config**: the fingerprint answers "did the board data change", and folding config into it would fire the staleness notice on every viewer the first time you change a label.

**Output paths, `.gitignore`, and the fate of the two tracked files.** Do not pick one quietly. The default you implement, and which the owner can veto in one line:

- Portal board output: `docs/board/portal-board.rendered.html`, matching the platform board's `<name>.rendered.html` convention.
- `.gitignore` gains `docs/board/portal-board.rendered.html` beside the existing entry at line 55, under a comment naming its renderer, matching the existing style.
- `docs/board/portal-board-render.html` (currently TRACKED, confirmed by `git ls-files`) is removed from tracking, because it is the same class of build product as the gitignored platform render and §9.6's stated doctrine says a render is a build product.
- `docs/board/render-portal-board.mjs` (currently TRACKED) is deleted, because strategy (A) retires it and leaving a second renderer that nothing runs is exactly the drift the one-app rule exists to prevent.

**Both deletions are owner-confirmable under the standing rules, so stage them as ONE separate final commit** on the branch, titled `chore(board): retire the static portal renderer`, containing only the two file removals and the `.gitignore` delta plus the `BOARD-SPEC.md` line that records why. Do not squash it into the functional commits. Name it as its own line item in the PR summary, with the one-sentence alternative (keep the render tracked, per `PORTAL-REHYDRATE.md:159-163`'s "regenerate the render in the SAME commit" argument) so the owner can drop that commit and keep everything else. Do not delete anything before the functional work is green.

### 5.3 What the existing attempt did WELL. Preserve what actually transfers.

- **Determinism.** `render-portal-board.mjs` reads no clock server-side. That property must survive, and in the interactive renderer it already does, for a stronger reason: **`render-board.mjs` computes nothing time-derived into the HTML at all.** The `#app` div is empty, and the gate counts at :74-76 go to stdout only. Every date on screen is computed in the browser.
- **The two-stage latency does NOT transfer.** `render-portal-board.mjs` computes `daysBetween(card.last_checkpoint, as_of)` at build time and upgrades it to wall clock with an inline IIFE at :272-281. That is the correct answer to a real tension in a *static* page. The interactive app has no such tension: it already measures staleness from the browser clock (`daysSince`, `relDay`, `staleBit` at the 14 / 7 day thresholds) and renders nothing server-side to be stale. There is no server-computed latency to preserve, and adding one would be a new feature on a frozen surface. **Do not port `daysBetween(as_of)` and do not add an `as_of`-relative latency to the interactive renderer.**
- **The render-time lie guard (lines 42-52)**, identical text to `render-board.mjs:38-49`. Keep it in the surviving renderer.
- **The fingerprint computed exactly as `render-board.mjs:71` does, not reinvented**, with the inline comment explaining why it is not stored.
- **The theme handling reasoning.** The three-block specificity argument is correct and it is already implemented, better, in `board.css:21-141`. **`board.css`'s token system is the survivor.** The inline CSS in `render-portal-board.mjs` retires with the file.
- **Contrast discipline as a principle, not as a value.** `#2F7E72` belongs to `render-portal-board.mjs`'s inline stylesheet and **must not enter `board.css`**. `board.css` already solves the same problem with tokens: `--brand` is `#1e7a6b` in light and `#45b9a7` in dark, and `--brand-ink` exists precisely so brand-tinted surfaces have a legal text colour. Adding a raw hex to a token-only system breaks theming silently, which is the rule stated in §7. Carry the discipline, drop the literal.
- **XSS-safe by construction**: every interpolation goes through `esc()`, and the island escapes `<`.
- **The JSON content itself is the strongest asset in the whole attempt.** The card and gate `notes` cite file paths, PR numbers and grep hit counts, and they distinguish "NOT BUILT" from "PARTIAL, which is fail". `PW-01`'s note openly labels its eight cards **derived, not transcribed** and marks the ids provisional. **Do not touch that content.** Fix data problems only where flagged below.

### 5.4 Two data problems in `portal-board.json` to raise, not silently fix

1. **The BLOCKED ON PEOPLE lane is empty.** All 7 `status: "blocked"` cards are `blocked_on: "ivan"` but carry `home_lane: "loose_ends"`, so `deriveLane` correctly leaves them in `loose_ends`. The lane the board exists to show Ivan renders three empty columns. This is a data question (are those loose ends, or blocked in-flight work?), not a code bug. Report it, propose the `home_lane` change, do not apply it unilaterally.
2. **Every `last_checkpoint` equals `as_of`**, so every `staleBit` reads `0d` and every relative date reads `today`. The staleness feature is vacuous until real checkpoints exist. Report it.

The copy bug at `render-portal-board.mjs:131` ("Answer latency is now minus last_checkpoint", the `-` lost from `now - last_checkpoint`) disappears with the file under strategy (A). If the owner vetoes the deletion commit, fix the string in that commit instead. Either way, say which happened.

---

## 6. Regression safety: the platform board must not change

This is the hard constraint. It is verified by a script that exits non-zero, not by looking at the page. "It still looks fine" is not evidence and neither is "I read the diff".

### 6.1 The gate script

Write `parity-check.mjs` into your scratchpad directory (not the repo). It imports `deriveConfig` from `docs/board/board-config.mjs`, runs the checks below, prints one line per check, and exits 1 on the first failure. Run it after every change, and paste its output into the PR summary.

### 6.2 The four checks, all mandatory

**(a) The board island is byte-identical.** Re-render the platform board to a scratch path, extract the single line beginning `<script type="application/json" id="board-data">`, sha256 it, and compare **exactly** against `$SCRATCH/baseline/island.sha256`. Any difference means the board data or the fingerprint moved and the ticket is not parity-safe.

**(b) The renderer's stdout is string-identical.** Compare the three printed lines against the baseline capture, after stripping the ` -> <outPath>` suffix from the first line (it necessarily differs when you render to a scratch path). The `fingerprint:` line and the `lanes:` line must match as exact strings.

**(c) The derived CONFIG deep-equals today's literals.** `deriveConfig(JSON.parse(readFileSync("docs/board/prelaunch-board.json")))` must `assert.deepStrictEqual` against a hardcoded expected object inside the check script, holding: `people` `["ivan","jp","rodica"]`, `whoLabels`, `whoOrder`, `laneLabels`, `laneHints`, `kindLabels`, `denominator` `9`, `owner`, `brandmark`, `footerLabel`, `briefTitle`, `pageTitle`, `sourcePath`, `exportFilename`, `validateCommand`, `ownerTerminalDefault`, `ownerTerminalPlaceholder`, `newIdPrefix`. **Without this check nothing but eyeballs proves parity**, because (a) and (b) only cover the data island and the stdout, and every regression this ticket can cause lives in the app's config surface. Write the expected object by copying today's values out of `board-app.js` lines 38-75 and 541/555-557/951/981/1041/1053, not by copying `board-config.mjs`, or the assertion tests nothing.

**(d) Both boards render and validate clean, with asserted counts.** `node docs/board/validate-board.mjs` and `node docs/board/validate-board.mjs docs/board/portal-board.json` both print `BOARD VALID` and exit 0. Both renders exit 0. Assert the card count and the `passed/denominator` gate count for each board against the values you captured in §2.1, not against any number written in this prompt.

### 6.3 The diff you should expect, and nothing else

`board-app.js` and `board.css` are inlined verbatim, so any edit to them changes the rendered bytes. The correct expectation for the platform board's render is:

- The `#board-data` island line and the fingerprint: **unchanged** (check (a)).
- One **added** line: the `#board-config` island. This is an intended, expected delta.
- App and CSS deltas: exactly the generalisation (constants replaced by CONFIG reads) plus the additive per-person CSS from §5.1, and nothing else.
- Zero changes to any visible string on the platform board.

Read the diff line by line against that list. Anything not on the list is a defect, including a "harmless" reformat.

### 6.4 Manual exercise, as a second layer and not as the proof

After the script is green, exercise all five views on the re-rendered platform board in a browser: Focus (five groups, gate pseudo-cards present, correct empty states), Board (six lanes in order, shipped spanning the full width, people lane sub-grouped Ivan/JP/Rodica, shipped collapsed with a count and still accepting drops), Launch gate (9 rows, notes clipping at 220 chars, the `gmore` toggle), List (8 columns, 7 sortable, default checkpoint-desc, whole row opens the drawer), Timeline (grouped by day, newest first, correct intra-day status order). Then: drag a card between lanes, drop one on Shipped and confirm the evidence modal blocks the move, toggle a gate pip, Ctrl/Cmd+Z, open Export and confirm the validator section says VALID and the change brief renders. Repeat the same list on the portal board.

### 6.5 The `PEOPLE` fallback is not the parity mechanism. Test it anyway.

`prelaunch-board.json` carries `lanes[blocked_on_people].columns = ["ivan","jp","rodica"]`, so the JSON-sourced path reproduces the literal exactly and the platform board never touches the fallback. Do not conclude the fallback is what keeps the platform board identical: check (c) is. Still test the fallback explicitly, with a synthetic fixture in your scratchpad (a copy of the board JSON with `columns` deleted, and a second with `columns: []`), asserting `deriveConfig` returns the historical trio in both cases.

### 6.6 Storage generation

**If the localStorage shape changes in any way, bump `PORTAL_GEN` from `"p2"` to `"p3"`.** That constant exists for exactly this: it was introduced after a stale 16-card snapshot overrode a fresh 31-card seed. Injecting a CONFIG object does not by itself change the persisted shape (the board key holds `clone(board)` plus `__basedOn`, the UI key holds six named fields), so think before bumping: a needless bump discards every viewer's local edits. Bump if and only if the persisted shape actually changed, and state the reason either way.

**Do not change `STORAGE_KEY`'s formula.** It is already board-scoped and the two boards already cannot collide.

---

## 7. Artifact publishing constraints

- **Zero external requests.** The artifact CSP blocks CDNs and font hosts, and it fails SILENTLY, which is why the rule exists. Never emit `<link rel=stylesheet>` or `<script src>`. No webfont, no remote image. All CSS and JS inlined by the renderer.
- **The document is a FRAGMENT.** No `<!doctype>`, no `<html>`, no `<head>`, no `<body>`. The publish step wraps it. Both current renderers already comply.
- **Theme-aware in both directions.** `<meta name="color-scheme" content="light dark">` plus `:root { color-scheme: light dark }` plus all four token blocks (light `:root`, dark media query, `[data-theme="dark"]`, `[data-theme="light"]`). Any new token, including `--lawyer`, goes in all four.
- **Tokens only, no raw hex in components.** Adding an inline hex breaks theming silently. See §5.3 on `#2F7E72`.
- **Republish to the SAME artifact URL.** BOARD-SPEC.md:191 verbatim: "Update the existing artifact in place (`url=` param); never mint a new URL." Pass the existing URL as the `url` parameter. Publishing from a conversation that did not create it, with only `file_path`, mints a NEW URL and orphans the owner's link.
  - Pre-Launch Board: `https://claude.ai/code/artifact/83e26fe7-034c-4fb8-b45b-b1165a843d6d`
  - Portal Board: `https://claude.ai/code/artifact/279ea20f-0b64-4abc-9e64-676803f7740a`
- **Title stability.** The `<title>` names the tab and the gallery entry and must not drift. There is a drift already recorded: the committed handoff calls the pre-launch artifact "OsteoJP · Pre-Launch Board" while `render-board.mjs:79` emits "OsteoJP · Pre-Launch Portal". **The renderer wins**, because byte parity forbids changing it: pin `pageTitle` to "OsteoJP · Pre-Launch Portal" and correct the handoff record instead, in the same PR, in one line. The portal board keeps "OsteoJP · Portal Board", which is what its current static render already emits, so its published tab name does not move either.
- **Favicon stability.** Pre-Launch Board is 📋 and that is part of its identity. No favicon is recorded anywhere for the Portal Board. Default: 🌐, distinct from 📋 so the two tabs are distinguishable. Write it into `PORTAL-REHYDRATE.md` next to the URL in this PR, or it will drift between sessions. Listed in §9 so the owner can override it in one word.
- **Responsiveness.** `body { overflow-x: hidden }`, wide content scrolls in its own container (`.tablewrap { overflow-x: auto }`, `min-width: 780px` on `table.board`), `overflow-wrap: anywhere` on ids/titles/notes/evidence, `min-width: 0` on every flex/grid child that can hold long data.
- **Publish order**: validate (exit 0) → re-render → publish → then the PR. "Publish the board before the PR, not after."
- **The artifact is a MIRROR, never a second source.** If the artifact and the JSON disagree, the JSON wins and the artifact is re-rendered. A pasted artifact link is a human render, never read as truth.
- Load the `artifact-design` skill before publishing, but **the render is already designed**. Honour `board.css`, do not redesign it.

---

## 8. Definition of done

- [ ] GAP TABLE (19 rows), the grep census, the captured baseline and the planned CONFIG assertion all produced and reported **before** any implementation code was written.
- [ ] `docs/board/board-config.mjs` exists, exports `BOARD_CONFIGS` and `deriveConfig(board)`, has no side effects and no third-party imports, and is the ONLY committed file holding per-board display literals.
- [ ] `board-app.js` reads its entire configuration from the `#board-config` island (or the `BOARD_CONFIG` prelude), once, at boot, frozen, derived from `SEED` and never from `board`, and never re-derived by `take-seed`, `undo`, `reset` or any `mutate()`.
- [ ] Grep, and show `grep -n` output for each: `"rodica"`, `"ivan"`, `"Pre-Launch"`, `"prelaunch-board.json"`. Each may appear **only** inside `docs/board/board-config.mjs`'s per-board blocks and inside the single documented fallback-config literal in `board-app.js`. Zero occurrences in any derivation, render, mutation or validation path. That is the whole test; "as a behavioural literal" is not a defence.
- [ ] `#board-data` is byte-identical to baseline on the platform board (sha256 shown), and carries exactly `{...board, fingerprint}` on both boards.
- [ ] The portal board renders to a mount point of `<div class="wrap" id="app">` with the interactive app, and all five views work on it: Focus, Board, Launch gate, List, Timeline.
- [ ] The portal board's people lane shows the confirmed people set with the correct display names, and `lawyer` has a `--lawyer` token in all four theme blocks plus `.tag.who.lawyer` and `.lane .subhead.lawyer`, with the measured contrast ratios reported, not a reused semantic hue, and not the reserved `--gate` magenta.
- [ ] Lane display copy: the portal board's `rodica_batch` lane header reads STAKEHOLDER FEEDBACK (CSS-uppercased from "Stakeholder feedback") and its List cell, drawer readout and move toast read "Stakeholder feedback"; the platform board's read RODICA BATCH and "Rodica inbox" exactly as today. The lane ID is `rodica_batch` on both. Kind label on the portal board reads "Stakeholder note", not "Rodica inbox".
- [ ] Drag and drop, drawer, create/edit modal, filters, search, stat-tile filters, undo, toasts, keyboard shortcuts, staleness notice and Export (JSON + validator section + handoff brief + download + copy) all work on the portal board, and Export names the portal's own path, filename and validate command.
- [ ] The in-browser `validate()` agrees with `validate-board.mjs` on both boards, including the board-relative people set. A `lawyer`-blocked card must not be flagged.
- [ ] `node docs/board/validate-board.mjs` prints `BOARD VALID`, exit 0. Same for `docs/board/portal-board.json`.
- [ ] `parity-check.mjs` passes all four checks of §6.2 and its output is pasted into the PR summary.
- [ ] The `PEOPLE` fallback tested against both synthetic fixtures (`columns` absent, `columns: []`), with the result stated, and the fact recorded that neither live board exercises it.
- [ ] Platform board re-rendered and diffed against the pre-change baseline, with the diff matching the expected shape in §6.3 exactly: island unchanged, one added config island line, app/CSS deltas only the generalisation plus the additive person CSS.
- [ ] All five views manually exercised on the re-rendered platform board and on the portal board, plus a drag, a ship-with-evidence block, a gate toggle, an undo and an export on each.
- [ ] `PORTAL_GEN` bumped if and only if the persisted shape changed, with the reason stated either way.
- [ ] The two `portal-board.json` data problems (empty people lane, all checkpoints equal to `as_of`) reported to Ivan with a proposed fix, NOT silently applied.
- [ ] The two dark-mode CSS defects from §3.6 are **not** fixed in this ticket, and are written up as a follow-up card naming all five sites.
- [ ] Output path, `.gitignore` delta and the two file removals implemented as described in §5.2, with the removals isolated in their own final commit and called out in the PR summary as an owner decision the owner can drop.
- [ ] `BOARD-SPEC.md:212` amended: the table currently records `render-portal-board.mjs (static page)` as governing doctrine, and it stops being true. The spec must say so in the same commit, along with the render output paths and the tracking policy.
- [ ] `PORTAL-REHYDRATE.md` updated with the artifact URL, the chosen favicon, the new render command and the new output path.
- [ ] The handoff record of the pre-launch artifact title corrected to match `pageTitle`, per §7.
- [ ] Both artifacts republished to their EXISTING URLs, and the URLs stated in the summary.
- [ ] Nothing newly written contains an em dash. Existing quoted UI copy retains its em dashes byte for byte, because changing it breaks parity.
- [ ] A plain-language PR summary Ivan can review without reading code: what changed, what he should click on each board to verify, and what he must decide.

---

## 9. Rules that are not negotiable

1. **`node docs/board/validate-board.mjs [path]` must print `BOARD VALID` and exit 0 after every JSON edit, on BOTH boards.** A red validator is a red gate and blocks the render. Never edit the JSON and move on without running it.
2. **`lane` is DERIVED, never hand-set.** If you write a `lane` value, it must equal `deriveLane(card)` for that card, and the two implementations (`validate-board.mjs` and `board-app.js`) must agree. Never patch a validator failure by editing the stored `lane` to match a wrong `home_lane`.
3. **No card ships without evidence, and no gate passes without evidence.** Not in the JSON, not in the UI, not "temporarily". The renderer refuses to emit and that refusal must survive your changes.
4. **Republish to the SAME artifact URL** via the `url=` parameter. Never mint a new one.
5. **Commit the JSON.** The committed file is the source of truth. The rendered HTML is a build product. Feature branch, never `main`, named `<area>/<ticket-id>-<short-slug>`. Owner merges.
6. **The tracked-vs-gitignored render inconsistency is resolved deliberately in §5.2, and the reason is written into `BOARD-SPEC.md` in the same commit.** The conflict is real and it is between two committed documents: `docs/handoff/PRELAUNCH-20260730-CLOSE.md:48-49` says "the rendered HTML is gitignored — a build product", while `PORTAL-REHYDRATE.md:159-163` requires "Regenerate the render in the SAME commit", an argument that only makes sense for a tracked file. `prelaunch-board.rendered.html` is gitignored (`.gitignore:55`); `portal-board-render.html` is tracked. Implement the default in §5.2, isolate the removals in their own commit, and flag it in the PR as a governance decision the owner can reverse by dropping that commit.
7. **Never touch the card and gate `notes` content in `portal-board.json`.** It is the highest-value material in the file.
8. **No em dashes in anything you write.** Config values, code comments, commit messages, the PR summary, the `BOARD-SPEC.md` amendment, the `PORTAL-REHYDRATE.md` update. Existing UI copy keeps its em dashes untouched, because those strings are covered by byte parity.
9. **Do not delete or overwrite anything outside your scratchpad without it being one of the two named, isolated removals in §5.2.** Renders go to explicit out paths; baselines and fixtures go to the scratchpad.

### CONFIRM WITH IVAN, DO NOT GUESS. One question, batched.

Ask ONE question containing all of the below, state the assumption you will proceed on if it goes unanswered, and do not stall: build the generalisation, which is board-independent, while the answer is outstanding.

**(i) Which product the client-portal board tracks, and its people set.** `portal-board.json` currently declares `lanes[blocked_on_people].columns = ["ivan","jp","lawyer"]`, `board: "OsteoJP - Portal Board"`, `phase: "portal-build"`, executor terminal PURPLE, and gate conditions `PG1`-`PG9` framed as a portal Definition of Ready. If the board you are being asked to build is that same board, the people set is settled and you proceed. If "client-portal board" means a DIFFERENT product (a patient-facing client portal, a client-facing board for the agency, anything else), then the board name, the people set, `owner_terminal` values and the PG1-PG9 gate conditions are all unconfirmed and you must have an answer before writing the portal's config block.

**(ii) Portal board naming and identity: confirm or override in one line each.** These are product naming on a live, user-visible surface, so they are his call, not yours. Each has a stated default, each is reversible by editing one line of `docs/board/board-config.mjs` and re-rendering, and each is recorded in `PORTAL-REHYDRATE.md` in this PR so it cannot drift between sessions:

| Field | Default | Where it shows |
|---|---|---|
| `brandmark` | "OsteoJP · Portal" | top-left of every view |
| `footerLabel` | "osteojp · portal board" | page footer |
| `briefTitle` | "Made in the Portal Board" | first line of every exported change brief |
| `pageTitle` | "OsteoJP · Portal Board" | browser tab and artifact gallery |
| favicon | 🌐 | browser tab |
| `ownerTerminalDefault` | "purple" | new-card default |
| `ownerTerminalPlaceholder` | "purple / ivan" | Owner terminal field placeholder |
| `laneLabels.rodica_batch` | "Stakeholder feedback" | lane header, List, drawer, toast |
| `kindLabels.rodica_batch` | "Stakeholder note" | drawer subtitle, Kind select |
| `--lawyer` hue | burnt orange, light `#b4551f` / dark `#e79a63` | the Lawyer column and every `lawyer` tag |

**(iii) The two `portal-board.json` data problems in §5.4**, proposed fix attached, not applied.

**(iv) The retirement commit in §5.2**: delete `render-portal-board.mjs` and untrack `portal-board-render.html`, or keep the static renderer and the tracked render.