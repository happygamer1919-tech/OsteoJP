/**
 * agenda-drawer-loader.spec.ts - SKEW-01 PR 2 (owner acceptance: "opening an
 * appointment fires one loader instead of seven POSTs; the panel renders
 * identically (e2e snapshot of the panel before and after); no write path
 * changes").
 *
 * WHAT IT MEASURES, per role, on one seeded marcacao:
 *   1. every server-action POST (a POST carrying a `next-action` header) sent
 *      between the click on the card and the drawer settling, counted RAW and
 *      as DISTINCT action ids. `pnpm dev` runs React in StrictMode, which runs
 *      every mount effect twice, so the raw count is roughly double what a
 *      production build sends; the distinct count is not.
 *   2. how long each of those POSTs took, and from the click to settled.
 *   3. the drawer's accessible structure and text (Playwright's aria snapshot
 *      of the dialog), with the one value that moves between days, the date,
 *      replaced by a placeholder. Not a pixel compare.
 *
 * BEFORE AND AFTER. The "before" numbers come from origin/main, where this file
 * does not exist: copy it into a checkout of main and run it with
 *   DRAWER_LOADER_MODE=before DRAWER_LOADER_RECORD=<dir-a>
 * which records and asserts nothing about the count. Then run it on this branch
 * with
 *   DRAWER_LOADER_BASELINE=<dir-a> DRAWER_LOADER_RECORD=<dir-b>
 * which asserts the snapshot EQUALS the recorded one, and prints both counts.
 * Both runs go through `node scripts/lane-stack.mjs e2e --lane <lane> --
 * e2e/agenda-drawer-loader.spec.ts --project=chromium`. The dev server is
 * reused when one is already listening on the lane's port, so stop it between
 * the two checkouts or the second run measures the first checkout's code.
 *
 * ON ITS OWN (CI, or no env), it asserts the after-state: exactly one distinct
 * server action is sent on open, and it is the loader (its body carries the
 * appointment id and the day together).
 *
 * THE SNAPSHOT IS NOT VACUOUS. Before the snapshot is taken, each piece the
 * loader serves is asserted ON SCREEN: the availability panel with its hours,
 * the two notes, the SMS marker (a landline), the NESA warning (a pacemaker on
 * a sensitive service) and the pacote panel. Two empty drawers cannot compare
 * equal here.
 *
 * FIXTURES. Written with the service client at FIXED ids, deleted before and
 * after the file: its own patient, two marcacoes and four notes, each note and
 * each "Criado por" at a fixed instant. The day is a Monday about two and a
 * half years out, derived from futureDate and not from RUN_DAY_BASE: past every
 * day RUN_DAY_BASE can reach (at most 359 + 152 + 200 on a second retry), and a
 * Monday because "E2E Terapeuta Clinica Unica" is seeded with hours on Mondays
 * only (09:00-13:00 at Linda-a-Velha), so the panel has hours, a booking and
 * free slots to show. No other spec books this patient, these therapists on
 * that day, or at these ids.
 */
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";

import { LOCATION, SERVICE_NESA, STORAGE, TENANT_A, futureDate } from "./fixtures";
import { serviceClient, therapistUserId } from "./helpers/confirm-code";

test.describe.configure({ mode: "serial" });

const MODE = process.env.DRAWER_LOADER_MODE === "before" ? "before" : "after";
const RECORD_DIR = process.env.DRAWER_LOADER_RECORD ?? "";
const BASELINE_DIR = process.env.DRAWER_LOADER_BASELINE ?? "";

/** This spec's own patient: a landline (no SMS) and a pacemaker (NESA warning). */
const PATIENT = {
  id: "00000000-0000-4000-8000-00000051e201",
  name: "E2E Gaveta Carregador",
  phone: "+351 212 345 677",
} as const;

/** A: at the Monday therapist, for admin and reception. B: at E2E Therapist, for the therapist. */
const APPT_A = "00000000-0000-4000-8000-00000051e211";
const APPT_B = "00000000-0000-4000-8000-00000051e212";
const NOTES = [
  { id: "00000000-0000-4000-8000-00000051e221", appointment: APPT_A, body: "SKEW-01 nota um", at: "2026-01-12T09:15:00Z" },
  { id: "00000000-0000-4000-8000-00000051e222", appointment: APPT_A, body: "SKEW-01 nota dois", at: "2026-01-12T09:45:00Z" },
  { id: "00000000-0000-4000-8000-00000051e223", appointment: APPT_B, body: "SKEW-01 nota tres", at: "2026-01-12T10:15:00Z" },
  { id: "00000000-0000-4000-8000-00000051e224", appointment: APPT_B, body: "SKEW-01 nota quatro", at: "2026-01-12T10:45:00Z" },
] as const;
/** The row insert time the "Criado por" line prints: fixed, so it reads the same on every run. */
const CREATED_AT = "2026-01-05T14:00:00Z";

/**
 * A Monday about 900 days out. The same day for every test in a run, and for a
 * retry too: the fixtures are removed and rewritten by id, not by day.
 */
function farMonday(): string {
  const d = new Date(`${futureDate(900)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((1 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

let db: SupabaseClient;
let e2eTherapistId = "";
let mondayTherapistId = "";

async function mustOk(p: PromiseLike<{ error: { message: string } | null }>, what: string): Promise<void> {
  const { error } = await p;
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

async function userIdByEmail(email: string): Promise<string> {
  const { data, error } = await db.from("users").select("id").eq("tenant_id", TENANT_A).eq("email", email).limit(1);
  if (error) throw new Error(`users lookup failed: ${error.message}`);
  const id = data?.[0]?.id as string | undefined;
  if (!id) throw new Error(`seeded user ${email} is missing. Run: node apps/web/e2e/seed/seed-e2e.mjs`);
  return id;
}

async function removeFixtures(): Promise<void> {
  // Children first. A leftover from a crashed run is removed the same way.
  const notes = await db.from("appointment_notes").delete().in("appointment_id", [APPT_A, APPT_B]);
  const appts = await db.from("appointments").delete().in("id", [APPT_A, APPT_B]);
  const patient = await db.from("patients").delete().eq("id", PATIENT.id);
  for (const [what, r] of [["notes", notes], ["appointments", appts], ["patient", patient]] as const) {
    if (r.error) console.warn(`[drawer-loader] cleanup of ${what} did not complete: ${r.error.message}`);
  }
}

async function writeFixtures(day: string): Promise<void> {
  await removeFixtures();
  await mustOk(
    db.from("patients").upsert({
      id: PATIENT.id,
      tenant_id: TENANT_A,
      full_name: PATIENT.name,
      phone: PATIENT.phone,
      contraindication_pacemaker: true,
      primary_location_id: LOCATION.id,
    }),
    "patient insert",
  );
  const row = (id: string, practitionerId: string, time: string) => {
    const startsAt = lisbonDateTimeToUtc(day, time);
    return {
      id,
      tenant_id: TENANT_A,
      patient_id: PATIENT.id,
      practitioner_id: practitionerId,
      location_id: LOCATION.id,
      service_id: SERVICE_NESA.id,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      status: "scheduled",
      origin: "staff",
      created_at: CREATED_AT,
    };
  };
  await mustOk(
    db.from("appointments").insert([row(APPT_A, mondayTherapistId, "10:00"), row(APPT_B, e2eTherapistId, "11:00")]),
    "appointments insert",
  );
  await mustOk(
    db.from("appointment_notes").insert(
      NOTES.map((n) => ({
        id: n.id,
        tenant_id: TENANT_A,
        appointment_id: n.appointment,
        patient_id: PATIENT.id,
        author_user_id: e2eTherapistId,
        body: n.body,
        created_at: n.at,
      })),
    ),
    "notes insert",
  );
}

test.beforeAll(async () => {
  db = serviceClient();
  e2eTherapistId = await therapistUserId(db);
  mondayTherapistId = await userIdByEmail("e2e-therapist-loc-one@osteojp.test");
  await writeFixtures(farMonday());
});

test.afterAll(async () => {
  if (db) await removeFixtures();
});

type SeenAction = { id: string; body: string; startedAt: number; ms: number | null };

/**
 * Records every server-action POST from `startAt()` on. Registered BEFORE the
 * click, so the first POST of the open cannot be missed.
 */
function watchActions(page: Page) {
  let armed = false;
  const seen: SeenAction[] = [];
  const byRequest = new Map<Request, SeenAction>();
  let inFlight = 0;
  let lastEventAt = Date.now();
  const isAction = (r: Request) => r.method() === "POST" && !!r.headers()["next-action"];
  page.on("request", (r) => {
    if (!armed || !isAction(r)) return;
    const s: SeenAction = { id: r.headers()["next-action"]!, body: r.postData() ?? "", startedAt: Date.now(), ms: null };
    seen.push(s);
    byRequest.set(r, s);
    inFlight += 1;
    lastEventAt = Date.now();
  });
  const done = (r: Request) => {
    const s = byRequest.get(r);
    if (!s) return;
    byRequest.delete(r);
    s.ms = Date.now() - s.startedAt;
    inFlight -= 1;
    lastEventAt = Date.now();
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return {
    startAt() {
      armed = true;
      lastEventAt = Date.now();
    },
    /**
     * Settled: nothing in flight, and nothing sent or answered for QUIET_MS.
     * The quiet window is longer than the old 300 ms patient-search debounce,
     * so on main that search is counted rather than raced.
     */
    async settled(clickAt: number): Promise<number> {
      const QUIET_MS = 1_500;
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const now = Date.now();
        if (inFlight === 0 && now - lastEventAt >= QUIET_MS && now - clickAt >= QUIET_MS) return Math.max(0, lastEventAt - clickAt);
        await page.waitForTimeout(100);
      }
      throw new Error(`the drawer never settled: ${inFlight} server action(s) still in flight after 60 s`);
    },
    seen,
  };
}

/** What a POST was for, read from its arguments; the action id itself is a hash. */
function label(body: string): string {
  if (body.includes('"appointmentId"') && body.includes('"date"')) return "drawer loader";
  if (body.includes('"therapistId"') && body.includes('"date"')) return "availability";
  if (body.includes(APPT_A) || body.includes(APPT_B)) return "by appointment (notes or pacotes)";
  if (body.includes(PATIENT.id)) return "by patient (NESA flags or SMS reason)";
  if (body.includes(PATIENT.name)) return "patient search";
  return "by therapist (services or locations) or other";
}

function normalise(snapshot: string, day: string): string {
  const [y, m, d] = day.split("-");
  return snapshot.split(day).join("<dia>").split(`${d}/${m}/${y}`).join("<dia>");
}

type Measured = {
  mode: "before" | "after";
  role: string;
  appointment: string;
  raw: number;
  distinct: number;
  settledMs: number;
  requests: { id: string; label: string; ms: number | null }[];
  snapshot: string;
};

async function openAndMeasure(page: Page, day: string, appointmentId: string): Promise<{ dialog: Locator; m: Omit<Measured, "mode" | "role" | "appointment" | "snapshot"> }> {
  await page.goto(`/agenda?view=day&date=${day}`);
  const card = page.locator(`[data-appointment-id="${appointmentId}"]`);
  await expect(card, "the seeded marcacao is not on this agenda").toHaveCount(1, { timeout: 20_000 });
  const watch = watchActions(page);
  watch.startAt();
  const clickAt = Date.now();
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByTestId("drawer-appointment-id")).toHaveText(appointmentId);
  const settledMs = await watch.settled(clickAt);
  const requests = watch.seen.map((s) => ({ id: s.id, label: label(s.body), ms: s.ms }));
  return {
    dialog,
    m: { raw: requests.length, distinct: new Set(requests.map((r) => r.id)).size, settledMs, requests },
  };
}

/** Every piece the loader serves is on screen, so the snapshot below compares something. */
async function expectEveryPieceShown(dialog: Locator, appointmentId: string, withHours: boolean): Promise<void> {
  // Availability: its title always; the Monday therapist's hours when the
  // marcacao is theirs (E2E Therapist is seeded with no hours at all).
  await expect(dialog.getByText("Disponibilidade", { exact: true }).first()).toBeVisible();
  if (withHours) await expect(dialog.getByText("09:00-13:00").first()).toBeVisible({ timeout: 15_000 });
  // Notes: both of this marcacao's notes, and none of the other one's.
  const board = dialog.getByTestId("appointment-notes-board");
  for (const n of NOTES) {
    const note = board.getByText(n.body, { exact: true });
    if (n.appointment === appointmentId) await expect(note).toBeVisible({ timeout: 15_000 });
    else await expect(note).toHaveCount(0);
  }
  const marker = dialog.getByTestId("drawer-patient-no-sms-marker");
  await expect(marker).toBeVisible({ timeout: 15_000 });
  await expect(marker).toHaveAttribute("data-reason", "landline");
  await expect(dialog.getByText(/contraindica\S+ NESA/)).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText(/Portador de pacemaker/)).toBeVisible();
  await expect(dialog.getByTestId("pack-link-none")).toBeVisible({ timeout: 15_000 });
}

function report(m: Measured, baseline: Measured | null): void {
  const lines = [
    `[drawer-loader] ${m.mode} ${m.role} ${m.appointment}: ${m.raw} POST(s) raw, ${m.distinct} distinct action id(s), settled ${m.settledMs} ms after the click`,
    ...m.requests.map((r, i) => `[drawer-loader]   ${i + 1}. ${r.label} ${r.ms ?? "?"} ms (action ${r.id.slice(0, 10)})`),
  ];
  if (baseline) {
    lines.push(
      `[drawer-loader] ${m.role} ${m.appointment} BEFORE ${baseline.raw} raw / ${baseline.distinct} distinct, settled ${baseline.settledMs} ms; ` +
        `AFTER ${m.raw} raw / ${m.distinct} distinct, settled ${m.settledMs} ms`,
    );
    const avail = baseline.requests.filter((r) => r.label === "availability").reduce((n, r) => n + (r.ms ?? 0), 0);
    const all = baseline.requests.reduce((n, r) => n + (r.ms ?? 0), 0);
    if (all > 0) lines.push(`[drawer-loader]   before, availability took ${avail} of ${all} ms of POST time`);
  }
  console.log(lines.join("\n"));
}

async function measureAndCompare(
  page: Page,
  role: string,
  appointment: "A" | "B",
  attach: (name: string, body: string) => Promise<void>,
): Promise<void> {
  const day = farMonday();
  const id = appointment === "A" ? APPT_A : APPT_B;
  const { dialog, m } = await openAndMeasure(page, day, id);
  await expectEveryPieceShown(dialog, id, appointment === "A");
  const measured: Measured = {
    mode: MODE,
    role,
    appointment,
    ...m,
    snapshot: normalise(await dialog.ariaSnapshot(), day),
  };
  const file = `${role}-${appointment}.json`;
  if (RECORD_DIR) {
    mkdirSync(RECORD_DIR, { recursive: true });
    writeFileSync(join(RECORD_DIR, file), JSON.stringify(measured, null, 2));
  }
  await attach(file, JSON.stringify(measured, null, 2));
  const baseline = BASELINE_DIR ? (JSON.parse(readFileSync(join(BASELINE_DIR, file), "utf8")) as Measured) : null;
  report(measured, baseline);

  if (baseline) {
    expect(baseline.mode, `${file} in the baseline directory was not recorded with DRAWER_LOADER_MODE=before`).toBe("before");
    expect(measured.snapshot, "the drawer does not render identically to origin/main").toBe(baseline.snapshot);
  }
  if (MODE === "after") {
    // ONE server action on open, and it is the loader.
    expect(measured.distinct, `server actions sent on open: ${measured.requests.map((r) => r.label).join(", ")}`).toBe(1);
    expect(measured.requests[0]?.label).toBe("drawer loader");
  }
}

test.describe("admin", () => {
  test.use({ storageState: STORAGE.admin });
  test("opens the Monday marcacao: one loader, the same drawer", async ({ page }, testInfo) => {
    await measureAndCompare(page, "admin", "A", (n, b) => testInfo.attach(n, { body: b, contentType: "application/json" }));
  });
});

test.describe("reception", () => {
  test.use({ storageState: STORAGE.reception });
  test("opens the Monday marcacao: one loader, the same drawer", async ({ page }, testInfo) => {
    await measureAndCompare(page, "reception", "A", (n, b) => testInfo.attach(n, { body: b, contentType: "application/json" }));
  });
});

test.describe("therapist", () => {
  test.use({ storageState: STORAGE.therapist });
  test("opens their own marcacao: one loader, the same drawer", async ({ page }, testInfo) => {
    await measureAndCompare(page, "therapist", "B", (n, b) => testInfo.attach(n, { body: b, contentType: "application/json" }));
  });
});
