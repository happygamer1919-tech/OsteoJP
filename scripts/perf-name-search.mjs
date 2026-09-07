#!/usr/bin/env node
/**
 * PERF-SEARCH — what the patient-name search fix costs, measured.
 *
 * ==========================================================================
 * WHY IT IS COMMITTED RATHER THAN RUN ONCE AND QUOTED
 * ==========================================================================
 * The fix trades a query for a correct answer, and the size of that trade is
 * the whole question a reviewer has. A number in a report is a claim; a script
 * anybody can re-run is the evidence. It is also the only way the NEXT person
 * to touch `name-search.ts` can tell whether they made it worse.
 *
 * ==========================================================================
 * IT MEASURES AS THE ASSIGNED ADMIN, WITH RLS ON, AND REFUSES OTHERWISE
 * ==========================================================================
 * `patients_select` (0047) gives admin and reception a LOCATION arm gated on
 * `viewer_has_location_assignment()`. An UNASSIGNED admin falls through to the
 * tenant-wide branch: a different predicate, a different plan, a different row
 * count. Measuring as one measures a principal the clinic does not have.
 *
 * And the owner connection BYPASSES RLS entirely, so a timing taken on it is a
 * timing of a query nobody runs. Every measurement below runs
 * `set local role authenticated` with real claims.
 *
 * THE CONTROL RUNS BEFORE ANY TIMING AND ABORTS. The principal must see MORE
 * than zero rows and FEWER than the tenant holds. The first version of this
 * script nested the claims under `app_metadata`; `jwt_tenant_id()` reads them
 * FLAT, so it returned NULL, RLS blocked everything, every plan came back
 * `rows=0` — and the numbers looked FAST. A timing of an empty result set is
 * not a timing, and nothing in the output said so.
 *
 * ==========================================================================
 * INTERLEAVED A/B, NOT TWO BLOCKS
 * ==========================================================================
 * Running all the BEFOREs and then all the AFTERs gave two runs that disagreed
 * by 30ms on the identical query — cache warmth and background load drifting
 * under a block. Interleaving puts each pair microseconds apart, so a slow
 * moment hits both arms and cancels.
 *
 * LOCAL ONLY, through the repo's own positive guard. SR-50 is suspended for
 * applies; this never opens a production connection.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
 *     node scripts/perf-name-search.mjs
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { assertLocalTarget } from "./local-target.mjs";

const DB_URL = process.env.DATABASE_URL ?? "";
assertLocalTarget(DB_URL, "DATABASE_URL");

const HERE = dirname(fileURLToPath(import.meta.url));
const requireFromDb = createRequire(join(HERE, "..", "packages", "db", "package.json"));
const { default: postgres } = await import(pathToFileURL(requireFromDb.resolve("postgres")).href);

const sql = postgres(DB_URL, { max: 1 });
const tenant = randomUUID();
const locCB = randomUUID();
const locLV = randomUUID();
const admin = randomUUID();
const outsider = randomUUID();

/** Accented Portuguese name parts, so the fold is exercised on real shapes. */
const FIRST = ["António","Maria","João","Ana","Manuel","Fernanda","José","Luísa","Carlos","Cristina",
               "Rui","Sofia","Paulo","Inês","Miguel","Teresa","Nuno","Beatriz","Pedro","Mónica"];
const MID   = ["Armando","Ribeiro","Alves","Costa","Nunes","Baptista","Sousa","Marques","Lopes","Cardoso"];
const LAST  = ["Galhofo","Ferreira","Pereira","Rodrigues","Silva","Santos","Oliveira","Martins","Gomes","Correia"];

/** Production carries roughly this many patients. */
const N = 8400;
const pick = (a, i) => a[i % a.length];

const ACC = "áàâãäçéèêëíìîïóòôõöúùûüýÿñ";
const PLAIN = "aaaaaceeeeiiiiooooouuuuyyn";
const FOLD = `translate(lower(full_name), '${ACC}', '${PLAIN}')`;
/** What the code shipped BEFORE the fix: one substring of the whole typed text. */
const OLD = `full_name ilike '%' || $1 || '%'`;
/** What it does now: every token, folded, ANDed. */
const NEW_2 = `${FOLD} like '%' || $1 || '%' and ${FOLD} like '%' || $2 || '%'`;
const NEW_1 = `${FOLD} like '%' || $1 || '%'`;

async function main() {
  console.log(`seeding ${N} patients in a throwaway tenant…`);
  await sql`insert into tenants (id, name, slug) values (${tenant}, 'perf-search', ${"ps-" + tenant.slice(0, 8)})`;
  await sql`insert into locations (id, tenant_id, name) values (${locCB}, ${tenant}, 'Castelo Branco')`;
  await sql`insert into locations (id, tenant_id, name) values (${locLV}, ${tenant}, 'Linda-a-Velha')`;
  for (const [id, who] of [[admin, "adm"], [outsider, "out"]])
    await sql`insert into users (id, tenant_id, email, full_name)
              values (${id}, ${tenant}, ${who + "-" + id.slice(0, 8) + "@perf.test"}, ${who})`;
  await sql`insert into staff_locations (tenant_id, user_id, location_id) values (${tenant}, ${admin}, ${locCB})`;

  const rows = [];
  for (let i = 0; i < N; i++) {
    rows.push({
      id: randomUUID(), tenant_id: tenant,
      full_name: `${pick(FIRST, i)} ${pick(MID, i * 3)} ${pick(MID, i * 7 + 1)} ${pick(LAST, i * 11)}`,
      patient_number: 900000 + i,
      primary_location_id: i % 2 === 0 ? locCB : locLV,
      created_by: outsider,
    });
  }
  rows[0].full_name = "António Armando Ribeiro Galhofo"; // the reported record
  rows[0].primary_location_id = locCB;
  for (let i = 0; i < rows.length; i += 500) await sql`insert into patients ${sql(rows.slice(i, i + 500))}`;
  await sql`analyze patients`;

  // FLAT claims: jwt_tenant_id() is `(auth.jwt() ->> 'tenant_id')::uuid`.
  const claims = JSON.stringify({ tenant_id: tenant, user_role: "admin", sub: admin });

  const visible = await sql.begin(async (tx) => {
    await tx.unsafe(`set local role authenticated`);
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    const [{ v }] = await tx`select count(*)::int as v from patients where deleted_at is null`;
    return v;
  });
  if (visible === 0) return abort(`the assigned admin sees 0 patients — RLS blocked the principal, so every timing would be a timing of nothing.`);
  if (visible >= N) return abort(`the admin sees ${visible} of ${N} — RLS is NOT narrowing, so this is the unassigned principal that must never be measured.`);
  console.log(`control: the ASSIGNED admin sees ${visible} of ${N} patients (RLS on and narrowing)\n`);

  async function ab(label, pairs, n = 25) {
    const acc = Object.fromEntries(pairs.map(([k]) => [k, []]));
    const seen = {};
    for (let i = 0; i < n; i++) {
      for (const [key, predicate, params] of pairs) {
        const plan = await sql.begin(async (tx) => {
          await tx.unsafe(`set local role authenticated`);
          await tx`select set_config('request.jwt.claims', ${claims}, true)`;
          const r = await tx.unsafe(
            `explain (analyze, format text)
               select id from patients
                where deleted_at is null and (${predicate})
                order by full_name asc limit 25`, params);
          return r.map((x) => x["QUERY PLAN"]).join("\n");
        });
        acc[key].push(Number(/Execution Time: ([\d.]+) ms/.exec(plan)[1]));
        seen[key] = Number(/rows=(\d+) loops=1\)/.exec(plan)?.[1] ?? -1);
      }
    }
    console.log(label);
    const out = {};
    for (const [key] of pairs) {
      const v = acc[key].sort((a, b) => a - b);
      out[key] = { min: v[0], med: v[Math.floor(v.length / 2)], rows: seen[key] };
      console.log(`  ${key.padEnd(20)} min ${v[0].toFixed(1).padStart(6)}ms  median ${out[key].med.toFixed(1).padStart(6)}ms  rows ${seen[key]}`);
    }
    console.log("");
    return out;
  }

  const r1 = await ab("=== AS SHIPPED (no extra index) ===", [
    ["BEFORE one token", OLD, ["galhofo"]],
    ["AFTER  one token", NEW_1, ["galhofo"]],
    ["BEFORE two tokens", OLD, ["antonio galhofo"]],
    ["AFTER  two tokens", NEW_2, ["antonio", "galhofo"]],
  ]);

  // DOES A FUNCTIONAL INDEX ON THE FOLDED NAME HELP? Built, measured, dropped.
  // Proposing a migration without this number is a guess with a CREATE INDEX
  // attached.
  console.log("building a functional GIN trigram index on the folded name…");
  await sql.unsafe(`create index perf_folded_trgm on patients using gin (${FOLD} gin_trgm_ops)`);
  await sql`analyze patients`;
  const r2 = await ab("=== WITH THAT INDEX ===", [
    ["AFTER  one token", NEW_1, ["galhofo"]],
    ["AFTER  two tokens", NEW_2, ["antonio", "galhofo"]],
  ]);
  const plan = await sql.begin(async (tx) => {
    await tx.unsafe(`set local role authenticated`);
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    const r = await tx.unsafe(`explain (analyze, format text)
      select id from patients where deleted_at is null and (${NEW_1})
      order by full_name asc limit 25`, ["galhofo"]);
    return r.map((x) => x["QUERY PLAN"]).join("\n");
  });
  const used = plan.includes("perf_folded_trgm");
  console.log("the plan WITH the index in place:");
  for (const l of plan.split("\n").filter((l) => /Scan|Rows Removed/.test(l))) console.log("  " + l.trim().slice(0, 150));
  console.log(`  perf_folded_trgm used: ${used}\n`);
  await sql.unsafe(`drop index perf_folded_trgm`);

  console.log("=== SUMMARY ===");
  console.log(`one token    ${r1["BEFORE one token"].med.toFixed(1)}ms -> ${r1["AFTER  one token"].med.toFixed(1)}ms`);
  console.log(`two tokens   ${r1["BEFORE two tokens"].med.toFixed(1)}ms -> ${r1["AFTER  two tokens"].med.toFixed(1)}ms   BEFORE rows=${r1["BEFORE two tokens"].rows} (THE BUG), AFTER rows=${r1["AFTER  two tokens"].rows}`);
  console.log(`with index   one ${r2["AFTER  one token"].med.toFixed(1)}ms, two ${r2["AFTER  two tokens"].med.toFixed(1)}ms   INDEX USED: ${used}`);

  await sql`delete from tenants where id = ${tenant}`;
  console.log("\nfixture tenant dropped.");
  await sql.end();
}

async function abort(why) {
  console.error(`REFUSING: ${why}`);
  await sql`delete from tenants where id = ${tenant}`;
  await sql.end();
  process.exit(2);
}

main().catch(async (e) => {
  console.error(e);
  try { await sql`delete from tenants where id = ${tenant}`; } catch {}
  await sql.end();
  process.exit(1);
});
