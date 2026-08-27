// What `runEntrypoint` hands to the two things it constructs: the ADAPTER and
// the PIPELINE. Both were wrong at once and each hid the other.
//
// NOT DB-GATED. Everything here is pure, except `livePipeline`, whose only
// impure act is the `withTenantContext` call this file intercepts to read the
// claims it passes. The transaction itself is exercised by the MIG-04 rehearsal
// against a real non-prod project.
//
// NO FIXTURE IS A REAL ROW. CLAUDE.md, "Patient data isolation": every CSV
// below is written in this file, from invented values.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test, vi } from "vitest";

// HOISTED, because `vi.mock`'s factory is hoisted above every import and a
// plain top-level `const` would not exist yet when it runs.
const { seenClaims } = vi.hoisted(() => ({ seenClaims: [] as unknown[] }));

// The ONE impure seam. `livePipeline` opens every phase through
// `withTenantContext`, and the claims it passes are the thing under test - so
// the transaction is replaced and the claims are recorded. Nothing else in the
// module is stubbed.
vi.mock("../src/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/client")>();
  return {
    ...actual,
    withTenantContext: async (claims: unknown) => {
      seenClaims.push(claims);
      return [];
    },
  };
});

import { buildResolvers, livePipeline, stripReadme } from "../scripts/import-core";
import { adaptFisiozeroDelivery } from "../src/migration/sources/fisiozero";

const IMPORT_CORE = path.join(import.meta.dirname, "../scripts/import-core.ts");

const runner = async () =>
  (await import(
    pathToFileURL(
      path.resolve(import.meta.dirname, "../../../scripts/import/run-import.mjs"),
    ).href
  )) as {
    stripToNormalize(config: unknown): { config: { serviceKeyByType?: Record<string, string> } };
  };

/* ====================================================================== */
/* B1: THE ADAPTER IS FED THE STRIPPED MAP                                 */
/* ====================================================================== */

const TENANT = "11111111-1111-4111-8111-111111111111";

/** The config as an operator fills it: `Diversos` left on its sentinel. */
const RAW_CONFIG = {
  tenantId: TENANT,
  location: {
    kind: "fixed",
    locationKey: "linda-a-velha",
    knownLocations: { "linda-a-velha": "22222222-2222-2222-2222-222222222222" },
  },
  practitionerKeyByName: { "Dr Sintetico": "44444444-4444-4444-4444-444444444444" },
  serviceKeyByType: { Osteopatia: "55555555-5555-5555-5555-555555555555", Diversos: "TO_NORMALIZE" },
};

const PAC =
  "id_paciente,nome_completo,numero_paciente,data_nascimento,sexo,nif,email,telefone,morada," +
  "codigo_postal,localidade,clinica,seguro_saude,numero_apolice,observacoes,data_criacao,FICHEIRO\n" +
  "FZ1,Ana Sintetica,4001,1980-05-04,F,100000001,a@example.pt,+351900000001,Rua A,1000-001," +
  "Lisboa,Linda-a-Velha,,,nota,2026-08-01 10:00:00,\n";

/** One appointment on the sentinel service, and one on a real one. */
const MARC =
  "id_paciente,inicio,fim,terapeuta,clinica,tipo_servico,estado,observacoes\n" +
  "FZ1,2026-07-15 09:00:00,2026-07-15 10:00:00,Dr Sintetico,Linda-a-Velha,Diversos,realizada,\n" +
  "FZ1,2026-07-16 09:00:00,2026-07-16 10:00:00,Dr Sintetico,Linda-a-Velha,Osteopatia,realizada,\n";

const adaptWith = (serviceKeyByType: Record<string, string>) =>
  adaptFisiozeroDelivery(
    { pacientes: PAC, marcacoes: MARC },
    {
      tenantId: TENANT,
      location: { kind: "fixed", locationKey: "22222222-2222-2222-2222-222222222222" },
      practitionerKeyByName: stripReadme(RAW_CONFIG.practitionerKeyByName),
      serviceKeyByType,
      now: new Date("2026-08-26T12:00:00.000Z"),
    },
  );

const serviceKeysOf = (r: ReturnType<typeof adaptFisiozeroDelivery>) =>
  r.records
    .filter((x) => x.entityType === "appointment")
    .map((x) => (x.record.data as unknown as { serviceKey: string | null }).serviceKey);

/**
 * upsert.ts:364-366, reproduced as the predicate it is. This is the throw the
 * whole section is about: a serviceKey with no resolver entry becomes
 * `unresolved_reference`, which is a FAILED staging row, not a warning.
 */
const wouldThrowUnresolvedServiceKey = (
  serviceKey: string | null,
  resolvers: { serviceIdByKey?: Record<string, string> },
) => {
  const serviceId = serviceKey ? (resolvers.serviceIdByKey?.[serviceKey] ?? null) : null;
  return Boolean(serviceKey && !serviceId);
};

describe("the TO_NORMALIZE sentinel reaches neither the adapter nor the database", () => {
  test("the stripped map leaves the Diversos row with serviceKey null", async () => {
    // `appointments.service_id` is NULLABLE, so "no service" is a row the
    // schema accepts. The sentinel is not a service and must not become one.
    const effective = (await runner()).stripToNormalize(RAW_CONFIG).config;
    const keys = serviceKeysOf(adaptWith(stripReadme(effective.serviceKeyByType)));
    expect(keys).toEqual([null, "55555555-5555-5555-5555-555555555555"]);
  });

  test("and it therefore raises NO unresolved_reference at import", async () => {
    const effective = (await runner()).stripToNormalize(RAW_CONFIG).config;
    const resolvers = buildResolvers(effective);
    // The pipeline resolvers are built from the SAME stripped config, so the
    // sentinel is absent from both sides rather than absent from one.
    expect(Object.keys(resolvers.serviceIdByKey ?? {})).not.toContain("TO_NORMALIZE");
    for (const k of serviceKeysOf(adaptWith(stripReadme(effective.serviceKeyByType)))) {
      expect(wouldThrowUnresolvedServiceKey(k, resolvers)).toBe(false);
    }
  });

  test("THE NEGATIVE CONTROL: the RAW map is what raised it, one row at a time", async () => {
    // B6 stripped the sentinel out of the RESOLVERS and left it in the map the
    // adapter reads. The uuid crash stopped and `unresolved("serviceKey")`
    // took its place - the same 61 Diversos appointments lost, one layer
    // further in. Without this control, the fix above passes either way.
    const effective = (await runner()).stripToNormalize(RAW_CONFIG).config;
    const resolvers = buildResolvers(effective);
    const keys = serviceKeysOf(adaptWith(stripReadme(RAW_CONFIG.serviceKeyByType)));
    expect(keys[0]).toBe("TO_NORMALIZE");
    expect(wouldThrowUnresolvedServiceKey(keys[0]!, resolvers)).toBe(true);
  });

  test("the wiring: import-core feeds the adapter `effective`, not `config`", () => {
    // The helper working and the helper being USED are different facts - the
    // lesson run-import.mjs records in its own `effectiveConfig` comment.
    const src = fs.readFileSync(IMPORT_CORE, "utf8");
    expect(src).toContain("serviceKeyByType: stripReadme(effective.serviceKeyByType)");
    expect(src).not.toContain("serviceKeyByType: stripReadme(config.serviceKeyByType)");
    // ...and `effective` is computed BEFORE the adapter, not after it.
    expect(src.indexOf("const effective = runner.stripToNormalize(config).config;")).toBeLessThan(
      src.indexOf("adaptFisiozeroDelivery("),
    );
  });
});

/* ====================================================================== */
/* B2: THE PIPELINE PRINCIPAL                                              */
/* ====================================================================== */

describe("the principal livePipeline runs every phase as", () => {
  test("user_role is owner - in-tenant, and able to write clinical data", async () => {
    // Migration 0045 (owner ruling R16) removed the admin WRITE policy on
    // clinical_records. As `admin` this pipeline imports patients and
    // appointments and then fails EVERY clinical_record on RLS - which is what
    // it did. `owner` is all-in-tenant and can write them.
    seenClaims.length = 0;
    const batchId = "1e4ea5a1-0000-4000-8000-000000000001";
    const p = livePipeline(TENANT, batchId, buildResolvers(RAW_CONFIG), TENANT);

    await p.existingPatientNumbers();
    await p.reconcile();

    expect(seenClaims).toHaveLength(2);
    for (const claims of seenClaims) {
      // TENANT-SCOPED, and that is the half a service_role principal would
      // lose: withTenantContext is what makes the rehearsal prove the tenant
      // policies rather than only that the SQL is well formed.
      expect(claims).toEqual({ tenant_id: TENANT, user_role: "owner", sub: TENANT });
    }
  });

  test("and it is not admin anywhere in the file", () => {
    const src = fs.readFileSync(IMPORT_CORE, "utf8");
    expect(src).not.toContain('user_role: "admin"');
    expect(src).toContain('user_role: "owner"');
  });
});
