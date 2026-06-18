import { describe, expect, it } from "vitest";
import { opUrl, resolveHref, setActiveUrl, xlsExportUrl } from "./urls";

const BASE = "https://app.fisiozero.pt";

describe("url builders", () => {
  it("set-active url carries the base64 i= param, url-encoded", () => {
    // 181882 -> MTgxODgy (no special chars here)
    expect(setActiveUrl(BASE, 181882)).toBe(
      "https://app.fisiozero.pt/index.php?op=r&action=ficha&i=MTgxODgy",
    );
  });

  it("url-encodes base64 padding/+// in the i= param", () => {
    // pick an id whose base64 contains '=' padding
    const url = setActiveUrl(BASE, 1); // base64("1") = "MQ=="
    expect(url).toContain("i=MQ%3D%3D");
    expect(url).not.toContain("=="); // raw padding must be escaped
  });

  it("builds fixed op pages and the xls export", () => {
    expect(opUrl(BASE, "editar_ficha")).toBe("https://app.fisiozero.pt/index.php?op=editar_ficha");
    expect(xlsExportUrl(BASE)).toBe("https://app.fisiozero.pt/export_ficha_utente.php");
  });

  it("tolerates a trailing slash on the base url", () => {
    expect(opUrl("https://app.fisiozero.pt/", "avl")).toBe(
      "https://app.fisiozero.pt/index.php?op=avl",
    );
  });

  it("resolves relative scraped hrefs against the base", () => {
    expect(resolveHref(BASE, "user_rgpd_files/abc.pdf")).toBe(
      "https://app.fisiozero.pt/user_rgpd_files/abc.pdf",
    );
    expect(resolveHref(BASE, "/user_123/scan.png")).toBe(
      "https://app.fisiozero.pt/user_123/scan.png",
    );
  });
});
