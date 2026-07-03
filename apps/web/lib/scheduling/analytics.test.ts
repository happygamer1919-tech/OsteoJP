import { vi, describe, it, expect } from "vitest";

vi.mock("server-only", () => ({}));

import { writeAppointmentStatusChangedEvent } from "./analytics";

/**
 * Fake tenant-scoped tx capturing what the helper reads and writes:
 *   - `.select(...).from(...).where(...).limit(1)` → the appointment_notes EXISTS
 *     probe; `notesRows` decides whether a note is "present".
 *   - `.insert(...).values(v)` → the analytics_events write; `v` is captured.
 * The chain is thenable-free: only the terminal `.limit()` resolves.
 */
function fakeTx(notesRows: unknown[]) {
  const inserted: Record<string, unknown>[] = [];
  let notesQueried = false;
  const tx = {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                limit: async () => {
                  notesQueried = true;
                  return notesRows;
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        values: async (v: Record<string, unknown>) => {
          inserted.push(v);
        },
      };
    },
  };
  return { tx, inserted, wasNotesQueried: () => notesQueried };
}

const base = {
  tenantId: "tenant-A",
  actorUserId: "user-1",
  appointmentId: "appt-1",
  fromStatus: "confirmed",
  therapistUserId: "therapist-1",
  locationId: "loc-1",
  occurredAt: new Date("2026-01-05T09:00:00Z"),
};

describe("writeAppointmentStatusChangedEvent — note_present on completion", () => {
  let f: ReturnType<typeof fakeTx>;

  it("completion WITH a per-visit note → note_present=true", async () => {
    f = fakeTx([{ id: "note-1" }]);
    await writeAppointmentStatusChangedEvent(f.tx as never, {
      ...base,
      toStatus: "completed",
    });

    expect(f.wasNotesQueried()).toBe(true);
    expect(f.inserted).toHaveLength(1);
    const row = f.inserted[0];
    expect(row.eventType).toBe("appointment_status_changed");
    expect((row.payload as Record<string, unknown>).note_present).toBe(true);
    expect((row.payload as Record<string, unknown>).to_status).toBe("completed");
    expect((row.payload as Record<string, unknown>).from_status).toBe("confirmed");
  });

  it("completion with ZERO notes → note_present=false", async () => {
    f = fakeTx([]);
    await writeAppointmentStatusChangedEvent(f.tx as never, {
      ...base,
      toStatus: "completed",
    });

    expect(f.wasNotesQueried()).toBe(true);
    expect((f.inserted[0].payload as Record<string, unknown>).note_present).toBe(false);
  });

  it("event carries the server-derived tenant + actor, never client input", async () => {
    f = fakeTx([]);
    await writeAppointmentStatusChangedEvent(f.tx as never, {
      ...base,
      toStatus: "completed",
    });

    const row = f.inserted[0];
    expect(row.tenantId).toBe("tenant-A");
    expect(row.actorUserId).toBe("user-1");
    expect(row.entityType).toBe("appointment");
    expect(row.entityId).toBe("appt-1");
    expect((row.payload as Record<string, unknown>).actor).toBe("user-1");
  });

  it("non-completion transition → no note probe, no note_present key", async () => {
    f = fakeTx([{ id: "note-1" }]);
    await writeAppointmentStatusChangedEvent(f.tx as never, {
      ...base,
      fromStatus: "scheduled",
      toStatus: "confirmed",
    });

    // note_present is a completion-only signal: skip the probe entirely.
    expect(f.wasNotesQueried()).toBe(false);
    expect(f.inserted).toHaveLength(1);
    expect("note_present" in (f.inserted[0].payload as Record<string, unknown>)).toBe(false);
  });
});
