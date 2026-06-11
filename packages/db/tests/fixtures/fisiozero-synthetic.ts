// tests/fixtures/fisiozero-synthetic.ts
//
// SYNTHETIC Fisiozero-shaped fixtures for the migration pipeline tests.
// Every name, NIF, phone, and clinical note here is INVENTED — no real
// patient data may ever appear in fixtures (CLAUDE.md rule 7, GDPR).
//
// The `raw` payloads imitate what a Fisiozero CSV export row MIGHT look like
// (PT column names, PT date format). The real export format is unknown until
// a sample arrives, and nothing in the pipeline depends on this guess: raw is
// opaque JSONB to staging, and the importer only ever sees the normalized
// `record`. Both Fisiozero locations are covered (Linda-a-Velha, Castelo
// Branco — docs/migration-notes.md).

import type { MigrationRecord } from "../../src/migration";

export const SOURCE_SYSTEM = "fisiozero";

/** Resolver keys the test seeds locations/practitioners under. */
export const LOCATION_KEYS = ["linda-a-velha", "castelo-branco"] as const;
export const PRACTITIONER_KEY = "jp";

export type SyntheticRow = {
  record: MigrationRecord;
  raw: Record<string, unknown>;
};

export function syntheticBatch(): SyntheticRow[] {
  return [
    // ---- patients (one per location, one in both) ----------------------
    {
      record: {
        entityType: "patient",
        data: {
          sourceId: "fz-pat-1001",
          fullName: "Maria da Conceição Ferreira",
          dateOfBirth: "1958-03-12",
          sex: "F",
          nif: "100000001",
          email: "maria.exemplo@example.pt",
          phone: "+351900000001",
          address: "Rua das Amoreiras 12",
          postalCode: "1495-001",
          city: "Linda-a-Velha",
          notes: "Sintético — fixture de teste.",
          locationKeys: ["linda-a-velha"],
        },
      },
      raw: {
        id: "1001",
        nome: "Maria da Conceição Ferreira",
        data_nascimento: "12/03/1958",
        nif: "100000001",
        telefone: "+351900000001",
        clinica: "Linda-a-Velha",
      },
    },
    {
      record: {
        entityType: "patient",
        data: {
          sourceId: "fz-pat-1002",
          fullName: "João Miguel Santos Almeida",
          dateOfBirth: "1983-11-30",
          sex: "M",
          nif: null, // known edge case: missing NIF is imported, flagged later
          email: null,
          phone: "+351900000002",
          address: "Avenida 1.º de Maio 45",
          postalCode: "6000-100",
          city: "Castelo Branco",
          notes: null,
          locationKeys: ["castelo-branco"],
        },
      },
      raw: {
        id: "1002",
        nome: "João Miguel Santos Almeida",
        data_nascimento: "30/11/1983",
        nif: "",
        telefone: "+351900000002",
        clinica: "Castelo Branco",
      },
    },
    {
      record: {
        entityType: "patient",
        data: {
          sourceId: "fz-pat-1003",
          fullName: "Ana Beatriz Lopes Carvalho",
          dateOfBirth: null, // known edge case: missing DOB
          sex: "F",
          nif: "100000003",
          email: "ana.exemplo@example.pt",
          phone: null,
          address: null,
          postalCode: null,
          city: null,
          notes: "Paciente vista nas duas clínicas (sintético).",
          locationKeys: ["linda-a-velha", "castelo-branco"],
        },
      },
      raw: {
        id: "1003",
        nome: "Ana Beatriz Lopes Carvalho",
        data_nascimento: "",
        nif: "100000003",
        clinica: "Linda-a-Velha; Castelo Branco",
      },
    },

    // ---- clinical episode ---------------------------------------------
    {
      record: {
        entityType: "clinical_episode",
        data: {
          sourceId: "fz-epi-2001",
          patientSourceId: "fz-pat-1001",
          practitionerKey: PRACTITIONER_KEY,
          title: "Lombalgia crónica (sintético)",
          status: "closed",
          openedAt: "2024-02-05T10:00:00.000Z",
          closedAt: "2024-05-20T11:00:00.000Z",
        },
      },
      raw: { id: "2001", paciente_id: "1001", motivo: "Lombalgia crónica" },
    },

    // ---- appointments ---------------------------------------------------
    {
      record: {
        entityType: "appointment",
        data: {
          sourceId: "fz-apt-3001",
          patientSourceId: "fz-pat-1001",
          practitionerKey: PRACTITIONER_KEY,
          locationKey: "linda-a-velha",
          serviceKey: null,
          startsAt: "2024-02-05T10:00:00.000Z",
          endsAt: "2024-02-05T11:00:00.000Z",
          status: "completed",
          notes: null,
        },
      },
      raw: { id: "3001", paciente_id: "1001", data: "05/02/2024 10:00", tipo: "Osteopatia" },
    },
    {
      record: {
        entityType: "appointment",
        data: {
          sourceId: "fz-apt-3002",
          patientSourceId: "fz-pat-1002",
          practitionerKey: PRACTITIONER_KEY,
          locationKey: "castelo-branco",
          serviceKey: null,
          startsAt: "2024-03-14T15:30:00.000Z",
          endsAt: "2024-03-14T16:30:00.000Z",
          status: "no_show",
          notes: "Faltou sem aviso (sintético).",
        },
      },
      raw: { id: "3002", paciente_id: "1002", data: "14/03/2024 15:30", tipo: "Fisioterapia" },
    },

    // ---- clinical record ------------------------------------------------
    {
      record: {
        entityType: "clinical_record",
        data: {
          sourceId: "fz-rec-4001",
          patientSourceId: "fz-pat-1001",
          episodeSourceId: "fz-epi-2001",
          practitionerKey: PRACTITIONER_KEY,
          data: {
            anamnese: "Dor lombar com 3 meses de evolução (texto sintético).",
            avaliacao: "Mobilidade reduzida L4-L5 (texto sintético).",
          },
          status: "draft",
          recordedAt: "2024-02-05T10:45:00.000Z",
        },
      },
      raw: { id: "4001", paciente_id: "1001", notas: "Dor lombar… (sintético)" },
    },

    // ---- attachment ------------------------------------------------------
    {
      record: {
        entityType: "attachment",
        data: {
          sourceId: "fz-att-5001",
          patientSourceId: "fz-pat-1001",
          clinicalRecordSourceId: "fz-rec-4001",
          storagePath: "migration/fisiozero/fz-att-5001/rx-lombar.pdf",
          fileName: "rx-lombar.pdf",
          mimeType: "application/pdf",
          sizeBytes: 12345,
        },
      },
      raw: { id: "5001", caminho: "C:/fisiozero/anexos/1001/rx-lombar.pdf" },
    },
  ];
}

/**
 * A record that fails intermediate validation (empty fullName) — exercises the
 * pending → failed path with a structured error detail.
 */
export function invalidPatientRow(): SyntheticRow {
  return {
    record: {
      entityType: "patient",
      data: {
        sourceId: "fz-pat-9999",
        fullName: "", // invalid: patients.full_name is NOT NULL / non-empty
        locationKeys: ["linda-a-velha"],
      },
    },
    raw: { id: "9999", nome: "", clinica: "Linda-a-Velha" },
  };
}
