/**
 * ficha-groups.db.test.ts: THE REGISTOS TAB'S GROUPED READ AGAINST REAL ROWS AND RLS.
 *
 * EPI-01a. `listFichaRecords` decides two things the page then trusts: WHO sees
 * which registos (the same reach as listRecords) and WHICH episodes are imported
 * (the import ledger, read under the viewer's tenant RLS). Both are properties
 * of the database, so this suite runs the real statements, as the real
 * principals, through the real entry point, and then groups the result.
 *
 * THE ARMS:
 *   - the therapist who registered the patient reads every registo, ordered by
 *     the clinical date, each with its episode;
 *   - three importer-shape episodes (ledger entity_type 'clinical_episode') read
 *     as imported, and group ONE group per specialty (Q1 (a)); a later version
 *     stays in its record's group;
 *   - an app episode (no ledger row) and a registo with no episode do not;
 *   - a ledger row of ANOTHER entity type naming an episode does not count, and
 *     another tenant's ledger row naming this tenant's episode does not count
 *     (RLS), each with a control read proving the row is really there;
 *   - the excerpt is read out of `data` by key;
 *   - a therapist with no relation to the patient reads nothing, and reception
 *     is refused before any read.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL, like every suite beside it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { RequestContext } from "@osteojp/auth";
import { groupForFicha } from "./ficha-groups-core";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("listFichaRecords under real RLS", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let listFichaRecords: typeof import("./ficha-groups").listFichaRecords;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const clinic = randomUUID();
  const owner = randomUUID();
  const therapistTreating = randomUUID(); // registers the patient, so sees them
  const therapistUnrelated = randomUUID(); // no relation to the patient
  const patient = randomUUID();

  const epOsteo1 = randomUUID();
  const epOsteo2 = randomUUID();
  const epFisio = randomUUID();
  const epApp = randomUUID();
  const epWrongType = randomUUID(); // a ledger row names it, but as a clinical_record
  const epForeign = randomUUID(); // only another tenant's ledger names it

  const rOsteo1 = randomUUID();
  const rOsteo1v2 = randomUUID();
  const rOsteo2 = randomUUID();
  const rFisio = randomUUID();
  const rApp = randomUUID();
  const rFree = randomUUID();
  const rWrongType = randomUUID();
  const rForeign = randomUUID();

  const ctx = (userId: string, role: RequestContext["role"]): RequestContext => ({
    tenantId: tenant,
    role,
    userId,
  });

  const episodeRow = (id: string, title: string, status: "open" | "closed") =>
    raw`insert into clinical_episodes (id, tenant_id, patient_id, title, status)
        values (${id}::uuid, ${tenant}::uuid, ${patient}::uuid, ${title}, ${status}::episode_status)`;

  const recordRow = (
    id: string,
    opts: { episode?: string | null; at: string; data: Record<string, unknown>; supersedes?: string; version?: number },
  ) =>
    raw`insert into clinical_records
          (id, tenant_id, patient_id, episode_id, form_template_id, source, status, version,
           supersedes_id, created_at, data)
        values (${id}::uuid, ${tenant}::uuid, ${patient}::uuid, ${opts.episode ?? null}::uuid, null,
                'manual'::record_source, 'draft', ${opts.version ?? 1}, ${opts.supersedes ?? null}::uuid,
                ${opts.at}::timestamptz, ${JSON.stringify(opts.data)}::jsonb)`;

  let ledgerSeq = 0;
  const ledgerRow = (
    tenantId: string,
    entityType: "clinical_episode" | "clinical_record",
    importedEntityId: string,
  ) =>
    raw`insert into migration_staging_rows
          (tenant_id, batch_id, source_system, entity_type, source_id, raw, status, imported_entity_id)
        values (${tenantId}::uuid, ${tenantId}::uuid, 'fisiozero', ${entityType}::migration_entity_type,
                ${`ficha-${++ledgerSeq}`}, '{}'::jsonb, 'imported', ${importedEntityId}::uuid)`;

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ listFichaRecords } = await import("./ficha-groups"));

    for (const [id, slug] of [
      [tenant, "ficha"],
      [otherTenant, "ficha-other"],
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
      [therapistUnrelated, "unrelated"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${`${label}-${id.slice(0, 8)}@example.test`}, ${label})`,
      );
    }
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
          values (${patient}::uuid, ${tenant}::uuid, 'Paciente Ficha Inventada', ${clinic}::uuid,
                  ${therapistTreating}::uuid)`,
    );

    await db.execute(episodeRow(epOsteo1, "Osteopatia", "closed"));
    await db.execute(episodeRow(epOsteo2, "Osteopatia", "closed"));
    await db.execute(episodeRow(epFisio, "Fisioterapia", "closed"));
    await db.execute(episodeRow(epApp, "Episódio (01/09/2026)", "open"));
    await db.execute(episodeRow(epWrongType, "Osteopatia", "closed"));
    await db.execute(episodeRow(epForeign, "Fisioterapia", "closed"));
    for (const ep of [epOsteo1, epOsteo2, epFisio]) await db.execute(ledgerRow(tenant, "clinical_episode", ep));
    await db.execute(ledgerRow(tenant, "clinical_record", epWrongType));
    await db.execute(ledgerRow(otherTenant, "clinical_episode", epForeign));

    await db.execute(recordRow(rOsteo1, { episode: epOsteo1, at: "2023-03-12T00:00:00Z", data: { motivos: "Cervicalgia" } }));
    await db.execute(
      recordRow(rOsteo1v2, {
        episode: epOsteo1,
        at: "2023-03-13T00:00:00Z",
        data: { motivos: "Cervicalgia" },
        supersedes: rOsteo1,
        version: 2,
      }),
    );
    await db.execute(recordRow(rOsteo2, { episode: epOsteo2, at: "2025-01-20T00:00:00Z", data: { motivos: "Lombalgia" } }));
    await db.execute(recordRow(rFisio, { episode: epFisio, at: "2024-09-05T23:00:00Z", data: { queixas: "Ombro" } }));
    await db.execute(recordRow(rApp, { episode: epApp, at: "2026-09-01T09:00:00Z", data: { consultation_reason: "Dor" } }));
    await db.execute(recordRow(rFree, { at: "2026-09-15T09:00:00Z", data: { diagnostico: "Tendinite" } }));
    await db.execute(recordRow(rWrongType, { episode: epWrongType, at: "2022-01-01T00:00:00Z", data: {} }));
    await db.execute(recordRow(rForeign, { episode: epForeign, at: "2022-02-01T00:00:00Z", data: {} }));
  }, 60_000);

  /** Every delete is attempted and the first failure re-raised. FK order. */
  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from migration_staging_rows where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from clinical_records where tenant_id = ${tenant}::uuid`,
      raw`delete from clinical_episodes where tenant_id = ${tenant}::uuid`,
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

  it("the treating therapist reads every registo, by the clinical date, with its episode and excerpt", async () => {
    const rows = await listFichaRecords(ctx(therapistTreating, "therapist"), { patientId: patient });
    expect(rows.map((r) => r.id)).toEqual([rWrongType, rForeign, rOsteo1, rOsteo1v2, rFisio, rOsteo2, rApp, rFree]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[rOsteo1]!.excerpt).toBe("Cervicalgia");
    expect(byId[rFisio]!.excerpt).toBe("Ombro");
    expect(byId[rApp]!.excerpt).toBe("Dor");
    expect(byId[rFree]!.excerpt).toBe("Tendinite");
    expect(byId[rFree]!.episodeId).toBeNull();
    expect(byId[rOsteo1v2]!.supersedesId).toBe(rOsteo1);
  });

  it("an episode the ledger names as a clinical_episode is imported; an app episode is not", async () => {
    const rows = await listFichaRecords(ctx(therapistTreating, "therapist"), { patientId: patient });
    const imported = Object.fromEntries(rows.map((r) => [r.id, r.episodeImported]));
    expect(imported[rOsteo1]).toBe(true);
    expect(imported[rOsteo1v2]).toBe(true);
    expect(imported[rOsteo2]).toBe(true);
    expect(imported[rFisio]).toBe(true);
    expect(imported[rApp]).toBe(false);
    expect(imported[rFree]).toBe(false);
  });

  it("a ledger row of another entity type naming an episode does not count", async () => {
    const [{ n }] = (await db.execute(
      raw`select count(*)::int as n from migration_staging_rows
          where imported_entity_id = ${epWrongType}::uuid and entity_type = 'clinical_record'`,
    )) as unknown as [{ n: number }];
    expect(n).toBe(1); // the row is really there
    const rows = await listFichaRecords(ctx(therapistTreating, "therapist"), { patientId: patient });
    expect(rows.find((r) => r.id === rWrongType)!.episodeImported).toBe(false);
  });

  it("another tenant's ledger row naming this tenant's episode does not count (RLS)", async () => {
    const [{ n }] = (await db.execute(
      raw`select count(*)::int as n from migration_staging_rows
          where imported_entity_id = ${epForeign}::uuid and tenant_id = ${otherTenant}::uuid`,
    )) as unknown as [{ n: number }];
    expect(n).toBe(1); // the row exists; only the viewer's tenant scope hides it
    const rows = await listFichaRecords(ctx(therapistTreating, "therapist"), { patientId: patient });
    expect(rows.find((r) => r.id === rForeign)!.episodeImported).toBe(false);
  });

  it("the groups: one per specialty for the imported history (Q1 (a)), the app episode, then 'none'", async () => {
    const rows = await listFichaRecords(ctx(therapistTreating, "therapist"), { patientId: patient });
    const groups = groupForFicha(rows);
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.records.map((r) => r.id)]));
    expect(byKey["imported:Osteopatia"]).toEqual([rOsteo1, rOsteo1v2, rOsteo2]);
    expect(byKey["imported:Fisioterapia"]).toEqual([rFisio]);
    expect(byKey[`episode:${epApp}`]).toEqual([rApp]);
    expect(byKey["none"]).toEqual([rFree]);
    expect(groups[groups.length - 1]!.key).toBe("none");
    // Every registo the read returned is in exactly one group.
    expect(groups.flatMap((g) => g.records.map((r) => r.id)).sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it("the owner reads the same registos as the treating therapist", async () => {
    const asOwner = await listFichaRecords(ctx(owner, "owner"), { patientId: patient });
    const asTherapist = await listFichaRecords(ctx(therapistTreating, "therapist"), { patientId: patient });
    expect(asOwner.map((r) => r.id)).toEqual(asTherapist.map((r) => r.id));
  });

  it("a therapist with no relation to the patient reads nothing", async () => {
    await expect(listFichaRecords(ctx(therapistUnrelated, "therapist"), { patientId: patient })).resolves.toEqual([]);
  });

  it("reception is refused before any read", async () => {
    await expect(listFichaRecords(ctx(owner, "reception"), { patientId: patient })).rejects.toThrow();
  });
});
