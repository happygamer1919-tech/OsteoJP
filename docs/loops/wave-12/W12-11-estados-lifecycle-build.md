# Loop W12-11 - BUILD estados lifecycle + notifications + inbound SMS (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, BUILD, GATED on W12-10 SPEC + owner vendor/flag approvals. OWNER-MERGE (migration + Twilio/Resend flags + net-new inbound webhook). CYAN pre-merge audit mandatory.** Implements the estado visuals + the confirm-page/inbound-SMS flow that writes the confirmation axis, per `docs/design/SPEC-estados-lifecycle.md`. Almost certainly SPLITS into sub-loops at scoping (visuals; confirm-page; inbound webhook; opt-out) - one migration in flight, one PR in flight. Starts from **fresh `origin/main`**; never stacked.

## Preconditions (hard gate)
1. **W12-10 merged** and the SPEC accepted.
2. **Owner approvals present:** Twilio-as-vendor + Twilio EU-region + signed DPA (CLAUDE.md rule 8); the `REMINDERS_LIVE_SEND` / Twilio inbound flags; the Q-W12-01 (Cancelada vs Falta visuals) + Q-W12-03 (inbound consent/STOP/keywords) rulings. Absent any of these, the corresponding sub-part HALTS (Field 6); the visual-only sub-part may proceed if its Q is ruled.

## Field 1. Scope and ground truth

Build, per the spec and only within the ruled gates: (a) the estado visuals on the agenda + Marcacoes (glyph/colour per the Q-W12-01 ruling, colour-not-only, aria/hover carry the estado); (b) a confirm-page + inbound-SMS flow that WRITES `appointment_confirmation_state` (and flips `status` to cancelled on a negative reply) idempotently; (c) STOP/opt-out + abuse/rate + no-PII logging. Reuse the existing dual-axis columns; add only what the spec's build-gate list requires.

Ground truth (from W12-10 SPEC + recon; executor re-verifies, ZERO memory):
- Columns exist: `appointment_status`, `appointment_confirmation_state` + `confirmation_received_at` + `confirmation_channel` (`schema.ts:42-58,571-579`). Reuse; do NOT add a merged status column.
- `confirmation_state` has NO writer today (display-only); this build adds the writer via the confirm page + inbound webhook.
- Resend booking email + Twilio reminders exist (sandbox-gated); this build flips the live flags per owner + adjusts the reminder template to carry the confirm affordance per the spec; the `/api/inngest` middleware exclusion must be in place for deployed envs.
- Inbound SMS is net-new: a public Twilio inbound webhook + tenant/appointment resolution (signed token or pending-reminder correlation, NEVER trusting the request payload for tenant) + keyword parsing + idempotent flip + STOP handling.
- **Likely migration(s):** an inbound-message/opt-out log + idempotency (e.g. `sms_inbound_events` and/or `sms_opt_outs`) with `tenant_id` + RLS + an isolation test in the SAME PR (CLAUDE.md RLS rule). One migration in flight; head advances by one; apply is manual `drizzle-kit` direct (5432, cwd `packages/db`). Any RLS/isolation surface -> CYAN pre-merge audit mandatory.

**Scope:** as scoped by the spec's build-gate list, implemented behind the ruled flags, with the migration + its RLS isolation test in-PR. Likely to SPLIT (W12-11a visuals / W12-11b confirm-page / W12-11c inbound webhook + opt-out); each sub-loop is one migration + one PR max. Cloud stays REAL DATA ONLY; all verification on local `127.0.0.1` + Preview envs.

## Field 2. Ordered steps
1. **Precondition check:** confirm W12-10 merged + the owner approvals/rulings present; if a sub-part's gate is missing, HALT that sub-part (Field 6). **A0 isolation guard** off fresh `origin/main`; worktree; assert clean tree + HEAD == tip.
2. **Split decision:** if the spec's build-gate list is larger than one migration / one coherent PR, split into sub-loops and record the split in DECISIONS + the board; build ONE sub-loop now, the rest as gated followers.
3. **Estado visuals** (per Q-W12-01 ruling): render the estado glyph/colour on the agenda + Marcacoes, colour-not-only (estado in aria + hover), holding the strikethrough invariant (W12-01). Tests lock each estado -> glyph mapping + that Confirmada never strikes through.
4. **Confirm-page + writer:** build the signed-token confirm page that writes `confirmation_state` (SIM -> confirmed, NAO -> declined + `status=cancelled` per the spec), idempotent, tenant-from-token server-side only. Tests + the isolation guard.
5. **Inbound webhook + opt-out** (if its gate is ruled): the public Twilio inbound webhook, keyword parsing, idempotent flip, STOP/opt-out, per-IP/per-token rate limit, no-PII logging; migration for the inbound/opt-out log + RLS + isolation test in-PR.
6. **CYAN pre-merge audit** for any migration/RLS surface; live-apply the migration manually (direct 5432) with pasted journal evidence BEFORE DONE.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation), `pnpm build`, `pnpm test:e2e`; Preview-env app + portal smoke; `git diff --name-only origin/main` scoped to the sub-loop.

## Field 3. Definition of done (machine-verifiable)
- **Visual PROOF:** each estado renders its ruled glyph/colour; a test locks estado -> glyph + Confirmada != strikethrough. Screenshots per estado.
- **Writer PROOF:** an e2e/integration test shows SIM -> `confirmation_state=confirmed`, NAO -> `declined` + `status=cancelled`, idempotent re-tap, tenant derived server-side from the token (never the payload). Paste it.
- **Inbound PROOF (if built):** a test drives the webhook with a confirm keyword and a negative keyword + a STOP, asserting the idempotent flip + opt-out + no-PII log. Paste it.
- **Migration PROOF:** the migration + its RLS isolation test are in the SAME PR; CYAN audit CLEAN; manual live-apply journal pasted; head advanced by exactly one.
- **Flag PROOF:** the live flags are owner-set (by name, no secret values); the `/api/inngest` middleware exclusion present.
- **Gates green** incl. RLS isolation + Preview smoke.

## Field 4. Verification (paste evidence)
Per-estado screenshots, the confirm-writer test, the inbound test (if built), the CYAN audit + migration journal, the Preview smoke, suite counts, the osteojp-platform Preview URL + role steps, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **One migration in flight, one PR in flight**; if the spec needs more, SPLIT.
- **Never collapse the axes**; reuse the existing columns; the estados are presentation + writers over them.
- **Tenant is derived SERVER-SIDE from the signed token / verified correlation, NEVER from the request** (multi-tenant hard rule); the public webhook + confirm page trust nothing in the URL/body except the verified token.
- **Twilio EU-region + DPA + owner vendor approval are hard preconditions**; a US region or a missing DPA is a HALT, not a note. No secret VALUES in code/logs; no PII in SMS/logs/errors.
- **Every migration ships tenant_id + RLS + an isolation test in-PR + a CYAN pre-merge audit**; live-apply manual (direct 5432, cwd `packages/db`).
- Cloud is REAL DATA ONLY; verify on local `127.0.0.1` + Preview envs; pt-PT + en both; no emoji in product UI; plain hyphens; no em/en dashes; no new hex without token approval. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR W12-10 is not merged.
- Twilio EU-region / DPA / vendor approval is absent - HALT the SMS sub-parts (the visual-only sub-part may proceed if its Q is ruled).
- The Q-W12-01 (Cancelada vs Falta) or Q-W12-03 (inbound keywords/consent) ruling is missing - HALT the affected sub-part.
- The build cannot fit one migration / one PR - SPLIT and build one sub-loop (do not stack).
- Any inbound/confirm flow would derive tenant from the request payload, or any migration lacks its RLS isolation test - HALT.

## Field 7. Report back
Per-estado screenshots, the confirm-writer + inbound tests, the CYAN audit + migration journal, the Preview smoke, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-11 (and each sub-loop) is OWNER-MERGE.** It carries a migration + Twilio/Resend flags + a net-new public webhook + (visuals) an owner-visible surface - all owner-merge mandatory; NOT `[SELF-MERGE-OK]`. Required checks (DB-gated tests incl. RLS isolation, Lint+typecheck+test, Playwright E2E) + all three Vercel deploys green (checks API not banner) NECESSARY; **CYAN pre-merge audit mandatory** for the migration/RLS surface; the owner sets the flags + merges.
- **GATED on W12-10 + owner approvals**; SPEC-first. One migration in flight, one PR in flight, fresh `origin/main`, never stacked. Workflow files never touched. HALT-LOUD on EU-residency / auth-hook / tenant-from-payload / missing-isolation-test.
