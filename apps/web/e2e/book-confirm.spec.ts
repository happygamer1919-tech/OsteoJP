/**
 * book-confirm.spec.ts - BOOK-CONFIRM, in a browser, through the Pedidos queue.
 *
 * Strategy dispatch S-1003-B block 1: when reception accepts an online booking
 * request, the patient gets ONE confirmation, and when that patient has no
 * email on file the approver sees exactly "Paciente sem email: avise por
 * telefone".
 *
 * ==========================================================================
 * WHAT THIS SPEC PROVES
 * ==========================================================================
 * The half a browser can see, end to end through the real page and the real
 * server action (`confirmAppointmentRequest`):
 *
 *   - a request at EACH of the two seeded locations is accepted, leaves the
 *     queue, and is `confirmed` in the database;
 *   - accepting for a patient WITH an email shows no notice;
 *   - accepting for a patient with no email but a MOBILE shows no notice (the
 *     SMS reaches them; the rule since S-1004-A, 2026-10-04);
 *   - accepting for a patient with NEITHER an email nor a number the SMS leg
 *     can use shows the notice, word for word, and the acceptance still goes
 *     through;
 *   - accepting at a location with NO ADDRESS shows the second sentence, word
 *     for word, for a patient who has both an email and a mobile (the lead's
 *     decision of 2026-10-04: neither channel sends from such a location, so
 *     the approver is told);
 *   - under the canary, a patient who is NOT on the list gets today's
 *     behaviour: no notice, though nothing can reach them;
 *   - a request that was already decided cannot be accepted a second time;
 *   - THE PUBLIC-FORM PATH (S-1004-A, R40): reception converts a guest
 *     request, books from the deep link, the request is linked to that
 *     appointment and leaves the queue; a converted request that was NOT
 *     booked at once is booked later from its "Marcar consulta" button and is
 *     linked the same way; and a booking made for a guest whose patient has
 *     neither contact shows the notice.
 *
 * ==========================================================================
 * WHAT IT CANNOT PROVE, STATED RATHER THAN IMPLIED
 * ==========================================================================
 * The MESSAGE. The confirmation is sent by an Inngest function, the enqueue is
 * an `inngest.send`, and this suite runs no Inngest: there is no event to
 * deliver and no run to observe (marcar-novamente.spec.ts says the same of the
 * reminder enqueue, and no spec in this directory observes a send). So nothing
 * here asserts what a message says, how many were sent, or that a rejected
 * request sends none. Those are asserted where the dispatch actually runs:
 *
 *   lib/reminders/book-confirm.db.test.ts     real Postgres: each location's
 *       own address and phone in its message, one message for two approvals,
 *       the SMS fallback and no email for a patient without one, nothing for a
 *       rejected request, and the ledger row for each
 *   lib/reminders/book-confirm-dispatch.test.ts   every branch of the decision
 *   lib/reminders/book-confirm-event-flow.test.ts the marker, door to dispatch
 *
 * ==========================================================================
 * ITS OWN ROWS, WRITTEN HERE
 * ==========================================================================
 * A pedido is a portal booking, and driving the portal to make four of them
 * would test the portal. The rows are written the way confirm-code.spec.ts
 * writes its fixtures: through the service-role handle against the LOCAL
 * stack. Six invented patients (fixtures.ts, BOOK_CONFIRM_PATIENTS), one
 * request each, three days out at hours no clinic is open, so they sit at the
 * TOP of a queue that is sorted soonest-first and collide with no other spec's
 * booking day. Everything is removed first and again afterwards, so a
 * persistent lane database does not accumulate them.
 *
 * The dev server runs BOOK_CONFIRM_MODE=canary with the three listed fixture
 * ids (playwright.config.ts). The "neither" test is the POSITIVE CONTROL for
 * that: on a server started without the switch it goes red, so the "no
 * notice" tests around it cannot pass merely because the feature is off.
 *
 * ==========================================================================
 * THE TWO SEEDED LOCATIONS GET AN ADDRESS AND A PHONE FOR THIS SPEC
 * ==========================================================================
 * The seed gives Linda-a-Velha a phone and no address, and Consultório B
 * neither. Since 2026-10-04 that is a reason of its own: no confirmation is
 * sent from a location that cannot state where it is and how to ring it, and
 * the approver is told so. Left as seeded, EVERY acceptance below for a listed
 * patient would show that second sentence, and "no notice" would be true of
 * the first sentence only. So `beforeAll` writes an invented address and phone
 * on both, and `afterAll` puts back exactly what was there. The suite runs one
 * worker, in file order (playwright.config.ts), so no other spec sees them.
 * The one test that is ABOUT a location without an address removes it for its
 * own acceptance and restores it in a `finally`.
 */
import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import {
  BOOK_CONFIRM_PATIENTS,
  LOCATION,
  LOCATION_B,
  SERVICE,
  TENANT_A,
  USERS,
  futureDate,
} from "./fixtures";
import { serviceClient, therapistUserId } from "./helpers/confirm-code";
import { dateField, fillDate, fillTime } from "./helpers";
import { RUN_DAY_BASE, THERAPIST_NAME } from "./fixtures";

const NOTICE = "Paciente sem email: avise por telefone";
const LOCATION_NOTICE =
  "Confirmação não enviada: o local não tem morada ou telefone. Avise o paciente por telefone.";

type Who = keyof typeof BOOK_CONFIRM_PATIENTS;

/** One request per patient: where, and at which (closed) hour. */
const REQUESTS: Record<Who, { locationId: string; time: string }> = {
  emailLv: { locationId: LOCATION.id, time: "05:00" },
  emailB: { locationId: LOCATION_B.id, time: "05:30" },
  noEmail: { locationId: LOCATION.id, time: "06:00" },
  notListed: { locationId: LOCATION_B.id, time: "06:30" },
  neither: { locationId: LOCATION.id, time: "07:00" },
  locationBare: { locationId: LOCATION_B.id, time: "07:30" },
};

/** The contact both seeded locations carry while this spec runs. Invented. */
const SPEC_LOCATION_CONTACT = { address: "Rua de Exemplo 1, 1000-001 Lisboa", phone: "+351 210 000 000" };
const SPEC_LOCATION_IDS = [LOCATION.id, LOCATION_B.id];
/** What each location had before, to be put back. */
const locationBefore = new Map<string, { address: string | null; phone: string | null }>();

const PATIENT_IDS = Object.values(BOOK_CONFIRM_PATIENTS).map((p) => p.id);

let db: SupabaseClient;
const appointmentId = {} as Record<Who, string>;

async function removeOwnRows(): Promise<void> {
  // The notifications first: `staff_notifications.appointment_id` is not a
  // foreign key, so deleting the appointment would leave them behind.
  const notes = await db.from("staff_notifications").delete().in("patient_id", PATIENT_IDS);
  if (notes.error) throw new Error(`staff_notifications cleanup: ${notes.error.message}`);
  const appts = await db.from("appointments").delete().in("patient_id", PATIENT_IDS);
  if (appts.error) throw new Error(`appointments cleanup: ${appts.error.message}`);
}

async function setLocationContact(
  id: string,
  contact: { address: string | null; phone: string | null },
): Promise<void> {
  const { error } = await db.from("locations").update(contact).eq("id", id).eq("tenant_id", TENANT_A);
  if (error) throw new Error(`location contact ${id}: ${error.message}`);
}

async function restoreLocations(): Promise<void> {
  for (const [id, before] of locationBefore) await setLocationContact(id, before);
}

/** Neither sentence is on the page. */
async function expectNoNotice(page: Page): Promise<void> {
  await expect(page.getByText(NOTICE, { exact: true })).toHaveCount(0);
  await expect(page.getByText(LOCATION_NOTICE, { exact: true })).toHaveCount(0);
}

async function statusOf(id: string): Promise<string | undefined> {
  const { data, error } = await db.from("appointments").select("status").eq("id", id).limit(1);
  if (error) throw new Error(`appointments read: ${error.message}`);
  return data?.[0]?.status as string | undefined;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  db = serviceClient();
  const therapistId = await therapistUserId(db);

  const admin = await db
    .from("users")
    .select("id")
    .eq("tenant_id", TENANT_A)
    .eq("email", USERS.admin)
    .single();
  if (admin.error) throw new Error(`e2e admin: ${admin.error.message}`);

  await removeOwnRows();

  // Both seeded locations able to state where they are and how to ring them
  // (see the header). What was there is kept, and put back in afterAll.
  const before = await db.from("locations").select("id, address, phone").in("id", SPEC_LOCATION_IDS);
  if (before.error) throw new Error(`locations read: ${before.error.message}`);
  if ((before.data ?? []).length !== SPEC_LOCATION_IDS.length) {
    throw new Error(`locations read: expected ${SPEC_LOCATION_IDS.length} seeded locations`);
  }
  for (const l of before.data ?? []) {
    locationBefore.set(l.id as string, {
      address: (l.address as string | null) ?? null,
      phone: (l.phone as string | null) ?? null,
    });
  }
  for (const id of SPEC_LOCATION_IDS) await setLocationContact(id, SPEC_LOCATION_CONTACT);

  for (const p of Object.values(BOOK_CONFIRM_PATIENTS)) {
    const { error } = await db.from("patients").upsert({
      id: p.id,
      tenant_id: TENANT_A,
      full_name: p.name,
      email: p.email,
      phone: p.phone,
      deleted_at: null,
    });
    if (error) throw new Error(`patient ${p.id}: ${error.message}`);
  }

  // THREE DAYS OUT. The queue is sorted soonest-first and paged, so a request
  // months away could fall off the first page of a database that other specs
  // have left pedidos in. Nothing else in the suite books this close to today.
  const day = futureDate(3);
  for (const who of Object.keys(REQUESTS) as Who[]) {
    const id = randomUUID();
    const startsAt = lisbonDateTimeToUtc(day, REQUESTS[who].time);
    const endsAt = new Date(startsAt.getTime() + 25 * 60_000);
    const patientId = BOOK_CONFIRM_PATIENTS[who].id;
    const appt = await db.from("appointments").insert({
      id,
      tenant_id: TENANT_A,
      patient_id: patientId,
      practitioner_id: therapistId,
      location_id: REQUESTS[who].locationId,
      service_id: SERVICE.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      // A PEDIDO: booked by the patient, not yet accepted.
      status: "scheduled",
      origin: "patient_portal",
    });
    if (appt.error) throw new Error(`appointment for ${who}: ${appt.error.message}`);

    // The request notification the portal emits. `confirmAppointmentRequest`
    // only accepts a pedido the CALLER was notified about, so it is addressed
    // to the admin this spec is signed in as.
    const note = await db.from("staff_notifications").insert({
      tenant_id: TENANT_A,
      recipient_user_id: admin.data.id,
      kind: "appointment_request",
      appointment_id: id,
      patient_id: patientId,
      previous_starts_at: startsAt.toISOString(),
      new_starts_at: startsAt.toISOString(),
      occurred_at: new Date().toISOString(),
    });
    if (note.error) throw new Error(`notification for ${who}: ${note.error.message}`);

    appointmentId[who] = id;
  }
});

test.afterAll(async () => {
  if (!db) return;
  try {
    await removeOwnRows();
  } finally {
    await restoreLocations();
  }
});

/**
 * The QUEUE row for one of this spec's patients: the list item that carries the
 * patient's name AND a Confirmar button. The page also lists the request in its
 * notification log, by the same name, and that entry has no button.
 */
function requestRow(page: Page, who: Who) {
  return page
    .getByRole("listitem")
    .filter({ hasText: BOOK_CONFIRM_PATIENTS[who].name })
    .filter({ has: page.getByRole("button", { name: "Confirmar", exact: true }) });
}

async function accept(page: Page, who: Who): Promise<void> {
  await page.goto("/notificacoes");
  const row = requestRow(page, who);
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Confirmar", exact: true }).click();
  // The row leaves because the DATA changed: the action revalidates the page.
  await expect(requestRow(page, who)).toHaveCount(0);
  await expect.poll(() => statusOf(appointmentId[who])).toBe("confirmed");
}

test("every request is in the Pedidos queue before anything is accepted", async ({ page }) => {
  await page.goto("/notificacoes");
  for (const who of Object.keys(REQUESTS) as Who[]) {
    await expect(requestRow(page, who)).toHaveCount(1);
    expect(await statusOf(appointmentId[who])).toBe("scheduled");
  }
  await expectNoNotice(page);
});

test("Linda-a-Velha: accepting a request for a patient WITH an email confirms it and shows no notice", async ({
  page,
}) => {
  await accept(page, "emailLv");
  await expectNoNotice(page);
});

test("Consultório B: accepting a request for a patient WITH an email confirms it and shows no notice", async ({
  page,
}) => {
  await accept(page, "emailB");
  await expectNoNotice(page);
});

test("a patient with no email but a MOBILE: accepted, and NO notice, because the SMS reaches them", async ({
  page,
}) => {
  await accept(page, "noEmail");
  await expectNoNotice(page);
});

test("a patient with NEITHER an email nor a usable number: accepted, and the approver sees the notice, word for word", async ({
  page,
}) => {
  await accept(page, "neither");

  const notice = page.getByRole("status").filter({ hasText: NOTICE });
  await expect(notice).toHaveCount(1);
  // The exact sentence, as its own element, not a fragment of a longer one.
  await expect(notice.getByText(NOTICE, { exact: true })).toBeVisible();
  // And it says WHICH patient to ring, because the row itself is gone.
  await expect(notice).toContainText(BOOK_CONFIRM_PATIENTS.neither.name);
  // One reason, one sentence: the location is fine, so the second is absent.
  await expect(page.getByText(LOCATION_NOTICE, { exact: true })).toHaveCount(0);
});

test("a location with NO ADDRESS: accepted, and the approver sees the second sentence, word for word", async ({
  page,
}) => {
  // This patient has an email AND a mobile. What stops the confirmation is the
  // location: it cannot say where it is, so neither channel sends.
  const full = SPEC_LOCATION_CONTACT;
  await setLocationContact(LOCATION_B.id, { address: null, phone: full.phone });
  try {
    await accept(page, "locationBare");

    const notice = page.getByRole("status").filter({ hasText: LOCATION_NOTICE });
    await expect(notice).toHaveCount(1);
    await expect(notice.getByText(LOCATION_NOTICE, { exact: true })).toBeVisible();
    await expect(notice).toContainText(BOOK_CONFIRM_PATIENTS.locationBare.name);
    // And NOT the patient's sentence: there is nothing wrong with the patient.
    await expect(page.getByText(NOTICE, { exact: true })).toHaveCount(0);
  } finally {
    await setLocationContact(LOCATION_B.id, full);
  }
});

test("canary: a patient who is NOT on the list gets today's behaviour, so no notice", async ({ page }) => {
  // Nothing can reach this patient either. The only difference from the test
  // above is the list.
  await accept(page, "notListed");
  await expectNoNotice(page);
});

test("an accepted request is no longer in the queue, so it cannot be accepted a second time", async ({
  page,
}) => {
  await page.goto("/notificacoes");
  for (const who of Object.keys(REQUESTS) as Who[]) {
    await expect(requestRow(page, who)).toHaveCount(0);
    expect(await statusOf(appointmentId[who])).toBe("confirmed");
  }
});

/* ========================================================================== */
/* THE PUBLIC-FORM (GUEST) PATH. Strategy dispatch S-1004-A, R40.             */
/* ========================================================================== */

/**
 * "Public-form requests get linked to the appointment reception books for
 * them, and that link is the approval trigger."
 *
 * WHAT A BROWSER CAN SEE OF IT, and all of it is here:
 *   - reception presses Converter on a guest request and lands in the agenda
 *     with the Nova marcação drawer open on that person;
 *   - the request id rides the link and is stripped from the address bar once
 *     the drawer has it;
 *   - saving the booking LINKS the request (the column and the status, read
 *     from the database) and the request leaves the queue without a dismiss;
 *   - the notice appears only when the booked patient has neither an email nor
 *     a number the SMS leg can use.
 *
 * The MESSAGE is not observable here, for the reason this file's header gives.
 * lib/scheduling/guest-link.db.test.ts drives the same chain to the dispatch:
 * the link column written, exactly one send record, the email, the SMS, the
 * notice, the switch off and the canary.
 *
 * ITS OWN ROWS. The guest requests are written through the service-role
 * handle, as the public form would write them: a name and a mobile. Everything
 * the spec creates is removed first and again afterwards. Day band 160-163,
 * private to this block, pushed 100 days out on a retry.
 *
 * THE CANARY SHAPES THE SECOND TEST. The dev server applies the new behaviour
 * only to the listed fixture patients, and a patient the convert CREATES has a
 * fresh id that is on no list. So the notice arm books for the listed fixture
 * patient with neither contact, through a request already converted to them,
 * opened by the same deep link the convert would have produced.
 */
test.describe("the public-form path: convert, book from the deep link, the request is linked", () => {
  const GUEST_NAME = "Convidada Ligada Ficticia";
  const SAVE = "Guardar";

  /** A request as the public form writes it. Returns its id. */
  async function guestRequest(over: { phone: string; convertedPatientId?: string }): Promise<string> {
    const id = randomUUID();
    const { error } = await db.from("guest_booking_requests").insert({
      id,
      tenant_id: TENANT_A,
      full_name: GUEST_NAME,
      phone: over.phone,
      service_id: SERVICE.id,
      location_id: LOCATION.id,
      requested_starts_at: lisbonDateTimeToUtc(futureDate(RUN_DAY_BASE + 160), "09:00").toISOString(),
      requested_ends_at: lisbonDateTimeToUtc(futureDate(RUN_DAY_BASE + 160), "13:00").toISOString(),
      ...(over.convertedPatientId ? { converted_patient_id: over.convertedPatientId } : {}),
    });
    if (error) throw new Error(`guest request: ${error.message}`);
    return id;
  }

  async function requestState(id: string) {
    const { data, error } = await db
      .from("guest_booking_requests")
      .select("status, converted_patient_id, converted_appointment_id")
      .eq("id", id)
      .single();
    if (error) throw new Error(`guest request read: ${error.message}`);
    return data as {
      status: string;
      converted_patient_id: string | null;
      converted_appointment_id: string | null;
    };
  }

  async function removeGuestRows(): Promise<void> {
    const requests = await db
      .from("guest_booking_requests")
      .select("id, converted_patient_id")
      .eq("tenant_id", TENANT_A)
      .eq("full_name", GUEST_NAME);
    if (requests.error) throw new Error(`guest cleanup read: ${requests.error.message}`);
    // Patients the convert CREATED carry the guest's name. The fixture patient
    // (a request converted to them by this spec) is left in place.
    const created = await db
      .from("patients")
      .select("id")
      .eq("tenant_id", TENANT_A)
      .eq("full_name", GUEST_NAME);
    if (created.error) throw new Error(`guest cleanup patients: ${created.error.message}`);
    const createdIds = (created.data ?? []).map((p) => p.id as string);
    const bookedFor = [...createdIds, BOOK_CONFIRM_PATIENTS.neither.id, BOOK_CONFIRM_PATIENTS.noEmail.id];

    const del = await db.from("guest_booking_requests").delete().eq("tenant_id", TENANT_A).eq("full_name", GUEST_NAME);
    if (del.error) throw new Error(`guest cleanup: ${del.error.message}`);
    // Only THIS block's bookings: the fixture patients' pedidos above are the
    // first block's and are removed by its own cleanup.
    const appts = await db
      .from("appointments")
      .delete()
      .in("patient_id", bookedFor)
      .eq("origin", "staff");
    if (appts.error) throw new Error(`guest cleanup appointments: ${appts.error.message}`);
    // Best effort: a created patient has rows of its own (its clinic, its audit
    // trail). A refusal here leaves an invented patient behind on a lane
    // database and nothing else; CI starts from a reset one.
    if (createdIds.length > 0) {
      await db.from("patient_locations").delete().in("patient_id", createdIds);
      await db.from("patients").delete().in("id", createdIds);
    }
  }

  /** The drawer the deep link opened: fill what reception fills, and save. */
  async function bookFromOpenDrawer(page: Page, date: string, time: string) {
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 12_000 });
    await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THERAPIST_NAME });
    await dialog.getByLabel(/Localização/i).selectOption({ label: LOCATION.name });
    await fillDate(dateField(dialog), date);
    await fillTime(dialog, time);
    await dialog.getByRole("button", { name: SAVE }).click();
    await expect(dialog).toBeHidden({ timeout: 12_000 });
  }

  test.beforeAll(async () => {
    await removeGuestRows();
  });

  test.afterAll(async () => {
    if (db) await removeGuestRows();
  });

  test("Converter, then book from the deep link: the request is linked to that appointment and leaves the queue", async ({
    page,
  }, testInfo) => {
    const date = futureDate(RUN_DAY_BASE + 161 + testInfo.retry * 100);
    // A mobile nobody else has, so the row is "novo cliente" and one press converts.
    const phone = `93${String(Date.now()).slice(-7)}`;
    const requestId = await guestRequest({ phone });

    await page.goto("/notificacoes");
    const row = page.getByTestId("guest-request-row").filter({ hasText: GUEST_NAME });
    await expect(row).toHaveCount(1);
    await row.getByTestId("guest-convert-button").click();

    // Landed in the agenda with the create drawer open on the new person.
    await expect(page).toHaveURL(/\/agenda/, { timeout: 15_000 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 12_000 });
    await expect(dialog.locator('[aria-readonly="true"]')).toContainText(GUEST_NAME);
    // The request id rode the link and is cleared once the drawer holds it.
    await expect(page).toHaveURL(/^(?!.*pedidoConvidado).*$/);

    const converted = await requestState(requestId);
    expect(converted.converted_patient_id).not.toBeNull();
    expect(converted).toMatchObject({ status: "pending", converted_appointment_id: null });

    await bookFromOpenDrawer(page, date, "09:00");

    // THE LINK: the column, the status, and it points at this patient's booking.
    await expect.poll(async () => (await requestState(requestId)).status).toBe("confirmed");
    const linked = await requestState(requestId);
    expect(linked.converted_appointment_id).not.toBeNull();
    const appt = await db
      .from("appointments")
      .select("patient_id, origin")
      .eq("id", linked.converted_appointment_id as string)
      .single();
    if (appt.error) throw new Error(`appointment read: ${appt.error.message}`);
    expect(appt.data).toMatchObject({ patient_id: linked.converted_patient_id, origin: "staff" });

    // A mobile is on file, and this patient is on no canary list: no notice.
    await expectNoNotice(page);

    // And the request has left reception's queue, with no dismiss pressed.
    await page.goto("/notificacoes");
    await expect(page.getByTestId("guest-request-row").filter({ hasText: GUEST_NAME })).toHaveCount(0);
  });

  test("a guest booked for a patient with NEITHER contact: the notice, word for word; with a mobile: none", async ({
    page,
  }, testInfo) => {
    const deepLink = (patientId: string, requestId: string, date: string) =>
      "/agenda?" +
      new URLSearchParams({
        novaMarcacaoPaciente: patientId,
        novaMarcacaoServico: SERVICE.id,
        novaMarcacaoLocal: LOCATION.id,
        date,
        view: "day",
        pedidoConvidado: requestId,
      }).toString();

    // A LISTED patient with a mobile and no email: linked, no notice.
    const dateA = futureDate(RUN_DAY_BASE + 162 + testInfo.retry * 100);
    const withMobile = await guestRequest({
      phone: BOOK_CONFIRM_PATIENTS.noEmail.phone,
      convertedPatientId: BOOK_CONFIRM_PATIENTS.noEmail.id,
    });
    await page.goto(deepLink(BOOK_CONFIRM_PATIENTS.noEmail.id, withMobile, dateA));
    await bookFromOpenDrawer(page, dateA, "10:00");
    await expect.poll(async () => (await requestState(withMobile)).status).toBe("confirmed");
    await expectNoNotice(page);

    // A LISTED patient with neither: linked, and the approver is told.
    const dateB = futureDate(RUN_DAY_BASE + 163 + testInfo.retry * 100);
    const withNeither = await guestRequest({
      phone: BOOK_CONFIRM_PATIENTS.neither.phone,
      convertedPatientId: BOOK_CONFIRM_PATIENTS.neither.id,
    });
    await page.goto(deepLink(BOOK_CONFIRM_PATIENTS.neither.id, withNeither, dateB));
    await bookFromOpenDrawer(page, dateB, "11:00");
    await expect.poll(async () => (await requestState(withNeither)).status).toBe("confirmed");
    await expect(page.getByText(NOTICE, { exact: true })).toBeVisible();
    await expect(page.getByText(LOCATION_NOTICE, { exact: true })).toHaveCount(0);
  });

  test("converted but NOT booked at once: Marcar consulta on the row opens the same link, and the booking is linked", async ({
    page,
  }, testInfo) => {
    const date = futureDate(RUN_DAY_BASE + 164 + testInfo.retry * 100);
    const phone = `93${String(Date.now()).slice(-7)}`;
    const requestId = await guestRequest({ phone });

    // Convert, and then WALK AWAY from the drawer the redirect opened: the
    // case the link alone did not cover. A reload drops the drawer, and the
    // request id with it, because the id is cleared from the address bar.
    await page.goto("/notificacoes");
    const row = page.getByTestId("guest-request-row").filter({ hasText: GUEST_NAME });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("guest-book-button")).toHaveCount(0);
    await row.getByTestId("guest-convert-button").click();
    await expect(page).toHaveURL(/\/agenda/, { timeout: 15_000 });
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 12_000 });

    const converted = await requestState(requestId);
    expect(converted.converted_patient_id).not.toBeNull();
    expect(converted).toMatchObject({ status: "pending", converted_appointment_id: null });

    // Back in the queue: still there, still pending, and now it offers the
    // booking beside the dismiss.
    await page.goto("/notificacoes");
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("guest-dismiss-button")).toHaveCount(1);
    const book = row.getByTestId("guest-book-button");
    await expect(book).toHaveText("Marcar consulta");
    // Built from the row's own data: this patient, this request.
    const href = await book.getAttribute("href");
    expect(href).toContain(`novaMarcacaoPaciente=${converted.converted_patient_id}`);
    expect(href).toContain(`pedidoConvidado=${requestId}`);
    expect(href).toContain(`novaMarcacaoServico=${SERVICE.id}`);
    expect(href).toContain(`novaMarcacaoLocal=${LOCATION.id}`);
    await book.click();

    await expect(page).toHaveURL(/\/agenda/, { timeout: 15_000 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 12_000 });
    await expect(dialog.locator('[aria-readonly="true"]')).toContainText(GUEST_NAME);
    await expect(page).toHaveURL(/^(?!.*pedidoConvidado).*$/);

    await bookFromOpenDrawer(page, date, "12:00");

    await expect.poll(async () => (await requestState(requestId)).status).toBe("confirmed");
    const linked = await requestState(requestId);
    expect(linked.converted_appointment_id).not.toBeNull();
    const appt = await db
      .from("appointments")
      .select("patient_id, origin")
      .eq("id", linked.converted_appointment_id as string)
      .single();
    if (appt.error) throw new Error(`appointment read: ${appt.error.message}`);
    expect(appt.data).toMatchObject({ patient_id: linked.converted_patient_id, origin: "staff" });

    // Linked, so it has left the queue with no dismiss pressed.
    await page.goto("/notificacoes");
    await expect(page.getByTestId("guest-request-row").filter({ hasText: GUEST_NAME })).toHaveCount(0);
  });
});
