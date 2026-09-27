/* ====================================================================== */
/* USERS, TENANTS, ROLES: each table's FOR ALL policy is replaced by a    */
/* tenant SELECT and writes limited to the roles the app already gates    */
/* each of those writes to.                                               */
/*                                                                        */
/* Ruled by the owner on 2026-09-20 (Tier C). Renumbered by the owner on  */
/* 2026-09-21 and again on 2026-09-22; it is now 0094.                    */
/*                                                                        */
/* RULED NUMBER 0094. NO NUMBER IN THIS FILE NAME YET, BY CONSTRUCTION.   */
/* It must follow 0093 (RGPD-01). See packages/db/migrations-pending/     */
/* README.md for the promotion recipe; the body below is final.           */
/*                                                                        */
/* AT PROMOTION its journal `when` MUST BE STRICTLY GREATER THAN 0093's   */
/* (1788501400000). A `when` that is equal or lower makes drizzle skip the */
/* file in silence, which is why scripts/check-journal.mjs refuses one.   */
/* ====================================================================== */


/* ====================================================================== */
/* 1. WHAT THIS FILE MAKES TRUE                                           */
/* ====================================================================== */
/* Row level security on users, tenants and roles applies the same role   */
/* rules the app applies (packages/auth/permissions.ts and the server     */
/* actions in section 2):                                                 */
/*   - reads stay tenant-wide, with the same expressions as before;       */
/*   - users: owner and admin create, edit, (de)activate, re-role and     */
/*     delete staff, under the owner tier of section 4; every role may    */
/*     rename itself and clear its own password-rotation flag (section 5); */
/*   - tenants: owner and admin update their own tenant's row;            */
/*   - roles: read only for a staff session.                              */
/* The app's own checks do not change. This is defence in depth.          */


/* ====================================================================== */
/* 2. WHO WRITES THESE TABLES WITH A STAFF JWT (measured on main)          */
/* ====================================================================== */
/* Every app writer runs inside withTenantContext (set local role         */
/* authenticated, plus the claims), so every one of them meets the        */
/* policies below. No SQL function writes any of the three tables.        */
/*                                                                        */
/*   W1 perfil/actions.ts updateOwnProfileAction   users.full_name, own row, ANY role     */
/*   W2 password-rotation.ts clearPasswordRotationFlag                                    */
/*                                                 users.must_set_password true to false, */
/*                                                 own row, ANY role                      */
/*   W3 provision.ts provisionStaffUser (inviteStaff)  INSERT users; users:manage         */
/*   W4 staff.ts setStaffActive                    users.is_active; users:manage          */
/*   W5 staff.ts changeStaffRole                   users.role_id; users:manage            */
/*   W6 staff.ts editStaff                         users name, email, phone, job_title,   */
/*                                                 is_bookable; users:manage              */
/*   W7 staff.ts deleteStaffMember                 DELETE users; users:manage, never an   */
/*                                                 owner                                  */
/*   W8 settings.ts updateTenantSettings           tenants name, nif, settings;           */
/*                                                 settings:manage; NO WHERE clause       */
/*   W9 tenant-secret.ts setTenantSecret           tenants.settings; settings:manage;     */
/*                                                 NO WHERE clause                        */
/*                                                                        */
/* users:manage and settings:manage are held by owner and admin only      */
/* (packages/auth/permissions.ts). NOTHING writes roles with a staff JWT: */
/* roles:manage exists and nothing implements it.                         */
/*                                                                        */
/* UNAFFECTED, because they bypass row level security: the operator app   */
/* (getDbAdmin), the dev and e2e seeds (their own connection, or the      */
/* service_role key), owner-run SQL, migrations, and the token hook,      */
/* which is SECURITY DEFINER owned by postgres. The hook's own read       */
/* policies, auth_admin_read_users and auth_admin_read_roles (0002), are  */
/* NOT touched by this file.                                              */


/* ====================================================================== */
/* 3. THE POLICIES AFTER THIS FILE                                         */
/* ====================================================================== */
/* T is (SELECT jwt_tenant_id()), R is (SELECT jwt_role()), the claim the  */
/* app's own capability checks read. MGR is R IN ('owner', 'admin').        */
/*                                                                        */
/*   tenants_tenant_select   SELECT  id = T                    (as before) */
/*   tenants_manager_update  UPDATE  id = T AND MGR, both sides            */
/*   roles_tenant_select     SELECT  tenant_id = T             (as before) */
/*   users_tenant_select     SELECT  tenant_id = T             (as before) */
/*   users_manager_insert    INSERT  tenant_id = T AND MGR AND ROLE_OK     */
/*   users_manager_update    UPDATE  tenant_id = T AND MGR AND ROLE_OK,    */
/*                                   both sides                            */
/*   users_self_update       UPDATE  tenant_id = T AND id = auth.uid(),    */
/*                                   both sides; WITH CHECK also ROLE_OK   */
/*   users_manager_delete    DELETE  tenant_id = T AND MGR AND the row is  */
/*                                   not an owner                          */
/*                                                                        */
/* ROLE_OK: role_id IS NULL, or role_id is a role OF THE CALLER'S TENANT  */
/* that is not 'owner' unless R is 'owner'. On the old row (USING) that is */
/* "only an owner may touch an owner"; on the new row (WITH CHECK) it is  */
/* "only an owner may make an owner", and the role a row names is always  */
/* one of its own tenant's.                                               */
/*                                                                        */
/* SELECT IS UNCHANGED ON ALL THREE TABLES, and must be. The agenda joins, */
/* the shared-resource guard, the role lookups W3 and W5 make, and the     */
/* password-rotation self-read (which throws, and locks the app, when the  */
/* row is hidden) all read tenant-wide. DELETE ... RETURNING (W7) and      */
/* every UPDATE with a WHERE clause also need the row visible to SELECT.   */
/* The three SELECT expressions are the old FOR ALL expressions verbatim,  */
/* so no read moves.                                                       */
/*                                                                        */
/* NO INSERT OR DELETE ON tenants, AND NO WRITE AT ALL ON roles, for       */
/* authenticated: nothing does either with a staff JWT. With no permissive */
/* policy for a command, row level security refuses it.                    */


/* ====================================================================== */
/* 4. THE OWNER TIER                                                      */
/* ====================================================================== */
/* "Only an owner may create, edit, (de)activate or re-role an owner" is  */
/* the app's rule (staff.ts, canReassignRole). ROLE_OK states it on both  */
/* sides of every users write. Permissive WITH CHECKs are OR'ed, so the   */
/* self arm carries ROLE_OK as well, and neither UPDATE arm admits a new  */
/* row that the other would refuse on its role. For a therapist or a      */
/* receptionist the column guard in section 5 also keeps role_id as it is. */
/*                                                                        */
/* WHY NOT "role_id unchanged" ON THE SELF ARM. It needs a subquery on     */
/* users inside a users policy, and users_tenant_select itself carries a   */
/* sublink, (SELECT jwt_tenant_id()), so Postgres refuses every UPDATE of  */
/* users with "infinite recursion detected in policy for relation users".  */
/* MEASURED on the rehearsal: the first draft of this file did exactly     */
/* that and the DB suite caught it. ROLE_OK reads roles only.              */
/*                                                                        */
/* ONE EDGE, BY CONSTRUCTION: the claim is only as fresh as the token      */
/* (jwt_expiry 3600 s). A staff member made owner keeps an admin token     */
/* until it refreshes, and until then cannot rename themselves (ROLE_OK    */
/* refuses an owner row to an admin claim). The app's own capability       */
/* checks read the same claim.                                             */
/*                                                                        */
/* DELETE is narrower than the tier: no staff JWT deletes an owner row,    */
/* owner or not, because W7 never does ("never an owner").                 */
/*                                                                        */
/* Location scope (assertStaffInScope), the last-owner guard and the      */
/* no-activity guard on delete are app rules and stay in the app; this    */
/* file does not restate them.                                            */


/* ====================================================================== */
/* 5. THE SELF ARM AND ITS COLUMN GUARD                                   */
/* ====================================================================== */
/* W1 and W2 are available to EVERY role. W2 is the one that matters: the */
/* rotation gate (app-shell.tsx) sends every page to /perfil until the    */
/* flag clears, so an owner-and-admin-only UPDATE would leave an invited  */
/* therapist or receptionist on /perfil for good.                         */
/*                                                                        */
/* Row level security bounds rows, not columns, and every staff role is   */
/* the one database role `authenticated`, so a column grant cannot tell   */
/* them apart. The self arm is therefore paired with a trigger: when the  */
/* caller is `authenticated` and R is not owner or admin, an UPDATE of    */
/* users may change ONLY                                                  */
/*   - full_name                                     (W1)                 */
/*   - must_set_password, and only from true to false (W2)                */
/*   - updated_at        (drizzle's $onUpdate sets it on every UPDATE)    */
/* and every other column must be unchanged. The comparison is over the   */
/* whole row as jsonb minus those three keys, so a column added later is  */
/* guarded without editing this function.                                 */
/*                                                                        */
/* THE TRIGGER IS SECURITY INVOKER ON PURPOSE. It reads current_user,     */
/* which is `authenticated` for a staff session (withTenantContext and    */
/* PostgREST both SET ROLE) and something else for every privileged path  */
/* in section 2, which therefore passes untouched. A SECURITY DEFINER     */
/* function would read its owner there, and would also move the frozen    */
/* SECURITY DEFINER count.                                                */


/* ====================================================================== */
/* 6. THE STATEMENTS                                                       */
/* ====================================================================== */
/* IDEMPOTENT. Every policy is dropped IF EXISTS and created; the trigger  */
/* is CREATE OR REPLACE; the function is CREATE OR REPLACE. Applied three */
/* times in a row on the rehearsal, the catalogue read the same after each. */

DROP POLICY IF EXISTS "tenants_tenant_isolation" ON public.tenants;--> statement-breakpoint
DROP POLICY IF EXISTS "roles_tenant_isolation" ON public.roles;--> statement-breakpoint
DROP POLICY IF EXISTS "users_tenant_isolation" ON public.users;--> statement-breakpoint

/* ---------------------------------------------------------------------- */
/* tenants                                                                 */
/* ---------------------------------------------------------------------- */

DROP POLICY IF EXISTS "tenants_tenant_select" ON public.tenants;--> statement-breakpoint
CREATE POLICY "tenants_tenant_select" ON public.tenants
  FOR SELECT
  TO authenticated
  USING (id = (SELECT public.jwt_tenant_id()));--> statement-breakpoint

/* W8 and W9 carry no WHERE clause, so USING is their row filter: it keeps  */
/* id = T, which is what stops them reaching another tenant's row.          */
DROP POLICY IF EXISTS "tenants_manager_update" ON public.tenants;--> statement-breakpoint
CREATE POLICY "tenants_manager_update" ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin')
  )
  WITH CHECK (
    id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin')
  );--> statement-breakpoint

/* ---------------------------------------------------------------------- */
/* roles: SELECT only                                                      */
/* ---------------------------------------------------------------------- */

DROP POLICY IF EXISTS "roles_tenant_select" ON public.roles;--> statement-breakpoint
CREATE POLICY "roles_tenant_select" ON public.roles
  FOR SELECT
  TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));--> statement-breakpoint

/* ---------------------------------------------------------------------- */
/* users                                                                   */
/* ---------------------------------------------------------------------- */

DROP POLICY IF EXISTS "users_tenant_select" ON public.users;--> statement-breakpoint
CREATE POLICY "users_tenant_select" ON public.users
  FOR SELECT
  TO authenticated
  USING (tenant_id = (SELECT public.jwt_tenant_id()));--> statement-breakpoint

DROP POLICY IF EXISTS "users_manager_insert" ON public.users;--> statement-breakpoint
CREATE POLICY "users_manager_insert" ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin')
    AND (
      role_id IS NULL
      OR role_id IN (
        SELECT r.id
          FROM public.roles r
         WHERE r.tenant_id = (SELECT public.jwt_tenant_id())
           AND (r.slug <> 'owner' OR (SELECT public.jwt_role()) = 'owner')
      )
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS "users_manager_update" ON public.users;--> statement-breakpoint
CREATE POLICY "users_manager_update" ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin')
    AND (
      role_id IS NULL
      OR role_id IN (
        SELECT r.id
          FROM public.roles r
         WHERE r.tenant_id = (SELECT public.jwt_tenant_id())
           AND (r.slug <> 'owner' OR (SELECT public.jwt_role()) = 'owner')
      )
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin')
    AND (
      role_id IS NULL
      OR role_id IN (
        SELECT r.id
          FROM public.roles r
         WHERE r.tenant_id = (SELECT public.jwt_tenant_id())
           AND (r.slug <> 'owner' OR (SELECT public.jwt_role()) = 'owner')
      )
    )
  );--> statement-breakpoint

/* The self arm. Its WITH CHECK repeats ROLE_OK, because the checks of the */
/* two UPDATE arms are OR'ed (section 4). It must not read users (also    */
/* section 4).                                                            */
DROP POLICY IF EXISTS "users_self_update" ON public.users;--> statement-breakpoint
CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND id = (SELECT auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND id = (SELECT auth.uid())
    AND (
      role_id IS NULL
      OR role_id IN (
        SELECT r.id
          FROM public.roles r
         WHERE r.tenant_id = (SELECT public.jwt_tenant_id())
           AND (r.slug <> 'owner' OR (SELECT public.jwt_role()) = 'owner')
      )
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS "users_manager_delete" ON public.users;--> statement-breakpoint
CREATE POLICY "users_manager_delete" ON public.users
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (SELECT public.jwt_role()) IN ('owner', 'admin')
    AND (
      role_id IS NULL
      OR role_id IN (
        SELECT r.id
          FROM public.roles r
         WHERE r.tenant_id = (SELECT public.jwt_tenant_id())
           AND r.slug <> 'owner'
      )
    )
  );--> statement-breakpoint

/* ---------------------------------------------------------------------- */
/* The column guard for the self arm (section 5)                           */
/* ---------------------------------------------------------------------- */

CREATE OR REPLACE FUNCTION public.users_self_service_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
BEGIN
  -- Privileged paths (postgres, service_role, the migration runner) are not
  -- staff sessions and are not guarded.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  -- users:manage holders are bounded by the policies, not by this guard.
  IF coalesce((SELECT public.jwt_role()) IN ('owner', 'admin'), false) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['full_name', 'must_set_password', 'updated_at'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['full_name', 'must_set_password', 'updated_at']) THEN
    RAISE EXCEPTION 'users: without users:manage, only full_name may change on your own row, and must_set_password only from true to false'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.must_set_password AND NOT OLD.must_set_password THEN
    RAISE EXCEPTION 'users: without users:manage, must_set_password may only go from true to false'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

/* A trigger function is not callable as a function (Postgres refuses it    */
/* outside a trigger), and the trigger fires whatever the caller's EXECUTE   */
/* privilege (measured on the rehearsal: the guard fired for authenticated,  */
/* which holds no EXECUTE on it). The end state is stated anyway (SR-52):    */
/* nobody but the owner holds EXECUTE on it.                                 */
REVOKE ALL ON FUNCTION public.users_self_service_columns() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.users_self_service_columns() FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.users_self_service_columns() FROM authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.users_self_service_columns() FROM service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.users_self_service_columns() FROM patient;--> statement-breakpoint

CREATE OR REPLACE TRIGGER users_self_service_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_self_service_columns();--> statement-breakpoint

COMMENT ON FUNCTION public.users_self_service_columns() IS
  'Ruled 0094, owner 2026-09-20. For a staff session (current_user '
  'authenticated) whose user_role is not owner or admin, an UPDATE of users '
  'may change only full_name, must_set_password from true to false, and '
  'updated_at. Pairs with the users_self_update policy. SECURITY INVOKER; '
  'privileged connections pass.';--> statement-breakpoint


/* ====================================================================== */
/* 7. WHAT THIS FILE DOES NOT DO                                          */
/* ====================================================================== */
/* - It changes no table grant; the policies above bound the grants 0003  */
/*   made.                                                                */
/* - It changes no read. The three SELECT expressions are the old ones.   */
/* - It changes no existing function, the token hook included, and no     */
/*   SECURITY DEFINER count. The one new function is SECURITY INVOKER.    */
