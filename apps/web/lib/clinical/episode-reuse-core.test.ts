import { describe, expect, it } from "vitest";
import { pickEpisodeToReuse, type ReuseCandidate } from "./episode-reuse-core";

// EPI-01b, strategy ruling R31 (Q7): "+ Avaliação" on an imported group "reuses
// the patient's open app episode of that specialty and creates one only when
// none exists". Each arm below is one word of that sentence, and each refusal
// differs from the reuse control in ONE value. Null means "open a new one".

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "11111111-1111-4111-8111-111111111112";
const PATIENT = "44444444-4444-4444-8444-444444444444";
const OTHER_PATIENT = "44444444-4444-4444-8444-444444444445";
const want = { tenantId: TENANT, patientId: PATIENT, specialty: "Osteopatia" } as const;

const episode = (over: Partial<ReuseCandidate> = {}): ReuseCandidate => ({
  id: "77777777-7777-4777-8777-777777777771",
  tenantId: TENANT,
  patientId: PATIENT,
  status: "open",
  title: "Osteopatia (01/10/2026)",
  openedAt: new Date("2026-10-01T09:00:00Z"),
  imported: false,
  ...over,
});

describe("pickEpisodeToReuse (R31): the patient's open app episode of the specialty", () => {
  it("REUSE: one open app episode of the specialty is the one", () => {
    expect(pickEpisodeToReuse([episode()], want)).toBe(episode().id);
  });

  it("CREATE: none at all answers null", () => {
    expect(pickEpisodeToReuse([], want)).toBeNull();
  });

  it("a CLOSED episode of the specialty is not reused", () => {
    expect(pickEpisodeToReuse([episode({ status: "closed" })], want)).toBeNull();
  });

  it("ANOTHER PATIENT'S open episode of the specialty is never reused", () => {
    expect(pickEpisodeToReuse([episode({ patientId: OTHER_PATIENT })], want)).toBeNull();
  });

  it("ANOTHER TENANT'S is never reused", () => {
    expect(pickEpisodeToReuse([episode({ tenantId: OTHER_TENANT })], want)).toBeNull();
  });

  it("ANOTHER SPECIALTY'S open episode is not reused, in either direction", () => {
    expect(pickEpisodeToReuse([episode({ title: "Fisioterapia (01/10/2026)" })], want)).toBeNull();
    expect(pickEpisodeToReuse([episode()], { ...want, specialty: "Fisioterapia" })).toBeNull();
    // Control: the Fisioterapia one is reused for Fisioterapia.
    expect(pickEpisodeToReuse([episode({ title: "Fisioterapia (01/10/2026)" })], { ...want, specialty: "Fisioterapia" })).toBe(
      episode().id,
    );
  });

  it("an open episode with no specialty in its title (the 'Novo episódio' default, free text) is not reused", () => {
    for (const title of ["Episódio (01/10/2026)", "Osteopatia lombalgia", "osteopatia (01/10/2026)"]) {
      expect(pickEpisodeToReuse([episode({ title })], want), title).toBeNull();
    }
  });

  it("an IMPORTED episode (the ledger names it) is never reused, even open and titled with the specialty", () => {
    expect(pickEpisodeToReuse([episode({ imported: true })], want)).toBeNull();
    expect(pickEpisodeToReuse([episode({ imported: true, title: "Osteopatia" })], want)).toBeNull();
  });

  it("an open APP episode titled with the bare specialty word is reused", () => {
    expect(pickEpisodeToReuse([episode({ title: "Osteopatia" })], want)).toBe(episode().id);
  });

  it("the right one is found among the ones that do not fit", () => {
    const RIGHT = "77777777-7777-4777-8777-77777777777a";
    const all = [
      episode({ id: "77777777-7777-4777-8777-777777777772", status: "closed", openedAt: new Date("2026-10-03T09:00:00Z") }),
      episode({ id: "77777777-7777-4777-8777-777777777773", patientId: OTHER_PATIENT, openedAt: new Date("2026-10-03T09:00:00Z") }),
      episode({ id: "77777777-7777-4777-8777-777777777774", title: "Fisioterapia (03/10/2026)", openedAt: new Date("2026-10-03T09:00:00Z") }),
      episode({ id: "77777777-7777-4777-8777-777777777775", imported: true, openedAt: new Date("2026-10-03T09:00:00Z") }),
      episode({ id: RIGHT, openedAt: new Date("2026-09-01T09:00:00Z") }),
    ];
    expect(pickEpisodeToReuse(all, want)).toBe(RIGHT);
    expect(pickEpisodeToReuse([...all].reverse(), want)).toBe(RIGHT);
  });
});

describe("pickEpisodeToReuse (R31): more than one open app episode of the specialty", () => {
  const OLD = "77777777-7777-4777-8777-77777777777f"; // the largest id, so an id order alone would not pick NEW
  const NEW = "77777777-7777-4777-8777-77777777777e";
  const old = episode({ id: OLD, title: "Osteopatia (01/09/2026)", openedAt: new Date("2026-09-01T09:00:00Z") });
  const recent = episode({ id: NEW, title: "Osteopatia (01/10/2026)", openedAt: new Date("2026-10-01T09:00:00Z") });

  it("the MOST RECENTLY OPENED is the one, whatever order the rows arrive in", () => {
    expect(pickEpisodeToReuse([old, recent], want)).toBe(NEW);
    expect(pickEpisodeToReuse([recent, old], want)).toBe(NEW);
  });

  it("opened_at decides, not the date written in the title", () => {
    const titledLater = { ...old, title: "Osteopatia (31/12/2026)" };
    expect(pickEpisodeToReuse([titledLater, recent], want)).toBe(NEW);
  });

  it("a more recent one that does not fit (closed) does not win", () => {
    expect(pickEpisodeToReuse([old, { ...recent, status: "closed" }], want)).toBe(OLD);
  });

  it("opened at the same instant: the smallest id, in either order", () => {
    const a = episode({ id: "77777777-7777-4777-8777-77777777770a" });
    const b = episode({ id: "77777777-7777-4777-8777-77777777770b" });
    expect(pickEpisodeToReuse([a, b], want)).toBe(a.id);
    expect(pickEpisodeToReuse([b, a], want)).toBe(a.id);
  });

  it("the input is not reordered", () => {
    const input = [old, recent];
    pickEpisodeToReuse(input, want);
    expect(input.map((e) => e.id)).toEqual([OLD, NEW]);
  });
});
