#!/usr/bin/env node
// W13-04 — set `services.patient_bookable` to JP's ruling. PREVIEW BY DEFAULT.
//
// JP ruled on 2026-08-06, relayed by Ivan, verbatim "certo": LAUNCH POSTURE IS
// REQUEST-MODE FOR ALL 12 BOOKABLE SERVICES, zero auto-confirmed. The four
// excluded stay off. Direct booking is a post-launch graduation JP rules per
// service, which is why the sets below are named constants rather than inlined:
// the graduation moves names between them and reuses this script unchanged.
//
// IT PREVIEWS UNLESS YOU SAY --execute. There is no other safety here and there
// does not need to be: a preview that shows every row it would change, run
// first, is the whole control. The preview runs in a READ ONLY transaction, so
// the server itself refuses a write the preview could contain now or later.
//
// WHAT IT TOUCHES: `patient_bookable`, and nothing else. Not the name, not the
// price, not `is_active`, not `internal_only`. A service missing from both lists
// below is LEFT ALONE rather than defaulted, because "not mentioned" is not the
// same as "not bookable" and silently turning something off is how a catalog
// diverges from what a clinic thinks it sells.
//
// MATCHING IS BY NORMALIZED NAME, the same normalisation migration 0057 used and
// `normalizeServiceName` implements: strip accents, lowercase, collapse
// whitespace, trim. It is spelled out here rather than imported because
// packages/db must not import from apps/*, and it is TESTED for agreement in
// apps/api/lib/appointments/patient-bookable.db.test.ts.
//
// SAFETY, because this is pointed at production:
//   * Preview is a READ ONLY transaction.
//   * The write is ONE statement in ONE transaction, tenant-scoped.
//   * It prints service names and booleans. Never the connection string, never
//     an environment value, never a patient row.
//
// USAGE, from the repo root with the prod env sourced:
//   pnpm --filter @osteojp/db exec node scripts/w13-04-set-patient-bookable.mjs
//   pnpm --filter @osteojp/db exec node scripts/w13-04-set-patient-bookable.mjs --execute

/**
 * The 12 JP ruled bookable, VERBATIM AS PRODUCTION STORES THEM. All
 * request-mode at launch.
 *
 * VERBATIM, NOT HAND-NORMALIZED, and that is a correction rather than a
 * preference. The first version of this file carried my own normalized spellings
 * and SIX OF SIXTEEN WERE WRONG: production writes an EM DASH in "Pilates —
 * Aula Individual" and "R.P.G. — Reeducação Postural Global", and a feminine
 * ordinal in "1.ª consulta" and "Pilates — Aula Experimental (1.ª vez)". Neither
 * is a combining diacritic, so NFD-strip leaves them alone and my hyphens and
 * plain "a" matched nothing.
 *
 * Both sides now go through the SAME `norm()` below, so there is no
 * hand-transcription left to get wrong. Extending `norm()` to fold em dashes
 * would have been the other fix and it is the wrong one: it would diverge from
 * `normalizeServiceName` and from migration 0057's SQL, which is exactly the
 * drift this script must not introduce.
 *
 * The STOP condition below is what caught it. It works.
 */
const BOOKABLE = [
  "Osteopatia/Posturologia",
  "Fisioterapia",
  "Fisioenergética/Kinesiologia/Posturologia",
  "Medicina Chinesa/Acupuntura",
  "Drenagem Linfática Manual (Método Wodere)",
  "Pressoterapia",
  "Tratamento Terapêutico",
  "Pilates — Aula Individual",
  "Massagem 4 Mãos (2 terapeutas)",
  "Sessão Família/Amigos (2 pessoas ao mesmo tempo)",
  "Pilates mensal 1x/semana — grupo (3 a 4 pessoas)",
  "Pilates mensal 2x/semana — grupo (3 a 4 pessoas)",
];

/** The 4 JP ruled off, verbatim. Named explicitly so the ruling is auditable. */
const NOT_BOOKABLE = [
  "1.ª consulta / Avaliação (Osteopatia ou Fisioenergética/Kinesiologia/Posturologia)",
  "Pilates — Aula Experimental (1.ª vez)",
  "NESA",
  "R.P.G. — Reeducação Postural Global",
];

const EXECUTE = process.argv.includes("--execute");

const DB_URL = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!DB_URL) {
  // Names only. The value is never printed, here or anywhere.
  console.error("Set DATABASE_URL_DIRECT or DATABASE_URL (names only; never paste the value).");
  process.exit(2);
}

let postgres;
try {
  ({ default: postgres } = await import("postgres"));
} catch {
  console.error(
    "could not resolve the `postgres` driver from here.\n" +
      "Run it through the package that depends on it, from the repo root:\n\n" +
      "  pnpm --filter @osteojp/db exec node scripts/w13-04-set-patient-bookable.mjs",
  );
  process.exit(2);
}

const sql = postgres(DB_URL, { ssl: "require", max: 1, connect_timeout: 15, onnotice: () => {} });

/** 0057's normalisation, in JS. Agreement with the SQL form is tested. */
const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const wanted = new Map();
for (const n of BOOKABLE) wanted.set(norm(n), true);
for (const n of NOT_BOOKABLE) wanted.set(norm(n), false);

try {
  const rows = await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    return tx`select id, tenant_id, name, patient_bookable from services order by name`;
  });

  const changes = [];
  const unmatched = [];
  for (const r of rows) {
    const target = wanted.get(norm(r.name));
    if (target === undefined) {
      unmatched.push(r.name);
      continue;
    }
    if (r.patient_bookable !== target) changes.push({ ...r, target });
  }

  const seen = new Set(rows.map((r) => norm(r.name)));
  const missing = [...wanted.keys()].filter((k) => !seen.has(k));

  console.log(`${rows.length} services read.`);
  console.log(`\nWOULD CHANGE: ${changes.length}`);
  for (const c of changes) {
    console.log(`  ${c.patient_bookable ? "sim" : " - "} -> ${c.target ? "sim" : " - "}   ${c.name}`);
  }
  if (unmatched.length) {
    console.log(`\nLEFT ALONE (named in neither list): ${unmatched.length}`);
    for (const n of unmatched) console.log(`  ${n}`);
  }
  if (missing.length) {
    // A ruled name with no row is a MISMATCH, not a no-op: it means the catalog
    // moved under the ruling, which is the whole reason W13-04a exists.
    console.error(`\nSTOP: ${missing.length} ruled name(s) match no service row:`);
    for (const m of missing) console.error(`  ${m}`);
    console.error("The catalog does not match the ruling. Do not execute; report it.");
    process.exit(1);
  }

  if (!EXECUTE) {
    console.log("\nPREVIEW ONLY. Nothing was written. Re-run with --execute to apply.");
    process.exit(0);
  }

  const updated = await sql.begin(async (tx) => {
    const out = [];
    for (const c of changes) {
      // Tenant-scoped per hard rule 3, and id-scoped so one row is one write.
      const res = await tx`
        update services set patient_bookable = ${c.target}
         where id = ${c.id} and tenant_id = ${c.tenant_id}
        returning name, patient_bookable`;
      out.push(...res);
    }
    return out;
  });

  console.log(`\nAPPLIED: ${updated.length} row(s) changed.`);

  // VERIFICATION READ, in the same run, because "applied successfully" is not
  // evidence - the 0057 doctrine, applied to a data write.
  const after = await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    return tx`select name, patient_bookable from services order by patient_bookable desc, name`;
  });
  console.log("\nVERIFICATION READ:");
  for (const r of after) console.log(`  ${r.patient_bookable ? "BOOKABLE  " : "          "}${r.name}`);
  const n = after.filter((r) => r.patient_bookable).length;
  console.log(`\n${n} bookable of ${after.length}. Expected 12.`);
  if (n !== 12) {
    console.error("STOP: the count is not 12. Report this before merging anything.");
    process.exit(1);
  }
} catch (err) {
  console.error(`failed: ${err instanceof Error ? err.message : "unknown"}`);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
