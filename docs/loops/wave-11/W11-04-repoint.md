# Loop W11-04 - Production repoint (Wave 11 Separacao de Producao)

GATE: **Wave 11 Separacao de Producao, CUTOVER, OWNER-PERFORMED (Vercel env swaps), GREEN VERIFIES, OWNER-MERGE.** The owner swaps the Production env vars across the three Vercel projects (osteojp-api, osteojp-platform, osteojp-portal) from the old Supabase project to the new one and redeploys; GREEN verifies the cutover from pasted evidence + a Production smoke and writes the verification report. **Rollback = the old project stays untouched until the owner declares cutover final.** **Preconditions: W11-03 merged (real data migrated + Preview smoke green) AND the owner has performed (or is performing) the env swaps.** Runs AFTER W11-03 merged; fresh `origin/main`; never stacked.

---

## Preconditions (hard gate)

1. **W11-03 merged.** `origin/main` records the real-data migration with a green Preview smoke against the new project and both CYAN checkpoints.
2. **Owner performs the env swaps.** Swapping Production env vars + redeploying is the OWNER's dashboard action (his exception class). GREEN starts verifying only when the owner has posted the swap + redeploy evidence. Absent it, **HALT** (Field 6) - GREEN never edits Vercel envs.

---

## Field 1. Scope and ground truth

The owner repoints the three Vercel projects' PRODUCTION environment from the old Supabase project `jaxmkwoxjcgzkwxgbayx` to the new Frankfurt Pro project and redeploys; GREEN produces a committed verification report `docs/recon/W11-04-repoint-evidence.md` confirming the cutover from pasted evidence + a Production smoke, and HALTs on any gap. The OLD project is NOT mutated - it stays intact as the rollback until the owner declares cutover final.

Ground truth (embed - SPLIT PLAN v1's repoint checklist in `docs/recon/W11-01-split-plan.md` is authoritative; this is the constraint map GREEN honours; the executor runs with ZERO memory):

- **Owner-performed (human-only setup, CLAUDE.md):** editing Vercel Production env vars and triggering redeploys are the OWNER's steps. GREEN does NOT edit envs, does NOT trigger a Production deploy; it verifies + smokes + reports.
- **The exact env vars to swap across ALL THREE Vercel projects (osteojp-api, osteojp-platform, osteojp-portal), per SPLIT PLAN v1:**
  - **`DATABASE_URL`** -> the NEW project's **pooler (6543)** connection (the app runtime uses the transaction pooler, never the direct port).
  - **`DATABASE_URL_DIRECT`** -> the NEW project's **direct (5432)** connection (migrations/jobs that need a direct connection).
  - **The Supabase anon key + service-role key + `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_*`** -> the NEW project's values.
  - Any other new-project-scoped secret from the W11-01 secrets-by-name list (the ingestion HMAC, integration keys, `NEXT_PUBLIC_API_URL` if the API host changes).
  - Apply the **Vercel project-setup checklist** (CLAUDE.md, owner-performed): Node 22.x, data-preference toggles disabled - confirm they are set on each project.
- **Redeploy order (per SPLIT PLAN v1):** redeploy so the API and the data layer are consistent before the user-facing apps; verify each of the three Production deploys goes green (read from the checks API, not the banner). A partial repoint (one project on the new DB, another still on the old) is a split-brain state - HALT.
- **Production smoke after redeploy (GREEN, read-only against Production):** staff login (the auth-hook claim reaches RLS; a therapist sees only their own scope; admin/owner tenant-wide), open a patient + a ficha, the agenda renders, a portal patient logs in and sees their appointments, a signed-URL attachment opens, and a NEW real write (e.g. a test booking the staff can make + immediately cancel, or a read-only confirmation that new rows land on the NEW project) confirms Production is writing to the new project, not the old. **No synthetic patient data is created on the cloud** - the smoke uses staff login + reads + at most a disposable appointment the owner/staff makes and removes; prefer read-only confirmation.
- **Rollback story:** at ANY point, rollback = the owner swaps the Production envs back to `jaxmkwoxjcgzkwxgbayx` and redeploys - which works ONLY while the old project is untouched. Therefore the OLD project is NOT frozen/decommissioned in this loop; it stays intact and current-as-of-cutover until the owner explicitly declares cutover FINAL (that declaration, and the subsequent freeze/retention, is W11-05). GREEN never touches the old project.
- **Cutover discipline (the W10-02 lesson):** the actual switch is the moment new real writes start landing on the new project. From that moment the old project is stale (it stops receiving writes) - so a late rollback loses any real data written to the new project after cutover. Confirm with the owner that the migration was recent + the freeze held, so the delta is zero or near-zero; if real writes accumulated on the new project post-cutover and a rollback is later wanted, that is a re-migration, not a simple swap-back - flag it.

**Scope:** a committed `docs/recon/W11-04-repoint-evidence.md` confirming the three Vercel projects' Production is on the new project (the exact env vars swapped: pooler 6543 `DATABASE_URL`, direct 5432 `DATABASE_URL_DIRECT`, Supabase keys), all three Production deploys green, and a Production smoke passing (isolation via the auth hook, patient/ficha/agenda, portal, signed-URL attachment, writes landing on the new project) - with the OLD project untouched as the rollback. GREEN edits NO env and triggers NO deploy; it verifies + smokes + reports + HALTs on any gap. The only writes are the verification doc under `docs/recon/` and the BACKLOG row flip.

## Field 2. Ordered steps
1. **Precondition check:** confirm W11-03 merged (green Preview smoke) AND the owner has posted the Vercel env-swap + redeploy evidence. If missing -> HALT (Field 6).
2. **A0 isolation guard:** fetch origin; assert `origin/main` contains W11-03's merge; `git worktree add ../osteojp-w11-04-repoint origin/main -b osteojp-w11-04-repoint`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
3. **Verify the env swap on all three projects** from evidence: `DATABASE_URL` -> new pooler 6543, `DATABASE_URL_DIRECT` -> new direct 5432, Supabase anon/service-role/URL -> new, plus any other new-scoped secret NAME present (never a value). A project still on the old DB (split-brain) -> HALT.
4. **Verify the three Production deploys are green** (checks API, not the banner) and on Node 22.x with data-preference toggles disabled.
5. **Production smoke (read-only + at most a disposable owner/staff action):** staff login + isolation (the auth-hook claim reaching RLS), patient/ficha/agenda, portal appointment view, signed-URL attachment, and confirmation that new writes land on the NEW project (not the old). Any failure -> HALT.
6. **Confirm the OLD project is untouched** and remains the rollback (its counts unchanged since W11-03; GREEN did not write it). Record the rollback procedure (owner swaps envs back + redeploys) and the cutover-delta caveat.
7. **Write `docs/recon/W11-04-repoint-evidence.md`** = the env-swap verification (by NAME), the three-deploy green proof, the Production smoke ledger, and the rollback/old-project-untouched confirmation. No secret values, no PII.
8. **Gates (docs-only):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` still green; `git diff --name-only origin/main` shows ONLY `docs/` files.

## Field 3. Definition of done (machine-verifiable)
- **Precondition PROOF:** W11-03 merged (green Preview smoke) + owner env-swap evidence posted; GREEN verified, it did NOT edit envs or deploy.
- **Env-swap PROOF:** all three Vercel projects' Production has `DATABASE_URL` -> new pooler 6543, `DATABASE_URL_DIRECT` -> new direct 5432, Supabase keys -> new (by NAME); no project left on the old DB.
- **Deploy PROOF:** all three Production deploys green (checks API), Node 22.x, data-preference disabled.
- **Smoke PROOF:** Production smoke passes (isolation via the auth hook, patient/ficha/agenda, portal, signed-URL attachment, writes landing on the new project).
- **Rollback PROOF:** the OLD project is untouched (counts unchanged); the rollback procedure + the cutover-delta caveat are recorded; the owner has NOT yet been asked to declare cutover final (that is W11-05).
- **No-edit PROOF:** `git diff --name-only origin/main` shows ONLY `docs/` files; GREEN edited no env and triggered no deploy. Paste it.
- **Gates green.**

## Field 4. Verification (paste evidence)
The precondition evidence, the env-swap-by-name checklist, the three-deploy green proof, the Production smoke ledger, the old-project-untouched + rollback record, the no-edit diff, gates green, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W11-03). **GREEN edits NO Vercel env and triggers NO Production deploy** - the repoint is the owner's exception class; GREEN verifies + smokes + reports.
- **The OLD project is NOT frozen/decommissioned here** - it stays intact as the rollback until the owner declares cutover FINAL (W11-05). GREEN never writes it.
- **All three projects move together** - a partial repoint (split-brain, one project on the new DB and another on the old) is a HALT, not a routine state.
- **No synthetic cloud data** - the Production smoke is read-only + at most a disposable owner/staff action removed immediately; prefer read-only confirmation that new writes land on the new project.
- **EU residency holds** - the new project is Frankfurt; the app region is `fra1` (Vercel checklist).
- Plain hyphens only; no emoji; no em/en dashes. **Never force-push / `--admin`.** No secret VALUES, no PII in evidence.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- A precondition is unmet: W11-03 not merged, the Preview smoke was not green, or the owner's env-swap evidence is absent.
- The A0 guard fails, OR `origin/main` does NOT contain W11-03's merge.
- Any of the three Vercel projects is still on the old Supabase project (split-brain), OR a Production deploy is red - HALT.
- The Production smoke fails (isolation broken / the auth-hook claim not reaching RLS / a signed-URL attachment 404 / portal cannot read appointments / writes still landing on the old project) - HALT; do NOT declare the cutover verified on a red smoke.
- The OLD project is found mutated, or GREEN is asked to edit an env / trigger a Production deploy / freeze the old project - HALT (owner-performed; the old project stays the rollback until W11-05).

## Field 7. Report back
The precondition evidence, the env-swap-by-name checklist, the three-deploy green proof, the Production smoke ledger, the old-project-untouched + rollback record, the no-edit diff, gates green, PR number.

## Merge policy (embed, Wave 11 Separacao de Producao)
- **W11-04 is OWNER-MERGE.** The Production repoint is owner-performed (Vercel env swaps + redeploys); GREEN verifies from pasted evidence + a Production smoke and HALTs on any gap. The env-swap checklist + the three-deploy green proof + the Production smoke + the old-project-untouched record are pasted BEFORE the owner merges the docs PR. All required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys green (checks API, not the banner) is NECESSARY. GREEN NEVER self-merges this loop.
- **Runs after W11-03 merged**, fresh `origin/main`, never stacked. All three projects move together; the OLD project stays untouched as the rollback until the owner declares cutover final (W11-05). Workflow files NEVER touched. HALT-LOUD on a split-brain repoint or a red Production smoke.
