# Loop W3-10 - Close superseded halt PRs #440 / #439 / #446 (gh-only housekeeping)

GATE: none. `gh`-CLI-only housekeeping. NO code, NO branch, NO PR opened. Independent of the other W3 loops.

## Field 1. Scope and ground truth
Post a "superseded by" closing comment on three merged Max halt-recording PRs so the halt records are not left looking unresolved.

Ground truth (locked facts to embed — GREEN runs with zero memory):
- **The three halt PRs are already MERGED** (verified 2026-07-05, `gh pr view`): each is in state MERGED and already carries 2 comments. "Close" here means post a superseded-by COMMENT — it is **comment-only, NO revert, NO reopen** (a merged PR cannot be "closed" further). This matches the standing housekeeping ticket (QUESTIONS 2026-07-03: "these PRs are already merged; comment-only housekeeping, no revert, no reopen").
- **Supersession map** (each halt → its merged Wave 02 replacement):
  - **#440** (halt: row-8 no-note indicator, `analytics_events` note_present capture unimplemented) → superseded by **W2-04 / PR #456** (no-note indicator shipped, present-state `EXISTS(appointment_notes)`).
  - **#439** (halt: batch failure pop-up, no defined UI entry point) → superseded by **W2-05 / PR #457** (recorrente routed through `batchSchedule` + partial-success failure dialog).
  - **#446** (halt: fichas-as-tab, placement design ruling open) → superseded by **W2-06 / PR #458** (Registos tab completed; `/clinical` nav item removed, list route kept unlinked).
- The replacements (#456, #457, #458) are all merged.

Recon before commenting (report findings):
- For each of #440, #439, #446, read the existing comments (`gh pr view <n> --json comments`). If a superseded-by comment pointing at the correct replacement is ALREADY present (a prior W2-04/05/06 merge step may have posted it), SKIP that PR and record it as already-done — do NOT post a duplicate.

## Field 2. Ordered steps
1. No worktree / no branch needed (gh-only, no repo file changes). Confirm `gh auth status` is authenticated; HALT if not (never self-authenticate).
2. Recon: for each of #440/#439/#446, confirm state = MERGED and read existing comments to check for an already-present superseded-by comment.
3. For each PR WITHOUT an existing superseded-by comment, post one via `gh pr comment <n> --body "..."` pointing at its replacement, e.g.:
   - `#440`: "Superseded by W2-04 (PR #456) — no-note indicator shipped and merged. Halt record closed; no action needed."
   - `#439`: "Superseded by W2-05 (PR #457) — batch failure pop-up shipped and merged. Halt record closed; no action needed."
   - `#446`: "Superseded by W2-06 (PR #458) — fichas-as-tab / Registos tab shipped and merged. Halt record closed; no action needed."
4. Do NOT reopen, revert, or re-close any PR. Capture the resulting comment URLs.

## Field 3. Definition of done (machine-verifiable)
- Each of #440, #439, #446 carries a superseded-by comment pointing at #456, #457, #458 respectively — either newly posted (paste the comment URL) or confirmed already-present (paste the existing comment reference).
- No PR was reverted, reopened, or re-closed (state remains MERGED for all three): paste the post-action `gh pr view <n> --json number,state` for each.
- No code, branch, or PR was created by this loop.

## Field 4. Verification (paste evidence)
Per-PR: pre-action state (MERGED) + existing-comment check, the posted (or already-present) superseded-by comment URL, and post-action `state = MERGED`. A one-line confirmation that no revert/reopen/re-close occurred and no branch/PR/code was created.

## Field 5. Restrictions and scope boundary
- `gh`-CLI-only. NO code changes, NO branch, NO worktree, NO PR opened, NO migration. (The per-loop A0 worktree rule is N/A here because this loop makes zero repo file changes.)
- Comment-only: NEVER revert, reopen, or re-close #440/#439/#446 (they are merged and stay merged). No `--admin`, no force anything.
- Do not touch the replacement PRs (#456/#457/#458) or any workflow file.
- Never self-authenticate `gh`; if not authenticated, HALT.

## Field 6. Halt loud if
- Any of #440/#439/#446 is NOT in state MERGED (e.g. reopened/closed-unmerged) — the ground truth has drifted; surface it before commenting.
- A replacement PR (#456/#457/#458) is not merged, or the supersession map does not match reality — surface the discrepancy rather than posting a wrong pointer.
- `gh` is not authenticated (never self-authenticate).
- HALT-LOUD PROTOCOL (all halts, all W3 loops): write a halt file to `~/osteojp-mailbox/inbox/` named `halt-<UTC-timestamp>-W3-10.md` with the mismatch, options, and a recommended default. Poll `~/osteojp-mailbox/outbox/` up to 30 minutes; apply and archive under `~/osteojp-mailbox/archive/` if answered; else classic stop and record the resume state. Never guess.

## Field 7. Report back
Per-PR: state confirmation, existing-comment check, the superseded-by comment URL (posted or already-present), post-action state. Confirm no revert/reopen/re-close and no branch/PR/code created. This loop opens NO PR (gh-only) — report is the deliverable.
