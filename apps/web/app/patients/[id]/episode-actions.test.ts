import { beforeEach, describe, expect, it, vi } from "vitest";

// createEpisodeAction, "+ Episódio" on the Registos tab (EPI-01b, piece 2).
// These arms pin what the action READS from a request (the patient, the
// specialty and the confirmation; never a title or any other text), what it
// passes to the one writer, createEpisode, and where each outcome lands. The
// writer's own gates are pinned in episodes.create-guard.test.ts and, on real
// rows, in episodes.create.db.test.ts.

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  createEpisode: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(async () => ({
    tenantId: "11111111-1111-4111-8111-111111111111",
    role: "therapist",
    userId: "22222222-2222-4222-8222-222222222222",
  })),
}));
vi.mock("@/lib/clinical/episodes", () => ({ createEpisode: h.createEpisode }));

import { ForbiddenError } from "@osteojp/auth";
import { ClinicalError } from "@/lib/clinical/errors";
import { createEpisodeAction } from "./episode-actions";

const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const OPEN = "7777cccc-7777-4777-8777-777777777771";
const NEW_EPISODE = "66666666-6666-4666-8666-666666666666";
const TAB = `/patients/${PATIENT}?tab=registos&`;

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

/** Where the action redirected to. */
async function landing(fields: Record<string, string>): Promise<string> {
  try {
    await createEpisodeAction(form(fields));
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (url) return url;
    throw e;
  }
  throw new Error("createEpisodeAction did not redirect");
}

beforeEach(() => {
  h.createEpisode.mockReset();
  h.redirect.mockClear();
});

describe("createEpisodeAction: what it reads, and what it passes to createEpisode", () => {
  it("the patient and the specialty, and no confirmation when none was posted", async () => {
    h.createEpisode.mockResolvedValue({ kind: "created", id: NEW_EPISODE });
    await landing({ patientId: PATIENT, specialty: "Osteopatia" });
    expect(h.createEpisode).toHaveBeenCalledTimes(1);
    expect(h.createEpisode.mock.calls[0]![0]).toMatchObject({ role: "therapist" });
    expect(h.createEpisode.mock.calls[0]![1]).toEqual({
      patientId: PATIENT,
      specialty: "Osteopatia",
      confirmedOpenEpisodeId: null,
    });
  });

  it("a posted title, complaint, diagnosis or note is NOT read: createEpisode gets the same three fields and none of the text", async () => {
    h.createEpisode.mockResolvedValue({ kind: "created", id: NEW_EPISODE });
    const typed = "Texto escrito pelo cliente";
    const url = await landing({
      patientId: PATIENT,
      specialty: "Fisioterapia",
      title: typed,
      name: typed,
      complaint: typed,
      queixa: typed,
      diagnosis: typed,
      notes: typed,
    });
    expect(h.createEpisode.mock.calls[0]![1]).toEqual({
      patientId: PATIENT,
      specialty: "Fisioterapia",
      confirmedOpenEpisodeId: null,
    });
    expect(JSON.stringify(h.createEpisode.mock.calls[0]![1])).not.toContain(typed);
    expect(url).not.toContain(encodeURIComponent(typed));
    expect(decodeURIComponent(url)).not.toContain(typed);
  });

  it("the confirmation step posts the episode that was shown, and it is passed on as posted", async () => {
    h.createEpisode.mockResolvedValue({ kind: "created", id: NEW_EPISODE });
    await landing({ patientId: PATIENT, specialty: "Osteopatia", confirmOpenEpisodeId: OPEN });
    expect(h.createEpisode.mock.calls[0]![1]).toEqual({
      patientId: PATIENT,
      specialty: "Osteopatia",
      confirmedOpenEpisodeId: OPEN,
    });
  });
});

describe("createEpisodeAction: where each outcome lands", () => {
  it("opened: the patient's Registos tab, naming the new episode", async () => {
    h.createEpisode.mockResolvedValue({ kind: "created", id: NEW_EPISODE });
    expect(await landing({ patientId: PATIENT, specialty: "Osteopatia" })).toBe(`${TAB}episodio=${NEW_EPISODE}`);
  });

  it("an open episode of the specialty exists: the tab's question, with the specialty and NO episode id from the request", async () => {
    h.createEpisode.mockResolvedValue({ kind: "open_exists", episodeId: OPEN });
    const url = await landing({ patientId: PATIENT, specialty: "Fisioterapia" });
    expect(url).toBe(`${TAB}m=episodioAberto&esp=Fisioterapia`);
    expect(url).not.toContain(OPEN);
  });

  it.each([
    ["a role that may not open an episode", new ForbiddenError("reception", "clinical_records:author")],
    ["a patient outside the caller's reach", new ClinicalError("not_found")],
    ["a specialty off the list", new ClinicalError("invalid")],
  ] as const)("refused (%s): the tab's error flag, and nothing of the request in the address", async (_label, error) => {
    h.createEpisode.mockRejectedValue(error);
    const url = await landing({ patientId: PATIENT, specialty: "Texto escrito pelo cliente" });
    expect(url).toBe(`${TAB}m=episodeErr`);
  });

  it("an unexpected error is not swallowed", async () => {
    h.createEpisode.mockRejectedValue(new Error("boom"));
    await expect(createEpisodeAction(form({ patientId: PATIENT, specialty: "Osteopatia" }))).rejects.toThrow("boom");
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it("a patient id that is not a uuid never reaches the path: the patients list, with the flag", async () => {
    h.createEpisode.mockRejectedValue(new ClinicalError("invalid"));
    for (const bad of ["", "../../admin", "x?tab=registos&episodio=1", `${PATIENT}/edit`]) {
      expect(await landing({ patientId: bad, specialty: "Osteopatia" }), bad).toBe("/patients?m=episodeErr");
    }
  });

  it("an id posted in uppercase lands on the same patient's tab, in lowercase", async () => {
    h.createEpisode.mockResolvedValue({ kind: "created", id: NEW_EPISODE });
    expect(PATIENT.toUpperCase()).not.toBe(PATIENT);
    expect(await landing({ patientId: PATIENT.toUpperCase(), specialty: "Osteopatia" })).toBe(`${TAB}episodio=${NEW_EPISODE}`);
  });
});
