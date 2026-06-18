import { describe, expect, it } from "vitest";
import { manifestEntry, sha256 } from "./manifest";

describe("sha256", () => {
  it("matches known digests", () => {
    expect(sha256(Buffer.from(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("manifestEntry", () => {
  it("records path, kind, source url, digest and byte count", () => {
    const bytes = Buffer.from("hello");
    const entry = manifestEntry("ficha.html", "ficha_html", "https://x/y", bytes);
    expect(entry).toEqual({
      path: "ficha.html",
      kind: "ficha_html",
      sourceUrl: "https://x/y",
      sha256: sha256(bytes),
      bytes: 5,
    });
  });
});
