import "server-only";
import { and, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import {
  appointments,
  locations,
  patients,
  services,
  users,
  getDbAdmin,
} from "@osteojp/db";
import type { PatientPrincipal } from "@osteojp/auth";
import { runAsPatient } from "@/lib/auth/patient";
import {
  effectivePriceCents,
  isServiceBookableByPatient,
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
import { acquireSlotLocks } from "./slot-lock";

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
 *  ids. Mirrors Stream B findConflicts (therapist dimension).
 *
 *  W13-04a (JP option B): an UNCONFIRMED PEDIDO does not occupy the slot, so a
 *  second patient may book a time another patient has only requested.
 *
 *  THE EXCLUSION IS A FUNCTION CALL, NOT AN INLINE `NOT EXISTS`, and it has to
 *  be. This module runs under `set local role patient`, and that role has NO
 *  GRANT on `staff_notifications` — an inline read would ERROR here, not return
 *  false. `public.is_unconfirmed_pedido` is SECURITY DEFINER precisely so this
 *  path can answer the question at all, and so every caller gets the SAME
 *  answer: "is this slot free" must not depend on who is asking.
 *
 *  It is also the ONE definition, shared with the SQL conflict function and the
 *  staff availability read. Three hand-kept copies of a predicate is the exact
 *  shape that drifted in the S1 incident. */
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
      and a.status not in ('cancelled', 'no_show')
      and not public.is_unconfirmed_pedido(a.id)
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
        // W12-26: internal_only services (e.g. "Diversos") are staff-bookable but
        // NEVER offered in the patient-portal wizard. Staff booking (web) does not
        // apply this filter.
        //
        // W13-04 (Decision B): patient_bookable joins it, and it is a SQL
        // predicate rather than the JS filter that used to run over the result.
        // The old shape read every active service out of the database and then
        // discarded most of them in application code; asking the database the
        // question it can answer is both the smaller result set and the version
        // that cannot drift from the index built for it
        // (services_tenant_patient_bookable_idx, 0057).
        .where(
          and(
            eq(services.tenantId, principal.tenantId),
            eq(services.isActive, true),
            eq(services.internalOnly, false),
            eq(services.patientBookable, true),
          ),
        )
        .orderBy(services.name),
    ]);

    const allLocationIds = locationRows.map((l) => l.id);
    const bookableLocations = locationRows.map((l) => ({ id: l.id, name: l.name }));

    const bookableServices: BookableService[] = serviceRows
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

    // BOTH preselections are decided by getBookableCatalog (booking.ts), which
    // is the only place that can check membership against the lists it is about
    // to return. Null here is the honest value, not a placeholder.
    return {
      preselectedLocationId: null,
      locations: bookableLocations,
      services: bookableServices,
      preselectedServiceId: null,
    };
  },

  async getBookableService(principal, serviceId): Promise<ServiceForBooking | null> {
    const rows = await getDbAdmin()
      .select({
        id: services.id,
        name: services.name,
        durationMin: services.durationMin,
        locationId: services.locationId,
        isActive: services.isActive,
        // W13-04: BOTH columns are now selected, and internalOnly was not
        // selected here AT ALL before. That omission is the exposure Decision B
        // refuses to ship without closing: the catalog list filtered internal
        // services out of the WIZARD, but this function is what the WRITE paths
        // resolve a service id through, and it never asked. A patient who knew
        // an internal service's id could book it directly, because the only
        // thing standing in the way was a list they never had to read.
        internalOnly: services.internalOnly,
        patientBookable: services.patientBookable,
      })
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.tenantId, principal.tenantId)))
      .limit(1);
    const row = rows[0];
    // Four independent refusals, and each is a whole reason on its own: no such
    // service in this tenant, not active, not offered to patients, or
    // internal-only. `getBookableService` answers ONE question — "may THIS
    // patient book THIS service" — so every no is the same null. The last three
    // live in `isServiceBookableByPatient`, where each clause has a test that
    // proves it is load-bearing.
    if (!row || !isServiceBookableByPatient(row)) return null;
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
    // templates at the location into a grid of concrete starts over the
    // horizon — all wall-clock math in Europe/Lisbon INSIDE Postgres — and keeps
    // only starts where at least one therapist passes the EXACT same three
    // predicates the createBooking guard runs (availabilityCoversExists /
    // apptOverlapExists / timeOffOverlapExists). A slot returned here can only
    // be rejected at confirm by a genuine race, never by disagreement.
    //
    // PL-25 (owner CR 2026-07-31): "on our client portal the only option to book
    // appointments is fixed hourly, they can't book at :15th minute or half of
    // hour". The per-location step (0041) was necessary but NOT sufficient: the
    // series used to start at the template's own start_time, so a therapist
    // whose hours begin 09:30 produced 09:30 / 10:30 / 11:30 at a 60-minute
    // step — an hourly CADENCE that never lands on an hour. The grid is now
    // ALIGNED to midnight, so the step alone decides the offsets a patient can
    // see: 60 -> 09:00, 10:00, 11:00; 30 -> :00 and :30, exactly as before for
    // every template that already starts on a :00 or :30 boundary.
    //
    // Alignment rounds UP (ceil), never down, so an aligned start can only ever
    // be INSIDE the therapist's declared hours. Rounding down would offer a slot
    // beginning before the therapist starts work, and availabilityCoversExists
    // would then reject at confirm what step 3 had just advertised — the exact
    // disagreement this query exists to prevent.
    //
    // Staff booking is deliberately untouched: the agenda still books any time.
    // This constrains only what a patient may self-serve.
    const startExpr = sql`s.starts_at`;
    // Parens are load-bearing: AT TIME ZONE binds tighter than `+`. The ::int
    // cast is too: drizzle/postgres-js sends parameters untyped and
    // make_interval(mins => unknown) does not resolve.
    const endExpr = sql`(s.starts_at + make_interval(mins => ${durationMin}::int))`;
    const nowIso = now.toISOString();
    const rows = (await getDbAdmin().execute(sql`
      with step as (
        -- W12-29: per-location slot granularity, default 30. Lifted out of the
        -- lateral so PL-25's alignment and the series step read the SAME value —
        -- two copies of this subquery could not drift, but they could disagree
        -- at a glance, and the alignment only makes sense against the step it
        -- steps by.
        select coalesce(
          (select l.slot_granularity_min from locations l
            where l.id = ${locationId} and l.tenant_id = ${principal.tenantId}), 30)::int as min
      ),
      slot as (
        select distinct (t.local_start at time zone ${LISBON}) as starts_at
        from availability_templates av
        cross join step
        join users u on u.id = av.user_id and u.tenant_id = av.tenant_id
        cross join lateral generate_series(
          (${nowIso}::timestamptz at time zone ${LISBON})::date,
          (${nowIso}::timestamptz at time zone ${LISBON})::date + ${horizonDays}::int,
          interval '1 day'
        ) as d(day)
        cross join lateral generate_series(
          -- PL-25: the first start_time on the midnight-aligned grid that is at
          -- or after the template's own start. ceil, so it never precedes the
          -- therapist's declared hours.
          d.day::date + make_interval(mins => (
            ceil((extract(epoch from av.start_time) / 60.0) / step.min) * step.min
          )::int),
          d.day::date + av.end_time - make_interval(mins => ${durationMin}::int),
          make_interval(mins => step.min)
        ) as t(local_start)
        where av.tenant_id = ${principal.tenantId}
          and av.location_id = ${locationId}
          and av.is_active = true
          and u.is_active = true
          -- D2: the grid is expanded from BOOKABLE therapists' hours only. Both
          -- predicates in this query carry it, because a slot advertised from a
          -- non-bookable user's hours and then refused at confirm is exactly the
          -- step-3-vs-guard disagreement the header above says cannot happen.
          and u.is_bookable = true
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
            and u.is_bookable = true -- D2: same predicate as the assignment query
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
    // Candidates = BOOKABLE, active therapists who (a) have a covering
    // availability template at the location for the window, (b) have no
    // overlapping appointment, and (c) are not on time_off. service_role: must
    // see ALL appointments to detect conflict; returns only therapist id + name.
    //
    // D2, 2026-08-11. `is_bookable` WAS ABSENT HERE AND THE TWO SURFACES
    // DISAGREED ABOUT WHO IS A THERAPIST. A production portal booking for
    // Fisioterapia was auto-assigned to Lurdes Cruz, an ADMINISTRATOR, who does
    // not appear in the staff Nova marcacao dropdown at all - because that
    // dropdown filters on `is_bookable` (apps/web/lib/scheduling/data.ts:311 ->
    // therapist-bookable.ts:34-36) and this query did not. Reception was handed a
    // pedido they could not act on: the confirm is a therapist-overlap check
    // against a practitioner their own booking form will not offer, so item 18 of
    // the acceptance session could not run at all.
    //
    // ONE DEFINITION, THE WAY 0059 MADE is_unconfirmed_pedido ONE DEFINITION.
    // `is_bookable` (migration 0046) is ALREADY the single answer to "does this
    // person belong in a Terapeuta list"; PL-06b made it explicit precisely
    // because role sets rot at every hire. This query simply stops being the one
    // place that asks a different question.
    //
    // WHY NOT A ROLE FILTER, which is the obvious-looking fix and is wrong. The
    // practising owner JP is role=owner with zero service mappings. PL-05 derived
    // "bookable" from role OR mappings and DROPPED HIM from the staff dropdown -
    // a live defect, and the reason 0046 exists. A role filter here would
    // reintroduce it on the portal side, where it would read as "JP cannot be
    // booked online" rather than as a bug. Lurdes is excluded because her flag is
    // false, not because of her title.
    //
    // WHY NOT A SERVICE-MAPPING FILTER, and this one is a RULING, not a
    // preference. PL-06a (owner, 2026-07-28): the therapist-to-service mapping is
    // a PRESELECTION, NEVER A RESTRICTION - the staff Servico select lists every
    // active service for every therapist. Filtering portal candidates by mapping
    // would make the portal STRICTER than the staff surface and would silently
    // narrow who can be booked for a service, which is the opposite of what that
    // ruling says the mapping means. If JP ever wants the portal to respect
    // mappings, that is a change to PL-06a and belongs to him, not here.
    const rows = (await getDbAdmin().execute(sql`
      select distinct u.id as practitioner_id, u.full_name as full_name
      from users u
      where u.tenant_id = ${principal.tenantId}
        and u.is_active = true
        and u.is_bookable = true
        and ${availabilityCoversExists(principal.tenantId, sql`u.id`, locationId, startsAt, endsAt)}
        and not ${apptOverlapExists(principal.tenantId, sql`u.id`, startsAt, endsAt, [])}
        and not ${timeOffOverlapExists(principal.tenantId, sql`u.id`, startsAt, endsAt)}
      order by u.full_name
    `)) as unknown as ReadonlyArray<{ practitioner_id: string; full_name: string }>;

    return rows.map((r) => ({ practitionerId: r.practitioner_id, sortKey: r.full_name ?? "" }));
  },

  async priorCompletedServiceId(principal): Promise<string | null> {
    // Decision C. `completed` and NOT `scheduled`, deliberately: a booking the
    // patient made and did not attend is not what they usually come for, and a
    // future booking has not happened yet. Ordered by the appointment START,
    // not by created_at — "most recent" means the last visit, and a late
    // back-office entry must not outrank a more recent session.
    //
    // service_role with an EXPLICIT tenant + patient predicate from the verified
    // principal, matching priorTherapistId directly below. Returns an id the
    // caller must still find in the catalog before it is used.
    const rows = await getDbAdmin()
      .select({ serviceId: appointments.serviceId })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, principal.tenantId),
          eq(appointments.patientId, principal.patientId),
          eq(appointments.status, "completed"),
          isNotNull(appointments.serviceId),
        ),
      )
      .orderBy(desc(appointments.startsAt))
      .limit(1);
    return rows[0]?.serviceId ?? null;
  },

  async primaryLocationId(principal): Promise<string | null> {
    // A1, Decision C. The patient's HOME CLINIC, read straight off the patient
    // row rather than derived from history.
    //
    // WHY A STORED COLUMN AND NOT A DERIVATION, which is the opposite of how the
    // SERVICE preselection works two methods up. `priorCompletedServiceId`
    // derives "most recent completed" because a service is a repeated choice and
    // recency is a good signal for it. A PLACE is not: a single visit to the
    // other clinic while travelling would relocate the patient's home, and the
    // patient would then find the booking flow opening on a city they do not
    // live in. So the home clinic is a stored, staff-editable fact
    // (patients.primary_location_id, migration-free - schema.ts:588).
    //
    // IT IS NULL FOR EVERY PATIENT TODAY and will stay null until after
    // LAUNCH-03 brings the real book across with its visit history
    // (LE-primary-location-backfill). The null path is therefore not the edge
    // case, it is the ONLY case that currently exists, and it must render the
    // clinic choice unpreselected - which is exactly Decision C.
    //
    // service_role with an EXPLICIT tenant + patient predicate from the verified
    // principal, matching the two methods above. Returns an id the caller must
    // still find in the catalog before it is used.
    const rows = await getDbAdmin()
      .select({ primaryLocationId: patients.primaryLocationId })
      .from(patients)
      .where(
        and(eq(patients.tenantId, principal.tenantId), eq(patients.id, principal.patientId)),
      )
      .limit(1);
    return rows[0]?.primaryLocationId ?? null;
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
      // Serialize concurrent writers for this therapist + slot BEFORE the guard
      // reads. Without this the guard and the insert interleave: under READ
      // COMMITTED two transactions both see "no conflict" and both insert.
      // See slot-lock.ts for what this does NOT protect.
      await tx.execute(
        acquireSlotLocks(
          principal.tenantId,
          args.practitionerId,
          args.startsAt,
          args.endsAt,
        ),
      );

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
    // This used to be a BARE update: the caller's conflict check ran in a
    // separate statement, outside any transaction, so the window between check
    // and write was wider here than on create. Now the move happens inside one
    // transaction that holds the slot lock for the DESTINATION window.
    await getDbAdmin().transaction(async (tx) => {
      // The therapist is on the stored row, not in the request - a patient
      // reschedules a time, never a practitioner. Read it under the same tx.
      const owned = await tx
        .select({ practitionerId: appointments.practitionerId })
        .from(appointments)
        .where(
          and(
            eq(appointments.id, id),
            eq(appointments.patientId, principal.patientId),
            eq(appointments.tenantId, principal.tenantId),
            inArray(appointments.status, ["scheduled", "confirmed"]),
          ),
        )
        .limit(1);

      // No row means not theirs, or not in a reschedulable state. Same silent
      // no-op the bare update produced, so callers see no behaviour change.
      if (owned.length === 0) return;

      await tx.execute(
        acquireSlotLocks(
          principal.tenantId,
          owned[0].practitionerId,
          startsAt,
          endsAt,
        ),
      );

      await tx
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
    });
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
