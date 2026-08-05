/* ================================================================== */
/* 0056 — patient auth storage (W13-03, Wave 13 LOOP 3)                */
/*                                                                    */
/* The three tables Decision D's OTP login needs. PG1: "OTP by SMS per */
/* Decision D with all the limits, trusted device 30 days, transport   */
/* behind an interface with a test sink and the Twilio adapter behind  */
/* a flag, pt-PT degradation copy."                                    */
/*                                                                    */
/* ONE MIGRATION, THREE TABLES, because they are one feature and a     */
/* deployment holding some of them cannot serve a login. The OTP is    */
/* useless without its attempt cap, the attempt cap is not a control   */
/* without the durable counter, and the trusted device is what stops   */
/* the whole flow running on every page load.                          */
/*                                                                    */
/* NUMBER DERIVATION, per WAVE-13.md section 1.5 — re-derived at       */
/* authoring time, never pre-assigned in a plan or a card. The journal */
/* packages/db/migrations/meta/_journal.json ends at idx 54, tag       */
/* 0055_staff_notifications, 55 entries; both mirrored trees agree     */
/* (packages/db/migrations and supabase/migrations hold an identical   */
/* file list). Next free is therefore 0056, journal idx 55.            */
/*                                                                    */
/* THE OWNER RATIFIED THIS LOOP AS MIGRATION-BEARING on 2026-08-05,    */
/* after the storage finding below. WAVE-13.md section 5 never listed  */
/* LOOP 3, and LOOP 3 section 5 anticipated exactly this case: "Do not */
/* author a migration in this loop unless the trusted-device record    */
/* requires one; if it does, that migration takes the global in-flight */
/* slot and section 1.5 applies in full." It does, and it has.         */
/*                                                                    */
/* THE FINDING, re-derived rather than asserted. Nothing on origin/main */
/* can carry any of this: a search of packages/db/src/schema.ts for    */
/* trusted-device or OTP storage returns ONE hit, and it is a comment  */
/* string ("signed_token | otp_session") in the patient audit log's    */
/* auth_means column, not a table. And the rate limiter says so about  */
/* itself, in its own header at apps/api/lib/rate-limit/limiter.ts:8-  */
/* 20: the default store is per-process memory, "a control an attacker */
/* can reset by waiting for a cold instance is not a control", and     */
/* "the OTP flow therefore needs a DURABLE shared store before it      */
/* ships. That store is a pending decision: every option is either a   */
/* new vendor (Upstash Redis) or a new table."                         */
/*                                                                    */
/* WF-06 (owner ruling R3, 2026-08-05) resolved that pending decision: */
/* durable store approved, on the EXISTING Postgres, NO new external   */
/* vendor — a vendor addition is a new subprocessor and would reopen   */
/* counsel's annex mid-close. This file is the table that ruling       */
/* chose.                                                             */
/*                                                                    */
/* SECRETS ARE STORED AS HASHES, NEVER AS VALUES — the same doctrine   */
/* 0054 applied to action tokens, applied here to three more secrets:  */
/* the OTP code, the trusted-device token, and the phone number that   */
/* keys them. See each table for why.                                  */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* 1. patient_otp_codes — the 6-digit code, Decision D.                */
/*                                                                    */
/* THE CODE IS HASHED, NEVER STORED. A 6-digit code has only 10^6      */
/* possibilities, so a stored code is not merely a secret at rest, it  */
/* is a secret anyone with a database read can use immediately against */
/* a named phone. The hash is SHA-256 of the code plus the phone hash  */
/* as a domain separator, so the same code issued to two phones does   */
/* not collide and a rainbow table over six digits does not transfer   */
/* between rows. The CHECK pins 64 lowercase hex, so a writer that     */
/* passes the raw code by mistake gets a constraint violation rather   */
/* than a table full of live credentials.                              */
/*                                                                    */
/* THE PHONE IS HASHED TOO, and that is a deliberate departure from    */
/* `patients.phone`, which is plaintext. This table is reachable       */
/* BEFORE authentication — anyone can ask for a code — so it would     */
/* otherwise become a second, unauthenticated-write copy of every      */
/* patient's phone number, growing without bound and never read by any */
/* clinical path. The hash is all the flow needs: request hashes the   */
/* incoming number to find or create a row, verify hashes it again to  */
/* look the row up. Nothing ever needs the plaintext back, so it is    */
/* never written. Linkage to a patient row (WF-07) happens against     */
/* `patients.phone` at CLAIM time, using the phone the caller just     */
/* proved, not a value read back from here.                            */
/*                                                                    */
/* NO patient_id COLUMN, deliberately. At request-code time the        */
/* patient is not yet identified, and WF-07 makes the match a claim-   */
/* time decision that REFUSES on zero, multiple, or already-linked     */
/* candidates. Recording a guessed patient_id here would pre-commit    */
/* that decision at the wrong moment and give a later reader a linkage */
/* that was never proven.                                              */
/*                                                                    */
/* attempts + consumed_at ARE THE CONTROL, and both are needed. An     */
/* attempt cap without single-use lets a correct code be replayed; a   */
/* single-use flag without an attempt cap lets 10^6 guesses run        */
/* against one row. `consumed_at` is set in the same transaction as    */
/* the session mint, for the same reason 0054 couples the action to    */
/* the consumption record.                                             */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS "patient_otp_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "phone_hash" text NOT NULL,
  "code_hash" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "patient_otp_codes_phone_hash_is_sha256_hex"
    CHECK ("phone_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "patient_otp_codes_code_hash_is_sha256_hex"
    CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "patient_otp_codes_attempts_non_negative"
    CHECK ("attempts" >= 0)
);
--> statement-breakpoint

/* The verify lookup: the newest live code for this phone. Partial on
   unconsumed rows because a consumed code is never a candidate again. */
CREATE INDEX IF NOT EXISTS "patient_otp_codes_phone_live_idx"
  ON "patient_otp_codes" ("phone_hash", "expires_at" DESC)
  WHERE "consumed_at" IS NULL;
--> statement-breakpoint

/* Retention/cleanup hook. Codes are short-lived and this table is the
   fastest-growing thing in the schema: every login attempt, successful or
   not, writes a row. Tenant-agnostic on purpose — a purge is a platform
   job, not a tenant query. The PERIOD IS NOT SET IN CODE, matching how
   0054 left the audit log's retention to counsel. */
CREATE INDEX IF NOT EXISTS "patient_otp_codes_expiry_idx"
  ON "patient_otp_codes" ("expires_at");
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 2. patient_trusted_devices — the 30-day window, Decision D.         */
/*                                                                    */
/* THE TOKEN IS HASHED, NEVER STORED, and the hash is the PRIMARY KEY  */
/* rather than a column: a device token is a bearer credential, so a   */
/* database read must not yield anything that can be presented as one. */
/* Same reasoning and same shape as action_token_consumptions in 0054. */
/*                                                                    */
/* expires_at IS FIXED AT CREATION AND NEVER MOVED. LOOP 3 step 6 is   */
/* explicit that the device "does not extend itself silently on use    */
/* beyond the ruled window", so `last_seen_at` exists for support and  */
/* revocation triage and is deliberately NOT an input to expiry. A     */
/* sliding 30 days would mean an active device never expires, which is */
/* a different control from the one the owner ruled.                   */
/*                                                                    */
/* revoked_at MAKES REVOCATION EXPLICIT rather than a row deletion, so */
/* "this device was revoked on the 4th" survives as an answerable      */
/* question. A deleted row cannot tell a later dispute anything.       */
/*                                                                    */
/* patient_id CASCADES here, unlike the audit trail in 0054. A trusted */
/* device is a live credential belonging to a person, not a record of  */
/* something that happened: when the patient is gone the credential    */
/* must not outlive them. Deleting a patient is already an owner-      */
/* confirmable destructive operation.                                  */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS "patient_trusted_devices" (
  "device_token_hash" text PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "patient_trusted_devices_hash_is_sha256_hex"
    CHECK ("device_token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint

/* "Show me my devices" and the revoke-all sweep. */
CREATE INDEX IF NOT EXISTS "patient_trusted_devices_patient_idx"
  ON "patient_trusted_devices" ("patient_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "patient_trusted_devices_expiry_idx"
  ON "patient_trusted_devices" ("expires_at");
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 3. rate_limit_counters — the durable store WF-06 authorised.        */
/*                                                                    */
/* NO tenant_id, AND THAT IS NOT AN OMISSION. Rate limiting runs       */
/* BEFORE the auth check — the posture LOOP 3 was told to copy from    */
/* apps/api/app/api/v1/auth/session/route.ts, so that an               */
/* unauthenticated attacker cannot spend the verification budget for   */
/* free. At that moment there is no verified tenant to scope by, and a */
/* tenant column would either be unverified caller input or a lie. The */
/* key already carries whatever scope the caller chose (per phone hash,*/
/* per client key).                                                    */
/*                                                                    */
/* FIXED WINDOW, matching the in-memory store's semantics exactly, so  */
/* the two implementations cannot disagree about what a limit means.   */
/* The reset is folded into the UPSERT rather than done as a separate  */
/* DELETE, which is what makes it atomic:                              */
/*                                                                    */
/*   INSERT INTO rate_limit_counters (key, count, reset_at)            */
/*   VALUES ($1, 1, now() + $2)                                        */
/*   ON CONFLICT (key) DO UPDATE SET                                   */
/*     count = CASE WHEN rate_limit_counters.reset_at <= now()         */
/*                  THEN 1 ELSE rate_limit_counters.count + 1 END,     */
/*     reset_at = CASE WHEN rate_limit_counters.reset_at <= now()      */
/*                     THEN now() + $2 ELSE rate_limit_counters.reset_at END */
/*   RETURNING count, reset_at;                                        */
/*                                                                    */
/* One statement, one row lock, no read-then-write window. This is the */
/* property the memory store cannot have across instances and the      */
/* reason its own header says an OTP lockout built on it is not a      */
/* control.                                                            */
/*                                                                    */
/* THE KEY IS OPAQUE AND ALREADY HASHED BY THE CALLER (clientKey()     */
/* hashes the client identity; the OTP paths key by phone_hash), so no */
/* IP address or phone number is stored here in the clear. The CHECK   */
/* only bounds the length — this table must accept future keys the     */
/* limiter has not invented yet, so pinning a format would be a        */
/* constraint on tomorrow's callers rather than a safety property.     */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
  "key" text PRIMARY KEY NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "reset_at" timestamp with time zone NOT NULL,
  CONSTRAINT "rate_limit_counters_key_bounded"
    CHECK (length("key") > 0 AND length("key") <= 200),
  CONSTRAINT "rate_limit_counters_count_non_negative"
    CHECK ("count" >= 0)
);
--> statement-breakpoint

/* The sweep. Expired windows are dead weight, and this table takes a
   write on every rate-limited request, so it needs a cheap purge path
   more than any other table here. */
CREATE INDEX IF NOT EXISTS "rate_limit_counters_reset_idx"
  ON "rate_limit_counters" ("reset_at");
--> statement-breakpoint

/* ------------------------------------------------------------------ */
/* 4. Table gates and row gates.                                       */
/*                                                                    */
/* ALL THREE TABLES ARE SERVICE-ROLE ONLY. Neither `patient` nor       */
/* `authenticated` gets any grant, and that is the whole access model  */
/* rather than an oversight:                                           */
/*                                                                    */
/*   - Every one of these paths runs BEFORE a session exists. There is */
/*     no patient principal to scope by at request-code time, so a     */
/*     `TO patient` policy could not be written honestly.              */
/*   - They hold authentication material. A patient who could read     */
/*     patient_otp_codes could enumerate which phone numbers are       */
/*     mid-login; one who could read patient_trusted_devices would     */
/*     hold other people's device credentials.                         */
/*   - apps/api reaches them through getDbAdmin, which is the          */
/*     sanctioned path this repo already uses for the appointments     */
/*     store (store.ts:41) with scope enforced in application code.    */
/*                                                                    */
/* RLS IS ENABLED ANYWAY, WITH NO POLICIES. That combination is        */
/* fail-closed by construction: Postgres denies any command with no    */
/* matching policy, so if a future connection ever arrives as          */
/* `authenticated` or `patient` it gets nothing, and it gets nothing   */
/* for TWO independent reasons — the missing GRANT at the table gate   */
/* and the absent policy at the row gate. That is what "every          */
/* MUST-NEVER row has an enforcement point" (PG6) asks for.            */
/*                                                                    */
/* These tables do NOT inherit 0003's blanket grant: `GRANT ... ON ALL */
/* TABLES IN SCHEMA public` applied to the tables that existed when it */
/* ran. The explicit REVOKE below exists to survive a FUTURE blanket   */
/* grant rather than to undo a present one.                            */
/* ------------------------------------------------------------------ */

REVOKE ALL ON public.patient_otp_codes FROM authenticated, patient;--> statement-breakpoint
REVOKE ALL ON public.patient_trusted_devices FROM authenticated, patient;--> statement-breakpoint
REVOKE ALL ON public.rate_limit_counters FROM authenticated, patient;--> statement-breakpoint

ALTER TABLE public.patient_otp_codes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.patient_trusted_devices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
