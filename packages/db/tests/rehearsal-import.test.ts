// The MIG-04 rehearsal wiring: the live entrypoint's pure parts and the
// standalone production-ref guard.
//
// NOT DB-GATED, deliberately. Every function under test here is pure or
// filesystem-only - the transaction-opening half (`livePipeline`) is exercised
// by the rehearsal itself against a real non-prod project, which is the whole
// point of the card and cannot be faked into a unit test.
//
// NO FIXTURE IS A REAL ROW. CLAUDE.md, "Patient data isolation": every CSV
// below is generated in this file.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { scanEnv } from "../scripts/assert-not-prod";
import {
  attachmentMapping,
  buildResolvers,
  isUuid,
  locationResolution,
  readCheckpoint,
  readDelivery,
} from "../scripts/rehearsal-import";
import { PROD_REFS } from "../seed/seed-guard";
import type { FisiozeroAdapterResult } from "../src/migration/sources/fisiozero";

const PROD_REF = "dfotoodqvmjhbdcxyaxf";
const FAKE_REF = "abcdefghijklmnopqrst";
const pooler = (ref: string) =>
  `postgresql://postgres.${ref}:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;

/* ====================================================================== */
/* THE GUARD                                                               */
/* ====================================================================== */

describe("the production-ref guard", () => {
  test("the blocklist is IMPORTED from seed-guard, not restated", () => {
    // The guard's whole reason for existing over a grep: one blocklist. If this
    // ever needs its own copy, SEC-seed-guard-prod-blocklist happens again.
    expect(PROD_REFS).toContain(PROD_REF);
    const src = fs.readFileSync(
      path.join(import.meta.dirname, "../scripts/assert-not-prod.ts"),
      "utf8",
    );
    expect(src).toMatch(/import \{ PROD_REFS, parseProjectRef \} from "\.\.\/seed\/seed-guard"/);
    // No ref literal of its own anywhere in the file.
    for (const ref of PROD_REFS) expect(src).not.toContain(ref);
  });

  test("a production ref in DATABASE_URL is found", () => {
    const { findings } = scanEnv({ DATABASE_URL: pooler(PROD_REF) });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ name: "DATABASE_URL", ref: PROD_REF, how: "parsed" });
  });

  test("a production ref reachable ONLY through SUPABASE_URL is still found", () => {
    // THE ARM THAT MATTERS MOST. `parseProjectRef` reads the two POSTGRES forms
    // and yields null for `https://<ref>.supabase.co`, which is the Storage
    // endpoint the byte-copy job writes through. A database-only guard passes
    // this shell and the attachments land in the live clinic bucket.
    const { findings } = scanEnv({
      DATABASE_URL: pooler(FAKE_REF),
      SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ name: "SUPABASE_URL", how: "substring" });
  });

  test("the RETIRED prod ref is refused too, not only the live one", () => {
    // Retired is a reason to blocklist, not to omit: a stale connection string
    // in an old env file still points there and nobody watches that project.
    const retired = PROD_REFS.find((r) => r !== PROD_REF);
    expect(retired).toBeTruthy();
    expect(scanEnv({ DATABASE_URL: pooler(retired!) }).findings).toHaveLength(1);
  });

  test("DATABASE_URL_DEV is checked, because seed-guard PREFERS it", () => {
    expect(scanEnv({ DATABASE_URL_DEV: pooler(PROD_REF) }).findings).toHaveLength(1);
  });

  test("a clean non-prod shell yields no finding, and reports the ref it saw", () => {
    const { present, findings } = scanEnv({
      DATABASE_URL: pooler(FAKE_REF),
      SUPABASE_URL: `https://${FAKE_REF}.supabase.co`,
    });
    expect(findings).toHaveLength(0);
    expect(present.map((p) => p.name)).toEqual(["DATABASE_URL", "SUPABASE_URL"]);
    expect(present[0]!.ref).toBe(FAKE_REF);
  });

  test("an EMPTY environment presents nothing, which the CLI turns into a refusal", () => {
    // §1.3: a guard that passes when it examined nothing reports the harmless
    // case over an unknown one. `present.length === 0` is the signal the CLI
    // exits 1 on; this pins the signal.
    expect(scanEnv({}).present).toHaveLength(0);
  });
});

/* ====================================================================== */
/* CONFIG -> ADAPTER                                                       */
/* ====================================================================== */

const CONFIG = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  location: {
    kind: "fixed",
    locationKey: "linda-a-velha",
    knownLocations: {
      _README: ["ignored"] as unknown as string,
      "linda-a-velha": "22222222-2222-2222-2222-222222222222",
      "castelo-branco": "33333333-3333-3333-3333-333333333333",
    },
  },
  practitionerKeyByName: { Jp: "44444444-4444-4444-4444-444444444444" },
  serviceKeyByType: { Tratamento: "55555555-5555-5555-5555-555555555555" },
};

describe("the mapping config becomes adapter options", () => {
  test("locationKey is RESOLVED through knownLocations, not passed through", () => {
    // Passing the menu key through emits "linda-a-velha" as the location key and
    // then fails in upsert.ts with unresolved("locationKey") - AFTER staging,
    // which is the late failure the placeholder check exists to prevent.
    const r = locationResolution(CONFIG);
    expect(r).toEqual({ kind: "fixed", locationKey: "22222222-2222-2222-2222-222222222222" });
  });

  test("a locationKey with no knownLocations entry THROWS rather than defaulting", () => {
    expect(() =>
      locationResolution({ ...CONFIG, location: { ...CONFIG.location, locationKey: "montemor" } }),
    ).toThrow(/no entry in location.knownLocations/);
  });

  test("resolvers are identity maps over the config VALUES", () => {
    // The config collapses key->uuid into one step, so the key the adapter emits
    // IS the uuid; upsert.ts still looks every key up and throws on a miss.
    const r = buildResolvers(CONFIG);
    expect(r.practitionerIdByKey).toEqual({
      "44444444-4444-4444-4444-444444444444": "44444444-4444-4444-4444-444444444444",
    });
    expect(r.locationIdByKey["22222222-2222-2222-2222-222222222222"]).toBe(
      "22222222-2222-2222-2222-222222222222",
    );
    expect(r.serviceIdByKey!["55555555-5555-5555-5555-555555555555"]).toBeTruthy();
  });

  test("every location in knownLocations resolves, not only the chosen one", () => {
    // A patient row can only carry the run's fixed location, but the resolver
    // map is built once and a missing entry throws mid-import rather than up
    // front. Both clinics belong in it.
    expect(Object.keys(buildResolvers(CONFIG).locationIdByKey)).toHaveLength(2);
  });

  test("_README keys never reach a resolver map", () => {
    // The template documents itself with `_README` arrays. One leaking into a
    // resolver would be a key that resolves to a documentation string.
    for (const k of Object.keys(buildResolvers(CONFIG).locationIdByKey)) {
      expect(k.startsWith("_")).toBe(false);
    }
  });
});

/* ====================================================================== */
/* THE DELIVERY ON DISK                                                    */
/* ====================================================================== */

describe("reading a delivery directory", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rehearsal-"));
    // A UTF-8 BOM on pacientes.csv, deliberately: a real vendor export carries
    // one and `readFileSync(..., "utf8")` leaves it in the string.
    fs.writeFileSync(path.join(dir, "pacientes.csv"), "﻿id_paciente,nome_completo\nP1,Nome Sintetico\n");
    fs.writeFileSync(path.join(dir, "marcacoes.csv"), "id_paciente,inicio\nP1,2026-01-05 10:00:00\n");
    fs.writeFileSync(path.join(dir, "Episodios_Osteopatia.csv"), "tipo,id_paciente\nx,P1\n");
    fs.writeFileSync(path.join(dir, "Episodios_Fisioterapia.csv"), "tipo,id_paciente\nx,P1\n");
    fs.writeFileSync(path.join(dir, "documentos.csv"), "id_documento,id_paciente\nD1,P1\n");
    fs.writeFileSync(path.join(dir, "leia-me.txt"), "not a csv");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("the BOM is stripped, so the first header is not \\ufeffid_paciente", () => {
    expect(readDelivery(dir).pacientes.startsWith("id_paciente")).toBe(true);
  });

  test("every Episodios_<Especialidade>.csv is picked up, sorted, with its filename", () => {
    // The adapter derives specialty FROM THE FILENAME, so the name must survive
    // the read. Sorted so a re-run over the same directory is deterministic.
    expect(readDelivery(dir).episodios.map((e) => e.fileName)).toEqual([
      "Episodios_Fisioterapia.csv",
      "Episodios_Osteopatia.csv",
    ]);
  });

  test("a missing pacientes.csv throws instead of adapting an empty delivery", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "rehearsal-empty-"));
    try {
      expect(() => readDelivery(empty)).toThrow(/pacientes.csv is absent/);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  test("absent optional files are undefined, not empty strings", () => {
    // An empty string is a VALID CSV with no header, which the adapter would
    // read as a file containing zero rows - a delivery missing marcacoes.csv
    // entirely would then import as a clinic with no appointments and no error.
    const only = fs.mkdtempSync(path.join(os.tmpdir(), "rehearsal-only-"));
    try {
      fs.writeFileSync(path.join(only, "pacientes.csv"), "id_paciente\nP1\n");
      const d = readDelivery(only);
      expect(d.marcacoes).toBeUndefined();
      expect(d.documentos).toBeUndefined();
      expect(d.episodios).toEqual([]);
    } finally {
      fs.rmSync(only, { recursive: true, force: true });
    }
  });
});

/* ====================================================================== */
/* THE ATTACHMENT MAPPING - the wire MIG-02 was missing                    */
/* ====================================================================== */

const adapterResult = (records: unknown[]): FisiozeroAdapterResult =>
  ({ records, toReview: [], warnings: [], checks: {} }) as unknown as FisiozeroAdapterResult;

describe("the attachment mapping the byte-copy job consumes", () => {
  test("it is { deliveryFileName: storagePath }, attachments only", () => {
    const m = attachmentMapping(
      adapterResult([
        { entityType: "patient", record: { data: { sourceId: "P1" } } },
        {
          entityType: "attachment",
          record: { data: { fileName: "scan-1.pdf", storagePath: "t/migration/fisiozero/scan-1.pdf" } },
        },
      ]),
    );
    expect(m).toEqual({ "scan-1.pdf": "t/migration/fisiozero/scan-1.pdf" });
  });

  test("an attachment missing either half is omitted rather than half-written", () => {
    // copy-attachments.mjs treats a mapped file absent from the delivery as a
    // FAILURE. An entry whose storagePath is undefined would be written as the
    // string "undefined" and upload bytes to a path nothing references.
    const m = attachmentMapping(
      adapterResult([
        { entityType: "attachment", record: { data: { fileName: "a.pdf" } } },
        { entityType: "attachment", record: { data: { storagePath: "t/b.pdf" } } },
      ]),
    );
    expect(m).toEqual({});
  });
});

/* ====================================================================== */
/* THE CHECKPOINT                                                          */
/* ====================================================================== */

describe("the byte-copy checkpoint the attachment precondition reads", () => {
  test("a missing file yields an EMPTY map, which refuses the run", () => {
    // Absent and empty must be the same finding: attachments.storage_path is
    // NOT NULL, so a row written with no object behind it looks entirely healthy.
    expect(readCheckpoint("/no/such/checkpoint.jsonl").size).toBe(0);
    expect(readCheckpoint(null).size).toBe(0);
  });

  test("a truncated final line is skipped, so its entry reads as un-uploaded", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cp-")), "c.jsonl");
    fs.writeFileSync(
      f,
      '{"storagePath":"t/a.pdf","status":"uploaded"}\n' +
        '{"storagePath":"t/b.pdf","status":"conflict"}\n' +
        '{"storagePath":"t/c.pdf","stat',
    );
    const m = readCheckpoint(f);
    expect(m.get("t/a.pdf")).toEqual({ status: "uploaded" });
    expect(m.get("t/b.pdf")).toEqual({ status: "conflict" });
    // The kill -9 line. Absent, so the run refuses - the safe side.
    expect(m.has("t/c.pdf")).toBe(false);
  });
});

/* ====================================================================== */
/* THE BATCH ID                                                            */
/* ====================================================================== */

describe("the batch id", () => {
  test("a readable label is refused - the column is uuid, not text", () => {
    // migration_staging_rows.batch_id is `uuid NOT NULL` (schema.ts). A label
    // like "rehearsal-fisiozero" is rejected by Postgres at INSERT, in the
    // middle of a staging run, after the connection is open.
    expect(isUuid("rehearsal-fisiozero")).toBe(false);
    expect(isUuid("1e4ea5a1-0000-4000-8000-000000000001")).toBe(true);
  });

  test("the default batch id is FIXED, so a re-run reconciles the same batch", () => {
    // A fresh id per run gives the second --apply an EMPTY batch to reconcile,
    // which reports zero of everything and is indistinguishable from the clean
    // no-op the idempotency step exists to prove.
    const src = fs.readFileSync(
      path.join(import.meta.dirname, "../scripts/rehearsal-import.ts"),
      "utf8",
    );
    const m = src.match(/const REHEARSAL_BATCH_ID = "([^"]+)"/);
    expect(m).toBeTruthy();
    expect(isUuid(m![1]!)).toBe(true);
    expect(src).not.toMatch(/randomUUID|Date\.now\(\)/);
  });
});

/* ====================================================================== */
/* THE CONTRACT WITH run-import.mjs                                        */
/* ====================================================================== */

describe("the runner module this entrypoint declares a type for", () => {
  test("the real .mjs exports exactly the shape RunImportModule claims", async () => {
    // The entrypoint imports run-import.mjs dynamically and casts it, because a
    // .mjs module has no declaration file. The cast is only honest if something
    // checks it, and nothing else does.
    const mod = (await import(
      pathToFileURL(
        path.resolve(import.meta.dirname, "../../../scripts/import/run-import.mjs"),
      ).href
    )) as Record<string, unknown>;
    expect(typeof mod.runImport).toBe("function");
    expect(typeof mod.CONFIRM_PHRASE).toBe("string");
    expect(mod.EXIT).toEqual({ OK: 0, FAILED: 1, BAD_INVOCATION: 2 });
  });

  test("the confirmation phrase is the one CLAUDE.md ratified", async () => {
    const mod = (await import(
      pathToFileURL(
        path.resolve(import.meta.dirname, "../../../scripts/import/run-import.mjs"),
      ).href
    )) as { CONFIRM_PHRASE: string };
    const claudeMd = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../../CLAUDE.md"),
      "utf8",
    );
    expect(mod.CONFIRM_PHRASE).toBe("IMPORT FISIOZERO INTO PRODUCTION");
    expect(claudeMd).toContain(mod.CONFIRM_PHRASE);
  });
});
