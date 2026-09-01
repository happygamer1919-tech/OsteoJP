/* ================================================================== */
/* 0072 - appointment_confirm_codes, and the ONE function that reads  */
/*        it. SR-26 as amended by SR-28, SR-29 and SR-30.             */
/*                                                                    */
/* SCOPE, RULED AND BOUNDED: this table and this lookup function.     */
/* No route, no page, no template, no other table, no other policy.   */
/* ================================================================== */
/*                                                                    */
/* WHY A TABLE AT ALL, since the 48h email link is stateless.         */
/*                                                                    */
/* THREE REASONS, ANY ONE DECISIVE, and the arithmetic is the least   */
/* interesting of them:                                               */
/*                                                                    */
/* 1. JP's approved SMS line leaves 36 characters for the code. A     */
/*    stateless token must carry the appointment id (128 bits), the   */
/*    tenant id (128 bits, because hard architecture rule #3 requires */
/*    the public route to enter tenant-scoped RLS from a value WE     */
/*    signed) and a truncated HMAC (96 bits is the floor for an       */
/*    unauthenticated write path). 352 bits is 59 base64url           */
/*    characters against 36 available. Dropping tenant_id breaks the  */
/*    architecture rule AND still overflows, by 2.                    */
/*                                                                    */
/* 2. ONE-TIME USE CANNOT BE STATELESS, and this is independent of    */
/*    length. "Already used" is a fact about the past, and the only   */
/*    place a fact about the past can live is a row.                  */
/*                                                                    */
/* 3. IDEMPOTENCY DOES NOT SUBSTITUTE. `confirmar` is idempotent in   */
/*    effect - agendada -> confirmada, and re-confirming is a no-op.  */
/*    `pedir remarcacao` IS NOT: each press emits another             */
/*    appointment_request into reception's queue. The second action   */
/*    is precisely the one that needs consumption state.              */
/*                                                                    */
/* AND action_token_consumptions CANNOT SERVE, checked rather than    */
/* assumed: it is written at REDEMPTION, its primary key is a         */
/* token_hash under a CHECK, it carries no scope column, and it has   */
/* an append-only trigger. Pre-inserting at issue time would make     */
/* every code read as already spent.                                  */
/* ================================================================== */

CREATE TABLE public.appointment_confirm_codes (
  /* ================================================================
   * AN HMAC, NOT THE CODE, AND NOT A BARE SHA256. SR-28.
   *
   * The code in the SMS is 8 base64url characters - 48 bits. A bare
   * sha256 of 48 bits is exhaustible offline by anyone who obtains a
   * copy of this table: 2.8e14 candidates is a GPU afternoon. Keyed
   * on a server secret the table alone is useless, because the
   * attacker does not have the key.
   *
   * The CHECK is the hex form of a 256-bit HMAC, the same shape
   * action_token_consumptions uses for its token_hash.
   * ================================================================ */
  code_hash text PRIMARY KEY
    CONSTRAINT appointment_confirm_codes_hash_is_hex
    CHECK (code_hash ~ '^[0-9a-f]{64}$'),

  /* Carried so the public route can enter tenant-scoped RLS from the
   * row it just resolved. See resolve_confirm_code below for why the
   * resolution itself cannot be tenant-scoped. */
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),

  appointment_id uuid NOT NULL
    REFERENCES public.appointments(id) ON DELETE CASCADE,

  /* ================================================================
   * CONSUMPTION IS ONE NULLABLE TIMESTAMP AND NOTHING ELSE.
   *
   * Only `pedir remarcacao` consumes; `confirmar` is idempotent and
   * leaves this NULL. So a single timestamp already says everything
   * there is to say, and a `consumed_action` column would invite a
   * second consumer later without the ruling that should accompany
   * one.
   * ================================================================ */
  consumed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

COMMENT ON TABLE public.appointment_confirm_codes IS
  'Short confirmation codes for the 24h SMS link. One live code per '
  'appointment. The CODE is never stored - code_hash is an HMAC keyed on a '
  'server secret, so a copy of this table cannot be reversed. There is '
  'deliberately NO expires_at: expiry is read from appointments.starts_at at '
  'redemption, because a reschedule moves the start and a stored copy would '
  'drift (SR-28, and the W13-01 defect where expiry outlived the appointment). '
  'SR-26 / SR-28 / SR-29 / SR-30, migration 0072.';--> statement-breakpoint

/* ================================================================== */
/* ONE LIVE CODE PER APPOINTMENT.                                      */
/*                                                                     */
/* A partial unique index rather than a plain one: a CONSUMED code     */
/* stays in the table as the record that it was spent, and a second    */
/* code may then be issued if the appointment is rescheduled. What     */
/* must never happen is TWO codes both live for the same appointment,  */
/* which is what a retried reminder send would otherwise create.       */
/* ================================================================== */
CREATE UNIQUE INDEX appointment_confirm_codes_one_live_per_appointment
  ON public.appointment_confirm_codes (appointment_id)
  WHERE consumed_at IS NULL;--> statement-breakpoint

/* ================================================================== */
/* THE TABLE GATE. SR-29: no grants to anon or the patient role.       */
/*                                                                     */
/* REVOKE IS EXPLICIT AND IS NOT BELT-AND-BRACES. Supabase applies     */
/* ALTER DEFAULT PRIVILEGES, so a table created on PRODUCTION can      */
/* arrive already granted to anon and authenticated while the same     */
/* migration on a CI database created by one principal arrives with    */
/* nothing. That drift is recorded on this board already: a DB-gated   */
/* failure and a working prod screen meant schema drift, not an        */
/* incident, and the cause was exactly this.                           */
/*                                                                     */
/* So "no grants" is written as a REVOKE rather than as an absence.    */
/* An absence is not a statement; it is the lack of one, and it does   */
/* not survive a default privilege.                                    */
/* ================================================================== */
REVOKE ALL ON public.appointment_confirm_codes FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON public.appointment_confirm_codes FROM anon;--> statement-breakpoint
REVOKE ALL ON public.appointment_confirm_codes FROM authenticated;--> statement-breakpoint
REVOKE ALL ON public.appointment_confirm_codes FROM patient;--> statement-breakpoint

/* RLS on as well. The grants above already close the door; this is the
 * second lock, and every policy-bearing table in this schema has it. */
ALTER TABLE public.appointment_confirm_codes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ================================================================== */
/* THE ONLY DOOR. SR-29.                                               */
/*                                                                     */
/* WHY A SECURITY DEFINER FUNCTION AND NOT A SCOPED SELECT.            */
/*                                                                     */
/* Resolving a code is the one lookup in this system that CANNOT be    */
/* tenant-scoped, and the reason is structural rather than a           */
/* convenience: the public route does not know the tenant until the    */
/* lookup answers. With the 48h email link the tenant travels inside   */
/* the signed token, which is what hard architecture rule #3 is        */
/* about. A stored code carries no signed payload, so there is nothing */
/* to read the tenant from before reading the row.                     */
/*                                                                     */
/* So the crossing is made ONCE, HERE, and it is bounded three ways:   */
/*   - it takes a hash and nothing else, so it cannot be steered;      */
/*   - it returns exactly three columns and NOT the table's rowtype,   */
/*     so adding a column to the table later cannot widen it;          */
/*   - it is the only thing with access, because the table is granted  */
/*     to nobody.                                                      */
/*                                                                     */
/* IT RETURNS consumed_at RATHER THAN A BOOLEAN because the caller     */
/* needs to tell a spent code from a live one to satisfy SR-30, and a  */
/* boolean would push that decision in here where the copy rules       */
/* cannot be seen.                                                     */
/*                                                                     */
/* STABLE, not VOLATILE: it writes nothing. Consumption is a separate  */
/* UPDATE on the caller's own transaction, so a read can never spend a */
/* code by accident.                                                   */
/* ================================================================== */
CREATE OR REPLACE FUNCTION public.resolve_confirm_code(p_code_hash text)
  RETURNS TABLE (tenant_id uuid, appointment_id uuid, consumed_at timestamptz)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT c.tenant_id, c.appointment_id, c.consumed_at
    FROM public.appointment_confirm_codes c
   WHERE c.code_hash = p_code_hash
$$;--> statement-breakpoint

/* 0060's rule: every public SECURITY DEFINER function is owned by
 * `postgres`, because the owner is whose privileges it runs with and a
 * different applying principal would silently change the answer. */
ALTER FUNCTION public.resolve_confirm_code(text) OWNER TO postgres;--> statement-breakpoint

/* ================================================================== */
/* THE FUNCTION GATE.                                                  */
/*                                                                     */
/* `authenticated` ONLY, and that is the app's own role: the reminder  */
/* and redemption paths run through withTenantContext, which does      */
/* `set local role authenticated`. anon and patient get nothing -      */
/* they never call this, and granting a role that does not need a      */
/* function is how a surface widens without a decision.                */
/*                                                                     */
/* 0064's lesson in the other direction: a policy with no grant makes  */
/* every statement answer `permission denied`. So the grant is written */
/* rather than assumed.                                                */
/* ================================================================== */
/* REVOKE FROM THE NAMED ROLES AND NOT ONLY FROM PUBLIC, and this is the same
 * default-privilege trap as the table one above - caught here by RUNNING the
 * post-check rather than trusting it.
 *
 * Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on new functions to `anon`,
 * `authenticated` and `service_role`. `REVOKE ... FROM PUBLIC` does NOT touch a
 * privilege held by a NAMED role, so the function was left callable by `anon` -
 * which means callable over PostgREST as `/rest/v1/rpc/resolve_confirm_code`,
 * by an unauthenticated request, BYPASSING the application's rate limiter
 * entirely. That is precisely the enumeration this design is built to prevent.
 *
 * `service_role` keeps EXECUTE: it is a BYPASSRLS admin that already holds the
 * table outright, so removing it would be theatre. */
REVOKE ALL ON FUNCTION public.resolve_confirm_code(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_confirm_code(text) FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_confirm_code(text) FROM patient;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_confirm_code(text) TO authenticated;--> statement-breakpoint

COMMENT ON FUNCTION public.resolve_confirm_code(text) IS
  'The ONLY read path to appointment_confirm_codes. SECURITY DEFINER because '
  'the public route cannot know the tenant before the lookup answers - there '
  'is no signed payload to read it from, unlike the 48h email token. Returns '
  'exactly (tenant_id, appointment_id, consumed_at) and NOT the table rowtype, '
  'so a later column cannot widen it. SR-29, migration 0072.';
