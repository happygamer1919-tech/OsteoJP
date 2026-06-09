/**
 * Seed — 50 fake patients for QA / dev.
 *
 * Realistic Portuguese names, addresses (Linda-a-Velha + Castelo Branco area),
 * NIF-format numbers, varied DOB/sex. No auth_user_id — patients are
 * un-activated so the portal login flow can be tested from scratch.
 *
 * Usage:
 *   pnpm --filter @osteojp/db seed:patients -- --tenant <tenant_id>
 *
 * Runs with service-role credentials (RLS bypass). Idempotent — upserts on
 * (tenant_id, full_name, date_of_birth). Safe to run multiple times.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { patients } from "../src/schema";
import { and, eq } from "drizzle-orm";

const TENANT_ID = process.env.SEED_TENANT_ID ?? process.argv[process.argv.indexOf("--tenant") + 1];

if (!TENANT_ID) {
  console.error("Error: --tenant <tenant_id> is required");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Error: DATABASE_URL or DATABASE_URL_DIRECT is required");
  process.exit(1);
}

// ─── Patient data ─────────────────────────────────────────────────────────────

const PATIENT_DATA = [
  // Linda-a-Velha area
  { fullName: "Maria João Silva", dateOfBirth: "1985-03-12", sex: "female", nif: "123456789", phone: "+351912345001", email: "maria.silva@email.pt", address: "Rua da Liberdade, 12", postalCode: "2795-001", city: "Linda-a-Velha" },
  { fullName: "António Manuel Costa", dateOfBirth: "1972-07-24", sex: "male", nif: "234567890", phone: "+351912345002", email: "antonio.costa@email.pt", address: "Avenida do Brasil, 45", postalCode: "2795-002", city: "Linda-a-Velha" },
  { fullName: "Ana Luísa Ferreira", dateOfBirth: "1990-11-08", sex: "female", nif: "345678901", phone: "+351912345003", email: "ana.ferreira@email.pt", address: "Travessa das Flores, 3", postalCode: "2795-003", city: "Queijas" },
  { fullName: "Carlos Alberto Rodrigues", dateOfBirth: "1968-05-15", sex: "male", nif: "456789012", phone: "+351912345004", email: "carlos.rodrigues@email.pt", address: "Rua de São João, 78", postalCode: "2795-004", city: "Linda-a-Velha" },
  { fullName: "Susana Isabel Martins", dateOfBirth: "1995-02-28", sex: "female", nif: "567890123", phone: "+351912345005", email: "susana.martins@email.pt", address: "Praça Central, 1", postalCode: "2795-246", city: "Linda-a-Velha" },
  { fullName: "Paulo Alexandre Sousa", dateOfBirth: "1980-09-03", sex: "male", nif: "678901234", phone: "+351912345006", email: "paulo.sousa@email.pt", address: "Rua das Acácias, 22", postalCode: "2795-005", city: "Barcarena" },
  { fullName: "Filipa Margarida Gonçalves", dateOfBirth: "1988-06-17", sex: "female", nif: "789012345", phone: "+351912345007", email: "filipa.goncalves@email.pt", address: "Alameda dos Pinheiros, 9", postalCode: "2795-006", city: "Linda-a-Velha" },
  { fullName: "Rui Miguel Carvalho", dateOfBirth: "1975-12-01", sex: "male", nif: "890123456", phone: "+351912345008", email: "rui.carvalho@email.pt", address: "Rua do Comércio, 56", postalCode: "2790-001", city: "Carnaxide" },
  { fullName: "Inês Catarina Lopes", dateOfBirth: "1993-04-22", sex: "female", nif: "901234567", phone: "+351912345009", email: "ines.lopes@email.pt", address: "Rua Nova, 14", postalCode: "2795-007", city: "Linda-a-Velha" },
  { fullName: "João Pedro Alves", dateOfBirth: "1982-08-30", sex: "male", nif: "012345678", phone: "+351912345010", email: "joao.alves@email.pt", address: "Beco da Esperança, 7", postalCode: "2795-008", city: "Queijas" },
  { fullName: "Beatriz Alexandra Santos", dateOfBirth: "1997-01-14", sex: "female", nif: "112345678", phone: "+351912345011", email: "beatriz.santos@email.pt", address: "Estrada de Queluz, 33", postalCode: "2795-009", city: "Linda-a-Velha" },
  { fullName: "Nuno Ricardo Pereira", dateOfBirth: "1970-10-06", sex: "male", nif: "212345678", phone: "+351912345012", email: "nuno.pereira@email.pt", address: "Rua da Igreja, 2", postalCode: "2795-010", city: "Barcarena" },
  { fullName: "Catarina Sofia Matos", dateOfBirth: "1986-03-25", sex: "female", nif: "312345678", phone: "+351912345013", email: "catarina.matos@email.pt", address: "Rua dos Castanheiros, 18", postalCode: "2795-011", city: "Linda-a-Velha" },
  { fullName: "Hugo Filipe Teixeira", dateOfBirth: "1978-07-09", sex: "male", nif: "412345678", phone: "+351912345014", email: "hugo.teixeira@email.pt", address: "Urbanização do Parque, 5A", postalCode: "2795-012", city: "Linda-a-Velha" },
  { fullName: "Margarida Leonor Nunes", dateOfBirth: "1991-11-20", sex: "female", nif: "512345678", phone: "+351912345015", email: "margarida.nunes@email.pt", address: "Rua das Magnólias, 41", postalCode: "2795-013", city: "Queijas" },
  { fullName: "Ricardo José Oliveira", dateOfBirth: "1965-02-13", sex: "male", nif: "612345678", phone: "+351912345016", email: "ricardo.oliveira@email.pt", address: "Avenida Marginal, 100", postalCode: "2795-014", city: "Linda-a-Velha" },
  { fullName: "Sara Filomena Pinto", dateOfBirth: "1994-05-31", sex: "female", nif: "712345678", phone: "+351912345017", email: "sara.pinto@email.pt", address: "Rua do Moinho, 27", postalCode: "2795-015", city: "Barcarena" },
  { fullName: "Marco António Fernandes", dateOfBirth: "1983-09-16", sex: "male", nif: "812345678", phone: "+351912345018", email: "marco.fernandes@email.pt", address: "Travessa do Mercado, 8", postalCode: "2795-016", city: "Linda-a-Velha" },
  { fullName: "Joana Cristina Ribeiro", dateOfBirth: "1989-12-04", sex: "female", nif: "912345678", phone: "+351912345019", email: "joana.ribeiro@email.pt", address: "Rua da Paz, 63", postalCode: "2795-017", city: "Linda-a-Velha" },
  { fullName: "Diogo Alexandre Cruz", dateOfBirth: "1976-04-27", sex: "male", nif: "132345678", phone: "+351912345020", email: "diogo.cruz@email.pt", address: "Rua das Amendoeiras, 15", postalCode: "2795-018", city: "Queijas" },
  { fullName: "Liliana Patrícia Gomes", dateOfBirth: "1992-08-11", sex: "female", nif: "232345678", phone: "+351912345021", email: "liliana.gomes@email.pt", address: "Avenida das Nações, 77", postalCode: "2795-019", city: "Linda-a-Velha" },
  { fullName: "Tiago Filipe Henriques", dateOfBirth: "1987-01-29", sex: "male", nif: "332345678", phone: "+351912345022", email: "tiago.henriques@email.pt", address: "Rua do Jardim, 4", postalCode: "2795-020", city: "Linda-a-Velha" },
  { fullName: "Mónica Isabel Correia", dateOfBirth: "1973-06-18", sex: "female", nif: "432345678", phone: "+351912345023", email: "monica.correia@email.pt", address: "Largo da Fonte, 12", postalCode: "2795-021", city: "Barcarena" },
  { fullName: "Vítor Manuel Barbosa", dateOfBirth: "1969-10-05", sex: "male", nif: "532345678", phone: "+351912345024", email: "vitor.barbosa@email.pt", address: "Rua do Sol, 38", postalCode: "2795-022", city: "Linda-a-Velha" },
  { fullName: "Daniela Sofia Monteiro", dateOfBirth: "1996-03-07", sex: "female", nif: "632345678", phone: "+351912345025", email: "daniela.monteiro@email.pt", address: "Rua da Vitória, 21", postalCode: "2795-023", city: "Linda-a-Velha" },

  // Castelo Branco area
  { fullName: "Fernando Jorge Mendes", dateOfBirth: "1971-11-22", sex: "male", nif: "732345678", phone: "+351969345001", email: "fernando.mendes@email.pt", address: "Rua Fernando Namora, 10", postalCode: "6000-140", city: "Castelo Branco" },
  { fullName: "Paula Cristina Vieira", dateOfBirth: "1984-04-15", sex: "female", nif: "832345678", phone: "+351969345002", email: "paula.vieira@email.pt", address: "Avenida 1º de Maio, 55", postalCode: "6000-082", city: "Castelo Branco" },
  { fullName: "Luís Filipe Cardoso", dateOfBirth: "1979-08-03", sex: "male", nif: "932345678", phone: "+351969345003", email: "luis.cardoso@email.pt", address: "Rua do Município, 23", postalCode: "6000-164", city: "Castelo Branco" },
  { fullName: "Cristina Maria Moreira", dateOfBirth: "1993-12-19", sex: "female", nif: "142345678", phone: "+351969345004", email: "cristina.moreira@email.pt", address: "Quinta da Granja, 6", postalCode: "6000-140", city: "Castelo Branco" },
  { fullName: "André Luís Fonseca", dateOfBirth: "1981-05-08", sex: "male", nif: "242345678", phone: "+351969345005", email: "andre.fonseca@email.pt", address: "Rua da Sé, 34", postalCode: "6000-210", city: "Castelo Branco" },
  { fullName: "Vera Lúcia Simões", dateOfBirth: "1988-09-26", sex: "female", nif: "342345678", phone: "+351969345006", email: "vera.simoes@email.pt", address: "Rua das Hortênsias, 7", postalCode: "6000-091", city: "Castelo Branco" },
  { fullName: "Hélder António Ramos", dateOfBirth: "1974-02-14", sex: "male", nif: "442345678", phone: "+351969345007", email: "helder.ramos@email.pt", address: "Alameda da Liberdade, 18", postalCode: "6000-165", city: "Castelo Branco" },
  { fullName: "Cláudia Isabel Esteves", dateOfBirth: "1990-06-30", sex: "female", nif: "542345678", phone: "+351969345008", email: "claudia.esteves@email.pt", address: "Rua Dr. Manuel de Arriaga, 9", postalCode: "6000-183", city: "Castelo Branco" },
  { fullName: "Pedro Miguel Cunha", dateOfBirth: "1977-10-17", sex: "male", nif: "642345678", phone: "+351969345009", email: "pedro.cunha@email.pt", address: "Bairro de São Marcos, 45", postalCode: "6000-267", city: "Castelo Branco" },
  { fullName: "Teresa Raquel Marques", dateOfBirth: "1986-01-23", sex: "female", nif: "742345678", phone: "+351969345010", email: "teresa.marques@email.pt", address: "Rua Infante D. Henrique, 30", postalCode: "6000-201", city: "Castelo Branco" },
  { fullName: "Sérgio Alexandre Branco", dateOfBirth: "1983-07-05", sex: "male", nif: "842345678", phone: "+351969345011", email: "sergio.branco@email.pt", address: "Rua das Palmeiras, 16", postalCode: "6000-092", city: "Castelo Branco" },
  { fullName: "Patrícia Manuela Leite", dateOfBirth: "1995-11-12", sex: "female", nif: "942345678", phone: "+351969345012", email: "patricia.leite@email.pt", address: "Urbanização dos Pinheiros, 3", postalCode: "6000-273", city: "Castelo Branco" },
  { fullName: "Joaquim Manuel Pires", dateOfBirth: "1966-03-28", sex: "male", nif: "152345678", phone: "+351969345013", email: "joaquim.pires@email.pt", address: "Rua da República, 67", postalCode: "6000-208", city: "Castelo Branco" },
  { fullName: "Alexandra Filipa Coelho", dateOfBirth: "1991-07-16", sex: "female", nif: "252345678", phone: "+351969345014", email: "alexandra.coelho@email.pt", address: "Rua das Acácias, 11", postalCode: "6000-085", city: "Castelo Branco" },
  { fullName: "Bruno Alexandre Ferraz", dateOfBirth: "1980-12-09", sex: "male", nif: "352345678", phone: "+351969345015", email: "bruno.ferraz@email.pt", address: "Avenida Nuno Álvares, 88", postalCode: "6000-195", city: "Castelo Branco" },
  { fullName: "Vanessa Sofia Leal", dateOfBirth: "1994-04-01", sex: "female", nif: "452345678", phone: "+351969345016", email: "vanessa.leal@email.pt", address: "Rua do Castelo, 5", postalCode: "6000-123", city: "Castelo Branco" },
  { fullName: "Gonçalo Nuno Baptista", dateOfBirth: "1985-08-24", sex: "male", nif: "552345678", phone: "+351969345017", email: "goncalo.baptista@email.pt", address: "Rua das Oliveiras, 29", postalCode: "6000-241", city: "Castelo Branco" },
  { fullName: "Raquel Isabel Antunes", dateOfBirth: "1978-05-13", sex: "female", nif: "652345678", phone: "+351969345018", email: "raquel.antunes@email.pt", address: "Beco dos Cedros, 2", postalCode: "6000-098", city: "Castelo Branco" },
  { fullName: "Miguel Ângelo Tavares", dateOfBirth: "1967-09-07", sex: "male", nif: "752345678", phone: "+351969345019", email: "miguel.tavares@email.pt", address: "Rua do Progresso, 42", postalCode: "6000-214", city: "Castelo Branco" },
  { fullName: "Sónia Cristina Peixoto", dateOfBirth: "1992-02-20", sex: "female", nif: "852345678", phone: "+351969345020", email: "sonia.peixoto@email.pt", address: "Travessa da Fonte, 8", postalCode: "6000-133", city: "Castelo Branco" },
  { fullName: "Artur Filipe Nascimento", dateOfBirth: "1975-06-11", sex: "male", nif: "952345678", phone: "+351969345021", email: "artur.nascimento@email.pt", address: "Rua do Parque, 53", postalCode: "6000-249", city: "Castelo Branco" },
  { fullName: "Elisa Maria Figueiredo", dateOfBirth: "1989-10-29", sex: "female", nif: "162345678", phone: "+351969345022", email: "elisa.figueiredo@email.pt", address: "Rua das Rosas, 17", postalCode: "6000-178", city: "Castelo Branco" },
  { fullName: "Nelson Jorge Pacheco", dateOfBirth: "1982-03-04", sex: "male", nif: "262345678", phone: "+351969345023", email: "nelson.pacheco@email.pt", address: "Rua Cidade de Viseu, 6", postalCode: "6000-106", city: "Castelo Branco" },
  { fullName: "Célia Marisa Valente", dateOfBirth: "1997-07-18", sex: "female", nif: "362345678", phone: "+351969345024", email: "celia.valente@email.pt", address: "Avenida do Atlântico, 31", postalCode: "6000-257", city: "Castelo Branco" },
  { fullName: "Álvaro Filipe Machado", dateOfBirth: "1973-01-25", sex: "male", nif: "462345678", phone: "+351969345025", email: "alvaro.machado@email.pt", address: "Rua dos Plátanos, 44", postalCode: "6000-189", city: "Castelo Branco" },
] as const;

// ─── Loader ───────────────────────────────────────────────────────────────────

async function seedPatients() {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  console.log(`Seeding ${PATIENT_DATA.length} patients for tenant ${TENANT_ID}…`);

  let inserted = 0;
  let skipped = 0;

  for (const patient of PATIENT_DATA) {
    // Check if already exists (idempotent)
    const existing = await db
      .select({ id: patients.id })
      .from(patients)
      .where(
        and(
          eq(patients.tenantId, TENANT_ID!),
          eq(patients.fullName, patient.fullName),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await db.insert(patients).values({
      tenantId: TENANT_ID!,
      fullName: patient.fullName,
      dateOfBirth: patient.dateOfBirth,
      sex: patient.sex,
      nif: patient.nif,
      phone: patient.phone,
      email: patient.email,
      address: patient.address,
      postalCode: patient.postalCode,
      city: patient.city,
      // authUserId intentionally null — patient is un-activated
      // Staff can activate via the platform invite flow
    });
    inserted++;
  }

  console.log(`Done. inserted=${inserted} skipped=${skipped} total=${PATIENT_DATA.length}`);
  await sql.end();
}

seedPatients().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
