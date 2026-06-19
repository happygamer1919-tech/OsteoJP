# OsteoJP Permission Matrix

**Date:** 2026-06-19
**Source:** `packages/auth/permissions.ts`

> This doc is generated from the code; update the code first, then regenerate this file.

---

## Roles

**owner** — Unrestricted within their tenant. Every capability is granted. The only role that can manage other roles (`roles:manage`), which prevents privilege escalation by a compromised admin. Assignment of or removal from the `owner` role requires the acting user to themselves be an `owner`.

**admin** — Full operational control of the clinic: patients, appointments, services, locations, invoices (including void), staff management, settings, and audit log access. Oversight role, not a clinician — cannot author, review, or sign clinical records (read-only access only). Cannot manage roles (`roles:manage` denied), which means an admin cannot self-escalate to `owner`.

**therapist** — Patient-facing clinician role. Full patient and appointment access, complete clinical-record lifecycle (author → review → sign), and read access to services, locations, and invoices. No destructive actions: cannot delete patients or appointments, cannot issue or void invoices. No access to users, roles, settings, or audit log. Note: `CLAUDE.md` describes patient access as "own-only" — that scoping is enforced by Postgres RLS as defense-in-depth; the app-layer capability itself (`patients:read`, `patients:write`) is unrestricted at this layer.

**reception** — Front-desk role: scheduling and billing-issue. Can read and write patients, book and delete (cancel/reschedule) appointments, view the service catalogue and locations, and issue invoices. No clinical record access at all (denied both at this layer and by RLS). Cannot void invoices or access users, roles, settings, or audit log.

---

## Capability Matrix

Legend: ✓ granted / ✗ denied

| Capability | owner | admin | therapist | reception |
|---|---|---|---|---|
| `patients:read` | ✓ | ✓ | ✓ | ✓ |
| `patients:write` | ✓ | ✓ | ✓ | ✓ |
| `patients:delete` | ✓ | ✓ | ✗ | ✗ |
| `appointments:read` | ✓ | ✓ | ✓ | ✓ |
| `appointments:write` | ✓ | ✓ | ✓ | ✓ |
| `appointments:delete` | ✓ | ✓ | ✗ | ✓ |
| `services:read` | ✓ | ✓ | ✓ | ✓ |
| `services:write` | ✓ | ✓ | ✗ | ✗ |
| `locations:read` | ✓ | ✓ | ✓ | ✓ |
| `locations:write` | ✓ | ✓ | ✗ | ✗ |
| `clinical_records:read` | ✓ | ✓ | ✓ | ✗ |
| `clinical_records:author` | ✓ | ✗ | ✓ | ✗ |
| `clinical_records:review` | ✓ | ✗ | ✓ | ✗ |
| `clinical_records:sign` | ✓ | ✗ | ✓ | ✗ |
| `invoices:read` | ✓ | ✓ | ✓ | ✓ |
| `invoices:issue` | ✓ | ✓ | ✗ | ✓ |
| `invoices:void` | ✓ | ✓ | ✗ | ✗ |
| `users:read` | ✓ | ✓ | ✗ | ✗ |
| `users:manage` | ✓ | ✓ | ✗ | ✗ |
| `roles:read` | ✓ | ✓ | ✗ | ✗ |
| `roles:manage` | ✓ | ✗ | ✗ | ✗ |
| `settings:read` | ✓ | ✓ | ✗ | ✗ |
| `settings:manage` | ✓ | ✓ | ✗ | ✗ |
| `audit_log:read` | ✓ | ✓ | ✗ | ✗ |

---

## Role-Assignment Authority

Functions `assignableRoles` and `canReassignRole` in `packages/auth/permissions.ts` control which roles an actor may assign. These rules layer on top of `users:manage` — you must have that capability before assignment rules even apply.

### Assignable roles by actor

| Actor role | Can assign |
|---|---|
| `owner` | owner, admin, therapist, reception |
| `admin` | admin, therapist, reception |
| `therapist` | (none — no `users:manage`) |
| `reception` | (none — no `users:manage`) |

### `canReassignRole` logic

`canReassignRole(actorRole, fromRole, toRole)` returns `true` only when:

1. The actor has `users:manage`, AND
2. If `toRole === "owner"` or `fromRole === "owner"`, then `actorRole` must also be `"owner"`.

This means:
- An `admin` **cannot** assign any staff member to `owner` — even if that person had no role (`fromRole = null`).
- An `admin` **cannot** reassign a current `owner` to any other role — they cannot demote an owner.
- Only an `owner` can promote a user to `owner` or demote a current `owner`.

These rules apply symmetrically in both directions (grant and revoke of owner status), preventing two common privilege-escalation vectors:
- Admin creates a new owner (escalates peer).
- Admin demotes the existing owner, leaving themselves as highest-privilege account.

---

## Key Design Decisions

- **Clinical records: admin is read-only, never clinician.** Admin has `clinical_records:read` for oversight and audit, but lacks `author`, `review`, and `sign`. The AI intake review queue and clinical finalization are clinician actions (therapist/owner only). This enforces separation between operational oversight and clinical authorship.

- **`invoices:void`: owner and admin only.** Reception can issue invoices but cannot void them. Voiding a settled payment is a high-risk financial action that requires managerial sign-off. This prevents accidental or fraudulent voiding by front-desk staff.

- **`appointments:delete`: therapist denied, reception allowed.** Therapists cannot hard-delete an appointment — they cancel via appointment state transitions. Reception staff, who handle front-desk scheduling changes, can delete (cancel/reschedule) appointments. Admin and owner can also delete.

- **`roles:manage`: owner-only, even though admin has `users:manage`.** An admin can manage staff records but cannot assign or revoke the `owner` role. If an admin could set `roles:manage`, a single compromised admin account could silently escalate to owner. The separation is intentional and enforced in both `assignableRoles` and `canReassignRole`.

- **`patients:delete`: therapist and reception denied.** Soft-deletion of patient records is a significant data action. Only admin and owner may remove a patient from the system. Therapists and reception can read and write patient data but cannot initiate deletion.
