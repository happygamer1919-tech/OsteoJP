import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ALL FOUR AUDIT HELPERS ENFORCE THE CONTRACT, AND THE FIFTH ONE CANNOT SHIP
 * WITHOUT DOING SO EITHER.
 *
 * ==========================================================================
 * WHY THIS SUITE EXISTS, AND IT IS THE SECOND TIME
 * ==========================================================================
 * #1226 found that `cancelAppointment` had written a free-text reason into
 * `audit_log` for months, sourced from the agenda drawer's `form.notes` - an
 * existing clinical note about a named patient, into a table that is append-only
 * and retained for ever. The helper's doc comment had forbidden exactly that
 * since the day it was written.
 *
 * THAT FIX GUARDED ONE HELPER OF FOUR. The other three carried the identical
 * promise in a comment and enforced nothing, and `lib/admin/audit.ts` is the one
 * a pacote switch will call - PACK-06 rules that reception types an amount AND A
 * REASON, prose typed at a front desk about one patient's money.
 *
 * So the interesting assertion is not "the guard works". It is "every helper
 * calls it", and, one step further out, "a helper that does not call it cannot
 * be added quietly". The source arm at the bottom is that second claim, and it
 * is the half that survives somebody writing a fifth writer next month.
 */

vi.mock("server-only", () => ({}));

import { assertPiiFreeAuditMetadata, AuditMetadataError } from "./metadata-contract";
import { writeAudit as writeAdminAudit } from "../admin/audit";
import { writeAudit as writePatientAudit } from "../patients/audit";
import { writeClinicalAudit } from "../clinical/audit";
import { writeAppointmentAudit } from "../scheduling/audit";

/** The string the old code put in the log. Prose, about a patient, in pt-PT. */
const CLINICAL_NOTE = "Dores lombares desde segunda, pediu para remarcar para a proxima semana";
/** What reception will type on a pacote switch once PACK-06 is built. */
const PACOTE_REASON = "Passou do pacote de 5 para o de 10, pagou a diferenca em dinheiro";

const ACTOR = { tenantId: "tenant-A", role: "reception", userId: "user-1" } as never;
const UUID = "0f8f6a9e-6f31-4e0a-9a5c-2d1c3b4a5e6f";

let inserted: Array<Record<string, unknown>>;
function fakeTx() {
  return {
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        inserted.push(v);
        return [];
      },
    }),
  } as never;
}

beforeEach(() => {
  inserted = [];
});

/**
 * The four helpers, each with a call that must be REFUSED and one that must be
 * ACCEPTED.
 *
 * BOTH ARMS ARE REQUIRED. A suite with only refusals passes just as well over a
 * guard that rejects everything, which would take the audit trail out entirely -
 * a worse outcome than the defect, and one that no refusal test can see.
 */
const HELPERS = [
  {
    name: "admin/writeAudit",
    prose: () =>
      writeAdminAudit(fakeTx(), ACTOR, {
        action: "pack.switch",
        entityType: "pack_instance",
        entityId: UUID,
        metadata: { switchReason: PACOTE_REASON, amountCents: 1500 },
      }),
    clean: () =>
      writeAdminAudit(fakeTx(), ACTOR, {
        action: "pack.switch",
        entityType: "pack_instance",
        entityId: UUID,
        metadata: { hadReason: true, amountCents: 1500, fromPackId: UUID },
      }),
  },
  {
    name: "patients/writeAudit",
    prose: () =>
      writePatientAudit(fakeTx(), ACTOR, {
        action: "patient.update",
        entityId: UUID,
        metadata: { note: CLINICAL_NOTE },
      }),
    clean: () =>
      writePatientAudit(fakeTx(), ACTOR, {
        action: "patient.update",
        entityId: UUID,
        metadata: { fields: ["phone", "postal_code"], wasSoftDeleted: false },
      }),
  },
  {
    name: "clinical/writeClinicalAudit",
    prose: () =>
      writeClinicalAudit(fakeTx(), {
        tenantId: "tenant-A",
        actorUserId: "user-1",
        action: "clinical_record.annul",
        entityType: "clinical_record",
        entityId: UUID,
        metadata: { reason: CLINICAL_NOTE },
        ip: null,
      }),
    clean: () =>
      writeClinicalAudit(fakeTx(), {
        tenantId: "tenant-A",
        actorUserId: "user-1",
        action: "clinical_record.annul",
        entityType: "clinical_record",
        entityId: UUID,
        metadata: { hadReason: true },
        ip: null,
      }),
  },
  {
    name: "scheduling/writeAppointmentAudit",
    prose: () =>
      writeAppointmentAudit(fakeTx(), {
        tenantId: "tenant-A",
        actorUserId: "user-1",
        action: "appointment.cancel",
        appointmentId: UUID,
        metadata: { reason: CLINICAL_NOTE },
        ip: null,
      }),
    clean: () =>
      writeAppointmentAudit(fakeTx(), {
        tenantId: "tenant-A",
        actorUserId: "user-1",
        action: "appointment.cancel",
        appointmentId: UUID,
        metadata: { hadReason: true, scope: "one", toStatus: "cancelled" },
        ip: null,
      }),
  },
] as const;

describe("every audit helper REFUSES free text", () => {
  for (const h of HELPERS) {
    it(`${h.name} refuses prose, and writes NOTHING when it does`, async () => {
      await expect(h.prose()).rejects.toThrow(AuditMetadataError);
      // THE ROW COUNT IS THE ASSERTION THAT MATTERS. A guard that threw AFTER
      // the insert would satisfy `rejects.toThrow` and still have written the
      // clinical note into an append-only table.
      expect(inserted, `${h.name} inserted a row despite refusing`).toHaveLength(0);
    });
  }
});

describe("every audit helper still ACCEPTS a legitimate row", () => {
  for (const h of HELPERS) {
    it(`${h.name} writes ids, enums, counts and booleans as before`, async () => {
      await expect(h.clean()).resolves.toBeUndefined();
      expect(inserted).toHaveLength(1);
      expect(inserted[0]!.metadata).toBeDefined();
    });
  }
});

describe("the refusal names the writer, and never the value", () => {
  for (const h of HELPERS) {
    it(`${h.name} says which helper broke the contract`, async () => {
      const err = await h.prose().catch((e: Error) => e);
      const msg = (err as Error).message;
      // Four helpers share one function, so the stack alone does not say which
      // contract was broken.
      expect(msg).toContain(h.name);
      // And the message travels to logs and Sentry.
      expect(msg).not.toContain(CLINICAL_NOTE);
      expect(msg).not.toContain(PACOTE_REASON);
      expect(msg).not.toContain("Dores");
      expect(msg).not.toContain("pacote de 5");
    });
  }
});

// ====================================================================
// THE SOURCE ARM. The behavioural arms above cover the four writers that exist
// today. This one covers the fifth, written next month.
// ====================================================================
describe("no module writes audit_log without either the guard or a named exception", () => {
  const WEB = join(__dirname, "..", "..");

  /**
   * Modules that INSERT into audit_log directly, bypassing every helper, with
   * the reason each is allowed to.
   *
   * SIX OF THE SEVEN WRITE ONLY IDS, ENUMS, COUNTS AND HASHES. THE SEVENTH IS
   * THE REASON THE GUARD LIVES IN THE HELPERS AND NOT AT THE TABLE:
   * `messaging-check.ts` writes the PROVIDER'S OWN ERROR TEXT, trimmed to 300
   * characters, because Twilio's wording is the whole diagnostic value of that
   * page. It is free text and it is NOT patient PII, and those are different
   * things. A table-level guard would refuse it and break the owner's messaging
   * diagnostic.
   */
  const DIRECT_WRITERS = new Map([
    ["lib/reminders/messaging-check.ts", "DELIBERATE: metadata.failure is the provider's own error text"],
    ["lib/reminders/inbound-store.ts", "ids, enums and booleans only"],
    ["lib/reminders/confirm-redeem.ts", "a single slug, via: 'confirm_code'"],
    ["lib/reminders/inbound-reply.ts", "bounded ReviewReason enum, ids and outcome slugs"],
    ["lib/integrations/ifthenpay/ledger-drizzle.ts", "provider and method slugs"],
  ]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(e) && !/\.test\./.test(e)) out.push(full);
    }
    return out;
  }

  const writers = walk(join(WEB, "lib"))
    .filter((f) => /insert\(auditLog\)/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(WEB.length + 1));

  it("found the audit writers at all", () => {
    // Vacuous-pass guard: a broken walk or a renamed table would make the
    // assertion below pass over an empty list.
    expect(writers.length).toBeGreaterThanOrEqual(8);
  });

  it("every writer either calls the guard or is a named exception", () => {
    const unguarded = writers.filter((rel) => {
      if (DIRECT_WRITERS.has(rel)) return false;
      return !/assertPiiFreeAuditMetadata\(/.test(readFileSync(join(WEB, rel), "utf8"));
    });
    expect(unguarded, unguarded.join(", ")).toEqual([]);
  });

  it("every named exception still exists and still writes audit_log", () => {
    // AN EXCEPTION NOBODY CAN SEE IS A HOLE. If one of these is deleted, or
    // stops writing audit_log, or grows a guard of its own, its entry must go -
    // otherwise the list quietly starts excusing nothing while looking thorough.
    for (const [rel, why] of DIRECT_WRITERS) {
      const src = readFileSync(join(WEB, rel), "utf8");
      expect(/insert\(auditLog\)/.test(src), `${rel} no longer writes audit_log`).toBe(true);
      expect(why.length).toBeGreaterThan(20);
    }
  });

  it("the documented exception is REAL: messaging-check still writes the provider's text", () => {
    // The one entry that is not "ids only" must keep earning its place. If this
    // stops being true, the guard belongs at the table and the exception list
    // can go.
    const src = readFileSync(join(WEB, "lib/reminders/messaging-check.ts"), "utf8");
    expect(src).toMatch(/failure = err instanceof Error \? err\.message\.slice\(0, 300\)/);
    expect(src).toMatch(/failure: failure \?\? null/);
  });

  it("the contract file names every exception, so the two lists cannot drift", () => {
    const doc = readFileSync(join(__dirname, "metadata-contract.ts"), "utf8");
    for (const rel of DIRECT_WRITERS.keys()) {
      const base = rel.split("/").slice(-2).join("/");
      expect(doc, `metadata-contract.ts does not mention ${base}`).toContain(base);
    }
  });
});

// ====================================================================
// THE MEDIA-TYPE RULE (H5). The arm above asks "does every writer call the
// guard". This one asks "can a writer hand the guard a value the guard has to
// refuse", for the one value that provably could: a client-supplied media type.
//
// WHERE THE RULE IS ENFORCED, AND WHY THERE.
// The rule runs at RUNTIME, inside assertPiiFreeAuditMetadata, on the VALUE.
// Two other mechanisms were considered and rejected:
//
//  - A SOURCE SCAN FOR A `mimeType` KEY. It reads one identifier in one
//    directory. `mime`, `contentType`, `type: file.type` and a `...input` spread
//    all pass it, and a writer that builds its metadata in a helper function or
//    a ternary has no literal for it to read at all. Three such writers exist
//    today (lib/admin/day-defined-remove.ts, lib/admin/staff.ts,
//    lib/reminders/confirm-redeem.ts), so the scan cannot be the mechanism. It
//    is kept BELOW, in a form that reports what it cannot analyse instead of
//    skipping it, because it still catches a bad literal at review time.
//  - REFACTORING THOSE THREE CALL SITES so the literal sits at the write. It
//    would make today's three readable and would do nothing about the fourth,
//    written next month, which is the only writer this arm exists for.
//
// The value rule holds for all four helpers and every shape of caller, and it is
// the one a fifth writer inherits without knowing it exists.
// ====================================================================
describe("a media type is refused by SHAPE, under any key and in any position", () => {
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  it.each([
    // REDUNDANT, NOT WRONG, AND MEASURED: this row and "with a parameter" below
    // are the two that already pass against the previous commit, because a
    // pre-existing rule reaches them first - this type is 71 characters, over
    // the 64-character rule, and a parameter carries a space, which the
    // whitespace rule refuses. They are kept because they are the two shapes
    // the two pickers actually produce, and a reader should see them refused by
    // the rule they belong to. The other eight rows are the new coverage.
    ["mimeType", { mimeType: DOCX }],
    ["mime", { mime: "image/png" }],
    ["contentType", { contentType: "image/png" }],
    ["type", { type: "image/png" }],
    ["a spread of a client payload", { ...{ id: UUID, type: "application/pdf" } }],
    ["nested under a reference object", { ref: { entityType: "attachment", mime: "image/heic" } }],
    ["inside an array", { types: ["image/png"] }],
    ["short and lowercase", { k: "text/csv" }],
    // The second of the two rows the whitespace rule already refused: see the
    // note at the head of this list.
    ["with a parameter", { k: "text/plain; charset=utf-8" }],
    ["uppercased", { k: "Image/PNG" }],
  ])("refuses %s", (_label, metadata) => {
    expect(() => assertPiiFreeAuditMetadata(metadata as Record<string, unknown>, "test")).toThrow(
      AuditMetadataError,
    );
  });

  it("names the key and the writer, and never quotes the value", () => {
    const err = (() => {
      try {
        assertPiiFreeAuditMetadata({ mimeType: DOCX }, "clinical/writeClinicalAudit");
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err).toBeInstanceOf(AuditMetadataError);
    expect(err!.message).toContain("mimeType");
    expect(err!.message).toContain("clinical/writeClinicalAudit");
    expect(err!.message).toContain("attachments.mime_type");
    // The message travels to logs and to Sentry.
    expect(err!.message).not.toContain("wordprocessingml");
    expect(err!.message).not.toContain(DOCX);
  });

  /**
   * THE CONTROL, AND IT IS THE ARM THAT MATTERS. A rule that refuses anything
   * with a slash in it would take out ids, slugs and paths, and every refusal
   * test above would still pass. These are values the helpers write today.
   */
  it.each([
    ["a status enum", { status: "cancelled" }],
    ["a scope slug", { scope: "one" }],
    ["a column-name list", { changed: ["notes", "status"] }],
    ["a uuid", { patientId: UUID }],
    ["an ISO instant", { startsAt: "2026-09-01T09:00:00.000Z" }],
    ["a slug that contains a slash", { via: "portal/confirm" }],
    ["a hex colour", { colour: "#45B9A7" }],
    ["a bare word that is also a top-level type", { kind: "text" }],
    ["a count and a boolean", { count: 12, hadReason: true }],
  ])("still accepts %s", (_label, metadata) => {
    expect(() =>
      assertPiiFreeAuditMetadata(metadata as Record<string, unknown>, "test"),
    ).not.toThrow();
  });

  /**
   * THE COMMENT'S COUNT IS THE REGEX'S COUNT, and this arm is why they cannot
   * drift apart again. The header of the contract file stated the size of the
   * top-level set twice, in prose, and stated it wrong both times while the
   * alternation carried a different number. The set is maintained in that file
   * and mirrors no external registry, so nothing outside it can settle a
   * disagreement between the prose and the rule: the only fix is to make the
   * prose checkable.
   */
  it("the count the comment states is the count the regex applies", () => {
    const src = readFileSync(join(__dirname, "metadata-contract.ts"), "utf8");
    const alternation = src.match(/const MEDIA_TYPE\s*=\s*\/\^\(([^)]+)\)/);
    expect(alternation, "MEDIA_TYPE alternation not found in the source").not.toBeNull();
    const tokens = alternation![1]!.split("|");
    // Vacuous-pass guard: a match of the wrong thing would make the comparison
    // below trivially satisfiable.
    expect(tokens.length).toBeGreaterThanOrEqual(10);
    expect(tokens.every((t) => /^[a-z]+$/.test(t))).toBe(true);

    const WORDS = [
      "zero", "one", "two", "three", "four", "five", "six", "seven",
      "eight", "nine", "ten", "eleven", "twelve",
    ];
    const claims = [
      ...src.matchAll(new RegExp(`\\b(${WORDS.join("|")})\\s+tokens\\b`, "gi")),
    ].map((m) => m[1]!.toLowerCase());
    // A comment that stops stating a number stops being checkable, which is the
    // same silence as stating the wrong one. Both places must keep saying it.
    expect(claims.length, `number-word claims about the token set: ${claims.length}`)
      .toBeGreaterThanOrEqual(2);
    for (const c of claims) {
      expect(WORDS.indexOf(c), `the comment says "${c} tokens"`).toBe(tokens.length);
    }
  });
});

// ====================================================================
// THE SOURCE ARM, AND ITS ARITHMETIC (H5).
//
// The runtime rule above is the mechanism. This arm is the review-time reading
// of the same rule, and its ONE job beyond catching a bad literal is to be
// honest about what it can and cannot read.
//
// WHAT THE OLD VERSION OF THIS ARM DID, AND WHY IT IS GONE. It matched
// `metadata:\s*\{[^{}]*\}`. `[^{}]` cannot cross a brace, so a literal holding a
// nested object or a conditional spread did not match SHORT — it did not match
// at all, and a site that does not match is a site that is not checked. Over
// apps/web/lib it read 53 of 56 starts and said nothing about the other three.
// A regex cannot count its own misses, which is the property this replacement
// has: every `metadata:` site is classified, and a site the parser cannot
// resolve FAILS rather than disappearing.
//
// THE NUMBERS THIS ARM REPORTS, and which population each one is over, because
// three different denominators are defensible and only a stated one is useful:
//
//   apps/web/lib, raw `metadata: {` starts, comments included ........ 56
//     of which prose inside a COMMENT (scheduling/actions.ts quotes a
//     literal while explaining a decision) .......................... 1
//   apps/web/lib, real code literals ................................. 55
//   apps/web/app, real code literals ................................. 3
//   ternaries whose branches are literals (analysed as literals) ...... 2
//   sites whose value is an expression the parser cannot read ......... 5, named
//   `metadata:` in a TYPE position or a Next route export ............. 12, named
//
// THIS FILE REPORTS 55 OF 55 FOR apps/web/lib: comments are stripped before
// anything is counted, so the number is over real code. The 56th start is
// accounted for by name below rather than being quietly absent.
//
// KNOWN LIMITS OF THIS SCAN, MEASURED AND WRITTEN DOWN RATHER THAN LEFT TO BE
// DISCOVERED. The scan is the REVIEW-TIME half of the rule. The runtime rule
// inside assertPiiFreeAuditMetadata is the ENFORCEMENT half, and it is what
// covers every case listed here; none of these is a hole in the contract, and
// each of them is a thing this file does not assert.
//
//   1. A SHORTHAND PROPERTY IS INVISIBLE TO IT. The classifier keys on the
//      token `metadata:`, so `const metadata = {...}` followed by
//      `writeAudit(tx, a, { action, entityId, metadata })` yields NO SITE AT
//      ALL - not an opaque one, not an unparsed one, nothing, and the suite
//      stays green (measured on a file in exactly that shape). No count here
//      moves either, so the arithmetic above cannot report it. The value still
//      reaches the guard at the write, which is the whole reason the runtime
//      rule and not this scan is the mechanism.
//   2. IT WALKS apps/web ONLY, and so does the writer arm above.
//      `apps/admin/lib/tenants.ts` and `packages/db/src/provision.ts` both
//      `insert(auditLog)` and sit outside both walks, so NO ARM IN THIS FILE
//      asserts anything about either of them. They are named in the contract
//      file's own header as two of the seven direct writers, and the reason
//      given there - ids, enums, counts and hashes only - is a reading, not an
//      assertion this suite makes.
// ====================================================================
describe("no audit metadata literal carries a media type, and nothing is skipped", () => {
  const WEB = join(__dirname, "..", "..");
  /** Both directories. The old walk covered `lib` only and never saw `app`. */
  const ROOTS = ["lib", "app"] as const;

  /**
   * Blank every comment and every string body, keeping byte offsets and line
   * breaks. Identifiers survive, so key names still read; prose does not, which
   * is what makes the count a count of CODE.
   */
  function blankCommentsAndStrings(src: string): string {
    const out = src.split("");
    const wipe = (from: number, to: number) => {
      for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
    };
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      const d = src[i + 1];
      if (c === "/" && d === "/") {
        let j = i + 2;
        while (j < src.length && src[j] !== "\n") j++;
        wipe(i, j);
        i = j;
        continue;
      }
      if (c === "/" && d === "*") {
        let j = i + 2;
        while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j++;
        wipe(i, Math.min(j + 2, src.length));
        i = j + 2;
        continue;
      }
      // A template literal is blanked whole, `${...}` included, so the braces
      // inside it cannot unbalance the scan below.
      if (c === '"' || c === "'" || c === "`") {
        let j = i + 1;
        while (j < src.length) {
          if (src[j] === "\\") {
            j += 2;
            continue;
          }
          if (src[j] === c) break;
          j++;
        }
        wipe(i, j + 1);
        i = j + 1;
        continue;
      }
      i++;
    }
    return out.join("");
  }

  /** Index of the `}` closing the `{` at `open`, or -1 if the file ends first. */
  function matchBrace(src: string, open: number): number {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return i;
    }
    return -1;
  }

  /** End of the value expression that starts at `from`: the `,` or `;` at depth 0. */
  function expressionEnd(src: string, from: number): number {
    let p = 0;
    let b = 0;
    let c = 0;
    for (let i = from; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(") p++;
      else if (ch === ")") {
        if (!p) return i;
        p--;
      } else if (ch === "[") b++;
      else if (ch === "]") {
        if (!b) return i;
        b--;
      } else if (ch === "{") c++;
      else if (ch === "}") {
        if (!c) return i;
        c--;
      } else if ((ch === "," || ch === ";") && !p && !b && !c) return i;
    }
    return src.length;
  }

  /**
   * The type heads a `metadata:` may legitimately be followed by. These are
   * DECLARATIONS, not writes: `Record<string, unknown>` in a helper signature,
   * and `Metadata` on a Next route export, which is the framework's page
   * metadata and has nothing to do with audit_log.
   *
   * A head that is not on this list lands in `opaque` and fails the arm by name.
   * Nothing is skipped for being unrecognised.
   */
  const TYPE_HEAD = /^(Record|Readonly|Partial|Metadata)\b/;

  /**
   * Sites whose value is an expression this parser cannot resolve, each with the
   * reason it is allowed to stay that way. THE RUNTIME RULE IS WHAT COVERS THEM:
   * every one of these values reaches assertPiiFreeAuditMetadata, which reads the
   * object it is actually given.
   *
   * A NEW opaque site fails this arm until somebody writes its line here, which
   * is the point: "the parser cannot read it" becomes a decision somebody made
   * rather than a silence.
   */
  const OPAQUE = new Map([
    [
      "lib/admin/audit.ts",
      "the helper's own pass-through: assertPiiFreeAuditMetadata runs on this value first",
    ],
    [
      "lib/patients/audit.ts",
      "the helper's own pass-through: assertPiiFreeAuditMetadata runs on this value first",
    ],
    [
      "lib/clinical/audit.ts",
      "the helper's own pass-through: assertPiiFreeAuditMetadata runs on this value first",
    ],
    [
      "lib/scheduling/audit.ts",
      "the helper's own pass-through: assertPiiFreeAuditMetadata runs on this value first",
    ],
    [
      "lib/admin/day-defined-remove.ts",
      "metadata is built by dayDefinedRemovalAuditMetadata(); it goes through writeAudit, so the runtime rule reads the object",
    ],
  ]);

  /**
   * Files that quote a `metadata: {` literal inside a COMMENT, with the reason.
   * This is the 56th start: prose explaining a decision, not a write. It is named
   * rather than left as an unexplained gap between two counts.
   */
  const PROSE_IN_COMMENTS = new Map([
    [
      "lib/scheduling/actions.ts",
      "the cancel writer quotes clinical/records.ts's `metadata: { hadReason: ... }` while explaining why a boolean replaced the prose",
    ],
  ]);

  type Site = {
    rel: string;
    line: number;
    kind: "literal" | "conditional" | "declaration" | "opaque" | "unparsed";
    text: string;
  };

  function walkCode(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walkCode(full, out);
      else if (/\.tsx?$/.test(e) && !/\.test\./.test(e)) out.push(full);
    }
    return out;
  }

  /** Classify every `metadata:` site in one source text. */
  function sitesIn(rel: string, raw: string): Site[] {
    const src = blankCommentsAndStrings(raw);
    const found: Site[] = [];
    for (const m of src.matchAll(/\bmetadata\s*\??\s*:/g)) {
      let i = m.index! + m[0].length;
      while (i < src.length && /\s/.test(src[i]!)) i++;
      const line = raw.slice(0, m.index).split("\n").length;
      const add = (kind: Site["kind"], text: string) => found.push({ rel, line, kind, text });
      if (src[i] === "{") {
        const end = matchBrace(src, i);
        if (end < 0) add("unparsed", "");
        else add("literal", src.slice(i, end + 1));
        continue;
      }
      const end = expressionEnd(src, i);
      const expr = src.slice(i, end);
      if (TYPE_HEAD.test(expr.trim())) {
        add("declaration", expr.trim());
        continue;
      }
      // Replace each balanced brace literal with `@`, then ask whether what is
      // left is a ternary over those literals (readable) or something else (not).
      let shape = "";
      let k = 0;
      while (k < expr.length) {
        if (expr[k] === "{") {
          const e = matchBrace(expr, k);
          if (e < 0) {
            shape += expr.slice(k);
            break;
          }
          shape += "@";
          k = e + 1;
        } else {
          shape += expr[k];
          k++;
        }
      }
      shape = shape.replace(/\?\?/g, "~~"); // `a ?? b` is not a ternary.
      const q = shape.indexOf("?");
      const branches = q < 0 ? [shape] : shape.slice(q + 1).split(/[?:]/);
      const readable =
        q >= 0 && branches.every((t) => ["@", "", "null", "undefined"].includes(t.trim()));
      add(readable ? "conditional" : "opaque", expr);
    }
    return found;
  }

  const sites: Site[] = [];
  let rawStartsLib = 0;
  for (const root of ROOTS) {
    for (const f of walkCode(join(WEB, root))) {
      const raw = readFileSync(f, "utf8");
      const rel = f.slice(WEB.length + 1);
      if (root === "lib") rawStartsLib += [...raw.matchAll(/metadata:\s*\{/g)].length;
      sites.push(...sitesIn(rel, raw));
    }
  }

  const of = (k: Site["kind"]) => sites.filter((s) => s.kind === k);
  const analysable = [...of("literal"), ...of("conditional")];
  const libLiterals = of("literal").filter((s) => s.rel.startsWith("lib/"));
  const SUMMARY =
    `apps/web/lib: ${rawStartsLib} raw \`metadata: {\` starts, ` +
    `${libLiterals.length} real code literals, ${libLiterals.length} analysed. ` +
    `lib+app: ${analysable.length} value sites analysed, ` +
    `${of("opaque").length} opaque and named, ${of("declaration").length} declarations, ` +
    `${of("unparsed").length} unparsed.`;

  /**
   * The media-type KEYS a literal may not carry. Deliberately not `type`: a
   * source scan cannot tell `type: "manual"` from `type: file.type`, and the
   * runtime rule already refuses the value under any key. This list is the
   * review-time hint, not the guarantee.
   */
  const MIME_KEYS = /\b(mimeType|mimetype|mime|contentType|content_type|mediaType|fileType)\b/;

  it(`reads the corpus at all, and reports: ${SUMMARY}`, () => {
    // Vacuous-pass guards. Every assertion below is satisfied by an empty list,
    // so the walk has to be proved to have found something first.
    expect(rawStartsLib).toBeGreaterThanOrEqual(56);
    expect(libLiterals.length).toBeGreaterThanOrEqual(55);
    expect(of("literal").filter((s) => s.rel.startsWith("app/")).length).toBeGreaterThanOrEqual(3);
    expect(sites.length).toBe(
      of("literal").length +
        of("conditional").length +
        of("declaration").length +
        of("opaque").length +
        of("unparsed").length,
    );
  });

  it("the parser reads the shapes the old regex could not", () => {
    // POSITIVE CONTROLS. Each of these is a shape `metadata:\s*\{[^{}]*\}`
    // returned nothing for, and a scanner that finds nothing passes every
    // "no offender" assertion ever written.
    const nested = `writeAudit(tx, a, {\n  metadata: { role: r, ...(x ? { reclaimed: true } : {}) },\n});`;
    const multi = `metadata: {\n  patientId: p,\n  mimeType: input.mimeType,\n},`;
    const ternary = `metadata: cond ? { mime: x } : { via: "y" },`;
    const call = `metadata: buildIt(plan, userId),`;

    expect(sitesIn("t.ts", nested)[0]!.kind).toBe("literal");
    expect(sitesIn("t.ts", nested)[0]!.text).toContain("reclaimed");
    expect(sitesIn("t.ts", multi)[0]!.kind).toBe("literal");
    expect(MIME_KEYS.test(sitesIn("t.ts", multi)[0]!.text)).toBe(true);
    expect(sitesIn("t.ts", ternary)[0]!.kind).toBe("conditional");
    expect(MIME_KEYS.test(sitesIn("t.ts", ternary)[0]!.text)).toBe(true);
    expect(sitesIn("t.ts", call)[0]!.kind).toBe("opaque");

    // NEGATIVE CONTROLS: the two ways a count can be dishonestly inflated.
    expect(sitesIn("t.ts", `// metadata: { mimeType: x }\nconst a = 1;`)).toHaveLength(0);
    expect(sitesIn("t.ts", `const a = "metadata: { mimeType: x }";`)).toHaveLength(0);
  });

  it("every `metadata:` site is classified, and none is left unparsed", () => {
    const unparsed = of("unparsed").map((s) => `${s.rel}:${s.line}`);
    expect(unparsed, unparsed.join(", ")).toEqual([]);
  });

  it("no literal or ternary branch carries a media-type key", () => {
    const offenders = analysable
      .filter((s) => MIME_KEYS.test(s.text))
      .map((s) => `${s.rel}:${s.line}`);
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("every site the parser cannot read is named, with the reason it may be", () => {
    const unnamed = of("opaque")
      .filter((s) => !OPAQUE.has(s.rel))
      .map((s) => `${s.rel}:${s.line} -> ${s.text.replace(/\s+/g, " ").slice(0, 60)}`);
    expect(unnamed, `unnamed opaque metadata sites:\n${unnamed.join("\n")}`).toEqual([]);
    for (const [, why] of OPAQUE) expect(why.length).toBeGreaterThan(20);
  });

  it("the named list has no stale entry", () => {
    // A NAME THAT NO LONGER MATCHES ANYTHING excuses nothing while looking
    // thorough, which is how an exception list rots.
    const live = new Set(of("opaque").map((s) => s.rel));
    const stale = [...OPAQUE.keys()].filter((rel) => !live.has(rel));
    expect(stale, stale.join(", ")).toEqual([]);
    const proseLive = new Set(
      sites.filter((s) => PROSE_IN_COMMENTS.has(s.rel)).map((s) => s.rel),
    );
    expect([...PROSE_IN_COMMENTS.keys()].filter((r) => !proseLive.has(r))).toEqual([]);
  });

  it("the gap between the raw count and the code count is exactly the named prose", () => {
    // 56 raw starts, 55 code literals. The difference is not an unexplained
    // rounding: it is `metadata: {` quoted inside a comment, in the files named
    // above and no others.
    const perFile = new Map<string, number>();
    for (const f of walkCode(join(WEB, "lib"))) {
      const raw = readFileSync(f, "utf8");
      const rel = f.slice(WEB.length + 1);
      const rawN = [...raw.matchAll(/metadata:\s*\{/g)].length;
      const codeN = sitesIn(rel, raw).filter((s) => s.kind === "literal").length;
      if (rawN !== codeN) perFile.set(rel, rawN - codeN);
    }
    expect([...perFile.keys()].sort()).toEqual([...PROSE_IN_COMMENTS.keys()].sort());
    expect(rawStartsLib - libLiterals.length).toBe(
      [...perFile.values()].reduce((a, b) => a + b, 0),
    );
  });

  it("a declaration is a type position or a Next route export, not a write", () => {
    for (const s of of("declaration")) {
      const isNextRoute = /^Metadata\b/.test(s.text);
      if (isNextRoute) expect(s.rel).toMatch(/(page|layout|route)\.tsx?$/);
      else expect(s.text).toMatch(/^(Record|Readonly|Partial)\s*</);
    }
  });
});

describe("the guard itself, on the shapes the helpers actually write", () => {
  it("accepts uuids, ISO instants, enums, counts, booleans, nulls and name arrays", () => {
    expect(() =>
      assertPiiFreeAuditMetadata(
        {
          patientId: UUID,
          startsAt: "2026-09-01T09:00:00.000Z",
          status: "scheduled",
          changed: ["notes", "status"],
          count: 12,
          allowConflict: false,
          packId: null,
          ref: { entityType: "appointment", entityId: UUID },
        },
        "test",
      ),
    ).not.toThrow();
  });

  it("refuses a two-word value, because a patient name is the PII named first", () => {
    expect(() => assertPiiFreeAuditMetadata({ who: "Maria Silva" }, "test")).toThrow(
      AuditMetadataError,
    );
  });
});
