/* ================================================================== */
/* 0063 - guest_booking_requests. ITEM 6.                             */
/*                                                                    */
/* THE PROJECT'S FIRST UNAUTHENTICATED WRITE SURFACE, AND THIS TABLE  */
/* EXISTS SO THAT SURFACE TOUCHES NO CLINICAL TABLE AT ALL.           */
/*                                                                    */
/* The obvious cheaper design was to create a provisional `patients`  */
/* row and reuse the existing pedido path. It needs no migration and  */
/* it is wrong twice over:                                            */
/*                                                                    */
/*   1. It writes a CLINICAL record from an anonymous HTTP request.   */
/*      appointments.patient_id and staff_notifications.patient_id    */
/*      are both NOT NULL, so the existing path cannot represent a    */
/*      person who does not exist yet without inventing one.          */
/*   2. It is auto-linking under another name. R-GUEST forbids        */
/*      linking a guest to an existing patient, and creating a new    */
/*      patient row for someone who may BE an existing patient is the */
/*      same mistake with an extra duplicate attached.                */
/*                                                                    */
/* So a guest request lives here until a human confirms it. Reception */
/* converts it - creating the patient and the appointment - at the    */
/* moment a person is already in the loop. Nothing anonymous ever     */
/* reaches patients, appointments or clinical_records.                */
/*                                                                    */
/* ------------------------------------------------------------------ */
/* NO ANON RLS POLICY, AND THAT IS DELIBERATE.                        */
/*                                                                    */
/* The insert runs from apps/api under the SERVICE ROLE, the same     */
/* seam the durable rate-limit store uses (0056). Granting `anon` an  */
/* INSERT policy would have been the other way to do it and would     */
/* have put a writable, internet-reachable policy on a tenant table   */
/* forever, guarded only by whatever WITH CHECK expression survives   */
/* future edits. A service-role insert is guarded by application code */
/* that can rate-limit, validate and reject BEFORE anything is        */
/* written, and this table keeps NO anon-reachable policy at all.     */
/*                                                                    */
/* Rule 3 (CLAUDE.md) therefore binds the caller: the service-role    */
/* insert MUST set tenant_id explicitly. It is NOT NULL here so a     */
/* caller that forgets fails loudly rather than writing a row that    */
/* belongs to nobody.                                                 */
/* ================================================================== */

CREATE TABLE IF NOT EXISTS public.guest_booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),

  /* R-GUEST-2: the MINIMUM. A name, a number, the service and the slot.
     NO NIF (PL-20). No health data, nothing clinical before the first visit. */
  full_name text NOT NULL,
  phone text NOT NULL,

  /* DERIVED, GENERATED ALWAYS, and the expression is 0062's VERBATIM.
     This is what reception's "possible existing patient" flag matches on:
     guest.phone_e164 = patients.phone_e164. If the two normalised
     DIFFERENTLY, the flag would silently miss real matches - the failure
     would look exactly like "no match", which is the benign answer.
     THE DUPLICATION IS ACKNOWLEDGED, NOT INVISIBLE: a parity test requires the
     two columns to agree over one corpus, and collapsing both into a single
     SQL function is carded as a follow-up. It is NOT done here because 0063 is
     authorized for this table only, and rewriting patients.phone_e164 is a
     generated-column rewrite on a table holding real clinical data. */
  phone_e164 varchar(16)
  GENERATED ALWAYS AS (
    CASE
      WHEN phone IS NULL THEN NULL
      WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g')
             ~ '^\+351[29][0-9]{8}$'
        THEN '+351' || pg_catalog.right(
               pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g'), 9)
      WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g')
             ~ '^00351[29][0-9]{8}$'
        THEN '+351' || pg_catalog.right(
               pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g'), 9)
      WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g')
             ~ '^351[29][0-9]{8}$'
        THEN '+351' || pg_catalog.right(
               pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g'), 9)
      WHEN pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g')
             ~ '^[29][0-9]{8}$'
        THEN '+351' || pg_catalog.regexp_replace(phone, '[[:space:].()-]', '', 'g')
      ELSE NULL
    END
  ) STORED,

  service_id uuid NOT NULL REFERENCES public.services(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  /* The 5-step flow has a therapist step, but a guest may also accept "any
     available". NULL means no preference, which is a real answer rather than
     a missing one. */
  practitioner_id uuid REFERENCES public.users(id),

  requested_starts_at timestamptz NOT NULL,
  requested_ends_at timestamptz NOT NULL,

  /* R-GUEST-1: EVERY guest booking is a request. There is no path that
     creates this row already confirmed, so the default is the only sane
     starting value and the CHECK pins the vocabulary. */
  status text NOT NULL DEFAULT 'pending',

  /* Set when reception converts. Recorded as DATA with no FK, matching
     staff_notifications.appointment_id: a cascade must not be able to erase
     the trail of what a guest asked for, and SET NULL must not silently
     rewrite it. */
  converted_appointment_id uuid,
  converted_patient_id uuid,

  /* Abuse forensics only. HASHED, never the address itself: an IP is personal
     data under RGPD and the clinic has no purpose for the raw value. */
  source_ip_hash text,

  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz,
  handled_by uuid REFERENCES public.users(id),

  CONSTRAINT guest_booking_requests_status_check
    CHECK (status IN ('pending', 'confirmed', 'declined')),
  CONSTRAINT guest_booking_requests_window_check
    CHECK (requested_ends_at > requested_starts_at)
);--> statement-breakpoint

/* Reception's queue: the pending ones, newest first, per tenant. */
CREATE INDEX IF NOT EXISTS guest_booking_requests_tenant_status_idx
  ON public.guest_booking_requests (tenant_id, status, created_at DESC);--> statement-breakpoint

/* The duplicate flag's lookup, and the per-phone rate-limit read. */
CREATE INDEX IF NOT EXISTS guest_booking_requests_tenant_phone_idx
  ON public.guest_booking_requests (tenant_id, phone_e164);--> statement-breakpoint

ALTER TABLE public.guest_booking_requests ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* STAFF READ. Tenant-scoped on the JWT claim, exactly like every other domain
   table. `authenticated` only - there is deliberately NO anon or patient
   policy on this table, in either direction. */
CREATE POLICY guest_booking_requests_select_own_tenant
  ON public.guest_booking_requests
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.jwt_tenant_id());--> statement-breakpoint

/* STAFF UPDATE - confirming or declining a request. Same tenant on both sides
   so a row cannot be moved between tenants by an UPDATE. */
CREATE POLICY guest_booking_requests_update_own_tenant
  ON public.guest_booking_requests
  FOR UPDATE
  TO authenticated
  USING (tenant_id = public.jwt_tenant_id())
  WITH CHECK (tenant_id = public.jwt_tenant_id());--> statement-breakpoint

/* NO INSERT AND NO DELETE POLICY, FOR EITHER ROLE.
   INSERT is the service-role path described in the header. DELETE is absent
   because a guest request is a record of what somebody asked for: declined is
   a STATUS, not a deletion (the same annul-never-delete principle the clinical
   records follow). */

COMMENT ON TABLE public.guest_booking_requests IS
  'ITEM 6. Booking requests from people who are NOT existing patients: no '
  'account, no OTP. Written by apps/api under the service role (no anon RLS '
  'policy exists); read and updated by staff, tenant-scoped. Every row is a '
  'REQUEST (R-GUEST-1) and is converted into a patient + appointment by '
  'reception, never automatically. phone_e164 mirrors patients.phone_e164 so '
  'the possible-existing-patient flag matches on the same normalisation; the '
  'two are required to agree by a parity test. Migration 0063.';
