// packages/db/seed/form-templates.ts
//
// Idempotent loader for the `form_templates` table. Reads every `*.json`
// under `packages/db/seed/form-templates/` and upserts it into a single
// tenant, keyed on `(tenant_id, key, version)`.
//
// Contract (the JSON shape) is documented in packages/db/seed/README.md.
// Max's relocation PR for the osteopathy + physio drafts matches that shape.
//
// Runs through getDbAdmin (BYPASSRLS, service-role) because seeding executes
// outside an authenticated request context. Targeted at one tenant per
// invocation; run the script once per tenant if you need to fan out.

import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { and, eq } from "drizzle-orm";

import { getDbAdmin } from "../src/client";
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

type Db = ReturnType<typeof getDbAdmin>;

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(HERE, "form-templates");

export type LoadOptions = {
  /** Override the seed directory. Defaults to `seed/form-templates/`. */
  dir?: string;
  /** Replace console logging (defaults to `console.log`). */
  log?: (message: string) => void;
  /** Inject a Db instance (tests). Defaults to `getDbAdmin()`. */
  db?: Db;
};

/**
 * Glob `*.json` under `dir`, validate, and upsert each into `form_templates`
 * for the given tenant. Idempotent: re-running with the same files is a no-op
 * when the row's `title` + `schema` already match what's on disk.
 *
 * Uses the admin (BYPASSRLS) handle — RLS does not gate the write but the
 * loader still passes `tenant_id` explicitly on every row, per architecture
 * rule 3 in CLAUDE.md ("Service-role queries MUST set tenant_id explicitly").
 */
export async function loadFormTemplates(
  tenantId: string,
  options: LoadOptions = {},
): Promise<LoadResult[]> {
  const dir = options.dir ?? DEFAULT_DIR;
  const log = options.log ?? ((m) => console.log(`[seed:form-templates] ${m}`));
  const db = options.db ?? getDbAdmin();

  const files = await listSeedFiles(dir, log);
  if (files.length === 0) return [];

  const results: LoadResult[] = [];
  for (const file of files) {
    const seed = await readSeed(join(dir, file), file);
    const action = await upsertOne(db, tenantId, seed);
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
    throw new Error(`${file}: invalid JSON — ${(err as Error).message}`);
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
  db: Db,
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
/* CLI runner                                                         */
/* ------------------------------------------------------------------ */
//
// Invoked directly:
//   SEED_TENANT_ID=<uuid> DATABASE_URL=<service-role-url> \
//     pnpm dlx tsx packages/db/seed/form-templates.ts
//
// `tsx` runs ephemerally via `dlx`, so it does not need to be a dependency
// of @osteojp/db. The client opens its connection lazily on the first query,
// so importing this file (e.g. for tests) does not touch the network.

async function main(): Promise<void> {
  const tenantId = process.env.SEED_TENANT_ID;
  if (!tenantId) {
    throw new Error(
      "SEED_TENANT_ID is required (uuid of the tenant to seed templates into)",
    );
  }
  // getDbAdmin will throw a precise error if DATABASE_URL is missing.

  const results = await loadFormTemplates(tenantId);
  const counts = results.reduce<Record<LoadAction, number>>(
    (acc, r) => ({ ...acc, [r.action]: acc[r.action] + 1 }),
    { inserted: 0, updated: 0, unchanged: 0 },
  );
  console.log(
    `[seed:form-templates] done — inserted=${counts.inserted} ` +
      `updated=${counts.updated} unchanged=${counts.unchanged}`,
  );
}

const argv1 = process.argv[1] ?? "";
const isDirectInvocation =
  import.meta.url === `file://${argv1}` ||
  argv1.endsWith("form-templates.ts");
if (isDirectInvocation) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(
        `[seed:form-templates] failed: ${(err as Error).message ?? err}`,
      );
      process.exit(1);
    });
}
