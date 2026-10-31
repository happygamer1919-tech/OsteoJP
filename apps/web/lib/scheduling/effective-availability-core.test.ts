import { describe, expect, it } from "vitest";

import { evaluateAvailability, type AvailabilityTemplate } from "./availability";
import { buildDay } from "./day-availability-core";
import {
  clinicDefaultSwitchVerdict,
  clinicDefaultTemplates,
  isClinicDefaultEligible,
  resolveEffectiveTemplates,
  scheduleKindFor,
  type ClinicDefaultEligibility,
  type MemberClinic,
} from "./effective-availability-core";

/**
 * HOR-01 - the resolver, pure. Every date below is in November 2026, when
 * Lisbon is on WET (UTC+0), so a "Z" instant IS the Lisbon wall clock and no
 * assertion depends on the machine's zone or on the clock.
 *
 *   2026-11-01 Sunday   2026-11-02 Monday   2026-11-07 Saturday
 */
const SUN = "2026-11-01";
const MON = "2026-11-02";
const SAT = "2026-11-07";
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00.000Z`);

const LV = "loc-lv";
const CB = "loc-cb";

/** "Today" for the in-force question, pinned: never the machine's clock. */
const TODAY = "2026-10-30";
const resolve = (a: Omit<Parameters<typeof resolveEffectiveTemplates>[0], "today">) =>
  resolveEffectiveTemplates({ today: TODAY, ...a });

const ELIGIBLE: ClinicDefaultEligibility = { isActive: true, isBookable: true, isSharedResource: false };

const clinic = (over: Partial<MemberClinic> = {}): MemberClinic => ({
  locationId: LV,
  opensAt: "08:00:00",
  closesAt: "21:00:00",
  saturdayClosesAt: null,
  ...over,
});

const own = (over: Partial<AvailabilityTemplate> = {}): AvailabilityTemplate => ({
  id: "row-1",
  weekday: 1,
  startTime: "09:00:00",
  endTime: "13:00:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
  locationId: LV,
  ...over,
});

/** Is [start, end) on `date` inside the therapist's effective hours at `loc`? */
function covered(templates: AvailabilityTemplate[], loc: string, date: string, from: string, to: string) {
  return evaluateAvailability(
    at(date, from),
    at(date, to),
    templates.filter((t) => t.locationId === loc),
  );
}

describe("clinicDefaultTemplates: hours come from the clinic row, never from a constant", () => {
  it("no Saturday closing time: Monday to Friday only, opens_at to closes_at", () => {
    const rows = clinicDefaultTemplates(clinic());
    expect(rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5]);
    for (const r of rows) {
      expect([r.startTime, r.endTime]).toEqual(["08:00:00", "21:00:00"]);
      expect(r).toMatchObject({ validFrom: null, validUntil: null, isActive: true, locationId: LV });
      expect(r.source).toBe("clinic_default");
      expect(r.id).toBeUndefined();
    }
  });

  it("a Saturday closing time adds Saturday, opening at opens_at", () => {
    const rows = clinicDefaultTemplates(clinic({ saturdayClosesAt: "13:00:00" }));
    expect(rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.find((r) => r.weekday === 6)).toMatchObject({ startTime: "08:00:00", endTime: "13:00:00" });
  });

  it("Sunday is never generated, whatever the clinic row says", () => {
    for (const c of [clinic(), clinic({ saturdayClosesAt: "13:00:00" }), clinic({ opensAt: "00:00", closesAt: "23:59" })]) {
      expect(clinicDefaultTemplates(c).some((r) => r.weekday === 0)).toBe(false);
    }
  });

  it("follows a different clinic's hours exactly (09:00 to 20:00)", () => {
    const rows = clinicDefaultTemplates(clinic({ opensAt: "09:00", closesAt: "20:00" }));
    expect(rows[0]).toMatchObject({ startTime: "09:00", endTime: "20:00" });
  });

  it("a backwards or empty pair generates nothing rather than an invalid row", () => {
    expect(clinicDefaultTemplates(clinic({ opensAt: "20:00", closesAt: "08:00" }))).toEqual([]);
    expect(clinicDefaultTemplates(clinic({ saturdayClosesAt: "08:00:00" })).some((r) => r.weekday === 6)).toBe(false);
  });
});

describe("isClinicDefaultEligible", () => {
  it("only an active, bookable person (not a shared resource)", () => {
    expect(isClinicDefaultEligible(ELIGIBLE)).toBe(true);
    expect(isClinicDefaultEligible({ ...ELIGIBLE, isActive: false })).toBe(false);
    expect(isClinicDefaultEligible({ ...ELIGIBLE, isBookable: false })).toBe(false);
    expect(isClinicDefaultEligible({ ...ELIGIBLE, isSharedResource: true })).toBe(false);
    expect(isClinicDefaultEligible(null)).toBe(false);
  });
});

describe("resolveEffectiveTemplates", () => {
  it("no rows: Monday to Friday inside clinic hours is covered, outside is not", () => {
    const t = resolve({ own: [], eligibility: ELIGIBLE, memberClinics: [clinic()] });
    expect(covered(t, LV, MON, "08:00", "09:00")).toEqual({ configured: true, covered: true });
    expect(covered(t, LV, MON, "20:00", "21:00")).toEqual({ configured: true, covered: true });
    expect(covered(t, LV, MON, "07:00", "08:00")).toEqual({ configured: true, covered: false });
    expect(covered(t, LV, MON, "20:30", "21:30")).toEqual({ configured: true, covered: false });
  });

  it("Saturday: refused without a Saturday closing time, covered until it with one", () => {
    const without = resolve({ own: [], eligibility: ELIGIBLE, memberClinics: [clinic()] });
    expect(covered(without, LV, SAT, "09:00", "10:00").covered).toBe(false);

    const withSat = resolve({
      own: [],
      eligibility: ELIGIBLE,
      memberClinics: [clinic({ saturdayClosesAt: "13:00:00" })],
    });
    expect(covered(withSat, LV, SAT, "09:00", "10:00").covered).toBe(true);
    expect(covered(withSat, LV, SAT, "12:30", "13:30").covered).toBe(false);
  });

  it("Sunday: never covered", () => {
    const t = resolve({
      own: [],
      eligibility: ELIGIBLE,
      memberClinics: [clinic({ saturdayClosesAt: "13:00:00" })],
    });
    expect(covered(t, LV, SUN, "10:00", "11:00")).toEqual({ configured: true, covered: false });
  });

  it.each([
    ["not a member of any clinic", ELIGIBLE, [] as MemberClinic[]],
    ["inactive", { ...ELIGIBLE, isActive: false }, [clinic()]],
    ["not bookable", { ...ELIGIBLE, isBookable: false }, [clinic()]],
    ["a shared resource (NESA)", { ...ELIGIBLE, isSharedResource: true }, [clinic()]],
    ["no user row at all", null, [clinic()]],
  ])("%s: gets no generated rows, so nothing changes for them", (_why, eligibility, memberClinics) => {
    const t = resolve({ own: [], eligibility, memberClinics });
    expect(t).toEqual([]);
    // The same "unconfigured" answer every reader gave before this change.
    expect(covered(t, LV, SUN, "03:00", "04:00")).toEqual({ configured: false, covered: true });
  });

  it("own rows at a clinic override the default there, and are returned unchanged", () => {
    const mine = [own()];
    const t = resolve({ own: mine, eligibility: ELIGIBLE, memberClinics: [clinic()] });
    expect(t).toEqual(mine);
    // 15:00 is inside clinic hours but outside the therapist's own 09:00-13:00.
    expect(covered(t, LV, MON, "15:00", "16:00").covered).toBe(false);
    expect(covered(t, LV, MON, "10:00", "11:00").covered).toBe(true);
  });

  it("an INACTIVE own row does not count as own hours: the default applies", () => {
    const t = resolve({
      own: [own({ isActive: false })],
      eligibility: ELIGIBLE,
      memberClinics: [clinic()],
    });
    expect(covered(t, LV, MON, "15:00", "16:00").covered).toBe(true);
  });

  it("multi-clinic: generated rows at every member clinic without own rows", () => {
    const t = resolve({
      own: [],
      eligibility: ELIGIBLE,
      memberClinics: [clinic(), clinic({ locationId: CB, opensAt: "09:00", closesAt: "19:00" })],
    });
    expect(covered(t, LV, MON, "08:00", "09:00").covered).toBe(true);
    expect(covered(t, CB, MON, "08:00", "09:00").covered).toBe(false);
    expect(covered(t, CB, MON, "09:00", "10:00").covered).toBe(true);
  });

  it("PER THERAPIST: own rows at ONE clinic mean NO default at ANY clinic", () => {
    const t = resolve({
      own: [own()],
      eligibility: ELIGIBLE,
      memberClinics: [clinic(), clinic({ locationId: CB })],
    });
    expect(t).toEqual([own()]);
    expect(covered(t, LV, MON, "15:00", "16:00").covered).toBe(false);
    // At CB the therapist is exactly where they were before HOR-01: unconfigured.
    expect(covered(t, CB, MON, "15:00", "16:00")).toEqual({ configured: false, covered: true });
  });

  it("a row that starts in the FUTURE is in force: no default", () => {
    const t = resolve({
      own: [own({ validFrom: "2026-12-01" })],
      eligibility: ELIGIBLE,
      memberClinics: [clinic()],
    });
    expect(t.some((r) => r.source === "clinic_default")).toBe(false);
  });

  it("a row whose validity ENDED before today is not in force: the default applies", () => {
    const t = resolve({
      own: [own({ validFrom: "2026-01-01", validUntil: "2026-10-29" })],
      eligibility: ELIGIBLE,
      memberClinics: [clinic()],
    });
    expect(covered(t, LV, MON, "15:00", "16:00").covered).toBe(true);
  });

  it("a row ending TODAY is still in force", () => {
    const t = resolve({
      own: [own({ validFrom: "2026-10-30", validUntil: TODAY })],
      eligibility: ELIGIBLE,
      memberClinics: [clinic()],
    });
    expect(t.some((r) => r.source === "clinic_default")).toBe(false);
  });

  it("locationId narrows OWN rows too, while the in-force question still sees every clinic", () => {
    const t = resolve({ own: [own()], eligibility: ELIGIBLE, memberClinics: [clinic({ locationId: CB })], locationId: CB });
    expect(t).toEqual([]);
  });

  it("locationId narrows the generated rows to that clinic", () => {
    const t = resolve({
      own: [],
      eligibility: ELIGIBLE,
      memberClinics: [clinic(), clinic({ locationId: CB })],
      locationId: CB,
    });
    expect(new Set(t.map((r) => r.locationId))).toEqual(new Set([CB]));
  });

  it("blocks subtract from generated hours exactly as from typed ones", () => {
    const t = resolve({ own: [], eligibility: ELIGIBLE, memberClinics: [clinic()] });
    const day = buildDay(
      MON,
      t,
      [],
      [{ id: "b1", startsAt: at(MON, "10:00"), endsAt: at(MON, "12:00"), reason: "other", note: null }],
      null,
    );
    expect(day.working).toEqual([{ start: at(MON, "08:00").toISOString(), end: at(MON, "21:00").toISOString() }]);
    expect(day.free).toEqual([
      { start: at(MON, "08:00").toISOString(), end: at(MON, "10:00").toISOString() },
      { start: at(MON, "12:00").toISOString(), end: at(MON, "21:00").toISOString() },
    ]);
    // And the inspector names the window as the clinic's, not as a typed week.
    expect(day.sources[0]?.rule).toBe("clinica");
    expect(day.sources[0]?.templateId).toBeNull();
  });
});

describe("scheduleKindFor: the Horarios label", () => {
  it("own rows win; otherwise the default when it applies; otherwise none", () => {
    expect(scheduleKindFor({ hasOwnActiveRows: true, eligibility: null, memberClinicCount: 0 })).toBe("own");
    expect(scheduleKindFor({ hasOwnActiveRows: false, eligibility: ELIGIBLE, memberClinicCount: 1 })).toBe(
      "clinic_default",
    );
    expect(scheduleKindFor({ hasOwnActiveRows: false, eligibility: ELIGIBLE, memberClinicCount: 0 })).toBe("none");
    expect(
      scheduleKindFor({
        hasOwnActiveRows: false,
        eligibility: { ...ELIGIBLE, isSharedResource: true },
        memberClinicCount: 2,
      }),
    ).toBe("none");
  });
});

describe("clinicDefaultSwitchVerdict: the server refusal and the button, one rule", () => {
  const lv = { locationId: LV, name: "Linda-a-Velha" };
  const cb = { locationId: CB, name: "Castelo Branco" };

  it("ok, naming the clinics whose rows will be switched off", () => {
    expect(
      clinicDefaultSwitchVerdict({ eligibility: ELIGIBLE, rowClinics: [lv, lv, cb], activeMemberClinicIds: new Set([LV, CB]) }),
    ).toEqual({ ok: true, clinics: [cb, lv] });
  });

  it("nothing to switch when there is no row in force", () => {
    expect(clinicDefaultSwitchVerdict({ eligibility: ELIGIBLE, rowClinics: [], activeMemberClinicIds: new Set([LV]) })).toEqual({
      ok: false,
      reason: "nothing_to_switch",
    });
  });

  it.each([
    ["inactive", { ...ELIGIBLE, isActive: false }],
    ["not bookable", { ...ELIGIBLE, isBookable: false }],
    ["a shared resource", { ...ELIGIBLE, isSharedResource: true }],
    ["no user row", null],
  ])("refused for %s", (_why, eligibility) => {
    expect(clinicDefaultSwitchVerdict({ eligibility, rowClinics: [lv], activeMemberClinicIds: new Set([LV]) })).toEqual({
      ok: false,
      reason: "not_eligible",
    });
  });

  it("refused, naming the clinic, when rows sit where the therapist is not an active member", () => {
    expect(
      clinicDefaultSwitchVerdict({ eligibility: ELIGIBLE, rowClinics: [lv, cb], activeMemberClinicIds: new Set([LV]) }),
    ).toEqual({ ok: false, reason: "not_member", clinics: [cb] });
  });
});
