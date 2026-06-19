import { describe, expect, it } from "vitest";
import {
  extractAttachmentUrls,
  extractEpisodePdfUrls,
  extractEpisodeUrls,
  extractHrefs,
  extractOnclickTargets,
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

describe("extractOnclickTargets", () => {
  it("extracts single-quoted URL from double-quoted onclick attribute", () => {
    const html = `<a href="#" onclick="location.href='?op=r6&i=ABC'">row</a>`;
    expect(extractOnclickTargets(html)).toEqual(["?op=r6&i=ABC"]);
  });

  it("extracts double-quoted URL from single-quoted onclick attribute", () => {
    const html = `<a href='#' onclick='location.href="?op=r6&i=ABC"'>row</a>`;
    expect(extractOnclickTargets(html)).toEqual(["?op=r6&i=ABC"]);
  });

  it("handles window.location.href and is case-insensitive on onClick", () => {
    const html = `<div onClick="window.location.href='?op=lembretes'"></div>`;
    expect(extractOnclickTargets(html)).toEqual(["?op=lembretes"]);
  });

  it("returns multiple targets in document order", () => {
    const html = `
      <a onclick="location.href='?op=r6&i=AAA'"></a>
      <a onclick="location.href='?op=r6&i=BBB'"></a>
    `;
    expect(extractOnclickTargets(html)).toEqual(["?op=r6&i=AAA", "?op=r6&i=BBB"]);
  });
});

describe("extractEpisodeUrls", () => {
  it("returns op=r6 onclick targets and ignores the new-episode button href", () => {
    // Fixture mirrors a real Fisiozero osteo_epi.html with one episode row:
    // - two cells both fire location.href='?op=r6&i=...' (should be deduped to one URL)
    // - the add-evaluation icon fires op=r7 (must NOT be captured)
    // - the PDF link is a plain href (must NOT be captured — not op=r6)
    // - the new-episode button is href="?op=osteo_epi_new&i=1" (must NOT be captured)
    const html = `
      <table>
        <tr>
          <td><a href='#' onClick="location.href='?op=r6&i=ABC123'">2025-07-08</a></td>
          <td><a href='#' onClick="location.href='?op=r6&i=ABC123'">Episode title</a></td>
          <td>
            <a target='_blank' href='export_pdf_osteopatia2.php?i=ABC123&u=DEF456'></a>
            <a href='#'><i onClick="location.href='?op=r7&i=ABC123'"></i></a>
          </td>
        </tr>
      </table>
      <a href="?op=osteo_epi_new&i=1"><i class="fa fa-plus-circle"></i></a>
    `;
    expect(extractEpisodeUrls(BASE, html)).toEqual([
      "https://app.fisiozero.pt/?op=r6&i=ABC123",
    ]);
  });

  it("returns episode hrefs when a custom pattern is supplied (backward-compat)", () => {
    const html = `
      <a href="index.php?op=osteo_epi_new&e=ENC1">Ep1</a>
      <a href="index.php?op=osteo_epi_new&e=ENC2">Ep2</a>
      <a href="index.php?op=avl">other</a>
    `;
    expect(extractEpisodeUrls(BASE, html, ["osteo_epi_new"])).toEqual([
      "https://app.fisiozero.pt/index.php?op=osteo_epi_new&e=ENC1",
      "https://app.fisiozero.pt/index.php?op=osteo_epi_new&e=ENC2",
    ]);
  });

  it("does not match op=r60 when pattern is op=r6", () => {
    const html = `<a href='#' onclick="location.href='?op=r60&i=ABC'"></a>`;
    expect(extractEpisodeUrls(BASE, html)).toEqual([]);
  });
});

describe("extractEpisodePdfUrls", () => {
  it("returns the absolute PDF URL from an export_pdf_osteopatia2.php href", () => {
    // Mirrors a real osteo_epi.html episode row: PDF icon link is a plain <a href>.
    const html = `
      <td>
        <a href='#' onClick="location.href='?op=r6&i=ABC'">2025-07-08</a>
      </td>
      <td>
        <a target='_blank' href='export_pdf_osteopatia2.php?i=ABC&u=XYZ'>
          <i class="fa fa-file-pdf-o"></i>
        </a>
      </td>
    `;
    expect(extractEpisodePdfUrls(BASE, html)).toEqual([
      "https://app.fisiozero.pt/export_pdf_osteopatia2.php?i=ABC&u=XYZ",
    ]);
  });

  it("deduplicates the same PDF URL appearing in both list pages", () => {
    const href = `<a href='export_pdf_osteopatia2.php?i=AAA&u=BBB'></a>`;
    const combined = href + "\n" + href;
    expect(extractEpisodePdfUrls(BASE, combined)).toHaveLength(1);
  });

  it("does not return op=r6 or osteo_epi_new links", () => {
    const html = `
      <a href='#' onclick="location.href='?op=r6&i=ABC'"></a>
      <a href='?op=osteo_epi_new&i=1'></a>
    `;
    expect(extractEpisodePdfUrls(BASE, html)).toEqual([]);
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
