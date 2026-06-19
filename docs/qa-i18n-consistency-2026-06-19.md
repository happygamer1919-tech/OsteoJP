# PT-PT i18n Consistency QA — 2026-06-19

**Scope:** Full pass of `packages/i18n/src/strings.pt.json`, `strings.en.json`, `portal/strings.pt.json`, `portal/strings.en.json`  
**Reference:** `docs/brand-voice.md` (§3.1 vocabulary table, §6 microcopy patterns, §7 do/don'ts)  
**Instruction:** Findings only. No string changes in this PR.  
**Previous review:** `docs/i18n-copy-review-2026-06-03.md` (CPY-01–CPY-06)

---

## Summary

| Category | Findings |
|---|---|
| consulta vs marcação term mixing | I-01 – I-06 |
| scheduled status: Agendada vs Marcada | I-07 |
| Capitalization (Title Case drift) | I-08 – I-11 |
| Brazilianism: Gerencie | I-12 |
| Sign-in term split within portal | I-13 |
| Therapy name separator (`:` vs `—`) | I-14 |
| Download term: Descarregar vs Transferir | I-15 |
| Ellipsis character (`…` vs `...`) cross-platform | I-16 |
| `link` vs `ligação` within portal | I-17 |
| Diverged `patientAppointments.error.noSlot` strings | I-18 |
| Fichas Clínicas vs Registos clínicos | I-19 |
| Telemóvel vs Telefone for the patient phone field | I-20 |
| Visitas vs consultas in portal dashboard | I-21 |

Total: 21 findings across 4 files.

---

## Category A — consulta vs marcação

Brand-voice.md §3.1 defines the split:  
- **Consulta** = "default for any scheduled session" (the clinical encounter)  
- **Marcação** = the booking entity, used in action CTA ("Nova marcação", "Cancelar marcação")

Brand-voice rule §7.3 is explicit: "Don't mix terms for the same concept on one screen."

### I-01 🔴 Portal cancel modal: title/button mismatch

**File:** `portal/strings.pt.json`

| Key | Current |
|---|---|
| `appointments.cancel_title` | "Cancelar **consulta**" |
| `appointments.cancel_confirm` | "Cancelar **marcação**" |

Same modal, two different nouns. Per §7.3 the title and CTA button must use the same term. The portal calls the concept "consulta" throughout (nav, dashboard, section header) so the button should match.

EN counterpart: `cancel_title` = "Cancel appointment" / `cancel_confirm` = "Cancel booking" — same mismatch.

---

### I-02 🔴 Portal booking flow uses "marcação" against portal's own "consulta" convention

**File:** `portal/strings.pt.json`

The patient portal consistently uses "consulta" for appointments in nav, dashboard, and the appointments section:

- `nav.appointments` = "Consultas"  
- `appointments.title` = "As minhas consultas"  
- `dashboard.next_appointment_title` = "Próxima consulta"

But the booking flow switches to "marcação":

| Key | Current |
|---|---|
| `booking.step_confirm` | "Confirmar **marcação**" |
| `booking.confirm_title` | "Resumo da **marcação**" |
| `booking.confirm_submit` | "Confirmar **marcação**" |
| `booking.pending_title` | "**Marcação** recebida" |
| `booking.pending_body` | "A sua **marcação** está a aguardar confirmação…" |
| `booking.pending_cta` | "Ver as minhas **consultas**" ← switches back on same screen |

The last entry compounds the issue: `pending_cta` switches back to "consultas" on the same success screen that has just called it a "marcação".

EN counterpart: `step_confirm` = "Confirm booking" vs `pending_cta` = "View my appointments" — same switch.

---

### I-03 🟡 Staff patients tab: title says "consultas", help text says "marcações"

**File:** `packages/i18n/src/strings.pt.json`

| Key | Current |
|---|---|
| `patients.emptyConsultasTitle` | "Sem **consultas**" |
| `patients.emptyConsultasHelp` | "As **marcações** deste paciente aparecem aqui." |

The title and its companion help text for the same empty state use different nouns. The key name (`emptyConsultasTitle`) signals the author intended "consultas"; the help text was written with "marcações". One of the two must align to the other.

---

### I-04 🟡 Staff patient list column header: "Última consulta" in a "marcações" context

**File:** `packages/i18n/src/strings.pt.json`

```
"patients.colLastVisit": "Última consulta"
```

This column appears in the patient list. The patients section tab for appointments is labelled "Marcações" (`patients.tabAppointments` = "Marcações"). The column header switching to "consulta" without context is inconsistent.

---

### I-05 🟡 Staff patient card section header: "Próxima Marcação" vs dashboard "Próximas Consultas Hoje"

**File:** `packages/i18n/src/strings.pt.json`

| Key | Current |
|---|---|
| `patients.nextAppointment` | "Próxima **Marcação**" |
| `dashboard.upcomingToday` | "Próximas **Consultas** Hoje" |

Both keys label a panel showing the patient's upcoming scheduled sessions. The patient card uses "Marcação"; the dashboard uses "Consultas". Brand-voice §3.1 says "Consulta" is the default for the encounter concept.

---

### I-06 🟡 Staff `clinical.emptyHelp`: "consulta" used in staff records context

**File:** `packages/i18n/src/strings.pt.json`

```
"clinical.emptyHelp": "Crie a primeira ficha a partir de uma consulta."
```

Reasonable phrasing, but inconsistent with the `dashboard.upcomingToday` / patients namespace which uses "marcação" for the same concept. If the platform settles "consulta" as canonical in the encounter context, this is fine and everything else needs to shift.

---

## Category B — Appointment scheduled status

### I-07 🔴 "Agendada" vs "Marcada" for the `scheduled` appointment status

**File:** `packages/i18n/src/strings.pt.json`

| Key | Current |
|---|---|
| `appointment.status.scheduled` | "**Agendada**" |
| `patientAppointments.status.scheduled` | "**Marcada**" |

Two different Portuguese terms for the same DB status value (`scheduled`). Staff-side shows "Agendada"; patient-facing shows "Marcada". If these strings ever appear on the same screen (e.g. a staff member viewing the patient portal flow) the inconsistency is user-visible. One canonical term must be chosen.

EN counterpart: `appointment.status.scheduled` = "Scheduled" / `patientAppointments.status.scheduled` = "Scheduled" — consistent in EN, inconsistent in PT only.

---

## Category C — Capitalization

PT-PT standard: sentence case (capitalize only first word and proper nouns). Title Case on section headers is not standard and should be used intentionally, if at all.

### I-08 🔴 "Nova Marcação" (Title Case) vs "Nova marcação" (sentence case) for identical copy

**File:** `packages/i18n/src/strings.pt.json`

| Key | Current |
|---|---|
| `patients.newAppointment` | "Nova **M**arcação" |
| `agenda.newAppointment` | "Nova **m**arcação" |
| `dashboard.tile.newAppointment` | "Nova **m**arcação" |

Three keys with the same visible label; two use sentence case (correct), one uses Title Case. The `patients.newAppointment` version is the outlier.

---

### I-09 🟡 "Próxima Marcação" Title Case in patients namespace

**File:** `packages/i18n/src/strings.pt.json`

```
"patients.nextAppointment": "Próxima Marcação"
```

Compared with similar strings that use sentence case: `dashboard.panelUpcoming` = "Próximas marcações". No consistent rule distinguishes why one is Title Case and the other is not.

---

### I-10 🟡 patients namespace section headers mixed: some Title Case, some sentence case

**File:** `packages/i18n/src/strings.pt.json`

Title Case (inconsistent with standard):
- `patients.recentEpisodes` = "Episódios **R**ecentes"
- `patients.paymentStatus` = "Estado de **P**agamento"
- `patients.nextAppointment` = "Próxima **M**arcação" (see I-09)

Sentence case (correct):
- `patients.tabSummary` = "Resumo"
- `patients.tabEpisodes` = "Episódios"
- `patients.tabAppointments` = "Marcações"

All four are section headers within the same patient card view. Only the subsection heading strings have drifted to Title Case.

---

### I-11 🟡 Legacy dashboard heading strings in Title Case

**File:** `packages/i18n/src/strings.pt.json`

Older dashboard string set uses Title Case throughout:
- `dashboard.upcomingToday` = "Próximas Consultas **H**oje"
- `dashboard.quickActions` = "Ações **R**ápidas"
- `dashboard.todayStats` = "Estatísticas de **H**oje"
- `dashboard.recentActivity` = "Atividade **R**ecente"

Newer dashboard strings added in later PRs use sentence case:
- `dashboard.panelUpcoming` = "Próximas marcações"
- `dashboard.seeFullAgenda` = "Ver agenda completa"
- `dashboard.weeklySummary` = "Resumo semanal"

Both sets appear in the same dashboard view. The older strings appear to pre-date the sentence-case convention. These four keys are candidates for the next copy sweep.

---

## Category D — PT-PT Register / Dialect

### I-12 🔴 "Gerencie" is a Brazilianism (PT-BR "gerenciar"; PT-PT uses "gerir")

**File:** `portal/strings.pt.json`

```
"auth.welcome_subtitle": "Gerencie as suas consultas, fichas e documentos."
```

"Gerencie" is the imperative of "gerenciar" (Brazilian Portuguese). European Portuguese uses "gerir" → imperative "Gira". Given that CLAUDE.md and brand-voice.md both require PT-PT and the brand positions itself as "padrão ouro," this Brazilianism is a direct register violation.

Suggested fix direction: "Gira as suas consultas, fichas e documentos." or restructure to avoid the imperative entirely (e.g. "Consulte e gira as suas consultas, fichas e documentos.").

No equivalent issue in the EN file.

---

## Category E — Sign-in terminology

### I-13 🟡 Portal mixes "Entrar" and "sessão" terminology for sign-in

**File:** `portal/strings.pt.json`

| Key | Current |
|---|---|
| `auth.login_title` | "Entrar" |
| `auth.login_submit` | "Entrar" |
| `auth.back_to_login` | "Ir para o início de **sessão**" |
| `auth.session_expired` | "…Por favor **entre** novamente." |

The portal uses "Entrar" for the sign-in button but `back_to_login` switches to "sessão" vocabulary (matching the staff platform's "Iniciar sessão"). Within a single auth flow the user sees both phrasings.

Staff platform for comparison: `common.signIn` = "Iniciar sessão", `login.title` = "Iniciar sessão", `login.submit` = "Iniciar sessão" — fully consistent.

A deliberate staff/patient register split ("Iniciar sessão" formal vs "Entrar" casual) is defensible, but the portal must then be internally consistent. `back_to_login` should match the portal's own "Entrar" choice.

---

## Category F — Therapy name separator

### I-14 🟡 RPG and NESA therapy names use `:` (staff) vs `—` (portal) as separator

**Files:** `strings.pt.json` and `portal/strings.pt.json` (same issue in both EN files)

| File | Key | Current |
|---|---|---|
| Staff PT | `intake.therapy.rpg` | "RPG**:** Reeducação Postural Global" |
| Portal PT | `intake.therapy.rpg` | "RPG **—** Reeducação Postural Global" |
| Staff PT | `intake.therapy.nesa` | "NESA**:** Neuromodulação Não Invasiva" |
| Portal PT | `intake.therapy.nesa` | "NESA **—** Neuromodulação Não Invasiva" |

Staff EN and portal EN have the same mismatch. If these strings are ever shown to a user who switches between the portal and a staff view (or if they share a component), the separator inconsistency will be visible.

---

## Category G — Download term

### I-15 🟡 "Descarregar" vs "Transferir" within the staff platform for the same action

**File:** `packages/i18n/src/strings.pt.json`

| Key | Current |
|---|---|
| `clinical.downloadPdf` | "**Descarregar** PDF" |
| `clinical.attachmentDownload` | "**Transferir**" |

Both are download/save-to-device actions in the same clinical records view. The portal uses "Transferir" consistently (`common.download` = "Transferir", `documents.download_pdf` = "Transferir PDF"). "Transferir" appears three times in the staff file and once in the portal; "Descarregar" appears once (clinical.downloadPdf only). Brand-voice.md does not specify a preference; "Transferir" is the de-facto majority term and should be canonical.

---

## Category H — Ellipsis character

### I-16 🟢 Staff platform uses `…` (U+2026); portal uses `...` (three ASCII periods)

**Files:** `strings.pt.json` vs `portal/strings.pt.json`

Staff: `common.loading` = "A carregar**…**"  
Portal: `common.loading` = "A carregar**...**"

This was partially flagged in CPY-02 (2026-06-03) for internal staff strings (fixed `superadmin.login.pending`). The cross-platform split was not addressed. Both files should use the Unicode ellipsis character `…`.

Affected portal keys (three ASCII dots): `common.loading`, `auth.login_email_placeholder` (within the value context), `booking.note_placeholder`.

---

## Category I — link vs ligação

### I-17 🟡 Portal mixes English "link" and Portuguese "ligação" for the same concept

**File:** `portal/strings.pt.json`

| Key | Current |
|---|---|
| `auth.activate_invalid_title` | "**Ligação** inválida ou expirada" |
| `auth.activate_invalid_desc` | "O **link** de ativação já não é válido…" |

Title and body for the same error screen use different words. The staff platform uses "ligação" throughout (`auth.setPassword.invalidTitle` = "Ligação inválida", `reschedule.invalidTitle` = "Ligação inválida ou expirada"). "Ligação" is the correct PT-PT term; "link" is an anglicism acceptable in informal contexts but inconsistent with "padrão ouro" clinical register.

---

## Category J — Diverged duplicate strings

### I-18 🟡 `patientAppointments.error.noSlot` wording differs between staff and portal

**Files:** `strings.pt.json` (flat key) vs `portal/strings.pt.json` (nested key)

| File | Current value |
|---|---|
| Staff `patientAppointments.error.noSlot` | "Não há horários disponíveis. Tente outro dia ou contacte a clínica." |
| Portal `patientAppointments.error.noSlot` | "Não há horários disponíveis **para esta combinação**. Tente outro dia ou contacte a clínica." |

These are logically the same error (no available slot) but have diverged. If the portal renders the staff-side key as a fallback, users would see different wording depending on code path. Both EN counterparts say "No slots available" (staff) vs "No slots available for this combination" (portal) — same divergence.

---

## Category K — Clinical record terminology

### I-19 🟡 "Fichas Clínicas" in nav/section vs "Registos clínicos" in patient card

**File:** `packages/i18n/src/strings.pt.json`

Brand-voice.md §3.1 defines: "Clinical record | **Registo clínico**"

Staff platform usage:

| Key | Current | Term |
|---|---|---|
| `nav.clinical` | "Fichas Clínicas" | fichas |
| `clinical.title` | "Fichas Clínicas" | fichas |
| `dashboard.tile.clinicalRecord` | "Ficha clínica" | ficha |
| `dashboard.kpiNewRecords` | "Novas fichas" | fichas |
| `patients.tabRecords` | "Registos clínicos" | registos |
| `patients.recordDefaultName` | "Registo clínico" | registo |
| `patients.emptyRecordsTitle` | "Sem registos clínicos" | registos |
| `patients.openRecord` | "Abrir registo" | registo |

The `patients.*` namespace consistently uses "registo/registos" (matching brand-voice canonical term), while the `clinical.*` namespace uses "ficha/fichas" throughout. These two terms appear to the user as labels for the same concept (a clinical record document).

Note: this also creates potential confusion with the **patient portal** where `nav.forms` = "Fichas" and `forms.title` = "As minhas fichas" refer to patient *intake forms* — a different concept but the same word.

---

## Category L — Phone field label

### I-20 🟢 "Telemóvel" (column) vs "Telefone" (form field) for the patient phone number

**File:** `packages/i18n/src/strings.pt.json`

| Key | Current |
|---|---|
| `patients.colPhone` | "Telemóvel" |
| `patients.fieldPhone` | "Telefone" |

The patient list column shows "Telemóvel" (mobile-specific) but the edit form field shows "Telefone" (general). These refer to the same DB column. Portuguese clinic patients overwhelmingly have mobile numbers, so "Telemóvel" is more accurate in both places. The portal uses `account.field_phone` = "Telemóvel" consistently.

---

## Category M — "Visitas" in portal

### I-21 🟡 Portal dashboard past-appointments panel uses "visitas" instead of "consultas"

**File:** `portal/strings.pt.json`

| Key | Current |
|---|---|
| `dashboard.past_appointments_title` | "**Visitas** recentes" |
| `dashboard.past_appointments_empty` | "Ainda não tem **visitas** registadas." |

Everywhere else in the portal, the patient's appointments are called "consultas". "Visitas" (visits) is not in the brand-voice vocabulary table and is not used anywhere else in either file. The rest of the appointments section (title, tabs, statuses, cancel flow) uses "consultas".

EN counterpart: `past_appointments_title` = "Recent visits" — same deviation from "appointments."

---

## Cross-file structural note (not a string issue)

The staff platform stores patient-facing error strings as flat keys:  
`"patientAppointments.error.notFound": "Consulta não encontrada."`

The portal stores the same logical strings as nested JSON:  
`"patientAppointments": { "error": { "notFound": "Consulta não encontrada." } }`

These are structurally incompatible formats. They cannot share a source of truth in the current structure. Any future unification of patient-facing errors would require a structural migration in one or both files. Flag for the next i18n architecture discussion.

---

## Findings requiring owner decision

None of the 21 findings require owner input — all can be resolved by engineering against the existing brand-voice.md rules. No new vendor, no compliance surface, no scope change.

---

## Quick-fix candidates (string-only, low risk)

If a separate "fix" PR follows this QA pass, the following are the lowest-risk changes (no component code changes needed):

1. **I-01** — `appointments.cancel_confirm`: "Cancelar marcação" → "Cancelar consulta" (portal PT + EN)
2. **I-07** — `patientAppointments.status.scheduled`: "Marcada" → "Agendada" to align with `appointment.status.scheduled` (or vice versa — one canonical term required)
3. **I-08** — `patients.newAppointment`: "Nova Marcação" → "Nova marcação"
4. **I-12** — `auth.welcome_subtitle`: "Gerencie" → "Gira" (or restructure)
5. **I-13** — `auth.back_to_login`: "Ir para o início de sessão" → "Entrar" (or unify on "Iniciar sessão")
6. **I-15** — `clinical.downloadPdf`: "Descarregar PDF" → "Transferir PDF"
7. **I-16** — Portal loading strings: `...` → `…`
8. **I-17** — `auth.activate_invalid_desc`: "link" → "ligação"
9. **I-20** — `patients.fieldPhone`: "Telefone" → "Telemóvel"
10. **I-21** — `dashboard.past_appointments_title` / `_empty`: "visitas" → "consultas"

Systemic decisions required before fixing I-02, I-03, I-04, I-05, I-06, I-18, I-19: the team must agree on the canonical consulta/marcação split per surface (portal vs staff) and the canonical clinical-records term (fichas vs registos).
