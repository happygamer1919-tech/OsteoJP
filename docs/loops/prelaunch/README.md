# OsteoJP Pre-Launch loop set

Authored 2026-07-27 (YELLOW). Wave 12 is CLOSED; this is the PRE-LAUNCH phase, not
a numbered wave. Source: the Rodica batch received 2026-07-27 (four Telegram items)
plus two Claude-found defects.

Each file carries the seven Loop Package fields: scope and ground truth / ordered
steps / machine-verifiable definition of done / verification with pasted evidence /
restrictions / halt-loud protocol / report-back. Rodica's Portuguese is quoted
VERBATIM in each scope field and is not translated.

**Status is NOT owned by these files.** The committed source of truth for status is
`docs/board/prelaunch-board.json` (rendered to the Pre-Launch Board artifact);
validate it with `node docs/board/validate-board.mjs`.

| Loop | What | Gate | Notes |
|---|---|---|---|
| [PL-01](PL-01-agenda-same-hour-render.md) | Agenda same-hour appointments read as the next hour | OWNER VISUAL GATE, migration-free | Vertical stack is intentional + tested; migration 0041 inert in the grid. Fix bounds the stack to the hour band, NOT columns. |
| [PL-02](PL-02-patient-marcacoes-edit-authorship.md) | Patient Marcacoes tab: edit + "Criada por {staff} em {date}" | OWNER VISUAL GATE, migration-free | Authorship data already fetched but ignored; reuse the hover-card line. Classify defect (a) before building. |
| [PL-03a](PL-03a-declaracao-observacoes-ui.md) | Declaracao de Presenca: editable free-text observacoes | OWNER VISUAL GATE, migration-free | Declaracoes are transient (no DB) - this is the whole fix. No PL-03b migration needed. |
| PL-03b | (persistence) | n/a | NOT authored: recon proved no column needed. Future owner decision only. See PL-03a. |
| [PL-04](PL-04-nesa-halted-question.md) | NESA "missing" | STAKEHOLDER, HALTED at step zero | RECON: NESA already seeded as a service. Authors a batched question to Rodica + a CYAN prod-existence check, NOT a fix. |
| [PL-05](PL-05-terapeuta-dropdown-scope.md) | Terapeuta dropdown lists all staff (owner + admin) | OWNER VISUAL GATE, migration-free | Claude-found. Fix `data.ts:242-248`. "Bookable" = therapist_services signal (keeps the practicing owner JP). |
| [INC-02](INC-02-synthetic-data-env-and-purge.md) | Synthetic "Teste CB" on prod: env root-cause + purge | (a) OWNER-MERGE + owner infra; (b) owner AUTORIZO | YELLOW authors both halves, scopes NO data (CYAN counts), runs NO prod write. pt-PT sheet at `docs/ops/rodica-ambiente-de-teste.md`. |

## Standing rules embedded in every file

1. Cloud = real data only; all testing on local Supabase or Vercel previews.
2. No cloud write without an explicit AUTORIZO phrase, one per window.
3. Migration PRs are apply-BEFORE-merge (CYAN CLEAR -> owner terminal apply with
   pasted journal -> merge); one migration in flight.
4. "Applied" counts only with pasted journal output.
5. Auto-merge disabled repo-wide; merge instructions execute at the moment given.
6. Credentials never enter any AI context.
7. The manual apply step is the control gate, never automated.
8. Signed clinical records are immutable; annulment path only, never delete.
9. Pre-flight recon before any cloud write.
10. Loop files outrank session prompts; `.claude/skills` and DECISIONS.md are
    owner-merge only.
11. Halt loud on briefing-versus-reality mismatch; never guess product decisions.
12. Return to the source language before concluding a QA reporter is wrong.

**Three briefing-versus-reality mismatches were caught at authoring** (rule 11) and
are encoded in the loops + flagged to the owner: PL-01 (vertical stack is
intentional + 0041 inert), PL-04 (NESA already exists), PL-05 (the practicing owner
JP must not be filtered out). See `docs/DECISIONS.md` 2026-07-27.
