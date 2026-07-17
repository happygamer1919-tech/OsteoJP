# Loop W9-07 - NESA catalog fix (Wave 09 Correcoes CB)

> **STATE 2026-07-17: CLOSED as NO-DEFECT by owner ruling. No code shipped. Docs delta only.**
>
> **The conditional below resolved to a third path that this loop file did not anticipate:
> neither the code path nor the cloud-write path. There is no defect to fix.** W9-01 finding
> (a) (`docs/recon/W9-01-findings.md`, merged #595 @ `022a31c`) established, with read-only
> cloud evidence, that NESA is ALREADY selectable at Castelo Branco:
>
> - The booking dropdown filters `services.is_active` ONLY and never reads
>   `service_location_prices` (`apps/web/lib/scheduling/data.ts:200-209`). **The
>   offered-only-where-priced premise in Field 1 of this loop file is FALSE.** Hypothesis
>   (i) is refuted, not merely unconfirmed: a missing or inactive CB price row cannot hide a
>   service from a dropdown that never reads price rows.
> - The canonical CB NESA (`270fb115-154a-4c4e-a2f7-f4976c71cfbd`) is `is_active = true`
>   with an ACTIVE CB `service_location_prices` row at 5000 (50.00). Hypothesis (ii) refuted.
> - The sole CB-assigned therapist has ZERO `therapist_services` rows, so the drawer's
>   client-side narrowing is bypassed entirely (`appointment-drawer.tsx:457-465` - an empty
>   mapping means "show all", by design). The remaining candidate refuted.
>
> **Cause of the QA observation:** it predates the W8-01a catalog seed (#587), which merged
> the SAME day the QA was delivered (2026-07-16) and created the canonical active CB-priced
> NESA row. Before that seed the only row named NESA was the frozen legacy row (39.00,
> `is_active = false`), which `data.ts:208` correctly hides. The seed resolved item 4.
>
> **Owner ruling 2026-07-17 (amendments recorded here per the ruling's docs-delta
> instruction; the close-out YELLOW reconciles):**
> 1. **W9-07 closes as NO-DEFECT.** No code, no cloud write, no migration. Flip DONE
>    referencing the findings once W9-01 merged (it did: #595).
> 2. **Do NOT make the booking dropdown price/location-aware this wave.** A strict
>    offered-only-where-priced filter applied today would HIDE services CB actually performs
>    but which lack price rows, colliding with the still-open JP catalog-gaps ruling
>    (`docs/QUESTIONS.md:546-571`, "CB missing services (present at LV, absent from CB's
>    price table)" and the LV counterpart, both defaulting to "leave unseeded"). Tightening
>    the filter before that ruling lands would convert a cosmetic over-inclusion into a real
>    booking outage.
> 3. **Registered as a Wave 10 candidate, explicitly gated on the JP catalog-gaps ruling:**
>    "booking dropdown per-location offering filter" (see `docs/design/BACKLOG.md`, Wave 10
>    candidates). The over-inclusion defect W9-01 found is real and recorded there - the
>    dropdown offers every active service at every location, contradicting W8-01a, while
>    packs in the same drawer ARE location-filtered (`appointment-drawer.tsx:345-347`).
>
> **Frozen legacy rows: untouched, as required.** Read-only confirmation in W9-01 - all three
> `is_active = false` (Pilates Terapeutico 40.00, NESA 39.00, Massagem Terapeutica 50.00).
> Nothing in this wave reactivated, renamed, repriced, mapped or deleted any of them.
> Standing hazard recorded for any future loop: the legacy and canonical NESA rows share the
> EXACT display name "NESA" and differ only by id / price / active flag, so any future fix
> must match by **id**, never by name.
>
> **Residual, deliberately not actioned:** if item 4 referred to the PATIENT PORTAL rather
> than the staff platform, it is still live and is a code fix - the portal hard-codes
> `BOOKABLE_SERVICE_NAMES` (osteopatia, fisioterapia, massagem terapeutica, pilates
> terapeutico) at `apps/api/lib/appointments/services.ts:39-44`, which excludes NESA. The QA
> doc states "staff-platform QA" (`docs/qa/2026-07-16-castelo-branco-qa.md:3-4`), so the
> staff reading governs and this loop closes. Recorded in W9-01 Q-W9-01-1 for Rodica's
> re-check.
>
> Everything below is the ORIGINAL authored loop file, preserved unchanged for the record.
> It was never executed as written, because its premise did not survive recon.

GATE: **Wave 09 Correcoes CB, CONDITIONAL per W9-01 (a); any cloud DB write requires explicit owner authorization.** Makes NESA appear in the CB booking dropdown. **Consumes W9-01 finding (a).** Runs AFTER W9-06 merged and `origin/main` fast-forwarded. Starts from **fresh `origin/main`**; never stacked.

**Conditional path (resolved by W9-01 (a)):**
- **If the fix is CODE (the booking dropdown filter):** normal loop, **migration-free, GREEN self-merge**.
- **If the fix requires ANY cloud data write (a CB price row insert, an `is_active` flip, etc.):** the loop **HALTs to the mailbox with the exact proposed write and waits for explicit owner authorization.** The cloud DB is READ-ONLY by standing rule and Wave 08's single authorized cloud write is SPENT. The three frozen legacy rows stay frozen regardless of the path.

## Field 1. Scope and ground truth

Fix item 4 of the CB QA (`docs/qa/2026-07-16-castelo-branco-qa.md`): the NESA service does not appear in the booking dropdown at Castelo Branco. After the fix, an eligible booker can select NESA when booking at CB.

Ground truth (recon at authoring 2026-07-16, embed - executor runs with ZERO memory; W9-01 (a) is the authoritative root cause, this is the starting map):
- **NESA exists in the CB catalog (50.00)** per the W8-01a owner-confirmed cloud seed (22 canonical services / 23 prices / 14 packs, tenant OsteoJP). So NESA is NOT missing from the catalog; the reason it does not appear in the CB booking dropdown is one of: (i) the CB NESA `service_location_prices` row is missing or inactive, so the offered-only-where-priced filter hides it; (ii) the NESA `services` row is inactive; or (iii) the booking creation dropdown filter is wrong. W9-01 (a) states which, with the row state read-only.
- **Offered-only-where-priced (W8-01a):** a service is offered at a location when an ACTIVE `service_location_prices` row exists for `(service, location)`. `isServiceOfferedAtLocation` / `listServiceOfferings` (`apps/web/lib/admin/services.ts`) encode this. **W6-01b split:** creation dropdowns show ACTIVE only; filter dropdowns include inactive. The booking creation dropdown is active-only by design - so if the CB NESA offering is missing/inactive, NESA is correctly hidden and the fix is DATA, not code.
- **The three frozen legacy rows (Pilates Terapeutico 40.00, NESA 39.00, Massagem Terapeutica 50.00) are DEACTIVATED and MUST NOT be touched or reactivated** (docs/QUESTIONS.md 2026-07-15 JP BATCH). The legacy "NESA" (39.00, inactive) is NOT the CB NESA (50.00) canonical row; do not confuse or reactivate the legacy row to "fix" the dropdown.
- **Cloud DB is read-only by standing rule.** Wave 08's ONE authorized cloud write (the W8-01a catalog seed) is spent. Any further cloud write is owner-authorized only. Local dry-run against `127.0.0.1` is fine.

**Scope:** make NESA selectable in the CB booking dropdown, per the W9-01 (a) root cause. If code: fix the booking dropdown filter. If data: propose the exact narrow cloud write and HALT for owner authorization; never write to the cloud DB autonomously. Frozen legacy rows untouched.

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; assert `origin/main` contains W9-06's merge; `git worktree add ../osteojp-w9-07-nesa-catalog origin/main -b osteojp-w9-07-nesa-catalog`; assert toplevel + clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Consume W9-01 (a):** read `docs/recon/W9-01-findings.md` section (a); confirm the exact cause + the CB NESA row state; paste the citation. **Set this loop's path (code vs cloud-write) BEFORE acting.**
3a. **[Code path]** Fix the booking creation dropdown filter so an ACTIVE, CB-offered NESA is selectable at CB; add a test that CB booking offers NESA and a non-offered service is absent; verify no other location's dropdown regresses. Migration-free.
3b. **[Cloud-write path]** Do NOT write to the cloud. Reproduce the fix on LOCAL `127.0.0.1` (insert/activate the CB NESA offering there), paste the local before/after row state, then HALT to `~/osteojp-mailbox/escalations` with the EXACT proposed cloud write (table, `(service, location)`, price in cents, active flag) and wait for explicit owner authorization. Only after written owner authorization does the owner (or an owner-authorized step) apply the narrow write; the frozen legacy rows are never part of it.
4. **Tests:** CB booking offers NESA (code path proves it against fixtures; cloud-write path proves it locally); a service with no active CB offering is correctly absent; the three frozen legacy rows remain inactive and are not reactivated. **E2E:** booking at CB lists NESA (on the applicable path's fixtures/local data).
5. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`. JSON.parse both i18n files. Confirm `git diff --name-only origin/main` shows ZERO migration + ZERO workflow files (both paths are migration-free; the cloud-write path is a DATA op, not a schema change).

## Field 3. Definition of done (machine-verifiable)
- **Path PROOF:** the W9-01 (a) cause is cited and this loop's path (code vs cloud-write) is stated.
- **[Code path] Dropdown PROOF:** CB booking offers an active CB-offered NESA; a non-offered service is absent; no other location regresses. Paste the test + E2E. Migration-free diff pasted.
- **[Cloud-write path] Authorization PROOF:** the local `127.0.0.1` reproduction + before/after row state pasted; the exact proposed cloud write recorded in the mailbox; the loop HALTED for owner authorization (the cloud write is NOT performed autonomously). No cloud write appears without a referenced owner authorization.
- **Frozen-rows PROOF:** Pilates Terapeutico 40.00 / NESA 39.00 / Massagem Terapeutica 50.00 remain inactive and untouched. Paste the assertion/read.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The W9-01 (a) citation, the path decision, the dropdown test/E2E (code) OR the local reproduction + mailbox authorization request (cloud-write), the frozen-rows proof, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main` (contains W9-06). **Migration-free** (both paths are code or DATA, never schema; a schema need is a HALT).
- **The cloud DB is READ-ONLY.** No autonomous cloud write. A data fix HALTs for explicit owner authorization with the exact proposed write; Wave 08's single authorized cloud write is spent.
- **The three frozen legacy rows stay frozen** (never reactivate the legacy NESA 39.00 to fix the dropdown; the canonical CB NESA is 50.00).
- **Local dry-run only for the data path** (`127.0.0.1`); SYNTHETIC data. Do NOT run destructive QA against **Maria Joao Silva** (`triboimax635+maria@gmail.com`); disposable test patients only; reference therapist **Tiago Reis**.
- pt-PT i18n (both files, JSON.parse both); no emoji; UI-STYLE.md. DB access only through `packages/db`. Audit any mutation (rule 6). **Never force-push / `--admin`.** Plain hyphens only.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR `origin/main` does NOT contain W9-06's merge.
- **W9-01 (a) says the fix requires a cloud data write** - HALT to the mailbox with the exact proposed write (table, keys, cents, active flag) + the local reproduction, and wait for explicit owner authorization. Do NOT write to the cloud autonomously.
- The fix would require touching/reactivating a frozen legacy row - HALT (the frozen rows are owner/JP-gated; the canonical CB NESA is the target, never the legacy row).
- The fix would require a schema change - HALT (this loop is code or DATA, not a migration).

## Field 7. Report back
The W9-01 (a) citation, the path decision, the dropdown test/E2E OR the local reproduction + mailbox authorization request, the frozen-rows proof, suite counts, PR number.

## Merge policy (embed, Wave 09 Correcoes CB)
- **W9-07 is CONDITIONAL, resolved by W9-01 (a):** code path -> **GREEN self-merge** (migration-free); cloud-write path -> **HALT for explicit owner authorization** of the exact narrow write before any cloud mutation, then the owner authorizes/applies. In both paths all required checks (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) must be green, read from the checks API NOT the banner.
- **Runs after W9-06 merged**, fresh `origin/main`, never stacked. The cloud DB is read-only; the single Wave 08 authorized write is spent. Workflow files NEVER touched. JSON.parse both i18n files. HALT-LOUD on scope/product/data/reality mismatch; any cloud-write proposal escalates for owner authorization.
