/**
 * Seed — clinical episodes and records for a subset of 30 dev patients.
 *
 * Tenant: 3a2d0711-fbdb-4ce9-b940-b6a87e3d3560
 *
 * Uses the osteopathy-v2 and physiotherapy-v4 form templates (must already
 * be seeded by dev-reference.ts → loadFormTemplates).
 *
 * Fixed episode and record IDs make this idempotent via onConflictDoNothing.
 * Run after dev-reference.ts and patients-dev.ts.
 *
 * SAFETY: target is resolved and confirmed by ./seed-guard (SEED_DEV_CONFIRM
 * opt-in + PROD_REFS blocklist).
 *
 * Usage:
 *   DATABASE_URL=<dev-service-role-url> pnpm --filter @osteojp/db seed:episodes:dev
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and } from "drizzle-orm";
import { clinicalEpisodes, clinicalRecords, formTemplates } from "../src/schema";
import { resolveDevUsers } from "./dev-users";
import { resolveSeedDatabaseUrl } from "./seed-guard";

const TENANT_ID = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";

const DATABASE_URL = resolveSeedDatabaseUrl();

// ─── Patient IDs (first 30 of the 50 fixed patients) ──────────────────────────

const EPISODE_PATIENT_IDS: readonly string[] = [
  "0fe2d970-48e7-4031-9a89-cf19fcc2e284", // 0  Maria João Silva
  "69ccbe13-9f86-4928-8d94-435ba6f35d03", // 1  António Manuel Costa
  "cae30d86-af77-4e61-b79c-57f94f62d471", // 2  Ana Luísa Ferreira
  "ddb9d1f5-8e59-4a5f-81e3-494f4e9e0695", // 3  Carlos Alberto Rodrigues
  "707f4dc0-a455-4a35-806a-516a44dc8a2c", // 4  Susana Isabel Martins
  "fa3f78c4-057b-4e3f-b3e3-1e37372cf1ac", // 5  Paulo Alexandre Sousa
  "348a53fd-b99c-4572-ab7a-7a1ad1f7d482", // 6  Filipa Margarida Gonçalves
  "0e8cfd18-7670-4a49-86e2-021c30189ec9", // 7  Rui Miguel Carvalho
  "dd7f2909-bb1f-4f27-a212-e2d004a4f39c", // 8  Inês Catarina Lopes
  "50c7c4d3-4b37-4bf0-b62b-0cfb131d82e3", // 9  João Pedro Alves
  "48b9fcb7-d5b0-4546-b13e-1b172e06eaf5", // 10 Beatriz Alexandra Santos
  "db53ead3-fcf1-47ac-a225-0dd4ebf0c14c", // 11 Nuno Ricardo Pereira
  "9a703fa5-0551-4f00-80ae-e27dbc320fca", // 12 Catarina Sofia Matos
  "2a85ed37-56ac-491d-8939-99c678730f19", // 13 Hugo Filipe Teixeira
  "a208a2ee-2e0e-4f9e-adcc-090664ae6ed0", // 14 Margarida Leonor Nunes
  "40a02d7b-4b71-44ea-9321-6b45f9c7da75", // 15 Ricardo José Oliveira
  "77d37dd2-7ab7-460c-b15b-f8f3190828f7", // 16 Sara Filomena Pinto
  "9be6de48-a919-4f82-8d88-22bc64a8145d", // 17 Marco António Fernandes
  "97bf93d2-793c-49d5-a4bc-8136947d8d04", // 18 Joana Cristina Ribeiro
  "d3c1e7dc-66ae-4d74-88bd-21494b28fe7b", // 19 Diogo Alexandre Cruz
  "932c1040-ec09-47ab-9352-82cc34d62b8e", // 20 Liliana Patrícia Gomes
  "bad42b62-4ed5-45d9-b666-9e00c80c33d2", // 21 Tiago Filipe Henriques
  "5dc24f5a-434f-402b-867c-07baace1a16d", // 22 Mónica Isabel Correia
  "65a8419b-a982-4e22-b01a-40f9f165b07a", // 23 Vítor Manuel Barbosa
  "5e88b11d-de8b-4092-8abf-f8fcd58e05ef", // 24 Daniela Sofia Monteiro
  "cc82ffec-2d2c-441a-b2a9-2edb6dfe0176", // 25 Fernando Jorge Mendes
  "ceb05564-9a29-4dba-9a3c-28ab7aa7cecc", // 26 Paula Cristina Vieira
  "62034369-26a0-4f8a-b679-b36917bd0a80", // 27 Luís Filipe Cardoso
  "d1573d09-f0e6-4f10-9755-4302b610185c", // 28 Cristina Maria Moreira
  "a4dcca0a-2a01-4bd9-9b4b-5ac7dac1c6c7", // 29 André Luís Fonseca
];

const EPISODE_TITLES = [
  "Lombalgia crónica",
  "Cervicalgia por contractura",
  "Dor no ombro direito",
  "Hérnia discal L4-L5",
  "Ciatalgia",
  "Tensão muscular cervical",
  "Síndrome do túnel cárpico",
  "Lesão desportiva — joelho",
  "Tendinopatia do ombro",
  "Dor lombar aguda",
] as const;

// Reference date
const SEED_DATE = new Date("2026-06-19T12:00:00Z");

type EpisodeStatus = "open" | "closed";
type RecordStatus = "draft" | "locked" | "signed";

function makeEpisodeId(n: number): string {
  return `de000005-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;
}

function makeRecordId(n: number): string {
  return `de000006-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;
}

function pick<T>(arr: readonly T[], idx: number): T {
  return arr[idx % arr.length] as T;
}

function sampleRecordData(templateKey: "osteopathy" | "physiotherapy", pi: number, ri: number): Record<string, unknown> {
  const episodeDate = new Date(SEED_DATE);
  episodeDate.setUTCDate(episodeDate.getUTCDate() - (30 + pi * 3 + ri * 7));
  const dateStr = episodeDate.toISOString().slice(0, 10);

  const reasons = [
    "Dor lombar com irradiação para a perna direita.",
    "Cervicalgia com limitação de rotação cervical.",
    "Dor no ombro com dificuldade em elevar o braço.",
    "Dor na região sacroilíaca.",
    "Tensão muscular generalizada com cefaleia.",
    "Dor nos glúteos com sensação de dormência na coxa.",
    "Limitação de mobilidade dorsal após trabalho prolongado em secretária.",
    "Dor no punho após esforço repetitivo.",
  ];

  if (templateKey === "osteopathy") {
    return {
      episode_date: dateStr,
      weight_kg: 60 + (pi * 3 + ri) % 40,
      height_cm: 155 + (pi + ri * 2) % 30,
      consultation_reason: pick(reasons, pi + ri),
      clinical_history: "Sem antecedentes relevantes.",
      treatment_plan: "Tratamento osteopático com foco na região lombar.",
      observations: "Boa tolerância à manipulação.",
    };
  } else {
    return {
      episode_date: dateStr,
      weight_kg: 60 + (pi * 3 + ri) % 40,
      height_cm: 155 + (pi + ri * 2) % 30,
      main_complaints: pick(reasons, pi + ri + 1),
      background: "Sem patologia de base relevante.",
      diagnosis: "Síndrome doloroso músculo-esquelético.",
      treatment_goals: "Redução da dor e recuperação funcional.",
      treatment_plan: "Fisioterapia com exercícios de reforço muscular e mobilização articular.",
    };
  }
}

// ─── Loader ───────────────────────────────────────────────────────────────────

async function seed() {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  // Resolve USR_1..5 to their REAL ids by (tenant, email); primary_practitioner_id,
  // practitioner_id and signed_by all flow from here, never a fixture constant (FA-1).
  const { ids: THERAPISTS } = await resolveDevUsers(db, TENANT_ID);

  // Query form template IDs by (tenant_id, key, version)
  const [ostRow] = await db
    .select({ id: formTemplates.id })
    .from(formTemplates)
    .where(
      and(
        eq(formTemplates.tenantId, TENANT_ID),
        eq(formTemplates.key, "osteopathy"),
        eq(formTemplates.version, 2),
      ),
    )
    .limit(1);

  const [fisRow] = await db
    .select({ id: formTemplates.id })
    .from(formTemplates)
    .where(
      and(
        eq(formTemplates.tenantId, TENANT_ID),
        eq(formTemplates.key, "physiotherapy"),
        eq(formTemplates.version, 4),
      ),
    )
    .limit(1);

  if (!ostRow || !fisRow) {
    console.error(
      "Error: form templates not found. Run seed:dev:reference first.\n" +
        `osteopathy-v2: ${ostRow ? "found" : "MISSING"}\n` +
        `physiotherapy-v4: ${fisRow ? "found" : "MISSING"}`,
    );
    process.exit(1);
  }

  const templateIds = {
    osteopathy: ostRow.id,
    physiotherapy: fisRow.id,
  } as const;

  type EpisodeRow = {
    id: string;
    tenantId: string;
    patientId: string;
    primaryPractitionerId: string;
    title: string;
    status: EpisodeStatus;
    openedAt: Date;
    closedAt?: Date;
  };

  type RecordRow = {
    id: string;
    tenantId: string;
    episodeId: string;
    patientId: string;
    practitionerId: string;
    formTemplateId: string;
    data: Record<string, unknown>;
    status: RecordStatus;
    signedAt?: Date;
    signedBy?: string;
  };

  const episodeRows: EpisodeRow[] = [];
  const recordRows: RecordRow[] = [];
  let episodeIdx = 0;
  let recordIdx = 0;

  for (let pi = 0; pi < EPISODE_PATIENT_IDS.length; pi++) {
    const patientId = EPISODE_PATIENT_IDS[pi] as string;
    const practitionerId = pick(THERAPISTS, pi);

    // 10 of the 30 patients get a second (older, closed) episode
    const numEpisodes = pi % 3 === 0 ? 2 : 1;

    for (let ei = 0; ei < numEpisodes; ei++) {
      // Older episodes are from further back; newer episodes within last 3 months
      const monthsAgo = ei === 0
        ? 1 + (pi % 3)          // first episode: 1-3 months ago (open)
        : 4 + (pi % 4);         // second episode: 4-7 months ago (closed)

      const openedAt = new Date(SEED_DATE);
      openedAt.setUTCMonth(openedAt.getUTCMonth() - monthsAgo);

      const isClosed = monthsAgo >= 4;
      const episodeStatus: EpisodeStatus = isClosed ? "closed" : "open";

      const closedAt = isClosed ? new Date(openedAt.getTime() + 60 * 24 * 60 * 60_000) : undefined;

      const titleBase = pick(EPISODE_TITLES, pi + ei * 5);
      const monthName = openedAt.toLocaleDateString("pt-PT", {
        month: "short",
        year: "numeric",
        timeZone: "Europe/Lisbon",
      });
      const title = `${titleBase} — ${monthName}`;

      const episodeId = makeEpisodeId(episodeIdx++);
      episodeRows.push({
        id: episodeId,
        tenantId: TENANT_ID,
        patientId,
        primaryPractitionerId: practitionerId,
        title,
        status: episodeStatus,
        openedAt,
        ...(closedAt ? { closedAt } : {}),
      });

      // Each episode gets 1-2 records
      const numRecords = pi % 2 === 0 ? 2 : 1;

      for (let ri = 0; ri < numRecords; ri++) {
        const templateKey: "osteopathy" | "physiotherapy" =
          (pi + ei) % 2 === 0 ? "osteopathy" : "physiotherapy";

        let recordStatus: RecordStatus;
        if (isClosed) {
          recordStatus = "signed";
        } else if (ri === 0) {
          recordStatus = "locked";
        } else {
          recordStatus = "draft";
        }

        const signedAt = recordStatus === "signed" ? closedAt : undefined;
        const signedBy = recordStatus === "signed" ? practitionerId : undefined;

        recordRows.push({
          id: makeRecordId(recordIdx++),
          tenantId: TENANT_ID,
          episodeId,
          patientId,
          practitionerId,
          formTemplateId: templateIds[templateKey],
          data: sampleRecordData(templateKey, pi, ri),
          status: recordStatus,
          ...(signedAt ? { signedAt } : {}),
          ...(signedBy ? { signedBy } : {}),
        });
      }
    }
  }

  console.log(
    `Seeding ${episodeRows.length} episodes, ${recordRows.length} records → tenant ${TENANT_ID}…`,
  );

  const insertedEp = await db
    .insert(clinicalEpisodes)
    .values(episodeRows)
    .onConflictDoNothing()
    .returning({ id: clinicalEpisodes.id });

  const insertedRec = await db
    .insert(clinicalRecords)
    .values(recordRows)
    .onConflictDoNothing()
    .returning({ id: clinicalRecords.id });

  console.log(
    `Done. episodes: inserted=${insertedEp.length} skipped=${episodeRows.length - insertedEp.length} | ` +
      `records: inserted=${insertedRec.length} skipped=${recordRows.length - insertedRec.length}`,
  );

  await sql.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
