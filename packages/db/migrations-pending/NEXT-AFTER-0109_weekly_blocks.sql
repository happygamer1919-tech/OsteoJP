/* ====================================================================== */
/* PENDING, AND IT FOLLOWS 0109. Bloqueios de repeticao semanal: an       */
/* open-ended weekly block per therapist (Fisiozero's "Modo REPETICAO     */
/* SEMANAL").                                                             */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. The clinic asked, on 2026-11-02, for Fisiozero's   */
/* "Bloqueios na Agenda / Ferias" panel, copied in structure and          */
/* behaviour. Its first section blocks a therapist every week, on one     */
/* weekday, between two times, WITH NO END DATE: "Tiago, todas as 2as     */
/* feiras, das 08:00 ate 11:00", until somebody removes it. OsteoJP has   */
/* no such thing. time_off (0006) holds absolute instants, and its        */
/* "repeating" door (PL-22, bloquear lote) writes one row per date up to  */
/* an end, so it cannot say "every week, for as long as this stands".     */
/* This file adds the table that can. It writes NO VALUE into any         */
/* existing row.                                                          */
/*                                                                        */
/* The second section of that panel ("Modo PONTUAL") is time_off as it    */
/* stands and needs nothing here.                                         */
/*                                                                        */
/* NO NUMBER YET, BY CONSTRUCTION. 0108 is the last file on main. 0109 is */
/* HOR-02 (the Saturday hours, held on #1682). Two other pending files    */
/* wait for 0109 on their own branches:                                   */
/*   NEXT-AFTER-0109_services_booking_type_fields.sql (#1704) and         */
/*   NEXT-AFTER-0109_sistemas_subsistemas.sql                             */
/*     (db/RODICA-sistemas-subsistemas).                                  */
/* This file is named so that it sorts AFTER both, and it depends on      */
/* nothing in either: whichever order strategy rules, each takes the next */
/* free number at its own promotion.                                      */
/*                                                                        */
/* ====================================================================== */
/* 1. WHAT IT DOES                                                        */
/* ====================================================================== */
/*   - CREATE TABLE public.therapist_weekly_blocks: id, tenant_id NOT     */
/*     NULL, user_id NOT NULL (the therapist), weekday NOT NULL, start_   */
/*     time NOT NULL, end_time NOT NULL, created_at, created_by. One row  */
/*     is one weekly rule: "this therapist, every <weekday>, from         */
/*     <start_time> to <end_time>".                                       */
/*   - WEEKDAY 0 = Sunday .. 6 = Saturday, the convention of              */
/*     availability_templates (0006) and of JavaScript's getDay(), so     */
/*     every reader compares it the way it already compares a template's. */
/*   - THE TIMES ARE LISBON WALL CLOCK, as availability_templates' are.   */
/*     08:00 means 08:00 in Lisbon on every such weekday, summer and      */
/*     winter: the instant moves with the clock change, the wall time     */
/*     does not. Every reader converts per date, in Europe/Lisbon.        */
/*   - start_time < end_time, by CHECK. A rule never crosses midnight     */
/*     (Fisiozero's whole-day block is 05:00 to 23:55).                   */
/*   - NO DUPLICATE RULE: one row per (tenant, therapist, weekday, start, */
/*     end), by a unique key. Two rules that merely overlap are allowed;  */
/*     the readers take their union.                                      */
/*   - NO END DATE AND NO UPDATE. A rule stands until it is deleted, as   */
/*     in Fisiozero, whose list offers only a delete. To change one, the  */
/*     clinic deletes it and adds the new one; each is audited by the     */
/*     application (audit_log, CLAUDE.md rule 6).                         */
/*   - THE THERAPIST'S RULES GO WITH THE THERAPIST: user_id references    */
/*     users ON DELETE CASCADE. The staff delete path (deleteStaffMember) */
/*     removes a therapist's own configuration rows (therapist_services,  */
/*     availability_templates, time_off) before the users row, and is     */
/*     reached only by an account with no activity; a weekly rule is the  */
/*     same kind of configuration, and the cascade keeps that path from   */
/*     failing on it without the application having to know this table.  */
/*   - created_by references users ON DELETE SET NULL (0091's assigned_by */
/*     and the sibling pending files' created_by): deleting the account   */
/*     that typed a rule must never take the rule with it.                */
/*                                                                        */
/* WHAT READS IT (the application, in the pull request stacked on this    */
/* one, and only once this table exists): the staff conflict check        */
/* (overridable with "Guardar mesmo assim", exactly as time_off is), the  */
/* agenda's hatched blocked band, the availability read behind Nova       */
/* marcacao, Agendar lote and the Horarios inspector, and the patient     */
/* portal's slot grid and booking guards. Each asks whether the table     */
/* exists first, so a database without this file reads as today.          */
/*                                                                        */
/* ====================================================================== */
/* 2. WHO READS, WHO WRITES                                               */
/* ====================================================================== */
/* therapist_weekly_blocks, by RLS (ENABLE, not FORCE, as everywhere).    */
/* The model is time_off's (0006): keyed on the JWT tenant. It is split   */
/* per command instead of one FOR ALL, whose USING would also open UPDATE */
/* (and this table has no update path), and it adds one narrowing         */
/* time_off does not have, matching the application's own rule for        */
/* schedules (ITEM 3, schedule-scope.ts): a THERAPIST writes only their   */
/* own rules.                                                             */
/*   SELECT  owner, admin, therapist and reception of the row's tenant.   */
/*           Every staff role books, and a booking reads the rules of the */
/*           therapist it names.                                          */
/*   INSERT  owner, admin, therapist and reception of the row's tenant;   */
/*           the row names its creator (created_by = auth.uid()); a       */
/*           therapist only for their own user_id.                        */
/*   DELETE  owner, admin, therapist and reception of the row's tenant; a */
/*           therapist only their own rows.                               */
/*   UPDATE  nobody (no grant, no policy).                                */
/* Which therapist a located receptionist or admin may manage stays the   */
/* application's check (assertTargetInScheduleScope), as it is for        */
/* time_off and availability_templates, which are tenant-only in RLS.     */
/*                                                                        */
/* The table gates follow 0106: REVOKE ALL by name from PUBLIC, anon,     */
/* authenticated, patient and service_role (the platform's default        */
/* privileges hand authenticated and service_role every privilege at      */
/* CREATE TABLE, and a REVOKE from PUBLIC does not touch a role granted   */
/* by name), then:                                                        */
/*   authenticated  SELECT, INSERT, DELETE.                               */
/*   service_role   SELECT only. The patient portal's slot grid and its   */
/*                  booking guards run as the service role               */
/*                  (apps/api/lib/appointments/store.ts, getDbAdmin) and  */
/*                  must see every therapist's rules, exactly as they see */
/*                  time_off. It writes nothing here.                     */
/*   patient, anon  nothing.                                              */
/*                                                                        */
/* ====================================================================== */
/* 3. THE LOCKS, read from the statements, in order                       */
/* ====================================================================== */
/* Sections A to C touch only the new table. Section D adds its keys to   */
/* tenants and users: SHARE ROW EXCLUSIVE on each until the COMMIT        */
/* (writes to them wait, reads do not). Section E is the three CREATE     */
/* POLICY statements, LAST, because each takes the platform locks 0106    */
/* describes until the COMMIT. This file creates policies, so its sitting */
/* is closed hours only, never R9. It creates no function and no          */
/* sequence, and it alters no existing table but by the two foreign keys. */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint
SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint

/* ====================================================================== */
/* A. THE TABLE                                                           */
/* ====================================================================== */
/* The keys to tenants and users are added in section D, so nothing here  */
/* locks an existing table.                                               */
CREATE TABLE public.therapist_weekly_blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  user_id    uuid NOT NULL,
  weekday    smallint NOT NULL
    CONSTRAINT therapist_weekly_blocks_weekday_range CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time   time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT therapist_weekly_blocks_start_before_end CHECK (start_time < end_time),
  CONSTRAINT therapist_weekly_blocks_dedupe_uq UNIQUE (tenant_id, user_id, weekday, start_time, end_time)
);--> statement-breakpoint

/* The unique key above leads with (tenant_id, user_id, weekday), which   */
/* is every reader's lookup, so it serves as the index too.               */

COMMENT ON TABLE public.therapist_weekly_blocks IS
  'Bloqueios de repeticao semanal (Fisiozero''s "Modo REPETICAO SEMANAL", owner '
  'request 2026-11-02): a therapist is blocked every <weekday> (0 = Sunday .. '
  '6 = Saturday) from <start_time> to <end_time>, Lisbon wall clock, with no end '
  'date, until the row is deleted. Read wherever time_off is read for '
  'availability, with the same "Guardar mesmo assim" override on the staff side. '
  'No update path. Written by owner, admin and reception of the tenant, and by a '
  'therapist for their own rules.';--> statement-breakpoint

/* ====================================================================== */
/* B. ROW LEVEL SECURITY ON                                               */
/* ====================================================================== */
/* Until section E runs the table has RLS on and no policy, which admits  */
/* no application role: the safe side, and inside this one transaction.  */
ALTER TABLE public.therapist_weekly_blocks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ====================================================================== */
/* C. THE TABLE GATES                                                     */
/* ====================================================================== */
REVOKE ALL ON TABLE public.therapist_weekly_blocks FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE public.therapist_weekly_blocks TO authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE public.therapist_weekly_blocks TO service_role;--> statement-breakpoint

/* ====================================================================== */
/* D. THE KEYS TO TABLES THAT EXISTED BEFORE THIS FILE                    */
/* ====================================================================== */
/* TO THE TENANT: NO ACTION, as 0106. TO THE THERAPIST: CASCADE, TO THE   */
/* CREATOR: SET NULL (section 1).                                         */
ALTER TABLE public.therapist_weekly_blocks
  ADD CONSTRAINT therapist_weekly_blocks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  ADD CONSTRAINT therapist_weekly_blocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT therapist_weekly_blocks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;--> statement-breakpoint

/* ====================================================================== */
/* E. WHO READS AND WHO WRITES: THE LAST THREE STATEMENTS                 */
/* ====================================================================== */
/* NOTHING FOLLOWS THESE. One PERMISSIVE policy per command, each TO      */
/* authenticated, each keyed on the JWT tenant first. Never FOR ALL: its  */
/* USING would also open UPDATE. Every helper call is wrapped as          */
/* (SELECT ...), so it is evaluated once per statement (0071, 0073).      */
CREATE POLICY therapist_weekly_blocks_staff_select ON public.therapist_weekly_blocks
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'therapist', 'reception')
  );--> statement-breakpoint

CREATE POLICY therapist_weekly_blocks_staff_insert ON public.therapist_weekly_blocks
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'therapist', 'reception')
    AND created_by = (SELECT auth.uid())
    AND ((SELECT public.jwt_role()) <> 'therapist' OR user_id = (SELECT auth.uid()))
  );--> statement-breakpoint

CREATE POLICY therapist_weekly_blocks_staff_delete ON public.therapist_weekly_blocks
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'therapist', 'reception')
    AND ((SELECT public.jwt_role()) <> 'therapist' OR user_id = (SELECT auth.uid()))
  );--> statement-breakpoint
