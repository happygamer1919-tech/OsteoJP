# Pre-Launch — state snapshot (2026-07-30)

Persisted ground truth for the OsteoJP pre-launch run (GREEN executor), so status
survives chat boundaries. **Source of truth for status is the board JSON**
(`docs/board/prelaunch-board.json`, validated by `docs/board/validate-board.mjs`,
rendered by `docs/board/render-board.mjs`). The claude.ai artifact is only a RENDER
of that JSON — maintained in place via the Artifact `url=` param, never re-minted:
`https://claude.ai/code/artifact/83e26fe7-034c-4fb8-b45b-b1165a843d6d`.

This snapshot mirrors the board as of `as_of: 2026-07-30`.

---

## Launch gate — 7 / 9 passed (counted, never estimated)

Readiness is passed-over-nine; each condition is pass or fail, no partial credit.

| Gate | State | On | Condition |
|---|---|---|---|
| G1 | pass | ivan | Portal-readiness: Chris Macov seeded for client-portal testing |
| G2 | **fail** | ivan | REMINDERS_LIVE_SEND resolved and canary sender confirmed |
| G3 | pass | ivan | NEW_DB_PASSWORD rotated with full propagation |
| G4 | pass | ivan | Prod free of synthetic data (CYAN PASS, post INC-02) |
| G5 | pass | rodica | Rodica batch cleared or explicitly deferred with her sign-off |
| G6 | pass | ivan | Nine staff mailboxes created on webhs, invite tested to Chris Macov |
| G7 | pass | ivan | estados flags ON (CYAN CLEAR, SAFE-BUT-INERT) |
| G8 | **fail** | jp | Lawyer sign-off on the RGPD package incl. Twilio DPF/SCC line |
| G9 | pass | rodica | Rodica green light + freeze lift |

**Two gates open, both owner/people-side, neither code:**

- **G2 (Ivan)** — live-SMS env + canary. Needs `REMINDERS_LIVE_SEND=true` +
  `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` + a sender (`TWILIO_SMS_FROM` or
  `TWILIO_MESSAGING_SERVICE_SID`) + `INNGEST_EVENT_KEY` on **osteojp-platform** and
  **osteojp-api**; then a canary booked **through the prod UI** (a raw DB insert
  does not emit the Inngest reminder event). Cleanup script staged at
  `~/osteojp-mailbox/staged/canary-cleanup.mjs`, parameterised by the patient id
  Ivan returns after booking. See card `CANARY-reminder`.
- **G8 (JP)** — lawyer one-liner on the RGPD package (Twilio EU lawful-transfer
  already verified 2026-07-24: US1 + PT geo + DPA with EU SCCs/BCRs/DPF). Non-code.

---

## Shipped this window — PL-09 role + location access model (all 6 phases)

The big post-acceptance-test build. Owner-approved approach 2026-07-29: proper
phased build, each phase its own PR, **enabled after** the live acceptance test —
never a broad RLS flip mid-test. Scope basis = `staff_locations` (0038), the
assignment SET (multi-location safe).

Target model: **therapist** sees only own clients + own agenda; **reception** sees
all therapists/clients but only their location AND owns schedule editing (horários)
for their-location therapists; **admin** = almost-owner but limited to their
location (KPI + stats + agenda + staff + clients); **owner** full everywhere.

- **Phase 0 (#693)** — `resolveViewerLocationIds` foundation (viewer own-location
  resolver, DB-gated isolation test, no behaviour change).
- **Phase 1 (#694)** — app-layer scoping for reception + admin (`listAppointments`,
  `listPatients`/`searchPatients` WHERE `location_id ∈` viewer set; agenda location
  + therapist defaults). Owner/therapist unchanged.
- **Phase 2a (#697)** — patients RLS, **migration 0047**. New role-neutral helper
  `patient_visible_to_located_viewer` mirroring `patientLocationScope` + the
  no-lockout rule; deliberately does **not** reuse the stricter 0045 clinical helper
  (would hide rows the app shows). Reception allowed on demographics, unlike clinical.
- **Phase 2b (#702)** — appointments RLS, **migration 0048** + `appointment_conflicts`
  SECURITY DEFINER fn. Therapist own via `practitioner_id`/`practitioner_2_id`,
  admin + reception via `location_id ∈ staff_locations`, owner all. The privileged
  read-only conflict fn sees the full all-therapist / all-location / all-patient set
  so room + cross-location double-booking is still caught — and it **fixes the
  conflict-check regression 2a introduced** when the other appointment's patient was
  not visible to the booker. Deployed Option A (single apply, then merge immediately).
- **Phase 3 (#695)** — admin `statistics:read` granted + stat/KPI aggregates
  location-scoped; owner keeps all-locations.
- **Phase 4 (#696)** — admin panel reads/writes limited to the admin's location(s).
- **Phase 5 (#700)** — reception working-hours-manage capability + `/horários`
  editor, scoped to their-location therapists.
- Blueprint **#692**. `clinical_records` 0045 untouched (already matched target).

**Migrations honoured apply-BEFORE-merge** (the 0046 drift is the standing lesson):
#697 (0047) and #702 (0048) were held DRAFT until Ivan applied from the prod-apply
worktree (ref-guard `dfotoodqvmjhbdcxyaxf`) and CYAN ran an independent read; only
then merged. Both entries are present in the packages/db drizzle `_journal.json` on
main (journal idx 48). Also merged this window: **#701** (docs: correct prod project
ref, retired `jaxm…` → `dfoto…`).

The full shipped history (Wave 12 + PL-01..PL-07, INC/CB/JP follow-ups) is in
`docs/handoff/WAVE-12-CLOSE-20260727.md` and the board's SHIPPED lane (12 cards).

---

## Remaining — all blocked or deferred (no unblocked GREEN feature work)

The executor feature queue is **clear**. Every open card is owner/people-blocked or
explicitly deferred; none is buildable by GREEN without an owner input.

**Blocked on Ivan**
- `CANARY-reminder` — G2 above (env + UI-booked canary).
- `INC-02a` — Rodica has no safe test target (env fix); needs Ivan's decision.
- `INC-02b` — purge synthetic `Teste CB` from prod; CYAN inventory ready, needs
  the owner AUTORIZO phrase (owner-terminal destructive write).
- `JP-role-defect` — JP prod role = admin (confirmed); role-change to owner STAGED,
  needs AUTORIZO.
- `JP-mapping-frozen` — JP `therapist_services` map script FROZEN (wrong sha); needs
  owner re-confirm before any prod write.
- `INC-03-0045-jp-write` — 0045 access defect: JP (as admin) denied clinical-record
  write; resolves once the role-change lands (depends on `JP-role-defect`).

**Blocked on Rodica**
- `PL-04` — NESA: serviço-to-add vs specialty tag on David Batista (ambiguous);
  needs Rodica's product call.

**Blocked on JP**
- G8 lawyer sign-off (gate, not a card).

**Blocked on infra**
- `LE-ci-quarantine-reenable` — `therapist-blocks.spec.ts:97` skipped on CI only
  (degraded GitHub shared runners: 7s local → ~186s CI). Delete the `test.skip`
  line when runners recover. Tracked in `docs/QUESTIONS.md`.

**Deferred (todo, not launch blockers)**
- `PL-03b` — Declaração observações persistence (future owner decision).
- `LE-resend-deferred` — Resend live email for invite/login links (post-launch;
  Ativar login shows the link on screen meanwhile).

---

## Standing rules (owner, NON-NEGOTIABLE — unchanged)

1. **Migrations are apply-BEFORE-merge.** CYAN CLEAR → Ivan runs a terminal apply
   from the prod-apply worktree with pasted JOURNAL evidence → then merge. One
   migration in flight at a time.
2. **"Applied" = pasted journal output only** — never inferred from absence of
   runtime errors. UI render is never apply evidence.
3. **No cloud write without Ivan's AUTORIZO phrase.** GREEN never sources prod
   credentials; owner runs every prod write/apply/seed; GREEN stages the byte-exact
   `--preview` script (staged copies in `~/osteojp-mailbox/staged/`) and verifies
   from pasted evidence. Destructive ops are owner-confirmable — log and block.
4. **Self-merge only** when CI green + no migration in diff + no agent-governing
   files + CYAN-accepted DoD. Migrations build + HALT for owner apply-before-merge.
   Patient-facing UI takes the owner visual gate on a Vercel preview.
5. **No prod-connected execution from any Claude-attached shell**, dry-runs included.

---

## Continuity pointers

- **Board (source of truth):** `docs/board/prelaunch-board.json` →
  `node docs/board/validate-board.mjs` (must be green) →
  `node docs/board/render-board.mjs docs/board/prelaunch-board.json docs/board/prelaunch-board.rendered.html`.
  The rendered HTML is gitignored (build product); the artifact is re-published in
  place to `https://claude.ai/code/artifact/83e26fe7-034c-4fb8-b45b-b1165a843d6d`.
- **Loop files:** `docs/loops/prelaunch/` (these outrank any session prompt).
- **Memory notes:** `osteojp-wave12-execution` (execution doctrine + status log),
  `osteojp-pl09-location-access` (PL-09 complete state).
- **Mailbox:** `~/osteojp-mailbox` (inbox / outbox / escalations / staged). Prod
  apply worktree: `~/Documents/Projects/GitHub/osteojp-prod-apply` (holds `main`).
- **Prod:** Supabase `dfotoodqvmjhbdcxyaxf` (region Central EU / Frankfurt). Retired
  ref `jaxmkwoxjcgzkwxgbayx` — never target it. All QA on local Docker
  (127.0.0.1:54322); real data only on prod.

---

## Open loose end for the owner

- **DB password hygiene:** a prod DB password was pasted in chat during the PL-09
  apply window. Rotate it (G3 covers the launch-critical rotation; this is the
  belt-and-braces follow-up on the pasted value). Owner-side.
