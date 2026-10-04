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
 *   - accepting for a patient with NO email shows the notice, word for word,
 *     and the acceptance still goes through;
 *   - under the canary, a patient who is NOT on the list gets today's
 *     behaviour: no notice, though there is no email on file;
 *   - a request that was already decided cannot be accepted a second time.
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
 * stack. Four invented patients (fixtures.ts, BOOK_CONFIRM_PATIENTS), one
 * request each, three days out at hours no clinic is open, so they sit at the
 * TOP of a queue that is sorted soonest-first and collide with no other spec's
 * booking day. Everything is removed first and again afterwards, so a
 * persistent lane database does not accumulate them.
 *
 * The dev server runs BOOK_CONFIRM_MODE=canary with the three listed fixture
 * ids (playwright.config.ts). The "no email" test is the POSITIVE CONTROL for
 * that: on a server started without the switch it goes red, so the three "no
 * notice" tests around it cannot pass merely because the feature is off.
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

const NOTICE = "Paciente sem email: avise por telefone";

type Who = keyof typeof BOOK_CONFIRM_PATIENTS;

/** One request per patient: where, and at which (closed) hour. */
const REQUESTS: Record<Who, { locationId: string; time: string }> = {
  emailLv: { locationId: LOCATION.id, time: "05:00" },
  emailB: { locationId: LOCATION_B.id, time: "05:30" },
  noEmail: { locationId: LOCATION.id, time: "06:00" },
  notListed: { locationId: LOCATION_B.id, time: "06:30" },
};

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
  if (db) await removeOwnRows();
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

test("all four requests are in the Pedidos queue before anything is accepted", async ({ page }) => {
  await page.goto("/notificacoes");
  for (const who of Object.keys(REQUESTS) as Who[]) {
    await expect(requestRow(page, who)).toHaveCount(1);
    expect(await statusOf(appointmentId[who])).toBe("scheduled");
  }
  await expect(page.getByText(NOTICE, { exact: true })).toHaveCount(0);
});

test("Linda-a-Velha: accepting a request for a patient WITH an email confirms it and shows no notice", async ({
  page,
}) => {
  await accept(page, "emailLv");
  await expect(page.getByText(NOTICE, { exact: true })).toHaveCount(0);
});

test("Consultório B: accepting a request for a patient WITH an email confirms it and shows no notice", async ({
  page,
}) => {
  await accept(page, "emailB");
  await expect(page.getByText(NOTICE, { exact: true })).toHaveCount(0);
});

test("a patient with NO email: the request is accepted and the approver sees the notice, word for word", async ({
  page,
}) => {
  await accept(page, "noEmail");

  const notice = page.getByRole("status").filter({ hasText: NOTICE });
  await expect(notice).toHaveCount(1);
  // The exact sentence, as its own element, not a fragment of a longer one.
  await expect(notice.getByText(NOTICE, { exact: true })).toBeVisible();
  // And it says WHICH patient to ring, because the row itself is gone.
  await expect(notice).toContainText(BOOK_CONFIRM_PATIENTS.noEmail.name);
});

test("canary: a patient who is NOT on the list gets today's behaviour, so no notice", async ({ page }) => {
  // No email on file either. The only difference from the test above is the list.
  await accept(page, "notListed");
  await expect(page.getByText(NOTICE, { exact: true })).toHaveCount(0);
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
