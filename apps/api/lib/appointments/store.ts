import "server-only";
import { and, eq, inArray, desc, sql, type SQL } from "drizzle-orm";
import {
  appointments,
  locations,
  services,
  users,
  getDbAdmin,
} from "@osteojp/db";
import type { PatientPrincipal } from "@osteojp/auth";
import { runAsPatient } from "@/lib/auth/patient";
import {
  isBookableServiceName,
  effectivePriceCents,
} from "./services";
import { AppointmentError } from "./errors";
import type {
  AppointmentsStore,
  AppointmentView,
  AppointmentStatus,
  BookableCatalog,
  BookableService,
  MutableAppointment,
  ServiceForBooking,
} from "./booking";
import type { TherapistCandidate } from "./therapist";

// Drizzle / Postgres implementation of the patient appointments store.
//
// TWO trust paths, deliberately separated (see packages/db/migrations 0010):
//
//   * READS of the patient's OWN appointments go through runAsPatient
//     (withPatientContext → `set local role patient`). RLS self-scope is the
//     authorization backstop: a row that isn't this patient's is invisible, so
//     "is it mine?" is answered by the database, not by app code.
//
//   * Everything the patient role has NO grant for — reference data (services,
//     locations, users), tenant-wide conflict detection (must see OTHER patients'
//     appointments), and all WRITES (the patient role is SELECT-only) — goes
//     through getDbAdmin (service_role, BYPASSRLS), the SANCTIONED path of
//     CLAUDE.md rule #3. Every such query scopes tenant_id (and, for the
//     patient's own rows, patient_id) EXPLICITLY from the verified principal,
//     never from request payload. Conflict queries return ZERO other-patient
//     data — only therapist ids/names and a boolean.
//
// Conflict detection mirrors Stream B's rule (lib/scheduling/conflict.ts) without
// importing it (it is app-local to apps/web and must not be modified): half-open
// overlap [startsAt, endsAt), cancelled never conflicts, therapist + room + the
// availability/time_off schedule checks. WAVE B: extract Stream B's conflict +
// evaluateAvailability into a shared @osteojp/scheduling package so both apps use
// one implementation instead of this faithful re-statement.

const LISBON = "Europe/Lisbon";

type NameRow = { id: string; name: string };

/** Resolve service/location/therapist display names for a set of appointment
 *  rows, via service_role scoped to the tenant. Reference data only — never
 *  another patient's PII. */
async function enrichViews(
  tenantId: string,
  rows: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
    serviceId: string | null;
    locationId: string;
    practitionerId: string;
    room: string | null;
  }[],
): Promise<AppointmentView[]> {
  if (rows.length === 0) return [];
  const db = getDbAdmin();

  const serviceIds = [...new Set(rows.map((r) => r.serviceId).filter((x): x is string => !!x))];
  const locationIds = [...new Set(rows.map((r) => r.locationId))];
  const practitionerIds = [...new Set(rows.map((r) => r.practitionerId))];

  const [serviceRows, locationRows, userRows] = await Promise.all([
    serviceIds.length
      ? db
          .select({ id: services.id, name: services.name })
          .from(services)
          .where(and(eq(services.tenantId, tenantId), inArray(services.id, serviceIds)))
      : Promise.resolve([] as NameRow[]),
    db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.tenantId, tenantId), inArray(locations.id, locationIds))),
    db
      .select({ id: users.id, name: users.fullName })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), inArray(users.id, practitionerIds))),
  ]);

  const nameOf = (list: NameRow[]) => new Map(list.map((r) => [r.id, r.name]));
  const svc = nameOf(serviceRows);
  const loc = nameOf(locationRows);
  const usr = nameOf(userRows);

  return rows.map((r) => ({
    id: r.id,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    status: r.status,
    serviceName: r.serviceId ? svc.get(r.serviceId) ?? null : null,
    locationName: loc.get(r.locationId) ?? null,
    practitionerName: usr.get(r.practitionerId) ?? null,
    room: r.room,
  }));
}

// `practitioner` is either a bound patient-supplied-free id (string) or a column
// reference (SQL, e.g. `sql`u.id``) so these fragments compose both in the
// candidate sweep and in a single-therapist guard.
type Practitioner = SQL | string;
const pref = (p: Practitioner): SQL => (typeof p === "string" ? sql`${p}` : p);

// A window endpoint is either a concrete instant (Date, bound as a timestamptz
// parameter) or a SQL expression (a column reference from the open-slot sweep,
// e.g. `sql`s.starts_at``). Generalizing the fragments over both is what makes
// the step-3 availability list and the step-4 booking guard share ONE predicate
// source instead of two hand-kept copies.
type Instant = SQL | Date;
const iref = (t: Instant): SQL =>
  t instanceof Date ? sql`${t.toISOString()}::timestamptz` : t;

/** Half-open appointment overlap for a therapist, excluding cancelled + given
 *  ids. Mirrors Stream B findConflicts (therapist dimension). */
function apptOverlapExists(
  tenantId: string,
  practitioner: Practitioner,
  startsAt: Instant,
  endsAt: Instant,
  excludeIds: string[],
): SQL {
  const exclude =
    excludeIds.length > 0
      ? sql`and a.id <> all(array[${sql.join(
          excludeIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}])`
      : sql``;
  return sql`exists (
    select 1 from appointments a
    where a.tenant_id = ${tenantId}
      and a.practitioner_id = ${pref(practitioner)}
      and a.status <> 'cancelled'
      and a.starts_at < ${iref(endsAt)}
      and a.ends_at   > ${iref(startsAt)}
      ${exclude}
  )`;
}

/** Therapist time_off overlap (therapist-wide). */
function timeOffOverlapExists(
  tenantId: string,
  practitioner: Practitioner,
  startsAt: Instant,
  endsAt: Instant,
): SQL {
  return sql`exists (
    select 1 from time_off t
    where t.tenant_id = ${tenantId}
      and t.user_id = ${pref(practitioner)}
      and t.starts_at < ${iref(endsAt)}
      and t.ends_at   > ${iref(startsAt)}
  )`;
}

/** Availability-template coverage for the window, in clinic-local (Lisbon) time.
 *  Reuses Stream B's availability DATA model directly (weekday 0=Sun..6=Sat,
 *  local start/end time, validity window). */
function availabilityCoversExists(
  tenantId: string,
  practitioner: Practitioner,
  locationId: string,
  startsAt: Instant,
  endsAt: Instant,
): SQL {
  const s = iref(startsAt);
  const e = iref(endsAt);
  return sql`exists (
    select 1 from availability_templates av
    where av.tenant_id = ${tenantId}
      and av.user_id = ${pref(practitioner)}
      and av.location_id = ${locationId}
      and av.is_active = true
      and av.weekday = extract(dow from (${s} at time zone ${LISBON}))::int
      and av.start_time <= (${s} at time zone ${LISBON})::time
      and av.end_time   >= (${e} at time zone ${LISBON})::time
      and (av.valid_from  is null or av.valid_from  <= (${s} at time zone ${LISBON})::date)
      and (av.valid_until is null or av.valid_until >= (${s} at time zone ${LISBON})::date)
  )`;
}

export const drizzleAppointmentsStore: AppointmentsStore = {
  async listOwn(principal: PatientPrincipal): Promise<AppointmentView[]> {
    // RLS self-scope: only this patient's rows are visible on the patient role.
    const rows = await runAsPatient(principal, (tx) =>
      tx
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
          serviceId: appointments.serviceId,
          locationId: appointments.locationId,
          practitionerId: appointments.practitionerId,
          room: appointments.room,
        })
        .from(appointments)
        .orderBy(desc(appointments.startsAt)),
    );
    return enrichViews(principal.tenantId, rows);
  },

  async getOwn(principal, id): Promise<AppointmentView | null> {
    const rows = await runAsPatient(principal, (tx) =>
      tx
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
          serviceId: appointments.serviceId,
          locationId: appointments.locationId,
          practitionerId: appointments.practitionerId,
          room: appointments.room,
        })
        .from(appointments)
        .where(eq(appointments.id, id)),
    );
    if (rows.length === 0) return null; // not visible under self-scope → 404
    const [view] = await enrichViews(principal.tenantId, rows);
    return view ?? null;
  },

  async getCatalog(principal): Promise<BookableCatalog> {
    const db = getDbAdmin();
    const [locationRows, serviceRows] = await Promise.all([
      db
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(and(eq(locations.tenantId, principal.tenantId), eq(locations.isActive, true)))
        .orderBy(locations.name),
      db
        .select({
          id: services.id,
          name: services.name,
          durationMin: services.durationMin,
          priceCents: services.priceCents,
          currency: services.currency,
          locationId: services.locationId,
        })
        .from(services)
        .where(and(eq(services.tenantId, principal.tenantId), eq(services.isActive, true)))
        .orderBy(services.name),
    ]);

    const allLocationIds = locationRows.map((l) => l.id);
    const bookableLocations = locationRows.map((l) => ({ id: l.id, name: l.name }));

    const bookableServices: BookableService[] = serviceRows
      .filter((s) => isBookableServiceName(s.name))
      // A location-bound service only lists if its location is active/bookable.
      .filter((s) => s.locationId === null || allLocationIds.includes(s.locationId))
      .map((s) => ({
        id: s.id,
        name: s.name,
        durationMin: s.durationMin,
        // Base catalog price. Per-location parceria/override display is Wave B
        // (effectivePriceCents is in place for when that lands). Display-only —
        // no payment, no fiscal document this phase.
        priceCents: effectivePriceCents(s.priceCents, null),
        currency: s.currency,
        locationIds: s.locationId === null ? allLocationIds : [s.locationId],
      }));

    return { locations: bookableLocations, services: bookableServices };
  },

  async getBookableService(principal, serviceId): Promise<ServiceForBooking | null> {
    const rows = await getDbAdmin()
      .select({
        id: services.id,
        name: services.name,
        durationMin: services.durationMin,
        locationId: services.locationId,
        isActive: services.isActive,
      })
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.tenantId, principal.tenantId)))
      .limit(1);
    const row = rows[0];
    if (!row || !row.isActive || !isBookableServiceName(row.name)) return null;
    return { id: row.id, name: row.name, durationMin: row.durationMin, locationId: row.locationId };
  },

  async isBookableLocation(principal, locationId): Promise<boolean> {
    const rows = await getDbAdmin()
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.id, locationId),
          eq(locations.tenantId, principal.tenantId),
          eq(locations.isActive, true),
        ),
      )
      .limit(1);
    return rows.length > 0;
  },

  async listOpenSlots(principal, { locationId, durationMin, horizonDays, now }): Promise<string[]> {
    // Step-3 source of truth. Expands ACTIVE therapists' ACTIVE availability
    // templates at the location into a 30-min grid of concrete starts over the
    // horizon — all wall-clock math in Europe/Lisbon INSIDE Postgres — and keeps
    // only starts where at least one therapist passes the EXACT same three
    // predicates the createBooking guard runs (availabilityCoversExists /
    // apptOverlapExists / timeOffOverlapExists). A slot returned here can only
    // be rejected at confirm by a genuine race, never by disagreement.
    const startExpr = sql`s.starts_at`;
    // Parens are load-bearing: AT TIME ZONE binds tighter than `+`. The ::int
    // cast is too: drizzle/postgres-js sends parameters untyped and
    // make_interval(mins => unknown) does not resolve.
    const endExpr = sql`(s.starts_at + make_interval(mins => ${durationMin}::int))`;
    const nowIso = now.toISOString();
    const rows = (await getDbAdmin().execute(sql`
      with slot as (
        select distinct (t.local_start at time zone ${LISBON}) as starts_at
        from availability_templates av
        join users u on u.id = av.user_id and u.tenant_id = av.tenant_id
        cross join lateral generate_series(
          (${nowIso}::timestamptz at time zone ${LISBON})::date,
          (${nowIso}::timestamptz at time zone ${LISBON})::date + ${horizonDays}::int,
          interval '1 day'
        ) as d(day)
        cross join lateral generate_series(
          d.day::date + av.start_time,
          d.day::date + av.end_time - make_interval(mins => ${durationMin}::int),
          interval '30 minutes'
        ) as t(local_start)
        where av.tenant_id = ${principal.tenantId}
          and av.location_id = ${locationId}
          and av.is_active = true
          and u.is_active = true
          and av.weekday = extract(dow from d.day)::int
          and (av.valid_from  is null or av.valid_from  <= d.day::date)
          and (av.valid_until is null or av.valid_until >= d.day::date)
      )
      select s.starts_at as starts_at
      from slot s
      where s.starts_at > ${nowIso}::timestamptz
        and exists (
          select 1 from users u
          where u.tenant_id = ${principal.tenantId}
            and u.is_active = true
            and ${availabilityCoversExists(principal.tenantId, sql`u.id`, locationId, startExpr, endExpr)}
            and not ${apptOverlapExists(principal.tenantId, sql`u.id`, startExpr, endExpr, [])}
            and not ${timeOffOverlapExists(principal.tenantId, sql`u.id`, startExpr, endExpr)}
        )
      order by s.starts_at
    `)) as unknown as ReadonlyArray<{ starts_at: Date | string }>;

    return rows.map((r) =>
      (r.starts_at instanceof Date ? r.starts_at : new Date(r.starts_at)).toISOString(),
    );
  },

  async listAvailableTherapists(principal, { locationId, startsAt, endsAt }): Promise<TherapistCandidate[]> {
    // Candidates = active therapists who (a) have a covering availability template
    // at the location for the window, (b) have no overlapping appointment, and
    // (c) are not on time_off. service_role: must see ALL appointments to detect
    // conflict; returns only therapist id + name.
    const rows = (await getDbAdmin().execute(sql`
      select distinct u.id as practitioner_id, u.full_name as full_name
      from users u
      where u.tenant_id = ${principal.tenantId}
        and u.is_active = true
        and ${availabilityCoversExists(principal.tenantId, sql`u.id`, locationId, startsAt, endsAt)}
        and not ${apptOverlapExists(principal.tenantId, sql`u.id`, startsAt, endsAt, [])}
        and not ${timeOffOverlapExists(principal.tenantId, sql`u.id`, startsAt, endsAt)}
      order by u.full_name
    `)) as unknown as ReadonlyArray<{ practitioner_id: string; full_name: string }>;

    return rows.map((r) => ({ practitionerId: r.practitioner_id, sortKey: r.full_name ?? "" }));
  },

  async priorTherapistId(principal): Promise<string | null> {
    const rows = await getDbAdmin()
      .select({ practitionerId: appointments.practitionerId })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, principal.tenantId),
          eq(appointments.patientId, principal.patientId),
        ),
      )
      .orderBy(desc(appointments.startsAt))
      .limit(1);
    return rows[0]?.practitionerId ?? null;
  },

  async createBooking(principal, args): Promise<string> {
    // Insert under an explicit tenant_id + patient_id from the principal (never
    // payload). Final in-tx conflict re-check on the chosen therapist closes the
    // check-then-write race; createdBy is null (patient is not a staff users row
    // — see WAVE B booking-provenance note in docs).
    return getDbAdmin().transaction(async (tx) => {
      const guard = (await tx.execute(sql`
        select (
          ${apptOverlapExists(principal.tenantId, args.practitionerId, args.startsAt, args.endsAt, [])}
          or ${timeOffOverlapExists(principal.tenantId, args.practitionerId, args.startsAt, args.endsAt)}
          or not ${availabilityCoversExists(principal.tenantId, args.practitionerId, args.locationId, args.startsAt, args.endsAt)}
        ) as conflict
      `)) as unknown as ReadonlyArray<{ conflict: boolean }>;
      if (guard[0]?.conflict) throw new AppointmentError("no_slot");

      const inserted = await tx
        .insert(appointments)
        .values({
          tenantId: principal.tenantId, // explicit — from the verified principal
          patientId: principal.patientId, // explicit — never from payload
          practitionerId: args.practitionerId,
          locationId: args.locationId,
          serviceId: args.serviceId,
          startsAt: args.startsAt,
          endsAt: args.endsAt,
          status: "scheduled",
          room: null, // no room catalog in schema — WAVE B (no migration this wave)
          createdBy: null, // patient has no users row — WAVE B provenance column
        })
        .returning({ id: appointments.id });
      return inserted[0].id;
    });
  },

  async getOwnMutable(principal, id): Promise<MutableAppointment | null> {
    const rows = await runAsPatient(principal, (tx) =>
      tx
        .select({
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
          locationId: appointments.locationId,
          practitionerId: appointments.practitionerId,
        })
        .from(appointments)
        .where(eq(appointments.id, id)),
    );
    const row = rows[0];
    if (!row) return null; // self-scope → not the patient's → 404
    return {
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status as AppointmentStatus,
      locationId: row.locationId,
      practitionerId: row.practitionerId,
    };
  },

  async cancelOwn(principal, id): Promise<void> {
    // Explicit principal scoping in the WHERE: even on the service_role path the
    // update can only ever touch THIS patient's row.
    await getDbAdmin()
      .update(appointments)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(appointments.id, id),
          eq(appointments.patientId, principal.patientId),
          eq(appointments.tenantId, principal.tenantId),
          inArray(appointments.status, ["scheduled", "confirmed"]),
        ),
      );
  },

  async rescheduleOwn(principal, id, { startsAt, endsAt }): Promise<void> {
    await getDbAdmin()
      .update(appointments)
      .set({ startsAt, endsAt })
      .where(
        and(
          eq(appointments.id, id),
          eq(appointments.patientId, principal.patientId),
          eq(appointments.tenantId, principal.tenantId),
          inArray(appointments.status, ["scheduled", "confirmed"]),
        ),
      );
  },

  async hasWindowConflict(principal, { practitionerId, locationId, startsAt, endsAt, excludeIds }): Promise<boolean> {
    const rows = (await getDbAdmin().execute(sql`
      select (
        ${apptOverlapExists(principal.tenantId, practitionerId, startsAt, endsAt, excludeIds ?? [])}
        or ${timeOffOverlapExists(principal.tenantId, practitionerId, startsAt, endsAt)}
        or not ${availabilityCoversExists(principal.tenantId, practitionerId, locationId, startsAt, endsAt)}
      ) as conflict
    `)) as unknown as ReadonlyArray<{ conflict: boolean }>;
    return Boolean(rows[0]?.conflict);
  },
};
