import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { can, ROLES } from "@osteojp/auth";

/**
 * INTAKE-01 (staff side) - the capability, and source guards over the files
 * this card added. Each guard has a negative control proving its matcher can
 * see what it forbids, so a guard that matches nothing cannot pass green.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const DB_READS = "../../packages/db/src/guest-intake-reads.ts";

/** Code with comments removed, so a comment that NAMES a rule does not trip it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

const INTAKE_FILES = [
  "lib/guest-intake/view.ts",
  "lib/guest-intake/queries.ts",
  "lib/guest-intake/retention.ts",
  "lib/guest-intake/inngest/retention.ts",
  "components/guest-intake-answers.tsx",
  DB_READS,
];

describe("guest_intake:read - the capability", () => {
  it("owner, admin, reception and therapist all hold it (the ruling)", () => {
    for (const role of ["owner", "admin", "reception", "therapist"] as const) {
      expect(can(role, "guest_intake:read")).toBe(true);
    }
    expect([...ROLES].sort()).toEqual(["admin", "owner", "reception", "therapist"]);
  });

  it("it did NOT widen the guest QUEUE: a therapist still lacks guest_requests:read (SEC-01)", () => {
    expect(can("therapist", "guest_requests:read")).toBe(false);
    expect(can("reception", "guest_requests:read")).toBe(true);
  });

  it("negative control: `can` does refuse a capability a role lacks", () => {
    expect(can("reception", "clinical_records:read")).toBe(false);
  });
});

describe("no SQL in apps/web/lib/guest-intake (CLAUDE.md: database access only through packages/db)", () => {
  // The statement markers: a drizzle `sql` template (or sql.join / sql.raw) and
  // any `.execute(` call - `db.execute`, `tx.execute`, `getDbAdmin().execute`.
  const SQL_TEMPLATE = /\bsql\s*[`.]/;
  const EXECUTE = /\.execute\s*\(/;

  // Every non-test source file in the directory, found by walking it, so a file
  // added later is covered without editing this list. Test files are excluded:
  // the DB-gated suites build their fixtures with SQL, which is what they are for.
  const DIR = join(WEB, "lib", "guest-intake");
  const sources = (readdirSync(DIR, { recursive: true }) as string[])
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .sort();

  it("the walk found the directory's sources (refuse an empty list)", () => {
    expect(sources).toEqual(["inngest/retention.ts", "queries.ts", "retention.ts", "view.ts"]);
  });

  it("no source file there holds a sql template or an execute call", () => {
    for (const f of sources) {
      const src = code(readFileSync(join(DIR, f), "utf8"));
      expect(src, f).not.toMatch(SQL_TEMPLATE);
      expect(src, f).not.toMatch(EXECUTE);
    }
  });

  it("negative control: both matchers DO fire on the package file where the SQL now lives", () => {
    const src = code(readFileSync(join(REPO, "packages", "db", "src", "guest-intake-reads.ts"), "utf8"));
    expect(src).toMatch(SQL_TEMPLATE);
    expect(src).toMatch(EXECUTE);
    expect("await db.execute(x)").toMatch(EXECUTE);
    expect("const q = sql`select 1`").toMatch(SQL_TEMPLATE);
  });
});

describe("source guards", () => {
  it("the comment stripper keeps code and drops comments (negative control for the guards below)", () => {
    const sample = "const a = 1; // contraindication_pacemaker\n/* converted_appointment_id */ set contraindication_x = true";
    expect(code(sample)).not.toContain("contraindication_pacemaker");
    expect(code(sample)).not.toContain("converted_appointment_id");
    expect(code(sample)).toContain("contraindication_x");
  });

  it("no intake file writes or even names a contraindication column in code (ruling 2)", () => {
    for (const f of INTAKE_FILES) expect(code(read(f)), f).not.toMatch(/contraindication/i);
  });

  it("the retention path never names converted_appointment_id (it is NULL on every row)", () => {
    for (const f of INTAKE_FILES) expect(code(read(f)), f).not.toContain("converted_appointment_id");
  });

  it("the only log line is the retention count; the reads and the views log nothing", () => {
    const consoleCalls = (f: string) => (code(read(f)).match(/console\.\w+\(/g) ?? []).length;
    expect(consoleCalls("lib/guest-intake/retention.ts")).toBe(1);
    for (const f of INTAKE_FILES.filter((x) => x !== "lib/guest-intake/retention.ts")) {
      expect(consoleCalls(f), f).toBe(0);
    }
    // The one line is built from the prefix and two counts, and nothing else.
    expect(code(read("lib/guest-intake/retention.ts"))).toMatch(
      /log\(`\$\{RETENTION_LOG_PREFIX\} tenants=\$\{tenantIds\.length\} purged=\$\{purged\}`\)/,
    );
  });

  it("nothing a client component reaches imports the database AT RUNTIME (the browser build)", () => {
    // A type-only import is erased at compile time; any other import of
    // @osteojp/db pulls the postgres driver into the browser bundle.
    const RUNTIME_DB_IMPORT = /import\s+(?!type\b)[^;]*?from\s+["']@osteojp\/db["']/;
    for (const f of ["app/notificacoes/guest-requests-queue.tsx", "components/guest-intake-answers.tsx", "lib/guest-intake/view.ts"]) {
      const src = code(read(f));
      expect(src, f).not.toMatch(RUNTIME_DB_IMPORT);
      expect(src, f).not.toContain("guest-intake/queries");
    }
    // Negative controls: the matcher fires on a real runtime import, and not on a type import.
    expect(code(read("lib/guest-intake/queries.ts"))).toMatch(RUNTIME_DB_IMPORT);
    expect('import type { GuestIntakeRecord } from "@osteojp/db";').not.toMatch(RUNTIME_DB_IMPORT);
  });

  it("the retention cron is registered on the served endpoint, daily, in Lisbon", async () => {
    const route = code(read("app/api/inngest/route.ts"));
    expect(route).toMatch(/functions:\s*\[\.\.\.functions,\s*purgeExpiredGuestIntakesDaily\]/);
    const { GUEST_INTAKE_RETENTION_CRON } = await import("./inngest/retention");
    expect(GUEST_INTAKE_RETENTION_CRON).toMatch(/^TZ=Europe\/Lisbon \d{1,2} \d{1,2} \* \* \*$/);
  });
});
