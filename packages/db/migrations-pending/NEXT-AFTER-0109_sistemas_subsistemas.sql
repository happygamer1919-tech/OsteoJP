/* ====================================================================== */
/* PENDING, AND IT FOLLOWS 0109. Sistemas / SubSistemas: a per-clinic     */
/* list of health systems and subsystems, and two fields on the ficha.    */
/* ====================================================================== */
/* WHAT THIS IS ABOUT. The clinic asked, on 2026-11-02, for Fisiozero's   */
/* "Sistemas / SubSistemas" panel, copied in structure and behaviour: a   */
/* free-text list of the clinic's Sistemas (a Sistema is a single name),  */
/* a switch "Usa tabela de precos de Sistemas", and on the patient's      */
/* ficha a dropdown "Sistema/SubSistema" with the text field "N. da       */
/* Entidade / Subsistema" right below it. This file makes room for them.  */
/* It writes NO VALUE into any existing row.                              */
/*                                                                        */
/* A SCOPE CHANGE, RECORDED. CLAUDE.md lists insurance as out of scope    */
/* for V1, and docs/design/DECISIONS.md defers insurer and protocol       */
/* discounts. The owner requested this feature on 2026-11-02. It is a     */
/* LIST AND A LABEL ON THE FICHA ONLY: no price, no discount, no          */
/* comparticipacao and no invoice reads anything this file adds.          */
/*                                                                        */
/* NO NUMBER YET, BY CONSTRUCTION. 0108 is the last file on main. 0109 is */
/* HOR-02 (the Saturday hours, held on #1682). A second pending file,     */
/* NEXT-AFTER-0109_services_booking_type_fields.sql (#1704), also waits   */
/* for 0109. This file is named so that it sorts AFTER that one, and it   */
/* depends on nothing in it: whichever order strategy rules, each takes   */
/* the next free number at its own promotion.                             */
/*                                                                        */
/* ====================================================================== */
/* 1. WHAT IT DOES                                                        */
/* ====================================================================== */
/*   - CREATE TABLE public.health_systems: id, tenant_id NOT NULL, name   */
/*     NOT NULL, active (default true), created_at, created_by. One row   */
/*     is one Sistema or SubSistema of one clinic.                        */
/*   - ONE NAME PER CLINIC, by a unique index on the tenant and the       */
/*     NORMALIZED name: lower case, runs of whitespace read as one space, */
/*     no leading or trailing space, and ACCENTS FOLDED. "ADSE", "adse"   */
/*     and " ADSE  " are one name, and so are "Medis" and "Medis" written */
/*     with an acute accent on the e (ruling Q12 of 2026-11-04: one name, */
/*     whatever its accents and case). The fold is a built-in translate() */
/*     over the lowered name with an explicit map, NO EXTENSION (unaccent */
/*     is not installed and this file does not add it): a, e, i, o and u  */
/*     with acute, grave, circumflex, tilde or diaeresis read as the bare */
/*     vowel, c with cedilla as c, n with tilde as n. The map holds both  */
/*     cases, so the fold does not depend on how the database's ctype     */
/*     lowers a non-ASCII letter. lower(), btrim(), regexp_replace() and  */
/*     translate() are IMMUTABLE, so the expression can be indexed.       */
/*     Letters outside the map, and an accent typed as a separate         */
/*     combining mark, are not folded. The application's pre-check folds */
/*     with the same map (lib/admin/health-systems-core.ts in apps/web).  */
/*     Inactive rows count, so a name that was deactivated is             */
/*     reactivated, not typed in twice.                                   */
/*   - NO DELETE. A Sistema is deactivated (active = false) and stays, so */
/*     a ficha that names it keeps its label. No role but the table's    */
/*     owner may delete a row (no grant, no policy).                      */
/*   - ON patients, two NULLABLE columns, no default, so every existing   */
/*     row reads NULL in both and nothing is rewritten:                   */
/*       health_system_id      the chosen Sistema/SubSistema.             */
/*       health_system_number  "N. da Entidade / Subsistema", free text.  */
/*     The two are independent, as in Fisiozero's form.                   */
/*   - THE SISTEMA IS OF THE PATIENT'S CLINIC, BY A FOREIGN KEY. 0105's   */
/*     way: a composite key (health_system_id, tenant_id) references      */
/*     health_systems (id, tenant_id), which this file makes unique. A    */
/*     ficha cannot name another clinic's Sistema, whoever writes it.     */
/*     MATCH SIMPLE: a NULL health_system_id asks nothing.                */
/*                                                                        */
/* THE SWITCH "Usa tabela de precos de Sistemas" IS NOT IN THIS FILE.     */
/* It lives in tenants.settings (jsonb), under the key                    */
/*   healthSystems.priceTableEnabled                                      */
/* and its absence reads OFF. No column, no backfill: every clinic is OFF */
/* until an owner or admin turns it on. IT DOES NOTHING YET: no booking,  */
/* price or invoice path reads it. Crossing appointment types with        */
/* Sistemas for a price is a later, separate decision (Tier D, pricing).  */
/*                                                                        */
/* health_insurance_numbers (0051) STAYS AS IT IS. That list of           */
/* {insurer, number} pairs is the clinic's own record of a patient's      */
/* plans; the two new columns are Fisiozero's single "Sistema" choice.    */
/* Nothing copies one into the other.                                     */
/*                                                                        */
/* ====================================================================== */
/* 2. WHO READS, WHO WRITES                                               */
/* ====================================================================== */
/* health_systems, by RLS (ENABLE, not FORCE, as everywhere):             */
/*   SELECT  owner, admin, therapist and reception of the row's tenant.   */
/*           Every staff role opens the ficha and needs the dropdown.     */
/*   INSERT  owner and admin of the row's tenant (settings:manage in the  */
/*           application), and the row names its creator: created_by =    */
/*           auth.uid().                                                  */
/*   UPDATE  owner and admin of the row's tenant, and the row stays in    */
/*           that tenant. By grant, only name and active can change.      */
/*   DELETE  nobody.                                                      */
/* The table gates follow 0106: REVOKE ALL by name from PUBLIC, anon,     */
/* authenticated, patient and service_role (the platform's default        */
/* privileges hand authenticated and service_role every privilege at     */
/* CREATE TABLE, and a REVOKE from PUBLIC does not touch a role granted   */
/* by name), then SELECT and INSERT, and UPDATE (name, active), to        */
/* authenticated. service_role holds nothing: nothing in the application  */
/* reaches this table as it. patient holds nothing.                       */
/*                                                                        */
/* patients: the two new columns are covered by the privileges each role */
/* already holds on the table, and by the existing patients policies. No  */
/* grant, revoke or policy on patients changes here.                      */
/*                                                                        */
/* ====================================================================== */
/* 3. THE LOCKS, read from the statements, in order                       */
/* ====================================================================== */
/* Sections A to C touch only the new table. Section D adds its keys to   */
/* tenants and users: SHARE ROW EXCLUSIVE on each until the COMMIT        */
/* (writes to them wait, reads do not). Section E is one ALTER TABLE on   */
/* patients: ACCESS EXCLUSIVE until the COMMIT, so every read of a        */
/* patient waits for the end of the transaction. Its foreign key is       */
/* validated by one scan of patients, every row NULL in the new column.   */
/* Section F is the three CREATE POLICY statements, LAST, because each    */
/* takes the platform locks 0106 describes until the COMMIT. This file    */
/* creates policies, so its sitting is closed hours only, never R9.       */
/* It creates no function and no sequence.                                */
/* ====================================================================== */

SET LOCAL lock_timeout = '5s';--> statement-breakpoint
SET LOCAL statement_timeout = '60s';--> statement-breakpoint
SET LOCAL idle_in_transaction_session_timeout = '15s';--> statement-breakpoint

/* ====================================================================== */
/* A. THE TABLE                                                           */
/* ====================================================================== */
/* The keys to tenants and users are added in section D, under the names  */
/* the inline form would give them, so nothing here locks an existing     */
/* table. created_by is NULLABLE with ON DELETE SET NULL (0091's          */
/* assigned_by): deleting a staff account must never take a clinic's      */
/* Sistema with it. The INSERT policy is what makes a new row name its    */
/* creator.                                                               */
CREATE TABLE public.health_systems (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  name       text NOT NULL
    CONSTRAINT health_systems_name_not_blank CHECK (name ~ '[^[:space:]]')
    CONSTRAINT health_systems_name_length CHECK (char_length(name) <= 120),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT health_systems_id_tenant_key UNIQUE (id, tenant_id)
);--> statement-breakpoint

/* One name per clinic, normalized (section 1). It also serves the list   */
/* read, which is by tenant. The two literals of translate() are the      */
/* accent map, position for position: 27 lower-case letters, then the    */
/* same 27 in upper case, each onto its bare letter.                      */
CREATE UNIQUE INDEX health_systems_tenant_name_key
  ON public.health_systems (tenant_id, translate(lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))), 'áàâãäéèêëẽíìîïĩóòôõöúùûüũçñÁÀÂÃÄÉÈÊËẼÍÌÎÏĨÓÒÔÕÖÚÙÛÜŨÇÑ', 'aaaaaeeeeeiiiiiooooouuuuucnaaaaaeeeeeiiiiiooooouuuuucn'));--> statement-breakpoint

COMMENT ON TABLE public.health_systems IS
  'Sistemas / SubSistemas: the clinic''s own list of health systems and '
  'subsystems, each a single free-text name (Fisiozero''s panel, owner request '
  '2026-11-02). One name per tenant after normalizing case, whitespace and '
  'accents. '
  'Deactivated, never deleted. Read by every staff role of the tenant; written '
  'by owner and admin. A label only: no price, discount or invoice reads it.';--> statement-breakpoint

/* ====================================================================== */
/* B. ROW LEVEL SECURITY ON                                               */
/* ====================================================================== */
/* Until section F runs the table has RLS on and no policy, which admits  */
/* no application role: the safe side, and inside this one transaction.  */
ALTER TABLE public.health_systems ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

/* ====================================================================== */
/* C. THE TABLE GATES                                                     */
/* ====================================================================== */
REVOKE ALL ON TABLE public.health_systems FROM PUBLIC, anon, authenticated, patient, service_role;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.health_systems TO authenticated;--> statement-breakpoint
GRANT UPDATE (name, active) ON TABLE public.health_systems TO authenticated;--> statement-breakpoint

/* ====================================================================== */
/* D. THE KEYS TO TABLES THAT EXISTED BEFORE THIS FILE                    */
/* ====================================================================== */
/* TO THE TENANT: NO ACTION, as 0106. TO THE CREATOR: SET NULL (above).   */
ALTER TABLE public.health_systems
  ADD CONSTRAINT health_systems_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  ADD CONSTRAINT health_systems_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;--> statement-breakpoint

/* ====================================================================== */
/* E. THE TWO COLUMNS ON patients                                         */
/* ====================================================================== */
/* One statement. The number is bounded like the name: not blank when     */
/* set, 64 characters at most (an entity or beneficiary number is short). */
/* The foreign key is the same-tenant proof (section 1). NO ACTION on     */
/* delete: no application role may delete a Sistema at all, and even the  */
/* table's owner cannot delete one that a ficha still names.              */
ALTER TABLE public.patients
  ADD COLUMN health_system_id uuid,
  ADD COLUMN health_system_number text,
  ADD CONSTRAINT patients_health_system_number_check CHECK (
    health_system_number IS NULL
    OR (health_system_number ~ '[^[:space:]]' AND char_length(health_system_number) <= 64)
  ),
  ADD CONSTRAINT patients_health_system_fkey
    FOREIGN KEY (health_system_id, tenant_id)
    REFERENCES public.health_systems (id, tenant_id);--> statement-breakpoint

COMMENT ON COLUMN public.patients.health_system_id IS
  'Sistema/SubSistema (Fisiozero''s ficha dropdown, owner request 2026-11-02). '
  'NULL is "Seleccione", none chosen. Of the patient''s own tenant, by the '
  'composite key patients_health_system_fkey. A label only: no price, discount '
  'or invoice reads it. Independent of health_insurance_numbers (0051).';--> statement-breakpoint

COMMENT ON COLUMN public.patients.health_system_number IS
  'N. da Entidade / Subsistema, free text shown below the Sistema/SubSistema '
  'dropdown. NULL when not given. Independent of health_system_id and of '
  'health_insurance_numbers (0051).';--> statement-breakpoint

/* ====================================================================== */
/* F. WHO READS AND WHO WRITES: THE LAST THREE STATEMENTS                 */
/* ====================================================================== */
/* NOTHING FOLLOWS THESE. One PERMISSIVE policy per command, each TO      */
/* authenticated, each keyed on the JWT tenant first. Never FOR ALL: its  */
/* USING would also open DELETE. Every helper call is wrapped as          */
/* (SELECT ...), so it is evaluated once per statement (0071, 0073).      */
CREATE POLICY health_systems_staff_select ON public.health_systems
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'therapist', 'reception')
  );--> statement-breakpoint

CREATE POLICY health_systems_manager_insert ON public.health_systems
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin')
    AND created_by = (SELECT auth.uid())
  );--> statement-breakpoint

CREATE POLICY health_systems_manager_update ON public.health_systems
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin')
  )
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin')
  );--> statement-breakpoint
