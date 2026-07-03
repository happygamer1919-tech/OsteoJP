# Loop W2-13 - SMS confirmation flow: SPEC ONLY (no build)

GATE: none — GREEN runner (Wave 02 single-executor, DECISIONS 2026-07-03). Docs-output loop: authors a SPEC and QUESTIONS entries only, ZERO product/build code. Twilio is a NEW third-party vendor (owner-confirmable, CLAUDE.md) — this loop specifies and logs the vendor question; it does NOT wire, install, or configure anything. Open PR and apply the merge gate.

## Field 1. Scope and ground truth
Author `docs/design/SPEC-sms-confirmation.md`, a specification for an SMS appointment-confirmation flow. SPEC ONLY — no build this wave, no dependency added, no Inngest job created, no Twilio account wired. The SPEC captures the design so a future build loop (gated on the vendor decision) has a source of truth.

Ground truth to align with: the 0024 confirmation axis (`confirmation_state` pending/confirmed/declined, `confirmation_received_at`, `confirmation_channel` free text — DECISIONS 2026-07-01), which this flow FLIPS; multi-tenant + tenant-from-JWT/token rules (CLAUDE.md hard rules); EU data residency (Resend EU precedent; Twilio region considerations). Reference the existing stack (Inngest for jobs, `packages/integrations` as the vendor home).

SPEC contents (author into the file):
- **Sender:** Twilio PT SMS sender.
- **Reminder job (Inngest):** sends a day-before and a same-day-morning reminder per upcoming appointment.
- **Message:** carries a signed SHORT LINK to a PUBLIC, no-login confirm page with **SIM** and **NÃO** buttons.
- **Confirm action:** tapping SIM/NÃO flips the 0024 axis — `confirmation_state` = confirmed/declined, `confirmation_received_at` = now, `confirmation_channel` = `sms`.
- **Token:** HMAC-signed, SINGLE-appointment scope, with an expiry window. The tenant is derived SERVER-SIDE from the token, NEVER from the request payload (multi-tenant hard rule). Token is single-use or idempotent-flip (specify).
- **Abuse / rate considerations:** link expiry, single-appointment scope, rate limiting on the confirm endpoint, no enumeration (opaque token), what happens on an expired/replayed/invalid token.
- **Explicit non-goals:** NO inbound reply-text parsing (SIM/NÃO by SMS reply is out of scope; only the link page); NO build this wave; no other channel.

Open questions to LOG in `docs/design/QUESTIONS.md` (canonical shelf) — these are JP/owner decisions, not spec'd here:
- Message wording (pt-PT copy of the SMS + confirm page).
- Exact send times (what "day-before" and "same-day-morning" mean in Europe/Lisbon, e.g. 18:00 D-1 and 08:00 D0).
- Opt-out handling (STOP/consent, per-patient SMS preference, GDPR).
- (Implicit) Twilio-as-new-vendor approval + EU-region/data-residency confirmation (owner-confirmable).

## Field 2. Ordered steps
1. A0 isolation guard: `git worktree add ../osteojp-w2-smsspec origin/main -b osteojp-w2-smsspec`; assert toplevel ends in the worktree name; assert clean tree. HALT if either fails.
2. Author `docs/design/SPEC-sms-confirmation.md` with the contents above, aligned to the 0024 axis and the tenant-from-token rule. Mark it clearly SPEC ONLY / no-build-this-wave and note the Twilio vendor gate.
3. Append the open questions to `docs/design/QUESTIONS.md` (canonical shelf), dated, with recommended defaults where reasonable (send times, opt-out) and the Twilio-vendor owner-confirmable item.
4. No product code, no dependency, no workflow. Verify docs-only.

## Field 3. Definition of done (machine-verifiable)
- `docs/design/SPEC-sms-confirmation.md` committed with all specified sections (sender, reminder job, message, confirm action flipping the 0024 axis, token/HMAC/single-scope/expiry/tenant-from-token, abuse/rate, explicit non-goals).
- `docs/design/QUESTIONS.md` gains the open items (wording, send times, opt-out, Twilio vendor).
- Docs-only PROOF: `git diff --name-only origin/main` shows ONLY `docs/design/SPEC-sms-confirmation.md` and `docs/design/QUESTIONS.md` (nothing under `apps/`, `packages/`, `supabase/`, `.github/`). Paste it.

## Field 4. Verification (paste evidence)
The docs-only `git diff --name-only`, the SPEC section list, the QUESTIONS entries added.

## Field 5. Restrictions and scope boundary
- SPEC ONLY. ZERO build: no Twilio dependency, no Inngest job, no confirm-page route, no `packages/integrations` wiring, no env/secret, no schema. Docs files only.
- Twilio is a new vendor: log it as owner-confirmable, do NOT introduce it.
- Tenant is derived from the signed token server-side, never payload — state this as a hard requirement in the SPEC.
- Canonical shelf only (`docs/design/`); legacy `docs/` untouched. GREEN runner: self-merge only on all-green checks; never touch `db-tests.yml`/`e2e.yml` (this loop touches neither).

## Field 6. Halt loud if
- The 0024 confirmation axis as committed cannot express an SMS-driven flip (`confirmation_channel = sms`) without a schema change — surface it (the SPEC would then note a future migration, but flag the mismatch).
- Authoring the SPEC would require adding any non-doc file.

## Field 7. Report back
The docs-only diff, SPEC section list, QUESTIONS entries added, PR number. Open a PR per template and apply the MERGE GATE per LOOP-DISPATCH.md (GREEN runner: all required checks SUCCESS, docs-only diff, mergeable; a refused merge is a HALT).
