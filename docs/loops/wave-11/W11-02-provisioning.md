# Loop W11-02 - Provisioning the new production project (Wave 11 Separacao de Producao)

GATE: **Wave 11 Separacao de Producao, PROVISIONING, OWNER-PERFORMED (his exception class), GREEN VERIFIES FROM EVIDENCE, OWNER-MERGE.** The owner stands up the NEW production Supabase project (Frankfurt, Pro) in the dashboards + CLI per SPLIT PLAN v1: schema applied from the committed migrations to head `0037`, auth mirrored, storage buckets recreated, secrets set by name. GREEN does NOT provision anything - it VERIFIES each item against the owner's pasted evidence + its own read-only probes and writes a verification report, HALTing on any missing or mismatched item. **Preconditions: W11-01 merged AND the owner has accepted SPLIT PLAN v1.** Runs AFTER W11-01 merged; fresh `origin/main`; never stacked. **NO real data is migrated here** (that is W11-03) - the new project is stood up EMPTY except its schema + config.

---

## Preconditions (hard gate)

1. **W11-01 merged.** `origin/main` contains `docs/recon/W11-01-split-plan.md` with a versioned SPLIT PLAN v1.
2. **Owner accepted SPLIT PLAN v1** and has performed (or is performing) the provisioning per the plan. GREEN starts only when the owner has posted the provisioning evidence (or the new project's read-only access) to verify against. If the evidence is absent, **HALT** (Field 6) - GREEN never provisions on its own.

---

## Field 1. Scope and ground truth

The owner creates the NEW production Supabase project and configures it to be a byte-faithful clone of `jaxmkwoxjcgzkwxgbayx`'s SCHEMA + CONFIG (not its data), per SPLIT PLAN v1. GREEN produces a committed verification report `docs/recon/W11-02-provisioning-evidence.md` that checks EVERY SPLIT PLAN v1 provisioning item against the owner's pasted evidence and GREEN's own read-only probes, and HALTs on the first gap. **The new project holds NO real data at the end of this loop** - only the schema (head `0037`), auth config, buckets, extensions, and secrets-by-name. The data migration is W11-03.

Ground truth (embed - SPLIT PLAN v1 in `docs/recon/W11-01-split-plan.md` is the AUTHORITATIVE provisioning checklist; this is the constraint map GREEN honours while verifying it; the executor runs with ZERO memory):

- **Owner-performed (human-only setup, CLAUDE.md "Human-only setup" + Vercel checklist):** creating the Supabase project, the CLI/`drizzle-kit` schema apply, the dashboard auth config, the storage buckets, and setting the secrets are the OWNER's steps (his exception class, same as the Vercel project-setup checklist). GREEN does NOT create projects, does NOT set secrets, does NOT run writes against the new project beyond the read-only verification probes.
- **Region + tier (hard):** the new project is **Frankfurt (`eu-central`), Pro** - EU-residency rule (CLAUDE.md rule 8). Any US-region resource for stored data is a HALT. Apply the Vercel/Supabase data-preference toggles from the CLAUDE.md checklist (owner-performed): disable "Improve models with this project's data" (project + team on Pro); Node 22.x on the Vercel side (that is W11-04).
- **Extensions FIRST:** the exact extension set from W11-01's inventory is enabled BEFORE the schema apply (a missing extension fails the migration apply). Verify the set matches.
- **Schema from the committed migrations, to head `0037` (NOT a hand dump):** applied via manual `drizzle-kit` apply, cwd `packages/db`, against the new project's `DATABASE_URL_DIRECT` (direct 5432, not the 6543 pooler - migrations need a direct connection), journal verified to head `0037` (`meta/_journal.json` last entry idx 37, `0037_service_packs`). The migrations reproduce RLS, the immutability trigger, the append-only relations, and audit_log by construction. Verify: migration head `0037`, all 37 applied, journal matches, `supabase/migrations` mirror intact.
- **The safety mechanisms MUST verify present + enabled on the new project** (from W11-01's checklist): every RLS policy (same table/name/command/predicate list), the `clinical_records_enforce_immutability` trigger ENABLED (`tgenabled='O'`), `record_annulments` append-only (SELECT + INSERT policies only), audit_log append-only, and - the most easily missed - the **Supabase Auth hook** injecting `tenant_id` + `user_role` into the JWT. Run the `supabase-setup.md` RLS + GRANT + per-request-claim SQL test against the new project (read-only / on a disposable probe row that is cleaned up) to prove the claim flow works end to end. **If the auth hook is absent or the claim does not reach RLS, HALT** - isolation is silently broken without it.
- **Auth config mirrored:** providers, email templates (confirm/invite/recovery/magic-link), `SITE_URL` + additional redirect URLs (these will point at the same Vercel domains - confirm they match the intended production hosts), JWT expiry, SMTP (Resend EU) by name, the auth hook registration. Secrets (JWT secret, SMTP key) are set by the owner and recorded by NAME only.
- **Storage buckets recreated:** same names, same visibility (all clinical/patient buckets PRIVATE, signed-URL only), same storage RLS policies. Empty at this stage (objects migrate in W11-03).
- **Secrets by name:** the env-var / project-secret NAMES from W11-01 exist on the new project (`DATABASE_URL`, `DATABASE_URL_DIRECT`, anon + service-role keys, `NEXT_PUBLIC_*`, ingestion HMAC, integration secrets). **GREEN verifies the NAMES are present, never the values.** The Vercel-side rotation is W11-04.
- **Old project untouched:** `jaxmkwoxjcgzkwxgbayx` is READ-ONLY throughout - this loop does not touch it. It stays the live system of record until W11-04 cutover.

**Scope:** a committed `docs/recon/W11-02-provisioning-evidence.md` verifying, item by item against SPLIT PLAN v1, that the new Frankfurt Pro project has: the correct extensions, the schema at head `0037` from the committed migrations (RLS + immutability trigger enabled + append-only + audit_log + the auth hook all present and proven by the claim-flow SQL test), the mirrored auth config, the recreated buckets, and every secret NAME - with NO real data present. GREEN provisions NOTHING; it verifies + reports + HALTs on any gap. The only writes are the verification doc under `docs/recon/` and the BACKLOG row flip on close (and disposable probe rows for the RLS test, cleaned up).

## Field 2. Ordered steps
1. **Precondition check:** confirm W11-01 is merged AND the owner accepted SPLIT PLAN v1 AND has posted the provisioning evidence (or new-project read-only access). If any is missing -> HALT (Field 6).
2. **A0 isolation guard:** fetch origin; assert `origin/main` contains W11-01's merge; `git worktree add ../osteojp-w11-02-provisioning origin/main -b osteojp-w11-02-provisioning`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
3. **Verify region + tier + data-preference toggles** from evidence: Frankfurt, Pro, model-training disabled. A US region is a HALT.
4. **Verify extensions** match the W11-01 set (present BEFORE the schema).
5. **Verify the schema apply:** migration head `0037`, all 37 migrations applied, journal to idx 37, `supabase/migrations` mirror intact. Confirm the apply used the committed migrations (not a hand dump) and the direct 5432 connection.
6. **Verify the safety mechanisms** on the new project: the full RLS policy list matches W11-01; the immutability trigger is ENABLED; `record_annulments` + audit_log are append-only; **the auth hook injects `tenant_id` + `user_role`** - run the `supabase-setup.md` claim-flow SQL test (read-only / disposable probe rows cleaned up) to prove RLS reads the claim end to end. Any gap -> HALT.
7. **Verify auth config, buckets, secrets-by-name** against SPLIT PLAN v1 (providers/templates/redirects/JWT/SMTP-by-name/the hook; bucket names/visibility/policies; every secret NAME present - never a value). Any missing item -> HALT with the exact item so the owner adds it.
8. **Confirm NO real data present** on the new project (all domain tables empty) - the migration is W11-03; a non-empty domain table here is a HALT.
9. **Write `docs/recon/W11-02-provisioning-evidence.md`** = the item-by-item verification ledger (each SPLIT PLAN v1 item: expected -> observed -> pass/HALT), with the claim-flow test output and the empty-data confirmation. Secrets by NAME only; no values, no PII.
10. **Gates (docs-only):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` still green; confirm `git diff --name-only origin/main` shows ONLY `docs/` files.

## Field 3. Definition of done (machine-verifiable)
- **Precondition PROOF:** W11-01 merged + SPLIT PLAN v1 accepted + owner evidence posted; the loop verified, it did NOT provision.
- **Region/tier PROOF:** the new project is Frankfurt + Pro + model-training disabled. Evidence pasted.
- **Schema PROOF:** migration head `0037`, all 37 applied from the committed migrations, journal + mirror intact.
- **Safety-mechanism PROOF:** the RLS policy list matches W11-01; the immutability trigger is ENABLED; append-only relations + audit_log present; **the auth hook claim flow is proven by the `supabase-setup.md` SQL test** (output pasted). Any gap HALTed.
- **Config PROOF:** auth (providers/templates/redirects/JWT/SMTP-by-name/hook), buckets (names/visibility/policies), and every secret NAME are verified present (values never printed).
- **Empty-data PROOF:** all domain tables are empty on the new project (no real data yet).
- **No-provision PROOF:** `git diff --name-only origin/main` shows ONLY `docs/` files; GREEN created nothing and set no secret. Paste it.
- **Gates green.**

## Field 4. Verification (paste evidence)
The precondition evidence, the region/tier proof, the schema-head + mirror proof, the safety-mechanism proof (incl. the claim-flow SQL test output), the config + secrets-by-name checklist, the empty-data confirmation, the no-provision diff, gates green, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W11-01). **GREEN provisions NOTHING** - no project creation, no secret setting, no schema write beyond disposable RLS-probe rows that are cleaned up. Provisioning is the owner's exception class.
- **NO real data migrates here** - the new project ends EMPTY of domain data; a non-empty domain table is a HALT. The data migration is W11-03 (owner-gated freeze window).
- **The old project `jaxmkwoxjcgzkwxgbayx` is not touched** - it stays the live system of record until W11-04.
- **EU residency is a hard rule** - Frankfurt only; a US-region resource for stored data is a HALT.
- **The auth hook is not optional** - without the `tenant_id`/`user_role` claim injection verified, isolation is silently broken; its absence is a HALT, not a note.
- Plain hyphens only; no emoji; no em/en dashes. **Never force-push / `--admin`.** No secret VALUES, no PII in the evidence (names + counts only).
- **Standing test-data rule:** no synthetic data is created on either cloud project; the RLS-probe rows for the claim-flow test are disposable and cleaned up, on the NEW empty project only.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- A precondition is unmet: W11-01 not merged, SPLIT PLAN v1 not accepted, or the owner's provisioning evidence / new-project access is absent.
- The A0 guard fails, OR `origin/main` does NOT contain W11-01's merge.
- The new project is NOT Frankfurt, or NOT Pro, or model-training is not disabled - HALT (EU residency + data-preference are hard rules).
- The schema is not at head `0037`, a migration is missing, the journal/mirror is drifted, or the schema was applied by a hand dump instead of the committed migrations - HALT with the exact gap.
- The auth hook is absent or the claim does not reach RLS in the SQL test, OR the immutability trigger is not enabled, OR an RLS policy from W11-01 is missing - HALT (isolation/immutability would be silently broken).
- Any real data is present on the new project (a non-empty domain table) - HALT (the migration is W11-03; data must not arrive early or out of band).
- A secret VALUE would have to be printed to verify it, or GREEN is being asked to provision/set a secret - HALT (owner-performed; GREEN verifies by NAME only).

## Field 7. Report back
The precondition evidence, the region/tier/schema/safety/config/secrets-by-name/empty-data proofs (claim-flow test output included), the no-provision diff, gates green, PR number.

## Merge policy (embed, Wave 11 Separacao de Producao)
- **W11-02 is OWNER-MERGE.** Provisioning is owner-performed (his exception class); GREEN verifies from pasted evidence + read-only probes and HALTs on any gap. The verification report + the safety-mechanism/claim-flow proof + the empty-data confirmation are pasted BEFORE the owner merges the docs PR. All required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys green (read from the checks API NOT the banner) is NECESSARY for the docs PR. GREEN NEVER self-merges this loop.
- **Runs after W11-01 merged**, fresh `origin/main`, never stacked. NO real data migrates here; the old project is untouched; the new project is Frankfurt Pro. Workflow files NEVER touched. HALT-LOUD on any provisioning gap; EU-residency / auth-hook / immutability gaps escalate instantly.
