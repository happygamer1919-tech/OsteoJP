/* ====================================================================== */
/* PENDING, AND IT FOLLOWS 0113. Dated clinic closures per location       */
/* (feriados, closed days): location_closed_days.                         */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. A clinic is shut on some DATES: a national         */
/* holiday, a closed day, a short day ("closes at 13:00 on 24 December"). */
/* OsteoJP has no such list. The lunch closure (0085) is a daily fact     */
/* about a clinic; time_off (0006) is a fact about one person, at every   */
/* clinic, and staff may save over it. Until this file, reception blocked */
/* each therapist with a "Feriado" note, one block per person. This file  */
/* adds the table that says "the BUILDING is shut on these dates", which  */
/* nobody may book over, staff or patient. It writes NO VALUE into any    */
/* existing row.                                                          */
/*                                                                        */
/* RULED BY STRATEGY ON 2026-11-05 (Tier C item 0114), from the design    */
/* note of 2026-11-03 and the owner's answers of 2026-11-05: no override  */
/* (C1); owner, admin and reception manage (C2); national holidays are    */
/* entered for every clinic, no municipal holiday (C3); a save lists the  */
/* visits already booked inside it, nothing is cancelled (C5); online     */
/* booking shows no slots on a closed day (C9).                           */
/*                                                                        */
/* NO NUMBER YET, BY CONSTRUCTION. 0108 is the last file on main. The     */
/* ruled queue is 0109 (HOR-02, #1682), 0110 (#1704), 0111 (#1706), 0112  */
/* (the weekly blocks, #1708) and 0113 (the patient read rules, #1717),   */
/* each held on its own branch. This file depends on none of them; it     */
/* takes the next free number at its own promotion, after 0113 is applied */
/* and merged.                                                            */
/*                                                                        */
/* ====================================================================== */
/* 1. WHAT IT DOES                                                        */
/* ====================================================================== */
/*   - CREATE TABLE public.location_closed_days: id, tenant_id NOT NULL,  */
/*     location_id NOT NULL, starts_on and ends_on NOT NULL, closed_from  */
/*     and closed_to (both null = the whole day), kind NOT NULL, label,   */
/*     created_at, created_by. One row is one closure: "this clinic, from */
/*     <starts_on> to <ends_on> inclusive, the whole day or from          */
/*     <closed_from> to <closed_to> on EACH of those dates".              */
/*   - THE DATES ARE LISBON CALENDAR DATES AND THE HOURS LISBON WALL      */
/*     CLOCK, as the lunch closure's are. A whole day runs from Lisbon    */
/*     midnight to the next Lisbon midnight (23 or 25 hours on the two    */
/*     clock-change Sundays). Every reader converts per date, in          */
/*     Europe/Lisbon.                                                     */
/*   - A PARTIAL CLOSURE REPEATS ITS HOURS ON EACH DATE of the range; it  */
/*     is not one continuous span. "24 Dec from 13:00 to 26 Dec" is two   */
/*     rows: 24 Dec 13:00 to closing, then 25 to 26 whole days.           */
/*   - CHECKS: starts_on <= ends_on; ends_on - starts_on <= 92 (a typo    */
/*     guard, so "2026-12-24 to 2027-12-26" is refused); closed_from and  */
/*     closed_to both null or both set; closed_from < closed_to; kind in  */
/*     the four values; label not blank and at most 80 characters.        */
/*   - NO DUPLICATE CLOSURE: one row per (tenant, location, starts_on,    */
/*     ends_on, closed_from, closed_to), NULLS NOT DISTINCT, so two whole */
/*     day rows for the same dates collide. Two closures that merely      */
/*     overlap are allowed; the readers take their union.                 */
/*   - NO UPDATE. A closure is deleted and added again. A closure that    */
/*     has already started cannot be deleted by staff (section 2): it is  */
/*     history for the capacity figures. The owner can still have one     */
/*     corrected by a data operation, which runs as the owning role.      */
/*   - THE CLOSURES GO WITH THE CLINIC: location_id references locations  */
/*     ON DELETE CASCADE. deleteLocation hard-deletes only a clinic with  */
/*     no appointment, and its closures are configuration.                */
/*   - created_by references users ON DELETE SET NULL, as the sibling     */
/*     pending files: deleting the account that typed a closure never     */
/*     takes the closure with it. It is NULLABLE, so a data operation     */
/*     run as the owning role (for example, a later conversion of the     */
/*     interim "Feriado" person blocks into closures) can write rows that */
/*     no staff account typed.                                            */
/*                                                                        */
/* WHAT READS IT (the application, in this same pull request, and only    */
/* once this table exists): the staff refusal checkClinicClosure (every   */
/* write path that already refuses the lunch closure, plus Agendar lote   */
/* and the confirmation of a portal pedido), the availability read behind */
/* Nova marcacao, Agendar lote and the Horarios inspector, the agenda's   */
/* closure band, and the patient portal's slot grid, therapist list and   */
/* booking guards through closureOverlapExists. Each asks whether the     */
/* table exists first, so a database without this file reads as today.   */
/*                                                                        */
/* ====================================================================== */
/* 2. WHO READS, WHO WRITES                                               */
/* ====================================================================== */
/* location_closed_days, by RLS (ENABLE, not FORCE, as everywhere), split */
/* per command instead of one FOR ALL, whose USING would also open UPDATE */
/* (and this table has no update path):                                   */
/*   SELECT  owner, admin, therapist and reception of the row's tenant.   */
/*           Every staff role books, and every booking reads the clinic's */
/*           closures.                                                    */
/*   INSERT  owner, admin and reception of the row's tenant (C2); the row */
/*           names its creator (created_by = auth.uid()); location_id is  */
/*           a location of the caller's own tenant.                       */
/*   DELETE  owner, admin and reception of the row's tenant, and only a   */
/*           closure that has not started yet: starts_on is after today   */
/*           in Lisbon.                                                   */
/*   UPDATE  nobody (no grant, no policy).                                */
/* Which clinics a located receptionist or admin may manage stays the     */
/* application's check, as it is for every schedule write.                */
/*                                                                        */
/* The table gates follow 0106: REVOKE ALL by name from PUBLIC, anon,     */
/* authenticated, patient and service_role (the platform's default        */
/* privileges hand authenticated and service_role every privilege at      */
/* CREATE TABLE, and a REVOKE from PUBLIC does not touch a role granted   */
/* by name), then:                                                        */
/*   authenticated  SELECT, INSERT, DELETE.                               */
/*   service_role, patient, anon   nothing.                               */
/* The patient portal's slot grid and booking guards                      */
/* (apps/api/lib/appointments/store.ts) read through getDbAdmin, which    */
/* connects as the table's OWNING role, not as service_role: the owner    */
/* holds every privilege and RLS (ENABLE, not FORCE) does not apply to    */
/* it. So no role needs a grant for the portal, and none is given.        */
/*                                                                        */
/* THE CLINIC IS OF THE CALLER'S TENANT. The INSERT check also asks that  */
/* location_id names a locations row of the JWT tenant, so a closure can  */
/* never point at another tenant's clinic. The subquery runs under the    */
/* caller's own locations policies, which show staff their tenant's rows. */
/*                                                                        */
/* ====================================================================== */
/* 3. THE LOCKS, read from the statements, in order                       */
/* ====================================================================== */
/* Sections A to C touch only the new table. Section D adds its keys to   */
/* tenants, locations and users: SHARE ROW EXCLUSIVE on each until the    */
/* COMMIT (writes to them wait, reads do not). Section E is the three     */
/* CREATE POLICY statements, LAST, because each takes the platform locks  */
/* 0106 describes until the COMMIT. This file creates policies, so its    */
/* sitting is closed hours only, never R9. It creates no function and no  */
/* sequence, so the SECURITY DEFINER count is unchanged, and it alters no */
/* existing table but by the three foreign keys.                          */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint
SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint

/* ====================================================================== */
/* A. THE TABLE                                                           */
/* ====================================================================== */
/* The keys to tenants, locations and users are added in section D, so    */
/* nothing here locks an existing table.                                  */
CREATE TABLE public.location_closed_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  location_id uuid NOT NULL,
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  closed_from time,
  closed_to   time,
  kind        text NOT NULL
    CONSTRAINT location_closed_days_kind_check CHECK (kind IN ('feriado_nacional', 'feriado_municipal', 'encerramento', 'outro')),
  label       text
    CONSTRAINT location_closed_days_label_check CHECK (label IS NULL OR (btrim(label) <> '' AND char_length(label) <= 80)),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  CONSTRAINT location_closed_days_range_order CHECK (starts_on <= ends_on),
  CONSTRAINT location_closed_days_range_length CHECK (ends_on - starts_on <= 92),
  CONSTRAINT location_closed_days_hours_pair CHECK ((closed_from IS NULL) = (closed_to IS NULL)),
  CONSTRAINT location_closed_days_hours_order CHECK (closed_from IS NULL OR closed_from < closed_to),
  CONSTRAINT location_closed_days_dedupe_uq UNIQUE NULLS NOT DISTINCT (tenant_id, location_id, starts_on, ends_on, closed_from, closed_to)
);--> statement-breakpoint

/* Every reader's lookup is "this clinic, a date between starts_on and    */
/* ends_on". The unique key above also leads with (tenant_id,             */
/* location_id, starts_on), but this index is the one the design names    */
/* and it is narrow.                                                      */
CREATE INDEX location_closed_days_lookup_idx ON public.location_closed_days (tenant_id, location_id, starts_on);--> statement-breakpoint

COMMENT ON TABLE public.location_closed_days IS
  'Dated clinic closures (Tier C 0114, ruled 2026-11-05): the clinic named by '
  'location_id is shut on every Lisbon date from starts_on to ends_on inclusive, '
  'the whole day when closed_from and closed_to are null, else from closed_from '
  'to closed_to (Lisbon wall clock) on each of those dates. Nobody books over it: '
  'not staff with "Guardar mesmo assim", not the patient portal. No update path; '
  'staff delete only a closure that has not started. Written by owner, admin and '
  'reception of the tenant.';--> statement-breakpoint

/* ====================================================================== */
/* B. ROW LEVEL SECURITY ON                                               */
/* ====================================================================== */
/* Until section E runs the table has RLS on and no policy, which admits  */
/* no application role: the safe side, and inside this one transaction.  */
ALTER TABLE public.location_closed_days ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ====================================================================== */
/* C. THE TABLE GATES                                                     */
/* ====================================================================== */
REVOKE ALL ON TABLE public.location_closed_days FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE public.location_closed_days TO authenticated;--> statement-breakpoint

/* ====================================================================== */
/* D. THE KEYS TO TABLES THAT EXISTED BEFORE THIS FILE                    */
/* ====================================================================== */
/* TO THE TENANT: NO ACTION, as 0106. TO THE CLINIC: CASCADE, TO THE      */
/* CREATOR: SET NULL (section 1).                                         */
ALTER TABLE public.location_closed_days
  ADD CONSTRAINT location_closed_days_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  ADD CONSTRAINT location_closed_days_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE,
  ADD CONSTRAINT location_closed_days_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;--> statement-breakpoint

/* ====================================================================== */
/* E. WHO READS AND WHO WRITES: THE LAST THREE STATEMENTS                 */
/* ====================================================================== */
/* NOTHING FOLLOWS THESE. One PERMISSIVE policy per command, each TO      */
/* authenticated, each keyed on the JWT tenant first. Never FOR ALL: its  */
/* USING would also open UPDATE. Every helper call is wrapped as          */
/* (SELECT ...), so it is evaluated once per statement (0071, 0073).      */
/* "Today in Lisbon" is (SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date), */
/* the transaction's own clock, so a closure starting tomorrow may be     */
/* deleted until Lisbon midnight and not after.                           */
CREATE POLICY location_closed_days_staff_select ON public.location_closed_days
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'therapist', 'reception')
  );--> statement-breakpoint

CREATE POLICY location_closed_days_staff_insert ON public.location_closed_days
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
    AND created_by = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_closed_days.location_id AND l.tenant_id = (SELECT public.jwt_tenant_id()))
  );--> statement-breakpoint

CREATE POLICY location_closed_days_staff_delete ON public.location_closed_days
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')
    AND starts_on > (SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date)
  );--> statement-breakpoint
