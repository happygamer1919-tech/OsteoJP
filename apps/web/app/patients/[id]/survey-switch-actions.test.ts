/**
 * survey-switch-actions.test.ts: SAT-01 (S8). The ficha's survey switch POST.
 *
 * The action owns no rule: who may, on which patient and whether the survey
 * exists at all are the lib's (survey-switch.db.test.ts, as the real roles).
 * What is pinned here is what the action does with the form and with the
 * lib's answer: it passes on exactly the wanted value, every failure becomes
 * one opaque code, and nothing about a patient is logged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  calls: [] as Array<{ patientId: string; enabled: boolean }>,
  answer: "changed" as "changed" | "unchanged" | Error,
  revalidated: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => void H.revalidated.push(path) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/patients/survey-switch", () => ({
  setPatientSurveySwitch: async (patientId: string, enabled: boolean) => {
    H.calls.push({ patientId, enabled });
    if (H.answer instanceof Error) throw H.answer;
    return H.answer;
  },
}));

import { setSurveySwitchAction } from "./survey-switch-actions";

const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const BACK = `/patients/${PATIENT}?tab=resumo`;

async function post(fields: Record<string, string>): Promise<string> {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  try {
    await setSurveySwitchAction(f);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT:")) return e.message.slice("NEXT_REDIRECT:".length);
    throw e;
  }
  throw new Error("the action returned without redirecting");
}

let logged: string[];
let spy: { mockRestore(): void };

beforeEach(() => {
  H.calls = [];
  H.answer = "changed";
  H.revalidated = [];
  logged = [];
  spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" "));
  });
});
afterEach(() => spy.mockRestore());

describe("the ficha's survey switch POST", () => {
  it.each([
    ["false", false],
    ["true", true],
  ] as const)("enabled=%s sets exactly that, revalidates the ficha and returns to Resumo", async (raw, wanted) => {
    expect(await post({ patientId: PATIENT, enabled: raw })).toBe(BACK);
    expect(H.calls).toEqual([{ patientId: PATIENT, enabled: wanted }]);
    expect(H.revalidated).toEqual([`/patients/${PATIENT}`]);
    expect(logged).toEqual([]);
  });

  it("a press that changed nothing is not an error", async () => {
    H.answer = "unchanged";
    expect(await post({ patientId: PATIENT, enabled: "false" })).toBe(BACK);
  });

  it.each(["", "on", "1", "TRUE", "yes", "false "])("a value that is neither true nor false (%j) writes nothing and says so", async (raw) => {
    expect(await post({ patientId: PATIENT, enabled: raw })).toBe(`${BACK}&m=avaliacaoErro`);
    expect(H.calls).toEqual([]);
  });

  it("a missing value writes nothing", async () => {
    expect(await post({ patientId: PATIENT })).toBe(`${BACK}&m=avaliacaoErro`);
    expect(H.calls).toEqual([]);
  });

  it.each(["", "not-an-id", "../admin", `${PATIENT}/edit`, `${PATIENT}?x=1`])(
    "an id that is not an id (%j) writes nothing and goes to the patient list, never to an address built from it",
    async (patientId) => {
      expect(await post({ patientId, enabled: "false" })).toBe("/patients");
      expect(H.calls).toEqual([]);
      expect(H.revalidated).toEqual([]);
    },
  );

  it("a refusal and a failure are one code, and the log carries the error's class name only", async () => {
    class ForbiddenError extends Error {
      override name = "ForbiddenError";
    }
    H.answer = new ForbiddenError(`role 'therapist' on ${PATIENT} Paciente Fixture`);
    const refused = await post({ patientId: PATIENT, enabled: "false" });
    H.answer = new Error(`Failing row contains (${PATIENT}, Paciente Fixture, +351910000000)`);
    const failed = await post({ patientId: PATIENT, enabled: "false" });
    expect(refused).toBe(`${BACK}&m=avaliacaoErro`);
    expect(failed).toBe(refused);
    // CONTROL: both were logged, so the absences below are about content.
    expect(logged).toHaveLength(2);
    expect(logged[0]).toContain("ForbiddenError");
    for (const line of logged) {
      expect(line).not.toContain(PATIENT);
      expect(line).not.toContain("Fixture");
      expect(line).not.toContain("+351");
      expect(line).not.toContain("Failing row");
    }
  });

  it("the error code does not begin with the care team card's prefix", () => {
    expect("avaliacaoErro".startsWith("err")).toBe(false);
  });
});
