#!/usr/bin/env node
// The guide's own clinic: a populated, fixed week of INVENTED people on a
// LOCAL stack, for the screenshots of Suporte e Guia (G1-5).
//
//   node docs/guide/build/seed-guide.mjs --lane amber      a lane from scripts/lane-stack.mjs
//   node docs/guide/build/seed-guide.mjs                    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment
//
// It writes a tenant of its own, "Clínica Exemplo", beside the e2e fixture:
// its own staff accounts, two locations, three services and a pack with prices, working
// hours, sixteen patients, their past visits and the week of 5 to 10 October
// 2026 in the agenda. A capture logs in as one of GUIDE_ACCOUNTS and so sees
// only this tenant: no e2e name ("E2E Therapist") ever reaches a guide image.
//
// EVERY NAME HERE IS INVENTED, in one style: a real first name and a surname
// that is a word ("Exemplo", "Fictício", "Modelo", "Amostra", "Inventado").
// The repository is public; the names check (guide-names.mjs) scans this file.
//
// It REFUSES any target that is not local, through scripts/local-target.mjs
// (the host must be one of packages/db/seed/local-target.ts's
// ALLOWED_LOCAL_HOSTS). The service key is read from the lane's own
// "supabase status" and is never printed.
//
// Idempotent: every row has a fixed id and is upserted; the guide staff's
// working hours are deleted and written again. Nothing outside the guide
// tenant is written.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertLocalTarget } from '../../../scripts/local-target.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

export const GUIDE_TENANT = '00000000-0000-0000-0000-0000000000c1';
/** The local password of every guide account. Valid only on a local stack this script seeded. */
export const GUIDE_PASSWORD = 'GuiaExemplo1!';

/** The account a capture logs in as, by guide profile. */
// Início greets by the first word of the e-mail, so each address starts with
// the person's invented first name.
export const GUIDE_ACCOUNTS = Object.freeze({
  rececao: 'rita.exemplo@clinica-exemplo.test',
  terapeuta: 'bruno.ficticio@clinica-exemplo.test',
  proprietario: 'helena.exemplo@clinica-exemplo.test',
  admin: 'artur.modelo@clinica-exemplo.test',
});

/** The Monday of the guide's week; a capture opens the agenda and Início on it. */
export const GUIDE_WEEK = '2026-10-05';
/** The day a capture opens on Início and the agenda day view: the Tuesday of that week. */
export const GUIDE_DAY = '2026-10-06';

const LOC_SEDE = '00000000-0000-0000-0000-00000000c101';
const LOC_POLO = '00000000-0000-0000-0000-00000000c102';

const SRV_OSTEO = '00000000-0000-0000-0000-00000000c201';
const SRV_FISIO = '00000000-0000-0000-0000-00000000c202';
const SRV_REAV = '00000000-0000-0000-0000-00000000c203';
const PACK_OSTEO = '00000000-0000-0000-0000-00000000c211';

const STAFF = [
  { key: 'rececao', email: GUIDE_ACCOUNTS.rececao, role: 'reception', fullName: 'Rita Exemplo', jobTitle: null },
  { key: 'terapeuta', email: GUIDE_ACCOUNTS.terapeuta, role: 'therapist', fullName: 'Bruno Fictício', jobTitle: 'Osteopata' },
  { key: 'carla', email: 'carla.modelo@clinica-exemplo.test', role: 'therapist', fullName: 'Carla Modelo', jobTitle: 'Fisioterapeuta' },
  { key: 'duarte', email: 'duarte.inventado@clinica-exemplo.test', role: 'therapist', fullName: 'Duarte Inventado', jobTitle: 'Osteopata' },
  { key: 'proprietario', email: GUIDE_ACCOUNTS.proprietario, role: 'owner', fullName: 'Helena Exemplo', jobTitle: null },
  { key: 'admin', email: GUIDE_ACCOUNTS.admin, role: 'admin', fullName: 'Artur Modelo', jobTitle: null },
];

// Sixteen patients. created_by is the therapist who follows them, so the
// therapist's own list is populated (W10-04), and each is on that therapist's
// care team (CARE-01).
const PATIENTS = [
  ['Marta Exemplo', 'terapeuta', '1984-03-12', 'F'],
  ['Tiago Fictício', 'terapeuta', '1979-11-02', 'M'],
  ['Sofia Amostra', 'carla', '1991-06-25', 'F'],
  ['Rui Inventado', 'duarte', '1968-01-30', 'M'],
  ['Inês Modelo', 'terapeuta', '1995-09-14', 'F'],
  ['Paulo Exemplo', 'carla', '1957-04-08', 'M'],
  ['Lara Fictícia', 'duarte', '1988-12-19', 'F'],
  ['Nuno Amostra', 'terapeuta', '1973-07-03', 'M'],
  ['Vera Inventada', 'carla', '1982-02-27', 'F'],
  ['Gonçalo Modelo', 'duarte', '2001-10-11', 'M'],
  ['Beatriz Exemplo', 'terapeuta', '1999-05-05', 'F'],
  ['Hugo Fictício', 'carla', '1965-08-21', 'M'],
  ['Clara Amostra', 'duarte', '1990-03-03', 'F'],
  ['Filipe Inventado', 'terapeuta', '1986-06-16', 'M'],
  ['Teresa Modelo', 'carla', '1949-09-09', 'F'],
  ['Miguel Exemplo', 'duarte', '1977-01-17', 'M'],
].map(([fullName, owner, dateOfBirth, sex], i) => {
  const n = String(i + 1).padStart(2, '0');
  const slug = fullName
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/ /g, '.');
  return {
    id: `00000000-0000-0000-0000-00000000c3${n}`,
    fullName,
    owner,
    dateOfBirth,
    sex,
    nif: `9990000${n}`,
    phone: `+351 910 000 1${n}`,
    email: `${slug}@exemplo.test`,
  };
});

// The week, one row per booking: [day offset from Monday, "HH:MM", minutes,
// therapist key, patient index, service, location, status, confirmation].
// October 2026 in Lisbon is UTC+1 until the 25th, so every time carries +01:00.
const WEEK = [
  [0, '09:00', 60, 'terapeuta', 0, SRV_OSTEO, LOC_SEDE, 'scheduled', 'confirmed'],
  [0, '10:00', 60, 'terapeuta', 1, SRV_OSTEO, LOC_SEDE, 'scheduled', 'pending'],
  [0, '11:30', 30, 'terapeuta', 4, SRV_REAV, LOC_SEDE, 'scheduled', 'pending'],
  [0, '14:00', 60, 'terapeuta', 7, SRV_OSTEO, LOC_SEDE, 'scheduled', 'confirmed'],
  [0, '09:30', 45, 'carla', 2, SRV_FISIO, LOC_SEDE, 'scheduled', 'confirmed'],
  [0, '11:00', 45, 'carla', 5, SRV_FISIO, LOC_SEDE, 'scheduled', 'pending'],
  [0, '15:00', 45, 'carla', 8, SRV_FISIO, LOC_SEDE, 'cancelled', 'pending'],
  [0, '10:00', 60, 'duarte', 3, SRV_OSTEO, LOC_POLO, 'scheduled', 'confirmed'],
  [0, '16:00', 60, 'duarte', 6, SRV_OSTEO, LOC_POLO, 'scheduled', 'pending'],
  [1, '09:00', 60, 'terapeuta', 10, SRV_OSTEO, LOC_SEDE, 'scheduled', 'confirmed'],
  [1, '10:30', 60, 'terapeuta', 13, SRV_OSTEO, LOC_SEDE, 'scheduled', 'pending'],
  [1, '12:00', 30, 'terapeuta', 0, SRV_REAV, LOC_SEDE, 'scheduled', 'pending'],
  [1, '15:00', 60, 'terapeuta', 1, SRV_OSTEO, LOC_SEDE, 'scheduled', 'confirmed'],
  [1, '17:00', 60, 'terapeuta', 7, SRV_OSTEO, LOC_SEDE, 'scheduled', 'pending'],
  [1, '09:00', 45, 'carla', 11, SRV_FISIO, LOC_SEDE, 'scheduled', 'confirmed'],
  [1, '10:00', 45, 'carla', 14, SRV_FISIO, LOC_SEDE, 'scheduled', 'pending'],
  [1, '14:30', 45, 'carla', 2, SRV_FISIO, LOC_SEDE, 'scheduled', 'confirmed'],
  [1, '16:00', 45, 'carla', 5, SRV_FISIO, LOC_SEDE, 'scheduled', 'pending'],
  [1, '09:30', 60, 'duarte', 9, SRV_OSTEO, LOC_POLO, 'scheduled', 'pending'],
  [1, '11:00', 60, 'duarte', 12, SRV_OSTEO, LOC_POLO, 'scheduled', 'confirmed'],
  [1, '15:30', 60, 'duarte', 15, SRV_OSTEO, LOC_POLO, 'scheduled', 'pending'],
  [2, '09:00', 60, 'terapeuta', 4, SRV_OSTEO, LOC_SEDE, 'scheduled', 'pending'],
  [2, '11:00', 60, 'terapeuta', 10, SRV_OSTEO, LOC_SEDE, 'scheduled', 'pending'],
  [2, '14:00', 60, 'terapeuta', 13, SRV_OSTEO, LOC_SEDE, 'scheduled', 'pending'],
  [2, '10:00', 45, 'carla', 8, SRV_FISIO, LOC_SEDE, 'scheduled', 'pending'],
  [2, '15:00', 45, 'carla', 11, SRV_FISIO, LOC_SEDE, 'scheduled', 'pending'],
  [2, '10:00', 60, 'duarte', 3, SRV_OSTEO, LOC_POLO, 'scheduled', 'pending'],
  [2, '14:00', 60, 'duarte', 6, SRV_OSTEO, LOC_POLO, 'scheduled', 'pending'],
  [3, '09:30', 60, 'terapeuta', 0, SRV_OSTEO, LOC_SEDE, 'scheduled', 'pending'],
  [3, '11:00', 30, 'terapeuta', 1, SRV_REAV, LOC_SEDE, 'scheduled', 'pending'],
  [3, '16:00', 60, 'terapeuta', 7, SRV_OSTEO, LOC_SEDE, 'scheduled', 'pending'],
  [3, '09:00', 45, 'carla', 14, SRV_FISIO, LOC_SEDE, 'scheduled', 'pending'],
  [3, '11:30', 45, 'carla', 2, SRV_FISIO, LOC_SEDE, 'scheduled', 'pending'],
  [3, '15:00', 60, 'duarte', 9, SRV_OSTEO, LOC_POLO, 'scheduled', 'pending'],
  [4, '09:00', 60, 'terapeuta', 13, SRV_OSTEO, LOC_SEDE, 'scheduled', 'pending'],
  [4, '10:30', 60, 'terapeuta', 4, SRV_OSTEO, LOC_SEDE, 'scheduled', 'pending'],
  [4, '14:30', 60, 'terapeuta', 10, SRV_OSTEO, LOC_SEDE, 'scheduled', 'pending'],
  [4, '10:00', 45, 'carla', 5, SRV_FISIO, LOC_SEDE, 'scheduled', 'pending'],
  [4, '16:00', 45, 'carla', 8, SRV_FISIO, LOC_SEDE, 'scheduled', 'pending'],
  [4, '11:00', 60, 'duarte', 12, SRV_OSTEO, LOC_POLO, 'scheduled', 'pending'],
  [5, '09:30', 45, 'carla', 11, SRV_FISIO, LOC_POLO, 'scheduled', 'pending'],
  [5, '11:00', 45, 'carla', 14, SRV_FISIO, LOC_POLO, 'scheduled', 'pending'],
];

// Past visits, so a ficha has a history: every patient saw their therapist on
// two fixed days in September 2026, and one of those visits was missed.
const HISTORY_DAYS = ['2026-09-07', '2026-09-21'];

// A booking shows when it was created ("Criado por") and Início counts the
// patients registered this week; a fixed instant keeps every capture of them
// the same from one seeding to the next.
const CREATED_AT = '2026-09-01T09:00:00+01:00';

class SeedError extends Error {}

function args(argv) {
  if (argv.length === 0) return { lane: null };
  if (argv.length === 2 && argv[0] === '--lane' && /^[a-z]+$/.test(argv[1])) return { lane: argv[1] };
  throw new SeedError('usage: node docs/guide/build/seed-guide.mjs [--lane <name>]');
}

/** SUPABASE_URL and the service key: from a lane's own status, or from the environment. */
async function target(lane) {
  if (!lane) {
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  const { lanePorts, writeLaneProject } = await import('../../../scripts/lane-stack.mjs');
  const ports = lanePorts(lane);
  const dir = writeLaneProject(lane);
  const status = spawnSync('supabase', ['status', '-o', 'json', '--workdir', dir], { encoding: 'utf8', cwd: REPO });
  if (status.status !== 0) throw new SeedError(`lane ${lane} is not running; start it with node scripts/lane-stack.mjs up --lane ${lane}`);
  let parsed;
  try {
    parsed = JSON.parse(status.stdout);
  } catch {
    throw new SeedError('supabase status returned output this script cannot parse');
  }
  return { url: `http://127.0.0.1:${ports.api}`, key: parsed.SERVICE_ROLE_KEY };
}

function loadClient() {
  const require = createRequire(path.join(REPO, 'apps/web/package.json'));
  return require('@supabase/supabase-js').createClient;
}

function at(day, time) {
  return new Date(`${day}T${time}:00+01:00`);
}

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { lane } = args(process.argv.slice(2));
  const { url, key } = await target(lane);
  assertLocalTarget(url, 'SUPABASE_URL');
  if (!key) throw new SeedError('no service role key: pass --lane, or set SUPABASE_SERVICE_ROLE_KEY');

  const createClient = loadClient();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const must = (result, what) => {
    if (result.error) throw new SeedError(`${what}: ${result.error.message ?? JSON.stringify(result.error)}`);
    return result.data;
  };

  must(
    await db.from('tenants').upsert({ id: GUIDE_TENANT, name: 'Clínica Exemplo', slug: 'clinica-exemplo-guia' }, { onConflict: 'id' }),
    'tenant',
  );
  must(
    await db.from('roles').upsert(
      [
        { tenant_id: GUIDE_TENANT, slug: 'owner', name: 'Owner', description: 'Full access.' },
        { tenant_id: GUIDE_TENANT, slug: 'admin', name: 'Admin', description: 'Tenant admin.' },
        { tenant_id: GUIDE_TENANT, slug: 'therapist', name: 'Therapist', description: 'Clinician.' },
        { tenant_id: GUIDE_TENANT, slug: 'reception', name: 'Receptionist', description: 'Front desk.' },
      ],
      { onConflict: 'tenant_id,slug' },
    ),
    'roles',
  );
  const roleRows = must(await db.from('roles').select('id, slug').eq('tenant_id', GUIDE_TENANT), 'role lookup');
  const roleId = Object.fromEntries(roleRows.map((r) => [r.slug, r.id]));

  // Auth accounts: found by e-mail, else created; the password is set on every run.
  const listed = must(await db.auth.admin.listUsers({ perPage: 1000 }), 'list auth users');
  const staffId = {};
  for (const person of STAFF) {
    const existing = listed.users.find((u) => u.email?.toLowerCase() === person.email);
    let id = existing?.id;
    if (id) must(await db.auth.admin.updateUserById(id, { password: GUIDE_PASSWORD, email_confirm: true }), `auth ${person.key}`);
    else id = must(await db.auth.admin.createUser({ email: person.email, password: GUIDE_PASSWORD, email_confirm: true }), `auth ${person.key}`).user.id;
    staffId[person.key] = id;
    must(
      await db.from('users').upsert(
        {
          id,
          tenant_id: GUIDE_TENANT,
          role_id: roleId[person.role],
          email: person.email,
          full_name: person.fullName,
          job_title: person.jobTitle,
          is_active: true,
          is_bookable: person.role === 'therapist',
          must_set_password: false,
        },
        { onConflict: 'id' },
      ),
      `user ${person.key}`,
    );
  }

  must(
    await db.from('locations').upsert(
      [
        { id: LOC_SEDE, tenant_id: GUIDE_TENANT, name: 'Sede Exemplo', phone: '+351 210 000 100', is_active: true },
        { id: LOC_POLO, tenant_id: GUIDE_TENANT, name: 'Polo Exemplo', phone: '+351 210 000 200', is_active: true },
      ],
      { onConflict: 'id' },
    ),
    'locations',
  );
  must(
    await db.from('services').upsert(
      [
        { id: SRV_OSTEO, tenant_id: GUIDE_TENANT, name: 'Osteopatia', duration_min: 60, is_active: true, patient_bookable: true },
        { id: SRV_FISIO, tenant_id: GUIDE_TENANT, name: 'Fisioterapia', duration_min: 45, is_active: true, patient_bookable: true },
        { id: SRV_REAV, tenant_id: GUIDE_TENANT, name: 'Reavaliação', duration_min: 30, is_active: true, patient_bookable: false },
      ],
      { onConflict: 'id' },
    ),
    'services',
  );
  const prices = [];
  for (const location of [LOC_SEDE, LOC_POLO]) {
    for (const [service, cents] of [
      [SRV_OSTEO, 5500],
      [SRV_FISIO, 4500],
      [SRV_REAV, 3000],
    ]) {
      prices.push({ tenant_id: GUIDE_TENANT, service_id: service, location_id: location, price_cents: cents, currency: 'EUR', is_active: true });
    }
  }
  must(await db.from('service_location_prices').upsert(prices, { onConflict: 'tenant_id,service_id,location_id' }), 'prices');

  // One pack of five osteopathy sessions, offered at both locations.
  must(
    await db.from('service_packs').upsert(
      { id: PACK_OSTEO, tenant_id: GUIDE_TENANT, base_service_id: SRV_OSTEO, location_id: null, name: 'Pacote 5 sessões de Osteopatia', session_count: 5, price_cents: 25000, currency: 'EUR', is_active: true },
      { onConflict: 'id' },
    ),
    'pack',
  );
  must(
    await db.from('service_pack_location_prices').upsert(
      [LOC_SEDE, LOC_POLO].map((location) => ({ tenant_id: GUIDE_TENANT, pack_id: PACK_OSTEO, location_id: location, price_cents: 25000, currency: 'EUR', is_active: true })),
      { onConflict: 'tenant_id,pack_id,location_id' },
    ),
    'pack prices',
  );

  const skills = [
    ['terapeuta', SRV_OSTEO],
    ['terapeuta', SRV_REAV],
    ['carla', SRV_FISIO],
    ['carla', SRV_REAV],
    ['duarte', SRV_OSTEO],
  ];
  for (const [who, service] of skills) {
    must(
      await db
        .from('therapist_services')
        .upsert(
          { tenant_id: GUIDE_TENANT, therapist_user_id: staffId[who], service_id: service },
          { onConflict: 'tenant_id,therapist_user_id,service_id' },
        ),
      `therapist_services ${who}`,
    );
  }

  // Working hours: Bruno and Carla at the Sede on weekdays, Duarte at the Polo,
  // Carla at the Polo on Saturday morning.
  const therapists = ['terapeuta', 'carla', 'duarte'].map((k) => staffId[k]);
  must(await db.from('availability_templates').delete().eq('tenant_id', GUIDE_TENANT).in('user_id', therapists), 'reset hours');
  const hours = [];
  const add = (who, location, weekday, start, end) =>
    hours.push({ tenant_id: GUIDE_TENANT, user_id: staffId[who], location_id: location, weekday, start_time: start, end_time: end, is_active: true });
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    for (const [who, location] of [
      ['terapeuta', LOC_SEDE],
      ['carla', LOC_SEDE],
      ['duarte', LOC_POLO],
    ]) {
      add(who, location, weekday, '09:00', '13:00');
      add(who, location, weekday, '14:00', '19:00');
    }
  }
  add('carla', LOC_POLO, 6, '09:00', '13:00');
  must(await db.from('availability_templates').insert(hours), 'hours');

  // Every staff member works at both locations.
  for (const person of STAFF) {
    for (const location of [LOC_SEDE, LOC_POLO]) {
      must(
        await db
          .from('staff_locations')
          .upsert({ tenant_id: GUIDE_TENANT, user_id: staffId[person.key], location_id: location }, { onConflict: 'tenant_id,user_id,location_id' }),
        `staff_locations ${person.key}`,
      );
    }
  }

  must(
    await db.from('patients').upsert(
      PATIENTS.map((p) => ({
        id: p.id,
        tenant_id: GUIDE_TENANT,
        full_name: p.fullName,
        date_of_birth: p.dateOfBirth,
        sex: p.sex,
        nif: p.nif,
        phone: p.phone,
        email: p.email,
        created_by: staffId[p.owner],
        created_at: CREATED_AT,
        deleted_at: null,
      })),
      { onConflict: 'id' },
    ),
    'patients',
  );
  const careTeam = must(await db.from('patient_care_team').select('patient_id, user_id').eq('tenant_id', GUIDE_TENANT), 'care team');
  const onTeam = new Set(careTeam.map((r) => `${r.patient_id}:${r.user_id}`));
  const newTeam = PATIENTS.filter((p) => !onTeam.has(`${p.id}:${staffId[p.owner]}`)).map((p) => ({
    tenant_id: GUIDE_TENANT,
    patient_id: p.id,
    user_id: staffId[p.owner],
    assigned_by: staffId.proprietario,
  }));
  if (newTeam.length > 0) must(await db.from('patient_care_team').insert(newTeam), 'care team');
  // The ficha shows when each assignment was made; a fixed instant keeps it still.
  must(await db.from('patient_care_team').update({ assigned_at: CREATED_AT }).eq('tenant_id', GUIDE_TENANT), 'care team date');

  const serviceOf = { terapeuta: SRV_OSTEO, carla: SRV_FISIO, duarte: SRV_OSTEO };
  const minutesOf = { terapeuta: 60, carla: 45, duarte: 60 };
  const locationOf = { terapeuta: LOC_SEDE, carla: LOC_SEDE, duarte: LOC_POLO };
  const rows = [];
  let n = 0;
  const id = () => {
    n += 1;
    return `00000000-0000-0000-0000-0000000c4${n.toString(16).padStart(3, '0')}`;
  };
  PATIENTS.forEach((p, i) => {
    HISTORY_DAYS.forEach((day, visit) => {
      const start = at(day, `${String(9 + (i % 8)).padStart(2, '0')}:00`);
      rows.push({
        id: id(),
        tenant_id: GUIDE_TENANT,
        patient_id: p.id,
        practitioner_id: staffId[p.owner],
        location_id: locationOf[p.owner],
        service_id: serviceOf[p.owner],
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + minutesOf[p.owner] * 60000).toISOString(),
        status: visit === 1 && i % 5 === 3 ? 'no_show' : 'completed',
        confirmation_state: 'confirmed',
        created_by: staffId.rececao,
        created_at: CREATED_AT,
      });
    });
  });
  for (const [offset, time, minutes, who, patient, service, location, status, confirmation] of WEEK) {
    const start = at(addDays(GUIDE_WEEK, offset), time);
    rows.push({
      id: id(),
      tenant_id: GUIDE_TENANT,
      patient_id: PATIENTS[patient].id,
      practitioner_id: staffId[who],
      location_id: location,
      service_id: service,
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + minutes * 60000).toISOString(),
      status,
      confirmation_state: confirmation,
      created_by: staffId.rececao,
      created_at: CREATED_AT,
    });
  }
  must(await db.from('appointments').upsert(rows, { onConflict: 'id' }), 'appointments');

  process.stdout.write(
    `[seed-guide] Clínica Exemplo: ${STAFF.length} staff, 2 locations, 3 services, 1 pack, ${PATIENTS.length} patients, ${rows.length} appointments (week of ${GUIDE_WEEK})\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`seed-guide: ${error instanceof SeedError ? error.message : error.stack}\n`);
    process.exit(1);
  });
}
