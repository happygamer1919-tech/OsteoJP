# Loop PL-04 - NESA option missing (AMBIGUOUS - author the question, not the fix) (Pre-Launch, Rodica batch 2026-07-27)

GATE: **Pre-Launch, STAKEHOLDER QUESTION. HALTED at step zero. Not a build loop.**
Rodica reports NESA is missing. **Recon overturns the briefing's premise: NESA is
NOT absent from the catalogue - it is already seeded as a service (both
locations), with its own form template and pack.** So "add NESA to the catalogue"
would be wrong. The report is AMBIGUOUS about WHERE NESA is missing. This loop
authors ONE batched question to Rodica + a CYAN prod-existence check, and marks
itself blocked. It does NOT author the fix. Starts from **fresh `origin/main`**;
never stacked.

## Field 1. Scope and ground truth

Rodica's words, verbatim, do not translate:

> "Falta a opcao NESA"

Evidence: a screenshot showing the Terapeuta dropdown open, the service selector
off-screen. That is the whole report.

**Ground truth (recon at authoring 2026-07-27) - briefing-versus-reality mismatch,
flagged loud:** the briefing framed this as "NESA is a servico to ADD to the
catalogue (currently 20 services)." Recon shows NESA is **already in the seed
catalogue**:
- `packages/db/seed/wave08-catalog.ts` - `"Tratamento NESA"` (Linda-a-Velha,
  `:59`) and `"NESA"` (Castelo Branco, `:75`), plus `"Pacote 10 - NESA"` (`:81`).
  The full catalogue is **22 services** (12 LAV + 10 CB), not 20.
- A NESA form template exists: `packages/db/seed/form-templates/nesa-v1.json`.
- The NESA soft-warning flag is `services.contraindicationSensitive`
  (`schema.ts:273`, migration 0031).

So NESA-the-service is NOT missing from the codebase. Two things could still make
Rodica see it "missing" at the Terapeuta-dropdown moment, and the screenshot does
not disambiguate them:

- **Shape A - NESA missing for a THERAPIST.** The therapist->service mapping
  `therapistServices` (`schema.ts:449-475`, migration 0023) drives which services
  a selected therapist can be booked for. If the NESA therapist (plausibly **David
  Batista**) has no `therapist_services` row for NESA - or, per the handoff, has
  no `users` row at all yet (David Batista is one of the 5 genuinely-new staff
  deferred to the invite flow; NOT a seeded user) - then NESA is not offered
  through him. This fits the screenshot (Terapeuta dropdown open).
- **Shape B - NESA missing at a LOCATION.** LAV shows "Tratamento NESA", CB shows
  "NESA". If Rodica was booking at the location whose NESA row she did not expect
  (or a location filter hid it), it reads as missing.
- **Shape C - NESA not seeded to PROD.** The seed catalogue is code; prod is
  REAL-DATA-ONLY and the wave08 catalogue may or may not have been inserted on the
  live DB. YELLOW cannot query prod. This must be confirmed read-only by CYAN.

**This loop does not choose.** Choosing would guess a product decision and, worse,
guess a prod-data state YELLOW cannot see. The deliverable is a well-formed
question + a CYAN existence check + a blocked board card.

**Scope:** ONE question appended to `docs/QUESTIONS.md` (Q-PL-04-1) + a CYAN
read-only task (does NESA exist on prod; which therapists are mapped; does David
Batista have a row) + the board card `PL-04` -> `status=blocked, blocked_on=rodica`.
ZERO code, ZERO migration, ZERO prod write.

## Field 2. Ordered steps
1. **Do NOT build.** No service insert (NESA already seeded in code), no
   therapist-mapping change, no UI change.
2. **Author Q-PL-04-1** in `docs/QUESTIONS.md`: Rodica's verbatim words; the recon
   fact that NESA already exists as a service (LAV "Tratamento NESA" + CB "NESA" +
   template + pack); the three candidate shapes (A therapist-mapping / B location /
   C not-seeded-on-prod); and a recommended default. **Recommended default =
   Shape A**: NESA the service exists; the gap is that the NESA therapist (likely
   David Batista) is not yet bookable for it - he is in the deferred-invite set
   (no `users` row), so no `therapist_services` mapping can exist yet. If so, this
   ties to G6 (invites/mailboxes) + a `therapist_services` row once he is invited,
   NOT to a catalogue insert.
3. **Register a CYAN read-only check** (pre-flight recon, real data only, ref-guard
   `dfotoodqvmjhbdcxyaxf`): confirm on prod whether the NESA services exist, which
   therapists carry a NESA `therapist_services` mapping, and whether David Batista
   has a `users` row. This decides between Shape A and Shape C before any fix.
4. **Update the board:** `PL-04` -> `status=blocked, blocked_on=rodica`,
   `gate=stakeholder`; `node docs/board/validate-board.mjs` green.
5. **Confirm zero code:** `git diff --name-only origin/main` shows only docs +
   the board JSON.

## Field 3. Definition of done (machine-verifiable)
- **Question PROOF:** `docs/QUESTIONS.md` contains `Q-PL-04-1` with (i) Rodica's
  verbatim words, (ii) the recon fact that NESA already exists as a service
  (with the `wave08-catalog.ts` anchors), (iii) the three candidate shapes,
  (iv) a stated recommended default, (v) the AUTORIZO note (only if a prod insert
  turns out to be needed, i.e. Shape C). Paste the entry.
- **CYAN-task PROOF:** the read-only prod-existence check is registered (what to
  count, ref-guarded), assigned to CYAN, NOT executed by YELLOW.
- **Blocked-card PROOF:** `prelaunch-board.json` card `PL-04` is
  `status=blocked, blocked_on=rodica`; validator exits 0. Paste the line.
- **No-code PROOF:** `git diff --name-only origin/main` lists ZERO files under
  `apps/`, `packages/`, `supabase/`. Paste it.

## Field 4. Verification (paste evidence)
The `Q-PL-04-1` entry, the registered CYAN check, the `PL-04` board card, the
validator exit line, the docs-only diff.

## Field 5. Restrictions and scope boundary
- **Author the question, NOT the fix.** No service creation (it already exists),
  no therapist-mapping edit, no UI change while the question is open.
- **YELLOW does not read prod.** The prod-existence question is routed to CYAN
  read-only; YELLOW records what to check, never runs it.
- **If a prod insert turns out to be needed (Shape C):** it is a prod-data step,
  owner-gated under an AUTORIZO phrase (one phrase per window); GREEN stages the
  byte-exact insert, the owner runs it. Never autonomous.
- Cloud REAL DATA ONLY. pt-PT diacritics in the question; plain hyphens; no em/en
  dashes; no emoji. Never force-push / `--admin`.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop)
- Anyone attempts to build/insert NESA before Rodica answers Q-PL-04-1 AND CYAN
  confirms the prod state - HALT: NESA already exists in code, so a blind insert
  risks a duplicate.
- Rodica's answer is ambiguous (e.g. "both A and C") - return to her exact words
  (rule 12), record the meaning per surface, re-scope into concrete loops.
- CYAN finds NESA is NOT on prod (Shape C) - that is a prod-data seed, owner-gated;
  do not fold it into a catalogue-edit; open a separate AUTORIZO loop.
- The screenshot/report reveals a THIRD reading (e.g. NESA-entity / external
  partner, like the NESA-entity in the roster) - HALT and re-ask.

## Field 7. Report back
The `Q-PL-04-1` id, the corrected premise (NESA already seeded, 22 services), the
three candidate shapes, the recommended default (Shape A), the registered CYAN
check, and `PL-04=blocked/rodica`. No build was performed (by design).

## Merge policy (embed, Pre-Launch)
- **PL-04 is a STAKEHOLDER-gated question loop.** Its only merge content is docs
  (the question + the board update + the CYAN task), OWNER-MERGE like all
  DECISIONS / QUESTIONS / board changes. Any eventual fix is a separate loop opened
  only after Rodica answers + CYAN confirms; a prod insert is additionally owner
  AUTORIZO. YELLOW authors, never merges its own PR. HALT-LOUD on any attempt to
  build before the answer.
