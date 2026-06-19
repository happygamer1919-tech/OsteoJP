# Permission Test Scenarios

**Source:** `packages/auth/permissions.ts`
**Date:** 2026-06-19

Plain-English test scenarios covering every capability in the permission matrix. Each scenario describes setup, the action to perform, and the expected result. No code — these are human-executable or automation-driven test cases.

Format: `[ALLOW]` = the action should succeed; `[DENY]` = the action must be blocked (403 API response, redirect, or hidden UI element depending on where the gate fires).

---

## Reception

**SCEN-R01** [ALLOW] _View patient list_
Setup: Authenticated as a user with role `reception`.
Action: Navigate to the patients list page (e.g. `/patients`).
Expected: The page loads and returns patient records. HTTP 200.

**SCEN-R02** [ALLOW] _Create a new patient record_
Setup: Authenticated as `reception`.
Action: Submit the new-patient form with valid data (name, contact details, date of birth).
Expected: Patient record is created successfully. No error. Redirected to the new patient's profile.

**SCEN-R03** [ALLOW] _Update patient contact details_
Setup: Authenticated as `reception`. An existing patient record exists.
Action: Edit the patient's phone number and email and save.
Expected: Record is updated. No error returned.

**SCEN-R04** [DENY] _Soft-delete a patient (`patients:delete` denied)_
Setup: Authenticated as `reception`. An existing patient record exists.
Action: Attempt to invoke the delete/archive action on a patient (via UI button or direct server action call).
Expected: Action is rejected. UI must not show a delete button. If forced via direct API call, the server must return 403.

**SCEN-R05** [ALLOW] _Book a new appointment_
Setup: Authenticated as `reception`. A patient and a therapist exist.
Action: Submit the new-appointment form with a future date/time, patient, and therapist.
Expected: Appointment is created. HTTP 200 / success redirect.

**SCEN-R06** [ALLOW] _Cancel an appointment (`appointments:delete`)_
Setup: Authenticated as `reception`. A future appointment exists.
Action: Invoke the cancel/delete action on the appointment.
Expected: Appointment is deleted or cancelled. Action succeeds.

**SCEN-R07** [ALLOW] _View the service catalogue_
Setup: Authenticated as `reception`.
Action: Navigate to the services list.
Expected: Service records are returned. HTTP 200.

**SCEN-R08** [DENY] _Create or edit a service (`services:write` denied)_
Setup: Authenticated as `reception`.
Action: Attempt to submit a new-service form or edit an existing service (via UI or direct API).
Expected: Action is rejected. UI must not show create/edit controls for services. If forced, server returns 403.

**SCEN-R09** [ALLOW] _View clinic locations_
Setup: Authenticated as `reception`.
Action: Navigate to the locations list.
Expected: Location records are returned. HTTP 200.

**SCEN-R10** [DENY] _Edit a clinic location (`locations:write` denied)_
Setup: Authenticated as `reception`.
Action: Attempt to submit an edit to a clinic location.
Expected: Action is rejected. UI must not show an edit control for locations. Server returns 403 if forced.

**SCEN-R11** [DENY] _View any clinical record (no `clinical_records:read`)_
Setup: Authenticated as `reception`. A clinical record exists for a patient.
Action: (a) Navigate to the clinical records section in the UI. (b) Directly request the clinical record URL (e.g. `/patients/[id]/records/[recordId]`).
Expected: (a) The navigation link to clinical records must not appear in the sidebar or patient profile for this role. (b) Direct URL access must return 403 (app-layer gate fires before RLS). Both gates must fire independently.

**SCEN-R12** [ALLOW] _View an invoice_
Setup: Authenticated as `reception`. An invoice exists for a patient.
Action: Navigate to the invoice detail page.
Expected: Invoice is displayed. HTTP 200.

**SCEN-R13** [ALLOW] _Issue a new invoice (`invoices:issue`)_
Setup: Authenticated as `reception`. A patient and a completed appointment exist.
Action: Submit the new-invoice form.
Expected: Invoice is created. Action succeeds.

**SCEN-R14** [DENY] _Void an invoice (`invoices:void` denied)_
Setup: Authenticated as `reception`. An existing issued invoice exists.
Action: Attempt to void the invoice (UI button or direct server action call).
Expected: UI must not show a void button for `reception`. Server returns 403 if forced.

**SCEN-R15** [DENY] _Access the staff / user list (`users:read` denied)_
Setup: Authenticated as `reception`.
Action: Attempt to navigate to the staff management section (e.g. `/settings/staff` or `/users`).
Expected: Route is inaccessible. Redirect to a safe page or 403. The staff link must not appear in the navigation.

**SCEN-R16** [DENY] _Access tenant settings (`settings:read` denied)_
Setup: Authenticated as `reception`.
Action: Attempt to navigate to the tenant settings page.
Expected: Route is inaccessible. Redirect or 403. Settings link must not appear in navigation for this role.

---

## Therapist

**SCEN-T01** [ALLOW] _View patient list and individual patient profile_
Setup: Authenticated as `therapist`.
Action: Navigate to the patients list, then open an individual patient profile.
Expected: Both load successfully. HTTP 200. (Note: RLS additionally enforces own-patient scoping at DB layer, but the app-layer capability is unrestricted.)

**SCEN-T02** [ALLOW] _Update a patient's clinical notes field_
Setup: Authenticated as `therapist`. A patient record exists.
Action: Edit a writable field on the patient record (e.g. clinical notes, contact details) and save.
Expected: Record is updated. Action succeeds.

**SCEN-T03** [DENY] _Soft-delete a patient (`patients:delete` denied)_
Setup: Authenticated as `therapist`.
Action: Attempt to delete/archive a patient record.
Expected: UI must not show a delete button. Server returns 403 if forced via direct call.

**SCEN-T04** [ALLOW] _Book an appointment on own calendar_
Setup: Authenticated as `therapist`. A patient exists.
Action: Submit the new-appointment form assigning the appointment to this therapist.
Expected: Appointment is created. Action succeeds.

**SCEN-T05** [ALLOW] _Reschedule an appointment_
Setup: Authenticated as `therapist`. An existing appointment exists.
Action: Edit the appointment's date/time and save (write action, not delete).
Expected: Appointment is updated. Action succeeds.

**SCEN-T06** [DENY] _Delete/cancel an appointment entirely (`appointments:delete` denied)_
Setup: Authenticated as `therapist`. An existing appointment exists.
Action: Attempt to invoke the delete/cancel action on an appointment.
Expected: UI must not show a delete/cancel button for therapists. Server returns 403 if forced. Therapists cancel via appointment state transitions, not deletion.

**SCEN-T07** [ALLOW] _View the service catalogue and location list_
Setup: Authenticated as `therapist`.
Action: Navigate to services list and locations list.
Expected: Both load with data. HTTP 200.

**SCEN-T08** [DENY] _Add a new service or edit service pricing (`services:write` denied)_
Setup: Authenticated as `therapist`.
Action: Attempt to create a new service or edit an existing service's pricing.
Expected: UI must not show create/edit controls for services. Server returns 403 if forced.

**SCEN-T09** [ALLOW] _View a clinical record_
Setup: Authenticated as `therapist`. A clinical record exists.
Action: Navigate to a clinical record detail page.
Expected: Record is displayed. HTTP 200. (RLS will additionally scope to own patients' records.)

**SCEN-T10** [ALLOW] _Create a draft clinical record (`clinical_records:author`)_
Setup: Authenticated as `therapist`. A patient and episode exist.
Action: Submit the new-clinical-record form, saving as draft.
Expected: Draft record is created. Action succeeds. Record status is `draft`.

**SCEN-T11** [ALLOW] _Review an AI-ingested or patient-submitted intake draft (`clinical_records:review`)_
Setup: Authenticated as `therapist`. A clinical record with `ai_review_state = pending_review` exists.
Action: Open the review queue, claim the record, and submit a review decision (approve or reject).
Expected: Review action succeeds. `ai_review_state` transitions accordingly.

**SCEN-T12** [ALLOW] _Sign/lock a finalized clinical record (`clinical_records:sign`)_
Setup: Authenticated as `therapist`. A clinical record in `draft` or `locked` state exists.
Action: Submit the sign action on the record.
Expected: Record transitions to `signed` state. Action succeeds.

**SCEN-T13** [ALLOW] _View an invoice for a patient_
Setup: Authenticated as `therapist`. An invoice exists.
Action: Navigate to the invoice detail page.
Expected: Invoice is displayed. HTTP 200.

**SCEN-T14** [DENY] _Issue an invoice (`invoices:issue` denied)_
Setup: Authenticated as `therapist`.
Action: Attempt to create a new invoice.
Expected: UI must not show an issue-invoice button. Server returns 403 if forced.

**SCEN-T15** [DENY] _Void an invoice (`invoices:void` denied)_
Setup: Authenticated as `therapist`. An existing invoice exists.
Action: Attempt to void the invoice.
Expected: UI must not show a void button. Server returns 403 if forced.

**SCEN-T16** [DENY] _View the staff/user list (`users:read` denied)_
Setup: Authenticated as `therapist`.
Action: Attempt to navigate to the staff management section.
Expected: Route is inaccessible. Redirect or 403. Link must not appear in navigation.

**SCEN-T17** [DENY] _Access tenant settings (`settings:read` denied)_
Setup: Authenticated as `therapist`.
Action: Attempt to navigate to the tenant settings page.
Expected: Route is inaccessible. Redirect or 403. Link must not appear in navigation.

**SCEN-T18** [DENY] _View the audit log (`audit_log:read` denied)_
Setup: Authenticated as `therapist`.
Action: Attempt to navigate to the audit log.
Expected: Route is inaccessible. Redirect or 403.

---

## Admin

**SCEN-A01** [ALLOW] _View, create, and update a patient record_
Setup: Authenticated as `admin`.
Action: Navigate to patients list, open a patient, edit a field, save. Also create a new patient.
Expected: All three actions succeed. HTTP 200 / success responses.

**SCEN-A02** [ALLOW] _Soft-delete a patient (`patients:delete`)_
Setup: Authenticated as `admin`. An existing patient exists.
Action: Invoke the delete/archive action on the patient.
Expected: Action succeeds. Patient is soft-deleted.

**SCEN-A03** [ALLOW] _Create, update, and delete an appointment_
Setup: Authenticated as `admin`. A patient and therapist exist.
Action: Create an appointment, then update its time, then delete it.
Expected: All three actions succeed.

**SCEN-A04** [ALLOW] _Read a clinical record (admin oversight)_
Setup: Authenticated as `admin`. A clinical record exists.
Action: Navigate to the clinical record detail page.
Expected: Record is displayed. HTTP 200.

**SCEN-A05** [DENY] _Create or author a clinical record (`clinical_records:author` denied)_
Setup: Authenticated as `admin`.
Action: Attempt to create a new clinical record / submit an authoring form.
Expected: UI must not show a create-record button for admin. Server returns 403 if forced.

**SCEN-A06** [DENY] _Review an AI-ingested draft (`clinical_records:review` denied)_
Setup: Authenticated as `admin`. A record with `ai_review_state = pending_review` exists.
Action: Attempt to claim and review the record from the intake queue.
Expected: UI must not allow admin to take review actions. Server returns 403 if forced.

**SCEN-A07** [DENY] _Sign a clinical record (`clinical_records:sign` denied)_
Setup: Authenticated as `admin`. A clinical record exists.
Action: Attempt to invoke the sign action on the record.
Expected: UI must not show a sign button for admin. Server returns 403 if forced.

**SCEN-A08** [ALLOW] _Issue an invoice (`invoices:issue`)_
Setup: Authenticated as `admin`.
Action: Submit the new-invoice form.
Expected: Invoice is created. Action succeeds.

**SCEN-A09** [ALLOW] _Void an invoice (`invoices:void`)_
Setup: Authenticated as `admin`. An existing issued invoice exists.
Action: Invoke the void action on the invoice.
Expected: Invoice is voided. Action succeeds.

**SCEN-A10** [ALLOW] _View and manage staff members (`users:read` + `users:manage`)_
Setup: Authenticated as `admin`.
Action: Navigate to the staff list. View a staff member's profile. Update their details (non-role fields).
Expected: All actions succeed.

**SCEN-A11** [DENY] _Assign the 'owner' role to any staff member (`roles:manage` denied)_
Setup: Authenticated as `admin`. A staff member with role `therapist` exists.
Action: Open the role assignment dropdown for the staff member and attempt to assign `owner`.
Expected: 'Owner' must not appear as an option in the dropdown for an `admin` actor. If a crafted request is submitted directly (bypassing the UI), the server action must return 403 because `canReassignRole(admin, therapist, owner)` returns `false`.

**SCEN-A12** [ALLOW] _Assign admin, therapist, reception roles to staff_
Setup: Authenticated as `admin`. A staff member with role `reception` exists.
Action: Change the staff member's role to `therapist` via the role dropdown. Save.
Expected: Role change succeeds. `canReassignRole(admin, reception, therapist)` returns `true`.

**SCEN-A13** [ALLOW] _Create and edit clinic services and locations_
Setup: Authenticated as `admin`.
Action: Create a new service with pricing. Edit a clinic location's address.
Expected: Both actions succeed.

**SCEN-A14** [ALLOW] _Access tenant settings (`settings:read` + `settings:manage`)_
Setup: Authenticated as `admin`.
Action: Navigate to tenant settings. Update a setting.
Expected: Settings page loads and update succeeds.

**SCEN-A15** [ALLOW] _Read the audit log (`audit_log:read`)_
Setup: Authenticated as `admin`.
Action: Navigate to the audit log.
Expected: Audit log is displayed. HTTP 200.

---

## Owner

**SCEN-O01** [ALLOW] _All capabilities granted to admin_
Setup: Authenticated as `owner`.
Action: Exercise every action listed in the Admin section above (SCEN-A01 through SCEN-A15) but now for the owner role.
Expected: Every action that succeeds for admin also succeeds for owner. Owner holds a superset of admin's capabilities.

**SCEN-O02** [ALLOW] _Author, review, and sign clinical records_
Setup: Authenticated as `owner`. A patient and episode exist.
Action: (a) Create a draft clinical record. (b) Review an AI-ingested intake record. (c) Sign a finalized record.
Expected: All three actions succeed. Owner has `clinical_records:author`, `clinical_records:review`, and `clinical_records:sign`.

**SCEN-O03** [ALLOW] _Assign the 'owner' role to another staff member_
Setup: Authenticated as `owner`. A staff member with role `admin` exists.
Action: Use the role assignment UI to change the staff member's role to `owner`.
Expected: 'Owner' appears as an option in the dropdown. The assignment succeeds. `canReassignRole(owner, admin, owner)` returns `true`.

**SCEN-O04** [ALLOW] _Reassign a current owner to a different role (valid downgrade)_
Setup: Authenticated as `owner`. A second staff member currently holding `owner` role exists.
Action: Change the second owner's role to `admin`.
Expected: Role change succeeds. `canReassignRole(owner, owner, admin)` returns `true`.

**SCEN-O05** [DENY] _Anti-escalation: admin cannot assign the owner role_
Setup: Authenticated as `admin`. A staff member with any non-owner role exists.
Action: (a) Open the role assignment dropdown for the staff member — the 'Owner' option must not be present. (b) Force a direct server action call with `toRole = "owner"`.
Expected: (a) UI renders no 'Owner' option (driven by `assignableRoles(admin)` which excludes `owner`). (b) Server action rejects with 403. `canReassignRole(admin, therapist, owner)` returns `false`.

---

## Role-Assignment Edge Cases

**SCEN-RE01** [DENY] _Admin cannot reassign a current owner to another role_
Setup: Authenticated as `admin`. A staff member currently holding the `owner` role exists.
Action: Attempt to change the owner's role to `admin` (either via UI or direct server call).
Expected: `canReassignRole(admin, owner, admin)` returns `false`. Server returns 403. The UI should not allow an admin to edit the role of a user currently holding `owner`.

**SCEN-RE02** [ALLOW] _Owner reassigns themselves to 'admin' (valid downgrade)_
Setup: The acting user is the sole `owner`. A second owner exists (or a multi-step flow allows self-demotion).
Action: The owner changes their own role to `admin`.
Expected: `canReassignRole(owner, owner, admin)` returns `true`. Role change succeeds.

**SCEN-RE03** [ALLOW] _Owner assigns a new staff member directly to 'owner'_
Setup: Authenticated as `owner`. A new staff member with no current role (`fromRole = null`) exists.
Action: Assign the new staff member the `owner` role.
Expected: `canReassignRole(owner, null, owner)` returns `true`. Assignment succeeds. (The `fromRole === "owner"` check only triggers when `fromRole` is literally `"owner"`, not `null`.)

**SCEN-RE04** [DENY] _Therapist tries to change any role (no `users:manage`)_
Setup: Authenticated as `therapist`. Any staff member exists.
Action: Attempt any role-assignment action (navigate to staff management, submit a role change).
Expected: `canReassignRole(therapist, *, *)` returns `false` because `can(therapist, "users:manage")` is `false`. Server returns 403. Staff management UI is not accessible for `therapist`.

**SCEN-RE05** [DENY] _Reception tries to change any role (no `users:manage`)_
Setup: Authenticated as `reception`. Any staff member exists.
Action: Attempt any role-assignment action.
Expected: Same as SCEN-RE04. `canReassignRole(reception, *, *)` returns `false`. Server returns 403.

---

## Coverage Summary

The table below maps each capability to the scenario IDs that cover it. Each capability has at least one ALLOW and one DENY scenario (where a DENY is applicable for the role set).

| Capability | ALLOW scenarios | DENY scenarios |
|---|---|---|
| `patients:read` | SCEN-R01, SCEN-T01, SCEN-A01, SCEN-O01 | — (all roles have this) |
| `patients:write` | SCEN-R02, SCEN-R03, SCEN-T02, SCEN-A01, SCEN-O01 | — (all roles have this) |
| `patients:delete` | SCEN-A02, SCEN-O01 | SCEN-R04, SCEN-T03 |
| `appointments:read` | SCEN-R05, SCEN-T04, SCEN-A03, SCEN-O01 | — (all roles have this) |
| `appointments:write` | SCEN-R05, SCEN-T05, SCEN-A03, SCEN-O01 | — (all roles have this) |
| `appointments:delete` | SCEN-R06, SCEN-A03, SCEN-O01 | SCEN-T06 |
| `services:read` | SCEN-R07, SCEN-T07, SCEN-A13, SCEN-O01 | — (all roles have this) |
| `services:write` | SCEN-A13, SCEN-O01 | SCEN-R08, SCEN-T08 |
| `locations:read` | SCEN-R09, SCEN-T07, SCEN-A13, SCEN-O01 | — (all roles have this) |
| `locations:write` | SCEN-A13, SCEN-O01 | SCEN-R10 |
| `clinical_records:read` | SCEN-T09, SCEN-A04, SCEN-O01 | SCEN-R11 |
| `clinical_records:author` | SCEN-T10, SCEN-O02 | SCEN-A05 |
| `clinical_records:review` | SCEN-T11, SCEN-O02 | SCEN-A06 |
| `clinical_records:sign` | SCEN-T12, SCEN-O02 | SCEN-A07 |
| `invoices:read` | SCEN-R12, SCEN-T13, SCEN-A08, SCEN-O01 | — (all roles have this) |
| `invoices:issue` | SCEN-R13, SCEN-A08, SCEN-O01 | SCEN-T14 |
| `invoices:void` | SCEN-A09, SCEN-O01 | SCEN-R14, SCEN-T15 |
| `users:read` | SCEN-A10, SCEN-O01 | SCEN-R15, SCEN-T16 |
| `users:manage` | SCEN-A10, SCEN-A12, SCEN-O03, SCEN-O04 | SCEN-RE04, SCEN-RE05 |
| `roles:read` | SCEN-A12, SCEN-O01 | — (therapist/reception have no access to role UI) |
| `roles:manage` | SCEN-O03, SCEN-O04 | SCEN-A11, SCEN-O05, SCEN-RE01 |
| `settings:read` | SCEN-A14, SCEN-O01 | SCEN-R16, SCEN-T17 |
| `settings:manage` | SCEN-A14, SCEN-O01 | SCEN-R16, SCEN-T17 |
| `audit_log:read` | SCEN-A15, SCEN-O01 | SCEN-T18 |
| Role assignment (anti-escalation) | SCEN-RE02, SCEN-RE03 | SCEN-RE01, SCEN-RE04, SCEN-RE05 |
