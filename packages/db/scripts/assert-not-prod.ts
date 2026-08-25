/**
 * THE REHEARSAL GUARD. Refuses to let anything run against a production ref.
 *
 * ==========================================================================
 * WHY THIS FILE EXISTS AND WHY IT IS NOT A GREP
 * ==========================================================================
 * MIG-04's dispatch offered a choice: "reuse seed-guard's check if invocable
 * standalone, else a one-line grep guard". `packages/db/seed/seed-guard.ts` is
 * NOT invocable standalone - it is a module whose entry point,
 * `resolveSeedDatabaseUrl`, also demands `SEED_DEV_CONFIRM` and is wired into
 * the seeds. So this makes it invocable, rather than duplicating the blocklist
 * into a shell pattern that would drift from it the first time a ref is added.
 *
 * PROD_REFS IS IMPORTED, NEVER RESTATED. That is the whole point. A grep guard
 * carries its own copy of the refs, and a copy of a blocklist is a blocklist
 * that goes stale silently - which is the exact failure
 * SEC-seed-guard-prod-blocklist was carded for, where the list sat empty for
 * months with a comment as its only enforcement.
 *
 * ==========================================================================
 * IT CHECKS MORE THAN THE SEED GUARD DOES, DELIBERATELY
 * ==========================================================================
 * `resolveSeedDatabaseUrl` reads DATABASE_URL only. A rehearsal ALSO holds
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and the byte-copy job writes
 * through the Storage REST API using those - a shell whose DATABASE_URL points
 * at a scratch project while SUPABASE_URL still points at production would pass
 * a database-only guard and then upload patient documents into the live bucket.
 *
 * So every candidate variable is checked, and SUPABASE_URL is checked by a
 * different method: `parseProjectRef` reads the two POSTGRES forms
 * (`postgres.<ref>@...` and `db.<ref>.supabase.co`) and yields null for
 * `https://<ref>.supabase.co`, which is the shape of a Storage endpoint.
 * A plain substring test over the raw value covers it and cannot under-match.
 *
 * NO VALUE IS EVER PRINTED. A connection string carries a password. What comes
 * out is a variable NAME, a 20-character project ref, and a verdict - the ref
 * is a public identifier that appears in CLAUDE.md, and it is the one thing an
 * operator needs to see to know which project is about to be written to.
 *
 * Usage:  pnpm --filter @osteojp/db exec tsx scripts/assert-not-prod.ts
 * Exit:   0 clean - no checked variable names a production ref
 *         1 REFUSED - a production ref is present, or nothing is set at all
 */

import { PROD_REFS, parseProjectRef } from "../seed/seed-guard";

/**
 * Every variable a rehearsal can point at a project.
 *
 * DATABASE_URL_DEV FIRST because seed-guard prefers it, so a stale
 * DATABASE_URL_DEV in the shell is what the seeds would actually use.
 */
const CHECKED = [
  "DATABASE_URL_DEV",
  "DATABASE_URL",
  "DATABASE_URL_DIRECT",
  "SUPABASE_URL",
] as const;

type Finding = { name: string; ref: string; how: "parsed" | "substring" };

export function scanEnv(env: NodeJS.ProcessEnv = process.env): {
  present: { name: string; ref: string | null }[];
  findings: Finding[];
} {
  const present: { name: string; ref: string | null }[] = [];
  const findings: Finding[] = [];

  for (const name of CHECKED) {
    const value = env[name];
    if (!value) continue;
    const ref = parseProjectRef(value);
    present.push({ name, ref });

    if (ref && PROD_REFS.includes(ref)) {
      findings.push({ name, ref, how: "parsed" });
      continue;
    }
    // THE SECOND ARM, and it is not redundant. `https://<ref>.supabase.co` is a
    // Storage endpoint and parses to null above; a blocklisted ref sitting in
    // one would otherwise pass. Substring cannot under-match, and a false
    // positive here costs one confused operator while a false negative costs
    // a write into the live clinic project.
    for (const prod of PROD_REFS) {
      if (value.includes(prod)) {
        findings.push({ name, ref: prod, how: "substring" });
        break;
      }
    }
  }

  return { present, findings };
}

function main(): void {
  const { present, findings } = scanEnv();

  console.log("REHEARSAL TARGET GUARD");
  console.log("======================");
  console.log(`blocklist: ${PROD_REFS.length} production ref(s), from packages/db/seed/seed-guard.ts`);
  for (const p of present) {
    console.log(`  set  ${p.name.padEnd(20)} ref=${p.ref ?? "(not a postgres connection string)"}`);
  }

  // NOTHING SET IS A REFUSAL, NOT A PASS. An empty environment makes every
  // check below vacuously true, and a guard that passes when it examined
  // nothing is section 1.3's one-line convenience: it reports the harmless
  // case over an unknown one. The env file was not sourced; that is the finding.
  if (present.length === 0) {
    console.log("");
    console.log("REFUSED - none of the checked variables is set.");
    console.log(`Checked: ${CHECKED.join(", ")}`);
    console.log("The rehearsal env file has not been sourced into this shell.");
    process.exit(1);
  }

  if (findings.length > 0) {
    console.log("");
    console.log(`REFUSED - ${findings.length} variable(s) name a PRODUCTION project ref.`);
    for (const f of findings) console.log(`  PROD  ${f.name} -> ${f.ref}  (${f.how})`);
    console.log("");
    console.log("Nothing may be run against this shell. Source the rehearsal env file");
    console.log("into a NEW terminal and re-run this guard before anything else.");
    process.exit(1);
  }

  console.log("");
  console.log("OK - no checked variable names a production ref.");
  console.log("This proves the target is NOT production. It does not prove the target is");
  console.log("the project you intended; confirm the ref above in the Supabase dashboard.");
  process.exit(0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
