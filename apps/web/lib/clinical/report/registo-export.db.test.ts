/**
 * registo-export.db.test.ts: EXPORT-01. WHO THE REGISTO PDF AND THE IMPORTED
 * GROUP'S PDF ANSWER, AGAINST REAL ROWS AND RLS.
 *
 * Whether an export answers is decided by what the caller's own reads return,
 * and that is a property of the database (the tenant boundary and the admin's
 * clinic are RLS; a therapist's reach is the read scope and RLS together). So
 * this suite runs the real statements, as the real principals, through the
 * real entry points: `generateRegistoReportPdf` (what "Transferir PDF" calls),
 * `loadClinicalReportInputs`, `readImportedGroupRecords`,
 * `readImportedGroupExportSelection`, `renderImportedGroupReport`, and the
 * registo page's own read, `getRecordDetail`, beside them.
 *
 * EVERY REGISTO HERE IS A DRAFT, on purpose, as in episode-export.db.test.ts:
 * a finalized registo can never be deleted, so a suite that created one could
 * not remove its own rows. That is also gate G3's first half on real rows: a
 * draft is FOUND by everyone in scope and printed for nobody. What a finalized
 * registo prints is shown from the inputs these reads return, with the status
 * alone changed in memory (the print gate and the layout are pure, and pinned
 * on every status in registo-export.test.ts).
 *
 * "AS IF FINALIZED". A draft is printed for nobody, so on drafts alone a
 * refusal cannot be told from the print gate's. The arms that ask whether the
 * caller's REACH refuses switch `finalize` on, as ficha-export.db.test.ts
 * does: the status alone is then read as "locked", in memory, at the engine's
 * print gate. Every read stays the real one, under the caller's own claims,
 * and no row changes. Each such arm carries a control: a reader in scope is
 * printed the same registos through the same call.
 *
 * THE ARMS:
 *   G1  the owner, an admin of the patient's clinic and the treating therapist
 *       load an imported registo as the page's "imported" view, and its PDF
 *       model lists the fields the screen draws from the same stored row;
 *   G2  each role against a patient outside its ruled scope: the page's read
 *       finds nothing (so the page is a 404 and shows no action) and the
 *       export refuses the same way. A therapist with no relation to the
 *       patient; a therapist who AUTHORED a registo of a patient they may not
 *       open (RLS alone would admit that one: the control proves it); an admin
 *       of another clinic; the owner against another tenant, both ways; and
 *       reception, refused before any read;
 *   G3  a draft is never printed, annulled or not; an annulled registo is
 *       loaded with its annulment, and prints the mark.
 *   The imported group: read as the Registos tab groups it, annulled registos
 *   included, for the same three readers and nobody else. Handed the ids
 *   directly, as if finalized, the group's render and the episode's render
 *   print them for a reader in scope and for no one outside it, the author of
 *   one of those registos included.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL, like every suite beside it.
 */
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({ finalize: false }));

// The engine's print gate, with "as if finalized" (see the header). Off, it is
// the real gate, untouched.
vi.mock("./report-model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./report-model")>();
  return {
    ...actual,
    buildClinicalReportModel: (
      inputs: Parameters<typeof actual.buildClinicalReportModel>[0],
      locale: Parameters<typeof actual.buildClinicalReportModel>[1],
    ) =>
      actual.buildClinicalReportModel(
        h.finalize ? { ...inputs, record: { ...inputs.record, status: "locked" } } : inputs,
        locale,
      ),
  };
});

import { ForbiddenError, toClaims, type RequestContext } from "@osteojp/auth";
import { ImportedRecordPreview } from "@/app/clinical/[id]/imported-record-preview";
import { isClinicalError } from "../errors";
import { drawnLines, screenFields } from "./drawn-lines-test-fixture";
import { renderClinicalReportPdf } from "./pdf";
import { buildClinicalReportModel, RecordNotPrintableError } from "./report-model";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const pt = getStrings("pt");

d("EXPORT-01: the registo PDF and the imported group's PDF under real RLS", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let gen: typeof import("./generate");
  let load: typeof import("./load");
  let group: typeof import("./episode-export");
  let getRecordDetail: typeof import("../records").getRecordDetail;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const clinic = randomUUID();
  const otherClinic = randomUUID();
  const owner = randomUUID();
  const admin = randomUUID(); // assigned to the patient's clinic
  const adminOtherClinic = randomUUID(); // assigned to another clinic of the tenant
  const therapistTreating = randomUUID(); // registers the patient, so may open them
  const therapistUnrelated = randomUUID(); // no relation to the patient
  const therapistAuthor = randomUUID(); // authored ONE registo; neither treats nor created the patient
  const foreignOwner = randomUUID(); // the other tenant's owner
  const patient = randomUUID();
  const foreignPatient = randomUUID();

  const epOsteo1 = randomUUID();
  const epOsteo2 = randomUUID();
  const epOsteo3 = randomUUID();
  const epFisio = randomUUID();
  const epForeign = randomUUID();

  const rOsteo1 = randomUUID(); // imported, Osteopatia, 10 May 2024
  const rOsteo2 = randomUUID(); // imported, Osteopatia, 10 June 2024
  const rOsteoAnnulled = randomUUID(); // imported, Osteopatia, 10 July 2024, an annulment names it
  const rFisio = randomUUID(); // imported, Fisioterapia
  const rNeutral = randomUUID(); // no template, no episode, not imported
  const rAuthored = randomUUID(); // authored by therapistAuthor, no episode, not imported
  const rForeign = randomUUID(); // the other tenant's imported registo

  /** What the importer stores for rOsteo1: vendor column names. Invented text. */
  const IMPORTED = {
    queixas: "Lombalgia inventada",
    motivos: "Texto inventado do motivo",
    "Diagnóstico Fisio": "Diagnostico inventado",
    sessoes: 4,
    escala: { eva: 6 },
    vazio: "",
  };
  const ANNULLED_AT = "2026-09-22T09:00:00Z";

  const ctx = (userId: string, role: RequestContext["role"], tenantId = tenant): RequestContext => ({
    tenantId,
    role,
    userId,
  });

  const READERS = [
    ["the owner", owner, "owner"],
    ["an admin of the patient's clinic", admin, "admin"],
    ["the treating therapist", therapistTreating, "therapist"],
  ] as const;

  /** What an export answers: "printed", or the refusal's code. */
  const answer = async (run: () => Promise<unknown>): Promise<string> => {
    try {
      await run();
    } catch (e) {
      return isClinicalError(e) ? e.code : (e as Error).name;
    }
    return "printed";
  };

  beforeAll(async () => {
    const dbMod = await import("@osteojp/db");
    db = dbMod.getDbAdmin();
    gen = await import("./generate");
    load = await import("./load");
    group = await import("./episode-export");
    ({ getRecordDetail } = await import("../records"));

    for (const [id, slug] of [
      [tenant, "export-01"],
      [otherTenant, "export-01-other"],
    ] as const) {
      await db.execute(
        raw`insert into tenants (id, name, slug) values (${id}::uuid, ${slug}, ${`${slug}-${id.slice(0, 8)}`})`,
      );
    }
    for (const [id, name] of [
      [clinic, "LV"],
      [otherClinic, "CB"],
    ] as const) {
      await db.execute(
        raw`insert into locations (id, tenant_id, name) values (${id}::uuid, ${tenant}::uuid, ${name})`,
      );
    }
    for (const [id, tenantId, label] of [
      [owner, tenant, "owner"],
      [admin, tenant, "admin"],
      [adminOtherClinic, tenant, "admin-other-clinic"],
      [therapistTreating, tenant, "treating"],
      [therapistUnrelated, tenant, "unrelated"],
      [therapistAuthor, tenant, "author"],
      [foreignOwner, otherTenant, "foreign-owner"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenantId}::uuid, ${`${label}-${id.slice(0, 8)}@example.test`}, ${label})`,
      );
    }
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
          values (${patient}::uuid, ${tenant}::uuid, 'Paciente Exportacao Inventado', ${clinic}::uuid,
                  ${therapistTreating}::uuid)`,
    );
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name)
          values (${foreignPatient}::uuid, ${otherTenant}::uuid, 'Paciente Alheio Inventado')`,
    );
    // Each admin is assigned to ONE clinic, and the located appointment is what
    // puts the patient in the first one's (RLS reads an admin's clinical reach
    // from both).
    for (const [userId, locationId] of [
      [admin, clinic],
      [adminOtherClinic, otherClinic],
    ] as const) {
      await db.execute(
        raw`insert into staff_locations (tenant_id, user_id, location_id)
            values (${tenant}::uuid, ${userId}::uuid, ${locationId}::uuid)`,
      );
    }
    await db.execute(
      raw`insert into appointments (tenant_id, patient_id, practitioner_id, location_id,
                                    starts_at, ends_at, status)
          values (${tenant}::uuid, ${patient}::uuid, ${therapistTreating}::uuid, ${clinic}::uuid,
                  '2026-09-01T10:00:00Z'::timestamptz, '2026-09-01T10:45:00Z'::timestamptz,
                  'completed'::appointment_status)`,
    );

    const episode = (id: string, tenantId: string, patientId: string, title: string) =>
      db.execute(
        raw`insert into clinical_episodes (id, tenant_id, patient_id, title, status)
            values (${id}::uuid, ${tenantId}::uuid, ${patientId}::uuid, ${title}, 'closed'::episode_status)`,
      );
    /** The importer's ledger row for one entity it created. */
    const ledger = (tenantId: string, entityType: "clinical_episode" | "clinical_record", entityId: string) =>
      db.execute(
        raw`insert into migration_staging_rows
              (tenant_id, batch_id, source_system, entity_type, source_id, raw, status, imported_entity_id)
            values (${tenantId}::uuid, ${tenantId}::uuid, 'fisiozero', ${entityType}::migration_entity_type,
                    ${`export-01-${entityId}`}, '{}'::jsonb, 'imported', ${entityId}::uuid)`,
      );
    const registo = (
      id: string,
      opts: {
        tenantId?: string;
        patientId?: string;
        episode: string | null;
        at: string;
        practitioner?: string;
        data?: Record<string, unknown>;
      },
    ) =>
      db.execute(
        raw`insert into clinical_records
              (id, tenant_id, patient_id, episode_id, practitioner_id, form_template_id, source, status,
               version, created_at, data)
            values (${id}::uuid, ${opts.tenantId ?? tenant}::uuid, ${opts.patientId ?? patient}::uuid,
                    ${opts.episode}::uuid, ${opts.practitioner ?? null}::uuid, null, 'manual'::record_source,
                    'draft', 1, ${opts.at}::timestamptz,
                    ${JSON.stringify(opts.data ?? { queixas: "Texto inventado" })}::jsonb)`,
      );

    await episode(epOsteo1, tenant, patient, "Osteopatia");
    await episode(epOsteo2, tenant, patient, "Osteopatia");
    await episode(epOsteo3, tenant, patient, "Osteopatia");
    await episode(epFisio, tenant, patient, "Fisioterapia");
    await episode(epForeign, otherTenant, foreignPatient, "Osteopatia");
    for (const id of [epOsteo1, epOsteo2, epOsteo3, epFisio]) await ledger(tenant, "clinical_episode", id);
    await ledger(otherTenant, "clinical_episode", epForeign);

    // Inserted out of date order, so the order asserted below is the read's.
    await registo(rOsteoAnnulled, { episode: epOsteo3, at: "2024-07-10T23:00:00Z" });
    await registo(rOsteo2, { episode: epOsteo2, at: "2024-06-10T23:00:00Z" });
    await registo(rOsteo1, { episode: epOsteo1, at: "2024-05-10T23:00:00Z", data: IMPORTED });
    await registo(rFisio, { episode: epFisio, at: "2024-05-20T23:00:00Z" });
    await registo(rNeutral, { episode: null, at: "2026-09-10T09:00:00Z", data: { nota: "Texto inventado" } });
    await registo(rAuthored, { episode: null, at: "2026-09-12T09:00:00Z", practitioner: therapistAuthor });
    await registo(rForeign, { tenantId: otherTenant, patientId: foreignPatient, episode: epForeign, at: "2024-05-10T23:00:00Z" });
    for (const id of [rOsteo1, rOsteo2, rOsteoAnnulled, rFisio]) await ledger(tenant, "clinical_record", id);
    await ledger(otherTenant, "clinical_record", rForeign);
    await db.execute(
      raw`insert into record_annulments (tenant_id, record_id, annulled_by_user_id, created_at)
          values (${tenant}::uuid, ${rOsteoAnnulled}::uuid, ${owner}::uuid, ${ANNULLED_AT}::timestamptz)`,
    );
  }, 60_000);

  afterEach(() => {
    h.finalize = false;
  });

  /** Every delete is attempted and the first failure re-raised. FK order. */
  afterAll(async () => {
    if (!db) return;
    const both = raw`(${tenant}::uuid, ${otherTenant}::uuid)`;
    const statements = [
      raw`delete from audit_log where tenant_id in ${both}`,
      raw`delete from record_annulments where tenant_id in ${both}`,
      raw`delete from migration_staging_rows where tenant_id in ${both}`,
      raw`delete from clinical_records where tenant_id in ${both}`,
      raw`delete from clinical_episodes where tenant_id in ${both}`,
      raw`delete from appointments where tenant_id in ${both}`,
      raw`delete from patients where tenant_id in ${both}`,
      raw`delete from staff_locations where tenant_id in ${both}`,
      raw`delete from users where tenant_id in ${both}`,
      raw`delete from locations where tenant_id in ${both}`,
      raw`delete from tenants where id in ${both}`,
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

  const OURS = [rOsteo1, rOsteo2, rOsteoAnnulled, rFisio, rNeutral, rAuthored];

  describe("G1: an imported registo, read by whoever may open it", () => {
    it.each(READERS)("%s loads it as the page's IMPORTED view, with the stored content untouched", async (_label, userId, role) => {
      const c = ctx(userId, role);
      const inputs = await load.loadClinicalReportInputs(toClaims(c), rOsteo1, (await gen.registoReadScope(c)).value);
      expect(inputs).not.toBeNull();
      expect(inputs!.record.view).toBe("imported");
      expect(inputs!.record.status).toBe("draft");
      expect(inputs!.record.data).toEqual(IMPORTED);
      expect(inputs!.record.annulledAt).toBeNull();
      // The page's read finds the same record, so the page opens for them.
      expect((await getRecordDetail(c, rOsteo1))?.id).toBe(rOsteo1);
    });

    it.each(READERS)("%s: the PDF model lists the same field names and values the screen draws from that row", async (_label, userId, role) => {
      const c = ctx(userId, role);
      const inputs = (await load.loadClinicalReportInputs(toClaims(c), rOsteo1, (await gen.registoReadScope(c)).value))!;
      const detail = (await getRecordDetail(c, rOsteo1))!;
      // The screen: the real component, drawn from the page's own read.
      const onScreen = screenFields(renderToStaticMarkup(createElement(ImportedRecordPreview, { data: detail.data })));
      // Every stored key that holds something, and not the blank one. The order
      // is the stored object's (jsonb keeps its own), and the PDF follows the
      // screen's, whatever it is.
      expect(onScreen.map((f) => f.name).sort()).toEqual(["Diagnóstico Fisio", "escala", "motivos", "queixas", "sessoes"]);
      expect(onScreen.find((f) => f.name === "queixas")?.value).toBe("Lombalgia inventada");
      expect(onScreen.find((f) => f.name === "sessoes")?.value).toBe("4");
      // The PDF: the export's own read, with the status alone changed in memory.
      const model = buildClinicalReportModel({ ...inputs, record: { ...inputs.record, status: "locked" } }, "pt");
      expect(model.stored).toEqual({ origin: "imported", entries: onScreen });
      const lines = (await drawnLines(await renderClinicalReportPdf(model, "pt"))).flat();
      expect(lines).toContain(pt["clinical.importedPreviewTitle"]);
      for (const field of onScreen) expect(lines, field.name).toContain(field.name);
    });

    it("a registo with no template that the importer did not write is the NEUTRAL view, never the imported one", async () => {
      const c = ctx(owner, "owner");
      const inputs = await load.loadClinicalReportInputs(toClaims(c), rNeutral, (await gen.registoReadScope(c)).value);
      expect(inputs!.record.view).toBe("neutral");
    });
  });

  describe("G3: a draft is never printed; an annulled registo is loaded with its annulment", () => {
    it.each(READERS)("%s: every registo of the patient is FOUND and refused as a draft", async (_label, userId, role) => {
      for (const id of [rOsteo1, rOsteo2, rOsteoAnnulled, rFisio, rNeutral]) {
        expect(await answer(() => gen.generateRegistoReportPdf(ctx(userId, role), id, "pt")), id).toBe("not_printable");
      }
    });

    it("the annulment travels with the registo, and its PDF carries the mark on every page", async () => {
      const c = ctx(therapistTreating, "therapist");
      const inputs = (await load.loadClinicalReportInputs(toClaims(c), rOsteoAnnulled, (await gen.registoReadScope(c)).value))!;
      expect(inputs.record.annulledAt?.toISOString()).toBe(new Date(ANNULLED_AT).toISOString());
      // As it stands, a draft: refused, annulled or not.
      expect(() => buildClinicalReportModel(inputs, "pt")).toThrow(RecordNotPrintableError);
      // Finalized, it is printed and marked, never refused.
      const model = buildClinicalReportModel({ ...inputs, record: { ...inputs.record, status: "signed" } }, "pt");
      expect(model.annulment).toEqual({ annulledAt: "22/09/2026" });
      const pages = await drawnLines(await renderClinicalReportPdf(model, "pt"));
      expect(pages.length).toBeGreaterThan(0);
      for (const page of pages) expect(page).toContain(pt["clinical.recordAnulado"]);
    });

    it("CONTROL: a registo no annulment names is loaded without one", async () => {
      const c = ctx(owner, "owner");
      const inputs = await load.loadClinicalReportInputs(toClaims(c), rOsteo2, (await gen.registoReadScope(c)).value);
      expect(inputs!.record.annulledAt).toBeNull();
    });
  });

  describe("G2: each role against a patient outside its ruled scope", () => {
    it("a THERAPIST with no relation to the patient: the page finds nothing and the export refuses, registo by registo", async () => {
      const c = ctx(therapistUnrelated, "therapist");
      for (const id of OURS) {
        expect(await getRecordDetail(c, id), id).toBeNull();
        expect(await answer(() => gen.generateRegistoReportPdf(c, id, "pt")), id).toBe("not_found");
      }
    });

    it("a THERAPIST who authored a registo of a patient they may not open: refused there too, though the registo row itself is theirs to read", async () => {
      const c = ctx(therapistAuthor, "therapist");
      // CONTROL: the registo policy admits the author to the row they wrote,
      // and to no other registo of the patient.
      const { clinicalRecords, withTenantContext } = await import("@osteojp/db");
      const { inArray } = await import("drizzle-orm");
      const visible = await withTenantContext(toClaims(c), (tx) =>
        tx.select({ id: clinicalRecords.id }).from(clinicalRecords).where(inArray(clinicalRecords.id, OURS)),
      );
      expect(visible.map((r) => r.id)).toEqual([rAuthored]);
      // The page does not open it for them (it reads the patient too), and the
      // export answers as the page does.
      expect(await getRecordDetail(c, rAuthored)).toBeNull();
      expect(await answer(() => gen.generateRegistoReportPdf(c, rAuthored, "pt"))).toBe("not_found");
      for (const id of [rOsteo1, rOsteo2, rOsteoAnnulled, rFisio, rNeutral]) {
        expect(await getRecordDetail(c, id), id).toBeNull();
        expect(await answer(() => gen.generateRegistoReportPdf(c, id, "pt")), id).toBe("not_found");
      }
    });

    it("an ADMIN of another clinic: the page finds nothing and the export refuses", async () => {
      const c = ctx(adminOtherClinic, "admin");
      for (const id of OURS) {
        expect(await getRecordDetail(c, id), id).toBeNull();
        expect(await answer(() => gen.generateRegistoReportPdf(c, id, "pt")), id).toBe("not_found");
      }
    });

    it("the OWNER reads every registo of their tenant and none of another's, both ways", async () => {
      const ours = ctx(owner, "owner");
      const theirs = ctx(foreignOwner, "owner", otherTenant);
      // CONTROL: each owner finds their own.
      expect(await answer(() => gen.generateRegistoReportPdf(ours, rAuthored, "pt"))).toBe("not_printable");
      expect(await answer(() => gen.generateRegistoReportPdf(theirs, rForeign, "pt"))).toBe("not_printable");
      expect(await getRecordDetail(ours, rForeign)).toBeNull();
      expect(await answer(() => gen.generateRegistoReportPdf(ours, rForeign, "pt"))).toBe("not_found");
      for (const id of OURS) {
        expect(await getRecordDetail(theirs, id), id).toBeNull();
        expect(await answer(() => gen.generateRegistoReportPdf(theirs, id, "pt")), id).toBe("not_found");
      }
    });

    it("RECEPTION is refused before any read, by the export and by the page's read alike", async () => {
      const c = ctx(randomUUID(), "reception");
      await expect(gen.generateRegistoReportPdf(c, rOsteo1, "pt")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getRecordDetail(c, rOsteo1)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(group.readImportedGroupRecords(c, { patientId: patient, specialty: "Osteopatia" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("the imported group, as the Registos tab draws it", () => {
    const ask = { patientId: patient, specialty: "Osteopatia" };

    it.each(READERS)("%s reads the group's registos, oldest first, the annulled one among them", async (_label, userId, role) => {
      const records = await group.readImportedGroupRecords(ctx(userId, role), ask);
      expect(records?.map((r) => r.id)).toEqual([rOsteo1, rOsteo2, rOsteoAnnulled]);
      expect(records?.map((r) => [r.status, r.annulled, r.episodeImported])).toEqual([
        ["draft", false, true],
        ["draft", false, true],
        ["draft", true, true],
      ]);
      // Three imported episodes, one group: the group is the specialty.
      expect(new Set(records?.map((r) => r.episodeId)).size).toBe(3);
    });

    it("the other specialty is its own group, and a specialty the patient has none of is no group", async () => {
      const c = ctx(owner, "owner");
      expect((await group.readImportedGroupRecords(c, { patientId: patient, specialty: "Fisioterapia" }))?.map((r) => r.id)).toEqual([
        rFisio,
      ]);
      expect(await group.readImportedGroupRecords(c, { patientId: patient, specialty: "Pilates" })).toBeNull();
      expect(await group.readImportedGroupRecords(c, { patientId: "not-a-uuid", specialty: "Osteopatia" })).toBeNull();
      expect(await group.readImportedGroupRecords(c, { patientId: patient, specialty: "" })).toBeNull();
    });

    it.each(READERS)("%s: a group of drafts selects nothing, and the engine prints nothing from it (G3)", async (_label, userId, role) => {
      const c = ctx(userId, role);
      expect(await group.readImportedGroupExportSelection(c, ask)).toBeNull();
      // Even handed the ids directly, the file is never made.
      const forced = { ...ask, recordIds: [rOsteo1, rOsteo2, rOsteoAnnulled], leftOut: 0 };
      expect(await group.renderImportedGroupReport(c, forced, "pt")).toBeNull();
    });

    it.each([
      ["a therapist with no relation to the patient", therapistUnrelated, "therapist"],
      ["a therapist who only authored another registo of the patient", therapistAuthor, "therapist"],
      ["an admin of another clinic", adminOtherClinic, "admin"],
    ] as const)("G2, %s: no such group, nothing selected, and nothing rendered even handed the ids as if finalized", async (_label, userId, role) => {
      const c = ctx(userId, role);
      expect(await group.readImportedGroupRecords(c, ask)).toBeNull();
      expect(await group.readImportedGroupExportSelection(c, ask)).toBeNull();
      const forced = { ...ask, recordIds: [rOsteo1, rOsteo2, rOsteoAnnulled], leftOut: 0 };
      const forcedEpisode = { episodeId: epOsteo1, patientId: patient, recordIds: forced.recordIds, leftOut: 0 };

      h.finalize = true;
      // CONTROL: with the print gate out of the way, a reader in scope is
      // printed all three, by the group's render and by the episode's.
      const reader = ctx(owner, "owner");
      expect((await group.renderImportedGroupReport(reader, forced, "pt"))?.recordIds).toEqual(forced.recordIds);
      expect((await group.renderEpisodeReport(reader, forcedEpisode, "pt"))?.recordIds).toEqual(forced.recordIds);
      // So what refuses here is the caller's reach, not the status.
      expect(await group.renderImportedGroupReport(c, forced, "pt")).toBeNull();
      expect(await group.renderEpisodeReport(c, forcedEpisode, "pt")).toBeNull();
    }, 60_000);

    it("G2, a THERAPIST handed the registo they AUTHORED, of a patient they may not open: neither render prints it, though the registo policy alone shows them the row", async () => {
      const c = ctx(therapistAuthor, "therapist");
      const forced = { ...ask, recordIds: [rAuthored], leftOut: 0 };
      const forcedEpisode = { episodeId: epOsteo1, patientId: patient, recordIds: [rAuthored], leftOut: 0 };
      // CONTROL: the registo policy alone shows them the row they wrote.
      const { clinicalRecords, withTenantContext } = await import("@osteojp/db");
      const { eq } = await import("drizzle-orm");
      const visible = await withTenantContext(toClaims(c), (tx) =>
        tx.select({ id: clinicalRecords.id }).from(clinicalRecords).where(eq(clinicalRecords.id, rAuthored)),
      );
      expect(visible.map((r) => r.id)).toEqual([rAuthored]);

      h.finalize = true;
      // CONTROL: as if finalized, both renders print it for a reader in scope.
      const reader = ctx(therapistTreating, "therapist");
      expect((await group.renderImportedGroupReport(reader, forced, "pt"))?.recordIds).toEqual([rAuthored]);
      expect((await group.renderEpisodeReport(reader, forcedEpisode, "pt"))?.recordIds).toEqual([rAuthored]);
      // The author gets nothing from either. Two things refuse them today, and
      // this arm holds the outcome whichever does: the renders read under the
      // registo page's scope (pinned as a statement in episode-export.test.ts
      // and imported-group-export.test.ts), and the engine's own read joins
      // the patient, whom their RLS does not show them: with no scope at all
      // the engine still finds nothing for them.
      expect(await group.renderImportedGroupReport(c, forced, "pt")).toBeNull();
      expect(await group.renderEpisodeReport(c, forcedEpisode, "pt")).toBeNull();
      expect(await answer(() => gen.generateClinicalReportPdf(toClaims(c), rAuthored, "pt"))).toBe("not_found");
    }, 60_000);

    it("G2, RECEPTION is refused by both renders, whoever made the selection", async () => {
      const c = ctx(randomUUID(), "reception");
      const forced = { ...ask, recordIds: [rOsteo1], leftOut: 0 };
      h.finalize = true;
      await expect(group.renderImportedGroupReport(c, forced, "pt")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        group.renderEpisodeReport(c, { episodeId: epOsteo1, patientId: patient, recordIds: [rOsteo1], leftOut: 0 }, "pt"),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("G2, the OWNER against another tenant's patient, both ways: no such group", async () => {
      // CONTROL: the other tenant's owner reads their own patient's group.
      expect(
        (
          await group.readImportedGroupRecords(ctx(foreignOwner, "owner", otherTenant), {
            patientId: foreignPatient,
            specialty: "Osteopatia",
          })
        )?.map((r) => r.id),
      ).toEqual([rForeign]);
      expect(
        await group.readImportedGroupRecords(ctx(owner, "owner"), { patientId: foreignPatient, specialty: "Osteopatia" }),
      ).toBeNull();
      expect(await group.readImportedGroupRecords(ctx(foreignOwner, "owner", otherTenant), ask)).toBeNull();
    });
  });

  it("none of the reads above wrote an audit row", async () => {
    const n = (await db.execute(
      raw`select count(*)::int as n from audit_log where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
    )) as unknown as { n: number }[];
    expect(n[0]!.n).toBe(0);
  });
});
