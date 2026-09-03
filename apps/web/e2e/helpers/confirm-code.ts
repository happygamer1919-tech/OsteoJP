/**
 * helpers/confirm-code.ts — the database half of `confirm-code.spec.ts`.
 *
 * ==========================================================================
 * WHY THE SPEC TOUCHES THE DATABASE AT ALL
 * ==========================================================================
 * A confirm code is minted by the 24h reminder DISPATCH, which is armed by two
 * environment variables, gated by an approval registry, and sends an SMS. None
 * of that is reachable from a browser, and driving it would make this a test of
 * the dispatch rather than of the page. So the fixtures are written the way the
 * seed writes fixtures — through the service-role handle against the LOCAL
 * stack — and the BROWSER then drives the page and the two server actions,
 * which is the half that had no coverage at all.
 *
 * THE CODE IS MINTED THROUGH 0074'S OWN WRITER, `issue_confirm_code`, and not
 * by an INSERT of our own. The row this suite acts on is therefore a row
 * production could have written: the function inserts FROM A SELECT over
 * `appointments` matching both the id and the tenant, so a fixture that paired
 * the wrong two values writes nothing and says so here rather than producing a
 * page that refuses for a reason nobody can see.
 *
 * ==========================================================================
 * TWO CLIENTS, AND WHICH ONE IS USED WHERE IS A FACT ABOUT THE MIGRATION
 * ==========================================================================
 * THE CONFIRM-CODE FUNCTIONS ARE CALLED AS `authenticated`, NEVER AS
 * `service_role`, AND THIS COST A RED CI SHARD TO LEARN.
 *
 * The first version of this file called `issue_confirm_code` through the
 * service-role handle. It worked on a local lane and failed on CI with
 * `permission denied for function issue_confirm_code`. Both databases were
 * built by `supabase db reset` from the same migrations.
 *
 * The cause is the drift 0072's own header describes, observed for the first
 * time in this direction. 0074 REVOKEs its three writers from PUBLIC, anon and
 * patient and GRANTs EXECUTE to `authenticated` ALONE - `service_role` is never
 * named. On the local lane Supabase's ALTER DEFAULT PRIVILEGES had already
 * granted it EXECUTE at CREATE FUNCTION time (`service_role=X/postgres` in
 * `proacl`, verified), and `REVOKE ... FROM PUBLIC` does not touch a privilege
 * held by a named role. On CI that default privilege was not applied, so the
 * REVOKE left service_role with nothing.
 *
 * THE PRODUCT IS UNAFFECTED, and that is worth stating so nobody reads this as
 * an incident: `withReminderTenantContext` does `set local role authenticated`,
 * so the app has always called these functions as the role that is explicitly
 * granted. What was environment-dependent was the TEST's shortcut.
 *
 * So the rule here is simple and drift-proof: anything 0072/0074 built a DOOR
 * for is called through that door, as `authenticated`. The service-role handle
 * is used only for ordinary tables no migration has revoked - `patients`,
 * `appointments`, `audit_log` - which CI proves it can reach, because the
 * appointment insert succeeded in the same run that the function call failed.
 *
 * ==========================================================================
 * EVERY FUNCTION HERE THROWS RATHER THAN RETURNING `null` OR `false`
 * ==========================================================================
 * PORTAL-REHYDRATE 1.3. A fixture builder that answered `null` would let a
 * spec carry on and fail later, on an assertion about a PAGE, for a reason that
 * is really about a ROW — and the page's own design guarantees that failure
 * looks identical to a legitimate refusal. Every refusal on this surface is
 * SUPPOSED to be indistinguishable, which is exactly why the harness must not
 * be allowed to produce one.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  generateConfirmCode,
  hashConfirmCode,
} from "@/lib/reminders/confirm-code";
import { CONFIRM_CODE_SECRET, CONFIRM_PATIENT, LOCATION, SERVICE, TENANT_A } from "../fixtures";

/** Named here so the string appears once. `confirm-code.ts` owns the constant. */
const CONFIRM_CODE_SECRET_ENV = "REMINDERS_CONFIRM_CODE_SECRET";

/**
 * THE APP'S OWN HASH FUNCTION, IMPORTED, NOT MIRRORED.
 *
 * `portal-otp-login.spec.ts` re-implements `hashPhone`/`hashCode` locally with
 * a comment saying it mirrors the API. That was the only option there — the
 * hash lives in `apps/api` and this suite belongs to `apps/web`. Here the
 * module is in the same app and is PURE (no `server-only`, no database, no env
 * read at import), so the real function is imported and there is no second copy
 * to drift.
 *
 * The env is passed explicitly rather than read from `process.env`: the spec
 * process has no reason to carry the key, and passing it makes the agreement
 * with the dev server's `REMINDERS_CONFIRM_CODE_SECRET` a visible argument
 * instead of an ambient coincidence.
 */
export function confirmCodeHash(code: string): string {
  return hashConfirmCode(code, { [CONFIRM_CODE_SECRET_ENV]: CONFIRM_CODE_SECRET });
}

/**
 * Service-role client against the LOCAL Supabase this suite seeds. Never
 * production: the URL is the lane's own stack and the key is the throwaway
 * printed by `supabase status`.
 *
 * Copied in shape from `portal-otp-login.spec.ts` deliberately, including the
 * refusal: a client that silently could not read would report "no row was
 * written" for a missing environment variable, which is the exact conflation
 * this project keeps paying for. NAMES ONLY, NEVER VALUES (rule 3).
 */
export function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. confirm-code.spec.ts writes its own " +
        "appointments and confirm codes into the local seeded database; without the " +
        "key it cannot tell a missing row from a missing credential, so it refuses " +
        "to guess. Run the suite through: node scripts/lane-stack.mjs e2e --lane <lane>",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * A client signed in as the seeded admin, so PostgREST runs its statements as
 * `authenticated` - the ONE role 0074 grants EXECUTE to. See the header.
 *
 * The credentials are the suite's own, already in the environment for
 * `auth.setup.ts`, and it REFUSES rather than falling back to an anonymous
 * client: an anon client would reach the same "permission denied" and report it
 * as though the migration were wrong.
 */
export async function authenticatedClient(): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  const missing = [
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", key],
    ["E2E_ADMIN_EMAIL", email],
    ["E2E_ADMIN_PASSWORD", password],
  ]
    .filter(([, v]) => !v)
    .map(([n]) => n);
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")} not set. confirm-code.spec.ts calls 0074's confirm-code ` +
        "functions as `authenticated`, which is the only role they are granted to, so it " +
        "needs a real sign-in. Run the suite through: node scripts/lane-stack.mjs e2e --lane <lane>",
    );
  }
  const client = createClient(url, key!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: email!,
    password: password!,
  });
  if (error) throw new Error(`e2e admin sign-in failed: ${error.message}`);
  return client;
}

/** The seeded therapist's `public.users` id. Auth ids are random per seed run. */
export async function therapistUserId(db: SupabaseClient): Promise<string> {
  const { data, error } = await db
    .from("users")
    .select("id")
    .eq("tenant_id", TENANT_A)
    .eq("email", "e2e-therapist@osteojp.test")
    .limit(1);
  if (error) throw new Error(`users lookup failed: ${error.message}`);
  const id = data?.[0]?.id as string | undefined;
  if (!id) {
    throw new Error(
      "The seeded therapist e2e-therapist@osteojp.test has no public.users row in " +
        "TENANT_A. Run: node apps/web/e2e/seed/seed-e2e.mjs",
    );
  }
  return id;
}

/** The confirm page's own patient, created once and reused. See fixtures.ts. */
export async function ensureConfirmPatient(db: SupabaseClient): Promise<void> {
  const { error } = await db.from("patients").upsert(
    {
      id: CONFIRM_PATIENT.id,
      tenant_id: TENANT_A,
      full_name: CONFIRM_PATIENT.name,
      nif: CONFIRM_PATIENT.nif,
      deleted_at: null,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`confirm fixture patient upsert failed: ${error.message}`);
}

/**
 * One appointment for the confirm fixture patient, at an explicit instant.
 *
 * `startsAt` is passed rather than derived so the caller says out loud whether
 * it is building a live appointment or an EXPIRED one — expiry on this surface
 * is a fact about `appointments.starts_at` and about nothing else (0072 stores
 * no `expires_at`, by design, SR-28).
 */
export async function createAppointment(
  db: SupabaseClient,
  args: { practitionerId: string; startsAt: Date; status?: "scheduled" | "confirmed" },
): Promise<string> {
  const id = randomUUID();
  const endsAt = new Date(args.startsAt.getTime() + 50 * 60_000);
  const { error } = await db.from("appointments").insert({
    id,
    tenant_id: TENANT_A,
    patient_id: CONFIRM_PATIENT.id,
    practitioner_id: args.practitionerId,
    location_id: LOCATION.id,
    service_id: SERVICE.id,
    starts_at: args.startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: args.status ?? "scheduled",
  });
  if (error) throw new Error(`confirm fixture appointment insert failed: ${error.message}`);
  return id;
}

/**
 * Mint a live code for an appointment, through 0074's writer.
 *
 * Returns the PLAINTEXT and its hash. The plaintext exists only here and in the
 * URL the browser opens, exactly as it exists only in the SMS in production.
 */
export async function issueCode(
  auth: SupabaseClient,
  appointmentId: string,
): Promise<{ code: string; codeHash: string }> {
  const code = generateConfirmCode();
  const codeHash = confirmCodeHash(code);
  const { data, error } = await auth.rpc("issue_confirm_code", {
    p_code_hash: codeHash,
    p_tenant_id: TENANT_A,
    p_appointment_id: appointmentId,
  });
  if (error) {
    throw new Error(
      `issue_confirm_code failed: ${error.message}. If this says "permission denied", the ` +
        "caller is not `authenticated` - 0074 grants EXECUTE to that role ALONE and the " +
        "service-role handle only reaches it on a database where Supabase's default " +
        "privileges happened to apply. See this file's header.",
    );
  }
  if (data !== true) {
    throw new Error(
      `issue_confirm_code inserted nothing for appointment ${appointmentId}. It inserts ` +
        "FROM A SELECT over appointments matching BOTH id and tenant, and 0072's partial " +
        "unique index allows only one LIVE code per appointment - so either the appointment " +
        "does not exist in TENANT_A or it already has an unconsumed code.",
    );
  }
  return { code, codeHash };
}

/** Spend a code the way *pedir remarcação* spends one, through 0074's writer. */
export async function consumeCode(auth: SupabaseClient, codeHash: string): Promise<void> {
  const { data, error } = await auth.rpc("consume_confirm_code", {
    p_code_hash: codeHash,
    p_tenant_id: TENANT_A,
    p_now: new Date().toISOString(),
  });
  if (error) throw new Error(`consume_confirm_code failed: ${error.message}`);
  if (data !== true) throw new Error("consume_confirm_code consumed nothing; the code was not live");
}

/** The appointment's current status, read back from the database. */
export async function appointmentStatus(db: SupabaseClient, id: string): Promise<string> {
  const { data, error } = await db.from("appointments").select("status").eq("id", id).limit(1);
  if (error) throw new Error(`appointment status read failed: ${error.message}`);
  const status = data?.[0]?.status as string | undefined;
  if (!status) throw new Error(`appointment ${id} has vanished from the database`);
  return status;
}

/**
 * `consumed_at` for one code row, as a boolean answer.
 *
 * READ THROUGH `resolve_confirm_code`, WHICH IS THE ONLY DOOR 0072 BUILT. The
 * table is REVOKEd from every application role, so a direct SELECT depends on
 * whatever default privilege a given database happened to grant service_role -
 * the exact thing that reddened CI once already. This asks the question the way
 * the page asks it.
 *
 * TWO NAMED FAILURES RATHER THAN ONE `null`: "the row is gone" and "the row is
 * live" are different facts about a table whose whole purpose is to record
 * which of the two is true.
 */
export async function codeIsSpent(auth: SupabaseClient, codeHash: string): Promise<boolean> {
  const { data, error } = await auth.rpc("resolve_confirm_code", { p_code_hash: codeHash });
  if (error) throw new Error(`resolve_confirm_code failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ consumed_at: string | null }>;
  if (rows.length === 0) throw new Error("the confirm code row no longer exists");
  return rows[0]!.consumed_at !== null;
}

/** Every audit row this appointment carries for one action, newest last. */
export async function auditRows(
  db: SupabaseClient,
  appointmentId: string,
  action: string,
): Promise<Array<{ ip: string | null; metadata: unknown; actor_user_id: string | null }>> {
  const { data, error } = await db
    .from("audit_log")
    .select("ip, metadata, actor_user_id, created_at")
    .eq("tenant_id", TENANT_A)
    .eq("entity_type", "appointment")
    .eq("entity_id", appointmentId)
    .eq("action", action)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`audit_log read failed: ${error.message}`);
  return (data ?? []) as Array<{ ip: string | null; metadata: unknown; actor_user_id: string | null }>;
}
