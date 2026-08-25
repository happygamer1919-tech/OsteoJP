// The Fisiozero adapter, against GENERATED fixtures only.
//
// CLAUDE.md, "Patient data isolation (Fisiozero import)": no terminal opens or
// samples a delivery file. Every CSV below is written in this file, from
// invented values, and the column names come from the sanitized structure
// report - not from anybody reading an export.
//
// WHAT THESE ASSERT is not "it maps columns". It is the set of things that
// would produce a plausible, wrong import: an hour lost to DST, a dead booking
// landing in the future diary, a patient with no clinic, a pain score of 0 read
// as absent, an id that changes between runs.

import { describe, expect, it } from "vitest";

import {
  adaptFisiozeroDelivery,
  appointmentSourceId,
  createFisiozeroSource,
  detectDelimiter,
  ESTADO_MAP,
  episodeSourceId,
  mapEstado,
  naiveLocalToIso,
  parseCsv,
  normalizePhones,
  normalizeSex,
  specialtyFromFileName,
  zipInsurance,
} from "../src/migration/sources/fisiozero";
import type { MigrationPatient } from "../src/migration";

const TENANT = "11111111-1111-4111-8111-111111111111";

const PAC_HEADERS =
  "id_paciente,nome_completo,numero_paciente,data_nascimento,sexo,nif,email,telefone,morada,codigo_postal,localidade,clinica,seguro_saude,numero_apolice,observacoes,data_criacao,FICHEIRO";

const pacientes = (...rows: string[]) => [PAC_HEADERS, ...rows].join("\n") + "\n";

/** One well-formed patient. Everything invented. */
const P1 =
  'FZ1,Ana Sintetica,4001,1980-05-04,F,100000001,a@example.pt,+351900000001,"Rua A, 12",1000-001,Lisboa,Linda-a-Velha,,,nota,2026-08-01 10:00:00,';

const opts = {
  tenantId: TENANT,
  location: { kind: "fixed" as const, locationKey: "linda-a-velha" },
  practitionerKeyByName: { "Dr Sintetico": "jp" },
  serviceKeyByType: { Osteopatia: "osteopatia" },
  now: new Date("2026-08-24T12:00:00.000Z"),
};

const patientsOf = (r: ReturnType<typeof adaptFisiozeroDelivery>) =>
  r.records.filter((x) => x.entityType === "patient").map((x) => x.record.data as MigrationPatient);

describe("CSV handling", () => {
  it("keeps a quoted field that contains the delimiter as ONE field", () => {
    // The defect this prevents is silent: a comma in `morada` shifts every
    // later column, so `nif` reads a fragment of a street name.
    const grid = parseCsv('a,b\n"Rua A, 12",x\n', ",");
    expect(grid[1]).toEqual(["Rua A, 12", "x"]);
  });

  it("detects the delimiter from the header, ignoring commas inside quotes", () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n')).toBe(";");
    expect(detectDelimiter('"a,b",c\n1,2\n')).toBe(",");
  });
});

describe("naive Europe/Lisbon wall clock to an instant", () => {
  it("applies WINTER offset (UTC+0)", () => {
    const r = naiveLocalToIso("2026-01-15 09:30:00");
    expect(r.ok && r.iso).toBe("2026-01-15T09:30:00.000Z");
  });

  it("applies SUMMER offset (UTC+1), which is the hour a naive parse loses", () => {
    const r = naiveLocalToIso("2026-07-15 09:30:00");
    expect(r.ok && r.iso).toBe("2026-07-15T08:30:00.000Z");
  });

  it("REFUSES a local time that never existed, rather than inventing one", () => {
    // Lisbon springs 01:00 -> 02:00 on 2026-03-29. 01:30 is not a moment.
    const r = naiveLocalToIso("2026-03-29 01:30:00");
    expect(r).toEqual({ ok: false, reason: "nonexistent_local_time" });
  });

  it("resolves the autumn fold to the EARLIER instant and SAYS it was ambiguous", () => {
    // 2026-10-25 01:30 happens twice. Either answer is a guess; the caller is told.
    const r = naiveLocalToIso("2026-10-25 01:30:00");
    expect(r.ok).toBe(true);
    expect(r.ok && r.ambiguous).toBe(true);
    expect(r.ok && r.iso).toBe("2026-10-25T00:30:00.000Z");
  });
});

describe("estado mapping", () => {
  it("NOTHING maps to confirmed", () => {
    // Confirmation means a patient answered a reminder WE sent. No vendor row
    // can evidence that, and asserting it would fabricate a patient's action.
    expect(Object.values(ESTADO_MAP)).not.toContain("confirmed");
  });

  it("maps the three known values", () => {
    expect(ESTADO_MAP).toEqual({ realizada: "completed", falta: "no_show", marcada: "scheduled" });
  });

  it("routes an UNKNOWN estado to review and names the value", () => {
    const d = mapEstado("remarcada", "2027-01-01T10:00:00.000Z", opts.now);
    expect(d).toEqual({ ok: false, reason: "unknown_estado" });
  });

  it("accepts `marcada` only when the start is in the FUTURE", () => {
    expect(mapEstado("marcada", "2027-01-01T10:00:00.000Z", opts.now)).toEqual({
      ok: true,
      status: "scheduled",
    });
  });

  it("routes a PAST `marcada` to review - a decade of dead bookings is not a diary", () => {
    expect(mapEstado("marcada", "2020-01-01T10:00:00.000Z", opts.now)).toEqual({
      ok: false,
      reason: "marcada_in_the_past",
    });
  });
});

describe("synthetic ids", () => {
  it("are deterministic, so a re-run is idempotent against the staging ledger", () => {
    expect(appointmentSourceId("FZ1", "2026-01-02 09:00:00", "Dr X")).toBe(
      appointmentSourceId("FZ1", "2026-01-02 09:00:00", "Dr X"),
    );
    expect(episodeSourceId("FZ1", "2026-01-02", "Osteopatia")).toBe(
      episodeSourceId("FZ1", "2026-01-02", "Osteopatia"),
    );
  });

  it("differ when any component differs", () => {
    const a = appointmentSourceId("FZ1", "2026-01-02 09:00:00", "Dr X");
    expect(appointmentSourceId("FZ2", "2026-01-02 09:00:00", "Dr X")).not.toBe(a);
    expect(appointmentSourceId("FZ1", "2026-01-02 10:00:00", "Dr X")).not.toBe(a);
    expect(appointmentSourceId("FZ1", "2026-01-02 09:00:00", "Dr Y")).not.toBe(a);
  });

  it("derives specialty from the episode filename", () => {
    expect(specialtyFromFileName("Episodios_Osteopatia.csv")).toBe("Osteopatia");
    expect(specialtyFromFileName("/tmp/x/Episodios_Fisioterapia.csv")).toBe("Fisioterapia");
  });
});

describe("patients", () => {
  it("emits a patient with primaryLocationKey and carries numero_paciente", () => {
    const r = adaptFisiozeroDelivery({ pacientes: pacientes(P1) }, opts);
    const [p] = patientsOf(r);
    expect(p!.sourceId).toBe("FZ1");
    expect(p!.primaryLocationKey).toBe("linda-a-velha");
    expect(p!.patientNumber).toBe(4001);
  });

  it("NEVER emits a patient without a resolvable clinic - it routes to review", () => {
    // Requirement 5. A patient with no primary location inherits PL-09's
    // deliberately-unrestricted fallback on every read path scoped by it.
    const r = adaptFisiozeroDelivery(
      { pacientes: pacientes(P1) },
      { ...opts, location: { kind: "column", column: "clinica", locationKeyByValue: {} } },
    );
    expect(patientsOf(r)).toHaveLength(0);
    expect(r.toReview[0]).toMatchObject({ file: "pacientes.csv", reason: "unresolved_primary_location" });
  });

  it("resolves the clinic from a COLUMN when configured that way", () => {
    const r = adaptFisiozeroDelivery(
      { pacientes: pacientes(P1) },
      {
        ...opts,
        location: {
          kind: "column",
          column: "clinica",
          locationKeyByValue: { "Linda-a-Velha": "linda-a-velha" },
        },
      },
    );
    expect(patientsOf(r)[0]!.primaryLocationKey).toBe("linda-a-velha");
  });

  it("NEVER reads data_criacao as a registration date", () => {
    // Requirement 7: it is an export timestamp. The type has no registration
    // field, and this pins that the value does not leak in through `notes`.
    const r = adaptFisiozeroDelivery({ pacientes: pacientes(P1) }, opts);
    expect(JSON.stringify(patientsOf(r)[0])).not.toContain("2026-08-01");
  });

  it("counts repeated numero_paciente and warns, because patient_number is tenant-unique", () => {
    const dup = P1.replace("FZ1,Ana Sintetica,4001", "FZ2,Bruno Sintetico,4001");
    const r = adaptFisiozeroDelivery({ pacientes: pacientes(P1, dup) }, opts);
    expect(r.checks.patientNumberDuplicates).toBe(1);
    expect(r.warnings.join(" ")).toContain("numero_paciente is NOT unique");
  });
});

describe("appointments", () => {
  const marc = (...rows: string[]) =>
    ["id_paciente,inicio,fim,terapeuta,clinica,tipo_servico,estado,observacoes", ...rows].join("\n") + "\n";

  it("emits a completed appointment with DST-correct instants", () => {
    const r = adaptFisiozeroDelivery(
      {
        pacientes: pacientes(P1),
        marcacoes: marc("FZ1,2026-07-15 09:00:00,2026-07-15 10:00:00,Dr Sintetico,Linda-a-Velha,Osteopatia,realizada,"),
      },
      opts,
    );
    const a = r.records.find((x) => x.entityType === "appointment")!.record.data as never as {
      startsAt: string;
      status: string;
      serviceKey: string;
    };
    expect(a.startsAt).toBe("2026-07-15T08:00:00.000Z");
    expect(a.status).toBe("completed");
    expect(a.serviceKey).toBe("osteopatia");
  });

  it("routes an ORPHAN id_paciente to review rather than importing a dangling row", () => {
    const r = adaptFisiozeroDelivery(
      {
        pacientes: pacientes(P1),
        marcacoes: marc("FZ9,2026-07-15 09:00:00,2026-07-15 10:00:00,Dr Sintetico,Linda-a-Velha,Osteopatia,realizada,"),
      },
      opts,
    );
    expect(r.toReview.some((t) => t.reason === "orphan_id_paciente")).toBe(true);
  });

  it("routes an unresolved terapeuta to review - practitioner_id is NOT NULL", () => {
    const r = adaptFisiozeroDelivery(
      {
        pacientes: pacientes(P1),
        marcacoes: marc("FZ1,2026-07-15 09:00:00,2026-07-15 10:00:00,Quem,Linda-a-Velha,Osteopatia,realizada,"),
      },
      opts,
    );
    expect(r.toReview.some((t) => t.reason === "unresolved_terapeuta")).toBe(true);
  });

  it("collapses two identical rows onto one synthetic id and COUNTS the collapse", () => {
    const row = "FZ1,2026-07-15 09:00:00,2026-07-15 10:00:00,Dr Sintetico,Linda-a-Velha,Osteopatia,realizada,";
    const r = adaptFisiozeroDelivery({ pacientes: pacientes(P1), marcacoes: marc(row, row) }, opts);
    expect(r.checks.appointments).toBe(1);
    expect(r.checks.duplicateSyntheticAppointmentIds).toBe(1);
  });

  it("routes fim <= inicio to review", () => {
    const r = adaptFisiozeroDelivery(
      {
        pacientes: pacientes(P1),
        marcacoes: marc("FZ1,2026-07-15 10:00:00,2026-07-15 09:00:00,Dr Sintetico,Linda-a-Velha,Osteopatia,realizada,"),
      },
      opts,
    );
    expect(r.toReview.some((t) => t.reason === "fim_not_after_inicio")).toBe(true);
  });

  it("reports the unknown estado VALUE, which is operational metadata and safe", () => {
    const r = adaptFisiozeroDelivery(
      {
        pacientes: pacientes(P1),
        marcacoes: marc("FZ1,2026-07-15 09:00:00,2026-07-15 10:00:00,Dr Sintetico,Linda-a-Velha,Osteopatia,remarcada,"),
      },
      opts,
    );
    expect(r.toReview[0]).toMatchObject({ reason: "unknown_estado", estado: "remarcada" });
  });
});

describe("episodes and clinical records", () => {
  const ep = (...rows: string[]) =>
    [
      "tipo,id_paciente,terapeuta,data_avaliacao,escala_eva,peso,altura,motivos,diagnostico,obs,FICHEIRO",
      ...rows,
    ].join("\n") + "\n";

  const run = (row: string) =>
    adaptFisiozeroDelivery(
      { pacientes: pacientes(P1), episodios: [{ fileName: "Episodios_Osteopatia.csv", csv: ep(row) }] },
      opts,
    );

  it("emits one closed episode and one locked record, titled by specialty", () => {
    const r = run("aval,FZ1,Dr Sintetico,2026-02-10,3,70,170,dor,diag,,");
    const e = r.records.find((x) => x.entityType === "clinical_episode")!.record.data as never as {
      title: string;
      status: string;
    };
    expect(e.title).toBe("Osteopatia");
    expect(e.status).toBe("closed");
    expect(r.checks.clinicalRecords).toBe(1);
  });

  it("folds specialty fields under THEIR OWN NAMES and omits empty ones", () => {
    const r = run("aval,FZ1,Dr Sintetico,2026-02-10,3,70,,dor,,,");
    const rec = r.records.find((x) => x.entityType === "clinical_record")!.record.data as never as {
      data: Record<string, unknown>;
    };
    expect(rec.data).toMatchObject({ especialidade: "Osteopatia", peso: "70", motivos: "dor" });
    expect(rec.data).not.toHaveProperty("altura");
    expect(rec.data).not.toHaveProperty("diagnostico");
  });

  it("KEEPS a pain score of zero - 'no pain' is not 'not asked'", () => {
    const r = run("aval,FZ1,Dr Sintetico,2026-02-10,0,,,,,,");
    const rec = r.records.find((x) => x.entityType === "clinical_record")!.record.data as never as {
      data: Record<string, unknown>;
    };
    expect(rec.data["escala_eva"]).toBe(0);
  });

  it("omits escala_eva when the cell is EMPTY, which is a different fact from zero", () => {
    const r = run("aval,FZ1,Dr Sintetico,2026-02-10,,,,,,,");
    const rec = r.records.find((x) => x.entityType === "clinical_record")!.record.data as never as {
      data: Record<string, unknown>;
    };
    expect(rec.data).not.toHaveProperty("escala_eva");
  });
});

describe("attachments", () => {
  it("deduplicates one filename seen in pacientes AND documentos, keeping the richer row", () => {
    const withFile = P1.slice(0, -1) + "scan1.pdf";
    const r = adaptFisiozeroDelivery(
      {
        pacientes: pacientes(withFile),
        documentos:
          "id_documento,id_paciente,ficheiro,nome_original,tipo_mime,descricao\nD1,FZ1,scan1.pdf,Original.pdf,application/pdf,d\n",
      },
      opts,
    );
    expect(r.checks.attachments).toBe(1);
    const a = r.records.find((x) => x.entityType === "attachment")!.record.data as never as {
      mimeType: string;
      storagePath: string;
      sourceId: string;
    };
    expect(a.mimeType).toBe("application/pdf");
    expect(a.sourceId).toBe("D1");
    expect(a.storagePath).toBe(`${TENANT}/migration/fisiozero/scan1.pdf`);
  });

  it("routes a documentos row whose patient does not exist to review", () => {
    const r = adaptFisiozeroDelivery(
      {
        pacientes: pacientes(P1),
        documentos:
          "id_documento,id_paciente,ficheiro,nome_original,tipo_mime,descricao\nD1,NOPE,x.pdf,X.pdf,application/pdf,d\n",
      },
      opts,
    );
    expect(r.toReview.some((t) => t.file === "documentos.csv" && t.reason === "orphan_id_paciente")).toBe(true);
  });
});

describe("the FisiozeroSource seam", () => {
  it("streams the same records the adapter produced", async () => {
    const src = createFisiozeroSource({ pacientes: pacientes(P1) }, opts);
    expect(src.sourceSystem).toBe("fisiozero");
    const seen = [];
    for await (const r of src.records()) seen.push(r);
    expect(seen).toHaveLength(src.result.records.length);
  });
});

describe("to_review carries no personal data", () => {
  it("emits only file, row, a reason code and the estado/tipo_servico vocabulary", () => {
    const r = adaptFisiozeroDelivery(
      {
        pacientes: pacientes(P1, 'FZ2,,,,,,,,,,,,,,,,'),
        marcacoes:
          "id_paciente,inicio,fim,terapeuta,clinica,tipo_servico,estado,observacoes\n" +
          "FZ1,2026-07-15 09:00:00,2026-07-15 10:00:00,Dr Sintetico,Linda-a-Velha,Osteopatia,remarcada,\n",
      },
      opts,
    );
    expect(r.toReview.length).toBeGreaterThan(0);
    const allowed = new Set(["file", "row", "reason", "estado", "tipoServico"]);
    for (const t of r.toReview) {
      for (const k of Object.keys(t)) expect(allowed.has(k)).toBe(true);
    }
    // The invented patient's name must not appear anywhere in the review output.
    expect(JSON.stringify(r.toReview)).not.toContain("Ana Sintetica");
  });
});

describe("normalisation at the migration boundary", () => {
  it("normalises sexo per the 2026-07-01 note", () => {
    for (const v of ["F", "f", "Feminino", "feminino"]) expect(normalizeSex(v)).toBe("female");
    for (const v of ["M", "m", "Masculino", "masculino"]) expect(normalizeSex(v)).toBe("male");
  });

  it("routes an UNRECOGNISED sexo to review rather than guessing a bucket", () => {
    // patients.sex is varchar(16), not an enum - the database would accept "X"
    // without a word, which is exactly why this is caught here.
    expect(normalizeSex("X")).toBeNull();
    const r = adaptFisiozeroDelivery(
      { pacientes: pacientes(P1.replace(",1980-05-04,F,", ",1980-05-04,X,")) },
      opts,
    );
    expect(patientsOf(r)).toHaveLength(0);
    expect(r.toReview[0]).toMatchObject({ reason: "unrecognised_sexo" });
  });

  it("normalises telefone to E.164 through the SHARED function", () => {
    const r = adaptFisiozeroDelivery(
      { pacientes: pacientes(P1.replace("+351900000001", "912 345 678")) },
      opts,
    );
    // The portal logs in BY PHONE. 0062 derives phone_e164 and yields NULL for
    // a shape it does not know, so an un-normalised number means that patient
    // cannot log in and nothing reports it.
    expect(patientsOf(r)[0]!.phone).toBe("+351912345678");
  });

  it("FIRST VALID WINS across semicolons, and the rest are preserved in notes", () => {
    const r = adaptFisiozeroDelivery(
      { pacientes: pacientes(P1.replace("+351900000001", "912 345 678;933 222 111")) },
      opts,
    );
    const p = patientsOf(r)[0]!;
    expect(p.phone).toBe("+351912345678");
    // Nothing is discarded: a second number is often the only way to reach an
    // elderly patient.
    expect(p.notes).toContain("+351933222111");
  });

  it("skips an unresolvable entry and still takes the first VALID one", () => {
    const r = adaptFisiozeroDelivery(
      { pacientes: pacientes(P1.replace("+351900000001", "not-a-number;912 345 678")) },
      opts,
    );
    expect(patientsOf(r)[0]!.phone).toBe("+351912345678");
  });

  it("COUNTS patients with no resolvable phone - the day-one login check", () => {
    const r = adaptFisiozeroDelivery(
      { pacientes: pacientes(P1.replace("+351900000001", "+44 7700 900000")) },
      opts,
    );
    expect(r.checks.unresolvablePhones).toBe(1);
    expect(patientsOf(r)[0]!.phone).toBeNull();
    // A count, never the numbers.
    expect(typeof r.checks.unresolvablePhones).toBe("number");
  });

  it("zips seguro_saude and numero_apolice into the PL-23 list shape", () => {
    expect(zipInsurance("ADSE;Medis", "111;222")).toEqual([
      { insurer: "ADSE", number: "111" },
      { insurer: "Medis", number: "222" },
    ]);
    expect(zipInsurance("", "111")).toEqual([{ insurer: null, number: "111" }]);
    expect(zipInsurance("", "")).toEqual([]);
  });

  it("routes MISMATCHED insurance columns to review rather than mispairing", () => {
    // Pairing an insurer with the wrong policy number is worse than recording
    // neither.
    expect(zipInsurance("ADSE;Medis", "111")).toBe("mismatched");
    const row = P1.replace(",Linda-a-Velha,,,nota,", ",Linda-a-Velha,ADSE;Medis,111,nota,");
    const r = adaptFisiozeroDelivery({ pacientes: pacientes(row) }, opts);
    expect(r.toReview[0]).toMatchObject({ reason: "insurance_columns_mismatched" });
  });

  it("carries the insurance list onto the emitted patient", () => {
    const row = P1.replace(",Linda-a-Velha,,,nota,", ",Linda-a-Velha,ADSE,111,nota,");
    const r = adaptFisiozeroDelivery({ pacientes: pacientes(row) }, opts);
    expect(patientsOf(r)[0]!.healthInsuranceNumbers).toEqual([{ insurer: "ADSE", number: "111" }]);
  });
});
