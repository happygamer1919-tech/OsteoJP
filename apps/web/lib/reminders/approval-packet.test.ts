/**
 * The JP approval packet must stay in step with the registry.
 *
 * The failure this prevents: someone adds an eleventh patient-facing body, it
 * registers `approved: false` (so it is safely blocked), and it is then approved
 * in a batch alongside the others without JP ever having seen it — because the
 * packet he read only listed ten. The gate would be doing its job and the review
 * would still be wrong.
 *
 * So: every patient-facing template id in the registry must appear in the packet,
 * by id. Adding a body without adding its section fails here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REMINDER_TEMPLATES } from "./notification-registry";

const PACKET = join(__dirname, "../../../../docs/notifications-approval-packet.md");

describe("approval packet covers the registry", () => {
  const packet = readFileSync(PACKET, "utf8");

  it("names every patient-facing template id", () => {
    const missing = REMINDER_TEMPLATES.filter((t) => !packet.includes(`\`${t.id}\``));
    expect(missing.map((t) => t.id)).toEqual([]);
  });

  it("has one numbered section per template", () => {
    const sections = packet.match(/^### \d+\. /gm) ?? [];
    expect(sections).toHaveLength(REMINDER_TEMPLATES.length);
  });

  it("offers both 24h variants, A without the fee line and B with it", () => {
    expect(packet).toMatch(/^### Variante A /m);
    expect(packet).toMatch(/^### Variante B /m);
    expect(packet).toContain("50%");
  });

  it("carries the defaults matrix JP needs to read the rest", () => {
    expect(packet).toContain("reminder_sms_enabled");
    expect(packet).toContain("reminder_email_enabled");
  });

  it("does NOT put the dead activation template in front of a clinical owner", () => {
    expect(packet).not.toContain("patient.activation.sms");
    expect(packet).not.toContain("patient.activation.email");
  });

  /**
   * W13-05 INVERTED THIS ASSERTION, and the inversion is the point.
   *
   * It used to require the packet to say the flag was "especificado, ainda nao
   * construido" — because claiming a protection that did not exist is the class
   * of false claim this lane spent a session unpicking. LOOP 5 BUILT it, so that
   * sentence became false, and leaving it would have been the same error in the
   * opposite direction: understating what exists rather than overstating it.
   *
   * The packet must now say the flag is built AND still off, and must keep the
   * built/approved distinction explicit — approving a mechanism is not approving
   * a body, and section 11 is the body nobody has approved.
   */
  it("states that the fee-notice flag is BUILT and still off, not that it is unbuilt", () => {
    expect(packet).toContain("REMINDERS_FEE_NOTICE_ENABLED");
    expect(packet).toMatch(/CONSTRUIDO, e desligado/i);
    expect(packet).not.toMatch(/ainda nao construido/i);
    // The distinction that stops "the mechanism shipped" reading as "the copy is
    // approved". Without this line the packet could truthfully say "built" and
    // still mislead.
    expect(packet).toMatch(/Construido nao quer dizer aprovado/i);
  });

  it("puts the ONE unapproved body in front of JP as its own numbered section", () => {
    expect(packet).toContain("`reminder.24h.sms.fee_notice`");
    expect(packet).toMatch(/^### 11\. /m);
    // Named as unapproved in the packet, matching the registry. The drift guard
    // below counts these; this asserts the reader is told which one it is.
    expect(packet).toMatch(/UNICA MENSAGEM DESTE DOCUMENTO QUE AINDA NAO ESTA APROVADA/i);
  });

  it("states the measured segment cost of the fee line, including what did NOT fit", () => {
    // LOOP 5 section 6: report the measured count rather than trim approved copy.
    // The packet has to carry the number JP is choosing against, and the fact
    // that the natural full phrasing costs a second segment.
    expect(packet).toContain("153 caracteres, 1 segmento");
    expect(packet).toContain("169 caracteres");
    expect(packet).toMatch(/Nenhum texto ja aprovado foi encurtado/i);
  });
});

/**
 * DRIFT GUARD, added 2026-08-05 after the packet was found ten-for-ten wrong.
 *
 * WHAT HAPPENED. Every one of the ten sections read "Estado: bloqueado
 * (approved: false)" while the registry had carried approved:true since #766 on
 * 2026-08-03. The packet is the artefact a clinical owner SIGNS, so it was
 * telling JP that every body was blocked by approval when in fact approval had
 * already been given and the only remaining lock was REMINDERS_LIVE_SEND.
 *
 * That direction of error is the dangerous one: it understates the exposure. A
 * reader of the packet would count TWO locks between an approved body and a
 * patient's phone when there was one.
 *
 * WHY THE EXISTING TESTS MISSED IT. They assert STRUCTURE - that every template
 * has a numbered section, that both 24h variants exist, that the dead activation
 * template is absent. Structure was never wrong. State was, and nothing looked
 * at state, which is how a ten-fold divergence sat unnoticed through two waves.
 */
describe("the packet's stated approval state matches the registry", () => {
  // `packet` above is scoped to its own describe; read it again here.
  const packet = readFileSync(
    join(__dirname, "..", "..", "..", "..", "docs", "notifications-approval-packet.md"),
    "utf8",
  );

  it("claims approved:true exactly as often as the registry does", () => {
    // Scoped to the per-template "Estado:" lines. The intro carries a
    // deliberately-preserved historical paragraph, marked "Historico, mantido
    // para referencia", which describes the pre-#766 state on purpose - counting
    // raw occurrences would fail on honest history.
    const estado = packet.match(/^- \*\*Estado:\*\*.*$/gm) ?? [];
    expect(estado).toHaveLength(REMINDER_TEMPLATES.length);

    const approvedInRegistry = REMINDER_TEMPLATES.filter((t) => t.approved).length;
    expect(estado.filter((l) => l.includes("`approved: true`"))).toHaveLength(approvedInRegistry);
    expect(estado.filter((l) => l.includes("`approved: false`"))).toHaveLength(
      REMINDER_TEMPLATES.length - approvedInRegistry,
    );
  });

  it("still tells the reader that live send is the remaining lock", () => {
    // Correcting "blocked" to "approved" must not read as "these will now send".
    // The packet has to keep naming the thing that actually stops them.
    expect(packet).toContain("REMINDERS_LIVE_SEND");
  });

  it("dates the 48h email to its own later approval, not the blanket one", () => {
    // WF-02: JP approved that one line on 2026-08-05. The other nine keep
    // 2026-08-03, and collapsing them would erase the amendment's provenance.
    const s48 = packet.slice(packet.indexOf("### 3. Lembrete 48 horas antes"));
    expect(s48.slice(0, 600)).toContain("2026-08-05");
  });
});
