import { describe, expect, it } from "vitest";

import { whatsappLink, smsLink, mailtoLink, followupMessage } from "./deep-links";
// THE REAL DICTIONARY THROUGH THE REAL ACCESSOR, not a fixture and not a
// deep import into the package's files. A test that pinned its own copy of the
// body would go green while the shipped string lost its accents, which is the
// exact failure this block exists to catch; and `getStrings` is the same
// function `apps/web/lib/i18n.ts` calls, so this reads what the screen reads.
import { getStrings } from "@osteojp/i18n";

/**
 * RB-01 — the deep links, which are the only lines of this feature whose
 * failure is INVISIBLE.
 *
 * A malformed link does not throw and does not show an error: WhatsApp opens on
 * a blank chat, the receptionist shrugs and types the message by hand, and
 * nobody reports it. So the shapes are pinned here rather than trusted to
 * review.
 */

describe("whatsappLink", () => {
  it("strips the leading + , because wa.me opens a BLANK chat with one", () => {
    expect(whatsappLink("+351912345678", "olá")).toBe(
      "https://wa.me/351912345678?text=ol%C3%A1",
    );
  });

  it("percent-encodes the message, so a & or a # cannot truncate it", () => {
    const url = whatsappLink("+351912345678", "marcação? sim & obrigado #1");
    expect(url).toContain("text=marca%C3%A7%C3%A3o%3F%20sim%20%26%20obrigado%20%231");
    // The whole message survives: one `?`, and no bare `&` or `#` to split on.
    expect(url.split("?")).toHaveLength(2);
  });
});

describe("smsLink", () => {
  it("uses ?&body= so ONE link works on both iOS and Android", () => {
    // iOS expects `&body=`, Android expects `?body=`. `?&body=` satisfies both,
    // and getting this wrong loses the prefilled text on one platform only —
    // which is exactly the kind of defect that survives testing on one phone.
    expect(smsLink("+351912345678", "olá")).toBe("sms:+351912345678?&body=ol%C3%A1");
  });

  it("keeps the + , unlike wa.me", () => {
    expect(smsLink("+351912345678", "x")).toContain("sms:+351912345678");
  });
});

describe("mailtoLink", () => {
  it("encodes subject and body separately", () => {
    expect(mailtoLink("a@b.pt", "OsteoJP", "olá & adeus")).toBe(
      "mailto:a%40b.pt?subject=OsteoJP&body=ol%C3%A1%20%26%20adeus",
    );
  });
});

describe("followupMessage", () => {
  const TEMPLATE = "Bom dia {name}, desde {date}.";

  it("uses the FIRST name only", () => {
    // "Bom dia Maria" is how a receptionist speaks. The full legal name reads
    // like a debt collector, which is the opposite of this message's purpose.
    expect(followupMessage(TEMPLATE, "Maria Silva Santos", "01/07/2026")).toBe(
      "Bom dia Maria, desde 01/07/2026.",
    );
  });

  it("survives a single-word name and stray whitespace", () => {
    expect(followupMessage(TEMPLATE, "  Ana  ", "01/07/2026")).toBe(
      "Bom dia Ana, desde 01/07/2026.",
    );
  });

  it("substitutes BOTH placeholders", () => {
    // A `.replace` chain that missed one would leave a literal "{date}" in a
    // message sent to a patient.
    const out = followupMessage(TEMPLATE, "Ana", "01/07/2026");
    expect(out).not.toContain("{");
  });
});

/**
 * ==========================================================================
 * THE pt-PT BODY CARRIES ITS ACCENTS, AND A FUTURE EDIT CANNOT STRIP THEM.
 * ==========================================================================
 * WHY THIS EXISTS. Ivan's RB-01 step C observation, transcribed on 2026-08-28,
 * read "Notamos que ja nao ... queriamos ... esta ... e so" — with no accents.
 * A dispatch followed asking for the screen to be corrected before the copy
 * went to Rodica.
 *
 * THE SCREEN WAS ALREADY CORRECT. The committed literal has carried all seven
 * accents since the commit that created the feature, `git log -S` finds the
 * unaccented form has NEVER existed in that file, and every step of the path
 * preserves them — `getStrings` is a dictionary lookup, `followupMessage` is
 * two `.replace()` calls, and the three link builders `encodeURIComponent`,
 * which round-trips byte for byte. There is no normalizer, no NFD and no
 * transliteration anywhere on it.
 *
 * So nothing was corrected, and this is what the dispatch's real value was:
 * A CHECK THAT RUNS FOREVER instead of one that ran once. Accents are the
 * easiest thing in a dictionary to lose silently — a copy-paste through a
 * terminal, an editor writing latin-1, a "tidy up the strings" commit — and
 * losing them produces a message that is merely a bit wrong, which nobody
 * reports.
 *
 * IT PINS THE WORDS, NOT THE WHOLE SENTENCE. Asserting the full literal would
 * fail on any wording change, which is Rodica's to make and is not this test's
 * business. Each accented WORD is asserted, so the diacritics are protected and
 * the copy stays hers.
 */
describe("the pt-PT recovery body keeps its European Portuguese accents", () => {
  const BODY = getStrings("pt")["followup.messageTemplate"];

  it.each([
    ["Notámos", "á"],
    ["já", "á"],
    ["não", "ã"],
    ["queríamos", "í"],
    ["está", "á"],
    ["é", "é"],
    ["só", "ó"],
  ])("contains %s", (word) => {
    expect(BODY).toContain(word);
  });

  it("carries exactly seven accented characters, so one lost is caught", () => {
    // A count as well as the words. A future wording change that drops a clause
    // would still satisfy every `toContain` above for the clauses it kept.
    const accented = [...BODY].filter((c) => c.charCodeAt(0) > 127);
    expect(accented.join(" ")).toBe("á á ã í á é ó");
  });

  it("is precomposed NFC, not a base letter plus a combining mark", () => {
    // THE FAILURE THAT LOOKS IDENTICAL ON SCREEN. "á" as U+0061 U+0301 renders
    // the same and is a different string: it would break `toContain("Notámos")`
    // for a reader who could see no difference, and it changes the byte length
    // that decides SMS segmentation.
    expect(BODY.normalize("NFC")).toBe(BODY);
  });

  it("the accents survive composition and URL-encoding, end to end", () => {
    // The whole path in one assertion, because the literal being right is not
    // the same claim as the patient receiving it right.
    const composed = followupMessage(BODY, "Maria João Silva", "19/08/2026");
    expect(composed).toContain("Notámos");
    expect(composed).toContain("está");
    const encoded = whatsappLink("+351913111001", composed).split("?text=")[1] ?? "";
    expect(decodeURIComponent(encoded)).toBe(composed);
  });
});
