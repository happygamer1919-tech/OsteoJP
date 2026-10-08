/**
 * THE TWO COUNTS ON LEMBRETES SMS, AS RECEPTION READS THEM.
 *
 * `page.tsx` reads the request and redirects, so it cannot be rendered. It
 * hands the block its numbers, and the block is rendered here with the real
 * dictionary. What is pinned is what it SAYS: which number sits beside which
 * channel under which sentence, and that a failed read is said in words.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getStrings, LOCALES } from "@osteojp/i18n";

import { s } from "@/lib/i18n";

import { ReminderNumbersBlock } from "./reminder-numbers-block";

/** The inner text of the one element carrying this test id. */
function slot(html: string, testId: string): string | null {
  const m = new RegExp(`<(\\w+)[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html);
  return m ? m[2]!.replace(/<[^>]+>/g, "").replace(/<!-- -->/g, "") : null;
}

/** Markup to the text a reader gets. */
function text(html: string): string {
  return html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Four different numbers, so a value under the wrong sentence or beside the
// wrong channel cannot pass.
const NUMBERS = {
  sms: { marksWithoutClaim: 7, claimsWithoutOutcome: 3 },
  email: { marksWithoutClaim: 5, claimsWithoutOutcome: 11 },
};

describe("the Lembretes SMS counts block", () => {
  it("prints each count beside its channel, under the sentence that says what it counts", () => {
    const html = renderToStaticMarkup(<ReminderNumbersBlock numbers={NUMBERS} />);

    expect(slot(html, "reminder-numbers-unclaimed-sms")).toBe("7");
    expect(slot(html, "reminder-numbers-unclaimed-email")).toBe("5");
    expect(slot(html, "reminder-numbers-no-outcome-sms")).toBe("3");
    expect(slot(html, "reminder-numbers-no-outcome-email")).toBe("11");

    const page = text(html);
    expect(page).toContain(s["remindersLog.numbersTitle"]);
    expect(page).toContain(`${s["remindersLog.numbersUnclaimed"]} SMS: 7 · Email: 5`);
    expect(page).toContain(`${s["remindersLog.numbersNoOutcome"]} SMS: 3 · Email: 11`);
    expect(page).toContain(s["remindersLog.numbersNote"]);
    expect(page).not.toContain(s["remindersLog.numbersUnavailable"]);
  });

  it("a zero is printed as 0, not left blank", () => {
    const html = renderToStaticMarkup(
      <ReminderNumbersBlock
        numbers={{
          sms: { marksWithoutClaim: 0, claimsWithoutOutcome: 0 },
          email: { marksWithoutClaim: 0, claimsWithoutOutcome: 0 },
        }}
      />,
    );
    for (const id of ["unclaimed-sms", "unclaimed-email", "no-outcome-sms", "no-outcome-email"]) {
      expect(slot(html, `reminder-numbers-${id}`), id).toBe("0");
    }
  });

  it("a first count nobody could make is said in words on its own line, and the second count keeps its numbers", () => {
    // No send attempt on record in seven days: number one is null on both
    // channels (reminder-numbers.ts). A zero here would read as "nothing was
    // missed" on the very day nothing was being recorded.
    const html = renderToStaticMarkup(
      <ReminderNumbersBlock
        numbers={{
          sms: { marksWithoutClaim: null, claimsWithoutOutcome: 3 },
          email: { marksWithoutClaim: null, claimsWithoutOutcome: 11 },
        }}
      />,
    );
    expect(slot(html, "reminder-numbers-unclaimed-not-counted")).toBe(s["remindersLog.numbersNotCounted"]);
    expect(html).not.toContain('data-testid="reminder-numbers-unclaimed-sms"');
    expect(html).not.toContain('data-testid="reminder-numbers-unclaimed-email"');
    // The first line carries its sentence and then the words, never "SMS: 0".
    expect(text(html)).toContain(`${s["remindersLog.numbersUnclaimed"]} ${s["remindersLog.numbersNotCounted"]}`);
    expect(slot(html, "reminder-numbers-no-outcome-sms")).toBe("3");
    expect(slot(html, "reminder-numbers-no-outcome-email")).toBe("11");
    expect(html).not.toContain('data-testid="reminder-numbers-no-outcome-not-counted"');
  });

  it("with the first count made, the not-counted sentence is absent", () => {
    const html = renderToStaticMarkup(<ReminderNumbersBlock numbers={NUMBERS} />);
    expect(text(html)).not.toContain(s["remindersLog.numbersNotCounted"]);
  });

  it("a read that failed is said in words, and shows no number at all", () => {
    const html = renderToStaticMarkup(<ReminderNumbersBlock numbers={null} />);
    expect(slot(html, "reminder-numbers-unavailable")).toBe(s["remindersLog.numbersUnavailable"]);
    expect(html).not.toContain('data-testid="reminder-numbers-unclaimed"');
    expect(html).not.toContain('data-testid="reminder-numbers-no-outcome"');
    // No digit anywhere: a zero here would read as "nothing was missed".
    expect(text(html)).not.toMatch(/\d/);
  });

  it("every sentence it prints exists in both languages", () => {
    const keys = [
      "remindersLog.numbersTitle",
      "remindersLog.numbersUnclaimed",
      "remindersLog.numbersNoOutcome",
      "remindersLog.numbersChannelSms",
      "remindersLog.numbersChannelEmail",
      "remindersLog.numbersNote",
      "remindersLog.numbersNotCounted",
      "remindersLog.numbersUnavailable",
    ] as const;
    expect(LOCALES.length).toBeGreaterThan(1);
    for (const locale of LOCALES) {
      const dict = getStrings(locale);
      for (const key of keys) {
        expect(dict[key], `${locale} ${key}`).toBeTruthy();
        // House rule: no em dash and no en dash in copy.
        expect(dict[key], `${locale} ${key}`).not.toMatch(/[\u2013\u2014]/);
      }
    }
    // The two sentences say what they count in the words the counts use.
    const pt = getStrings("pt");
    expect(pt["remindersLog.numbersUnclaimed"]).toContain("30 minutos");
    expect(pt["remindersLog.numbersNoOutcome"]).toContain("30 minutos");
    expect(pt["remindersLog.numbersNoOutcome"]).toContain("7 dias");
    expect(pt["remindersLog.numbersNotCounted"]).toContain("7 dias");
  });
});
