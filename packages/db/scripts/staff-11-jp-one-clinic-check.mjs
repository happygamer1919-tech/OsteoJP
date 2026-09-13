#!/usr/bin/env node
/**
 * STAFF-11 - AFTER THE JP SPLIT, EACH JP ROW HOLDS HOURS AT EXACTLY ONE CLINIC.
 * READ ONLY. OWNER-RUN AGAINST PRODUCTION; ANY LANE MAY RUN IT LOCALLY.
 *
 * WHAT IT GUARDS. The patient portal offers a therapist at a clinic when the row is
 * active, bookable, not a shared resource, and holds an ACTIVE availability_templates
 * row at THAT clinic (apps/api/lib/appointments/store.ts, listBookableTherapists). The
 * JP split (STAFF-09, STAFF-10) leaves two rows for one person: JP(cb) keeps Castelo
 * Branco and JP(lv) takes Linda-a-Velha. If either row ever holds an active row at the
 * other clinic, a patient who picks that clinic is offered the same person twice, and
 * nothing in the schema or the app refuses that state
 * (W2-jp-split-portal-surface-name-collision, measured on lane purple 2026-09-12).
 *
 * IT DOES NOT ASSUME THE SPLIT RAN. Before the split JP(cb) holds active hours at BOTH
 * clinics by design, so an unconditional check would be red for a state nobody has
 * asked to change yet. It first decides whether the split has happened, from two
 * independent signals, and enforces the invariant only when either says yes:
 *   script   an un-reversed staff.jp_split.reassign audit row (STAFF-10 ran and was
 *            not rolled back)
 *   data     JP(lv) holds ANY active availability row (the split happened through some
 *            other door, such as Horarios, with no script run at all)
 * Neither: it prints what each row holds and VERDICT: NOT APPLICABLE, exit 0.
 *
 * THE PREDICATE IS THE PORTAL'S, NOT A STRICTER ONE: is_active = true and NO date
 * window, because listBookableTherapists reads no valid_from / valid_until. An expired
 * day-defined row that is still active therefore counts: it is enough to put a
 * therapist on the portal list. The not-expired reading is printed beside it and
 * decides nothing. scripts/staff-11-jp-one-clinic-check.test.mjs fails if the portal's
 * predicate changes.
 *
 * OUT OF SCOPE: is_bookable (the ruling on the row not taking patients is still open;
 * it is printed, it decides nothing) and names (ruled: they already differ).
 *
 * USAGE, from the repository root, with the environment passed by file:
 *   node --env-file=<env file> packages/db/scripts/staff-11-jp-one-clinic-check.mjs
 * It reads DATABASE_URL_DIRECT and connects only to the production session pooler on
 * the pinned ref, or to localhost. It prints host, port and ref, never the connection
 * string. It reads users, locations, availability_templates and two audit actions: no
 * patient data.
 *
 * EXIT: 0 PASS or NOT APPLICABLE; 1 FAIL (the invariant is broken, a JP row is missing,
 * or the read failed); 2 BAD_INVOCATION.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROD_REF = "dfotoodqvmjhbdcxyaxf";
const TENANT = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";
const JP_CB = "54d486e0-a9c3-4c82-acac-8b909ce5a2d0";
const JP_LV = "0c1a0000-0000-4000-8000-000000000001";
const CB = "de000002-0000-0000-0000-000000000002";
const LV = "de000002-0000-0000-0000-000000000001";
const ACTION = "staff.jp_split.reassign";
const ACTION_ROLLBACK = "staff.jp_split.rollback";

/** Each JP row and the one clinic it keeps after the split. */
const ROWS = [
  { id: JP_CB, label: "JP(cb)", home: CB, homeName: "Castelo Branco" },
  { id: JP_LV, label: "JP(lv)", home: LV, homeName: "Linda-a-Velha" },
];

function bad(msg) {
  console.error(`BAD INVOCATION: ${msg}`);
  console.error("usage: node --env-file=<env file> packages/db/scripts/staff-11-jp-one-clinic-check.mjs");
  process.exit(2);
}

/** PRODUCTION only on the pinned ref and the session pooler; otherwise LOCAL only. */
function target(raw) {
  let u;
  try { u = new URL(raw); } catch { bad("DATABASE_URL_DIRECT does not parse"); }
  const ref = u.username.split(".")[1] ?? "";
  if (u.hostname.endsWith(".pooler.supabase.com")) {
    if (ref !== PROD_REF || u.port !== "5432") bad(`refusing ${u.hostname}:${u.port} ref ${ref || "-"}: not ${PROD_REF} on 5432`);
    return { kind: "PRODUCTION", line: `host ${u.hostname} / port ${u.port} / ref ${ref}` };
  }
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") {
    return { kind: "LOCAL", line: `host ${u.hostname} / port ${u.port} / ref local` };
  }
  bad(`refusing ${u.hostname}: neither the production pooler nor localhost`);
}

/** Everything the decision needs, in one READ ONLY transaction. */
async function read(sql) {
  return sql.begin("read only", async (tx) => {
    const users = await tx`
      select id::text, tenant_id::text, is_active, is_bookable
        from users where id = any(${[JP_CB, JP_LV]})`;
    const locations = await tx`select id::text, name from locations where tenant_id = ${TENANT}`;
    const hours = await tx`
      select user_id::text, location_id::text,
             count(*) filter (where is_active)::int as active,
             count(*) filter (where is_active and (valid_until is null
                              or valid_until >= (now() at time zone 'Europe/Lisbon')::date))::int as active_not_expired,
             count(*)::int as total
        from availability_templates
       where tenant_id = ${TENANT} and user_id = any(${[JP_CB, JP_LV]})
       group by user_id, location_id
       order by user_id, location_id`;
    const [audit] = await tx`
      select count(*) filter (where not exists (
               select 1 from audit_log r
                where r.tenant_id = a.tenant_id and r.action = ${ACTION_ROLLBACK}
                  and r.metadata->>'reverses' = a.id::text))::int as live,
             count(*)::int as runs
        from audit_log a
       where a.tenant_id = ${TENANT} and a.action = ${ACTION}`;
    return { users, locations, hours, audit };
  });
}

/**
 * THE DECISION, as a pure function of what was read, so the tests drive every state
 * without a database. `hours` rows carry `active` (the portal's predicate) per row and
 * clinic; `audit.live` counts un-reversed reassign rows.
 */
export function evaluate({ users, hours, audit }) {
  const byId = new Map(users.map((u) => [u.id, u]));
  const missing = ROWS.filter((r) => byId.get(r.id)?.tenant_id !== TENANT);
  if (missing.length) {
    return {
      state: "premise",
      checks: [],
      exitCode: 1,
      verdict: `FAIL - ${missing.map((r) => r.label).join(" and ")} not found in tenant ${TENANT}. The premise is broken; re-verify the ids against STAFF-09`,
    };
  }
  const activeAt = (id) =>
    [...new Set(hours.filter((h) => h.user_id === id && h.active > 0).map((h) => h.location_id))].sort();
  const byScript = audit.live > 0;
  const byData = activeAt(JP_LV).length > 0;
  if (!byScript && !byData) {
    return {
      state: "not_split",
      checks: [],
      exitCode: 0,
      verdict:
        "NOT APPLICABLE - the split has not happened: no un-reversed staff.jp_split.reassign audit row, and JP(lv) holds no active hours. Nothing was enforced",
    };
  }
  const checks = [];
  for (const r of ROWS) {
    const at = activeAt(r.id);
    checks.push({ name: `${r.label} holds active hours at exactly one clinic`, ok: at.length === 1, at });
    checks.push({ name: `${r.label}'s one clinic is ${r.homeName}`, ok: at.length === 1 && at[0] === r.home, at });
  }
  const signal = [byScript && "script (un-reversed staff.jp_split.reassign)", byData && "data (JP(lv) holds active hours)"]
    .filter(Boolean)
    .join(" and ");
  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    return {
      state: "split",
      signal,
      checks,
      exitCode: 1,
      verdict: `FAIL - split detected by ${signal}; ${failed.length} check(s) failed: ${failed.map((c) => c.name).join("; ")}`,
    };
  }
  return {
    state: "split",
    signal,
    checks,
    exitCode: 0,
    verdict: `PASS - split detected by ${signal}; each JP row holds active hours at exactly its own clinic`,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length) bad(`unknown argument ${argv[0]}: this check takes none`);
  const raw = process.env.DATABASE_URL_DIRECT;
  if (!raw) bad("DATABASE_URL_DIRECT is not set; pass the env file with node --env-file");
  const t = target(raw);
  console.log(`STAFF-11 jp-one-clinic-check | READ ONLY | ${t.kind} | ${t.line}`);

  // Lazy on purpose: every refusal above is testable without the driver.
  const { default: postgres } = await import("postgres");
  const sql = postgres(raw, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 20, onnotice: () => {} });
  let data;
  try {
    data = await read(sql);
  } catch (e) {
    console.log(`\nVERDICT: FAIL - the read failed: ${e.code ?? ""} ${e.message}`);
    return 1;
  } finally {
    await sql.end({ timeout: 5 });
  }

  const name = new Map(data.locations.map((l) => [l.id, l.name]));
  const clinic = (id) => name.get(id) ?? `location ${id} (not in this tenant)`;
  console.log("\nJP ROWS");
  for (const r of ROWS) {
    const u = data.users.find((x) => x.id === r.id);
    console.log(`  ${r.label.padEnd(7)} ${r.id}  ${u ? `active ${u.is_active ? "yes" : "no"}  bookable ${u.is_bookable ? "yes" : "no"}` : "NOT FOUND"}`);
  }
  console.log("\nAVAILABILITY ROWS, per JP row and clinic (active = the portal's predicate and the one that decides)");
  for (const h of data.hours) {
    const label = ROWS.find((r) => r.id === h.user_id)?.label ?? h.user_id;
    console.log(
      `  ${label.padEnd(7)} ${clinic(h.location_id).padEnd(24)} active ${String(h.active).padStart(3)}  active and not expired ${String(h.active_not_expired).padStart(3)}  all rows ${String(h.total).padStart(3)}`,
    );
  }
  if (data.hours.length === 0) console.log("  (none)");
  console.log("\nSPLIT SIGNALS");
  console.log(`  script  un-reversed ${ACTION} rows: ${data.audit.live} (runs recorded: ${data.audit.runs})`);
  const lvClinics = new Set(data.hours.filter((h) => h.user_id === JP_LV && h.active > 0).map((h) => h.location_id));
  console.log(`  data    JP(lv) holds active hours at ${lvClinics.size} clinic(s)`);

  const result = evaluate(data);
  if (result.checks.length) console.log("");
  for (const c of result.checks) {
    console.log(`CHECK ${c.name.padEnd(48)} | active at: ${c.at.map(clinic).join(", ") || "nowhere"} | ${c.ok ? "OK" : "FAIL"}`);
  }
  console.log(`\nVERDICT: ${result.verdict}`);
  return result.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(await main());
}
