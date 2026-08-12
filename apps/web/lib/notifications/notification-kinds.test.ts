import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StaffNotificationKind } from "./centre";

// INC-09 — the staff notification centre showed reception a WRONG DESCRIPTION of
// a real clinical event.
//
// WHAT SHIPPED. Migration 0055 pinned four notification kinds in a CHECK
// constraint. Migration 0061 widened it to FIVE, adding `confirmed` — the record
// that a therapist accepted a pedido, which exists precisely so reception is not
// blind when the row leaves their live queue. The label map in
// `app/notificacoes/page.tsx` was not widened with it, and the render fell back
// to `?? e.kind`. So every confirmation notification rendered the RAW DATABASE
// ENUM `confirmed`, in English, on a Portuguese staff screen.
//
// THREE SETS HAVE TO AGREE AND NOTHING WAS CHECKING THEM:
//   1. the CHECK constraint in the migrations  (what the database will store)
//   2. `StaffNotificationKind` in centre.ts    (what this app admits)
//   3. the pt and en label files               (what a human is shown)
// The type system covers 2 -> the label MAP, because `Record<StaffNotificationKind,
// string>` will not compile with a member missing. It cannot reach 1 or 3: the
// migration is SQL and the locales are JSON. This file is that reach.
//
// CRITERION F (ACC-identity-blind-assertions). The assertions below are about
// IDENTIFIED kinds — each member of the union, by name — never about a rendered
// label string. Asserting "the screen says Marcação confirmada" would be
// satisfiable by any other event that happens to render those words, which is
// exactly how PG8's direction A passed against an unrelated row.

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

/** Strip comments before matching source. See the assertion that uses it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}


const PT = "packages/i18n/src/strings.pt.json";
const EN = "packages/i18n/src/strings.en.json";
const MIGRATION = "packages/db/migrations/0061_no_double_confirmed_and_confirm_notification.sql";

/** Every member of the union, listed once, as the fixture the rest compares to.
 *
 * IT IS TYPED, SO IT CANNOT DRIFT SILENTLY. Adding a sixth kind to the union
 * without adding it here is a compile error on `satisfies`, and removing one
 * that still exists leaves the migration check below red. */
const KINDS = [
  "booked",
  "cancelled",
  "rescheduled",
  "appointment_request",
  "confirmed",
] as const satisfies readonly StaffNotificationKind[];

describe("INC-09 — every notification kind is renderable in both locales", () => {
  it("is reading the locale files it thinks it is (guards a vacuous pass)", () => {
    // Without this, a moved or renamed locale file makes every assertion below
    // pass against an empty string.
    expect(read(PT).length).toBeGreaterThan(1000);
    expect(read(EN).length).toBeGreaterThan(1000);
    expect(KINDS.length).toBeGreaterThanOrEqual(5);
  });

  it.each(KINDS)("`%s` has a non-empty pt-PT label", (kind) => {
    const pt = JSON.parse(read(PT)) as Record<string, string>;
    const label = pt[`notifications.kind.${kind}`];
    expect(label, `notifications.kind.${kind} missing from ${PT}`).toBeTruthy();
    expect(label.trim().length).toBeGreaterThan(0);
  });

  it.each(KINDS)("`%s` has a non-empty en label", (kind) => {
    const en = JSON.parse(read(EN)) as Record<string, string>;
    const label = en[`notifications.kind.${kind}`];
    expect(label, `notifications.kind.${kind} missing from ${EN}`).toBeTruthy();
    expect(label.trim().length).toBeGreaterThan(0);
  });

  it("no two kinds share a pt-PT label — a confirmation must not read as a reschedule", () => {
    // THE DEFECT AS THE OWNER EXPERIENCED IT was a confirmation that read as
    // "Marcação remarcada". Distinct labels are what make the five events
    // distinguishable on the screen at all; a duplicate would reintroduce the
    // exact confusion under a different mechanism.
    const pt = JSON.parse(read(PT)) as Record<string, string>;
    const labels = KINDS.map((k) => pt[`notifications.kind.${k}`]);
    expect(new Set(labels).size).toBe(KINDS.length);
  });

  it("the fallback label exists, so an unknown kind is vague rather than English", () => {
    // The feed is typed `string` at the database boundary. If a kind ever
    // arrives that this build does not know, the screen must say something TRUE
    // AND USELESS rather than printing an enum — a staff member acting on a
    // confident wrong description is the failure that matters.
    for (const f of [PT, EN]) {
      const j = JSON.parse(read(f)) as Record<string, string>;
      expect(j["notifications.kind.unknown"], `unknown label missing from ${f}`).toBeTruthy();
    }
  });
});

describe("INC-09 — the union matches what the DATABASE will store", () => {
  it("every kind in the union is permitted by migration 0061's CHECK", () => {
    // 0061 rewrote 0055's four-value CHECK to five. If SQL is widened again and
    // this union is not, the new kind reaches the screen with no label — which
    // is INC-09 repeating. The type system cannot see SQL; this can.
    const sql = read(MIGRATION);
    for (const kind of KINDS) {
      expect(sql, `0061 does not mention kind '${kind}'`).toContain(`'${kind}'`);
    }
  });

  it("the render module no longer falls back to printing the raw kind", () => {
    // THE FALLBACK IS WHY THIS SHIPPED SILENTLY. `?? e.kind` turned an unhandled
    // case into plausible-looking output instead of a failure. Its absence is
    // the structural half of this fix and is asserted at source, because a type
    // cannot express "and nobody re-added the escape hatch".
    //
    // COMMENTS ARE STRIPPED FIRST, AND THE FIRST VERSION OF THIS ASSERTION DID
    // NOT DO IT. The page's own header QUOTES the defect it fixed — "the render
    // did `KIND_LABEL[e.kind] ?? e.kind`" — so matching raw text made the
    // assertion fail against CORRECT code, on its own documentation. That is
    // criterion C on ACC-vacuous-guard-sweep: an assertion over source must be
    // proven against what the source actually contains, prose included.
    const page = stripComments(read("apps/web/app/notificacoes/page.tsx"));
    expect(page).not.toMatch(/\?\?\s*e\.kind/);
    expect(page).toMatch(/Record<StaffNotificationKind, string>/);
  });
});
