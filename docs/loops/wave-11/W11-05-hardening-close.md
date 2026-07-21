# Loop W11-05 - Hardening + close (Wave 11 Separacao de Producao)

GATE: **Wave 11 Separacao de Producao, HARDENING + CLOSE, OWNER-MERGE.** Closes the split: re-hardens branch protection so the GREEN self-merge merge class ENDS PERMANENTLY (recorded in DECISIONS), removes the now-obsolete `prod-migrate.yml`, runs the Max access review, sets the old-project residue policy (frozen [30] days after cutover, then the owner decides), runs a backup/restore drill on the NEW project with documented evidence, and files the Twilio EU-region + DPA follow-up. Owner-performed items (branch protection, workflow-file removal) are the owner's authority; GREEN performs the drill + the review + the records and verifies the owner-performed items. **Preconditions: W11-04 merged AND the owner declares cutover FINAL.** Runs LAST in Wave 11; fresh `origin/main`; never stacked.

---

## Preconditions (hard gate)

1. **W11-04 merged.** Production is on the new project across all three Vercel projects with a green Production smoke; the old project is untouched as the rollback.
2. **Owner declares cutover FINAL.** The freeze of the old project + the branch-protection re-hardening are triggered by the owner's explicit "cutover final" declaration (until then the old project stays the rollback). Absent the declaration, **HALT** the freeze/re-harden portions (Field 6); the backup/restore drill + the follow-up filings can proceed, but the irreversible steps wait for the declaration.

---

## Field 1. Scope and ground truth

Perform the wave's hardening + close items, each with documented evidence, and record the standing decisions. Some items are owner-performed authority (branch protection, workflow-file removal) - GREEN describes + verifies them; others GREEN performs (the backup/restore drill on the new project, the Max access review, the follow-up filings, the DECISIONS/board delta).

Ground truth (recon at authoring 2026-07-21, executor verifies; the executor runs with ZERO memory):

- **Branch-protection re-hardening - GREEN self-merge ENDS PERMANENTLY (standing rule, recorded in DECISIONS).** Through Waves 01-10 the default merge class was GREEN self-merge on all-green checks. Now that the clinic is on the clean production system of record with real patient data, the owner re-hardens branch protection so **every** merge to `main` is owner-merge (no agent self-merge), permanently. This is a branch-protection change (the OWNER's authority in the GitHub settings) + a recorded DECISIONS standing rule; GREEN verifies the setting and writes the rule. From this wave on, the merge classes reduce to OWNER-MERGE / OWNER VISUAL GATE only; GREEN self-merge is retired. (This mirrors the standing-agent-governing-files posture already applied to `.github/workflows/` and `.claude/skills/`.)
- **`prod-migrate.yml` removal (owner-performed, workflow file).** `.github/workflows/prod-migrate.yml` (Path 1 in `docs/runbook-prod-migrations.md`, the `MIGRATE-PROD` manual apply) targeted the OLD project's migration path. After cutover it is obsolete and is REMOVED; migrations to the new project apply via the manual `drizzle-kit` direct-connection path (Path 2, cwd `packages/db`, `DATABASE_URL_DIRECT` 5432, journal verified) - the same path W11-02 used and the same path the owner ruled for future migrations. **Workflow files are never touched by a wave loop and are owner-merge class** - GREEN describes the removal + updates `docs/runbook-prod-migrations.md` / `docs/ops/prod-migrate.md` to reflect the single remaining path, but the owner performs the `prod-migrate.yml` deletion + merges. Confirm `docs/ops/prod-drift-check.md` still points at the correct (new) project after the change.
- **Max access review.** Max (the real therapist doing data entry through Waves 03-04) has access that must be reviewed on the NEW project (and confirmed removed/appropriate on the old): confirm Max's user + role on the new project match the intended production access, that no stale dev-only grants carried over, and that his account is scoped per the W10-04 isolation model (therapist = own scope). Document the review; any anomaly is filed, not silently changed.
- **Old-project residue policy: frozen [30] days after cutover, then the owner decides.** The old project `jaxmkwoxjcgzkwxgbayx` (carrying the BLOCKED residue island + the pre-split history) is FROZEN on the owner's "cutover final" declaration and RETAINED for [30] days as the rollback-of-last-resort + any legal-retention need (the signed residue). After [30] days the owner decides its disposition (keep archived / decommission). Record the policy + the freeze date in DECISIONS; the actual decommission is a FUTURE owner-gated action, never automatic. (The residue island itself is the accepted Option A / Q-W10-01-2 island the split was designed to leave behind.)
- **Backup/restore drill on the NEW project (GREEN performs, documented evidence).** Prove the new production project's backup + point-in-time-restore works BEFORE relying on it as the sole system of record: take a backup, restore it to a disposable target (or a PITR to a probe), verify the retained-real counts + a signed-URL attachment survive the round trip, and document the evidence (mirrors `docs/qa-backup-restore-drill-2026-06-21.md`). No synthetic data; the drill uses the migrated real data read-only + a disposable restore target that is torn down.
- **Twilio EU region + DPA - filed as a follow-up.** Twilio (SMS reminders/confirmations) must run in an EU region with a signed DPA for GDPR (CLAUDE.md rule 8, clinical data). This is NOT built in this loop; it is FILED as a follow-up (a QUESTIONS item + a Wave 12 / backlog candidate) with the owner as the actor (region config + DPA are dashboard/legal steps). Record it so it is not lost.
- **Standing (post W10-02 + this wave):** the cloud (now the NEW project) holds REAL DATA ONLY; all QA/synthetic on local `127.0.0.1`; the drill uses a disposable restore target.

**Scope:** the branch-protection re-hardening (GREEN self-merge retired permanently) + the `prod-migrate.yml` removal (owner-performed; docs updated to the single migration path) are done/verified, the Max access review + the backup/restore drill on the new project are documented, the old-project residue policy (frozen [30] days, then owner decides) + the Twilio EU/DPA follow-up are recorded/filed, and Wave 11 is closed with a DECISIONS entry + a close-out report + the board delta. The writes are the docs (DECISIONS, BACKLOG, QUESTIONS, the runbook updates, the drill evidence, the close-out report) + the board row flips; the branch-protection + workflow-file changes are the owner's authority (GREEN verifies).

## Field 2. Ordered steps
1. **Precondition check:** confirm W11-04 merged (green Production smoke) AND the owner has declared cutover FINAL. If the final declaration is absent, the freeze + re-harden steps HALT (Field 6); proceed only with the reversible items (drill, filings).
2. **A0 isolation guard:** fetch origin; assert `origin/main` contains W11-04's merge; `git worktree add ../osteojp-w11-05-hardening-close origin/main -b osteojp-w11-05-hardening-close`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
3. **Backup/restore drill on the NEW project (GREEN):** back up, restore to a disposable target, verify the retained-real counts + a signed-URL attachment survive, document the evidence (`docs/qa-backup-restore-drill-<date>-new-project.md`), tear down the disposable target.
4. **Max access review (GREEN):** review Max's user/role on the new project (and confirm appropriateness on the old); document; file any anomaly, change nothing silently.
5. **Branch-protection re-hardening (owner-performed authority; GREEN verifies + records):** confirm branch protection now requires owner-merge on `main` (no agent self-merge), permanently; write the standing DECISIONS rule that the GREEN self-merge merge class is RETIRED from this wave on (merge classes reduce to OWNER-MERGE / OWNER VISUAL GATE).
6. **`prod-migrate.yml` removal (owner-performed workflow file; GREEN updates docs + verifies):** update `docs/runbook-prod-migrations.md` + `docs/ops/prod-migrate.md` to the single remaining manual `drizzle-kit` direct-connection path and confirm `docs/ops/prod-drift-check.md` targets the new project; the owner deletes `.github/workflows/prod-migrate.yml` + merges (workflow files are owner class, never touched by the loop). Verify the removal.
7. **Old-project residue policy (DECISIONS):** record the freeze date + the [30]-day retention + "then the owner decides"; the decommission is a future owner-gated action.
8. **Twilio EU + DPA follow-up (QUESTIONS + backlog):** file the item with the owner as actor (EU region config + signed DPA), recommended default = configure Twilio EU + file the DPA before the SMS path is relied on in production; register it as a Wave 12 / backlog candidate.
9. **Close Wave 11:** write the DECISIONS close-out entry + a `docs/status/<date>-wave-11-report.md` close-out report (loops, PRs, the split outcome, the standing rules); flip all Wave 11 board rows to DONE; re-scan for rows whose gate just cleared.
10. **Gates (docs-only for GREEN's changes):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` still green; confirm `git diff --name-only origin/main` shows ONLY `docs/` files from GREEN's side (the `prod-migrate.yml` deletion is the owner's separate owner-merge change, not GREEN's diff).

## Field 3. Definition of done (machine-verifiable)
- **Branch-protection PROOF:** branch protection requires owner-merge on `main` (no agent self-merge), permanently; the DECISIONS standing rule retiring GREEN self-merge is written. Paste both.
- **`prod-migrate.yml` PROOF:** the workflow removal is verified (owner-performed), the runbooks + drift-check docs are updated to the single manual `drizzle-kit` path targeting the new project. Paste the doc delta.
- **Max-review PROOF:** the access review is documented; any anomaly filed, nothing changed silently.
- **Residue-policy PROOF:** the old-project freeze date + [30]-day retention + "then owner decides" is recorded in DECISIONS.
- **Backup/restore-drill PROOF:** the drill on the new project is documented (retained-real counts + a signed-URL attachment survive the round trip); the disposable target was torn down.
- **Twilio PROOF:** the EU-region + DPA follow-up is filed (QUESTIONS + backlog) with the owner as actor + a recommended default.
- **Close PROOF:** the Wave 11 close-out report + DECISIONS entry exist; all Wave 11 board rows are DONE.
- **No-code PROOF (GREEN side):** `git diff --name-only origin/main` shows ONLY `docs/` files from GREEN. Paste it.
- **Gates green.**

## Field 4. Verification (paste evidence)
The branch-protection + retired-self-merge proof, the `prod-migrate.yml` removal + runbook delta, the Max review, the residue policy, the backup/restore drill evidence, the Twilio follow-up filing, the close-out report + board flips, the no-code diff, gates green, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W11-04). GREEN's writes are docs only.
- **Branch protection + workflow-file (`prod-migrate.yml`) changes are the OWNER's authority** - GREEN describes/updates the docs + verifies; the owner performs the setting change + the workflow deletion + merges (workflow files are never touched by a wave loop).
- **The old project is FROZEN on the owner's "cutover final" declaration, retained [30] days, then the owner decides** - the decommission is a FUTURE owner-gated action, never automatic; GREEN never deletes the old project.
- **The backup/restore drill uses a disposable target + read-only real data** - no synthetic cloud data, the disposable target is torn down.
- **Twilio EU + DPA is FILED, not built** - it is a follow-up with the owner as actor; introducing/altering the vendor here is out of scope.
- Plain hyphens only; no emoji; no em/en dashes. **Never force-push / `--admin`.** No secret VALUES, no PII.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W11-04's merge.
- The owner has NOT declared cutover FINAL - HALT the freeze + branch-protection re-hardening (the old project must stay the live rollback); the drill + filings may proceed.
- The backup/restore drill FAILS (counts or a signed-URL attachment do not survive the round trip) - HALT-LOUD; the new project is not safe as the sole system of record until backup/restore is proven.
- The Max access review finds a stale/over-broad grant on the new project - file it and HALT for owner ruling rather than silently changing access.
- GREEN is asked to change branch protection, delete `prod-migrate.yml`, or decommission the old project directly - HALT (owner authority; GREEN verifies + records).

## Field 7. Report back
The branch-protection + retired-self-merge proof, the `prod-migrate.yml` removal + runbook delta, the Max review, the residue policy, the backup/restore drill evidence, the Twilio follow-up filing, the close-out report + board flips, the no-code diff, gates green, PR number.

## Merge policy (embed, Wave 11 Separacao de Producao)
- **W11-05 is OWNER-MERGE.** The branch-protection re-hardening + the `prod-migrate.yml` removal are the owner's authority; GREEN verifies + records + runs the drill/review/filings. All required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys green (checks API, not the banner) is NECESSARY for the docs PR. GREEN NEVER self-merges this loop. **This is the loop that retires GREEN self-merge permanently** - from Wave 12 on, every merge is OWNER-MERGE / OWNER VISUAL GATE.
- **Runs LAST in Wave 11**, fresh `origin/main`, never stacked. The old project stays the rollback until the owner declares cutover final; the decommission is a future owner-gated action. Workflow files are owner class (GREEN never touches them). HALT-LOUD on a failed backup/restore drill or a missing cutover-final declaration.
