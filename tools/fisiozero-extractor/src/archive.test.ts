import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PatientArchive } from "./archive";
import type { PatientManifest } from "./manifest";

let root: string;
beforeEach(() => (root = mkdtempSync(join(tmpdir(), "fz-arch-"))));
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("PatientArchive", () => {
  it("writes artifacts and a manifest with sha256 + byte counts, manifest last", () => {
    const a = new PatientArchive(root, 181882, "https://app.fisiozero.pt", "MTgxODgy");
    a.addText("ficha.html", "ficha_html", "https://x/ficha", "<h1>F</h1>");
    a.addBinary("export_ficha_utente.xls", "xls", "https://x/xls", Buffer.from("XLSDATA"));
    const manifest = a.finalize({
      episodes: 0,
      episodePdfsDiscovered: 0,
      episodePdfsDownloaded: 0,
      attachmentsDiscovered: 0,
      attachmentsDownloaded: 0,
      xlsCaptured: true,
      historyCaptured: true,
    });

    const dir = join(root, "patients", "181882");
    expect(existsSync(join(dir, "ficha.html"))).toBe(true);
    expect(existsSync(join(dir, "export_ficha_utente.xls"))).toBe(true);

    const onDisk = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as PatientManifest;
    expect(onDisk.patientId).toBe(181882);
    expect(onDisk.source.iParam).toBe("MTgxODgy");
    expect(onDisk.files).toHaveLength(2);
    expect(onDisk.files.find((f) => f.path === "export_ficha_utente.xls")?.bytes).toBe(7);
    expect(manifest.counts.xlsCaptured).toBe(true);
  });

  it("disambiguates colliding attachment basenames so none are overwritten", () => {
    const a = new PatientArchive(root, 1, "https://app.fisiozero.pt", "MQ==");
    expect(a.reserveAttachmentPath("scan.pdf")).toBe("attachments/scan.pdf");
    expect(a.reserveAttachmentPath("scan.pdf")).toBe("attachments/1_scan.pdf");
    expect(a.reserveAttachmentPath("scan.pdf")).toBe("attachments/2_scan.pdf");
  });
});
