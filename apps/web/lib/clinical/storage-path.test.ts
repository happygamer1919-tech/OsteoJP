import { describe, expect, it } from "vitest";

import { hasTraversalSegment, isSingleObjectUnder } from "./storage-path";

/**
 * The two path predicates, unit-tested without a mock in sight.
 *
 * The first block is not really about the predicates: it PROVES THE PREMISE
 * they exist for, by running the normalisation the Storage client's `fetch`
 * performs. If that premise ever stops holding, these rules are stricter than
 * they need to be and somebody should be able to see that from here rather than
 * rediscovering it in a review.
 */

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const RECORD = "22222222-2222-4222-8222-222222222222";

/** What the object path becomes once it has been through a URL. */
const asFetched = (objectPath: string): string => {
  const base = "https://proj.supabase.co/storage/v1/object/sign/clinical-attachments/";
  return new Request(base + objectPath).url.slice(base.length);
};

describe("THE PREMISE: a stored path is normalised before it is signed", () => {
  it("a `..` segment climbs out of the folder a prefix check just pinned", () => {
    const sent = `${TENANT}/${RECORD}/../migration/fisiozero/exame.pdf`;
    expect(sent.startsWith(`${TENANT}/${RECORD}/`), "the prefix test passes").toBe(true);
    expect(asFetched(sent)).toBe(`${TENANT}/migration/fisiozero/exame.pdf`);
  });

  it("a doubled `..` leaves the TENANT folder entirely", () => {
    const sent = `${TENANT}/${RECORD}/../../${OTHER}/migration/fisiozero/exame.pdf`;
    expect(sent.startsWith(`${TENANT}/`), "even the tenant test passes").toBe(true);
    expect(asFetched(sent)).toBe(`${OTHER}/migration/fisiozero/exame.pdf`);
  });

  it("percent-encoded dots collapse too, so refusing a literal `..` is not enough", () => {
    const sent = `${TENANT}/${RECORD}/%2e%2e/migration/x.pdf`;
    expect(sent.includes(".."), "there is no literal `..` to refuse").toBe(false);
    expect(asFetched(sent)).toBe(`${TENANT}/migration/x.pdf`);
  });

  it("and an ordinary minted path is left exactly as it was", () => {
    const sent = `${TENANT}/${RECORD}/550e8400-e29b-41d4-a716-446655440000__scan.pdf`;
    expect(asFetched(sent)).toBe(sent);
  });
});

describe("isSingleObjectUnder — the CONFIRM rule", () => {
  const prefix = `${TENANT}/${RECORD}/`;

  it("accepts exactly the shape the upload URL minters produce", () => {
    expect(isSingleObjectUnder(`${prefix}550e8400-e29b-41d4-a716-446655440000__scan.pdf`, prefix)).toBe(true);
    expect(isSingleObjectUnder(`${prefix}a.pdf`, prefix)).toBe(true);
    expect(isSingleObjectUnder(`${prefix}nome_do_ficheiro-2026.01.pdf`, prefix)).toBe(true);
  });

  it.each([
    ["a different folder in the same tenant", `${TENANT}/33333333-3333-4333-8333-333333333333/x.pdf`],
    ["another tenant", `${OTHER}/${RECORD}/x.pdf`],
    ["the folder itself", `${TENANT}/${RECORD}`],
    ["the prefix with an empty object name", prefix],
    ["a climb", `${prefix}../migration/fisiozero/x.pdf`],
    ["a climb out of the tenant", `${prefix}../../${OTHER}/migration/x.pdf`],
    ["a percent-encoded climb", `${prefix}%2e%2e/migration/x.pdf`],
    ["a percent-encoded separator", `${prefix}a%2fb.pdf`],
    ["a nested object", `${prefix}sub/x.pdf`],
    ["an id that is only a prefix of this one", `${TENANT}/${RECORD}0/x.pdf`],
  ])("refuses %s", (_label, path) => {
    expect(isSingleObjectUnder(path, prefix)).toBe(false);
  });

  it("the patient-documents prefix behaves identically", () => {
    const p = `${TENANT}/patient-documents/${RECORD}/`;
    expect(isSingleObjectUnder(`${p}uuid__exame.pdf`, p)).toBe(true);
    expect(isSingleObjectUnder(`${p}../../migration/fisiozero/x.pdf`, p)).toBe(false);
  });
});

describe("hasTraversalSegment — the DOWNLOAD rule, weaker on purpose", () => {
  it("passes the multi-segment path the IMPORTER writes, which the confirm rule would refuse", () => {
    const imported = `${TENANT}/migration/fisiozero/exame-2019.pdf`;
    expect(hasTraversalSegment(imported)).toBe(false);
    // and this is why the two rules are not the same rule
    expect(isSingleObjectUnder(imported, `${TENANT}/`)).toBe(false);
  });

  it("passes an imported file name containing a percent, which is not a climb", () => {
    expect(hasTraversalSegment(`${TENANT}/migration/fisiozero/100%25-alta.pdf`)).toBe(false);
  });

  it.each([
    ["a literal climb", `${TENANT}/${RECORD}/../migration/x.pdf`],
    ["a percent-encoded climb", `${TENANT}/${RECORD}/%2e%2e/migration/x.pdf`],
    ["a bare current-directory segment", `${TENANT}/./${RECORD}/x.pdf`],
    ["a trailing climb", `${TENANT}/${RECORD}/..`],
    ["a malformed escape, refused rather than guessed at", `${TENANT}/${RECORD}/%zz`],
  ])("refuses %s", (_label, path) => {
    expect(hasTraversalSegment(path)).toBe(true);
  });

  it("does not refuse a name that merely CONTAINS dots", () => {
    expect(hasTraversalSegment(`${TENANT}/${RECORD}/relatorio..final.pdf`)).toBe(false);
    expect(hasTraversalSegment(`${TENANT}/${RECORD}/..hidden.pdf`)).toBe(false);
  });
});
