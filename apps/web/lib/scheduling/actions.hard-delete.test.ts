import { vi, describe, it, expect, beforeEach } from "vitest";

// W3-06 — hardDeleteAppointment: admin-only, password-gated, linked-records
// guard, child-first delete with a PII-free audit snapshot. Real assertCan is
// used so the admin-only gate is genuinely exercised; the password check and DB
// are mocked.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./audit", () => ({ writeAppointmentAudit: vi.fn(async () => {}) }));
vi.mock("./analytics", () => ({ writeAppointmentStatusChangedEvent: vi.fn(async () => {}) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: vi.fn(async () => {}),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("@/lib/admin/appointment-delete-password", () => ({
  verifyDeletePassword: vi.fn(),
}));

import { analyticsEvents, appointments } from "@osteojp/db";
import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { writeAppointmentAudit } from "./audit";
import { verifyDeletePassword } from "@/lib/admin/appointment-delete-password";
import { hardDeleteAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockVerify = vi.mocked(verifyDeletePassword);
const mockAudit = vi.mocked(writeAppointmentAudit);

const admin: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "admin-1" };
const reception: RequestContext = { tenantId: "tenant-A", role: "reception", userId: "recep-1" };

const APPT = {
  id: "appt-1",
  patientId: "patient-1",
  practitionerId: "therapist-1",
  serviceId: "svc-1",
  locationId: "loc-1",
  startsAt: new Date("2026-08-06T09:00:00Z"),
  endsAt: new Date("2026-08-06T10:00:00Z"),
  status: "scheduled",
  confirmationState: "pending",
};

// Thenable that also exposes .limit (snapshot uses .limit(1); counts await where()).
function q(rows: unknown[]) {
  return {
    limit: async () => rows,
    then: (res: (v: unknown[]) => void, rej: (e: unknown) => void) =>
      Promise.resolve(rows).then(res, rej),
  };
}

function makeTx(opts: {
  appt?: typeof APPT | null;
  notes?: number;
  records?: number;
  invoices?: number;
  apptDeleted?: { id: string }[];
}) {
  const { appt = APPT, notes = 0, records = 0, invoices = 0 } = opts;
  const selectQueue: unknown[][] = [
    appt ? [appt] : [], // snapshot
    [{ n: notes }],
    [{ n: records }],
    [{ n: invoices }],
  ];
  let si = 0;
  const stats = { deleteOrder: [] as string[], updates: 0 };
  const tx = {
    select: () => ({ from: () => ({ where: () => q(selectQueue[si++] ?? []) }) }),
    delete: (table: unknown) => {
      const tag =
        table === analyticsEvents ? "analytics" : table === appointments ? "appointment" : "other";
      stats.deleteOrder.push(tag);
      const rows = tag === "appointment" ? (opts.apptDeleted ?? [{ id: appt?.id }]) : [];
      return { where: () => ({ returning: async () => rows }) };
    },
    update: () => {
      stats.updates++;
      return { set: () => ({ where: async () => {} }) };
    },
  };
  return { tx, stats };
}

beforeEach(() => {
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockVerify.mockReset();
  mockAudit.mockReset();
  mockCtx.mockResolvedValue(admin);
});

describe("hardDeleteAppointment (W3-06)", () => {
  it("refuses a wrong password — no DB work, appointment untouched", async () => {
    mockVerify.mockResolvedValue(false);
    const r = await hardDeleteAppointment("appt-1", "wrong");
    expect(r).toEqual({ ok: false, error: "password" });
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("refuses when a clinical note/record/invoice is linked — nothing deleted", async () => {
    mockVerify.mockResolvedValue(true);
    const { tx, stats } = makeTx({ notes: 1 });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const r = await hardDeleteAppointment("appt-1", "1234");
    expect(r).toEqual({ ok: false, error: "linked_records" });
    expect(stats.deleteOrder).toEqual([]); // guard fired before any delete
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("deletes child rows BEFORE the appointment, never UPDATE, with a PII-free audit snapshot", async () => {
    mockVerify.mockResolvedValue(true);
    const { tx, stats } = makeTx({});
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const r = await hardDeleteAppointment("appt-1", "1234");
    expect(r).toEqual({ ok: true, data: { id: "appt-1" } });

    // Child (analytics) deleted before the parent (appointment); no UPDATE.
    expect(stats.deleteOrder).toEqual(["analytics", "appointment"]);
    expect(stats.updates).toBe(0);

    // Exactly one hard_delete audit row with the PII-free snapshot.
    expect(mockAudit).toHaveBeenCalledTimes(1);
    const arg = mockAudit.mock.calls[0][1];
    expect(arg.action).toBe("appointment.hard_delete");
    expect(arg.appointmentId).toBe("appt-1");
    // Snapshot = ids + ISO timestamps + enums ONLY.
    expect(arg.metadata).toEqual({
      appointmentId: "appt-1",
      patientId: "patient-1",
      practitionerId: "therapist-1",
      serviceId: "svc-1",
      locationId: "loc-1",
      startsAt: "2026-08-06T09:00:00.000Z",
      endsAt: "2026-08-06T10:00:00.000Z",
      status: "scheduled",
      confirmationState: "pending",
    });
    // No free text / PII smuggled in.
    const blob = JSON.stringify(arg.metadata);
    expect(blob).not.toContain("Ana");
    expect(blob.toLowerCase()).not.toContain("note");
  });

  it("returns not_found for a missing / cross-tenant appointment (RLS = 0 rows)", async () => {
    mockVerify.mockResolvedValue(true);
    const { tx } = makeTx({ appt: null });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    const r = await hardDeleteAppointment("ghost", "1234");
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses a non-admin (settings:manage gate) before checking the password", async () => {
    mockCtx.mockResolvedValue(reception);
    const r = await hardDeleteAppointment("appt-1", "1234");
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});
