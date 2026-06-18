import { describe, expect, it } from "vitest";
import { buildConfig, parseArgs } from "./config";

describe("parseArgs", () => {
  it("parses --key value, --key=value, and bare booleans", () => {
    expect(parseArgs(["--limit", "8", "--out=/tmp/a", "--retry-failed"])).toEqual({
      limit: "8",
      out: "/tmp/a",
      "retry-failed": true,
    });
  });
});

const ENV = { FISIOZERO_STORAGE_STATE: "/secure/state.json" } as NodeJS.ProcessEnv;

describe("buildConfig", () => {
  it("applies documented defaults", () => {
    const c = buildConfig([], ENV);
    expect(c.baseUrl).toBe("https://app.fisiozero.pt");
    expect(c.startId).toBe(174159);
    expect(c.endId).toBe(199974);
    expect(c.rateMinMs).toBe(2000);
    expect(c.rateMaxMs).toBe(3000);
    expect(c.limit).toBeUndefined();
  });

  it("requires a storage state path", () => {
    expect(() => buildConfig([], {} as NodeJS.ProcessEnv)).toThrow(/FISIOZERO_STORAGE_STATE/);
  });

  it("honors the gated --limit flag", () => {
    expect(buildConfig(["--limit", "8"], ENV).limit).toBe(8);
  });

  it("rejects start > end", () => {
    expect(() => buildConfig(["--start", "10", "--end", "5"], ENV)).toThrow(/start/);
  });

  it("rejects a non-positive limit", () => {
    expect(() => buildConfig(["--limit", "0"], ENV)).toThrow(/limit/);
  });

  it("rejects an inverted rate window", () => {
    expect(() => buildConfig(["--rate-min", "5000", "--rate-max", "1000"], ENV)).toThrow(/rate/);
  });

  it("derives the checkpoint path under outDir by default", () => {
    const c = buildConfig(["--out", "/tmp/archive"], ENV);
    expect(c.checkpointPath).toBe("/tmp/archive/checkpoint.jsonl");
  });
});
