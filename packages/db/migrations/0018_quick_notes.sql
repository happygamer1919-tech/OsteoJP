/* ================================================================== */
/* 0018 — quick_notes — per-staff scratchpad                         */
/*                                                                    */
/* One row per (tenant_id, staff_user_id). Staff see only their own  */
/* row; the RLS policy combines jwt_tenant_id() (tenant fence) with  */
/* auth.uid() (user fence). This follows the same STABLE-helper      */
/* pattern as 0001 (jwt_tenant_id) and 0010 (jwt_patient_id): both   */
/* predicates are expressed as (select fn()) so Postgres can treat   */
/* them as initPlans evaluated once per query, not per row.           */
/*                                                                    */
/* ⚠ SECURITY NOTE — flag for Ivan's review:                         */
/*   The policy uses auth.uid() directly (the Supabase built-in that  */
/*   reads the `sub` claim from the JWT) instead of a custom claim   */
/*   like jwt_patient_id(). This is safe because:                    */
/*     1. users.id is 1:1 with auth.users.id (enforced by FK).       */
/*     2. auth.uid() is STABLE — Postgres can hoist it the same way. */
/*     3. Tenant isolation is belt-and-suspenders via jwt_tenant_id() */
/*        even if auth.uid() ever returns null (row invisible).       */
/*   Alternative: add a jwt_staff_user_id() wrapper for consistency   */
/*   with the other helpers (trivially: SELECT auth.uid()). Deferred  */
/*   pending Ivan's preference.                                       */
/* ================================================================== */

CREATE TABLE IF NOT EXISTS public.quick_notes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_user_id uuid        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  content       text        NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quick_notes_tenant_user_uq UNIQUE (tenant_id, staff_user_id)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS quick_notes_tenant_user_idx
  ON public.quick_notes (tenant_id, staff_user_id);--> statement-breakpoint

ALTER TABLE public.quick_notes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* Single policy: staff read/write only their own row.               */
/* USING  = row visible only if both predicates hold (SELECT/UPDATE/ */
/*           DELETE guard).                                           */
/* WITH CHECK = new/updated row must satisfy both predicates (INSERT/ */
/*              UPDATE guard).                                        */
CREATE POLICY "quick_notes_own_row" ON public.quick_notes
  FOR ALL
  TO authenticated
  USING      (tenant_id = (select public.jwt_tenant_id()) AND staff_user_id = auth.uid())
  WITH CHECK (tenant_id = (select public.jwt_tenant_id()) AND staff_user_id = auth.uid());--> statement-breakpoint

/* Grant so the anon-to-authenticated promotion in Supabase allows   */
/* DML. service_role BYPASSRLS so no explicit grant needed there.    */
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_notes TO authenticated;
