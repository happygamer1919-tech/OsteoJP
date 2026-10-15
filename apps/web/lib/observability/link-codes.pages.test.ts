import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * OBS-07 - the two things outside link-codes.ts that the scrub depends on,
 * pinned where they are written.
 *
 * 1. ALL THREE PAGES POST FormData, AND NOTHING ELSE (`/r` since OBS-08). A server action called with a
 *    plain argument, `action(code)` or `action.bind(null, code)`, puts that
 *    argument in the request as a bare `["<code>"]`: a code with no marker in
 *    front of it, which link-codes.ts cannot recognise wherever else the
 *    platform copies it. As a field of a form it has a name, and a name is a
 *    marker. So every line of the application that mentions one of the actions is
 *    listed here, exactly. A new call site, or a changed one, fails this test
 *    and is looked at by a person before it is added to the list.
 *
 * 2. THE SERVER CONFIG STILL TELLS THE SDK TO RECORD NO REQUEST BODY. What the
 *    two options do is proven with the real SDK in link-codes.body.test.ts;
 *    this is the plain statement that they are there.
 *
 * It reads source as text, and says so: this is a list of lines, not a parser.
 * A line it does not know fails, which is the direction that is safe.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "../..");

/** Every source file of the application that is not a test. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const ACTIONS = ["confirmCodeAction", "submitSurveyAction", "optOutSurveyAction", "redeemAction"] as const;
/** By whole name: `redeemActionToken` is the redemption itself, not the page's action. */
const MENTIONS = ACTIONS.map((name) => new RegExp(`\\b${name}\\b`));

/** Each line that may mention one of the actions, by file. Trimmed, whole. */
const ALLOWED: Record<string, readonly string[]> = {
  "app/c/[code]/actions.ts": ["export async function confirmCodeAction(formData: FormData): Promise<void> {"],
  "app/c/[code]/page.tsx": [
    'import { confirmCodeAction } from "./actions";',
    // A form's own action: the browser, or React, posts the form's fields.
    '<form action={confirmCodeAction} className="space-y-3">',
  ],
  "app/s/[code]/actions.ts": ["export async function submitSurveyAction(", "export async function optOutSurveyAction("],
  "app/s/[code]/survey-form.tsx": [
    'import { optOutSurveyAction, submitSurveyAction } from "./actions";',
    "const [state, action, pending] = useActionState(submitSurveyAction, EMPTY_SURVEY_FORM_STATE);",
    // The opt-out's useActionState call, which spans lines: its first argument.
    "optOutSurveyAction,",
  ],
  "app/r/[token]/actions.ts": ["export async function redeemAction(formData: FormData): Promise<void> {"],
  "app/r/[token]/page.tsx": [
    'import { redeemAction } from "./actions";',
    '<form action={redeemAction} className="space-y-3">',
  ],
};

describe("the link pages hand their code or token to the server as a form field, never as a bare argument", () => {
  const mentions: Array<{ file: string; line: string }> = [];
  const roots = ["app", "components", "lib"].map((dir) => path.join(web, dir));
  const files = roots.flatMap(sources);
  for (const full of files) {
    const file = path.relative(web, full).split(path.sep).join("/");
    for (const raw of readFileSync(full, "utf8").split("\n")) {
      const line = raw.trim();
      // A comment may say the name; a comment posts nothing.
      if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
      if (MENTIONS.some((name) => name.test(line))) mentions.push({ file, line });
    }
  }

  it("the walk did read the application: the three pages and their action files are in it", () => {
    const read = files.map((full) => path.relative(web, full).split(path.sep).join("/"));
    for (const file of Object.keys(ALLOWED)) expect(read).toContain(file);
    expect(read.length).toBeGreaterThan(100);
  });

  it("every mention of an action is one of the known lines, and every known line is still there", () => {
    const unknown = mentions.filter(({ file, line }) => !(ALLOWED[file] ?? []).includes(line));
    expect(unknown).toEqual([]);

    const found = mentions.map(({ file, line }) => `${file} :: ${line}`).sort();
    const known = Object.entries(ALLOWED)
      .flatMap(([file, lines]) => lines.map((line) => `${file} :: ${line}`))
      .sort();
    expect(found).toEqual(known);
  });

  it("the confirm page's action takes the form and nothing else", () => {
    const actions = readFileSync(path.join(web, "app/c/[code]/actions.ts"), "utf8");
    expect(actions).toContain('const code = String(formData.get("code") ?? "");');
    const page = readFileSync(path.join(web, "app/c/[code]/page.tsx"), "utf8");
    expect(page).toContain('<input type="hidden" name="code" value={code} />');
  });

  it("the survey's action takes the previous state and the form, and is only ever called with a FormData", () => {
    const actions = readFileSync(path.join(web, "app/s/[code]/actions.ts"), "utf8");
    expect(actions).toContain(
      ["export async function submitSurveyAction(", "  _previous: SurveyFormState,", "  formData: FormData,", "): Promise<SurveyFormState> {"].join("\n"),
    );
    expect(actions).toContain('const code = String(formData.get("code") ?? "");');

    const form = readFileSync(path.join(web, "app/s/[code]/survey-form.tsx"), "utf8");
    expect(form).toContain('<input type="hidden" name="code" value={code} />');
    // `action` is what useActionState returned. Every place it is used:
    const uses = form
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /\baction\b/.test(line) && !line.startsWith("//") && !line.startsWith("*"));
    expect(uses).toEqual([
      "const [state, action, pending] = useActionState(submitSurveyAction, EMPTY_SURVEY_FORM_STATE);",
      "startTransition(() => action(formData));",
      "<form action={action} onSubmit={submit} noValidate className=\"space-y-6\">",
      "<form action={optOutAction} className=\"space-y-2 border-t border-border pt-4 text-center\">",
    ]);
    // And the one thing it is called with is the form's own fields.
    expect(form).toContain("const formData = new FormData(event.currentTarget);");
  });

  it("the survey's opt-out takes the previous state and the form, and is only ever a form's own action", () => {
    const actions = readFileSync(path.join(web, "app/s/[code]/actions.ts"), "utf8");
    expect(actions).toContain(
      ["export async function optOutSurveyAction(", "  _previous: SurveyFormState,", "  formData: FormData,", "): Promise<SurveyFormState> {"].join("\n"),
    );
    const form = readFileSync(path.join(web, "app/s/[code]/survey-form.tsx"), "utf8");
    // Both forms carry the code as a named field: the answer's and the opt-out's.
    expect(form.split('<input type="hidden" name="code" value={code} />').length - 1).toBe(2);
    const uses = form
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /\boptOutAction\b/.test(line) && !line.startsWith("//") && !line.startsWith("*"));
    expect(uses).toEqual([
      "const [optOutState, optOutAction, optOutPending] = useActionState(",
      "<form action={optOutAction} className=\"space-y-2 border-t border-border pt-4 text-center\">",
    ]);
  });

  it("the reschedule page's action takes the form and nothing else", () => {
    const actions = readFileSync(path.join(web, "app/r/[token]/actions.ts"), "utf8");
    expect(actions).toContain('const token = String(formData.get("token") ?? "");');
    const page = readFileSync(path.join(web, "app/r/[token]/page.tsx"), "utf8");
    expect(page).toContain('<input type="hidden" name="token" value={token} />');
  });

  it("no page binds an argument to an action", () => {
    for (const file of [
      "app/c/[code]/page.tsx",
      "app/c/[code]/actions.ts",
      "app/s/[code]/page.tsx",
      "app/s/[code]/survey-form.tsx",
      "app/s/[code]/actions.ts",
      "app/r/[token]/page.tsx",
      "app/r/[token]/actions.ts",
    ]) {
      const text = readFileSync(path.join(web, file), "utf8");
      expect(text.includes(".bind("), file).toBe(false);
    }
  });

  it("the three action files export only the actions above", () => {
    for (const [file, names] of [
      ["app/c/[code]/actions.ts", ["confirmCodeAction"]],
      ["app/s/[code]/actions.ts", ["submitSurveyAction", "optOutSurveyAction"]],
      ["app/r/[token]/actions.ts", ["redeemAction"]],
    ] as const) {
      const exported = readFileSync(path.join(web, file), "utf8")
        .split("\n")
        .filter((line) => line.startsWith("export "));
      expect(exported).toHaveLength(names.length);
      names.forEach((name, i) => expect(exported[i]).toContain(`export async function ${name}(`));
    }
  });
});

describe("the server config tells the SDK to record no request body", () => {
  const config = readFileSync(path.join(web, "sentry.server.config.ts"), "utf8");

  it("the Http integration reads no body, and the RequestData integration puts none on an event", () => {
    expect(config).toContain(
      'return Sentry.httpIntegration({ disableIncomingRequestSpans: true, maxIncomingRequestBodySize: "none" });',
    );
    expect(config).toContain("return Sentry.requestDataIntegration({ include: { data: false, cookies: false } });");
  });

  it("each replaces the integration of its own name, so neither is left out and neither is doubled", () => {
    expect(config).toContain('if (integration.name === "Http") {');
    expect(config).toContain('if (integration.name === "RequestData") {');
  });
});
