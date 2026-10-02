import { beforeEach, describe, expect, it, vi } from "vitest";

// createRecordAction is THE record-creation action: the /clinical/new form and
// (EPI-01b) "+ Avaliação" on a Registos tab group both post to it. These arms
// pin what it passes to the one writer, createDraftRecord, and where each
// outcome lands: the new registo, or the page the refusal came from with its
// message. The writer's own guards are pinned in records.write-guards.test.ts.

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  createDraftRecord: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(async () => ({
    tenantId: "11111111-1111-4111-8111-111111111111",
    role: "therapist",
    userId: "22222222-2222-4222-8222-222222222222",
  })),
}));
vi.mock("@/lib/clinical/records", () => ({ createDraftRecord: h.createDraftRecord }));

import { ClinicalError } from "@/lib/clinical/errors";
import { createRecordAction } from "./actions";

const PATIENT = "44444444-4444-4444-8444-444444444444";
const TEMPLATE = "77777777-7777-4777-8777-777777777777";
const EPISODE = "77777777-7777-4777-8777-777777777771";
const NEW_RECORD = "66666666-6666-4666-8666-666666666666";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

/** Where the action redirected to. */
async function landing(fields: Record<string, string>): Promise<string> {
  try {
    await createRecordAction(form(fields));
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (url) return url;
    throw e;
  }
  throw new Error("createRecordAction did not redirect");
}

beforeEach(() => {
  h.createDraftRecord.mockReset();
  h.redirect.mockClear();
});

describe("createRecordAction: one write path for /clinical/new and '+ Avaliação'", () => {
  it("an app episode group: passes the episode and lands on the new registo", async () => {
    h.createDraftRecord.mockResolvedValue({ id: NEW_RECORD, episodeId: EPISODE });
    const url = await landing({ patientId: PATIENT, formTemplateId: TEMPLATE, episodeId: EPISODE, from: "ficha" });
    expect(url).toBe(`/clinical/${NEW_RECORD}`);
    expect(h.createDraftRecord.mock.calls[0]![1]).toEqual({
      patientId: PATIENT,
      formTemplateId: TEMPLATE,
      episodeId: EPISODE,
      newEpisodeSpecialty: null,
    });
  });

  it("an imported group: passes the specialty and no episode id", async () => {
    h.createDraftRecord.mockResolvedValue({ id: NEW_RECORD, episodeId: EPISODE });
    await landing({ patientId: PATIENT, formTemplateId: TEMPLATE, newEpisodeSpecialty: "Osteopatia", from: "ficha" });
    expect(h.createDraftRecord.mock.calls[0]![1]).toEqual({
      patientId: PATIENT,
      formTemplateId: TEMPLATE,
      episodeId: null,
      newEpisodeSpecialty: "Osteopatia",
    });
  });

  it("the /clinical/new form, unchanged: no specialty, and an empty episode is none", async () => {
    h.createDraftRecord.mockResolvedValue({ id: NEW_RECORD, episodeId: null });
    expect(await landing({ patientId: PATIENT, formTemplateId: TEMPLATE, episodeId: "" })).toBe(`/clinical/${NEW_RECORD}`);
    expect(h.createDraftRecord.mock.calls[0]![1]).toMatchObject({ episodeId: null, newEpisodeSpecialty: null });
  });

  it("the guard's refusal from the Registos tab lands back on that tab with its own message", async () => {
    h.createDraftRecord.mockRejectedValue(new ClinicalError("episode_mismatch"));
    expect(await landing({ patientId: PATIENT, formTemplateId: TEMPLATE, episodeId: EPISODE, from: "ficha" })).toBe(
      `/patients/${PATIENT}?tab=registos&m=episodeMismatch`,
    );
  });

  it("the guard's refusal from /clinical/new lands on /clinical/new with its own message", async () => {
    h.createDraftRecord.mockRejectedValue(new ClinicalError("episode_mismatch"));
    expect(await landing({ patientId: PATIENT, formTemplateId: TEMPLATE, episodeId: EPISODE })).toBe(
      "/clinical/new?m=episodeMismatch",
    );
  });

  it("any other clinical refusal keeps the generic message, on the page it came from", async () => {
    h.createDraftRecord.mockRejectedValue(new ClinicalError("not_found"));
    expect(await landing({ patientId: PATIENT, formTemplateId: TEMPLATE, from: "ficha" })).toBe(
      `/patients/${PATIENT}?tab=registos&m=avaliacaoErr`,
    );
    h.createDraftRecord.mockRejectedValue(new ClinicalError("invalid"));
    expect(await landing({ patientId: PATIENT, formTemplateId: TEMPLATE })).toBe("/clinical/new?m=err");
  });

  it("a patient id that is not a uuid never reaches a redirect path", async () => {
    h.createDraftRecord.mockRejectedValue(new ClinicalError("invalid"));
    expect(await landing({ patientId: "../../admin", formTemplateId: TEMPLATE, from: "ficha" })).toBe("/clinical/new?m=err");
  });

  it("a refusal that is not a ClinicalError (a role that may not author) is not swallowed", async () => {
    h.createDraftRecord.mockRejectedValue(new Error("Forbidden"));
    await expect(createRecordAction(form({ patientId: PATIENT, formTemplateId: TEMPLATE }))).rejects.toThrow("Forbidden");
    expect(h.redirect).not.toHaveBeenCalled();
  });
});
