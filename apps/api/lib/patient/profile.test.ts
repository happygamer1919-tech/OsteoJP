import { describe, expect, it, vi } from "vitest";

// profile.ts pulls in "server-only" + runAsPatient (Supabase/DB). Neutralise
// server-only and mock the patient gate so we exercise the self-scope logic with
// a fake tx — never real IO.
vi.mock("server-only", () => ({}));

const { runAsPatient } = vi.hoisted(() => ({ runAsPatient: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ runAsPatient }));

import { getOwnProfile, toProfileDTO } from "./profile";

const PRINCIPAL = { tenantId: "11111111-1111-1111-1111-111111111111", patientId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", userId: "u-1" };

/** A drizzle-ish builder that resolves to `rows` no matter the chain. */
function fakeTx(rows: unknown[]) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "orderBy", "limit"]) b[m] = () => b;
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return b;
}

/** Make runAsPatient invoke fn with a fake tx returning `rows`. */
function withRows(rows: unknown[]) {
  runAsPatient.mockImplementation(async (_p: unknown, fn: (tx: unknown) => unknown) => fn(fakeTx(rows)));
}

const OWN_ROW = {
  id: PRINCIPAL.patientId,
  fullName: "Maria Silva",
  email: "maria@example.pt",
  phone: "+351912345678",
  address: "Rua A, 1",
  postalCode: "2795-000",
  city: "Linda-a-Velha",
  reminderSmsEnabled: true,
  reminderEmailEnabled: false,
};

// NB: each test sets runAsPatient's implementation via withRows() (overwriting
// the prior one). We deliberately do NOT mockReset/mockClear in a beforeEach —
// under vitest v4 that combination drops the fn arg passed to an async
// mockImplementation. Call assertions below all use the same PRINCIPAL, so
// accumulated history matches correctly.

describe("toProfileDTO — portal whitelist (no fiscal / internal fields)", () => {
  it("exposes ONLY name, contacts, location — never nif or notes", () => {
    // Even if the source object carries fiscal/internal fields, they don't map.
    const dto = toProfileDTO({ ...OWN_ROW, nif: "123456789", notes: "private" } as never);
    expect(Object.keys(dto).sort()).toEqual(
      ["address", "city", "email", "fullName", "id", "phone", "postalCode", "reminderEmailEnabled", "reminderSmsEnabled"].sort(),
    );
    expect(dto).not.toHaveProperty("nif");
    expect(dto).not.toHaveProperty("notes");
  });
});

describe("getOwnProfile — self-scope", () => {
  it("derives the query from the verified principal (RLS claims come from it)", async () => {
    withRows([OWN_ROW]);
    await getOwnProfile(PRINCIPAL);
    expect(runAsPatient).toHaveBeenCalledWith(PRINCIPAL, expect.any(Function));
  });

  it("returns the caller's own profile", async () => {
    withRows([OWN_ROW]);
    await expect(getOwnProfile(PRINCIPAL)).resolves.toMatchObject({
      id: PRINCIPAL.patientId,
      fullName: "Maria Silva",
    });
  });

  it("ADVERSARIAL: drops a foreign row that slips past RLS (explicit id guard)", async () => {
    // Simulate an RLS regression handing back another patient's row.
    withRows([{ ...OWN_ROW, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }]);
    await expect(getOwnProfile(PRINCIPAL)).resolves.toBeNull();
  });

  it("returns null when there is no row", async () => {
    withRows([]);
    await expect(getOwnProfile(PRINCIPAL)).resolves.toBeNull();
  });
});
