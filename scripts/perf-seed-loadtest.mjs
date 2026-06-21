/**
 * scripts/perf-seed-loadtest.mjs
 *
 * Phase 6 perf validation: seed ~2 000 patients + ~20 000 appointments into
 * DEV Supabase (ref ufbkzbyghvxtosyrkgjq), then EXPLAIN ANALYZE each key query.
 *
 * SAFETY:   Aborts if DATABASE_URL_DIRECT/DATABASE_URL contains the PROD ref.
 * IDEMPOTENT: Detects sentinel NIF 100001001; skips seeding if already present.
 *             Re-runs measurements unconditionally.
 *
 * Usage:
 *   DATABASE_URL_DIRECT="postgresql://postgres.ufbkzbyghvxtosyrkgjq:…@…:5432/postgres" \
 *     node scripts/perf-seed-loadtest.mjs
 */

import postgres from "/Users/sm33xy/Projects/OsteoJP/node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/index.js";
import crypto   from "node:crypto";
import { performance } from "node:perf_hooks";

// ── Safety ─────────────────────────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!DB_URL) { console.error("Set DATABASE_URL_DIRECT or DATABASE_URL"); process.exit(1); }
if (DB_URL.includes("jaxmkwoxjcgzkwxgbayx")) {
  console.error("SAFETY ABORT: URL contains prod ref jaxmkwoxjcgzkwxgbayx. Refusing to seed.");
  process.exit(1);
}

const sql = postgres(DB_URL, { ssl: "require", max: 4, idle_timeout: 20, connect_timeout: 15 });

// ── Constants ───────────────────────────────────────────────────────────────────
const TENANT    = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";
const LOC       = [
  "de000002-0000-0000-0000-000000000001", // Linda-a-Velha
  "de000002-0000-0000-0000-000000000002", // Castelo Branco
  "de000002-0000-0000-0000-000000000003", // Montemor-o-Novo
];
const THERAPS   = [
  "de000004-0000-0000-0000-000000000001",
  "de000004-0000-0000-0000-000000000002",
  "de000004-0000-0000-0000-000000000003",
  "de000004-0000-0000-0000-000000000004",
];
const SVCS      = [
  "de000003-0000-0000-0000-000000000001",
  "de000003-0000-0000-0000-000000000002",
  "de000003-0000-0000-0000-000000000003",
  "de000003-0000-0000-0000-000000000004",
  "de000003-0000-0000-0000-000000000005",
];

const N_PAT  = 2000;
const N_APT  = 20000;
const SENTINEL_NIF = "100001001";
const BATCH  = 500;
const MARKER = "perf-loadtest-2026-06-20"; // notes field, identifies seeded rows

// ── Data generators ─────────────────────────────────────────────────────────────
const FM  = ["Maria","Ana","Joana","Sofia","Inês","Catarina","Sara","Margarida","Filipa","Beatriz","Marta","Carla","Paula","Isabel","Mónica","Sandra","Rita","Cláudia","Patrícia","Liliana","Raquel","Andreia","Vanessa","Cristina","Helena","Susana","Verónica","Fernanda","Manuela","Teresa"];
const MM  = ["João","António","José","Manuel","Francisco","Carlos","Paulo","Pedro","Luís","Miguel","Rui","Hugo","Marco","Tiago","André","Rafael","Nuno","Bruno","Henrique","Vítor","Eduardo","Filipe","Gustavo","Rodrigo","Diogo","Gonçalo","Sérgio","Alexandre","Daniel","Ricardo"];
const SUR = ["Silva","Santos","Ferreira","Pereira","Oliveira","Costa","Rodrigues","Martins","Jesus","Sousa","Fernandes","Gonçalves","Gomes","Lopes","Marques","Alves","Almeida","Ribeiro","Pinto","Carvalho","Teixeira","Moreira","Correia","Mendes","Nunes","Soares","Vieira","Monteiro","Cardoso","Rocha","Fonseca","Macedo","Cunha","Azevedo","Cruz","Ramos","Torres","Castro","Simões","Matos"];

const pick  = (arr, i) => arr[i % arr.length];

function genPatient(i) {
  const female  = i % 2 === 0;
  const first   = female ? pick(FM, Math.floor(i / 2)) : pick(MM, Math.floor(i / 2));
  const sur1    = pick(SUR, i);
  const sur2    = pick(SUR, i + 17);
  // Phone: "+351 912 000 001" … "+351 912 001 999"  — digits: 3519120XXXXX
  const raw     = String(912000001 + i);
  const phone   = `+351 ${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`;
  const yr      = 1944 + (i % 60);
  const mo      = String((i % 12) + 1).padStart(2, "0");
  const dy      = String((i % 28) + 1).padStart(2, "0");
  return {
    id:            crypto.randomUUID(),
    tenant_id:     TENANT,
    full_name:     `${first} ${sur1} ${sur2}`,
    date_of_birth: `${yr}-${mo}-${dy}`,
    sex:           female ? "female" : "male",
    nif:           String(100001001 + i),
    phone,
    notes:         MARKER,
    created_at:    new Date(),
    updated_at:    new Date(),
  };
}

const START_MS = new Date("2024-07-01T00:00:00Z").getTime();
const END_MS   = new Date("2026-06-20T00:00:00Z").getTime();
const NOW_MS   = Date.now();

function genAppointment(i, patientId) {
  const frac   = i / N_APT;
  const ms     = START_MS + Math.floor(frac * (END_MS - START_MS));
  const d      = new Date(ms);
  d.setUTCHours(9 + (i % 9), (i % 2) * 30, 0, 0);
  const starts = new Date(d);
  const ends   = new Date(d.getTime() + 60 * 60 * 1000);
  const status = starts.getTime() > NOW_MS ? "confirmed"
               : i % 10 === 0              ? "cancelled"
               : i % 25 === 0             ? "no_show"
               : "completed";
  return {
    id:              crypto.randomUUID(),
    tenant_id:       TENANT,
    patient_id:      patientId,
    practitioner_id: pick(THERAPS, i),
    location_id:     pick(LOC, i),
    service_id:      pick(SVCS, i),
    starts_at:       starts,
    ends_at:         ends,
    status,
    created_at:      new Date(),
    updated_at:      new Date(),
  };
}

// ── EXPLAIN ANALYZE timing ──────────────────────────────────────────────────────
const RUNS = 10;

async function measure(label, query) {
  const dbTimes   = [];
  const wallTimes = [];
  let capturedPlan = null;

  for (let i = 0; i < RUNS; i++) {
    const t0   = performance.now();
    const rows = await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
    const wall = performance.now() - t0;
    const top  = rows[0]["QUERY PLAN"][0];          // { Plan, "Planning Time", "Execution Time" }
    dbTimes.push(top["Execution Time"]);
    wallTimes.push(wall);
    if (i === 4) capturedPlan = top;               // mid-run, caches warm
  }

  const sort = arr => [...arr].sort((a, b) => a - b);
  const pct  = (arr, p) => arr[Math.min(arr.length - 1, Math.ceil(arr.length * p / 100) - 1)];
  const ds   = sort(dbTimes);
  const ws   = sort(wallTimes);

  return {
    label,
    db:   { p50: pct(ds,50), p95: pct(ds,95), p99: pct(ds,99), min: ds[0], max: ds[ds.length-1] },
    wall: { p50: pct(ws,50), p95: pct(ws,95) },
    plan: capturedPlan,
  };
}

function nodeTree(node, depth = 0) {
  if (!node) return "";
  const pad  = "  ".repeat(depth);
  const type = node["Node Type"];
  const idxn = node["Index Name"] ? ` [${node["Index Name"]}]` : "";
  const cond = node["Index Cond"]   ? ` cond=(${node["Index Cond"]})`   : "";
  const filt = node["Filter"]       ? ` filter=(${node["Filter"]})`     : "";
  const rech = node["Recheck Cond"] ? ` recheck=(${node["Recheck Cond"]})` : "";
  const row  = `actual rows=${node["Actual Rows"]} time=${node["Actual Total Time"]?.toFixed(2)}ms`;
  let out = `${pad}${type}${idxn}${cond}${filt}${rech}  (${row})\n`;
  for (const child of node["Plans"] ?? []) out += nodeTree(child, depth + 1);
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Phase 6 Perf Seed + Validation ===");
  console.log(`DB: ${DB_URL.replace(/:([^:@]+)@/, ":***@")}\n`);

  // 1. Idempotency
  const [sentinel] = await sql`
    SELECT id FROM patients
    WHERE nif = ${SENTINEL_NIF} AND tenant_id = ${TENANT}
    LIMIT 1
  `;

  let patientIds;
  if (sentinel) {
    console.log("Sentinel NIF found — skipping seed, reading existing perf patient IDs...");
    const rows = await sql`
      SELECT id FROM patients
      WHERE tenant_id = ${TENANT} AND notes = ${MARKER}
      ORDER BY nif LIMIT ${N_PAT}
    `;
    patientIds = rows.map(r => r.id);
    console.log(`  ${patientIds.length} perf patients found\n`);
  } else {
    // 2. Seed patients
    console.log(`Seeding ${N_PAT} patients in batches of ${BATCH}...`);
    const pRows = Array.from({ length: N_PAT }, (_, i) => genPatient(i));
    patientIds  = pRows.map(r => r.id);

    for (let i = 0; i < pRows.length; i += BATCH) {
      await sql`INSERT INTO patients ${sql(pRows.slice(i, i + BATCH))}`;
      process.stdout.write(`  ${Math.min(i + BATCH, N_PAT)}/${N_PAT} patients\r`);
    }
    console.log(`\n  ✓ ${N_PAT} patients inserted`);

    // 3. Seed appointments
    console.log(`Seeding ${N_APT} appointments in batches of ${BATCH}...`);
    const aRows = Array.from({ length: N_APT }, (_, i) =>
      genAppointment(i, pick(patientIds, i * 7)), // spread across patients
    );

    for (let i = 0; i < aRows.length; i += BATCH) {
      await sql`INSERT INTO appointments ${sql(aRows.slice(i, i + BATCH))}`;
      process.stdout.write(`  ${Math.min(i + BATCH, N_APT)}/${N_APT} appointments\r`);
    }
    console.log(`\n  ✓ ${N_APT} appointments inserted\n`);
  }

  // 4. Dataset totals
  const [{ ptotal }] = await sql`SELECT count(*)::int AS ptotal FROM patients WHERE tenant_id = ${TENANT} AND deleted_at IS NULL`;
  const [{ atotal }] = await sql`SELECT count(*)::int AS atotal FROM appointments WHERE tenant_id = ${TENANT}`;
  const [{ atloc }]  = await sql`SELECT count(*)::int AS atloc  FROM appointments WHERE tenant_id = ${TENANT} AND location_id = ${LOC[0]}`;
  const [{ atweek }] = await sql`SELECT count(*)::int AS atweek FROM appointments WHERE tenant_id = ${TENANT} AND starts_at >= '2026-06-16' AND starts_at < '2026-06-23'`;

  console.log("=== Dataset ===");
  console.log(`  Active patients  : ${ptotal}`);
  console.log(`  Appointments     : ${atotal}  (${atloc} at Linda-a-Velha)`);
  console.log(`  Appts this week  : ${atweek}`);
  console.log();

  // 5. EXPLAIN ANALYZE — run sequentially to avoid mutual interference
  console.log(`Running EXPLAIN ANALYZE (${RUNS} runs each, reporting DB execution time)...\n`);

  const Q = [
    {
      label: "agenda:week+location — listAppointments(location_id, week)",
      q: `SELECT a.id, a.starts_at, a.ends_at, a.status,
                 p.full_name AS patient_name, u.full_name AS practitioner_name,
                 l.name AS location_name, s.name AS service_name
          FROM   appointments a
          JOIN   patients  p ON p.id = a.patient_id
          JOIN   users     u ON u.id = a.practitioner_id
          JOIN   locations l ON l.id = a.location_id
          LEFT JOIN services s ON s.id = a.service_id
          WHERE  a.tenant_id   = '${TENANT}'
            AND  a.location_id = '${LOC[0]}'
            AND  a.starts_at  >= '2026-06-16T00:00:00Z'
            AND  a.starts_at  <  '2026-06-23T00:00:00Z'
          ORDER BY a.starts_at`,
      target: 200,
      group: "agenda",
    },
    {
      label: "agenda:week (no location filter) — dashboard listAppointments",
      q: `SELECT a.id, a.starts_at, a.ends_at, a.status,
                 p.full_name AS patient_name, u.full_name AS practitioner_name,
                 l.name AS location_name
          FROM   appointments a
          JOIN   patients  p ON p.id = a.patient_id
          JOIN   users     u ON u.id = a.practitioner_id
          JOIN   locations l ON l.id = a.location_id
          LEFT JOIN services s ON s.id = a.service_id
          WHERE  a.tenant_id  = '${TENANT}'
            AND  a.starts_at >= '2026-06-16T00:00:00Z'
            AND  a.starts_at <  '2026-06-23T00:00:00Z'
          ORDER BY a.starts_at`,
      target: 200,
      group: "agenda",
    },
    {
      label: "search:name — ILIKE '%Silva%' (GIN trigram)",
      q: `SELECT id, full_name, phone, nif, date_of_birth, sex
          FROM   patients
          WHERE  tenant_id  = '${TENANT}'
            AND  deleted_at IS NULL
            AND  full_name ILIKE '%Silva%'
          ORDER BY full_name LIMIT 50`,
      target: 50,
      group: "search",
    },
    {
      label: "search:phone-digits — phone_digits LIKE '%912%'",
      q: `SELECT id, full_name, phone
          FROM   patients
          WHERE  tenant_id   = '${TENANT}'
            AND  deleted_at  IS NULL
            AND  phone_digits LIKE '%912%'
          ORDER BY full_name LIMIT 50`,
      target: 50,
      group: "search",
    },
    {
      label: "search:nif-prefix — nif ILIKE '10%' (B-tree prefix)",
      q: `SELECT id, full_name, nif
          FROM   patients
          WHERE  tenant_id  = '${TENANT}'
            AND  deleted_at IS NULL
            AND  nif ILIKE '10%'
          ORDER BY full_name LIMIT 50`,
      target: 50,
      group: "search",
    },
  ];

  const results = [];
  for (const { label, q, target, group } of Q) {
    process.stdout.write(`  measuring: ${label.slice(0, 60)}...\r`);
    const r = await measure(label, q);
    r.target = target;
    r.group  = group;
    results.push(r);
  }
  console.log(" ".repeat(70));

  // 6. Results
  console.log("\n=== Results (DB execution time, ms) ===\n");
  console.log(`${"Label".padEnd(55)} ${"p50".padStart(6)} ${"p95".padStart(6)} ${"p99".padStart(6)} ${"target".padStart(8)}  verdict`);
  console.log("─".repeat(100));
  for (const r of results) {
    const verdict = r.db.p99 <= r.target ? "PASS ✓" : "FAIL ✗";
    console.log(
      `${r.label.padEnd(55)} ${r.db.p50.toFixed(2).padStart(6)} ${r.db.p95.toFixed(2).padStart(6)} ${r.db.p99.toFixed(2).padStart(6)} ${String(r.target + "ms").padStart(8)}  ${verdict}`,
    );
  }

  // 7. Query plans
  console.log("\n=== Query Plans ===\n");
  for (const r of results) {
    console.log(`── ${r.label}`);
    console.log(`   Planning: ${r.plan["Planning Time"].toFixed(2)}ms  Execution: ${r.plan["Execution Time"].toFixed(2)}ms`);
    if (r.plan?.Plan) {
      process.stdout.write(nodeTree(r.plan.Plan, 1).split("\n").map(l => `  ${l}`).join("\n") + "\n");
    }
    console.log();
  }

  // 8. Machine-readable JSON for the markdown doc
  console.log("=== JSON (for doc) ===");
  console.log(JSON.stringify({
    dataset:  { patients: ptotal, appointments: atotal, appts_linda: atloc, appts_this_week: atweek },
    results:  results.map(r => ({
      label:    r.label,
      group:    r.group,
      target:   r.target,
      db:       { p50: +r.db.p50.toFixed(2), p95: +r.db.p95.toFixed(2), p99: +r.db.p99.toFixed(2), min: +r.db.min.toFixed(2), max: +r.db.max.toFixed(2) },
      wall:     { p50: +r.wall.p50.toFixed(2), p95: +r.wall.p95.toFixed(2) },
      pass:     r.db.p99 <= r.target,
      topNode:  r.plan?.Plan?.["Node Type"],
      indexHit: r.plan?.Plan?.["Index Name"] ?? r.plan?.Plan?.Plans?.[0]?.["Index Name"] ?? null,
      planText: r.plan?.Plan ? nodeTree(r.plan.Plan).trim() : null,
    })),
  }, null, 2));

  await sql.end();
  console.log("\nDone.");
}

main().catch(e => { console.error("FATAL:", e.message, "\n", e.stack); process.exit(1); });
