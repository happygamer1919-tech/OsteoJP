import { describe, expect, it } from "vitest";
import {
  extractAttachmentUrls,
  extractEpisodeUrls,
  extractHrefs,
  fileNameFromUrl,
  isFichaAbsent,
  looksLikeLogin,
} from "./html";

const BASE = "https://app.fisiozero.pt";

describe("extractHrefs", () => {
  it("extracts single- and double-quoted hrefs in document order", () => {
    const html = `<a href="a.html">A</a> <a href='b.html'>B</a>`;
    expect(extractHrefs(html)).toEqual(["a.html", "b.html"]);
  });
});

describe("extractAttachmentUrls", () => {
  it("keeps only attachment-path hrefs, resolves and de-dupes them", () => {
    const html = `
      <a href="user_rgpd_files/HASH1.pdf">RGPD</a>
      <a href="/user_487/exam.png">Exam</a>
      <a href="index.php?op=editar_ficha">Edit</a>
      <a href="user_rgpd_files/HASH1.pdf">RGPD dup</a>
    `;
    expect(extractAttachmentUrls(BASE, html)).toEqual([
      "https://app.fisiozero.pt/user_rgpd_files/HASH1.pdf",
      "https://app.fisiozero.pt/user_487/exam.png",
    ]);
  });

  it("ignores anchors and javascript hrefs", () => {
    const html = `<a href="#">x</a><a href="javascript:void(0)">y</a>`;
    expect(extractAttachmentUrls(BASE, html)).toEqual([]);
  });
});

describe("extractEpisodeUrls", () => {
  it("returns scraped osteo_epi_new links, never constructed ones", () => {
    const html = `
      <a href="index.php?op=osteo_epi_new&e=ENC1">Ep1</a>
      <a href="index.php?op=osteo_epi_new&e=ENC2">Ep2</a>
      <a href="index.php?op=avl">other</a>
    `;
    expect(extractEpisodeUrls(BASE, html)).toEqual([
      "https://app.fisiozero.pt/index.php?op=osteo_epi_new&e=ENC1",
      "https://app.fisiozero.pt/index.php?op=osteo_epi_new&e=ENC2",
    ]);
  });
});

describe("looksLikeLogin", () => {
  it("flags a login redirect by url", () => {
    expect(looksLikeLogin("https://app.fisiozero.pt/index.php?op=login", "<html></html>")).toBe(true);
  });
  it("flags a login screen by body marker", () => {
    expect(looksLikeLogin("https://app.fisiozero.pt/index.php?op=editar_ficha", '<input name="password">')).toBe(true);
  });
  it("does not flag a normal patient page", () => {
    expect(looksLikeLogin("https://app.fisiozero.pt/index.php?op=editar_ficha", "<h1>Ficha do Utente</h1>")).toBe(false);
  });
});

describe("isFichaAbsent", () => {
  it("treats an explicit not-found marker as absent", () => {
    expect(isFichaAbsent("Registo inexistente." + "x".repeat(400))).toBe(true);
  });
  it("treats a too-short body as absent", () => {
    expect(isFichaAbsent("<html></html>")).toBe(true);
  });
  it("treats a full ficha as present", () => {
    expect(isFichaAbsent("<h1>Ficha</h1>" + "x".repeat(400))).toBe(false);
  });
});

describe("fileNameFromUrl", () => {
  it("returns the basename of the url path", () => {
    expect(fileNameFromUrl("https://app.fisiozero.pt/user_rgpd_files/HASH1.pdf")).toBe("HASH1.pdf");
  });
  it("falls back to 'attachment' when there is no path", () => {
    expect(fileNameFromUrl("https://app.fisiozero.pt/")).toBe("attachment");
  });
});
