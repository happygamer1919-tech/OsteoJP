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
  "invite.html": "{{ .ConfirmationURL }}",
  "magic-link.html": "{{ .ConfirmationURL }}",
  "change-email.html": "{{ .ConfirmationURL }}",
  "reset-password.html": "{{ .ConfirmationURL }}",
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
    expect(read(f)).toContain(required);
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
