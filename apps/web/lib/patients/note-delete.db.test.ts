/**
 * note-delete.db.test.ts — NOTES-04, against a real database.
 *
 * The pure tests hand the action a mocked transaction, so they cannot see the
 * two things that decide whether the Eliminar button actually works:
 *
 *   1. that 0084's DELETE policy lets the row go under a tenant-scoped principal
 *      and refuses another tenant's row, and
 *   2. that a unified note's hidden LEGACY TWIN goes with it. The Notas tab hides
 *      a legacy revision when a unified row has the same text at the same
 *      millisecond; delete only the unified row and the old copy reappears.
 *
 * The twin is written 400 microseconds away from the unified row on purpose:
 * the merge compares milliseconds, so that revision IS hidden, and a delete that
 * compared the raw timestamps would miss it and leave it to reappear.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("NOTES-04: deleting a note", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let mod: typeof import("./note-delete");

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const role = randomUUID();
  const staff = randomUUID();
  const location = randomUUID();
  const patient = randomUUID();
  const otherPatient = randomUUID();
  const foreignPatient = randomUUID();
  const appt = randomUUID();

  const run = async <T>(fn: (tx: import("@osteojp/db").DbTx) => Promise<T>): Promise<T> => {
    const { withTenantContext } = await import("@osteojp/db");
    return withTenantContext({ tenant_id: tenant, user_role: "owner", sub: staff }, fn);
  };

  /** Counts on the admin connection, so a refused delete is checked for real. */
  const exists = async (table: "appointment_notes" | "patient_note_revisions", id: string) => {
    const { sql } = await import("drizzle-orm");
    const rows = (await db.execute(
      sql`select 1 from ${sql.identifier(table)} where id = ${id}`,
    )) as unknown as unknown[];
    return rows.length === 1;
  };

  const unifiedNote = async (body: string, opts: { at?: string; appointmentId?: string | null; tenantId?: string; patientId?: string } = {}) => {
    const { sql } = await import("drizzle-orm");
    const id = randomUUID();
    await db.execute(
      sql`insert into public.appointment_notes (id, tenant_id, patient_id, appointment_id, body, created_at)
          values (${id}, ${opts.tenantId ?? tenant}, ${opts.patientId ?? patient}, ${opts.appointmentId ?? null}, ${body},
                  ${opts.at ?? "2026-06-01T10:00:00.123000Z"}::timestamptz)`,
    );
    return id;
  };

  const legacyNote = async (content: string, at: string, patientId = patient) => {
    const { sql } = await import("drizzle-orm");
    const id = randomUUID();
    await db.execute(
      sql`insert into public.patient_note_revisions (id, tenant_id, patient_id, content, created_at)
          values (${id}, ${tenant}, ${patientId}, ${content}, ${at}::timestamptz)`,
    );
    return id;
  };

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    mod = await import("./note-delete");
    const { sql } = await import("drizzle-orm");

    await db.execute(
      sql`insert into public.tenants (id, name, slug)
          values (${tenant}, 'notes delete', ${`nd-${tenant.slice(0, 8)}`}),
                 (${otherTenant}, 'notes delete other', ${`ndo-${otherTenant.slice(0, 8)}`})`,
    );
    await db.execute(sql`insert into public.roles (id, tenant_id, slug, name) values (${role}, ${tenant}, 'owner', 'Owner')`);
    await db.execute(
      sql`insert into public.users (id, tenant_id, role_id, email, full_name)
          values (${staff}, ${tenant}, ${role}, ${`s-${staff.slice(0, 8)}@notes-delete.test`}, 'Staff')`,
    );
    await db.execute(sql`insert into public.locations (id, tenant_id, name) values (${location}, ${tenant}, 'CB')`);
    await db.execute(
      sql`insert into public.patients (id, tenant_id, full_name)
          values (${patient}, ${tenant}, 'Paciente Notas'),
                 (${otherPatient}, ${tenant}, 'Outro Paciente'),
                 (${foreignPatient}, ${otherTenant}, 'Paciente Estrangeiro')`,
    );
    await db.execute(
      sql`insert into public.appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at)
          values (${appt}, ${tenant}, ${patient}, ${staff}, ${location},
                  now() - interval '3 days', now() - interval '3 days' + interval '45 minutes')`,
    );
  });

  afterAll(async () => {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`delete from public.tenants where id in (${tenant}, ${otherTenant})`);
  });

  it("deletes a note on a marcação and names that marcação", async () => {
    const id = await unifiedNote("nota da marcacao", { appointmentId: appt });
    const gone = await run((tx) => mod.deleteNoteInTx(tx, "appointment_notes", id));
    expect(gone).toEqual({ patientId: patient, appointmentId: appt, legacyTwinsDeleted: 0 });
    expect(await exists("appointment_notes", id)).toBe(false);
  });

  it("takes the hidden legacy twin with it, and nothing that is not a twin", async () => {
    const text = "nota copiada pelo backfill";
    const id = await unifiedNote(text, { at: "2026-06-02T09:30:00.123000Z" });
    // Same millisecond, 400 microseconds later: the merge hides it.
    const twin = await legacyNote(text, "2026-06-02T09:30:00.123400Z");
    // Same text, one second later: the merge shows it, so it is not a twin.
    const later = await legacyNote(text, "2026-06-02T09:30:01.123000Z");
    // Same text and instant, another patient: not this note's history.
    const elsewhere = await legacyNote(text, "2026-06-02T09:30:00.123000Z", otherPatient);

    const gone = await run((tx) => mod.deleteNoteInTx(tx, "appointment_notes", id));

    expect(gone).toEqual({ patientId: patient, appointmentId: null, legacyTwinsDeleted: 1 });
    expect(await exists("patient_note_revisions", twin)).toBe(false);
    expect(await exists("patient_note_revisions", later)).toBe(true);
    expect(await exists("patient_note_revisions", elsewhere)).toBe(true);
  });

  it("deletes a legacy revision on its own", async () => {
    const id = await legacyNote("revisao antiga", "2026-05-01T08:00:00Z");
    const gone = await run((tx) => mod.deleteNoteInTx(tx, "patient_note_revisions", id));
    expect(gone).toEqual({ patientId: patient, appointmentId: null, legacyTwinsDeleted: 0 });
    expect(await exists("patient_note_revisions", id)).toBe(false);
  });

  it("refuses another tenant's note, and the row is still there", async () => {
    const foreign = await unifiedNote("nota de outro tenant", { tenantId: otherTenant, patientId: foreignPatient });
    expect(await run((tx) => mod.readNotePatientId(tx, "appointment_notes", foreign))).toBeNull();
    expect(await run((tx) => mod.deleteNoteInTx(tx, "appointment_notes", foreign))).toBeNull();
    expect(await exists("appointment_notes", foreign)).toBe(true);
  });

  it("naming the wrong relation finds nothing and deletes nothing", async () => {
    const id = await unifiedNote("nota unificada");
    expect(await run((tx) => mod.readNotePatientId(tx, "appointment_notes", id))).toBe(patient);
    expect(await run((tx) => mod.readNotePatientId(tx, "patient_note_revisions", id))).toBeNull();
    expect(await run((tx) => mod.deleteNoteInTx(tx, "patient_note_revisions", id))).toBeNull();
    expect(await exists("appointment_notes", id)).toBe(true);
  });
});
