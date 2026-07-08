# Loop W5-12 - Therapist availability blocks (Batch 3) - RECON MISMATCH: time_off already exists

GATE: **Batch 3.** Briefing scoped this as migration **0034**. **RECON MISMATCH (below): the data model already exists (`time_off`, migration 0006), so 0034 is likely UNNECESSARY and this loop is probably migration-free.** Resolve the mode-distinction question (QUESTIONS Q-W5-7) BEFORE writing any migration. If it stays migration-free, it runs in parallel (no MIG-lane slot); if a minimal column is genuinely needed, it is sequential after 0033.

## Field 1. Scope and ground truth
Briefing intent: therapist availability blocks in two modes - **Bloqueio pontual** (a date plus an hour range within a day) and **Ausencia prolongada** (a date range, e.g. ferias). The per-therapist **Horarios** card gains a **Bloquear horario** entry with both modes. `getTherapistAvailability` and booking (including Agendar lote) exclude blocked slots. Existing appointments inside a new block are **listed as a warning, never auto-cancelled** (recommended default, QUESTIONS Q-W5-4).

**>>> RECON MISMATCH (2026-07-08) - surface at merge; do NOT open migration 0034 before resolving <<<**
The blocking **data model already exists**:
- **`time_off` table - migration `0006_availability_timeoff.sql`** (deployed): `id, tenant_id, user_id, starts_at timestamptz (UTC), ends_at timestamptz (UTC), reason time_off_reason ENUM(vacation, sick, holiday, other), note text`. A timestamptz range **structurally covers BOTH modes**: Bloqueio pontual = `starts_at`/`ends_at` within one day; Ausencia prolongada = `starts_at`/`ends_at` spanning days (reason `vacation` = ferias).
- The **conflict system already reads it**: `apps/web/lib/scheduling/conflict.ts` (`findScheduleConflicts` / `absencesOverlapping`) checks `time_off` at booking time, and `createAppointment` (`apps/web/lib/scheduling/actions.ts`) already refuses a booking overlapping an absence via `findConflictsForWindow`.
- **The two real gaps are BOTH migration-free:** (1) **no admin UI** - `apps/web/app/admin/working-hours/TherapistScheduleCard.tsx` has per-day toggle/time/location but **no "Bloquear horario"** entry; (2) **the availability query does NOT deduct blocks** - `apps/web/lib/scheduling/day-availability.ts` (`getTherapistAvailability`) returns `working - booked` only and does **not** subtract `time_off` (only the downstream conflict check does), so a blocked slot still shows as free in the availability view / lote generation.
- **Related open question Q-V2W2-1** (QUESTIONS): the Agenda "blocked-time band" was left unrendered pending "a blocked-time data model + query." `time_off` IS that model; integrating it into `getTherapistAvailability` here also unblocks that band (note the linkage; rendering the band is a separate presentation follow-up, not required by this loop).

**Recommended disposition (Q-W5-7, default):** build W5-12 **migration-FREE on the existing `time_off` table** - add the Bloquear horario UI (both modes map to a `time_off` row: pontual = same-day range, prolongada = multi-day range + reason vacation) and **integrate `time_off` into `getTherapistAvailability` and the lote availability check** so blocks are excluded everywhere. Reserve a **minimal migration 0034** ONLY if the owner wants a persisted pontual-vs-prolongada distinction or an explicit all-day/recurring-block flag that `time_off`'s current columns cannot express (the `reason` enum already separates ferias(vacation) from a general block(other)). Owner/Ivan confirms.

- **RECON FIRST (report BEFORE building):** re-verify `time_off` columns (0006) + that conflict.ts reads it + that `day-availability.ts` does NOT deduct it; decide, per Q-W5-7, migration-free-on-time_off (recommended) vs a minimal 0034; confirm the Horarios card structure + `saveTherapistScheduleAction`; confirm the lote availability path (`apps/web/lib/scheduling/lote.ts` / `batch.ts`) so blocks exclude there too.

**Scope:** Bloquear horario UI on the Horarios card supporting both modes; write blocks as `time_off` rows; **exclude blocked slots from `getTherapistAvailability` AND from booking + Agendar lote**; when a new block overlaps existing appointments, **list them as a warning, never auto-cancel** (Q-W5-4 default). Migration-free unless Q-W5-7 resolves toward a minimal column. pt-PT i18n (both files).

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w5-12-blocks origin/main -b osteojp-w5-12-blocks`; assert toplevel + clean tree. HALT (Field 6) if either fails.
2. **Recon, report BEFORE building:** the `time_off` columns (0006); conflict.ts reads it; `day-availability.ts` does not deduct it; the Horarios card + save action; the lote path. **State the Q-W5-7 disposition** (migration-free-on-time_off recommended).
3. **Decision gate (Q-W5-7):** default migration-free on `time_off`. Only if the owner confirms a needed mode/flag column -> a minimal 0034 (hand-authored SQL + `_journal.json`, mirror `db:sync-supabase --check`, live-apply, sequential after 0033). Do NOT open 0034 speculatively.
4. **Bloquear horario UI:** add the entry to `TherapistScheduleCard.tsx` with both modes (Bloqueio pontual = date + hour range; Ausencia prolongada = date range), writing `time_off` rows (Lisbon wall-clock -> UTC; reason mapping: ferias -> vacation, general -> other). List/edit/delete a therapist's blocks.
5. **Availability integration:** make `getTherapistAvailability` (`day-availability.ts`) deduct `time_off` from `free` (so blocks disappear from the availability view), and ensure booking + **Agendar lote** exclude blocked slots (lote availability check runs against blocks too). Keep the existing conflict.ts check.
6. **Existing-appointments warning:** when a new block overlaps existing appointments, **list them as a warning**; never auto-cancel (Q-W5-4 default).
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS if a column is added), `pnpm build`, `pnpm test:e2e` (create a pontual block -> that slot is unavailable in availability + lote + booking; create a ferias range -> those days unavailable; a block overlapping an appointment shows the warning, appointment survives).

## Field 3. Definition of done (machine-verifiable)
- **Migration disposition recorded:** either **migration-free PROOF** (`git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, `.github/workflows/`) OR, if Q-W5-7 forced a minimal 0034, the migration + `_journal.json` + `db:sync-supabase --check` parity + **live-apply proof**. Paste whichever applies.
- **Recon report pasted:** `time_off` exists (0006) + conflict.ts reads it + availability does not deduct it + the Q-W5-7 disposition.
- **Both modes proven:** e2e creates a Bloqueio pontual and an Ausencia prolongada, both written as `time_off` rows. Paste it.
- **Exclusion proven everywhere:** a blocked slot is excluded from `getTherapistAvailability`, from booking (`createAppointment` refuses), and from **Agendar lote**. Paste the tests (unit for the availability deduction + e2e for booking/lote).
- **Warning-not-cancel proven:** a new block overlapping an existing appointment surfaces a warning listing the appointment; the appointment is NOT cancelled. Paste it.
- **`.github/workflows` untouched PROOF.** Paste it.
- **Suite counts** (baseline web 816, @osteojp/db 56 + gated) with green gates.

## Field 4. Verification (paste evidence)
Recon report + Q-W5-7 disposition, the migration disposition (free proof OR 0034 + live-apply), the two-mode e2e, the exclusion tests (availability + booking + lote), the warning-not-cancel test, `.github/workflows` untouched proof, suite counts, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off `origin/main`.
- **Do NOT open migration 0034 by default** - the model exists (`time_off`, 0006). A migration happens only if Q-W5-7 confirms a needed column, and then it is hand-authored + mirrored + live-applied + sequential after 0033 (never `drizzle-kit generate`).
- **Reuse `time_off` + `conflict.ts`;** do not fork a parallel blocking model.
- **Warning, never auto-cancel** existing appointments in a new block (Q-W5-4 default). Clinical/scheduling data is never silently destroyed.
- **Exclusion must be everywhere blocks matter:** availability view, booking, AND Agendar lote (not just the conflict check).
- **Never touch `.github/workflows/`.** Audit on write (rule 6). UTC in DB, Lisbon for display.
- pt-PT i18n (both files), no emoji, UI-STYLE.md. **Never force-push / `--admin`.** Secrets never printed.

## Field 6. Halt loud if (CLASSIC halt)
STOP and report to Ivan; product/scope to `docs/design/QUESTIONS.md` with a recommended default. **Primary halt:** the migration-necessity call (Q-W5-7) - do not open 0034 without owner confirmation that `time_off` cannot express the required distinction. Also halt if: integrating blocks into `getTherapistAvailability` would force a shared-query change with ripple beyond scheduling; or the owner wants auto-cancel (a destructive, owner-confirmable change) instead of warn-only.

## Field 7. Report back
Recon report + Q-W5-7 disposition, the migration disposition, the Bloquear horario UI, the availability/booking/lote exclusion, the warning-not-cancel behavior, `.github/workflows` untouched proof, suite counts, PR number, and the Q-V2W2-1 linkage note. Close: open ONE PR against `main` and HALT for owner merge. Do NOT self-merge.
