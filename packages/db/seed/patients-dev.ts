/**
 * Seed — 50 realistic PT patients for the dev environment only.
 *
 * Supabase project: ufbkzbyghvxtosyrkgjq (dev)
 * Tenant:          3a2d0711-fbdb-4ce9-b940-b6a87e3d3560
 *
 * Fixed UUIDs per patient make the seed idempotent via onConflictDoNothing
 * on the primary key — re-running inserts nothing new.
 *
 * SAFETY: will refuse to run if DATABASE_URL contains the production project
 * ref (jaxmkwoxjcgzkwxgbayx). Point DATABASE_URL at the dev project before
 * running.
 *
 * Usage:
 *   DATABASE_URL=<dev-service-role-url> pnpm --filter @osteojp/db seed:patients:dev
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { patients } from "../src/schema";

const TENANT_ID = "3a2d0711-fbdb-4ce9-b940-b6a87e3d3560";
const PROD_REF = "jaxmkwoxjcgzkwxgbayx";

const DATABASE_URL = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Error: DATABASE_URL_DEV or DATABASE_URL is required");
  process.exit(1);
}
if (DATABASE_URL.includes(PROD_REF)) {
  console.error(
    `SAFETY: refusing to seed into production (${PROD_REF}).\n` +
      "Set DATABASE_URL_DEV or DATABASE_URL to the dev project (ufbkzbyghvxtosyrkgjq).",
  );
  process.exit(1);
}

// ─── Patient data ─────────────────────────────────────────────────────────────
// Fixed UUIDs → idempotent via primary-key conflict.
// authUserId intentionally absent — patients are un-activated.

const PATIENTS = [
  // ── Linda-a-Velha / Queijas / Barcarena / Carnaxide ──────────────────────
  { id: "0fe2d970-48e7-4031-9a89-cf19fcc2e284", fullName: "Maria João Silva", dateOfBirth: "1985-03-12", sex: "female", nif: "123456789", phone: "+351912345001", email: "maria.silva@email.pt", address: "Rua da Liberdade, 12", postalCode: "2795-001", city: "Linda-a-Velha" },
  { id: "69ccbe13-9f86-4928-8d94-435ba6f35d03", fullName: "António Manuel Costa", dateOfBirth: "1972-07-24", sex: "male", nif: "234567890", phone: "+351912345002", email: "antonio.costa@email.pt", address: "Avenida do Brasil, 45", postalCode: "2795-002", city: "Linda-a-Velha" },
  { id: "cae30d86-af77-4e61-b79c-57f94f62d471", fullName: "Ana Luísa Ferreira", dateOfBirth: "1990-11-08", sex: "female", nif: "345678901", phone: "+351912345003", email: "ana.ferreira@email.pt", address: "Travessa das Flores, 3", postalCode: "2795-003", city: "Queijas" },
  { id: "ddb9d1f5-8e59-4a5f-81e3-494f4e9e0695", fullName: "Carlos Alberto Rodrigues", dateOfBirth: "1968-05-15", sex: "male", nif: "456789012", phone: "+351912345004", email: "carlos.rodrigues@email.pt", address: "Rua de São João, 78", postalCode: "2795-004", city: "Linda-a-Velha" },
  { id: "707f4dc0-a455-4a35-806a-516a44dc8a2c", fullName: "Susana Isabel Martins", dateOfBirth: "1995-02-28", sex: "female", nif: "567890123", phone: "+351912345005", email: "susana.martins@email.pt", address: "Praça Central, 1", postalCode: "2795-246", city: "Linda-a-Velha" },
  { id: "fa3f78c4-057b-4e3f-b3e3-1e37372cf1ac", fullName: "Paulo Alexandre Sousa", dateOfBirth: "1980-09-03", sex: "male", nif: "678901234", phone: "+351912345006", email: "paulo.sousa@email.pt", address: "Rua das Acácias, 22", postalCode: "2795-005", city: "Barcarena" },
  { id: "348a53fd-b99c-4572-ab7a-7a1ad1f7d482", fullName: "Filipa Margarida Gonçalves", dateOfBirth: "1988-06-17", sex: "female", nif: "789012345", phone: "+351912345007", email: "filipa.goncalves@email.pt", address: "Alameda dos Pinheiros, 9", postalCode: "2795-006", city: "Linda-a-Velha" },
  { id: "0e8cfd18-7670-4a49-86e2-021c30189ec9", fullName: "Rui Miguel Carvalho", dateOfBirth: "1975-12-01", sex: "male", nif: "890123456", phone: "+351912345008", email: "rui.carvalho@email.pt", address: "Rua do Comércio, 56", postalCode: "2790-001", city: "Carnaxide" },
  { id: "dd7f2909-bb1f-4f27-a212-e2d004a4f39c", fullName: "Inês Catarina Lopes", dateOfBirth: "1993-04-22", sex: "female", nif: "901234567", phone: "+351912345009", email: "ines.lopes@email.pt", address: "Rua Nova, 14", postalCode: "2795-007", city: "Linda-a-Velha" },
  { id: "50c7c4d3-4b37-4bf0-b62b-0cfb131d82e3", fullName: "João Pedro Alves", dateOfBirth: "1982-08-30", sex: "male", nif: "012345678", phone: "+351912345010", email: "joao.alves@email.pt", address: "Beco da Esperança, 7", postalCode: "2795-008", city: "Queijas" },
  { id: "48b9fcb7-d5b0-4546-b13e-1b172e06eaf5", fullName: "Beatriz Alexandra Santos", dateOfBirth: "1997-01-14", sex: "female", nif: "112345678", phone: "+351912345011", email: "beatriz.santos@email.pt", address: "Estrada de Queluz, 33", postalCode: "2795-009", city: "Linda-a-Velha" },
  { id: "db53ead3-fcf1-47ac-a225-0dd4ebf0c14c", fullName: "Nuno Ricardo Pereira", dateOfBirth: "1970-10-06", sex: "male", nif: "212345678", phone: "+351912345012", email: "nuno.pereira@email.pt", address: "Rua da Igreja, 2", postalCode: "2795-010", city: "Barcarena" },
  { id: "9a703fa5-0551-4f00-80ae-e27dbc320fca", fullName: "Catarina Sofia Matos", dateOfBirth: "1986-03-25", sex: "female", nif: "312345678", phone: "+351912345013", email: "catarina.matos@email.pt", address: "Rua dos Castanheiros, 18", postalCode: "2795-011", city: "Linda-a-Velha" },
  { id: "2a85ed37-56ac-491d-8939-99c678730f19", fullName: "Hugo Filipe Teixeira", dateOfBirth: "1978-07-09", sex: "male", nif: "412345678", phone: "+351912345014", email: "hugo.teixeira@email.pt", address: "Urbanização do Parque, 5A", postalCode: "2795-012", city: "Linda-a-Velha" },
  { id: "a208a2ee-2e0e-4f9e-adcc-090664ae6ed0", fullName: "Margarida Leonor Nunes", dateOfBirth: "1991-11-20", sex: "female", nif: "512345678", phone: "+351912345015", email: "margarida.nunes@email.pt", address: "Rua das Magnólias, 41", postalCode: "2795-013", city: "Queijas" },
  { id: "40a02d7b-4b71-44ea-9321-6b45f9c7da75", fullName: "Ricardo José Oliveira", dateOfBirth: "1965-02-13", sex: "male", nif: "612345678", phone: "+351912345016", email: "ricardo.oliveira@email.pt", address: "Avenida Marginal, 100", postalCode: "2795-014", city: "Linda-a-Velha" },
  { id: "77d37dd2-7ab7-460c-b15b-f8f3190828f7", fullName: "Sara Filomena Pinto", dateOfBirth: "1994-05-31", sex: "female", nif: "712345678", phone: "+351912345017", email: "sara.pinto@email.pt", address: "Rua do Moinho, 27", postalCode: "2795-015", city: "Barcarena" },
  { id: "9be6de48-a919-4f82-8d88-22bc64a8145d", fullName: "Marco António Fernandes", dateOfBirth: "1983-09-16", sex: "male", nif: "812345678", phone: "+351912345018", email: "marco.fernandes@email.pt", address: "Travessa do Mercado, 8", postalCode: "2795-016", city: "Linda-a-Velha" },
  { id: "97bf93d2-793c-49d5-a4bc-8136947d8d04", fullName: "Joana Cristina Ribeiro", dateOfBirth: "1989-12-04", sex: "female", nif: "912345678", phone: "+351912345019", email: "joana.ribeiro@email.pt", address: "Rua da Paz, 63", postalCode: "2795-017", city: "Linda-a-Velha" },
  { id: "d3c1e7dc-66ae-4d74-88bd-21494b28fe7b", fullName: "Diogo Alexandre Cruz", dateOfBirth: "1976-04-27", sex: "male", nif: "132345678", phone: "+351912345020", email: "diogo.cruz@email.pt", address: "Rua das Amendoeiras, 15", postalCode: "2795-018", city: "Queijas" },
  { id: "932c1040-ec09-47ab-9352-82cc34d62b8e", fullName: "Liliana Patrícia Gomes", dateOfBirth: "1992-08-11", sex: "female", nif: "232345678", phone: "+351912345021", email: "liliana.gomes@email.pt", address: "Avenida das Nações, 77", postalCode: "2795-019", city: "Linda-a-Velha" },
  { id: "bad42b62-4ed5-45d9-b666-9e00c80c33d2", fullName: "Tiago Filipe Henriques", dateOfBirth: "1987-01-29", sex: "male", nif: "332345678", phone: "+351912345022", email: "tiago.henriques@email.pt", address: "Rua do Jardim, 4", postalCode: "2795-020", city: "Linda-a-Velha" },
  { id: "5dc24f5a-434f-402b-867c-07baace1a16d", fullName: "Mónica Isabel Correia", dateOfBirth: "1973-06-18", sex: "female", nif: "432345678", phone: "+351912345023", email: "monica.correia@email.pt", address: "Largo da Fonte, 12", postalCode: "2795-021", city: "Barcarena" },
  { id: "65a8419b-a982-4e22-b01a-40f9f165b07a", fullName: "Vítor Manuel Barbosa", dateOfBirth: "1969-10-05", sex: "male", nif: "532345678", phone: "+351912345024", email: "vitor.barbosa@email.pt", address: "Rua do Sol, 38", postalCode: "2795-022", city: "Linda-a-Velha" },
  { id: "5e88b11d-de8b-4092-8abf-f8fcd58e05ef", fullName: "Daniela Sofia Monteiro", dateOfBirth: "1996-03-07", sex: "female", nif: "632345678", phone: "+351912345025", email: "daniela.monteiro@email.pt", address: "Rua da Vitória, 21", postalCode: "2795-023", city: "Linda-a-Velha" },

  // ── Castelo Branco ────────────────────────────────────────────────────────
  { id: "cc82ffec-2d2c-441a-b2a9-2edb6dfe0176", fullName: "Fernando Jorge Mendes", dateOfBirth: "1971-11-22", sex: "male", nif: "732345678", phone: "+351969345001", email: "fernando.mendes@email.pt", address: "Rua Fernando Namora, 10", postalCode: "6000-140", city: "Castelo Branco" },
  { id: "ceb05564-9a29-4dba-9a3c-28ab7aa7cecc", fullName: "Paula Cristina Vieira", dateOfBirth: "1984-04-15", sex: "female", nif: "832345678", phone: "+351969345002", email: "paula.vieira@email.pt", address: "Avenida 1º de Maio, 55", postalCode: "6000-082", city: "Castelo Branco" },
  { id: "62034369-26a0-4f8a-b679-b36917bd0a80", fullName: "Luís Filipe Cardoso", dateOfBirth: "1979-08-03", sex: "male", nif: "932345678", phone: "+351969345003", email: "luis.cardoso@email.pt", address: "Rua do Município, 23", postalCode: "6000-164", city: "Castelo Branco" },
  { id: "d1573d09-f0e6-4f10-9755-4302b610185c", fullName: "Cristina Maria Moreira", dateOfBirth: "1993-12-19", sex: "female", nif: "142345678", phone: "+351969345004", email: "cristina.moreira@email.pt", address: "Quinta da Granja, 6", postalCode: "6000-140", city: "Castelo Branco" },
  { id: "a4dcca0a-2a01-4bd9-9b4b-5ac7dac1c6c7", fullName: "André Luís Fonseca", dateOfBirth: "1981-05-08", sex: "male", nif: "242345678", phone: "+351969345005", email: "andre.fonseca@email.pt", address: "Rua da Sé, 34", postalCode: "6000-210", city: "Castelo Branco" },
  { id: "27526e1a-2ef0-4f2b-996c-8473400811ed", fullName: "Vera Lúcia Simões", dateOfBirth: "1988-09-26", sex: "female", nif: "342345678", phone: "+351969345006", email: "vera.simoes@email.pt", address: "Rua das Hortênsias, 7", postalCode: "6000-091", city: "Castelo Branco" },
  { id: "133e04e8-8aca-4a29-b3a1-4bb3e544e33c", fullName: "Hélder António Ramos", dateOfBirth: "1974-02-14", sex: "male", nif: "442345678", phone: "+351969345007", email: "helder.ramos@email.pt", address: "Alameda da Liberdade, 18", postalCode: "6000-165", city: "Castelo Branco" },
  { id: "d85dccc2-3941-47d4-82c9-2d94af970617", fullName: "Cláudia Isabel Esteves", dateOfBirth: "1990-06-30", sex: "female", nif: "542345678", phone: "+351969345008", email: "claudia.esteves@email.pt", address: "Rua Dr. Manuel de Arriaga, 9", postalCode: "6000-183", city: "Castelo Branco" },
  { id: "b09919d8-4fd4-4897-8e92-e9c8bf9c103c", fullName: "Pedro Miguel Cunha", dateOfBirth: "1977-10-17", sex: "male", nif: "642345678", phone: "+351969345009", email: "pedro.cunha@email.pt", address: "Bairro de São Marcos, 45", postalCode: "6000-267", city: "Castelo Branco" },
  { id: "039507aa-1757-4336-bd13-d754c3035503", fullName: "Teresa Raquel Marques", dateOfBirth: "1986-01-23", sex: "female", nif: "742345678", phone: "+351969345010", email: "teresa.marques@email.pt", address: "Rua Infante D. Henrique, 30", postalCode: "6000-201", city: "Castelo Branco" },
  { id: "67ac8805-cd06-47bd-84be-c91fcac462fc", fullName: "Sérgio Alexandre Branco", dateOfBirth: "1983-07-05", sex: "male", nif: "842345678", phone: "+351969345011", email: "sergio.branco@email.pt", address: "Rua das Palmeiras, 16", postalCode: "6000-092", city: "Castelo Branco" },
  { id: "09bee31a-1a85-4c2a-93fe-7daf29596230", fullName: "Patrícia Manuela Leite", dateOfBirth: "1995-11-12", sex: "female", nif: "942345678", phone: "+351969345012", email: "patricia.leite@email.pt", address: "Urbanização dos Pinheiros, 3", postalCode: "6000-273", city: "Castelo Branco" },
  { id: "219c379d-bb41-4f98-af66-5fab4ebd777e", fullName: "Joaquim Manuel Pires", dateOfBirth: "1966-03-28", sex: "male", nif: "152345678", phone: "+351969345013", email: "joaquim.pires@email.pt", address: "Rua da República, 67", postalCode: "6000-208", city: "Castelo Branco" },
  { id: "9d8be306-08b7-46c0-8a36-7e0fee0c882a", fullName: "Alexandra Filipa Coelho", dateOfBirth: "1991-07-16", sex: "female", nif: "252345678", phone: "+351969345014", email: "alexandra.coelho@email.pt", address: "Rua das Acácias, 11", postalCode: "6000-085", city: "Castelo Branco" },
  { id: "34a259d4-c112-489e-bf7a-c2fdf41abf88", fullName: "Bruno Alexandre Ferraz", dateOfBirth: "1980-12-09", sex: "male", nif: "352345678", phone: "+351969345015", email: "bruno.ferraz@email.pt", address: "Avenida Nuno Álvares, 88", postalCode: "6000-195", city: "Castelo Branco" },
  { id: "cf41a621-32d5-4f5a-8649-b035f503dee4", fullName: "Vanessa Sofia Leal", dateOfBirth: "1994-04-01", sex: "female", nif: "452345678", phone: "+351969345016", email: "vanessa.leal@email.pt", address: "Rua do Castelo, 5", postalCode: "6000-123", city: "Castelo Branco" },
  { id: "1cc83f13-427e-43ea-bd8e-9f014f5b7e2e", fullName: "Gonçalo Nuno Baptista", dateOfBirth: "1985-08-24", sex: "male", nif: "552345678", phone: "+351969345017", email: "goncalo.baptista@email.pt", address: "Rua das Oliveiras, 29", postalCode: "6000-241", city: "Castelo Branco" },
  { id: "7e0e64c5-352f-44f2-9321-b0e2e2c4a221", fullName: "Raquel Isabel Antunes", dateOfBirth: "1978-05-13", sex: "female", nif: "652345678", phone: "+351969345018", email: "raquel.antunes@email.pt", address: "Beco dos Cedros, 2", postalCode: "6000-098", city: "Castelo Branco" },
  { id: "f4023ee3-471b-4e5a-98f6-31675616a993", fullName: "Miguel Ângelo Tavares", dateOfBirth: "1967-09-07", sex: "male", nif: "752345678", phone: "+351969345019", email: "miguel.tavares@email.pt", address: "Rua do Progresso, 42", postalCode: "6000-214", city: "Castelo Branco" },
  { id: "4b03dda1-76e0-4aae-ba93-eb86362c81da", fullName: "Sónia Cristina Peixoto", dateOfBirth: "1992-02-20", sex: "female", nif: "852345678", phone: "+351969345020", email: "sonia.peixoto@email.pt", address: "Travessa da Fonte, 8", postalCode: "6000-133", city: "Castelo Branco" },
  { id: "98314f59-9f73-478a-b44c-a7b03a2cad1a", fullName: "Artur Filipe Nascimento", dateOfBirth: "1975-06-11", sex: "male", nif: "952345678", phone: "+351969345021", email: "artur.nascimento@email.pt", address: "Rua do Parque, 53", postalCode: "6000-249", city: "Castelo Branco" },
  { id: "780ede8c-1409-43cc-a0a0-7859b9a204b8", fullName: "Elisa Maria Figueiredo", dateOfBirth: "1989-10-29", sex: "female", nif: "162345678", phone: "+351969345022", email: "elisa.figueiredo@email.pt", address: "Rua das Rosas, 17", postalCode: "6000-178", city: "Castelo Branco" },
  { id: "0ae117f7-7cd6-40d7-a1b8-0c7856a2d6c8", fullName: "Nelson Jorge Pacheco", dateOfBirth: "1982-03-04", sex: "male", nif: "262345678", phone: "+351969345023", email: "nelson.pacheco@email.pt", address: "Rua Cidade de Viseu, 6", postalCode: "6000-106", city: "Castelo Branco" },
  { id: "ace7f7be-0936-4aa3-9e11-67201fca3fe7", fullName: "Célia Marisa Valente", dateOfBirth: "1997-07-18", sex: "female", nif: "362345678", phone: "+351969345024", email: "celia.valente@email.pt", address: "Avenida do Atlântico, 31", postalCode: "6000-257", city: "Castelo Branco" },
  { id: "5a66f8b7-85e4-4f05-bbe8-49997b11a88b", fullName: "Álvaro Filipe Machado", dateOfBirth: "1973-01-25", sex: "male", nif: "462345678", phone: "+351969345025", email: "alvaro.machado@email.pt", address: "Rua dos Plátanos, 44", postalCode: "6000-189", city: "Castelo Branco" },
] as const;

// ─── Loader ───────────────────────────────────────────────────────────────────

async function seed() {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  console.log(`Seeding ${PATIENTS.length} patients → tenant ${TENANT_ID}…`);

  const inserted = await db
    .insert(patients)
    .values(
      PATIENTS.map((p) => ({
        id: p.id,
        tenantId: TENANT_ID,
        fullName: p.fullName,
        dateOfBirth: p.dateOfBirth,
        sex: p.sex,
        nif: p.nif,
        phone: p.phone,
        email: p.email,
        address: p.address,
        postalCode: p.postalCode,
        city: p.city,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: patients.id });

  const skipped = PATIENTS.length - inserted.length;
  console.log(`Done. inserted=${inserted.length} skipped=${skipped} total=${PATIENTS.length}`);

  await sql.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
