# Loop W12-10 - SPEC estados lifecycle + Twilio/Resend wiring + inbound SMS (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, SPEC-FIRST (biggest item). OWNER-MERGE (spec doc, no product code).** Authors `docs/design/SPEC-estados-lifecycle.md`: the exact estados + visuals Rodica specified, mapped onto the EXISTING dual-axis schema (never collapsed), the Resend booking email + Twilio reminder wiring, and the NET-NEW inbound-SMS reply capability. Adds NO product code, NO dependency, NO migration, NO env/flag - it is a design source of truth that gates the W12-11 build. Registers the Cancelada-vs-Falta visual conflict + the inbound-SMS questions. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Produce a committed SPEC that (a) names each estado + its glyph/colour, (b) maps them onto the two orthogonal axes without collapsing them, (c) specifies the Resend/Twilio send points + the net-new inbound reply flow, (d) reconciles the conflicts with the W11-00 agenda rules, and (e) enumerates the owner/JP/Rodica/vendor gates. NO build.

Ground truth (recon at authoring 2026-07-23, embed - the spec author verifies, ZERO memory):

- **The dual axes EXIST and must stay orthogonal (never merge, same discipline as record_status vs ai_review_state):**
  - Lifecycle `appointment_status` = scheduled / confirmed / completed / cancelled / no_show (`packages/db/src/schema.ts:42-48`).
  - Confirmation `appointment_confirmation_state` = pending / confirmed / declined + `confirmation_received_at` + `confirmation_channel` (`:54-58`, `:571-579`; migration 0024).
- **Rodica's 5 estados map onto the axes as a PRESENTATION, not new columns:**
  - **Agendada** (yellow circle) = `status=scheduled` (+ confirmation `pending`). Resend booking-confirmation email at booking.
  - **Confirmada** (thumbs-up, green) = `confirmation_state=confirmed` (patient confirmed via the 24h Twilio reminder, by link press OR SMS reply).
  - **Concluida** (green circle) = `status=completed` (arrived + completed).
  - **Cancelada** (thumbs-down, red) = `status=cancelled` (patient replied negative).
  - **Falta** (patient name crossed with a line) = `status=no_show` (did not show).
- **What is ALREADY wired (spec confirms, does not re-build):** Resend booking-confirmation email FIRES on appointment create (`apps/web/lib/reminders/inngest/functions.ts:129-142` -> `dispatch.ts:254-291`), sandbox-gated by `REMINDERS_LIVE_SEND` (`clients.ts:44-46`); the current template carries a reschedule/cancel link, NOT a SIM/NAO confirm link (`templates.ts:255-281`). Twilio outbound reminders EXIST (48h + 24h offsets, `offsets.ts:20-22`) via Inngest, sandbox-gated; the `/api/inngest` route needs the known middleware exclusion for deployed envs.
- **What is ABSENT and NET-NEW (the spec must design):**
  - **A confirm-page flow that WRITES `confirmation_state`.** Today NOTHING writes it (display-only; set only by DB default + clone reset `clone-core.ts:9`). `docs/design/SPEC-sms-confirmation.md` specs a signed SIM/NAO link page that flips the 0024 axis, but it is unbuilt AND its section 8 explicitly makes inbound reply parsing a NON-GOAL. **This SPEC SUPERSEDES SPEC-sms-confirmation.md section 8** (adds inbound) and subsumes the link-page flow; cross-reference and mark the older non-goal as revised.
  - **Inbound SMS reply handling** (patient texts a confirmation or a negative) - no Twilio inbound webhook / TwiML / reply parser exists anywhere (recon: entirely absent). This is a net-new capability: a public Twilio inbound webhook, tenant/appointment resolution from the sender + a signed token or a pending-reminder correlation, keyword parsing (SIM/confirm vs negative), idempotent axis/status flip, STOP/opt-out handling, abuse/rate limits, no-PII logging.
- **CONFLICTS to reconcile in the spec (register the ones needing Rodica/owner):**
  - **Cancelada vs Falta vs the W11-00 cancelled=line-through rule.** W11-00 v3 locked the agenda face to a NAME-ONLY list with `cancelled = line-through` (the sole non-name cue). Rodica now wants Falta = "name crossed with a line" (also a strikethrough) AND Cancelada = a red thumbs-down. Two strikethrough-like cues (Cancelada line-through vs Falta crossed name) collide. **Register Q-W12-01: distinct visuals for Cancelada vs Falta** (recommended default: Falta = strikethrough on the name; Cancelada = a distinct red glyph, NOT a strikethrough, so the two never look alike) - Rodica to confirm.
  - **Estado glyphs vs the W11-00 name-only face.** The agenda face is deliberately name-only (Fisiozero ruling). Adding per-estado glyphs (yellow circle / thumbs / green circle) re-introduces non-name cues. The spec proposes WHERE glyphs live (a small leading estado marker before the name, colour-not-only with the estado also in the hover/aria) and flags that this is a controlled amendment to the name-only ruling; if the owner wants the face to stay pure name-only, glyphs live only in the hover + Marcacoes. Register as an owner decision if not clearly resolvable.
  - **Fold in the strikethrough-on-confirmed defect (W12-01):** the spec states the canonical binding once - strikethrough belongs to Falta (and/or Cancelada per Q-W12-01), NEVER to Confirmada; W12-01 holds the interim invariant, this spec sets the final language.
- **Vendor/legal gates the spec must name (not decide):** Twilio is a NEW vendor - owner-confirmable; Twilio EU region + signed DPA is a hard GDPR requirement (CLAUDE.md rule 8; the W11-05 Twilio-EU/DPA follow-up); inbound SMS consent + STOP/opt-out is a legal/JP decision; send times + pt-PT copy are JP/owner decisions; which negative keywords map to Cancelada is a Rodica/JP decision.

**Scope:** ONE committed doc `docs/design/SPEC-estados-lifecycle.md` + the Q registrations + a cross-reference note in `SPEC-sms-confirmation.md` marking section 8 superseded. NO product code, NO migration, NO dependency, NO env/flag. The only writes are the spec doc, the QUESTIONS entries, and the cross-reference note.

## Field 2. Ordered steps
1. **A0 isolation guard** off fresh `origin/main`; worktree `../osteojp-w12-10-estados-spec`; assert clean tree + HEAD == tip. HALT (Field 6) if any fails.
2. **Verify the ground truth read-only:** confirm the two enums/columns, the Resend/Twilio wiring + sandbox flag, the absence of a `confirmation_state` writer + any inbound webhook. Paste the anchors.
3. **Author `docs/design/SPEC-estados-lifecycle.md`:** the estado table (glyph/colour/axis mapping), the send points (Agendada email at booking; 24h Twilio reminder -> Confirmada on confirm; negative reply -> Cancelada; no-show -> Falta), the inbound-SMS design (webhook, tenant/appointment resolution, keyword parsing, idempotent flip, STOP/opt-out, abuse/rate, no-PII), the confirm-page flow (subsumes SPEC-sms-confirmation), the visual reconciliation with W11-00, and an explicit build-gate list (vendor + flags + migrations the W12-11 build will need). Keep the axes orthogonal throughout.
4. **Reconcile SPEC-sms-confirmation.md:** add a header note that section 8's "no inbound reply parsing" non-goal is SUPERSEDED by SPEC-estados-lifecycle (do not delete history; annotate).
5. **Register questions** in `docs/design/QUESTIONS.md` (Q-W12-01 Cancelada-vs-Falta visuals for Rodica; Q-W12-03 inbound-SMS consent/STOP/keywords + Twilio EU/DPA for owner/JP; plus send-times/copy if not already covered by the 2026-07-03 SMS-confirmation questions - reference them, do not duplicate).
6. **Gate (docs-only):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` still green (no code touched); `git diff --name-only origin/main` shows ONLY `docs/` files.

## Field 3. Definition of done (machine-verifiable)
- **Spec PROOF:** `docs/design/SPEC-estados-lifecycle.md` exists with: the 5-estado table (glyph + colour + axis mapping), the axes kept orthogonal (no proposed merged column), the send points, the inbound-SMS design, the confirm-page flow, the W11-00 visual reconciliation, and a build-gate list. Paste the estado table + the build-gate list.
- **Supersede PROOF:** `SPEC-sms-confirmation.md` carries the section-8-superseded note. Paste it.
- **Conflict-registration PROOF:** Q-W12-01 (Cancelada vs Falta) + Q-W12-03 (inbound SMS consent/keywords/Twilio EU-DPA) exist in QUESTIONS with recommended defaults. Paste them.
- **No-code PROOF:** `git diff --name-only origin/main` shows ONLY `docs/` files. Paste it.
- **Gates green** (docs-only).

## Field 4. Verification (paste evidence)
The estado table + axis mapping, the build-gate list, the inbound-SMS design summary, the supersede note, the Q registrations, the no-code diff, gates green, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **SPEC ONLY - NO BUILD:** no product code, no migration, no dependency, no env/flag, no Twilio/Resend change. The doc adds design, not behaviour.
- **Never collapse the two axes** - the estados are a presentation over `appointment_status` + `appointment_confirmation_state`; the spec proposes NO merged status column.
- **Twilio is a NEW vendor + EU/DPA is a hard rule** - the spec NAMES these gates; it does not decide or wire them.
- **Inbound SMS consent/STOP is legal/JP** - specced as a requirement, gated, not decided.
- Plain hyphens; no emoji in product copy examples; no em/en dashes; pt-PT copy examples correct. **Never force-push / `--admin`.** No PII, no secret values.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails.
- The ground truth diverges from recon (e.g. a `confirmation_state` writer already exists, or an inbound webhook is present) - record it and adjust the spec; HALT only if it changes the scope materially.
- Rodica's estado set cannot be expressed WITHOUT collapsing the two axes - HALT to a Q; never propose a merged status column.

## Field 7. Report back
The estado table + axis mapping, the build-gate list, the inbound-SMS design summary, the supersede note, the Q registrations, the no-code diff, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-10 is OWNER-MERGE (SPEC doc; DECISIONS/spec-class change).** Docs + spec are agent-governing-adjacent and set product direction; all required checks + all three Vercel deploys green (checks API not banner) necessary; the owner reviews the spec + rulings and merges. NOT `[SELF-MERGE-OK]`.
- **SPEC-FIRST:** the W12-11 build is GATED on this spec merged AND the owner's Twilio-vendor + EU/DPA approval + the Q-W12-01/Q-W12-03 rulings. Fresh `origin/main`, one PR in flight, never stacked. Workflow files never touched. HALT-LOUD on any attempt to collapse the axes or to build here.
