/**
 * record-origin.db.test.ts: THE IMPORTER-ORIGIN RULE AGAINST REAL ROWS AND RLS.
 *
 * FICHA-IMPORTED-VIEW. The record page draws "Conteudo importado" only for a
 * record `isImporterSourcedRecord` says the importer wrote. That answer is a
 * property of the DATABASE: a recursive walk over `supersedes_id`, a read of
 * `migration_staging_rows`, and the RLS on both. A stubbed transaction agrees
 * with whatever the code believed, so this suite runs the real statement, as
 * the real principals, through the real entry point.
 *
 * THE ARMS, and why each one is here:
 *
 *   - the complaint's shape (an AI ingestion draft, no template, empty
 *     extraction) is NOT imported;
 *   - an importer record with its ledger row IS, and so are its new versions,
 *     one and two steps down the chain;
 *   - a manual record with no ledger row is not;
 *   - a ledger row of ANOTHER entity type naming the record does not count,
 *     so the entity_type filter is load-bearing;
 *   - another tenant's ledger row naming this tenant's record does not count,
 *     and a control read proves that row really exists, so it is RLS that
 *     refuses it and not a fixture that forgot it;
 *   - the walk's bound: the record exactly SUPERSEDES_WALK_LIMIT deep still
 *     reaches the ledger, one further does not;
 *   - the viewer's own RLS: a therapist who can read a new version but not the
 *     record it supersedes gets FALSE (the neutral side), while the owner gets
 *     TRUE for the same record, which proves the row is there.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL, like every suite beside it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { RequestContext } from "@osteojp/auth";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("isImporterSourcedRecord under real RLS", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let isImporterSourcedRecord: typeof import("./record-origin").isImporterSourcedRecord;
  let LIMIT: number;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const clinic = randomUUID();

  const owner = randomUUID();
  const therapistTreating = randomUUID(); // registers the patient, so sees them
  const therapistAuthorOnly = randomUUID(); // authored one version, sees nothing else

  const patient = randomUUID();

  const aiDraft = randomUUID();
  const imported = randomUUID();
  const version2 = randomUUID();
  const version3 = randomUUID();
  const manual = randomUUID();
  const wrongEntityType = randomUUID();
  const foreignLedger = randomUUID();
  const authorOnlyVersion = randomUUID();

  /** A chain root with a ledger row, then LIMIT versions above it. */
  const chain: string[] = [];

  const ctx = (userId: string, role: RequestContext["role"]): RequestContext => ({
    tenantId: tenant,
    role,
    userId,
  });

  /** Twelve null values: the shape of an empty extraction. */
  const emptyAiData = {
    _aiIngestionRaw: {
      template: "osteopathy",
      _ai_meta: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, null])),
    },
  };

  const recordRow = (
    id: string,
    opts: {
      source?: "manual" | "ai_ingested" | "patient";
      supersedes?: string | null;
      version?: number;
      practitioner?: string | null;
      data?: Record<string, unknown>;
    } = {},
  ) =>
    raw`insert into clinical_records
          (id, tenant_id, patient_id, practitioner_id, form_template_id, source, status,
           version, supersedes_id, data)
        values (${id}::uuid, ${tenant}::uuid, ${patient}::uuid, ${opts.practitioner ?? null}::uuid, null,
                ${opts.source ?? "manual"}::record_source, 'draft', ${opts.version ?? 1},
                ${opts.supersedes ?? null}::uuid, ${JSON.stringify(opts.data ?? { nota: "sintetico" })}::jsonb)`;

  let ledgerSeq = 0;
  const ledgerRow = (
    tenantId: string,
    entityType: "clinical_record" | "attachment",
    importedEntityId: string,
  ) =>
    raw`insert into migration_staging_rows
          (tenant_id, batch_id, source_system, entity_type, source_id, raw, status, imported_entity_id)
        values (${tenantId}::uuid, ${tenantId}::uuid, 'fisiozero', ${entityType}::migration_entity_type,
                ${`origin-${++ledgerSeq}`}, '{}'::jsonb, 'imported', ${importedEntityId}::uuid)`;

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ isImporterSourcedRecord, SUPERSEDES_WALK_LIMIT: LIMIT } = await import("./record-origin"));

    for (const [id, slug] of [
      [tenant, "origin"],
      [otherTenant, "origin-other"],
    ] as const) {
      await db.execute(
        raw`insert into tenants (id, name, slug) values (${id}::uuid, ${slug}, ${`${slug}-${id.slice(0, 8)}`})`,
      );
    }
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${clinic}::uuid, ${tenant}::uuid, 'LV')`,
    );
    for (const [id, label] of [
      [owner, "owner"],
      [therapistTreating, "treating"],
      [therapistAuthorOnly, "author-only"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${`${label}-${id.slice(0, 8)}@example.test`}, ${label})`,
      );
    }
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
          values (${patient}::uuid, ${tenant}::uuid, 'Paciente Origem', ${clinic}::uuid,
                  ${therapistTreating}::uuid)`,
    );

    await db.execute(recordRow(aiDraft, { source: "ai_ingested", data: emptyAiData }));
    await db.execute(recordRow(imported));
    await db.execute(ledgerRow(tenant, "clinical_record", imported));
    await db.execute(recordRow(version2, { supersedes: imported, version: 2 }));
    await db.execute(recordRow(version3, { supersedes: version2, version: 3 }));
    await db.execute(recordRow(manual));
    await db.execute(recordRow(wrongEntityType));
    await db.execute(ledgerRow(tenant, "attachment", wrongEntityType));
    await db.execute(recordRow(foreignLedger));
    await db.execute(ledgerRow(otherTenant, "clinical_record", foreignLedger));
    await db.execute(
      recordRow(authorOnlyVersion, { supersedes: imported, version: 2, practitioner: therapistAuthorOnly }),
    );

    // The bound: chain[0] is imported; chain[k] supersedes chain[k - 1].
    for (let k = 0; k <= LIMIT; k++) chain.push(randomUUID());
    await db.execute(recordRow(chain[0]!));
    await db.execute(ledgerRow(tenant, "clinical_record", chain[0]!));
    for (let k = 1; k <= LIMIT; k++) {
      await db.execute(recordRow(chain[k]!, { supersedes: chain[k - 1]!, version: k + 1 }));
    }
  }, 60_000);

  /**
   * Every delete is attempted and the first failure is re-raised, so a
   * teardown that could not finish is a red suite, not a partial tenant left
   * behind on a long-lived dev database. FK order.
   */
  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from migration_staging_rows where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from clinical_records where tenant_id = ${tenant}::uuid`,
      raw`delete from patients where tenant_id = ${tenant}::uuid`,
      raw`delete from users where tenant_id = ${tenant}::uuid`,
      raw`delete from locations where tenant_id = ${tenant}::uuid`,
      raw`delete from tenants where id in (${tenant}::uuid, ${otherTenant}::uuid)`,
    ];
    let first: unknown = null;
    for (const statement of statements) {
      try {
        await db.execute(statement);
      } catch (err) {
        first ??= err;
      }
    }
    if (first) throw first;
  });

  const asOwner = (id: string) => isImporterSourcedRecord(ctx(owner, "owner"), id);

  it("THE COMPLAINT: an AI ingestion draft with no template and an empty extraction is not imported", async () => {
    await expect(asOwner(aiDraft)).resolves.toBe(false);
  });

  it("an importer record with its ledger row is imported", async () => {
    await expect(asOwner(imported)).resolves.toBe(true);
  });

  it("a new version of it is imported, and so is the version after that", async () => {
    await expect(asOwner(version2)).resolves.toBe(true);
    await expect(asOwner(version3)).resolves.toBe(true);
  });

  it("a manual record with no ledger row is not imported", async () => {
    await expect(asOwner(manual)).resolves.toBe(false);
  });

  it("a ledger row of another entity type naming the record does not count", async () => {
    const [{ n }] = (await db.execute(
      raw`select count(*)::int as n from migration_staging_rows
          where imported_entity_id = ${wrongEntityType}::uuid and entity_type = 'attachment'`,
    )) as unknown as [{ n: number }];
    expect(n).toBe(1); // the row is really there
    await expect(asOwner(wrongEntityType)).resolves.toBe(false);
  });

  it("another tenant's ledger row naming this tenant's record does not count (RLS)", async () => {
    const [{ n }] = (await db.execute(
      raw`select count(*)::int as n from migration_staging_rows
          where imported_entity_id = ${foreignLedger}::uuid and tenant_id = ${otherTenant}::uuid`,
    )) as unknown as [{ n: number }];
    expect(n).toBe(1); // the row exists; only the viewer's tenant scope hides it
    await expect(asOwner(foreignLedger)).resolves.toBe(false);
  });

  it("the walk is bounded: LIMIT records deep still reaches the ledger, one further does not", async () => {
    expect(chain).toHaveLength(LIMIT + 1);
    // chain[LIMIT - 1] walks itself plus LIMIT - 1 predecessors: LIMIT records, root included.
    await expect(asOwner(chain[LIMIT - 1]!)).resolves.toBe(true);
    // chain[LIMIT] would need LIMIT + 1 records to reach the root.
    await expect(asOwner(chain[LIMIT]!)).resolves.toBe(false);
  });

  it("a therapist who treats the patient gets the same answers as the owner", async () => {
    const t = ctx(therapistTreating, "therapist");
    await expect(isImporterSourcedRecord(t, version3)).resolves.toBe(true);
    await expect(isImporterSourcedRecord(t, aiDraft)).resolves.toBe(false);
  });

  it("the walk stays inside the viewer's RLS, and that fails to the neutral side", async () => {
    // The owner reads the whole chain: the version is imported.
    await expect(asOwner(authorOnlyVersion)).resolves.toBe(true);
    // This therapist authored the version (so may read it) but does not see the
    // patient, so the record it supersedes is invisible and the walk stops.
    await expect(
      isImporterSourcedRecord(ctx(therapistAuthorOnly, "therapist"), authorOnlyVersion),
    ).resolves.toBe(false);
  });

  it("a role that cannot read clinical records is refused before any read", async () => {
    await expect(isImporterSourcedRecord(ctx(owner, "reception"), imported)).rejects.toThrow();
  });
});
