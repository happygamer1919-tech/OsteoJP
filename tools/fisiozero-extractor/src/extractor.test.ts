import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendCheckpoint } from "./checkpoint";
import {
  SessionExpiredError,
  type BinaryResponse,
  type FisiozeroClient,
  type TextResponse,
} from "./client";
import type { ExtractorConfig } from "./config";
import { extractPatient, runExtraction, type LoopDeps } from "./extractor";
import { decodePatientId } from "./ids";
import type { PatientManifest } from "./manifest";

const BASE = "https://app.fisiozero.pt";
const PAD = "x".repeat(400); // keep present bodies above the absent threshold

let root: string;
beforeEach(() => (root = mkdtempSync(join(tmpdir(), "fz-ext-"))));
afterEach(() => rmSync(root, { recursive: true, force: true }));

function cfg(overrides: Partial<ExtractorConfig> = {}): ExtractorConfig {
  return {
    storageStatePath: "/unused",
    baseUrl: BASE,
    startId: 100,
    endId: 100,
    outDir: root,
    checkpointPath: join(root, "checkpoint.jsonl"),
    rateMinMs: 0,
    rateMaxMs: 0,
    retries: 0,
    backoffBaseMs: 0,
    requestTimeoutMs: 1000,
    ...overrides,
  };
}

const noWaitDeps: LoopDeps = { sleep: async () => {}, rng: () => 0 };

/**
 * Stateful fake of the PHP monolith: it tracks the active patient (set by the
 * op=r&action=ficha call) and serves per-patient bodies, exactly like the real
 * server-side session model the loop must respect.
 */
class FakeClient implements FisiozeroClient {
  activeId: number | null = null;
  failAttachment: string | null = null;
  throwLoginOn: string | null = null;
  constructor(private readonly present: Set<number>) {}

  private text(url: string, body: string): TextResponse {
    return { status: 200, url, body };
  }

  async getText(url: string): Promise<TextResponse> {
    if (this.throwLoginOn && url.includes(this.throwLoginOn)) throw new SessionExpiredError(url);
    const u = new URL(url);
    const op = u.searchParams.get("op");
    if (op === "r" && u.searchParams.get("action") === "ficha") {
      this.activeId = decodePatientId(u.searchParams.get("i") ?? "");
      return this.text(url, "active set " + PAD);
    }
    if (op === "editar_ficha") {
      if (this.activeId === null || !this.present.has(this.activeId)) {
        return this.text(url, "registo inexistente"); // short → absent
      }
      return this.text(url, `<h1>Ficha</h1><a href="user_rgpd_files/RG.pdf">RGPD</a>${PAD}`);
    }
    if (op === "osteo_epi") {
      // Real Fisiozero episode rows use href="#" with the target in an inline onclick.
      return this.text(url, `<a href="#" onclick="location.href='?op=r6&i=RTE1'">Ep1</a>${PAD}`);
    }
    if (op === "avl") return this.text(url, `<div>no evals</div>${PAD}`);
    if (op === "r6") {
      return this.text(url, `<h2>Episode</h2><a href="user_487/exam.png">Exam</a>${PAD}`);
    }
    if (op === "consultar_hist") return this.text(url, `<table>history</table>${PAD}`);
    return this.text(url, PAD);
  }

  async getBinary(url: string): Promise<BinaryResponse> {
    if (this.failAttachment && url.includes(this.failAttachment)) {
      return { status: 404, url, bytes: Buffer.alloc(0), contentType: "text/plain" };
    }
    if (url.includes("export_ficha_utente.php")) {
      return { status: 200, url, bytes: Buffer.from("XLSDATA"), contentType: "application/vnd.ms-excel" };
    }
    return { status: 200, url, bytes: Buffer.from("FILE"), contentType: "application/octet-stream" };
  }

  async close(): Promise<void> {}
}

describe("extractPatient", () => {
  it("archives a present patient end-to-end with correct counts and manifest", async () => {
    const client = new FakeClient(new Set([181882]));
    const r = await extractPatient(client, cfg({ startId: 181882, endId: 181882 }), 181882);

    expect(r.status).toBe("done");
    expect(r.episodes).toBe(1);
    expect(r.attachmentsDiscovered).toBe(2); // 1 on ficha + 1 on episode
    expect(r.attachmentsDownloaded).toBe(2);
    expect(r.xlsCaptured).toBe(true);

    const dir = join(root, "patients", "181882");
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as PatientManifest;
    const paths = manifest.files.map((f) => f.path).sort();
    expect(paths).toEqual([
      "attachments/RG.pdf",
      "attachments/exam.png",
      "consultar_hist.html",
      "episodes/episode-01.html",
      "export_ficha_utente.xls",
      "ficha.html",
      "lists/avl.html",
      "lists/osteo_epi.html",
    ]);
  });

  it("records an absent (gapped) id without creating a folder or erroring", async () => {
    const client = new FakeClient(new Set()); // nobody present
    const r = await extractPatient(client, cfg(), 174160);
    expect(r.status).toBe("absent");
    expect(existsSync(join(root, "patients", "174160"))).toBe(false);
  });

  it("surfaces an attachment miss as a discovered>downloaded delta, still done", async () => {
    const client = new FakeClient(new Set([200]));
    client.failAttachment = "exam.png";
    const r = await extractPatient(client, cfg(), 200);
    expect(r.status).toBe("done");
    expect(r.attachmentsDiscovered).toBe(2);
    expect(r.attachmentsDownloaded).toBe(1);
  });
});

describe("runExtraction", () => {
  it("checkpoints every patient and skips already-done ids on resume", async () => {
    const config = cfg({ startId: 1, endId: 3 });
    appendCheckpoint(config.checkpointPath, {
      id: 2,
      status: "done",
      episodes: 0,
      attachmentsDiscovered: 0,
      attachmentsDownloaded: 0,
      xlsCaptured: true,
      ts: new Date().toISOString(),
    });
    const client = new FakeClient(new Set([1, 2, 3]));
    const summary = await runExtraction(client, config, noWaitDeps);

    expect(summary.skipped).toBe(1); // id 2 already done
    expect(summary.attempted).toBe(2); // ids 1 and 3
    expect(summary.done).toBe(2);
  });

  it("stops at --limit valid patients (absents don't count)", async () => {
    const config = cfg({ startId: 1, endId: 10, limit: 2 });
    const client = new FakeClient(new Set([2, 4, 6, 8])); // 1 and 3 absent first
    const summary = await runExtraction(client, config, noWaitDeps);
    expect(summary.done).toBe(2);
    expect(summary.absent).toBe(2); // ids 1 and 3 hit before 2 present patients done
  });

  it("aborts the whole run on a session expiry (fatal, never swallowed)", async () => {
    const config = cfg({ startId: 1, endId: 5 });
    const client = new FakeClient(new Set([1, 2, 3, 4, 5]));
    client.throwLoginOn = "consultar_hist";
    await expect(runExtraction(client, config, noWaitDeps)).rejects.toBeInstanceOf(SessionExpiredError);
  });
});
