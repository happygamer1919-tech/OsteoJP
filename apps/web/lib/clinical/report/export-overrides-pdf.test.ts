import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

// RODICA-export-edit-before-download (owner ruling 2026-11-02): the dialog's
// date, hour and heading, on the REAL PAGES of a registo's PDF. Read back from
// the bytes (drawn-lines-test-fixture.ts):
//
//   THE HOUR   "Data da consulta" prints the appointment's hour next to its
//              date; a registo with no appointment prints the date alone.
//   UNCHANGED  with no override, or one equal to the defaults, the pages are
//              the pages the export always drew, apart from that hour.
//   OVERRIDE   the date, the hour and the heading reach the page; an emptied
//              text removes "Conteúdo importado" and nothing else.
//   NO WRITE   the per-record engine, handed an override, runs reads only on
//              its transaction: no insert, no update, no delete, and every
//              raw statement it sends is a read. The registo is never
//              written; the database's immutability trigger is never asked.
// Invented patient, invented text.

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  record: null as Record<string, unknown> | null,
  importer: true,
  /** Every property of the transaction the engine touched that is not a read. */
  writes: [] as string[],
  /** The text of every raw statement the engine sent. */
  executed: [] as string[],
}));

vi.mock("@osteojp/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/db")>();
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  // A select chain: the record read answers `h.record`, every other read
  // (the annulment, the signer, a fallback location) answers nothing.
  const chain = () => {
    let table: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      table = t;
      return b;
    };
    for (const step of ["innerJoin", "leftJoin", "where", "orderBy"]) b[step] = () => b;
    b.limit = async () => (table === actual.clinicalRecords && h.record ? [h.record] : []);
    return b;
  };
  // The transaction: `select` and `execute` are reads; ANY other property
  // asked for is recorded as a write and fails loudly.
  const tx = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "select") return () => chain();
        if (prop === "execute") {
          return async (q: unknown) => {
            h.executed.push(dialect.sqlToQuery(q as Parameters<typeof dialect.sqlToQuery>[0]).sql);
            return [{ importer_sourced: h.importer }];
          };
        }
        if (prop === "then") return undefined;
        h.writes.push(String(prop));
        throw new Error(`the export touched tx.${String(prop)}`);
      },
    },
  );
  return {
    ...actual,
    withTenantContext: async (_claims: unknown, fn: (t: unknown) => unknown) => fn(tx),
  };
});

import { drawnLines, words } from "./drawn-lines-test-fixture";
import { exportDefaults, type ExportOverride } from "./export-overrides";
import { generateClinicalReportPdf } from "./generate";
import { renderClinicalReportPdf } from "./pdf";
import { buildClinicalReportModel, withExportOverride, type ReportInputs } from "./report-model";

const pt = getStrings("pt");
const DATE_LABEL = pt["report.record.consultationDate"];
const IMPORTED_TITLE = pt["clinical.importedPreviewTitle"];

const TENANT = "11111111-1111-4111-8111-111111111111";
const REC = "aaaaaaaa-0000-4000-8000-0000000000a1";
const claims = { tenant_id: TENANT, role: "owner", sub: "22222222-2222-4222-8222-222222222222" } as unknown as Parameters<
  typeof generateClinicalReportPdf
>[0];

/** An IMPORTED, locked registo with an appointment on 20/05/2026 at 10:30 Lisbon. */
function importedRow(appointmentStartsAt: Date | null = new Date("2026-05-20T09:30:00Z")) {
  return {
    recordId: REC,
    status: "locked",
    aiReviewState: null,
    version: 1,
    episodeId: null,
    data: { queixas: "MARCA-IMPORTADO texto inventado", especialidade: "Osteopatia" },
    signedAt: null,
    createdAt: new Date("2019-05-10T23:00:00Z"),
    appointmentStartsAt,
    locName: "Linda-a-Velha",
    locAddress: null,
    locPhone: null,
    patientName: "Zzz Paciente Inventado",
    patientDob: "1985-03-09",
    patientNif: "999000111",
    practitionerName: "Zzz Terapeuta Inventado",
    tenantName: "Clinica Inventada, Lda.",
    tenantNif: "999000222",
    signedBy: null,
    source: "manual",
    formTemplateId: null,
    templateSchema: null,
  };
}

/** The value line drawn under "Data da consulta". */
function dateLine(lines: string[]): string {
  const at = lines.indexOf(DATE_LABEL);
  expect(at, "the date label is drawn").toBeGreaterThanOrEqual(0);
  return lines[at + 1]!;
}

async function linesOf(override?: ExportOverride) {
  const pdf = override
    ? await generateClinicalReportPdf(claims, REC, "pt", undefined, override)
    : await generateClinicalReportPdf(claims, REC, "pt");
  return { pdf, lines: (await drawnLines(pdf.bytes)).flat() };
}

beforeEach(() => {
  h.record = importedRow();
  h.importer = true;
  h.writes = [];
  h.executed = [];
});

describe("the hour of the session, next to its date", () => {
  it("an appointment's registo: 'Data da consulta' reads the date and the Lisbon hour", async () => {
    const { pdf, lines } = await linesOf();
    expect(dateLine(lines)).toBe("20/05/2026, 10:30");
    // No override: nothing to audit.
    expect(pdf.overridden).toBeUndefined();
  });

  it("winter time: the hour is Lisbon's, not UTC's", async () => {
    h.record = importedRow(new Date("2026-11-20T09:30:00Z"));
    expect(dateLine((await linesOf()).lines)).toBe("20/11/2026, 09:30");
  });

  it("a registo with no appointment prints the date alone, as before (its creation time is no consultation hour)", async () => {
    h.record = importedRow(null);
    expect(dateLine((await linesOf()).lines)).toBe("11/05/2019");
  });
});

describe("the dialog's values reach the page", () => {
  const override: ExportOverride = { recordId: REC, date: "2026-11-02", time: "15:45", text: "Avaliação de seguimento" };

  it("the date, the hour and the heading are the override's; the stored content is unchanged", async () => {
    const before = (await linesOf()).lines;
    const { pdf, lines } = await linesOf(override);
    expect(dateLine(lines)).toBe("02/11/2026, 15:45");
    expect(lines).toContain("Avaliação de seguimento");
    expect(lines).not.toContain(IMPORTED_TITLE);
    expect(words(lines)).not.toContain("20/05/2026");
    // Everything else on the page is what it was: the same lines, with the
    // date line and the heading line replaced.
    const swap = (l: string) =>
      l === "20/05/2026, 10:30" ? "02/11/2026, 15:45" : l === IMPORTED_TITLE ? "Avaliação de seguimento" : l;
    expect(lines).toEqual(before.map(swap));
    // The audit entry's originals are the stored record's, read by the engine.
    expect(pdf.overridden).toEqual({
      recordId: REC,
      originalDate: "2026-05-20",
      originalTime: "10:30",
      exportedDate: "2026-11-02",
      exportedTime: "15:45",
      textChanged: true,
    });
  });

  it("an emptied text removes 'Conteúdo importado' and nothing else: the notice and the stored fields stay", async () => {
    const before = (await linesOf()).lines;
    const { pdf, lines } = await linesOf({ recordId: REC, date: "2026-05-20", time: "10:30", text: "" });
    expect(lines).not.toContain(IMPORTED_TITLE);
    expect(words(lines)).toContain(pt["clinical.importedPreviewHelp"]);
    expect(lines).toContain("queixas");
    expect(words(lines)).toContain("MARCA-IMPORTADO texto inventado");
    expect(lines).toEqual(before.filter((l) => l !== IMPORTED_TITLE));
    expect(pdf.overridden).toMatchObject({ textChanged: true, exportedDate: "2026-05-20", exportedTime: "10:30" });
  });

  it("a removed hour prints the date alone", async () => {
    const { lines } = await linesOf({ recordId: REC, date: "2026-11-02", time: "", text: IMPORTED_TITLE });
    expect(dateLine(lines)).toBe("02/11/2026");
    expect(lines).toContain(IMPORTED_TITLE);
  });

  it("an override equal to the defaults prints exactly what no override prints, and is not audited", async () => {
    const before = (await linesOf()).lines;
    const same = { recordId: REC, date: "2026-05-20", time: "10:30", text: IMPORTED_TITLE };
    const { pdf, lines } = await linesOf(same);
    expect(lines).toEqual(before);
    expect(pdf.overridden).toBeUndefined();
  });
});

describe("the registo is never written", () => {
  it("with and without an override, the engine only reads: no insert, update or delete, and every raw statement is a read", async () => {
    await linesOf();
    await linesOf({ recordId: REC, date: "2026-11-02", time: "15:45", text: "" });
    expect(h.writes).toEqual([]);
    // CONTROL: the raw read did run (the importer's ledger, for a template-less registo).
    expect(h.executed.length).toBeGreaterThan(0);
    for (const statement of h.executed) {
      // A select, or a read-only CTE ending in one.
      expect(statement.trim().toLowerCase()).toMatch(/^(select|with recursive)\b/);
      expect(statement.toLowerCase()).not.toMatch(/\b(insert|update|delete)\b/);
    }
  });

  it("CONTROL: the fake transaction does catch a write", async () => {
    const { withTenantContext } = await import("@osteojp/db");
    await expect(
      withTenantContext(claims, async (tx) => (tx as unknown as { update: () => void }).update()),
    ).rejects.toThrow("tx.update");
    expect(h.writes).toEqual(["update"]);
  });
});

describe("on the model, for a registo with a form", () => {
  const FORM: ReportInputs = {
    record: {
      id: REC,
      status: "signed",
      aiReviewState: null,
      version: 1,
      episodeId: null,
      data: { consultationReason: "MARCA-FORM motivo inventado" },
      view: "form",
      annulledAt: null,
      consultationDate: new Date("2026-05-20T09:30:00Z"),
      appointmentStartsAt: new Date("2026-05-20T09:30:00Z"),
      signedAt: new Date("2026-05-21T16:00:00Z"),
    },
    patient: { fullName: "Zzz Paciente Inventado", dateOfBirth: "1985-03-09", nif: "999000111" },
    practitioner: { fullName: "Zzz Terapeuta Inventado", title: null, signedByName: "Zzz Terapeuta Inventado" },
    clinic: { fiscalName: "Clinica Inventada, Lda.", nif: "999000222" },
    location: { name: "Linda-a-Velha", address: null, phone: null },
  };
  const render = async (model: ReturnType<typeof buildClinicalReportModel>) =>
    (await drawnLines(await renderClinicalReportPdf(model, "pt"))).flat();

  it("no override: today's page, with the hour after the date and NOTHING else different", async () => {
    // Today's page: the same inputs with no appointment hour known.
    const today = await render(buildClinicalReportModel({ ...FORM, record: { ...FORM.record, appointmentStartsAt: undefined } }, "pt"));
    const now = await render(buildClinicalReportModel(FORM, "pt"));
    expect(dateLine(today)).toBe("20/05/2026");
    expect(now).toEqual(today.map((l) => (l === "20/05/2026" ? "20/05/2026, 10:30" : l)));
  });

  it("withExportOverride sets the date, the hour and the heading, and changes nothing else in the model", () => {
    const model = buildClinicalReportModel(FORM, "pt");
    const copy = structuredClone(model);
    const changed = withExportOverride(model, { date: "2026-11-02", time: "08:05", text: "Texto extra" }, "pt");
    expect(changed.record.consultationDate).toBe("02/11/2026");
    expect(changed.record.consultationTime).toBe("08:05");
    expect(changed.contentHeading).toBe("Texto extra");
    expect({ ...changed, record: model.record, contentHeading: undefined }).toEqual({ ...model, contentHeading: undefined });
    // The model handed in is not changed.
    expect(model).toEqual(copy);
  });

  it("a text given to a form's registo is drawn above its body; an empty text draws nothing", async () => {
    const model = buildClinicalReportModel(FORM, "pt");
    const plain = await render(model);
    const withText = await render(withExportOverride(model, { date: "2026-05-20", time: "10:30", text: "Texto extra" }, "pt"));
    const at = withText.indexOf("Texto extra");
    expect(at).toBeGreaterThan(-1);
    expect(withText.indexOf(pt["report.body.consultationReason"])).toBeGreaterThan(at);
    expect(withText.filter((l) => l !== "Texto extra")).toEqual(plain);
    const empty = await render(withExportOverride(model, { date: "2026-05-20", time: "10:30", text: "" }, "pt"));
    expect(empty).toEqual(plain);
  });

  it("the defaults the dialog shows for this registo are its appointment's", () => {
    expect(exportDefaults(FORM.record, "pt")).toEqual({ date: "2026-05-20", time: "10:30", text: "" });
  });
});
