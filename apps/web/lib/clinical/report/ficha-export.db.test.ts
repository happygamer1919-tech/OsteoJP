/**
 * ficha-export.db.test.ts: EXPORT-01. WHO "Exportar ficha" ANSWERS, AND WHAT
 * ITS FILE HOLDS, AGAINST REAL ROWS AND RLS.
 *
 * Whether the whole-patient export answers is decided by what the caller's own
 * reads return, and that is a property of the database (the tenant boundary
 * and the admin's clinic are RLS; a therapist's reach is the read scope and
 * RLS together). So this suite runs the real statements, as the real
 * principals, through the real entry points: the Registos tab's read
 * (`listFichaRecords`, which also decides whether the tab draws the button),
 * `readPatientFichaGroups`, `readPatientFichaExportSelection` and
 * `renderPatientFichaReport`.
 *
 * EVERY REGISTO HERE IS A DRAFT, on purpose, as in registo-export.db.test.ts:
 * a finalized registo can never be deleted, so a suite that created one could
 * not remove its own rows. That is gate G3's first half on real rows: a draft
 * is READ by everyone in scope, and it is in no file.
 *
 * "AS IF FINALIZED". To see what the file holds, and to make the caller's
 * REACH the only thing that can refuse, some arms switch `finalize` on: the
 * status alone is then read as "locked", in memory, at the two places a status
 * is asked (the selection rule's input, and the engine's print gate). Every
 * read stays the real one, under the caller's own claims, and no row changes.
 *
 * THE ARMS:
 *   G2  each role against a patient outside its ruled scope: the tab's read
 *       returns nothing (so the tab draws no button), nothing is selected, and
 *       even handed every id the render prints nothing. A therapist with no
 *       relation to the patient; a therapist who AUTHORED a registo of a
 *       patient they may not open (RLS alone would admit that row: the control
 *       proves it); an admin of another clinic; the owner against another
 *       tenant, both ways; and reception, refused before any read.
 *   G3  a patient of drafts: read, never selected, never printed. As if
 *       finalized: the annulled registo is in the file and its pages carry the
 *       mark, with the date of the real annulment row.
 *   The file, as if finalized, for the three readers in scope: every registo
 *   of the patient under its section, oldest section first, "Sem episódio"
 *   last.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL, like every suite beside it.
 */
import { randomUUID } from "node:crypto";
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
import { fichaExportTarget, type FichaGroup } from "../ficha-groups-core";
import { drawnLines, words } from "./drawn-lines-test-fixture";
import { selectFichaExport } from "./ficha-export-core";
import type { FichaExportSelection } from "./ficha-export";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const pt = getStrings("pt");

// Each arm prints a whole file, one transaction per registo, several times
// over: more than the default five seconds on a busy machine.
d("EXPORT-01: the whole-patient export under real RLS", { timeout: 120_000 }, () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let ficha: typeof import("./ficha-export");
  let listFichaRecords: typeof import("../ficha-groups").listFichaRecords;

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
  const epFisio = randomUUID();
  const epApp = randomUUID();
  const epForeign = randomUUID();

  const rOsteo1 = randomUUID(); // imported, Osteopatia, 10 May 2019
  const rOsteo2 = randomUUID(); // imported, Osteopatia, 10 June 2019
  const rFisio = randomUUID(); // imported, Fisioterapia, 15 January 2020
  const rApp1 = randomUUID(); // app episode, 1 March 2026
  const rAppAnnulled = randomUUID(); // app episode, 8 March 2026, an annulment names it
  const rNeutral = randomUUID(); // no episode, 2018: older than every episode
  const rAuthored = randomUUID(); // no episode, authored by therapistAuthor
  const rForeign = randomUUID(); // the other tenant's registo

  const APP_TITLE = "Osteopatia (01/03/2026)";
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

  const OUTSIDERS = [
    ["a therapist with no relation to the patient", therapistUnrelated, "therapist"],
    ["a therapist who only authored one registo of the patient", therapistAuthor, "therapist"],
    ["an admin of another clinic", adminOtherClinic, "admin"],
  ] as const;

  /** The patient's registos, in the file's order, section by section. */
  const FILE = [
    { kind: "imported", label: "Osteopatia", recordIds: [rOsteo1, rOsteo2] },
    { kind: "imported", label: "Fisioterapia", recordIds: [rFisio] },
    { kind: "episode", label: APP_TITLE, recordIds: [rApp1, rAppAnnulled] },
    { kind: "none", label: null, recordIds: [rNeutral, rAuthored] },
  ];
  const OURS = FILE.flatMap((s) => s.recordIds);

  /** The selection the rule makes of real groups, every status read as "locked". */
  const asIfFinalized = (patientId: string, groups: FichaGroup[]): FichaExportSelection => ({
    patientId,
    ...selectFichaExport(groups.map((g) => ({ ...g, records: g.records.map((r) => ({ ...r, status: "locked" as const })) }))),
  });

  beforeAll(async () => {
    const dbMod = await import("@osteojp/db");
    db = dbMod.getDbAdmin();
    ficha = await import("./ficha-export");
    ({ listFichaRecords } = await import("../ficha-groups"));

    for (const [id, slug] of [
      [tenant, "export-01-ficha"],
      [otherTenant, "export-01-ficha-other"],
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
          values (${patient}::uuid, ${tenant}::uuid, 'Paciente Ficha Inventado', ${clinic}::uuid,
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
    /** The importer's ledger row for one episode it created. */
    const ledger = (tenantId: string, episodeId: string) =>
      db.execute(
        raw`insert into migration_staging_rows
              (tenant_id, batch_id, source_system, entity_type, source_id, raw, status, imported_entity_id)
            values (${tenantId}::uuid, ${tenantId}::uuid, 'fisiozero', 'clinical_episode'::migration_entity_type,
                    ${`export-01-ficha-${episodeId}`}, '{}'::jsonb, 'imported', ${episodeId}::uuid)`,
      );
    const registo = (
      id: string,
      opts: { tenantId?: string; patientId?: string; episode: string | null; at: string; practitioner?: string; text: string },
    ) =>
      db.execute(
        raw`insert into clinical_records
              (id, tenant_id, patient_id, episode_id, practitioner_id, form_template_id, source, status,
               version, created_at, data)
            values (${id}::uuid, ${opts.tenantId ?? tenant}::uuid, ${opts.patientId ?? patient}::uuid,
                    ${opts.episode}::uuid, ${opts.practitioner ?? null}::uuid, null, 'manual'::record_source,
                    'draft', 1, ${opts.at}::timestamptz, ${JSON.stringify({ queixas: opts.text })}::jsonb)`,
      );

    await episode(epOsteo1, tenant, patient, "Osteopatia");
    await episode(epOsteo2, tenant, patient, "Osteopatia");
    await episode(epFisio, tenant, patient, "Fisioterapia");
    await episode(epApp, tenant, patient, APP_TITLE);
    await episode(epForeign, otherTenant, foreignPatient, "Osteopatia");
    for (const id of [epOsteo1, epOsteo2, epFisio]) await ledger(tenant, id);
    await ledger(otherTenant, epForeign);

    // Inserted out of date order, so the order asserted below is the rule's.
    await registo(rAuthored, { episode: null, at: "2026-09-12T09:00:00Z", practitioner: therapistAuthor, text: "MARCA-AUTOR" });
    await registo(rAppAnnulled, { episode: epApp, at: "2026-03-08T09:00:00Z", text: "MARCA-APP-ANULADO" });
    await registo(rFisio, { episode: epFisio, at: "2020-01-15T23:00:00Z", text: "MARCA-FISIO" });
    await registo(rOsteo2, { episode: epOsteo2, at: "2019-06-10T23:00:00Z", text: "MARCA-OSTEO-2" });
    await registo(rNeutral, { episode: null, at: "2018-02-01T09:00:00Z", text: "MARCA-NEUTRO" });
    await registo(rApp1, { episode: epApp, at: "2026-03-01T09:00:00Z", text: "MARCA-APP-1" });
    await registo(rOsteo1, { episode: epOsteo1, at: "2019-05-10T23:00:00Z", text: "MARCA-OSTEO-1" });
    await registo(rForeign, { tenantId: otherTenant, patientId: foreignPatient, episode: epForeign, at: "2019-05-10T23:00:00Z", text: "MARCA-ALHEIO" });
    await db.execute(
      raw`insert into record_annulments (tenant_id, record_id, annulled_by_user_id, created_at)
          values (${tenant}::uuid, ${rAppAnnulled}::uuid, ${owner}::uuid, ${ANNULLED_AT}::timestamptz)`,
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
  }, 120_000);

  describe("the readers in scope: the tab's read is the export's read", () => {
    it.each(READERS)("%s reads every registo of the patient, grouped as the tab groups them, the annulled one among them", async (_label, userId, role) => {
      const groups = (await ficha.readPatientFichaGroups(ctx(userId, role), { patientId: patient }))!;
      // The tab's own order: newest group first, "Sem episódio" last.
      expect(groups.map((g) => [g.key, g.records.map((r) => r.id)])).toEqual([
        [`episode:${epApp}`, [rApp1, rAppAnnulled]],
        ["imported:Fisioterapia", [rFisio]],
        ["imported:Osteopatia", [rOsteo1, rOsteo2]],
        ["none", [rNeutral, rAuthored]],
      ]);
      const all = groups.flatMap((g) => g.records);
      expect(all.every((r) => r.status === "draft")).toBe(true);
      expect(all.filter((r) => r.annulled).map((r) => r.id)).toEqual([rAppAnnulled]);
    });

    it.each(READERS)("G3, %s: a patient of DRAFTS shows no button, selects nothing, and prints nothing even handed every id", async (_label, userId, role) => {
      const c = ctx(userId, role);
      // The tab lists the registos (the annulled one is hidden by default)...
      const listed = await listFichaRecords(c, { patientId: patient });
      expect(listed.map((r) => r.id).sort()).toEqual(OURS.filter((id) => id !== rAppAnnulled).sort());
      // ...and draws no "Exportar ficha" for them.
      expect(fichaExportTarget(listed)).toBeNull();
      expect(await ficha.readPatientFichaExportSelection(c, { patientId: patient })).toBeNull();
      const forced: FichaExportSelection = { patientId: patient, sections: [{ kind: "none", label: null, recordIds: OURS }], leftOut: 0 };
      expect(await ficha.renderPatientFichaReport(c, forced, "pt")).toBeNull();
    });

    it.each(READERS)("%s, as if finalized: the file holds every registo under its section, oldest section first, 'Sem episódio' last", async (_label, userId, role) => {
      const c = ctx(userId, role);
      const selection = asIfFinalized(patient, (await ficha.readPatientFichaGroups(c, { patientId: patient }))!);
      expect(selection).toEqual({ patientId: patient, sections: FILE, leftOut: 0 });

      h.finalize = true;
      const pdf = (await ficha.renderPatientFichaReport(c, selection, "pt"))!;
      expect(pdf.recordIds).toEqual(OURS);
      expect(pdf.sections).toBe(4);
      expect(pdf.leftOut).toBe(0);

      const pages = await drawnLines(pdf.bytes);
      const text = pages.map((lines) => words(lines));
      const at = (marker: string) => {
        const found = text.flatMap((t, i) => (t.includes(marker) ? [i] : []));
        expect(found, marker).toHaveLength(1);
        return found[0]!;
      };
      // Four heading pages and seven registos of one page each, in this order.
      expect(pages).toHaveLength(11);
      expect(pages[0]).toEqual([pt["report.record.episode"], "Osteopatia", pt["patients.fichaGroupImported"]]);
      expect([at("MARCA-OSTEO-1"), at("MARCA-OSTEO-2")]).toEqual([1, 2]);
      expect(pages[3]).toEqual([pt["report.record.episode"], "Fisioterapia", pt["patients.fichaGroupImported"]]);
      expect(at("MARCA-FISIO")).toBe(4);
      expect(pages[5]).toEqual([pt["report.record.episode"], APP_TITLE]);
      expect([at("MARCA-APP-1"), at("MARCA-APP-ANULADO")]).toEqual([6, 7]);
      expect(pages[8]).toEqual([pt["patients.fichaGroupNoEpisode"]]);
      expect([at("MARCA-NEUTRO"), at("MARCA-AUTOR")]).toEqual([9, 10]);
    });

    it("G3, as if finalized: the annulled registo's page carries the mark, with the real annulment's date, and no other page does", async () => {
      const c = ctx(therapistTreating, "therapist");
      const selection = asIfFinalized(patient, (await ficha.readPatientFichaGroups(c, { patientId: patient }))!);
      h.finalize = true;
      const pages = await drawnLines((await ficha.renderPatientFichaReport(c, selection, "pt"))!.bytes);
      const marked = pages.flatMap((lines, i) => (lines.includes(pt["clinical.recordAnulado"]) ? [i] : []));
      expect(marked).toEqual([7]);
      expect(words(pages[7]!)).toContain("MARCA-APP-ANULADO");
      expect(pages[7]).toContain(`${pt["clinical.recordAnulado"]} · 22/09/2026`);
    });
  });

  describe("G2: each role against a patient outside its ruled scope", () => {
    it.each(OUTSIDERS)("%s: the tab lists nothing and draws no button, nothing is selected, and nothing is printed even as if finalized", async (_label, userId, role) => {
      const c = ctx(userId, role);
      // The full selection, as a reader in scope makes it.
      const full = asIfFinalized(patient, (await ficha.readPatientFichaGroups(ctx(owner, "owner"), { patientId: patient }))!);
      expect(full.sections.flatMap((s) => s.recordIds)).toEqual(OURS);

      h.finalize = true;
      // CONTROL: with the gate out of the way, a reader in scope is printed all seven.
      expect((await ficha.renderPatientFichaReport(ctx(owner, "owner"), full, "pt"))?.recordIds).toEqual(OURS);

      const listed = await listFichaRecords(c, { patientId: patient, includeAnnulled: true });
      expect(listed).toEqual([]);
      expect(fichaExportTarget(listed)).toBeNull();
      expect(await ficha.readPatientFichaGroups(c, { patientId: patient })).toEqual([]);
      expect(await ficha.readPatientFichaExportSelection(c, { patientId: patient })).toBeNull();
      expect(await ficha.renderPatientFichaReport(c, full, "pt")).toBeNull();
    });

    it("CONTROL: the registo policy by itself admits the AUTHOR to the row they wrote; the export still holds nothing for them", async () => {
      const c = ctx(therapistAuthor, "therapist");
      const { clinicalRecords, withTenantContext } = await import("@osteojp/db");
      const { inArray } = await import("drizzle-orm");
      const visible = await withTenantContext(toClaims(c), (tx) =>
        tx.select({ id: clinicalRecords.id }).from(clinicalRecords).where(inArray(clinicalRecords.id, OURS)),
      );
      expect(visible.map((r) => r.id)).toEqual([rAuthored]);
      h.finalize = true;
      const forced: FichaExportSelection = { patientId: patient, sections: [{ kind: "none", label: null, recordIds: [rAuthored] }], leftOut: 0 };
      expect(await ficha.renderPatientFichaReport(c, forced, "pt")).toBeNull();
    });

    it("the OWNER reads every registo of their tenant's patient and none of another tenant's, both ways", async () => {
      const ours = ctx(owner, "owner");
      const theirs = ctx(foreignOwner, "owner", otherTenant);
      // CONTROL: each owner reads their own patient's tab.
      const theirGroups = (await ficha.readPatientFichaGroups(theirs, { patientId: foreignPatient }))!;
      expect(theirGroups.flatMap((g) => g.records.map((r) => r.id))).toEqual([rForeign]);
      const ourGroups = (await ficha.readPatientFichaGroups(ours, { patientId: patient }))!;
      expect(ourGroups.flatMap((g) => g.records).length).toBe(OURS.length);

      h.finalize = true;
      for (const [caller, patientId, selection] of [
        [ours, foreignPatient, asIfFinalized(foreignPatient, theirGroups)],
        [theirs, patient, asIfFinalized(patient, ourGroups)],
      ] as const) {
        const listed = await listFichaRecords(caller, { patientId, includeAnnulled: true });
        expect(listed).toEqual([]);
        expect(fichaExportTarget(listed)).toBeNull();
        expect(await ficha.readPatientFichaGroups(caller, { patientId })).toEqual([]);
        expect(await ficha.readPatientFichaExportSelection(caller, { patientId })).toBeNull();
        expect(await ficha.renderPatientFichaReport(caller, selection, "pt")).toBeNull();
      }
    });

    it("RECEPTION is refused before any read, by the export and by the tab's read alike", async () => {
      const c = ctx(randomUUID(), "reception");
      await expect(ficha.readPatientFichaGroups(c, { patientId: patient })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(ficha.readPatientFichaExportSelection(c, { patientId: patient })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listFichaRecords(c, { patientId: patient })).rejects.toBeInstanceOf(ForbiddenError);
      const forced: FichaExportSelection = { patientId: patient, sections: [{ kind: "none", label: null, recordIds: OURS }], leftOut: 0 };
      h.finalize = true;
      await expect(ficha.renderPatientFichaReport(c, forced, "pt")).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("none of the reads above wrote an audit row", async () => {
    const n = (await db.execute(
      raw`select count(*)::int as n from audit_log where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
    )) as unknown as { n: number }[];
    expect(n[0]!.n).toBe(0);
  });
});
