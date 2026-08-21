import { describe, expect, it } from "vitest";

import { whatsappLink, smsLink, mailtoLink, followupMessage } from "./deep-links";

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
