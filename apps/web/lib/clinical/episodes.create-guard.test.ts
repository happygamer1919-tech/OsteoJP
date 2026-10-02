import { beforeEach, describe, expect, it, vi } from "vitest";

// createEpisode (EPI-01b, R4 rounds 1 and 2 on #1526): the patient id is a
// uuid, or the call is `invalid` before any transaction opens. A malformed id
// must never reach the patient read, where Postgres would answer with a raw
// 22P02 instead of the clean refusal. Then the patient is read under the
// caller's RLS for every role (an owner too: 0097's owner arm checks only
// tenant_id and the foreign key ignores RLS), and a patient the read does not
// find is `not_found` with nothing inserted. The real rows are in
// records.episode-guard.db.test.ts.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => null),
}));

import { clinicalEpisodes, patients } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit } from "./audit";
import { createEpisode } from "./episodes";
import { isClinicalError } from "./errors";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);

const TENANT = "11111111-1111-4111-8111-111111111111";
const PATIENT = "44444444-4444-4444-8444-444444444444";
const owner: RequestContext = { tenantId: TENANT, role: "owner", userId: "33333333-3333-4333-8333-333333333333" };
const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: "22222222-2222-4222-8222-222222222222" };

/** A fake transaction: each select answers the next entry of `selects`; every insert is recorded. */
function fakeTx(selects: unknown[][]) {
  const queue = [...selects];
  const read: unknown[] = [];
  const inserted: unknown[] = [];
  const tx = {
    select: () => {
      const rows = queue.shift();
      if (rows === undefined) throw new Error("fakeTx: an unexpected select");
      const b: Record<string, unknown> = {};
      b.from = (table: unknown) => {
        read.push(table);
        return b;
      };
      b.where = () => b;
      b.limit = async () => rows;
      return b;
    },
    insert: (table: unknown) => ({
      values: (v: unknown) => ({
        returning: async () => {
          inserted.push({ table, v });
          return [{ id: "66666666-6666-4666-8666-666666666666" }];
        },
      }),
    }),
  };
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  return { read, inserted };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (isClinicalError(e)) return e.code;
    throw e;
  }
  return "resolved";
}

beforeEach(() => {
  mockRunScoped.mockReset();
  mockAudit.mockReset();
});

describe("createEpisode: a malformed patient id is the clean refusal, before any read", () => {
  it("not a uuid: invalid, no transaction, no read, nothing inserted (every role)", async () => {
    for (const who of [owner, therapist]) {
      for (const bad of ["not-a-uuid", "' or 1=1 --", "44444444-4444-4444-8444-44444444444", ` ${PATIENT}`]) {
        mockRunScoped.mockReset();
        expect(await codeOf(createEpisode(who, { patientId: bad, title: "Osteopatia (02/10/2026)" })), `${who.role} ${bad}`).toBe(
          "invalid",
        );
        expect(mockRunScoped).not.toHaveBeenCalled();
      }
    }
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("an empty id or an empty title: invalid, as before", async () => {
    expect(await codeOf(createEpisode(owner, { patientId: "", title: "Osteopatia (02/10/2026)" }))).toBe("invalid");
    expect(await codeOf(createEpisode(owner, { patientId: PATIENT, title: "   " }))).toBe("invalid");
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});

describe("createEpisode: the patient is read under the caller's RLS for every role", () => {
  it("the owner, a patient the read does not find (another tenant's): not_found, nothing inserted", async () => {
    const { read, inserted } = fakeTx([[]]);
    expect(await codeOf(createEpisode(owner, { patientId: PATIENT, title: "Osteopatia (02/10/2026)" }))).toBe("not_found");
    expect(read).toEqual([patients]);
    expect(inserted).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL: a well-formed id the read finds: one open episode, in the caller's tenant and name, audited", async () => {
    const { read, inserted } = fakeTx([[{ id: PATIENT }]]);
    expect(await codeOf(createEpisode(owner, { patientId: PATIENT, title: "Osteopatia (02/10/2026)" }))).toBe("resolved");
    expect(read).toEqual([patients]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      table: clinicalEpisodes,
      v: { tenantId: TENANT, patientId: PATIENT, title: "Osteopatia (02/10/2026)", status: "open", primaryPractitionerId: owner.userId },
    });
    expect(mockAudit.mock.calls[0]![1]).toMatchObject({ action: "clinical_episode.create" });
  });
});
