/**
 * shadow-compare-nc.db.test.ts - the compare's NC label and the dispatch agree, fixture by fixture.
 *
 * STRATEGY'S RULING F4 OF 2026-11-06: the 2026-11-06 shadow compare
 * (scripts/db/read-shadow-compare-20261106.sql) names a shadow-only mark NC when the dispatch's
 * contact and channel rule (apps/web/lib/reminders/dispatch.ts:1290 to 1303) would refuse it. NC
 * must use the SAME fields and the SAME predicate as those lines, and a test must pin that the two
 * agree on the same fixtures, without a second copy of the rule.
 *
 * HOW THIS TEST AVOIDS A SECOND COPY.
 *   - The dispatch side is the REAL exported `dispatchReminder`, run on the open path (the sweep
 *     not sending), with only its edges replaced: the visit loader returns the fixture (as
 *     ./dispatch.test.ts does), and the claim, the ledger and the two transports do nothing. Lines
 *     1290 to 1303 run as written, `!!data.patientEmail` and the channel narrowing included. Its
 *     answer is read off the outcome: `lead_time_off`, `no_contact` or `channels_off` is a refusal
 *     at those lines; any other outcome means the run got past them. Nothing of the rule is written
 *     here.
 *   - The SQL side is the expression between `-- NC RULE FROM HERE` and `-- NC RULE TO HERE` in the
 *     read itself, cut out of the file at run time and evaluated by Postgres on the same fixtures,
 *     with the input columns typed as the real columns are (checked against the catalog).
 *   - The pins below hold the cited lines and the read's input columns to their text, so a change
 *     to either side fails here before it can drift silently.
 *
 * The SQL side needs a database: it runs where DATABASE_URL is set (the DB-gated CI job, or a local
 * throwaway). The dispatch side and the pins run everywhere. Every value is invented.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({ loadReminderData: vi.fn() }));

vi.mock("@/lib/reminders/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reminders/data")>();
  return { ...actual, loadReminderData: h.loadReminderData };
});
vi.mock("@/lib/reminders/reminder-claim", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reminders/reminder-claim")>();
  return {
    ...actual,
    takeReminderClaim: vi.fn(async () => ({ held: false, claimId: null })),
    takeReminderClaimClosed: vi.fn(async () => ({ held: false, claimId: null })),
    releaseReminderClaim: vi.fn(async () => undefined),
  };
});
vi.mock("@/lib/reminders/dispatch-ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reminders/dispatch-ledger")>();
  return { ...actual, recordDispatch: vi.fn(async () => undefined) };
});
vi.mock("@/lib/reminders/clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reminders/clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (m: Parameters<typeof actual.sendEmail>[0]) => actual.sendEmail(m)),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => actual.sendSms(m)),
  };
});

import { dispatchReminder } from "@/lib/reminders/dispatch";
import { channelForOffset } from "@/lib/reminders/offsets";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (p: string) => readFileSync(`${ROOT}${p}`, "utf8");
const READ_PATH = "scripts/db/read-shadow-compare-20261106.sql";
const F4_PATH = "scripts/db/read-f4-contact-20261106.sql";

/** dispatch.ts:1289, the line that makes `config` for the cited lines; the read quotes it too. */
const CONFIG_LINE = "  const config = parseTenantConfig(data.tenantSettings).reminders;";
/** dispatch.ts:1290 to 1303 on main (50383ca9), exactly; the read quotes them at `nc`. */
const CITED_FIRST = 1290;
const CITED = [
  "  const plan = planReminderChannels(",
  "    config,",
  "    offsetId,",
  "    { email: !!data.patientEmail, phone: !!data.patientPhone },",
  "    { smsEnabled: data.patientReminderSmsEnabled, emailEnabled: data.patientReminderEmailEnabled },",
  "  );",
  "  if (!plan.send) return { dispatched: false, reason: plan.reason };",
  "",
  "  // One run sends ONE channel. The scheduler already fanned out per channel, so",
  "  // narrowing the plan here is what keeps the run and its idempotency key aligned:",
  "  // a run keyed on ...:email must never also send an SMS.",
  "  const wantEmail = channel === \"email\" && plan.email;",
  "  const wantSms = channel === \"sms\" && plan.sms;",
  "  if (!wantEmail && !wantSms) return { dispatched: false, reason: \"channels_off\" };",
];

/** The read's inputs: each field the cited lines read, and the column it comes from. */
const INPUTS: [string, string, string, string][] = [
  // [the loader's field, the loader's column, the read's select, the catalog type]
  ["patientEmail", "patients.email", "pt.email as nc_email", "text"],
  ["patientPhone", "patients.phone", "pt.phone as nc_phone", "character varying"],
  ["patientReminderEmailEnabled", "patients.reminderEmailEnabled", "pt.reminder_email_enabled as nc_email_on", "boolean"],
  ["patientReminderSmsEnabled", "patients.reminderSmsEnabled", "pt.reminder_sms_enabled as nc_sms_on", "boolean"],
  ["tenantSettings", "tenants.settings", "tn.settings as nc_settings", "jsonb"],
];

const PLAN_REASONS = ["lead_time_off", "no_contact", "channels_off"] as const;
/** Outcomes decided BEFORE line 1290: a fixture that reaches one of them proves nothing. */
const BEFORE_THE_RULE = ["status", "unconfirmed", "channel_not_for_offset", "not_found", "patient_deleted", "claim_held", "claim_held_by_duplicate", "not_due"];

type Fixture = {
  k: number;
  nc_email: string | null;
  nc_phone: string | null;
  nc_email_on: boolean;
  nc_sms_on: boolean;
  nc_settings: unknown;
  offset_id: "48h" | "24h";
  channel: "email" | "sms";
};

/** Every combination: contact present, empty or missing; both switches; tenant settings of every shape the parser treats apart. */
function fixtures(): Fixture[] {
  const emails = [null, "", "patient@example.invalid"];
  const phones = [null, "", "+351 912 345 678"];
  const settings: unknown[] = [
    {},
    null,
    { reminders: {} },
    { reminders: [] },
    { reminders: "on" },
    { reminders: { emailEnabled: false } },
    { reminders: { smsEnabled: false } },
    { reminders: { emailEnabled: "false", smsEnabled: 0 } },
    { reminders: { leadTimeHours: [24] } },
    { reminders: { leadTimeHours: [48] } },
    { reminders: { leadTimeHours: [] } },
    { reminders: { leadTimeHours: ["48", "24"] } },
    { reminders: { leadTimeHours: "48" } },
    { reminders: { leadTimeHours: [48.0, 72], emailEnabled: true, smsEnabled: true } },
  ];
  const out: Fixture[] = [];
  let k = 0;
  for (const nc_email of emails)
    for (const nc_phone of phones)
      for (const nc_email_on of [true, false])
        for (const nc_sms_on of [true, false])
          for (const nc_settings of settings)
            for (const [offset_id, channel] of [["48h", "email"], ["24h", "sms"]] as const)
              out.push({ k: k++, nc_email, nc_phone, nc_email_on, nc_sms_on, nc_settings, offset_id, channel });
  return out;
}

const TENANT_ID = "00000000-0000-4000-8000-00000000f106";
const APPOINTMENT_ID = "00000000-0000-4000-8000-000000000106";
const PATIENT_ID = "00000000-0000-4000-8000-000000001106";
const STARTS_AT = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

/** The loaded visit, as loadReminderData returns it, carrying the fixture's five fields. */
function visit(f: Fixture) {
  return {
    appointmentId: APPOINTMENT_ID,
    startsAt: STARTS_AT,
    status: "confirmed",
    confirmationState: null,
    origin: "staff",
    patientId: PATIENT_ID,
    patientName: "Paciente Inventado",
    patientEmail: f.nc_email,
    patientPhone: f.nc_phone,
    patientReminderSmsEnabled: f.nc_sms_on,
    patientReminderEmailEnabled: f.nc_email_on,
    practitionerName: "Terapeuta Inventado",
    locationName: "Clinica Inventada",
    locationPhone: "+351 210 000 000",
    locationAddress: "Rua Inventada 1",
    serviceName: null,
    tenantSettings: f.nc_settings,
    patientHasAcceptedTerms: true,
    patientDeletedAt: null,
  };
}

/** The dispatch's answer at lines 1290 to 1303, read off the real function's outcome. */
async function dispatchAnswer(f: Fixture): Promise<string> {
  h.loadReminderData.mockResolvedValue(visit(f));
  const outcome = await dispatchReminder(TENANT_ID, APPOINTMENT_ID, f.offset_id, f.channel);
  if (outcome.dispatched) return "send";
  if ((PLAN_REASONS as readonly string[]).includes(outcome.reason)) return outcome.reason;
  expect(BEFORE_THE_RULE, `fixture ${f.k} stopped before line 1290 (${outcome.reason}), so it tests nothing`).not.toContain(outcome.reason);
  return "send";
}

const ENV_KEYS = ["REMINDERS_LIVE_SEND", "REMINDERS_LINK_SECRET", "REMINDERS_RESCHEDULE_BASE_URL", "REMINDERS_SWEEP_MODE"];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  // Dry run, live send off; the open path (the sweep not sending); the email link can sign.
  process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://example.invalid";
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("NC's pins: the cited lines, the fields and the expression are where the read says", () => {
  it("dispatch.ts:1290 to 1303 are the lines the read quotes", () => {
    const lines = read("apps/web/lib/reminders/dispatch.ts").split("\n");
    expect(lines.slice(CITED_FIRST - 1, CITED_FIRST - 1 + CITED.length)).toEqual(CITED);
    expect(lines[CITED_FIRST - 2]).toBe(CONFIG_LINE);
    const sql = read(READ_PATH);
    expect(sql).toContain(`--   (1289) ${CONFIG_LINE.slice(2)}`);
    for (const l of CITED.filter((x) => x.trim() !== "")) expect(sql).toContain(`--   ${l.slice(2)}`);
    expect(sql).toContain("apps/web/lib/reminders/dispatch.ts:1290 to 1303 on");
  });

  it("the read takes each field from the column the loader takes it from", () => {
    const data = read("apps/web/lib/reminders/data.ts");
    const sql = read(READ_PATH);
    for (const [field, column, select] of INPUTS) {
      expect(data).toContain(`${field}: ${column},`);
      expect(sql).toContain(select);
    }
    expect(data).toContain(".innerJoin(patients, eq(patients.id, appointments.patientId))");
    expect(data).toContain(".innerJoin(tenants, eq(tenants.id, appointments.tenantId))");
    expect(sql).toContain("join public.patients pt on pt.id = a.patient_id");
    expect(sql).toContain("join public.tenants tn on tn.id = a.tenant_id");
  });

  it("the F4 read uses the NC rule's own two expressions for its two lines", () => {
    const rule = ncRule();
    const f4 = read(F4_PATH);
    for (const piece of ["coalesce(i.nc_email, '') <> ''", "i.nc_email_on"]) {
      expect(rule).toContain(piece);
      expect(f4).toContain(piece);
    }
    expect(f4).toContain("select pt.email as nc_email, pt.reminder_email_enabled as nc_email_on");
  });

  it("the routing the narrowing relies on: 48h is email, 24h is sms", () => {
    expect(channelForOffset("48h")).toBe("email");
    expect(channelForOffset("24h")).toBe("sms");
  });
});

/** The expression between the read's two marker lines. */
function ncRule(): string {
  const sql = read(READ_PATH);
  const from = sql.indexOf("\n-- NC RULE FROM HERE\n");
  const to = sql.indexOf("\n-- NC RULE TO HERE\n");
  expect(from).toBeGreaterThan(0);
  expect(to).toBeGreaterThan(from);
  expect(sql.split("\n-- NC RULE FROM HERE\n").length).toBe(2);
  return sql.slice(from + "\n-- NC RULE FROM HERE\n".length, to);
}

describe("the dispatch's answers on the fixtures (no database)", () => {
  it("every answer is reached at lines 1290 to 1303 or after them, and every kind of answer occurs", async () => {
    const counts: Record<string, number> = {};
    for (const f of fixtures()) {
      const a = await dispatchAnswer(f);
      counts[a] = (counts[a] ?? 0) + 1;
    }
    for (const a of [...PLAN_REASONS, "send"]) expect(counts[a] ?? 0, `no fixture answers ${a}`).toBeGreaterThan(0);
  }, 120_000);
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("NC and the dispatch agree on every fixture (Postgres evaluates the read's own expression)", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let sqlTag: typeof import("drizzle-orm").sql;
  const rows = <T>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : (((r as { rows?: unknown[] }).rows ?? []) as T[]));

  beforeAll(async () => {
    db = (await import("@osteojp/db")).getDbAdmin();
    sqlTag = (await import("drizzle-orm")).sql;
  });

  it("the read's input columns have the types the fixtures are given", async () => {
    const got = rows<{ table_name: string; column_name: string; data_type: string }>(
      await db.execute(
        sqlTag`select table_name, column_name, data_type from information_schema.columns
                where table_schema = 'public'
                  and ((table_name = 'patients' and column_name in ('email', 'phone', 'reminder_email_enabled', 'reminder_sms_enabled'))
                       or (table_name = 'tenants' and column_name = 'settings'))`,
      ),
    );
    const typeOf = (t: string, c: string) => got.find((r) => r.table_name === t && r.column_name === c)?.data_type;
    expect(typeOf("patients", "email")).toBe(INPUTS[0][3]);
    expect(typeOf("patients", "phone")).toBe(INPUTS[1][3]);
    expect(typeOf("patients", "reminder_email_enabled")).toBe(INPUTS[2][3]);
    expect(typeOf("patients", "reminder_sms_enabled")).toBe(INPUTS[3][3]);
    expect(typeOf("tenants", "settings")).toBe(INPUTS[4][3]);
  });

  it("fixture by fixture, the read's NC rule answers what the real dispatch answers", async () => {
    const all = fixtures();
    const expression = ncRule();
    const query = `select i.k, (${expression}) as outcome
                     from jsonb_to_recordset($1::jsonb)
                       as i(k int, nc_email text, nc_phone varchar(32), nc_email_on boolean, nc_sms_on boolean,
                            nc_settings jsonb, offset_id text, channel text)
                    order by i.k`;
    const payload = JSON.stringify(all);
    const got = rows<{ k: number; outcome: string }>(
      await db.execute(sqlTag.raw(query.replace("$1::jsonb", `'${payload.replaceAll("'", "''")}'::jsonb`))),
    );
    expect(got).toHaveLength(all.length);
    const mismatches: string[] = [];
    for (const f of all) {
      const want = await dispatchAnswer(f);
      const sqlSays = got.find((r) => Number(r.k) === f.k)?.outcome;
      if (sqlSays !== want) mismatches.push(`fixture ${f.k} ${JSON.stringify(f)}: dispatch ${want}, NC rule ${sqlSays}`);
    }
    expect(mismatches).toEqual([]);
  }, 120_000);
});
