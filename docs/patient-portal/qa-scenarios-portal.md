# Portal QA Scenarios — Patient Portal
**Author:** Max (sm33xy)
**Date:** 2026-06-03
**Scope:** All patient portal workflows across `apps/api` Wave A + B endpoints
**Format:** Plain English — Ivan converts to Playwright

---

## Auth

**SC-P-01 — Login with valid credentials**
Given a patient with a confirmed account, when they enter their email and password and submit, they should land on the dashboard and see their name in the greeting.

**SC-P-02 — Login with wrong password**
Given a patient who enters the wrong password, they should see an error message and remain on the login screen. No session should be created.

**SC-P-03 — Login with magic link**
Given a patient who requests a magic link, they should receive an email with a valid link. Clicking the link should create a session and redirect to the dashboard.

**SC-P-04 — Session expiry**
Given an expired session, when the patient navigates to any protected route, they should be redirected to login and see the session expired message.

**SC-P-05 — Account activation via SMS link**
Given a new patient who received an SMS activation link, when they set a password and submit, their account should be activated and they should land on the dashboard.

**SC-P-06 — Password reset flow**
Given a patient who requests a password reset, they should receive a reset link by email. Following the link and setting a new password should allow login with the new credentials.

---

## Dashboard

**SC-P-07 — Dashboard with upcoming appointment**
Given a patient with a confirmed upcoming appointment, the dashboard should show the appointment card with service name, date, time, and location. Status badge should read "Confirmada".

**SC-P-08 — Dashboard with pending intake form**
Given a patient who has an intake form to complete before their next appointment, the amber banner "Tem uma ficha por preencher antes da sua consulta" should appear with a "Preencher agora" CTA.

**SC-P-09 — Dashboard with no upcoming appointment**
Given a patient with no upcoming appointments, the dashboard should show "Não tem consultas agendadas" and the "Marcar consulta" CTA.

**SC-P-10 — Dashboard recent visits**
Given a patient with past appointments, the "Visitas recentes" section should list them with service name, date, and paid/unpaid badge.

---

## Booking

**SC-P-11 — Full booking flow (happy path)**
Given a logged-in patient, when they complete all 4 booking steps (location → service → date/time → confirm), a booking should be created with status "pending" and the patient should see the "Marcação recebida" confirmation screen.

**SC-P-12 — Booking step navigation**
Given a patient mid-booking, the back button on each step should return to the previous step without losing previously selected values.

**SC-P-13 — No slots available**
Given a date with no available therapist slots, the patient should see "Não há horários disponíveis para esta data" and be prompted to try another day.

**SC-P-14 — Therapist preference field**
Given a returning patient, the optional "Preferência de terapeuta" field should be present on the confirm step. Submitting with a preference should store it as a note, not as a hard booking constraint.

**SC-P-15 — Rate limit on booking attempts**
Given a patient who submits too many booking requests in quick succession, they should see the rate limit message and not be able to submit again immediately.

**SC-P-16 — Booking with past date**
Given a patient who somehow selects a past date (e.g. via URL manipulation), the API should reject with `slot_in_past` and the patient should see an appropriate error.

---

## Appointments

**SC-P-17 — View upcoming appointments**
Given a patient with upcoming appointments, the "Próximas" tab should list them all with correct service, date, time, location, and status badge.

**SC-P-18 — View past appointments**
Given a patient with past appointments, the "Anteriores" tab should list them with paid/unpaid status.

**SC-P-19 — Cancel appointment (more than 24h before)**
Given a confirmed appointment more than 24 hours away, the patient should be able to cancel it. After cancellation, the appointment should move to "Cancelada" status.

**SC-P-20 — Cancel appointment (less than 24h before)**
Given a confirmed appointment within 24 hours, the cancel button should NOT appear. Instead the patient should see "Ligue para a clínica" with the location phone number.

**SC-P-21 — Cancel already cancelled appointment**
Given an appointment already in "Cancelada" status, attempting to cancel again (e.g. via direct API call) should return `not_reschedulable`.

**SC-P-22 — Reschedule appointment (more than 24h before)**
Given a confirmed appointment more than 24 hours away, the patient should be able to reschedule to a new slot. The original appointment should be cancelled and a new pending one created.

**SC-P-23 — Reschedule inside 24h cutoff**
Given a confirmed appointment within 24 hours, rescheduling should be blocked with the `cutoff` error and "Ligue para a clínica" message.

---

## Forms / Intake

**SC-P-24 — General anamnese (Ficha Geral) shown on first visit**
Given a new patient with their first appointment, the Fichas screen should show "Ficha Geral" with "Obrigatório" badge and "Preencher ficha" CTA.

**SC-P-25 — General anamnese completion**
Given a patient filling the Ficha Geral, when they complete all required fields (consent fields are mandatory) and submit, the form should move to "Em revisão" status and show "O seu terapeuta irá revê-la antes da consulta."

**SC-P-26 — Therapy supplement shown after Ficha Geral**
Given a patient who has completed the Ficha Geral, and whose appointment is for Osteopatia, the "Ficha de Osteopatia" supplement should appear in "Por preencher" state.

**SC-P-27 — Draft auto-save**
Given a patient mid-form, if they navigate away and return, their previously entered answers should be restored from the auto-saved draft.

**SC-P-28 — Consent fields are mandatory**
Given a patient who tries to submit the Ficha Geral without ticking the two required consent checkboxes (treatment + RGPD data), the form should not submit and the missing fields should be highlighted.

**SC-P-29 — Completed forms listed below divider**
Given a patient with one completed form and one pending, the completed form should appear in the "Preenchidas" section with a green "Concluída" badge, separate from pending forms.

**SC-P-30 — Contraindication screen for wrapper therapies**
Given a patient booking Massagem Terapêutica, RPG, or Pilates Terapêutico, a short contraindication screen should appear (not the full physiotherapy supplement). Completing it should move the form to "Em revisão".

---

## Documents

**SC-P-31 — Faturas tab shows Phase 4 notice**
Given a patient on the Documentos screen, the Faturas tab should show "As faturas estarão disponíveis em breve." (no invoices shown until Phase 4 InvoiceXpress UI is live).

**SC-P-32 — Appointment history on Faturas tab**
Given a patient with past appointments, the Faturas tab should show the appointment history with paid/unpaid status badges (internal ledger, not fiscal documents).

**SC-P-33 — Declaration download**
Given a patient who has a presence or treatment declaration issued, it should appear on the Declarações tab with a download icon. Tapping download should trigger a signed short-lived PDF download (not expose fiscal data in the URL).

**SC-P-34 — Empty declarations state**
Given a patient with no declarations issued yet, the Declarações tab should show "Ainda não tem declarações disponíveis."

---

## Account

**SC-P-35 — View account details**
Given a logged-in patient, the Conta screen should show their name, email, NIF (if set), phone, and language preference.

**SC-P-36 — Edit personal details**
Given a patient who edits their phone number and saves, the updated number should persist and be reflected immediately in the UI.

**SC-P-37 — SMS reminder toggle (opt out)**
Given a patient with SMS reminders enabled (default on), when they toggle SMS off, they should see the opt-out warning and the preference should be saved. They should not receive an SMS for their next appointment.

**SC-P-38 — Email reminder toggle (opt out)**
Given a patient with email reminders enabled, when they toggle email off, the preference should be saved. The clinic's reminder channel setting is the ceiling — a patient cannot enable a channel the clinic has turned off.

**SC-P-39 — Change password**
Given a patient who changes their password, after the change they should be able to log in with the new password and not with the old one.

**SC-P-40 — NIF field shown with invoice hint**
Given a patient on the Conta screen, the NIF field should be visible with the hint "Necessário para emissão de fatura." NIF is optional but required for invoice generation.

---

## Cross-cutting / Security

**SC-P-41 — Patient cannot access another patient's data**
Given two patients A and B, patient A should not be able to access patient B's appointments, forms, or documents by manipulating IDs in the URL or API calls.

**SC-P-42 — Staff token rejected by patient API**
Given a staff member's JWT, any call to `api.osteojp.pt/v1/*` patient endpoints should return 401.

**SC-P-43 — Unauthenticated access blocked**
Given no session, any protected portal route should redirect to login. Any direct API call without a session should return 401.

**SC-P-44 — Rate limiting on auth endpoints**
Given repeated failed login attempts, the auth endpoint should rate-limit the requester.

**SC-P-45 — Document download URL is signed and short-lived**
Given a patient who obtains a document download URL, the URL should expire after a short window (e.g. 60 seconds) and not be reusable. Fiscal data should never appear in the URL itself.
