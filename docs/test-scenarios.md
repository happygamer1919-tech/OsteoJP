# Test Scenarios (Plain English)

Critical staff-platform workflows, written for manual QA and as a source for
future Playwright specs. Grounded in the current `apps/web` e2e suite
(`apps/web/e2e/*.spec.ts`) and the app's actual UI copy (PT-PT, the default
locale) — not guessed. Where a scenario has no automated coverage yet, or the
feature isn't fully built, that's called out explicitly under "Edge cases".

Role permissions referenced below are the platform's permission matrix
(`packages/auth`): **Owner** and **Admin** have the broadest access;
**Therapist** is scoped to their own patients/calendar and can author/sign
clinical records; **Reception** (Receptionist) has no clinical-record access
at all.

---

## Pacientes

### Scenario: New patient registration
Actor: receptionist
Precondition: user is authenticated and on `/patients`.
Steps:
1. Click "Novo paciente".
2. Fill "Nome completo" (only required field).
3. Optionally fill date of birth, sex, NIF, telemóvel, email, morada, código postal, localidade, notas.
4. Click "Criar Paciente".
Expected result: browser navigates to the new patient's profile page (`/patients/<id>`); the heading shows the patient's full name; any optional fields entered are visible on the profile.
Edge cases:
- Submitting with only the full name filled in still succeeds (all other fields are optional).
- Creating two patients with the same name is allowed — patients are disambiguated by NIF/phone/id, not by name uniqueness.

### Scenario: Search for a patient by name
Actor: receptionist
Precondition: at least one active patient exists (e.g. seeded patient "Maria Silva").
Steps:
1. Go to `/patients`.
2. Type the patient's name into the search box ("Pesquisar por nome, NIF ou telefone").
3. Press Enter.
Expected result: URL gains a `?q=` query param; the results table narrows to the matching patient(s); the row shows the patient's NIF (below the name) and phone (in its own column).
Edge cases:
- A query that matches nothing shows "Sem resultados para esta pesquisa" rather than an empty table with no explanation.
- A soft-deleted ("Eliminado") patient never appears in search results, even if the name matches exactly.

### Scenario: Search for a patient by NIF
Actor: receptionist
Precondition: at least one active patient with a known NIF exists.
Steps:
1. Go to `/patients`.
2. Type the patient's NIF (numeric) into the search box.
3. Press Enter.
Expected result: the same search box resolves NIF matches as well as name matches; the matching patient's row is shown, with the NIF visible under the name.
Edge cases:
- A search query containing only digits (no letters) must not be confused with a phone-number search — both NIF and phone are digit-based, so the matching logic must not double-count or mis-rank results. (Existing e2e test `patients.spec.ts` covers name, NIF, and phone as three distinct search assertions against the same input box.)

### Scenario: View a patient's appointment history
Actor: therapist
Precondition: patient has at least one past or upcoming appointment; therapist is viewing their own patient (an admin can view any patient's history).
Steps:
1. Open the patient's profile (`/patients/<id>`).
2. Select the "Marcações" tab.
Expected result: a list of the patient's appointments (past and upcoming) is shown; each entry shows date, time, service, and status (Pendente / Confirmada / Concluída / Cancelada / Falta).
Edge cases:
- A patient with no appointments shows the "Sem consultas" empty state, not a blank tab.
- A therapist must not see appointments belonging only to a different therapist's patients (RLS/permission scoping — same pattern proven for clinical records and quick notes in `quick-notes.spec.ts` and `clinical.spec.ts`).

### Scenario: View a patient's clinical record history
Actor: therapist
Precondition: patient has at least one clinical record (draft, locked, or signed).
Steps:
1. Open the patient's profile (`/patients/<id>`).
2. Select the "Registos clínicos" tab.
Expected result: a list of the patient's clinical records is shown, each with template, status (Rascunho / Bloqueada / Assinada), and version; clicking a row opens the record.
Edge cases:
- Reception has no clinical-record access at all — the "Registos clínicos" tab (and clinical data generally) must not be reachable or visible to a reception-role user, confirmed by `clinical.spec.ts`'s "reception has no clinical access and is redirected away" test.
- A patient with no clinical records shows "Sem registos clínicos", not an empty table.

---

## Agenda

### Scenario: Book appointment for existing patient
Actor: receptionist
Precondition: at least one active patient, one active therapist, and one active location/service exist.
Steps:
1. Go to `/agenda`, select the desired day (day view).
2. Click "Nova Marcação".
3. In the dialog, type the patient's name into the "Paciente" combobox and select them from the dropdown.
4. Select "Terapeuta", "Localização", date, and time.
5. Click "Guardar".
Expected result: the dialog closes; the new appointment block appears on the agenda grid for that day/time, labelled with the patient's name.
Edge cases:
- Booking the same therapist at an overlapping time on the same day surfaces "Conflito de terapeuta" inside the dialog, with a "Guardar mesmo assim" override button — the conflicting appointment is never silently double-booked (see "Reschedule" and the conflict scenario below for the equivalent guardrail).
- The service/room/location fields interact with pricing and availability rules configured in Administração — an inactive location or service should not be selectable.

### Scenario: Reschedule an appointment
Actor: receptionist
Precondition: an existing appointment for a patient.
Steps:
1. Go to `/agenda`, find the appointment on the grid, and click it to open the dialog.
2. Change the date, time, therapist, and/or location.
3. Click "Guardar".
Expected result: the dialog closes; the appointment block now renders at the new date/time (e.g. moving from 10:00 to 11:00 re-renders as "11:00-12:00").
Edge cases:
- If the appointment is part of a recurring series, the drawer asks which scope to apply the change to: "Esta marcação", "Esta e seguintes", or "Toda a série".
- Rescheduling into a slot that creates a therapist/room/availability conflict surfaces the same conflict warning and "Guardar mesmo assim" override as booking a new appointment — the change is not auto-applied over a conflict.

### Scenario: Cancel an appointment
Actor: receptionist
Precondition: an existing, not-yet-cancelled appointment.
Steps:
1. Open the appointment from the agenda grid.
2. Change "Estado" to "Cancelada".
3. Optionally add a note explaining the reason.
4. Click "Guardar".
Expected result: the appointment's status becomes "Cancelada" on the agenda; the slot is freed for new bookings at that time.
Edge cases:
- Appointments are never hard-deleted, only cancelled (the UI copy is explicit about this: "As marcações nunca são eliminadas; apenas canceladas") — the appointment record and its history remain visible/auditable after cancellation.
- Cancelling one occurrence of a recurring series must respect the chosen scope ("Esta marcação" vs. "Esta e seguintes" vs. "Toda a série") rather than always cancelling the whole series.

### Scenario: Mark appointment as completed
Actor: therapist
Precondition: an existing appointment, typically on or after its scheduled time.
Steps:
1. Open the appointment from the agenda grid.
2. Change "Estado" to "Concluída".
3. Click "Guardar".
Expected result: the appointment's status badge updates to "Concluída" on the agenda grid.
Edge cases:
- Marking a future (not-yet-occurred) appointment as completed is not blocked by the UI — there is no client-side date guard preventing this, so this is worth a dedicated regression test if that behavior should be restricted later.
- Status can also be set to "Falta" (no-show) via the same select — a distinct terminal state from "Cancelada" and "Concluída", worth testing separately since it's not covered by the current `scheduling.spec.ts` suite.

### Scenario: View the weekly agenda for a specific therapist
Actor: receptionist
Precondition: at least one therapist with appointments in the current week.
Steps:
1. Go to `/agenda`.
2. Switch the view toggle from "Dia" to "Semana".
3. Use the therapist filter (defaults to "Todos os terapeutas") to select a single therapist.
Expected result: the grid shows only that therapist's appointments across the full week.
Edge cases:
- Switching back to "Todos os terapeutas" must restore the unfiltered view without needing a page reload.
- A therapist with zero appointments that week shows an empty grid, not an error.
- This view/filter combination has no dedicated Playwright coverage today (`scheduling.spec.ts` only exercises day view) — a good candidate for new automated coverage.

---

## Fichas Clínicas

### Scenario: Create a new clinical record after a session
Actor: therapist
Precondition: therapist has `clinical_records:author` (owner/therapist only — admin is read-only, reception has no access at all).
Steps:
1. Go to `/clinical/new`.
2. Select "Paciente".
3. Select "Modelo" (only the current/active template version is offered — superseded versions are excluded from the picker).
4. Click "Criar ficha".
Expected result: navigates to the new record (`/clinical/<id>`); status shows "Rascunho", version "Versão 1".
Edge cases:
- The template picker must never offer a superseded template version (regression covered by `clinical.spec.ts`'s "Modelo picker offers only the current template version" test — this guards PR #96's version-resolver behavior).
- Admin can view but not create clinical records (read-only role).

### Scenario: Edit a saved (unlocked) clinical record
Actor: therapist
Precondition: an existing clinical record in "Rascunho" status, authored by (or otherwise editable by) the current therapist.
Steps:
1. Open the record (`/clinical/<id>`).
2. Edit any of the narrative/structured fields (e.g. observações, plano de tratamento).
3. Click "Guardar".
Expected result: the record saves; a "Ficha guardada." confirmation appears; the record remains in "Rascunho" status (still editable).
Edge cases:
- Saving with required fields left blank should surface "Verifique os campos obrigatórios." rather than silently failing.
- Concurrent edits by two sessions on the same draft record aren't covered by any current e2e test — worth flagging as a gap if multi-therapist co-editing is a real scenario.

### Scenario: Attempt to edit a locked clinical record
Actor: therapist
Precondition: a clinical record that has been signed and locked ("Assinada"/"Bloqueada").
Steps:
1. Open the locked record.
2. Attempt to change any field.
Expected result: the form renders read-only; there is no save/sign action available; the page shows the immutability notice ("Ficha finalizada e imutável. Crie uma nova versão para alterações."). To make further changes, the only path is "Nova versão (adenda)", which creates a new draft at the next version number.
Edge cases:
- Directly confirmed by `clinical.spec.ts`: after signing/locking, the "Assinar e bloquear" button has a count of 0 (it's gone), and clicking "Nova versão (adenda)" opens a fresh draft at "Versão 2" with status "Rascunho" again.
- This is enforced server-side (a `BEFORE UPDATE OR DELETE` trigger on the clinical-records table per the platform's hard architecture rules), not just hidden in the UI — an API-level attempt to mutate a locked record must also fail, not just the button being absent.

### Scenario: Issue a declaração de presença
Actor: receptionist or therapist
Precondition: a finalized (locked/signed) clinical record or completed appointment for the patient.
Steps:
1. Open the patient's finalized clinical record.
2. Click "Transferir PDF" ("Descarregar PDF" in the download button) to request a signed, short-lived download URL for the record's PDF.
3. The browser navigates to the signed URL and downloads the PDF.
Expected result: a PDF is downloaded containing the clinic's branding (logo, location contacts, fiscal info per the brand/print requirements) and the record's clinical content, patient details, and practitioner signature/date.
Edge cases:
- **Implementation note:** what's actually implemented today is the clinical *report* PDF (`clinical.downloadPdf` → `report.clinical.title`: "Relatório Clínico"), generated server-side and served via a Supabase signed URL (never proxied through Next.js). A distinct, narrower "declaração de presença" (attendance-only declaration, as opposed to the full clinical report) does **not** appear to be implemented on the staff side — only placeholder i18n keys (`declaration_presence`, `declaration_treatment`, under a `tab_declarations` section) exist in the *patient portal's* string dictionary (`packages/i18n/src/portal/strings.pt.json`), and no component in `apps/portal` or `apps/web` currently reads them. Flagging this rather than guessing at an unbuilt UI — confirm with the owner whether "declaração de presença" means the existing clinical-report PDF, or a not-yet-built, more limited attendance-only document.
- If the record isn't yet locked/signed, no PDF/download action is offered at all (the button is gated on `record_status` being locked or signed).
- PDF generation failure shows "Não foi possível gerar o PDF." rather than a silent failure.

---

## Faturação

### Scenario: View the invoicing list
Actor: receptionist
Precondition: user has `invoices:read` (owner, admin, therapist, and reception all do — therapist and reception are read-only, without `invoices:issue`).
Steps:
1. Go to `/invoicing`.
2. Optionally filter by date range ("Data de início" / "Data de fim") and "Estado".
Expected result: the "Faturação" heading renders; a list of invoices in the selected range is shown, or "Sem faturas no período selecionado" if none exist.
Edge cases:
- The "Nova fatura" issue button is only shown when InvoiceXpress credentials are configured for the tenant — with no credentials configured (e.g. a brand-new tenant, or the e2e/test environment), the button must be absent entirely, not present-but-disabled.
- Therapist and reception can both view the list (confirmed by `invoicing.spec.ts`), but only a role with `invoices:issue` (owner/admin) sees the "Nova fatura" action.
- The patient profile's own "Faturação" tab mirrors the same empty/populated states as the main invoicing list, scoped to that one patient.

---

## Administração

### Scenario: Add a new staff user
Actor: owner or admin
Precondition: user is on `/admin/staff`.
Steps:
1. Fill the invite form: full name, email, and role.
2. Submit.
Expected result: either a temporary password is shown for manual, secure hand-off to the new user, or (if email invites are configured) "Convite enviado por email." is shown — the new member sets their own password via the emailed link. The new user appears in the staff table.
Edge cases:
- Inviting an email address already used by another staff member in the same tenant is blocked ("Esse email já é usado por outro membro da equipa."), and a second invite to an address already invited-but-not-yet-activated is blocked too ("Já existe um membro da equipa com esse email.").
- Only an owner may assign the "Proprietário" (owner) role to someone else — an admin's role picker never offers it (`assignableRoles`, server-enforced via `canReassignRole`, not just hidden client-side).
- If the invite email fails to send, the UI must surface that distinctly ("Não foi possível enviar o email de convite.") rather than silently claiming success.

### Scenario: Change a staff user's role
Actor: owner (or admin, for non-owner roles only)
Precondition: at least one other active staff member exists besides the acting user.
Steps:
1. Go to `/admin/staff`.
2. Locate the staff member's row and change their role via the role selector.
3. Click "Aplicar".
Expected result: the staff member's role updates in the table immediately.
Edge cases:
- The tenant must always retain at least one active owner — attempting to demote or deactivate the last owner is blocked ("A clínica tem de manter pelo menos um proprietário ativo.").
- An admin (non-owner) attempting to assign or change someone to/from the owner tier is blocked server-side ("Apenas um proprietário pode atribuir ou alterar a função de proprietário."), even if they somehow submit the request directly (not just via a hidden UI control).

### Scenario: Add a new service to a location
Actor: owner or admin
Precondition: at least one active location exists.
Steps:
1. Go to `/admin/services`.
2. Click "Adicionar serviço"; fill name, duration (min), and base price (€).
3. Save.
4. In the service's "Preços por local" section, optionally set a location-specific override price for one or more active locations (or leave it "Usa o preço base").
Expected result: "Serviço guardado." confirmation; the new service appears in the services table and is available for scheduling appointments at the location(s) it's priced for.
Edge cases:
- A service with no base price set shows "sem preço base" rather than "€0.00" — the two must be visually and semantically distinct (unset vs. free).
- Only active locations are offered in the per-location pricing section ("Ainda não há locais ativos." shown if none exist); an archived location's price override, if any existed, is not editable there.
- Saving fails distinctly from a validation error: "Não foi possível guardar o serviço."

---

## Autenticação

### Scenario: Log out and log back in
Actor: any authenticated staff role
Precondition: user is logged in and on any authenticated page.
Steps:
1. Click "Terminar sessão" (in the user-area cluster / nav).
2. Confirm the browser redirects to `/login`.
3. Enter the same email and password, click "Iniciar sessão".
Expected result: after logout, attempting to visit any authenticated route (e.g. `/patients`, `/agenda`) redirects back to `/login` (no lingering session). After logging back in, the user lands on `/dashboard` and can reach their normal, role-appropriate pages again.
Edge cases:
- Visiting `/login` while already authenticated bounces the user back into the app rather than showing the login form again (confirmed by `auth.spec.ts`).
- Wrong password or an unknown email both show the same generic "Não foi possível iniciar sessão" error — the app must not reveal whether the failure was "wrong password" vs. "no such account" (avoids account enumeration).
- Submitting the login form with empty fields keeps the user on `/login` (native required-field validation), without a server round-trip.

---

## Controlo de Acesso

### Scenario: Access a section the user's role does not permit — confirm it is blocked
Actor: reception (also applies to therapist attempting Administração, or any role outside its matrix column)
Precondition: user is logged in as a role that lacks the target capability — e.g. reception, which has no `clinical_records:read`.
Steps:
1. While logged in as reception, navigate directly to `/clinical` (either via a link, if one is even rendered, or by typing the URL).
Expected result: the reception user is redirected to `/dashboard` and never reaches `/clinical` — confirmed directly by `clinical.spec.ts`'s "reception has no clinical access and is redirected away" test, which asserts both the redirect to `/dashboard` and the absence of `/clinical` in the final URL.
Edge cases:
- The block must hold even when the user navigates directly by URL (not just when UI links/tiles are hidden) — this is why `dashboard.spec.ts` separately asserts that role-inappropriate nav tiles (e.g. "Administração" for therapist, "Ficha clínica" for reception) are entirely absent from the DOM (count 0), not merely disabled or hidden via CSS.
- The same pattern must hold for every role/section pairing in the permission matrix — e.g. a therapist attempting `/admin` (owner/admin only, `settings:read`), or any role attempting to read another tenant's data (proven separately in `patients.spec.ts`'s cross-tenant 404 guardrail — a different mechanism, RLS rather than route redirect, but the same principle: denial, not silent partial data).
- Enforcement is server-side in every case (API route + RLS as defense-in-depth per the platform's permission-matrix rule) — a client-side-only redirect would not be sufficient and is not what's implemented.
