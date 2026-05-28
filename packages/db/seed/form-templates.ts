// packages/db/seed/form-templates.ts
//
// Idempotent loader for the `form_templates` table. Reads every `*.json`
// under `packages/db/seed/form-templates/` and upserts it into a single
// tenant, keyed on `(tenant_id, key, version)`.
//
// Contract (the JSON shape) is documented in packages/db/seed/README.md.
// Max's relocation PR for the osteopathy + physio drafts matches that shape.
//
// Runs with service-role credentials (RLS bypass) because seeding executes
// outside an authenticated request context. Targeted at one tenant per
// invocation; run the script once per tenant if you need to fan out.

import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { formTemplates } from "../src/schema";

/* ------------------------------------------------------------------ */
/* Contract                                                           */
/* ------------------------------------------------------------------ */

/**
 * Shape of a single seed file. The wrapper carries the row-level columns;
 * `schema` is the JSON-Schema body that ends up verbatim in
 * `form_templates.schema`. Keep `key` + `version` stable — they are the
 * upsert identity within a tenant.
 */
export type FormTemplateSeed = {
  key: string;
  version: number;
  title: { pt: string; en: string };
  schema: Record<string, unknown>;
};

export type LoadAction = "inserted" | "updated" | "unchanged";

export type LoadResult = {
  file: string;
  key: string;
  version: number;
  action: LoadAction;
};

/* ------------------------------------------------------------------ */
/* Loader                                                             */
/* ------------------------------------------------------------------ */

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(HERE, "form-templates");

// Minimal Drizzle-pg interface — accepts any pg driver (postgres-js, node-pg,
// neon, …) so the loader is not coupled to a specific transport.
export type SeedDb = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type LoadOptions = {
  /** Override the seed directory. Defaults to `seed/form-templates/`. */
  dir?: string;
  /** Replace console logging (defaults to `console.log`). */
  log?: (message: string) => void;
};

/**
 * Glob `*.json` under `dir`, validate, and upsert each into `form_templates`
 * for the given tenant. Idempotent: re-running with the same files is a no-op
 * when the row's `title` + `schema` already match what's on disk.
 */
export async function loadFormTemplates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
  options: LoadOptions = {},
): Promise<LoadResult[]> {
  const dir = options.dir ?? DEFAULT_DIR;
  const log = options.log ?? ((m) => console.log(`[seed:form-templates] ${m}`));

  const files = await listSeedFiles(dir, log);
  if (files.length === 0) return [];

  const results: LoadResult[] = [];
  for (const file of files) {
    const seed = await readSeed(join(dir, file), file);
    const action = await upsertOne(db as SeedDb, tenantId, seed);
    results.push({ file, key: seed.key, version: seed.version, action });
    log(`${action.padEnd(9)} ${seed.key} v${seed.version} (${file})`);
  }
  return results;
}

async function listSeedFiles(
  dir: string,
  log: (m: string) => void,
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      log(`directory not found: ${dir} — nothing to seed`);
      return [];
    }
    throw err;
  }
  const json = entries.filter((f) => f.endsWith(".json")).sort();
  if (json.length === 0) {
    log(`no *.json files in ${dir} — nothing to seed`);
  }
  return json;
}

async function readSeed(path: string, file: string): Promise<FormTemplateSeed> {
  const raw = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `${file}: invalid JSON — ${(err as Error).message}`,
    );
  }
  return validateSeed(parsed, file);
}

function validateSeed(value: unknown, file: string): FormTemplateSeed {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${file}: top-level JSON must be an object`);
  }
  const v = value as Record<string, unknown>;

  if (typeof v.key !== "string" || v.key.trim().length === 0) {
    throw new Error(`${file}: \`key\` must be a non-empty string`);
  }
  if (
    typeof v.version !== "number" ||
    !Number.isInteger(v.version) ||
    v.version < 1
  ) {
    throw new Error(`${file}: \`version\` must be a positive integer`);
  }

  if (typeof v.title !== "object" || v.title === null) {
    throw new Error(`${file}: \`title\` must be { pt: string, en: string }`);
  }
  const t = v.title as Record<string, unknown>;
  if (typeof t.pt !== "string" || typeof t.en !== "string") {
    throw new Error(`${file}: \`title.pt\` and \`title.en\` must be strings`);
  }

  if (
    typeof v.schema !== "object" ||
    v.schema === null ||
    Array.isArray(v.schema)
  ) {
    throw new Error(
      `${file}: \`schema\` must be an object (JSON-Schema body)`,
    );
  }

  return {
    key: v.key,
    version: v.version,
    title: { pt: t.pt, en: t.en },
    schema: v.schema as Record<string, unknown>,
  };
}

async function upsertOne(
  db: SeedDb,
  tenantId: string,
  seed: FormTemplateSeed,
): Promise<LoadAction> {
  const existing = await db
    .select({
      id: formTemplates.id,
      title: formTemplates.title,
      schema: formTemplates.schema,
    })
    .from(formTemplates)
    .where(
      and(
        eq(formTemplates.tenantId, tenantId),
        eq(formTemplates.key, seed.key),
        eq(formTemplates.version, seed.version),
      ),
    )
    .limit(1);

  const current = existing[0];
  if (!current) {
    await db.insert(formTemplates).values({
      tenantId,
      key: seed.key,
      version: seed.version,
      title: seed.title,
      schema: seed.schema,
    });
    return "inserted";
  }

  // Re-running on unchanged content is a no-op (don't bump updated_at).
  if (
    deepEqual(current.title, seed.title) &&
    deepEqual(current.schema, seed.schema)
  ) {
    return "unchanged";
  }

  await db
    .update(formTemplates)
    .set({ title: seed.title, schema: seed.schema })
    .where(eq(formTemplates.id, current.id));
  return "updated";
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ------------------------------------------------------------------ */
/* CLI runner — `pnpm --filter @osteojp/db run seed:form-templates`   */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const tenantId = process.env.SEED_TENANT_ID;
  const databaseUrl = process.env.DATABASE_URL;

  if (!tenantId) {
    throw new Error(
      "SEED_TENANT_ID is required (uuid of the tenant to seed templates into)",
    );
  }
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required (Supabase service-role connection string)",
    );
  }

  // Lazy-load the driver so importing this module as a library does not
  // trigger a connection.
  const [{ default: postgres }, { drizzle }] = await Promise.all([
    import("postgres"),
    import("drizzle-orm/postgres-js"),
  ]);

  const client = postgres(databaseUrl, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    const results = await loadFormTemplates(db, tenantId);
    const counts = results.reduce<Record<LoadAction, number>>(
      (acc, r) => ({ ...acc, [r.action]: acc[r.action] + 1 }),
      { inserted: 0, updated: 0, unchanged: 0 },
    );
    console.log(
      `[seed:form-templates] done — inserted=${counts.inserted} ` +
        `updated=${counts.updated} unchanged=${counts.unchanged}`,
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

// Run when invoked as a script (tsx seed/form-templates.ts), skip on import.
const argv1 = process.argv[1] ?? "";
const isDirectInvocation =
  import.meta.url === `file://${argv1}` ||
  argv1.endsWith("form-templates.ts");
if (isDirectInvocation) {
  main().catch((err: unknown) => {
    console.error(
      `[seed:form-templates] failed: ${(err as Error).message ?? err}`,
    );
    process.exit(1);
  });
}
