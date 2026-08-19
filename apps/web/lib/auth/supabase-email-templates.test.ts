import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The Supabase Auth email bodies are pt-PT, and stay pt-PT.
 *
 * WHY A TEST FOR FILES THE APP NEVER IMPORTS. These templates are rendered by
 * Supabase from DASHBOARD-side configuration, which no PR can review and no
 * deployment carries. `supabase/templates/` is the committed source of truth
 * for what the dashboard should hold; this suite is what keeps that source
 * honest, because the only alternative is a comment claiming it is correct.
 *
 * IT CANNOT PROVE THE DASHBOARD MATCHES. Nothing in this repo can. What it
 * proves is that the text we hand the owner to paste is pt-PT, carries the
 * GoTrue variable each template actually needs, and never quietly reverts to
 * Supabase's English stock copy — which is what arrived in Ivan's inbox on
 * 2026-08-05 and started this work.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const DIR = join(REPO_ROOT, "supabase", "templates");

/** Template file → the GoTrue variable it MUST interpolate. */
const REQUIRED_VARIABLE: Record<string, string> = {
  "confirm-signup.html": "{{ .ConfirmationURL }}",
  "magic-link.html": "{{ .ConfirmationURL }}",
  "change-email.html": "{{ .ConfirmationURL }}",
  // INVITE AND RESET ARE NOT ConfirmationURL, AND HAVE NOT BEEN SINCE #837.
  // LE-auth-recovery-deadend moved both off GoTrue's /auth/v1/verify link and
  // onto `?token_hash={{ .TokenHash }}&type=...` pointing at our own INERT
  // landing page, because the old shape was spent by a mail scanner in transit -
  // it failed five times before the shape changed. These two entries said
  // ConfirmationURL for eight days after that and the suite stayed green,
  // because the string survived in the comment warning against it.
  "invite.html": "{{ .TokenHash }}",
  "reset-password.html": "{{ .TokenHash }}",
  // Reauthentication is a CODE, not a link: GoTrue sends {{ .Token }} and there
  // is no URL to follow. A ConfirmationURL here would render empty.
  "reauthentication.html": "{{ .Token }}",
};

/**
 * Supabase's stock English bodies, verbatim fragments. These are the exact
 * strings that arrive when a template is left at its default, so finding one
 * means the pt-PT body was reverted or never applied.
 */
const STOCK_ENGLISH = [
  "Follow this link",
  "Follow the link below",
  "Confirm your mail",
  "Confirm your signup",
  "Reset Password",
  "Your Magic Link",
  "You have been invited",
  "Change Email Address",
  "Confirm Reauthentication",
  "Enter the code",
];

const files = readdirSync(DIR).filter((f) => f.endsWith(".html")).sort();
const read = (f: string) => readFileSync(join(DIR, f), "utf-8");

/**
 * The template body with HTML COMMENTS REMOVED.
 *
 * WHY THIS EXISTS, and it is the whole of LE-vacuous-template-guard. The
 * required-variable assertion below read the RAW file, so a template that no
 * longer interpolates its variable still passed as long as the string survived
 * anywhere in the bytes - including inside the comment WARNING AGAINST USING IT.
 *
 * That is not hypothetical. #837 moved reset-password.html and invite.html off
 * `{{ .ConfirmationURL }}` and onto `?token_hash={{ .TokenHash }}`, and both
 * files carry a comment reading: 'Do not "simplify" to {{ .ConfirmationURL }}'.
 * `grep -c ConfirmationURL` returns 1 for each file and in each the single hit
 * is that warning. SO THE TWO TEMPLATES WHOSE SHAPE ACTUALLY CHANGED WERE THE
 * TWO THE GUARD NO LONGER GUARDED - and it would have kept passing on a
 * reset-password.html reverted to the old spend-on-GET shape, because the
 * reverting edit deletes the interpolation and keeps the comment.
 *
 * Criterion F: matching a MENTION rather than a USE. The repo already had the
 * pattern - apps/api/lib/auth/no-session-minting.test.ts:66-70 and
 * app/auth/update-password/inert-get.test.ts both strip for exactly this reason.
 * This suite never adopted it.
 *
 * SCOPED TO THIS ONE ASSERTION ON PURPOSE. The other checks in this file are
 * about PROSE - stock English, the brand teal, the clinic names, malformed
 * entities - and a comment cannot satisfy those in a way that matters. Stripping
 * everywhere would be a larger change with no argument behind it.
 */
const withoutComments = (f: string) => read(f).replace(/<!--[\s\S]*?-->/g, "");

/**
 * The bodies are written with HTML entities for every accented character, on
 * purpose: the dashboard editor and older mail clients between them have too
 * many ways to mangle a raw UTF-8 byte, and an entity survives all of them.
 * Assertions about the PROSE therefore have to decode first, or they would be
 * asserting about the encoding rather than about the words.
 */
const ENTITIES: Record<string, string> = {
  "&atilde;": "ã",
  "&ccedil;": "ç",
  "&eacute;": "é",
  "&aacute;": "á",
  "&oacute;": "ó",
  "&uacute;": "ú",
  "&iacute;": "í",
  "&ecirc;": "ê",
  "&acirc;": "â",
  "&otilde;": "õ",
  "&agrave;": "à",
  "&middot;": "·",
};
const decoded = (f: string): string =>
  Object.entries(ENTITIES).reduce((acc, [ent, ch]) => acc.split(ent).join(ch), read(f));

describe("every Supabase Auth template that can send mail has a pt-PT body", () => {
  it("guards against a vacuous pass: the directory actually holds templates", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("covers the full GoTrue template set, so no default can survive", () => {
    // Six templates, six ways an English body could reach a patient or a staff
    // member. Translating five of six leaves a gap nobody would notice until it
    // fired.
    expect(files).toEqual(Object.keys(REQUIRED_VARIABLE).sort());
  });

  it.each(files)("%s declares Portuguese as its language", (f) => {
    expect(read(f)).toContain('lang="pt-PT"');
  });

  it.each(files)("%s interpolates the variable GoTrue actually sends it", (f) => {
    const required = REQUIRED_VARIABLE[f];
    expect(required, `no required variable declared for ${f}`).toBeTruthy();
    expect(
      withoutComments(f),
      `${f}: the required variable is absent from the template BODY. A hit inside ` +
        `an HTML comment does not count - see withoutComments above.`,
    ).toContain(required);
  });

  /**
   * ONE ARM BEYOND THE CARD'S SPEC, and the reason is the card's own risk
   * sentence: the property #837 protects is "the property a future
   * 'simplification' would undo".
   *
   * The corrected mapping above catches a REVERT - delete the TokenHash link,
   * put ConfirmationURL back, and the presence assertion fails. It does NOT
   * catch a template that carries BOTH: a well-meaning edit that adds a
   * "fallback" ConfirmationURL beside the working link would keep TokenHash
   * present and sail through. That is precisely the shape the warning comment in
   * those two files exists to forbid, and until now nothing enforced it.
   *
   * A PRESENCE ASSERTION PROVES THE MECHANISM EXISTS; ONLY THE REFUSAL PROVES
   * THE WRONG SHAPE IS REFUSED. Criterion F, applied to this suite's own fix.
   */
  const FORBIDDEN_VARIABLE: Record<string, string[]> = {
    "invite.html": ["{{ .ConfirmationURL }}", "{{ .RedirectTo }}"],
    "reset-password.html": ["{{ .ConfirmationURL }}", "{{ .RedirectTo }}"],
  };

  it.each(files)("%s does not reintroduce a forbidden link variable", (f) => {
    const forbidden = FORBIDDEN_VARIABLE[f] ?? [];
    const body = withoutComments(f);
    for (const v of forbidden) {
      expect(
        body,
        `${f}: ${v} is back in the template body. Both reintroduce the ` +
          `spend-on-GET shape #837 removed after it failed five times to a mail ` +
          `scanner. The file's own comment says so; this is the check.`,
      ).not.toContain(v);
    }
  });

  it.each(files)("%s carries no Supabase stock English", (f) => {
    const body = decoded(f);
    for (const phrase of STOCK_ENGLISH) {
      expect(body, `${f} contains stock English: "${phrase}"`).not.toContain(phrase);
    }
  });

  it.each(files)("%s carries the brand teal and the clinic footer", (f) => {
    const body = read(f);
    expect(body).toContain("#45B9A7");
    expect(body).toContain("Linda-a-Velha");
    expect(body).toContain("Castelo Branco");
  });

  it.each(files)("%s has NO malformed entity fragment", (f) => {
    // DEFECT FOUND IN A REAL SENT EMAIL, 2026-08-06: the footer rendered as the
    // literal text "OsteoJP &middot" and then stopped. The committed source was
    // byte-correct - semicolons present, nothing truncated - so the break
    // happened downstream, between the dashboard paste and the mail client.
    //
    // The signal was specific and is what the fix is built on: &atilde;,
    // &ccedil; and &eacute; in the BODY all rendered correctly in the same
    // email. Only &middot; failed. So the fix is not "stop using entities", it
    // is "stop using THAT one" - replaced by plain ASCII in the footer, which
    // has no entity to mangle and no non-ASCII byte to re-encode.
    //
    // This assertion is the general form of the bug rather than the specific
    // one: every & must open a well-formed entity. A missing semicolon anywhere
    // - the most likely way this recurs - fails here instead of in an inbox.
    const body = read(f);
    const malformed = [...body.matchAll(/&(?!(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#[xX][0-9A-Fa-f]+);)/g)].map(
      (m) => body.slice(m.index ?? 0, (m.index ?? 0) + 14),
    );
    expect(malformed, `${f} has malformed entity fragment(s)`).toEqual([]);
  });

  it.each(files)("%s does not use the separator that broke in production", (f) => {
    expect(read(f)).not.toContain("&middot");
  });

  it.each(files)("%s names TWO clinics, and never a third", (f) => {
    // OWNER CORRECTION 2026-08-06: the clinic has exactly two locations.
    // Montemor-o-Novo does NOT exist. It is named in CLAUDE.md:4, README.md:3
    // and 45 other committed files as a third location, which is how it reached
    // these footers; the owner is authoritative and those files are wrong.
    // Pinned here so a future edit that copies the stale three-location line out
    // of CLAUDE.md fails instead of mailing a nonexistent clinic to a patient.
    expect(read(f)).not.toContain("Montemor");
  });

  it.each(files)("%s uses no emoji — product tone is serious, not warm", (f) => {
    // CLAUDE.md brand rule. Matches the emoji planes rather than a list.
    expect(read(f)).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it("the change-email body names BOTH addresses, so the recipient can see the swap", () => {
    const body = read("change-email.html");
    expect(body).toContain("{{ .Email }}");
    expect(body).toContain("{{ .NewEmail }}");
  });

  it("every link template tells the reader what happens if it was not them", () => {
    // A recovery or magic-link mail arriving unexpectedly is the one signal a
    // user gets that someone is trying their address. Every one of these says
    // so, in pt-PT.
    for (const f of files) {
      expect(decoded(f).toLowerCase()).toContain("se não");
    }
  });
});
