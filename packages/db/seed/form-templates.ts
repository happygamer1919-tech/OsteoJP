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

export type LoadAction = "inserted" | "updated" | "unchanged" | "skipped";

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
    const parsed = await readJson(join(dir, file), file);
    const classified = classifySeed(parsed, file);

    if (classified.kind === "wrapper") {
      // Schema-less pointer-wrapper (x-form-ref): a therapy type that reuses
      // another template's form. NOT a template — skip cleanly, do not upsert.
      results.push({
        file,
        key: classified.key,
        version: classified.version,
        action: "skipped",
      });
      log(
        `skipped   ${classified.key} -> ${classified.formRef} (x-form-ref wrapper, ${file})`,
      );
      continue;
    }

    const seed = classified.seed;
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

async function readJson(path: string, file: string): Promise<unknown> {
  const raw = await readFile(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${file}: invalid JSON — ${(err as Error).message}`);
  }
}

/** Either a real template (carries `schema`) or a schema-less pointer-wrapper. */
type ClassifiedSeed =
  | { kind: "template"; seed: FormTemplateSeed }
  | { kind: "wrapper"; key: string; version: number; formRef: string };

/**
 * A pointer-wrapper declares `x-form-ref` (a non-empty string) and carries NO
 * `schema` of its own — it reuses another template's form (e.g. the massagem /
 * pilates / rpg therapy types -> "physiotherapy"). These are NOT templates and
 * must be skipped by the seeder, not aborted on. A file carrying BOTH a `schema`
 * and an `x-form-ref` is treated as a template (schema wins); a file with
 * neither falls through to validateSeed and errors as before.
 */
function classifySeed(value: unknown, file: string): ClassifiedSeed {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${file}: top-level JSON must be an object`);
  }
  const v = value as Record<string, unknown>;

  const formRef = v["x-form-ref"];
  const hasSchema = v.schema !== undefined && v.schema !== null;
  if (typeof formRef === "string" && formRef.trim().length > 0 && !hasSchema) {
    // Validate just enough to make the skip intentional (clean errors, not a
    // silent swallow of a typo'd wrapper).
    if (typeof v.key !== "string" || v.key.trim().length === 0) {
      throw new Error(`${file}: pointer-wrapper \`key\` must be a non-empty string`);
    }
    if (
      typeof v.version !== "number" ||
      !Number.isInteger(v.version) ||
      v.version < 1
    ) {
      throw new Error(`${file}: pointer-wrapper \`version\` must be a positive integer`);
    }
    return { kind: "wrapper", key: v.key, version: v.version, formRef };
  }

  return { kind: "template", seed: validateSeed(v, file) };
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

/**
 * Structural equality for the seed's title/schema vs the stored jsonb. Must be
 * ORDER-INDEPENDENT on object keys: the `schema`/`title` columns are jsonb, and
 * Postgres normalizes object-key order (length, then bytewise), so a naive
 * `JSON.stringify` comparison would report a spurious "updated" on every re-run for
 * any human-authored seed file (its key order never matches jsonb's). ARRAY order is
 * preserved (it is semantically meaningful — e.g. W5-27 `x-order`, `required`, enum
 * lists), so a genuine reordering of those still registers as a real change.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

function canonicalJson(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(obj)
          .sort()
          .map((k) => [k, normalize(obj[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(normalize(value));
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
      { inserted: 0, updated: 0, unchanged: 0, skipped: 0 },
    );
    console.log(
      `[seed:form-templates] done — inserted=${counts.inserted} ` +
        `updated=${counts.updated} unchanged=${counts.unchanged} ` +
        `skipped=${counts.skipped}`,
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
