import { can, type Capability, type Role } from "@osteojp/auth";
import { s } from "../i18n";
import { surveyVisible } from "../reminders/survey-mode";

/**
 * COMMS-01 (owner dispatch 2026-09-14, BL-2): the sections of the Comunicações
 * group, in order, each with the capability that opens it.
 *
 * ONE LIST, THREE READERS. The sidebar entry shows when a role may open any of
 * these (nav-items.ts), /comunicacoes redirects to the first one the role may
 * open, and the shared tab bar lists exactly these. A section added here reaches
 * all three; a section that existed in only one of them is how a tab bar comes
 * to offer a page its route then refuses.
 *
 * THE CAPABILITY IS THE PAGE'S OWN ROUTE GATE, restated, not a second rule. The
 * pages do not refuse in the same way: Recuperação and Lembretes SMS redirect a
 * viewer without it to the home page, and their queries assert it again;
 * Respostas SMS (/reminders/review) asserts it on the page and renders the
 * forbidden message in place of the queue, and its resolve action asserts
 * `sms_replies:resolve`.
 */
export type CommsSection = {
  href: string;
  label: string;
  capability: Capability;
  /**
   * SAT-01: a section that exists only while a deployment switch says so. Asked
   * on every read, never once at load, so the answer is the switch as it stands.
   * Absent for every section that always exists.
   */
  exists?: () => boolean;
};

/** The survey list's address. One spelling, read by the section and by its page. */
export const SURVEY_LIST_HREF = "/comunicacoes/avaliacoes-de-satisfacao";

export const COMMS_SECTIONS: readonly CommsSection[] = [
  // RB-01. Keeps its original URL: links, revalidatePath and e2e specs name it.
  { href: "/recuperacao", label: s["nav.followup"], capability: "followup:read" },
  // COMMS-01. Owner, admin and reception until a scoped therapist policy exists
  // (docs/QUESTIONS.md > Q-COMMS-01-1).
  { href: "/comunicacoes/lembretes-sms", label: s["remindersLog.nav"], capability: "reminders:log_read" },
  // T5 F4 (guide finding, #1462): the SMS reply review queue. Reception, admin
  // and owner hold `sms_replies:read` and could open the page, but nothing
  // linked to it. It keeps its original URL, like Recuperação: the page and its
  // tests name it. A therapist does not hold the capability and gets no tab.
  { href: "/reminders/review", label: s["remindersReview.nav"], capability: "sms_replies:read" },
  // SAT-01 (spec 7.3, copy text 36): the list of survey sends and their answers.
  // Every staff role holds the capability; migration 0102's policies decide the
  // rows. LAST, so no existing section moves and /comunicacoes still lands
  // where it did.
  //
  // IT DOES NOT EXIST WHILE THE SURVEY IS SWITCHED OFF (owner, 2026-10-12: staff
  // see nothing new). `exists` takes it out of all three readers at once, and
  // the page answers a direct visit as an address that is not there.
  { href: SURVEY_LIST_HREF, label: s["surveyList.nav"], capability: "surveys:read", exists: surveyVisible },
];

/**
 * The sections that exist in this deployment right now, in group order. Every
 * reader starts here, so a section that is switched off is in no entry, no
 * redirect and no tab bar.
 */
export function commsSectionsThatExist(): CommsSection[] {
  return COMMS_SECTIONS.filter((c) => (c.exists ? c.exists() : true));
}

/** The sections this role may open, in group order. */
export function commsSectionsForRole(role: Role): CommsSection[] {
  return commsSectionsThatExist().filter((c) => can(role, c.capability));
}
