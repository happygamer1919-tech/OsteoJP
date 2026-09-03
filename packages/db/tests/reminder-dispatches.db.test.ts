/**
 * reminder-dispatches.db.test.ts — migration 0075, OBS-04.
 *
 * ==========================================================================
 * WHAT THIS TABLE IS FOR, because it decides what is worth asserting
 * ==========================================================================
 * From 2026-09-02 to 2026-09-03 every outbound message failed at Twilio and the
 * system reported nothing anywhere a person would look; the owner found it in
 * the Twilio console. On 2026-09-03 a post-visit SMS reached a patient who
 * already had an appointment the next day, and that was also found by a human
 * reading a log. Nothing in this database could answer either question.
 *
 * So the assertions below are about the two properties that make it ANSWERABLE:
 * a row cannot be written that lies about what happened, and the row is visible
 * to exactly the people who work the desk.
 *
 * ==========================================================================
 * THE EQUIVALENCE IS THE ONE TO READ FIRST
 * ==========================================================================
 * `suppression_reason IS NOT NULL` must equal `outcome = 'suppressed'`, in BOTH
 * directions, and both directions are tested. An implication would have been
 * cheaper and would have let through the two rows that matter most: a
 * suppression with no reason, which is the state this table exists to end, and
 * a `sent` carrying a reason, which is a row that contradicts itself in a log
 * somebody will later use to explain a bill.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asRole, claimsFor, connect, live } from "./rls-harness";

const d = live ? describe : describe.skip;

d("0075 reminder_dispatches: a row cannot lie, and the desk alone can read it", () => {
  let sql: Sql;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const location = randomUUID();
  const therapist = randomUUID();
  const patient = randomUUID();
  const appointment = randomUUID();

  /**
   * Insert one dispatch row on the OWNER connection and return the error text,
   * or null when it was accepted. The owner bypasses RLS, which is what makes
   * this a test of the CHECK constraints and of nothing else - the policies get
   * their own cases below, through `asRole`.
   */
  const insert = async (cols: Record<string, unknown>): Promise<string | null> => {
    const full: Record<string, unknown> = {
      tenant_id: tenant,
      appointment_id: appointment,
      channel: "sms",
      template_id: "reminder.24h.sms",
      ...cols,
    };
    try {
      await sql`insert into reminder_dispatches ${sql(full)}`;
      return null;
    } catch (e) {
      return String((e as { message?: string }).message ?? e);
    }
  };

  beforeAll(async () => {
    sql = connect();
    for (const [id, name] of [
      [tenant, "rd-a"],
      [otherTenant, "rd-b"],
    ] as const) {
      await sql`insert into tenants (id, name, slug) values (${id}, ${name}, ${name + "-" + id.slice(0, 8)})`;
    }
    await sql`insert into locations (id, tenant_id, name) values (${location}, ${tenant}, 'RD Loc')`;
    await sql`insert into users (id, tenant_id, email, full_name)
              values (${therapist}, ${tenant}, ${"rd-thr-" + therapist.slice(0, 8) + "@example.test"}, 'RD Thr')`;
    await sql`insert into patients (id, tenant_id, full_name, patient_number, created_by)
              values (${patient}, ${tenant}, 'RD Patient', 9401, ${therapist})`;
    await sql`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
              values (${appointment}, ${tenant}, ${patient}, ${therapist}, ${location},
                      now() + interval '1 day', now() + interval '1 day 45 minutes', 'scheduled')`;
  });

  afterAll(async () => {
    if (!live) return;
    await sql`delete from reminder_dispatches where tenant_id = ${tenant}`;
    await sql`delete from appointments where tenant_id = ${tenant}`;
    await sql`delete from patients where tenant_id = ${tenant}`;
    await sql`delete from users where tenant_id = ${tenant}`;
    await sql`delete from locations where tenant_id = ${tenant}`;
    await sql`delete from tenants where id in (${tenant}, ${otherTenant})`;
    await sql.end();
  });

  describe("the outcome/reason equivalence, both directions", () => {
    it("accepts a SENT row with no reason", async () => {
      expect(await insert({ outcome: "sent", provider_message_id: "SM_eq_1" })).toBeNull();
    });

    it("accepts a SUPPRESSED row that carries its reason", async () => {
      expect(
        await insert({ outcome: "suppressed", suppression_reason: "channels_off" }),
      ).toBeNull();
    });

    it("REFUSES a suppression with no reason - the state the table exists to end", async () => {
      expect(await insert({ outcome: "suppressed" })).toMatch(/reason_matches_outcome/);
    });

    it("REFUSES a sent row carrying a reason - a row that contradicts itself", async () => {
      expect(
        await insert({ outcome: "sent", suppression_reason: "channels_off" }),
      ).toMatch(/reason_matches_outcome/);
    });
  });

  describe("the closed vocabularies", () => {
    it("REFUSES an outcome outside sent|suppressed|provider_error", async () => {
      // `delivered` is the tempting one: it is a real Twilio STATUS, and the
      // column that holds those is deliberately a different one.
      expect(await insert({ outcome: "delivered" })).toMatch(/outcome_check/);
    });

    it("REFUSES a channel outside sms|email", async () => {
      expect(await insert({ outcome: "sent", channel: "whatsapp" })).toMatch(/channel_check/);
    });

    it("REFUSES a blank template_id", async () => {
      expect(await insert({ outcome: "sent", template_id: "   " })).toMatch(/template_id_not_blank/);
    });

    it("REFUSES zero segments, because a sent message has at least one", async () => {
      expect(await insert({ outcome: "sent", segments: 0 })).toMatch(/segments_sane/);
    });

    it("does NOT constrain provider_status, because that vocabulary is Twilio's", async () => {
      // Asserted as a POSITIVE: a CHECK here would turn a provider's vocabulary
      // change into our failed webhook, so the absence of one is deliberate.
      expect(
        await insert({ outcome: "sent", provider_message_id: "SM_vocab", provider_status: "anything_they_invent" }),
      ).toBeNull();
    });
  });

  describe("the partial unique index on provider_message_id", () => {
    it("REFUSES two rows for one provider message id", async () => {
      expect(await insert({ outcome: "sent", provider_message_id: "SM_dup" })).toBeNull();
      expect(await insert({ outcome: "sent", provider_message_id: "SM_dup" })).toMatch(
        /provider_message_id_key/,
      );
    });

    it("ACCEPTS many suppressed rows, which all have a NULL provider id", async () => {
      // The reason the index is PARTIAL. A plain unique index would collapse
      // every suppression into one row, and suppressions are the common case.
      expect(await insert({ outcome: "suppressed", suppression_reason: "no_contact" })).toBeNull();
      expect(await insert({ outcome: "suppressed", suppression_reason: "lead_time_off" })).toBeNull();
      expect(await insert({ outcome: "suppressed", suppression_reason: "status" })).toBeNull();
    });
  });

  describe("who can read it", () => {
    /** How many rows this principal can see, under the shipped policies. */
    const seenBy = (tenantId: string, role: "owner" | "admin" | "therapist" | "reception") =>
      asRole(sql, "authenticated", claimsFor(tenantId, role), async (tx) => {
        const rows = (await tx`select count(*)::int as n from reminder_dispatches`) as {
          n: number;
        }[];
        return Number(rows[0]!.n);
      });

    it("reception and admin of the owning tenant see the rows; a therapist does not", async () => {
      // THE THERAPIST EXCLUSION IS A DECISION, NOT AN OMISSION. A delivery log
      // is an operational and billing surface - who was texted, how many
      // segments, what it cost - and it is the desk's instrument. A therapist
      // who needs to know whether a patient was reminded reads the appointment,
      // which carries the confirmation axis.
      expect(await seenBy(tenant, "reception")).toBeGreaterThan(0);
      expect(await seenBy(tenant, "admin")).toBeGreaterThan(0);
      expect(await seenBy(tenant, "owner")).toBeGreaterThan(0);
      expect(await seenBy(tenant, "therapist")).toBe(0);
    });

    it("another tenant's admin sees nothing at all", async () => {
      expect(await seenBy(otherTenant, "admin")).toBe(0);
    });
  });

  describe("reminder_dispatch_tenant, the callback's one crossing", () => {
    it("resolves a tenant the CALLER cannot see, which is its entire purpose", async () => {
      // The Twilio status callback has no session and knows only the SID, so it
      // cannot be tenant-scoped before this answers. The row is invisible to the
      // calling claims and the function still returns its tenant.
      const out = await asRole(
        sql,
        "authenticated",
        claimsFor(otherTenant, "admin"),
        async (tx) => {
          const visible = (await tx`
            select count(*)::int as n from reminder_dispatches
             where provider_message_id = 'SM_eq_1'`) as { n: number }[];
          const resolved = (await tx`
            select public.reminder_dispatch_tenant('SM_eq_1') as t`) as { t: string | null }[];
          return { visible: Number(visible[0]!.n), tenant: resolved[0]!.t };
        },
      );
      expect(out.visible).toBe(0);
      expect(out.tenant).toBe(tenant);
    });

    it("returns NULL for a sid it has never seen, rather than raising", async () => {
      const r = (await sql`select public.reminder_dispatch_tenant('SM_never') as t`) as {
        t: string | null;
      }[];
      expect(r[0]!.t).toBeNull();
    });

    it("is STABLE, SECURITY DEFINER and owned by postgres", async () => {
      // 0060's rule: the owner is whose privileges it runs with, so a different
      // applying principal would silently change the answer.
      const r = (await sql`
        select provolatile::text as vol, prosecdef as secdef, pg_get_userbyid(proowner) as owner
          from pg_proc where proname = 'reminder_dispatch_tenant'`) as {
        vol: string;
        secdef: boolean;
        owner: string;
      }[];
      expect(r[0]!.vol).toBe("s");
      expect(r[0]!.secdef).toBe(true);
      expect(r[0]!.owner).toBe("postgres");
    });

    it("is EXECUTE-able by authenticated only - and proacl is read, not inferred", async () => {
      // ==================================================================
      // READ proacl OUT OF pg_proc DIRECTLY. NOT information_schema, and
      // NOT an inference from the REVOKE statements in the migration.
      // ==================================================================
      // PURPLE measured on CI that Supabase's ALTER DEFAULT PRIVILEGES
      // grants `service_role` EXECUTE at CREATE FUNCTION time ON SOME
      // DATABASES AND NOT OTHERS, and that `REVOKE ... FROM PUBLIC` does
      // not remove a privilege a named role holds in its own right.
      //
      // THIS FILE'S FIRST DRAFT PROVED THE POINT. It asserted anon,
      // patient and PUBLIC were absent, all three passed, and
      // service_role held EXECUTE the whole time - because nothing had
      // revoked it and nothing had looked. A revoke that reads as
      // sufficient is not; only the catalogue is.
      //
      // `information_schema.role_routine_grants` is deliberately not the
      // source here either: it reports what the CURRENT user can see, so
      // it is one more thing between the question and the answer.
      const r = (await sql`
        select coalesce(array_to_string(proacl, ' '), '') as acl
          from pg_proc where proname = 'reminder_dispatch_tenant'`) as { acl: string }[];
      const acl = r[0]!.acl;

      expect(acl).toMatch(/\bauthenticated=X/);
      expect(acl).not.toMatch(/\bservice_role=/);
      expect(acl).not.toMatch(/\banon=/);
      expect(acl).not.toMatch(/\bpatient=/);
      // An empty grantee before `=` is PUBLIC in an aclitem.
      expect(acl).not.toMatch(/(^|\s)=X/);
    });
  });

  it("grants no DELETE to authenticated, so a bad week cannot be tidied away", async () => {
    const r = (await sql`
      select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') as p
        from information_schema.role_table_grants
       where table_name = 'reminder_dispatches' and grantee = 'authenticated'`) as { p: string }[];
    expect(r[0]!.p.split(",").filter(Boolean).sort()).toEqual(["INSERT", "SELECT", "UPDATE"]);
  });
});
