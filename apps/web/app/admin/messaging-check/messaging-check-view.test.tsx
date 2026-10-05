/**
 * THE SCREEN "TESTE DE ENVIO", AS THE OWNER READS IT.
 *
 * The owner asked for one thing: that the screen make clear what it is for.
 * So what is pinned here is what it SAYS, in Portuguese and in English, in
 * each of its states - not how it is built.
 *
 * `page.tsx` reads the request and redirects, so it cannot be rendered. It
 * gathers answers and hands them to `MessagingCheckView`, which is rendered
 * here with the real dictionaries and the real preview code.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getStrings, LOCALES, type Locale, type StringKey } from "@osteojp/i18n";
import { RULES } from "@osteojp/rate-limit";

import {
  MESSAGING_CHECK_PREVIEW_CODE,
  previewMessagingCheck,
  type MessagingCheckPreview,
} from "@/lib/reminders/messaging-check-body";
import { MESSAGING_CHECK_REFUSALS } from "@/lib/reminders/messaging-check-reasons";

import { MessagingCheckView, type MessagingCheckViewProps } from "./messaging-check-view";
import { messagingCheckOutcome, REFUSAL_SENTENCE } from "./outcome";

const HERE = dirname(fileURLToPath(import.meta.url));
const P = "admin.messagingCheck.";
const k = (name: string) => `${P}${name}` as StringKey;

/** `.invalid` is reserved (RFC 2606): no test names a host that could answer. */
const ENV = { REMINDERS_RESCHEDULE_BASE_URL: "https://app.x.invalid", TWILIO_SMS_FROM: "OsteoJP" };
const READY = previewMessagingCheck(ENV);
const LIMIT = RULES.messagingCheck.limit;
const TECH = {
  confirmLink: "TECH-LINE-ABOUT-THE-CONFIRM-LINK",
  reply: "TECH-LINE-ABOUT-THE-REPLY-LINE",
};

function render(locale: Locale, over: Partial<MessagingCheckViewProps> = {}): string {
  return renderToStaticMarkup(
    <MessagingCheckView
      s={getStrings(locale)}
      action={async () => undefined}
      outcome={{ kind: "idle" }}
      preview={READY}
      armed
      attemptLimit={LIMIT}
      sender={{ label: "OsteoJP", isNumber: false }}
      replyArmed={false}
      tech={TECH}
      {...over}
    />,
  );
}

/** Markup to the text a reader gets: tags out, the five entities back. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** The inner text of the one element carrying this test id, entities decoded. */
function slot(html: string, testId: string): string | null {
  const m = new RegExp(`<(\\w+)[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html);
  if (!m) return null;
  return m[2]
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );

describe("what the screen is for, at the top, in both languages", () => {
  for (const locale of LOCALES) {
    const s = getStrings(locale);

    it(`${locale}: states its purpose, in the first paragraph after the heading`, () => {
      const html = render(locale);
      expect(slot(html, "messaging-check-purpose")).toBe(s[k("help")]);
      // Under the heading and above every panel: it is the first thing read.
      expect(html.indexOf('data-testid="messaging-check-purpose"')).toBeLessThan(
        html.indexOf("<h3"),
      );
      expect(html.indexOf("<h2")).toBeLessThan(html.indexOf('data-testid="messaging-check-purpose"'));
    });

    it(`${locale}: says what it does, what it does NOT, who may use it, and what it costs`, () => {
      const page = text(render(locale));
      for (const name of [
        "doesTitle",
        "doesBody",
        "doesNotTitle",
        "doesNotBody",
        "doesNotCaveat",
        "whoTitle",
        "whoBody",
        "costTitle",
        "auditTitle",
        "auditBody",
      ]) {
        expect(page, name).toContain(s[k(name)]);
      }
      // The cost sentence carries the limit the action enforces, not a number
      // typed into a string.
      expect(page).toContain(fill(s[k("costBody")], { limit: LIMIT }));
      expect(s[k("costBody")]).toContain("{limit}");
    });

    it(`${locale}: leaves no unfilled slot on the screen, in any state`, () => {
      const states: Partial<MessagingCheckViewProps>[] = [
        {},
        { armed: false },
        { outcome: { kind: "sent", length: 157, segments: 1, live: false } },
        { outcome: { kind: "sent", length: 157, segments: 1, live: true } },
        { outcome: { kind: "sent", length: null, segments: null, live: false } },
        { outcome: messagingCheckOutcome({ m: "limited" }) },
        { preview: previewMessagingCheck({ ...ENV, TWILIO_SMS_FROM: "+351900000000" }) },
        { preview: previewMessagingCheck({ TWILIO_SMS_FROM: "OsteoJP" }) },
      ];
      for (const over of states) {
        expect(text(render(locale, over))).not.toMatch(/\{\w+\}/);
      }
    });
  }

  it("the Portuguese purpose says the four facts an owner needs, in plain words", () => {
    // Not a second copy of the string: the facts it must not lose in a rewrite.
    const purpose = getStrings("pt")[k("help")];
    expect(purpose).toMatch(/SMS real/);
    expect(purpose).toMatch(/lembrete das 24 horas/);
    expect(purpose).toMatch(/dados de exemplo/);
    expect(purpose).toMatch(/telemóvel/);
  });

  it("the tab keeps its name", () => {
    expect(getStrings("pt")[k("title")]).toBe("Teste de envio");
    expect(render("pt")).toContain('<h2 class="text-xl text-v2-text-primary">Teste de envio</h2>');
  });
});

describe("the message is shown before it is sent, from the send's own code", () => {
  it("shows the body exactly, line breaks included", () => {
    if (!READY.ok) throw new Error("unreachable");
    // Byte for byte, and `messaging-check-body.test.ts` proves this same value
    // is what the send hands to the transport.
    expect(slot(render("pt"), "messaging-check-preview")).toBe(READY.body);
    expect(READY.body.split("\n").length).toBeGreaterThan(3);
  });

  for (const locale of LOCALES) {
    it(`${locale}: prints the character count and the segment count`, () => {
      if (!READY.ok) throw new Error("unreachable");
      const s = getStrings(locale);
      expect(slot(render(locale), "messaging-check-preview-count")).toBe(
        fill(s[k("previewCount")], {
          length: READY.length,
          limit: READY.limit,
          segments: READY.segments,
        }),
      );
    });

    it(`${locale}: says what the placeholder is and that the details are samples`, () => {
      const s = getStrings(locale);
      const page = text(render(locale));
      expect(page).toContain(fill(s[k("previewCodeNote")], { code: MESSAGING_CHECK_PREVIEW_CODE }));
      expect(page).toContain(s[k("previewSampleNote")]);
    });

    it(`${locale}: DISARMED, shows no body, says why, and disables the button with a reason`, () => {
      const s = getStrings(locale);
      const html = render(locale, { armed: false });
      expect(slot(html, "messaging-check-preview")).toBeNull();
      expect(slot(html, "messaging-check-preview-none")).toBe(s[k("previewDisarmed")]);
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="messaging-check-send"/);
      expect(slot(html, "messaging-check-send-note")).toBe(s[k("disabledNote")]);
      expect(slot(html, "messaging-check-link-state")).toBe(s[k("confirmLinkOff")]);
    });

    it(`${locale}: a body the renderer would refuse is not shown as sendable`, () => {
      const s = getStrings(locale);
      const tooLong = previewMessagingCheck({ ...ENV, TWILIO_SMS_FROM: "+351900000000" });
      if (tooLong.ok) throw new Error("unreachable");
      const html = render(locale, { preview: tooLong });
      expect(slot(html, "messaging-check-preview")).toBeNull();
      expect(slot(html, "messaging-check-preview-refused")).toBe(
        fill(s[k("previewTooLong")], { length: tooLong.length ?? "?", limit: tooLong.limit }),
      );
      // The renderer's own sentence is there for whoever configures sending.
      expect(text(html)).toContain(tooLong.refusal);

      const noOrigin = previewMessagingCheck({ TWILIO_SMS_FROM: "OsteoJP" });
      expect(slot(render(locale, { preview: noOrigin }), "messaging-check-preview-refused")).toBe(
        s[k("previewNoOrigin")],
      );

      const notGsm7: MessagingCheckPreview = {
        ok: false,
        kind: "not_gsm7",
        length: 120,
        limit: 160,
        refusal: "TECH-LINE-ABOUT-THE-BODY",
      };
      expect(slot(render(locale, { preview: notGsm7 }), "messaging-check-preview-refused")).toBe(
        s[k("previewNotGsm7")],
      );
    });
  }

  it("ARMED, the button is enabled and named for what it does", () => {
    const html = render("pt");
    const button = /<button[^>]*data-testid="messaging-check-send"[^>]*>/.exec(html)?.[0] ?? "";
    expect(button).toContain('type="submit"');
    // The attribute, not the word: the button's classes name a `disabled:` style.
    expect(button).not.toContain('disabled=""');
    expect(slot(html, "messaging-check-send")).toBe("Enviar mensagem de teste");
    expect(slot(html, "messaging-check-send-note")).toBe(getStrings("pt")[k("sendNote")]);
  });
});

describe("every state is said in a sentence", () => {
  it("IDLE: the result region is there and empty", () => {
    const html = render("pt");
    expect(html).toContain(
      '<div data-testid="messaging-check-result" data-state="idle" role="status" aria-live="polite" aria-atomic="true"></div>',
    );
  });

  for (const locale of LOCALES) {
    const s = getStrings(locale);

    it(`${locale}: SENT says it went, how long it was, and what to look for on the handset`, () => {
      const html = render(locale, {
        outcome: messagingCheckOutcome({ m: "sent", len: "157", live: "0" }),
      });
      const result = slot(html, "messaging-check-result") ?? "";
      expect(html).toContain('data-state="sent"');
      expect(result).toContain(s[k("sent")]);
      expect(result).toContain(s[k("sentAccepted")]);
      expect(result).toContain(fill(s[k("sentLength")], { length: 157, limit: 160, segments: 1 }));
      expect(result).toContain(s[k("sentLookTitle")]);
      expect(result).toContain(fill(s[k("sentLookSender")], { sender: "OsteoJP" }));
      expect(result).toContain(s[k("sentLookBody")]);
      // A sample code: the link opens the generic page, named by its own title.
      expect(slot(html, "messaging-check-sent-link")).toBe(
        fill(s[k("sampleCode")], { page: s["reschedule.invalidTitle"] }),
      );
    });

    it(`${locale}: SENT WITH A LIVE CODE says the link really confirms the appointment`, () => {
      const html = render(locale, {
        outcome: messagingCheckOutcome({ m: "sent", len: "157", live: "1" }),
      });
      expect(slot(html, "messaging-check-sent-link")).toBe(
        fill(s[k("liveCode")], {
          confirm: s["confirm.confirmCta"],
          reschedule: s["confirm.rescheduleCta"],
        }),
      );
    });

    // THE GUARD. One arm per reason the send can refuse with, generated from
    // the closed list, plus the action's own rate-limit marker.
    for (const reason of [...MESSAGING_CHECK_REFUSALS, "limited"]) {
      it(`${locale}: REFUSED (${reason}) is a sentence, and the code is not on the screen`, () => {
        const outcome = messagingCheckOutcome({ m: reason, d: "DETAIL-FROM-THE-URL" });
        expect(outcome.kind).toBe("refused");
        if (outcome.kind !== "refused") throw new Error("unreachable");

        const sentence = s[outcome.sentence];
        expect(sentence, `${reason} has no ${locale} sentence`).toBeTruthy();
        // A sentence of its own, not the fallback for an unknown marker.
        expect(sentence).not.toBe(s[k("failed")]);
        expect(sentence.length).toBeGreaterThan(30);

        const html = render(locale, { outcome });
        expect(html).toContain('data-state="refused"');
        const shown = fill(sentence, { limit: LIMIT });
        const result = text(slot(html, "messaging-check-result") ?? "");
        expect(result).toContain(shown);
        // NO RAW CODE. In the result, nothing but the sentence may name it
        // ("landline" is also an English word, and the sentence may use it).
        expect(result.replace(shown, "")).not.toContain(reason);
        // And a code with an underscore is no word in either language, so it
        // must be nowhere on the page at all.
        if (reason.includes("_")) expect(html).not.toContain(reason);
      });
    }

    it(`${locale}: an UNKNOWN marker reads as not sent, and is never printed`, () => {
      const html = render(locale, {
        outcome: messagingCheckOutcome({ m: "zz_not_a_reason", d: "DETAIL-FROM-THE-URL" }),
      });
      expect(slot(html, "messaging-check-result")).toBe(s[k("failed")]);
      expect(html).not.toContain("zz_not_a_reason");
      expect(html).not.toContain("DETAIL-FROM-THE-URL");
    });
  }

  it("every refusal reason has a sentence key, and the keys exist in both dictionaries", () => {
    // The table is typed as a Record over the list, so a missing reason does
    // not compile. This is the same guard at run time: it fails if the table
    // and the list are ever made to disagree by a cast.
    expect(Object.keys(REFUSAL_SENTENCE).sort()).toEqual([...MESSAGING_CHECK_REFUSALS].sort());
    for (const reason of MESSAGING_CHECK_REFUSALS) {
      for (const locale of LOCALES) {
        expect(getStrings(locale)[REFUSAL_SENTENCE[reason]], `${reason}/${locale}`).toBeTruthy();
      }
    }
  });

  it("no two different refusals share a sentence", () => {
    const pt = getStrings("pt");
    const sentences = MESSAGING_CHECK_REFUSALS.map((r) => pt[REFUSAL_SENTENCE[r]]);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it("the technical detail is printed UNDER its sentence, and only where it explains something", () => {
    const pt = getStrings("pt");
    const withDetail = (reason: string) =>
      slot(
        render("pt", { outcome: messagingCheckOutcome({ m: reason, d: "DETAIL-FROM-THE-URL" }) }),
        "messaging-check-result",
      ) ?? "";

    for (const reason of ["send_failed", "body_refused"]) {
      const result = withDetail(reason);
      expect(result).toContain(pt[k("detailLabel")]);
      expect(result.indexOf(pt[REFUSAL_SENTENCE[reason as "send_failed"]])).toBeLessThan(
        result.indexOf("DETAIL-FROM-THE-URL"),
      );
    }
    // Every other refusal is fully said by its sentence; a `d` typed onto the
    // URL by hand is not echoed back.
    for (const reason of MESSAGING_CHECK_REFUSALS.filter(
      (r) => r !== "send_failed" && r !== "body_refused",
    )) {
      expect(withDetail(reason), reason).not.toContain("DETAIL-FROM-THE-URL");
    }
  });

  it("a length on the URL that is not a number is not printed", () => {
    for (const len of ["abc", "-5", "0", "99999", "<b>"]) {
      const outcome = messagingCheckOutcome({ m: "sent", len });
      expect(outcome).toEqual({ kind: "sent", length: null, segments: null, live: false });
    }
    const result = slot(
      render("pt", { outcome: messagingCheckOutcome({ m: "sent", len: "abc" }) }),
      "messaging-check-result",
    );
    expect(result).toContain("Enviada. Veja o telemóvel.");
    expect(result).not.toContain("abc");
  });
});

describe("the form: labels, help and the contract with the action", () => {
  const html = render("pt");

  it("each field has a label tied to it and help tied to it", () => {
    for (const [name, id] of [
      ["phone", "messaging-check-phone"],
      ["appointmentId", "messaging-check-appointment"],
    ]) {
      const input = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? "";
      expect(input, id).toContain(`name="${name}"`);
      expect(html).toContain(`<label for="${id}"`);
      const describedBy = /aria-describedby="([^"]+)"/.exec(input)?.[1];
      expect(describedBy).toBeTruthy();
      expect(html).toMatch(new RegExp(`<(p|div) id="${describedBy}"`));
    }
  });

  it("the phone field says the format expected, and is required", () => {
    const pt = getStrings("pt");
    const input = /<input[^>]*id="messaging-check-phone"[^>]*>/.exec(html)?.[0] ?? "";
    expect(input).toContain('type="tel"');
    expect(input).toContain('required=""');
    expect(input).toContain(`placeholder="${pt[k("phonePlaceholder")]}"`);
    expect(text(html)).toContain(pt[k("phoneLabel")]);
    expect(text(html)).toContain(pt[k("phoneHelp")]);
  });

  it("the appointment field says what an id does, in the same breath as the field", () => {
    const pt = getStrings("pt");
    expect(text(html)).toContain(pt[k("appointmentHelp")]);
    const help = fill(pt[k("appointmentWarning")], { idLabel: pt["appointment.idLabel"] });
    expect(text(html)).toContain(help);
    // The three consequences, each of which is true of the code today.
    expect(help).toMatch(/confirmar essa consulta/);
    expect(help).toMatch(/único código/);
    expect(help).toMatch(/pedido online ainda por aceitar é recusado/);
    // And it is optional: an empty field is the ordinary test.
    const input = /<input[^>]*id="messaging-check-appointment"[^>]*>/.exec(html)?.[0] ?? "";
    expect(input).not.toContain("required");
  });

  it("the send button is described by the note beside it", () => {
    const button = /<button[^>]*data-testid="messaging-check-send"[^>]*>/.exec(html)?.[0] ?? "";
    const describedBy = /aria-describedby="([^"]+)"/.exec(button)?.[1];
    expect(describedBy).toBe("messaging-check-send-note");
    expect(html).toContain(`<p id="${describedBy}"`);
  });

  it("reads in order: result, purpose, facts, message, form, sender", () => {
    const at = (needle: string) => {
      const i = html.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const pt = getStrings("pt");
    const order = [
      at('data-testid="messaging-check-result"'),
      at('data-testid="messaging-check-purpose"'),
      at(pt[k("factsTitle")]),
      at('data-testid="messaging-check-preview"'),
      at('id="messaging-check-phone"'),
      at('id="messaging-check-appointment"'),
      at('data-testid="messaging-check-send"'),
      at('data-testid="messaging-check-sender"'),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("the sender panel", () => {
  it("shows the sender, the reply line and the link state in Portuguese, and the operator lines behind a disclosure", () => {
    const pt = getStrings("pt");
    const html = render("pt");
    expect(slot(html, "messaging-check-sender")).toBe("OsteoJP");
    expect(slot(html, "messaging-check-reply-state")).toBe(pt[k("replyDisarmed")]);
    expect(slot(html, "messaging-check-link-state")).toBe(pt[k("confirmLinkOn")]);
    expect(slot(html, "messaging-check-sender-warning")).toBeNull();

    const details = /<details[\s\S]*<\/details>/.exec(html)?.[0] ?? "";
    expect(details).toContain(pt[k("techTitle")]);
    expect(details).toContain(TECH.confirmLink);
    expect(details).toContain(TECH.reply);
    // The English operator lines are nowhere else on the screen.
    expect(html.replace(details, "")).not.toContain("TECH-LINE");
  });

  it("warns when the sender is a NUMBER", () => {
    const pt = getStrings("pt");
    const html = render("pt", {
      sender: { label: "numero terminado em 0000", isNumber: true },
      replyArmed: true,
    });
    expect(slot(html, "messaging-check-sender-warning")).toBe(pt[k("senderWarning")]);
    expect(slot(html, "messaging-check-reply-state")).toBe(pt[k("replyArmed")]);
  });
});

describe("the copy keeps the house rules", () => {
  const keys = (Object.keys(getStrings("pt")) as StringKey[]).filter((key) => key.startsWith(P));

  it("there are strings to check", () => {
    expect(keys.length).toBeGreaterThan(50);
  });

  it("no dash used as punctuation and no emoji, in either language", () => {
    for (const locale of LOCALES) {
      const s = getStrings(locale);
      for (const key of keys) {
        expect(s[key], `${locale} ${key}`).not.toMatch(/[‒-―]/);
        expect(s[key], `${locale} ${key}`).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(s[key].trim(), `${locale} ${key}`).not.toBe("");
      }
    }
  });

  it("the two languages fill the same slots", () => {
    const slots = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const pt = getStrings("pt");
    const en = getStrings("en");
    for (const key of keys) expect(slots(en[key]), key).toEqual(slots(pt[key]));
  });

  it("the view has no visible text of its own: every word comes from a key", () => {
    // Text between tags in the source that is not an expression. The only
    // literals allowed are whitespace.
    const source = readFileSync(join(HERE, "messaging-check-view.tsx"), "utf8");
    const jsx = source.slice(source.indexOf("export function MessagingCheckView"));
    const literals = [...jsx.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g)]
      .map((m) => m[1].trim())
      // Arrow functions and generics in the code around the JSX.
      .filter((t) => !/[=;()]/.test(t));
    expect(literals).toEqual([]);
    expect(jsx).not.toMatch(/placeholder="/);
  });
});

describe("the permission check is unchanged", () => {
  const page = readFileSync(join(HERE, "page.tsx"), "utf8");
  const action = readFileSync(join(HERE, "actions.ts"), "utf8");
  const layout = readFileSync(join(HERE, "../layout.tsx"), "utf8");
  const LOGIN = 'if (!actor) redirect("/login");';
  const OWNER = 'if (actor.role !== "owner") redirect("/dashboard");';

  it("the page still sends a signed-out visitor to login and anybody but the owner away", () => {
    expect(page).toContain(LOGIN);
    expect(page).toContain(OWNER);
    // Before it reads anything it would show.
    expect(page.indexOf(OWNER)).toBeLessThan(page.indexOf("await searchParams"));
    expect(page.indexOf(OWNER)).toBeLessThan(page.indexOf("previewMessagingCheck()"));
  });

  it("the action still re-checks the owner, then the limit, then sends: in that order", () => {
    expect(action).toContain(LOGIN);
    expect(action).toContain(OWNER);
    const owner = action.indexOf(OWNER);
    const limit = action.indexOf("await checkDurableRateLimit(");
    const send = action.indexOf("await sendMessagingCheck(");
    expect(owner).toBeGreaterThan(-1);
    expect(owner).toBeLessThan(limit);
    expect(limit).toBeLessThan(send);
    expect(action).toContain("RULES.messagingCheck,");
  });

  it("the view cannot gate anything: it holds no role, no redirect and no request", () => {
    const view = readFileSync(join(HERE, "messaging-check-view.tsx"), "utf8");
    expect(view).not.toMatch(
      /redirect\(|getRequestContext|actor\.role|next\/headers|import "server-only"|process\.env/,
    );
  });

  it("the tab is still offered to the owner alone", () => {
    expect(layout).toContain('actor.role === "owner"');
    expect(layout).toContain('{ href: "/admin/messaging-check", label: s["admin.messagingCheck.title"] }');
  });
});
