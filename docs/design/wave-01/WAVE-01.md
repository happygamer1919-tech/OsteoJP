# Wave 01 - Post-Presentation Adjustments

Source: first platform presentation to the clinic. Look and intent received positive feedback. This wave captures the changes surfaced by a hands-on workflow simulation. Reference clinic: https://osteojp.pt/

This file is the single human-readable source of truth for Wave 01. Ivan and Max both reference it across chat switches. If context is lost, start here.

## Owning principle: the migration fault line

Every item is one of three types:
- Schema or lifecycle (needs a migration, or changes how clinical/appointment data behaves) -> IVAN
- Pure UI, nav, or content (no migration, no data-model change) -> MAX
- Mixed (UI riding on a schema change) -> schema half is Ivan and lands first, UI half is Max and lands after

## Dependency model

The arrow points one way only: data lands green on main, then UI consumes it. Max never blocks Ivan. Ivan sometimes blocks Max. This is the actor-mechanism rule: the shared mechanism lands green before the feature that depends on it. Parallelism is across items, never within an item.

## Migration order: cheap to expensive

Ship migrations that unblock the most Max items first, lowest risk first. Order:
1. Patient migration (unblocks 4 Max items, lowest risk)
2. Therapist-service mapping
3. Appointment confirmation state
4. Appointment lifecycle (gated completion + per-visit notes, multi-therapist booking)
5. Batch scheduling engine
6. Event-tracking layer (greenfield, can run in parallel any time)

## Item inventory

### Section 1 - Inicio
- [ ] Remove "Proximas marcacoes" card from dashboard. MAX. Zero-dep.
- [ ] "Notas rapidas" persistence: unknown where Guardar writes. AUDIT first, then decide. See STATE.md.

### Section 2 - Agenda
- [ ] Appointment confirmation state (pending/confirmed/declined) + inbound capture from reminder. IVAN (state) + MAX (thumbs UI on preview). Reminder send is Stream E.
- [ ] Availability panel in new-appointment flow: after date + therapist selected, show booked vs free. IVAN (availability query) + MAX (panel UI).
- [ ] Auto-select service from therapist. IVAN (therapist-service mapping) + MAX (auto-select interaction).
- [ ] Batch scheduling: book a package across repeating slots, skip busy ones, report failures with nearest-alternative. IVAN (engine) + MAX (failure pop-up with busy date/hour and edit-and-rebook).
- [ ] Appointment history + per-visit notes; appointment marked completed only after a note is attached. IVAN (gated completion + notes relation). Designed together with Fichas relocation.
- [ ] Multi-therapist booking: two appointments, two therapists, one patient, one tab. IVAN (creation path / booking group).

### Section 3 - Patients
- [ ] "Schedule again" from patient profile: clone appointment, ask only new date/time. IVAN (clone path) + MAX (action UI).
- [ ] Remove "Fichas Clinicas" top-level section; render as a tab inside the patient profile. MAX (nav/routing/tab). Lands after gated-completion design settled. Treated as the staff-side patient profile, not the patient PWA.
- [ ] Patient identification number shown next to NIF on profile preview. IVAN (column + ID generation) + MAX (surface).
- [ ] Individual notes per patient. IVAN (column/relation) + MAX (surface).
- [ ] Profession field on patient. IVAN (column) + MAX (surface).
- [ ] Drop full address to city + region only. IVAN (column change) + MAX (surface).

### General
- [ ] Rename "Revisao" to "Revisao Consulta" (nav + page title). MAX. Zero-dep.
- [ ] Event-tracking foundation for KPIs: capture every relevant patient/therapist/finance event now; KPI dashboard ships later. IVAN. See SPEC-events.md.

## Ivan queue (ordered)
1. Dispatch read-only audit (Notas rapidas, history retention, schema dump). Writes STATE.md.
2. Patient migration + Event schema (parallel worktrees).
3. Therapist-service mapping + Appointment confirmation state.
4. Appointment lifecycle (gated completion + per-visit notes, multi-therapist) + Batch engine.

## Max queue (ordered, with lands-after)
1. Remove Proximas marcacoes card. Zero-dep, start day one.
2. Rename Revisao to Revisao Consulta. Zero-dep, start day one.
3. Patient-profile surfacing (ID, profession, city/region, notes). Lands after patient migration green.
4. Confirmation thumbs on preview. Lands after confirmation-state column green.
5. Auto-select service. Lands after therapist-service mapping green.
6. Availability panel. Lands after availability query confirmed.
7. Fichas-as-tab. Lands after gated-completion design settled.
8. Schedule-again action. Lands after appointment-clone path green.
9. Batch pop-up. Lands after batch engine green.

## Day-one parallelism
Ivan: audit dispatch + (on return) patient migration + event schema.
Max: remove card + rename Revisao, simultaneously.
Both saturated. Ivan stays one item ahead so Max's queue is fed at the rate he consumes it.

## Hard rules carried from project locks
- One migration in flight at a time, sequential numbering. Feature PRs migration-free.
- Parallel terminals each in isolated git worktrees off origin/main.
- Any PR touching db-tests.yml or e2e.yml is an automatic hold for Ivan line-by-line review.
- Clinical record editor stays frame-free.
- Patient-submitted forms land pending_review, never auto-finalize.

## Open questions
See docs/design/QUESTIONS.md. Three items gate specific loops: patient ID format (JP), VAT in KPI finance (accountant), gated completion hard-vs-soft (JP).
