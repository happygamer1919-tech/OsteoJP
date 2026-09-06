/**
 * marcar-novamente.spec.ts — SCHED-15. "Marcar novamente" from BOTH entry points,
 * driven in a browser, asserted on the SCREEN and on the ROW.
 *
 * ==========================================================================
 * WHY THIS SPEC WRITES ITS OWN SOURCE APPOINTMENT
 * ==========================================================================
 * The feature only appears on a PAST appointment, and a past appointment cannot
 * be booked through the UI — Nova marcação books forward. So the source row is
 * written the way `confirm-code.spec.ts` writes its fixtures: through the
 * service-role handle against the LOCAL stack, with the browser then driving the
 * page and the real server action, which is the half that had no coverage.
 *
 * IT IS LINKED TO A PACOTE ON PURPOSE. Rule 2 is the expensive one: a copy that
 * inherited `pack_instance_id` would spend another of the patient's ten sessions
 * with nobody deciding to, and it would look exactly like a correct copy on
 * screen. A fixture whose source carried no pacote would satisfy every "the
 * clone is unlinked" assertion here and prove nothing, so the source is linked
 * and the NEGATIVE CONTROL below asserts that before anything else runs.
 *
 * ==========================================================================
 * WHAT THIS SPEC CANNOT PROVE, STATED RATHER THAN IMPLIED
 * ==========================================================================
 * The reminder ENQUEUE is an `inngest.send`, not a database write, so a
 * Playwright run cannot observe it. What is asserted here instead is that the
 * clone went through `cloneAppointment` and not through some bespoke insert:
 * the action writes an `appointment.create` AUDIT row carrying `clonedFrom`,
 * and the audit row is the evidence that the real path ran — which is the whole
 * of rule 1's concern about side doors. The enqueue call itself is pinned in
 * `apps/web/lib/scheduling/actions.clone-enforcement.test.ts`.
 *
 * ==========================================================================
 * DAY BAND 56-59, PRIVATE TO THIS FILE.
 * ==========================================================================
 * Offsets are hand-assigned per spec and nothing enforces uniqueness (the
 * lesson marcacoes-tab-edit.spec.ts pays for in its own header). That file owns
 * 51-55; the next occupied offsets are 70, 80, 90. This file owns 56-59, and
 * every retry is pushed 100 days out so a re-run books an empty day instead of
 * colliding with the rows its previous attempt left behind.
 *
 * The seeded "E2E Therapist" has NO availability rows — asserted in
 * booking-therapist-location.spec.ts and agenda-location-filter.spec.ts, and
 * reset (not upserted) by the seed. That is what makes the clone's HARD
 * availability check pass deterministically here: with no configured hours the
 * check permits, which is the documented opt-in behaviour.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { dateField, fillDate, fillTime } from "./helpers";
// THE APP'S OWN LISBON CONVERSION, IMPORTED RATHER THAN MIRRORED. The form
// submits `lisbonDateTimeToUtc(date, time)`, and the offset is +01:00 or +00:00
// depending on where the picked day lands relative to the DST switch. A spec
// that hard-coded "T10:00:00Z" would be right for half the year and would fail
// as a mystery for the other half, on a day nobody chose deliberately.
import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import { PATIENTS, LOCATION, SERVICE, TENANT_A, futureDate, RUN_DAY_BASE } from "./fixtures";

const SCHEDULE_AGAIN = "Marcar novamente";
const CONFIRM = "Marcar";

/** Service-role client against the LANE's stack. Never production. */
function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. marcar-novamente.spec.ts writes its own " +
        "past appointment and pacote into the local seeded database; without the key it " +
        "cannot tell a missing row from a missing credential, so it refuses to guess. " +
        "Run: node scripts/lane-stack.mjs e2e --lane <lane>",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function therapistUserId(db: SupabaseClient): Promise<string> {
  const { data, error } = await db
    .from("users")
    .select("id")
    .eq("tenant_id", TENANT_A)
    .eq("email", "e2e-therapist@osteojp.test")
    .limit(1);
  if (error) throw new Error(`users lookup failed: ${error.message}`);
  const id = data?.[0]?.id as string | undefined;
  if (!id) throw new Error("Seeded therapist missing. Run: node apps/web/e2e/seed/seed-e2e.mjs");
  return id;
}

type Fixture = {
  appointmentId: string;
  packInstanceId: string;
  practitionerId: string;
  startsAt: Date;
};

/**
 * A COMPLETED 55-minute visit in the past, linked to a pacote of ten, with a
 * per-visit note and a room set so the "not copied" assertions prove a DROP
 * rather than a coincidental null.
 *
 * The pacote's base service is the seeded SERVICE, so the row is one the
 * product could really have produced.
 */
async function seedPastLinkedVisit(db: SupabaseClient, daysAgo: number): Promise<Fixture> {
  const practitionerId = await therapistUserId(db);
  const packId = randomUUID();
  const packInstanceId = randomUUID();
  const appointmentId = randomUUID();

  const startsAt = new Date(Date.now() - daysAgo * 86_400_000);
  startsAt.setUTCHours(9, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 55 * 60_000);

  const pack = await db.from("service_packs").insert({
    id: packId,
    tenant_id: TENANT_A,
    base_service_id: SERVICE.id,
    location_id: LOCATION.id,
    name: `SCHED-15 Pacote 10 ${packId.slice(0, 8)}`,
    session_count: 10,
    price_cents: 39000,
  });
  if (pack.error) throw new Error(`service_packs insert failed: ${pack.error.message}`);

  const instance = await db.from("patient_pack_instances").insert({
    id: packInstanceId,
    tenant_id: TENANT_A,
    patient_id: PATIENTS.maria.id,
    pack_id: packId,
    sessions_total: 10,
    sessions_remaining: 10,
    legacy_consumed: 0,
  });
  if (instance.error) throw new Error(`pack instance insert failed: ${instance.error.message}`);

  const appt = await db.from("appointments").insert({
    id: appointmentId,
    tenant_id: TENANT_A,
    patient_id: PATIENTS.maria.id,
    practitioner_id: practitionerId,
    location_id: LOCATION.id,
    service_id: SERVICE.id,
    room: "Sala 3",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "completed",
    confirmation_state: "confirmed",
    notes: "Sessao correu bem. Reavaliar em duas semanas.",
    pack_instance_id: packInstanceId,
  });
  if (appt.error) throw new Error(`source appointment insert failed: ${appt.error.message}`);

  return { appointmentId, packInstanceId, practitionerId, startsAt };
}

/** available = sessions_total - legacy_consumed - linked non-cancelled. */
async function packAvailable(db: SupabaseClient, packInstanceId: string): Promise<number> {
  const { data: inst, error: e1 } = await db
    .from("patient_pack_instances")
    .select("sessions_total, legacy_consumed")
    .eq("id", packInstanceId)
    .limit(1);
  if (e1) throw new Error(`pack instance read failed: ${e1.message}`);
  const row = inst?.[0] as { sessions_total: number; legacy_consumed: number } | undefined;
  if (!row) throw new Error("pack instance vanished");
  const { data: linked, error: e2 } = await db
    .from("appointments")
    .select("id, status")
    .eq("pack_instance_id", packInstanceId);
  if (e2) throw new Error(`linked appointments read failed: ${e2.message}`);
  const consuming = (linked ?? []).filter((a) => (a as { status: string }).status !== "cancelled");
  return row.sessions_total - row.legacy_consumed - consuming.length;
}

type CloneRow = {
  id: string;
  patient_id: string;
  practitioner_id: string;
  location_id: string;
  service_id: string | null;
  room: string | null;
  notes: string | null;
  status: string;
  confirmation_state: string;
  pack_instance_id: string | null;
  starts_at: string;
  ends_at: string;
};

/** The clone is the OTHER appointment for this patient at the picked window. */
async function readClone(db: SupabaseClient, sourceId: string, startsAt: Date): Promise<CloneRow> {
  const { data, error } = await db
    .from("appointments")
    .select(
      "id, patient_id, practitioner_id, location_id, service_id, room, notes, status, confirmation_state, pack_instance_id, starts_at, ends_at",
    )
    .eq("patient_id", PATIENTS.maria.id)
    .eq("starts_at", startsAt.toISOString())
    .neq("id", sourceId);
  if (error) throw new Error(`clone read failed: ${error.message}`);
  const rows = (data ?? []) as CloneRow[];
  if (rows.length !== 1) {
    throw new Error(
      `expected exactly ONE clone at ${startsAt.toISOString()}, found ${rows.length}. ` +
        "A retry on the same day, or no row written at all - both are real failures.",
    );
  }
  return rows[0]!;
}

/** Every assertion the dispatch names, on the row the browser just created. */
async function assertCopiedShape(
  db: SupabaseClient,
  clone: CloneRow,
  fx: Fixture,
  expectedStart: Date,
): Promise<void> {
  // COPIES: patient, therapist, service, location, duration, secondary participants.
  expect(clone.patient_id).toBe(PATIENTS.maria.id);
  expect(clone.practitioner_id).toBe(fx.practitionerId);
  expect(clone.service_id).toBe(SERVICE.id);
  expect(clone.location_id).toBe(LOCATION.id);
  const durationMin =
    (new Date(clone.ends_at).getTime() - new Date(clone.starts_at).getTime()) / 60_000;
  expect(durationMin).toBe(55);
  expect(new Date(clone.starts_at).toISOString()).toBe(expectedStart.toISOString());

  // DOES NOT COPY: status (fresh lifecycle), the confirmation state, the notes,
  // the room, and the pacote link.
  expect(clone.status).toBe("scheduled");
  expect(clone.confirmation_state).toBe("pending");
  expect(clone.notes).toBeNull();
  expect(clone.room).toBeNull();
  expect(clone.pack_instance_id).toBeNull();

  // RULE 1: the write went through cloneAppointment, not a bespoke insert. The
  // audit row is the evidence, and `clonedFrom` names the source it came from.
  const { data: audit, error } = await db
    .from("audit_log")
    .select("action, metadata")
    .eq("tenant_id", TENANT_A)
    .eq("entity_id", clone.id);
  if (error) throw new Error(`audit read failed: ${error.message}`);
  const created = (audit ?? []).filter(
    (r) => (r as { action: string }).action === "appointment.create",
  );
  expect(created.length).toBe(1);
  expect((created[0] as { metadata: { clonedFrom?: string } }).metadata.clonedFrom).toBe(
    fx.appointmentId,
  );
}

/**
 * Fills the schedule-again form and confirms it, through the SAME helpers every
 * other spec uses for these two controls: the shared DatePicker takes typed
 * dd/mm/aaaa via `pressSequentially` (a plain fill() posts an empty field on
 * WebKit) and the TimeField is two selects, not a text input.
 */
async function pickAndConfirm(page: Page, date: string, hhmm: string): Promise<void> {
  const drawer = page.getByRole("dialog").filter({ hasText: SCHEDULE_AGAIN });
  await expect(drawer).toBeVisible();
  await fillDate(dateField(drawer), date);
  await fillTime(drawer, hhmm);
  await drawer.getByRole("button", { name: CONFIRM, exact: true }).click();
}

test.describe("SCHED-15 - Marcar novamente", () => {
  test("copies a completed visit from the PATIENT PROFILE row", async ({ page }, testInfo) => {
    const db = serviceClient();
    const fx = await seedPastLinkedVisit(db, 3);

    // NEGATIVE CONTROL, and it runs FIRST. If the source is not linked, every
    // rule-2 assertion below passes for the wrong reason.
    expect(await packAvailable(db, fx.packInstanceId)).toBe(9);

    const day = futureDate(RUN_DAY_BASE + 56 + testInfo.retry * 100);
    const target = lisbonDateTimeToUtc(day, "10:00");

    await page.goto(`/patients/${PATIENTS.maria.id}?tab=consultas`);
    const button = page.getByRole("button", { name: SCHEDULE_AGAIN }).first();
    await expect(button).toBeVisible({ timeout: 15_000 });
    await button.click();
    await pickAndConfirm(page, day, "10:00");

    // THE SCREEN: the success toast the form raises.
    await expect(page.getByText("Nova marcação criada.")).toBeVisible();

    // THE ROW.
    const clone = await readClone(db, fx.appointmentId, target);
    await assertCopiedShape(db, clone, fx, target);

    // RULE 2, the consequence rather than the column: the balance did not move.
    expect(await packAvailable(db, fx.packInstanceId)).toBe(9);
  });

  test("copies a completed visit from the EDITAR MARCACAO drawer", async ({ page }, testInfo) => {
    const db = serviceClient();
    const fx = await seedPastLinkedVisit(db, 4);
    expect(await packAvailable(db, fx.packInstanceId)).toBe(9);

    const day = futureDate(RUN_DAY_BASE + 57 + testInfo.retry * 100);
    const target = lisbonDateTimeToUtc(day, "11:00");

    // The agenda on the source's own day, then the appointment's card.
    const srcDay = fx.startsAt.toISOString().slice(0, 10);
    await page.goto(`/agenda?view=day&date=${srcDay}`);
    const card = page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();

    const edit = page.getByRole("dialog");
    await expect(edit).toBeVisible();
    await edit.getByRole("button", { name: SCHEDULE_AGAIN }).click();
    await pickAndConfirm(page, day, "11:00");

    await expect(page.getByText("Nova marcação criada.")).toBeVisible();
    const clone = await readClone(db, fx.appointmentId, target);
    await assertCopiedShape(db, clone, fx, target);
    expect(await packAvailable(db, fx.packInstanceId)).toBe(9);
  });

  test("the drawer does NOT offer it on a CANCELLED past visit - the rule-2 gate arm", async ({
    page,
  }) => {
    const db = serviceClient();
    const fx = await seedPastLinkedVisit(db, 5);
    const { error } = await db
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", fx.appointmentId);
    if (error) throw new Error(`cancel failed: ${error.message}`);

    const srcDay = fx.startsAt.toISOString().slice(0, 10);
    await page.goto(`/agenda?view=day&date=${srcDay}`);
    const card = page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
    const edit = page.getByRole("dialog");
    await expect(edit).toBeVisible();
    // Present for a consuming visit, absent for a cancelled one. Asserting the
    // dialog is open first is what stops this passing because nothing rendered.
    await expect(edit.getByRole("button", { name: SCHEDULE_AGAIN })).toHaveCount(0);
  });
});
