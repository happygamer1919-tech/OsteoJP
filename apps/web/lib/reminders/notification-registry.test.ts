/**
 * Item 2 DoD: every patient-facing body is registered and refused.
 *
 * COUNT RECONCILIATION (the arithmetic, so it cannot drift a third time):
 *
 *   10  patient-facing reminder BODIES in templates.ts
 *       (48h, 24h, confirmation, follow-up, no-show; each in email and SMS)
 *  + 1  patient activation BODY in apps/api (lib/auth/activation.ts)
 *  ---
 *   11  distinct patient-facing bodies
 *
 *   10  refusing registry ENTRIES here (one per body, since each reminder body
 *       is already channel-specific)
 *  + 2  refusing registry ENTRIES in apps/api — the ONE activation body is
 *       delivered on TWO channels, and the registry is keyed per (id, channel)
 *       so an SMS approval can never leak into an email approval
 *  ---
 *   12  refusing registry entries in total
 *
 * So: 11 bodies, 12 entries. Both numbers are correct; they count different
 * things. Earlier reports said "eight" (a miscount from the five-function audit)
 * and then "eleven entries" (conflating bodies with entries). This file asserts
 * the 10 it owns; apps/api/lib/notify/registry.test.ts asserts the other 2.
 */
import { describe, it, expect } from "vitest";
import { createNotifier, createTestSink } from "@osteojp/notify";
import { REMINDER_TEMPLATES, INVITE_TEMPLATE, WEB_TEMPLATES, webRegistry } from "./notification-registry";

const silent = { info: () => {}, error: () => {} } as unknown as Console;

const FLAGS = ["REMINDERS_LIVE_SEND", "INVITES_LIVE_SEND"] as const;

/**
 * INC-12: `dispatch` now asserts the notification env, so a test that arms a
 * flag against a bare env would throw NotificationEnvError instead of
 * exercising the APPROVAL gate it is about. Spread under each case's own env so
 * "armed" keeps meaning "armed and correctly configured". Placeholders only.
 */
const COMPLETE_ENV: Record<string, string> = {
  RESEND_API_KEY: "test",
  REMINDERS_EMAIL_FROM: "test",
  INVITES_EMAIL_FROM: "test",
  TWILIO_ACCOUNT_SID: "test",
  TWILIO_AUTH_TOKEN: "test",
  TWILIO_SMS_FROM: "test",
  REMINDERS_RESCHEDULE_BASE_URL: "test",
  REMINDERS_LINK_SECRET: "test",
};

function harness(env: Record<string, string | undefined>) {
  const sink = createTestSink();
  const notifier = createNotifier({
    registry: webRegistry,
    transport: sink,
    transportConfigured: () => true,
    env: { ...COMPLETE_ENV, ...env },
    logger: silent,
    emailFrom: () => "reminders@send.osteojp.pt",
    envFlags: FLAGS,
  });
  return { notifier, sink };
}

const LIVE = { REMINDERS_LIVE_SEND: "true", INVITES_LIVE_SEND: "true" };

/**
 * W13-05 ADDED AN ELEVENTH ENTRY, `reminder.24h.sms.fee_notice`, and it is the
 * first `approved: false` this registry has ever carried.
 *
 * The counts below moved from 10 to 11 and the approval assertions were SPLIT
 * rather than relaxed. Relaxing "every body is approved" to "most are" would
 * have thrown away the property these tests exist to hold. What is asserted now
 * is stricter: every APPROVED body still needs a named approver and a real date,
 * AND the set of unapproved bodies is pinned to exactly this one id, so a
 * twelfth unapproved body cannot appear without failing here.
 */
const FEE_NOTICE_ID = "reminder.24h.sms.fee_notice";

/**
 * W14-04 REDEFINED THIS FROM AN ID EXCLUSION TO THE FLAG ITSELF, and that is
 * not a tidy-up.
 *
 * It used to be `filter(t => t.id !== FEE_NOTICE_ID)` - "approved" spelled as
 * "everything except the one we know about". A twelfth body registered
 * `approved: false` would have landed INSIDE this set, and the two assertions
 * below (named approver, real date) would have failed with a confusing message
 * about a missing date rather than the true one: a new body nobody approved.
 * Reading the flag makes the set mean what it is called.
 */
const APPROVED_TEMPLATES = REMINDER_TEMPLATES.filter((t) => t.approved);

describe("registry contents", () => {
  it("registers 14 patient-facing bodies: 9 approved, 5 unapproved", () => {
    // 10 -> 11 (W13-05, the fee line) -> 14 (W14-04, the three acks, all
    // unapproved) -> 13 approved (WF-18, JP approved the three acks on
    // 2026-09-01) -> 9 approved (owner ruling B, 2026-09-04: the two follow-up
    // and two no-show bodies DARKENED). The total has not moved since W14-04:
    // neither approving nor darkening copy adds a body, which is what
    // distinguishes both from a change.
    expect(REMINDER_TEMPLATES).toHaveLength(14);
    expect(APPROVED_TEMPLATES).toHaveLength(9);
    expect(REMINDER_TEMPLATES.every((t) => t.audience === "patient")).toBe(true);
  });

  it("pins the unapproved set back to exactly the fee notice", () => {
    // The load-bearing half. If a future body registers unapproved without a
    // decision, this fails - which is the whole reason the gate is worth
    // having. It has now done its job in BOTH directions: it caught the three
    // acknowledgements arriving unapproved (W14-04), and it catches them
    // leaving that set when JP approved them (WF-18).
    //
    // THE FEE NOTICE STAYS, and that boundary is the point of re-pinning
    // rather than deleting this assertion. JP's 2026-09-01 approval was HIS
    // alone; the fee line needs counsel as well, and an approval sitting that
    // swept it along would be exactly the failure this gate exists to prevent.
    //
    // RE-PINNED 2026-09-04 TO FIVE, owner ruling B. The follow-up pair and the
    // no-show pair joined the fee notice, and the reasons differ in a way worth
    // keeping distinct: the fee body has never been approved; these four WERE
    // approved and were DARKENED after one of them misfired at a patient
    // (INC-followup-ignores-a-future-booking). The set is "not sendable", not
    // "never seen".
    //
    // NO_SHOW WAS NOT THE ONE THAT MISFIRED and is here deliberately: JP has
    // never seen that copy, it rides the same shared flag, and a message to a
    // patient who did not attend is fee-adjacent, which is his gate.
    expect(REMINDER_TEMPLATES.filter((t) => !t.approved).map((t) => t.id).sort()).toEqual([
      "follow_up.email",
      "follow_up.sms",
      "no_show.email",
      "no_show.sms",
      FEE_NOTICE_ID,
    ].sort());
    expect(FEE_NOTICE_ID).toBe("reminder.24h.sms.fee_notice");
  });

  // The platform-wide reconciliation, asserted rather than asserted-in-a-comment.
  //
  // IT USED TO READ 12 entries over 11 bodies: 10 here plus 2 patient-activation
  // entries in apps/api, which were one body on two channels and were registered
  // approved:false so a blanket packet approval could not reach them.
  //
  // W13-03 deleted activation entirely under owner ruling WF-08 (R5,
  // 2026-08-05) — it minted a Supabase recovery link, which is a session grant,
  // and Decision D permits no session from anything but a verified OTP. So the
  // totals are now 10 and 10, and apps/api registers NOTHING.
  //
  // The reconciliation is kept rather than deleted with the entries it counted:
  // its value was never the number, it is that a body cannot appear in either
  // app without this count changing and someone noticing.
  it("totals 14 entries over 14 bodies across both apps", async () => {
    const { API_TEMPLATES } = await import("../../../../apps/api/lib/notify/registry");

    // W13-05 moved this from 10 to 11. The reconciliation's value was never the
    // number - it is that a body cannot appear in either app without this count
    // changing and someone noticing. It just noticed.
    expect(REMINDER_TEMPLATES).toHaveLength(14);
    expect(API_TEMPLATES).toHaveLength(0);
    expect(REMINDER_TEMPLATES.length + API_TEMPLATES.length).toBe(14);

    // One body per entry. The fee-notice entry is a DISTINCT body (the 24h body
    // plus the fee line), not a duplicate of the approved one - which is exactly
    // why it needs its own id and its own approval.
    const bodies = new Set(REMINDER_TEMPLATES.map((t) => t.body));
    expect(bodies.size).toBe(14);
  });

  it("apps/api can send nothing at all, which is the fail-closed state", async () => {
    // An empty registry is not a gap awaiting content. `resolveApproved` treats
    // an unknown id as unapproved, so nothing is sendable from that app through
    // any channel under any flag — including the ids that used to exist.
    const { apiRegistry } = await import("../../../../apps/api/lib/notify/registry");
    const { resolveApproved } = await import("@osteojp/notify");

    for (const id of ["patient.activation.sms", "patient.activation.email"]) {
      expect(resolveApproved(apiRegistry, id, "sms")).toBeFalsy();
      expect(resolveApproved(apiRegistry, id, "email")).toBeFalsy();
    }
  });

  it("records a named approver and a real date on every APPROVED body", () => {
    for (const t of APPROVED_TEMPLATES) {
      expect(t.approved).toBe(true);
      // Provenance is not decoration: an approval with no named approver and no
      // date is indistinguishable from a default, which is how unreviewed copy
      // reaches patients.
      expect(t.approvedBy).toBe("JP");
    }
  });

  it("and EVERY unapproved body names no approver, because nobody approved it", () => {
    // The mirror of the rule above. An unapproved entry carrying an approver
    // would read, to anyone scanning, as approved-with-a-typo. Widened from the
    // fee notice alone to the whole unapproved set, so the next unapproved body
    // inherits the rule instead of needing its own assertion.
    for (const t of REMINDER_TEMPLATES.filter((x) => !x.approved)) {
      expect(t.approvedBy).toBeNull();
      expect(t.approvedAt).toBeNull();
    }
  });

  it("dates each body to the approval that actually covers it, not to a blanket", () => {
    // WF-02 (2026-08-05): JP approved amending the 48h EMAIL body - one line, to
    // name confirming alongside remarcar and cancelar. Only that body's date
    // moves. Bumping the shared constant instead would have re-dated nine bodies
    // JP approved on 2026-08-03 and never looked at again, quietly destroying
    // the audit trail this field exists to keep.
    // Three dates now, and each belongs to the bodies it actually covers:
    //   2026-08-03  the nine JP approved in the original packet
    //   2026-08-05  the 48h email, amended to name confirming (WF-02)
    //   2026-09-01  the three reply acknowledgements, plus the 24h SMS
    //               amended to carry the reply instruction (WF-18)
    const DATED: Record<string, string> = {
      "reminder.48h.email": "2026-08-05",
      "reminder.24h.sms": "2026-09-01",
      "reply_ack.confirmed.sms": "2026-09-01",
      "reply_ack.cancelled.sms": "2026-09-01",
      "reply_ack.review.sms": "2026-09-01",
    };
    for (const t of APPROVED_TEMPLATES) {
      expect(t.approvedAt, t.id).toBe(DATED[t.id] ?? "2026-08-03");
    }
    // The bodies still dated to the day JP read them. FOUR, not eight, since
    // owner ruling B darkened the follow-up and no-show pairs on 2026-09-04 -
    // they leave APPROVED_TEMPLATES and take their 2026-08-03 date with them.
    // The date on the entry is NOT rewritten: an approval that happened is a
    // fact about the past, and darkening is a decision about the present.
    expect(
      APPROVED_TEMPLATES.filter((t) => t.approvedAt === "2026-08-03"),
    ).toHaveLength(4);
    // The amendment is real and reached the registered body, not just the date.
    const t48 = REMINDER_TEMPLATES.find((t) => t.id === "reminder.48h.email");
    expect(t48?.body).toContain("Para confirmar, remarcar ou cancelar");
    // And it did NOT bleed into the 24h bodies, which stay confirm-free: the
    // 24h SMS is confirm-only by counsel's matrix and carries no link at all.
    const t24 = REMINDER_TEMPLATES.find((t) => t.id === "reminder.24h.email");
    expect(t24?.body).toContain("Para remarcar ou cancelar");
    expect(t24?.body).not.toContain("Para confirmar");
  });

  it("covers both channels for all five notification kinds", () => {
    expect([...REMINDER_TEMPLATES].map((t) => t.id).sort()).toEqual([
      "confirmation.email",
      "confirmation.sms",
      "follow_up.email",
      "follow_up.sms",
      "no_show.email",
      "no_show.sms",
      "reminder.24h.email",
      "reminder.24h.sms",
      "reminder.24h.sms.fee_notice",
      "reminder.48h.email",
      "reminder.48h.sms",
      "reply_ack.cancelled.sms",
      "reply_ack.confirmed.sms",
      "reply_ack.review.sms",
    ]);
  });

  it("registers the grandfathered staff invite as approved and staff-facing", () => {
    expect(INVITE_TEMPLATE.approved).toBe(true);
    expect(INVITE_TEMPLATE.audience).toBe("staff");
    expect(INVITE_TEMPLATE.liveSendFlag).toBe("INVITES_LIVE_SEND");
  });

  it("carries the real body, not a re-authored copy", async () => {
    const { CONFIRMATION_SMS } = await import("./templates");
    const entry = REMINDER_TEMPLATES.find((t) => t.id === "confirmation.sms");
    expect(entry?.body).toBe(CONFIRMATION_SMS.pt);
  });
});

describe("the approval gate now passes, and the kill switch still holds", () => {
  it("passes all 9 approved bodies through when live send is armed", async () => {
    const { notifier, sink } = harness(LIVE);

    const outcomes = await Promise.all(
      REMINDER_TEMPLATES.map((t) =>
        notifier.dispatch({
          templateId: t.id,
          channel: t.channel,
          to: t.channel === "sms" ? "+351910000000" : "doente@example.test",
          subject: "assunto",
          body: t.body,
          appointmentId: "appt-1",
        }),
      ),
    );

    // 13 of the 14 registered bodies send; the fee notice is the one refused,
    // and it is refused for its OWN reason (`template_unapproved`) rather than
    // by the flag, which this asserts explicitly so the count cannot drift into
    // meaning something else.
    // NINE since owner ruling B (2026-09-04). The five that do not send are the
    // fee notice, which has never been approved, and the four darkened bodies.
    expect(outcomes.filter((o) => o.sent)).toHaveLength(9);
    expect(sink.records).toHaveLength(9);
    // FIVE refused since owner ruling B, and they are refused for the same
    // MECHANISM but two different REASONS in the human sense: the fee line has
    // never been approved, and the four darkened bodies were approved and then
    // withdrawn. The registry cannot tell those apart and does not need to -
    // what it guarantees is that neither reaches a patient.
    const refused = outcomes.filter((o) => !o.sent);
    expect(refused.map((o) => o.templateId).sort()).toEqual(
      [FEE_NOTICE_ID, "follow_up.email", "follow_up.sms", "no_show.email", "no_show.sms"].sort(),
    );
    expect(refused.every((o) => "reason" in o && o.reason === "template_unapproved")).toBe(true);
    expect(refused.find((o) => o.templateId === FEE_NOTICE_ID)).toMatchObject({
      templateId: FEE_NOTICE_ID,
      reason: "template_unapproved",
    });
  });

  // THE LOAD-BEARING TEST NOW. Approval removed one of the two gates; this is the
  // other, and it is the only thing standing between an approved body and a real
  // patient's phone. It must fail loudly if the kill switch ever stops holding.
  it("sends NOTHING with live send off, even though all 9 are approved", async () => {
    const { notifier, sink } = harness({});

    const outcomes = await Promise.all(
      REMINDER_TEMPLATES.map((t) =>
        notifier.dispatch({
          templateId: t.id,
          channel: t.channel,
          to: t.channel === "sms" ? "+351910000000" : "doente@example.test",
          subject: "assunto",
          body: t.body,
          appointmentId: "appt-1",
        }),
      ),
    );

    const refused = outcomes.filter(
      (o) => !o.sent && "reason" in o && o.reason === "live_send_disabled",
    );
    // The 13 approved bodies. The fourteenth never reaches the flag check: the
    // approval gate is evaluated first, so the fee notice reads
    // `template_unapproved` even with live send off - the deliberate ordering
    // gate.ts's header describes.
    // NINE, and the count matters more than it looks: the OTHER five are refused
    // for a DIFFERENT reason (`template_unapproved`), so a change that
    // accidentally re-approved one would show up here as 10 rather than as a
    // silent extra message.
    expect(refused).toHaveLength(9);
    expect(sink.records).toHaveLength(0);
  });

  it("still fails closed on an id that is not registered at all", async () => {
    const { notifier, sink } = harness(LIVE);
    const out = await notifier.dispatch({
      templateId: "reminder.24h.whatsapp",
      channel: "sms",
      to: "+351910000000",
      body: "corpo",
    });

    expect(out).toMatchObject({ sent: false, reason: "template_unapproved" });
    expect(sink.records).toHaveLength(0);
  });

  it("lets the grandfathered invite through, proving the gate is not blanket-deny", async () => {
    const { notifier, sink } = harness(LIVE);
    const out = await notifier.dispatch({
      templateId: INVITE_TEMPLATE.id,
      channel: "email",
      to: "novo@osteojp.pt",
      subject: "Convite",
      body: "corpo",
    });

    expect(out.sent).toBe(true);
    expect(sink.records).toHaveLength(1);
  });

  it("refuses a body the moment its approval is withdrawn, and only that one", async () => {
    // The inverse of the original assertion: now that all ten are approved, the
    // property worth proving is that UN-approving one stops exactly one.
    const flipped = WEB_TEMPLATES.map((t) =>
      t.id === "confirmation.sms"
        ? { ...t, approved: false, approvedBy: null, approvedAt: null }
        : t,
    );
    const sink = createTestSink();
    const { buildRegistry } = await import("@osteojp/notify");
    const notifier = createNotifier({
      registry: buildRegistry(flipped),
      transport: sink,
      transportConfigured: () => true,
      env: { ...COMPLETE_ENV, ...LIVE },
      logger: silent,
      emailFrom: () => "reminders@send.osteojp.pt",
      envFlags: FLAGS,
    });

    const withdrawn = await notifier.dispatch({
      templateId: "confirmation.sms",
      channel: "sms",
      to: "+351910000000",
      body: "corpo",
    });
    const stillApproved = await notifier.dispatch({
      templateId: "confirmation.email",
      channel: "email",
      to: "doente@example.test",
      subject: "assunto",
      body: "corpo",
    });

    expect(withdrawn).toMatchObject({ sent: false, reason: "template_unapproved" });
    expect(stillApproved.sent).toBe(true);
    expect(sink.records).toHaveLength(1);
  });
});
