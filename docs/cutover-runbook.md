# Cutover Runbook — OsteoJP Go-Live

> Board-grade procedure for the system-of-record switch from Fisiozero + Stylus.pt to the OsteoJP platform.  
> **Comms scripts (staff WhatsApp, email, follow-up):** see [`docs/launch-comms.md`](./launch-comms.md) — not duplicated here.  
> **Migration pipeline details:** see [`docs/migration-notes.md`](./migration-notes.md).  
> **Production migration runbook:** see [`docs/ops/prod-migrate.md`](./ops/prod-migrate.md).

---

## Owners

| Role | Person | Responsibility during cutover |
|---|---|---|
| Lead engineer | Ivan | DB, DNS, Vercel env vars, migrations, go/no-go |
| Clinic owner | João Pedro | Staff comms, Fisiozero access, final sign-off |
| Platform lead | Max | Runbook, comms prep, QA sign-off, Fisiozero fallback doc |

---

## Cutover window

**Target:** first session of the day (before the first appointment, typically 08:00 WEST / 07:00 UTC). Never cut over mid-day or mid-week.  
**Minimum duration allocated:** 2 hours before staff arrive.  
**Hard abort time:** if the platform is not confirmed operational 30 minutes before the first appointment, execute §4 (rollback) and postpone.

---

## 1. Pre-cutover checklist

All items must be checked off, in order, before the cutover window opens. Items marked **[JP]** require João Pedro's action or sign-off; items marked **[IVAN]** require Ivan.

### 1.1 Platform prerequisites

- [ ] **[IVAN]** Supabase project upgraded to **Pro plan** with PITR enabled. This is a hard precondition — no real patient data enters the platform until PITR is on. (SPEC.md: "Supabase Pro precedes the cutover extraction.")
- [ ] **[IVAN]** Manual backup taken from the Supabase dashboard immediately before the import step. Verify the backup appears in Dashboard → Backups.
- [ ] **[IVAN]** Backup restore drill completed on a throwaway branch project. Confirmed the restored DB passes `supabase db reset` migrations clean with no errors. (One-time step; can be done days before cutover.)
- [ ] **[IVAN]** All pending Drizzle migrations applied to production via `prod-migrate.yml` (workflow_dispatch → `MIGRATE-PROD`). Post-flight check in the workflow log must show no `PENDING` migrations.
- [ ] **[IVAN]** Production Vercel deployment of `main` is green (latest commit on `main` deployed; Vercel dashboard shows "Ready").
- [ ] **[IVAN]** `app.osteojp.pt` loads the staff login page. `patient.osteojp.pt` loads the portal login page. `api.osteojp.pt/api/health` returns `{"status":"ok"}`.
- [ ] **[IVAN]** All three CI required gates are green on the latest `main` commit: **Lint + typecheck + test**, **DB-gated tests (RLS isolation, seeded DB)**, **Playwright E2E (seeded DB)**.

### 1.2 DNS (Webhs panel — `osteojp.pt`)

DNS changes must be made and confirmed to have propagated **before** the cutover window. Propagation can take up to 48 hours; plan accordingly.

| Type | Host | Value | Status |
|---|---|---|---|
| A | `app` | 76.76.21.21 | confirm via `dig app.osteojp.pt` |
| A | `api` | 76.76.21.21 | confirm via `dig api.osteojp.pt` |
| A | `patient` | 76.76.21.21 | confirm via `dig patient.osteojp.pt` |
| TXT | `@` | SPF record for Resend | confirm via `dig TXT osteojp.pt` |
| CNAME | `em._domainkey` | Resend DKIM | confirm via `dig CNAME em._domainkey.osteojp.pt` |
| TXT | `_dmarc` | DMARC policy | confirm via `dig TXT _dmarc.osteojp.pt` |

Full DNS record values: see [`docs/dns-records-pending.md`](./dns-records-pending.md).

- [ ] **[IVAN]** All six DNS records added at Webhs and confirmed propagated (`dig` returns expected values from two independent resolvers).
- [ ] **[IVAN]** Vercel dashboard shows domains `app.osteojp.pt`, `api.osteojp.pt`, `patient.osteojp.pt` as **Valid Configuration** (not "Invalid Configuration" or "Pending").
- [ ] **[IVAN]** Resend dashboard confirms the `osteojp.pt` sender domain status is **Verified**.

### 1.3 Data migration (Fisiozero → OsteoJP)

- [ ] **[IVAN]** Fisiozero final data extraction complete. All patient, appointment, and clinical record data extracted from Fisiozero and staged in `migration_staging_rows` (status `pending`).
- [ ] **[IVAN]** Batch validation run (`applyBatchValidation`). Report shows zero `failed` rows, or all failures are triaged and accepted. Reconciliation report saved to `docs/migration-notes.md` (batch log section).
- [ ] **[IVAN]** Import run (`importRecords`). All rows transition to `imported`. Zero rows remain in `pending` or `validated`.
- [ ] **[JP]** Spot-check: 5 known patients (by name and DOB) located in the OsteoJP platform, with appointment history intact.
- [ ] **[JP]** Spot-check: at least 3 clinical records (fichas) visible and correctly attributed to the right therapist and patient.

### 1.4 Staff credentials and access

- [ ] **[IVAN]** All staff members have `users` rows in the production tenant (`3a2d0711-fbdb-4ce9-b940-b6a87e3d3560` or the production tenant ID). Each user has an active Supabase Auth account and the correct role (`owner`, `admin`, `therapist`, or `reception`).
- [ ] **[IVAN]** Each staff member has received their credential email (initial password or invite link). Confirm with João Pedro before sending the go-live comms.
- [ ] **[JP]** At least João Pedro and one therapist have done a test login on `app.osteojp.pt` and can reach their dashboard.
- [ ] **[IVAN]** Staff cheat-sheet printed and placed at reception in each clinic (Linda-a-Velha, Castelo Branco, Montemor-o-Novo). Source: [`docs/staff-cheat-sheet.md`](./staff-cheat-sheet.md).

### 1.5 Integrations and env vars

- [ ] **[IVAN]** `REMINDERS_LIVE_SEND` set to `false` in Vercel production env (default safe). **Do not flip to `true` until the first live reminder cycle is explicitly authorized by João Pedro** (see §2, step 9).
- [ ] **[IVAN]** `TWILIO_SENDER_ID` updated in Vercel production env from test number to `OsteoJP` (approved alphanumeric sender, confirmed 2026-06-11).
- [ ] **[IVAN]** `INVOICEXPRESS_API_KEY` + `INVOICEXPRESS_ACCOUNT_NAME` set in Vercel production env (credentials from the existing `osteojplda.app.invoicexpress.com` account). VAT 23% sign-off from João Pedro required before any invoice is issued via the platform.
- [ ] **[JP]** IfThenPay live keys (`IFTHENPAY_MBWAY_KEY`, `IFTHENPAY_ANTIPHISHING_KEY`) provided to Ivan and set in Vercel production env. (Backend is ready; this unblocks the payment flow.)
- [ ] **[IVAN]** Sentry EU DSN set and confirmed: a test error thrown via Sentry in the production app appears in the Sentry EU project dashboard.
- [ ] **[IVAN]** Inngest production app confirmed: functions appear in the Inngest dashboard and are serving the production URL.

### 1.6 Final go/no-go

- [ ] **[IVAN]** All items in §1.1–§1.5 checked. No open blockers.
- [ ] **[JP]** Verbal or written sign-off: "go live".

---

## 2. Cutover sequence

Execute in order. Do not skip steps. Times are relative to the start of the cutover window (T+0).

### Step 1 — Final Fisiozero freeze (T+0)

**[JP]** Notify all staff (WhatsApp) that Fisiozero is now in **read-only mode**: no new appointments or clinical entries to be made in Fisiozero from this point. New appointments and records go in OsteoJP only.

> Text to send (WhatsApp): "A partir de agora não registem mais nada no Fisiozero. Toda a equipa usa exclusivamente a nova plataforma. O Fisiozero fica disponível apenas para consultar dados históricos."

Record the exact time of the freeze in this document: **Fisiozero freeze time: ____________**

### Step 2 — Production backup (T+0)

**[IVAN]** Take a named backup in Supabase dashboard immediately before enabling real activity.

> Dashboard → Database → Backups → **Take a backup now**. Label it `pre-cutover-<date>`.

Record backup ID: **Backup ID: ____________**

### Step 3 — Verify platform health (T+5)

**[IVAN]** Confirm the live platform is serving correctly:

```bash
curl -sf https://app.osteojp.pt/api/health       # expect HTTP 200
curl -sf https://api.osteojp.pt/api/health        # expect {"status":"ok"}
curl -sf https://patient.osteojp.pt               # expect HTTP 200 (login redirect)
```

If any endpoint fails, do not proceed. Execute §4 (rollback).

### Step 4 — System-of-record switch declaration (T+10)

**[JP]** OsteoJP is now the system of record. Declare the switch:

1. Update the physical handover sheet at each clinic reception: cross out "Fisiozero" and write "app.osteojp.pt".
2. Note the time: **System-of-record switch time: ____________**

### Step 5 — Send staff comms (T+15)

**[JP]** Send the go-live communications per [`docs/launch-comms.md`](./launch-comms.md):

1. WhatsApp group message first (§1 of launch-comms.md).
2. Email to all staff (§2 of launch-comms.md).

Confirm with Ivan before sending that all credentials are in staff inboxes.

### Step 6 — Smoke test with real credentials (T+20)

**[JP + IVAN]** Each do a full login and create one test appointment:

1. Log in as João Pedro (admin role). Confirm dashboard loads, patient list visible.
2. Create a test appointment for a real patient for a date next week. Confirm it appears in the agenda.
3. Log in as one therapist. Confirm their calendar view shows the correct appointments.
4. Log in as one reception user. Confirm they can see the schedule.

If any role cannot log in or sees unexpected data, proceed to §4 (rollback) immediately.

### Step 7 — Confirm RLS isolation (T+25)

**[IVAN]** As the admin user (via the platform UI, not service-role), confirm:
- Cannot see data from any other tenant (there is only one production tenant, so this is implicitly verified by the fact that the patient list matches the Fisiozero export count, not a superset).
- The audit log shows the steps taken so far (login events, appointment creation).

### Step 8 — First appointment of the day (T+30 → live)

Normal clinic operations begin. All new appointments and clinical records created in OsteoJP. Staff directed to use Fisiozero only for historical reference.

### Step 9 — Live reminders (deferred — first reminder cycle only)

**[JP]** Explicitly authorize Ivan to flip `REMINDERS_LIVE_SEND=true` in Vercel production env before the first reminder cycle runs (48h ahead of the first appointment booked via OsteoJP). Do not flip automatically at cutover.

**[IVAN]** After authorization: Vercel dashboard → Project → Settings → Environment Variables → set `REMINDERS_LIVE_SEND` to `true` for Production. Trigger a Vercel redeploy to pick up the new value.

Confirm the first live reminder sends correctly by checking the Resend dashboard for a delivery event.

---

## 3. Rollback procedure

Execute this section if, at any point during the cutover sequence, any of the following are true:
- `app.osteojp.pt` is unreachable or returns 5xx for more than 2 minutes.
- Any staff member cannot log in and the root cause is not a credential issue.
- Data appears corrupted, missing, or duplicated in the platform after the migration import.
- The cutover window reaches the **hard abort time** (30 minutes before first patient appointment) without completing Step 6.

### Rollback decision tree

```
Platform unreachable or auth broken?
  └── YES → Step R1 (DNS rollback or Vercel rollback)
Data corrupt or import incomplete?
  └── YES → Step R2 (DB rollback via PITR)
```

### Step R1 — DNS / Vercel rollback

If the issue is a failed deployment or Vercel outage:

1. **[IVAN]** In Vercel: Project → Deployments → find the last known-good deployment → **Promote to Production**. This reverts the production build without touching DNS.
2. If DNS is causing the problem (wrong record or propagation issue): Webhs panel → revert `app.osteojp.pt` A record to the previous value (or delete if it did not previously exist). Staff fall back to Fisiozero per §4 while DNS propagates.
3. Notify all staff (WhatsApp): **"Problema técnico. Continuem a usar o Fisiozero para marcações e fichas. Avisamos quando estiver resolvido."**

### Step R2 — Database rollback via Supabase PITR

If patient data is corrupted or the migration import produced bad data:

> **Prerequisite:** Supabase Pro with PITR must be enabled (checked in §1.1). Without PITR this step is not available — the backup from Step 2 is the fallback.

1. **[IVAN]** Supabase dashboard → Database → Backups → Point-in-time Recovery.
2. Select a restore point **before** the import run (use the `pre-cutover-<date>` backup from Step 2 as the reference timestamp).
3. Restore to a **new Supabase project** (not the production project in place) to verify data integrity before promoting.
4. Once the restored project is confirmed clean, contact Supabase support to promote it as the production database, or re-import from the last clean state into the existing production project.
5. After DB rollback, re-run the migration import from the staged rows (which are idempotent — `imported` rows are preserved, `pending` rows can be re-staged).

> If PITR is not available (Pro plan not yet activated), restore from the manual backup taken in Step 2. Supabase dashboard → Database → Backups → Restore.

### Step R3 — Notify and reschedule

1. **[JP]** Send rollback comms to staff (WhatsApp): inform them the switch is postponed, Fisiozero remains the system of record, and they will be notified of the new cutover date.
2. **[IVAN]** File an incident note in `docs/DECISIONS.md` with the failure point, root cause, and next steps.
3. Reschedule cutover for a date at least 5 working days out to allow full root-cause investigation and re-verification of the pre-cutover checklist.

---

## 4. Fisiozero read-only fallback — staff procedure

This section is the reference for staff during any post-cutover period when they need historical data from Fisiozero, or during a rollback period when Fisiozero is temporarily the active system again.

### 4.1 What is still in Fisiozero

After the cutover, Fisiozero contains:

- **All historical appointments** up to the Fisiozero freeze time (Step 1 of §2).
- **All historical clinical records** (fichas clínicas) from before cutover.
- **All patient demographic data** from before cutover (name, DOB, phone, address).

Everything created after the freeze time is in OsteoJP only.

### 4.2 How to access Fisiozero (read-only)

Fisiozero access continues through its existing URL and credentials. No new bookings or records should be created after the freeze.

**If you need historical data:**
1. Log in to Fisiozero with your existing credentials.
2. Search for the patient by name.
3. View appointment history and clinical notes.
4. Do not create, edit, or delete anything in Fisiozero after the freeze.

**If you cannot log in to Fisiozero:**
Contact João Pedro. Fisiozero access is maintained for **at least 4 weeks post-cutover** (per [`docs/launch-comms.md`](./launch-comms.md) sender notes).

### 4.3 When to use Fisiozero vs OsteoJP

| Scenario | Where to look |
|---|---|
| Booking a new appointment | **OsteoJP** (`app.osteojp.pt`) |
| Recording a clinical note from today's session | **OsteoJP** |
| Viewing a historical note from before cutover | **Fisiozero** (if not yet imported) or OsteoJP (if import was run) |
| Checking a patient's old appointment history | **OsteoJP** (migrated data) — if missing, check Fisiozero |
| Printing an old report | **Fisiozero** or OsteoJP if the record was imported |

### 4.4 Fisiozero access sunset

Fisiozero read-only access is maintained for **4 weeks post-cutover**. After that point, all historical data should be accessible from OsteoJP (Phase 5 migration complete). João Pedro will confirm the sunset date and notify staff via WhatsApp before access is removed.

---

## 5. Post-cutover monitoring (first 7 days)

These are not blocking steps — they run in parallel with normal operations.

| Day | Check | Owner |
|---|---|---|
| D+0 | Confirm all staff can log in. Check Sentry EU dashboard for any new error events. | IVAN |
| D+0 | Confirm Inngest dashboard shows no failed jobs. | IVAN |
| D+1 | Confirm first appointment reminders sent (if any are due within 48h). Check Resend delivery events. | IVAN |
| D+2 | Spot-check 3 clinical records created since cutover — correct therapist, correct patient, data intact. | JP |
| D+7 | Send 1-week follow-up to staff (§3 of [`docs/launch-comms.md`](./launch-comms.md)). Collect feedback. | JP |
| D+7 | Review Sentry for any recurring errors. Review Inngest for failed jobs. File issues as needed. | IVAN |
| D+28 | Confirm migration import is complete (all Fisiozero data in OsteoJP). Sunset Fisiozero access. | JP + IVAN |

---

## 6. Reference: environment variables to flip at cutover

| Variable | Pre-cutover value | At/after cutover | Owner |
|---|---|---|---|
| `REMINDERS_LIVE_SEND` | `false` | `true` (only after JP authorization, Step 9) | IVAN |
| `TWILIO_SENDER_ID` | test number | `OsteoJP` | IVAN (done pre-cutover, §1.5) |
| `INVOICEXPRESS_API_KEY` | unset | live key from `osteojplda.app.invoicexpress.com` | IVAN (done pre-cutover, §1.5) |
| `IFTHENPAY_MBWAY_KEY` | unset | live key from JP | IVAN (done pre-cutover, §1.5) |
| `IFTHENPAY_ANTIPHISHING_KEY` | unset | live key from JP | IVAN (done pre-cutover, §1.5) |

All other env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SENTRY_DSN`, `NEXT_PUBLIC_SUPABASE_*`) should already point to the production Supabase project and are not changed at cutover.

---

_Last updated: 2026-06-20_
