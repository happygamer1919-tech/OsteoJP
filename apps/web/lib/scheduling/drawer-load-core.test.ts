import { describe, expect, it } from "vitest";

import {
  PIECE_ORDER,
  availabilityKey,
  collectPieces,
  drawerPieceKeys,
  linkableKey,
  pieceWanted,
  readDrawerLoadInput,
  type DrawerLoadInput,
  type PieceName,
  type PieceRunners,
} from "./drawer-load-core";

/**
 * SKEW-01 PR 2 - the loader's pure core: which pieces run, in what order, one
 * at a time, and what a failing piece turns into.
 */

const INPUT: DrawerLoadInput = {
  appointmentId: "appt-1",
  patientId: "pat-1",
  therapistId: "ther-1",
  date: "2026-10-01",
  locationId: "loc-1",
};

const VALUES = {
  availability: { ok: true as const, data: { date: "2026-10-01", working: [], booked: [], blocks: [], closures: [], free: [] } },
  notes: { ok: true, notes: [] },
  contraindications: { epilepsy: true, pregnancy: false, pacemaker: false },
  noSms: "landline" as const,
  linkable: { blocked: null, linkedTo: null, options: [] },
};

/** Runners that record when each one starts and ends, resolving on the next tick. */
function recordingRunners(fail: Partial<Record<PieceName, unknown>> = {}) {
  const events: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const make = <K extends PieceName>(name: K) => async () => {
    events.push(`start ${name}`);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight -= 1;
    events.push(`end ${name}`);
    if (name in fail) throw fail[name];
    return VALUES[name] as never;
  };
  const runners = {
    availability: make("availability"),
    notes: make("notes"),
    contraindications: make("contraindications"),
    noSms: make("noSms"),
    linkable: make("linkable"),
  } as PieceRunners;
  return { runners, events, maxInFlight: () => maxInFlight };
}

const quietDeps = () => {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      rethrow: (e: unknown) => {
        calls.push(`rethrow ${String((e as Error)?.message ?? e)}`);
      },
      report: (piece: PieceName, e: unknown) => {
        calls.push(`report ${piece} ${String((e as Error)?.message ?? e)}`);
      },
    },
  };
};

describe("collectPieces", () => {
  it("runs every piece ONE AT A TIME, in the order the drawer used to send them", async () => {
    const { runners, events, maxInFlight } = recordingRunners();
    const out = await collectPieces(INPUT, runners, quietDeps().deps);
    expect(maxInFlight()).toBe(1);
    expect(events).toEqual(PIECE_ORDER.flatMap((n) => [`start ${n}`, `end ${n}`]));
    expect(PIECE_ORDER).toEqual(["availability", "notes", "contraindications", "noSms", "linkable"]);
    for (const name of PIECE_ORDER) expect(out[name]).toEqual({ status: "ok", value: VALUES[name] });
  });

  it("passes a refusal VALUE through untouched: { ok: false } is a value, not a failure", async () => {
    const { runners } = recordingRunners();
    runners.availability = async () => ({ ok: false, error: "forbidden" });
    const out = await collectPieces(INPUT, runners, quietDeps().deps);
    expect(out.availability).toEqual({ status: "ok", value: { ok: false, error: "forbidden" } });
  });

  it("catches each piece on its own: one throw fails that piece only, and the rest still run", async () => {
    const { runners, events } = recordingRunners({ noSms: new Error("boom") });
    const { deps, calls } = quietDeps();
    const out = await collectPieces(INPUT, runners, deps);
    expect(out.noSms).toEqual({ status: "error" });
    for (const name of PIECE_ORDER.filter((n) => n !== "noSms")) expect(out[name].status).toBe("ok");
    expect(events.at(-1)).toBe("end linkable");
    // unstable_rethrow runs FIRST in the catch, then the report.
    expect(calls).toEqual(["rethrow boom", "report noSms boom"]);
  });

  it("a control-flow signal leaves the loader: the rethrow is not swallowed, and no later piece runs", async () => {
    const signal = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    const { runners, events } = recordingRunners({ notes: signal });
    const reported: string[] = [];
    await expect(
      collectPieces(INPUT, runners, {
        rethrow: (e) => {
          if (e === signal) throw e;
        },
        report: (p) => {
          reported.push(p);
        },
      }),
    ).rejects.toBe(signal);
    expect(reported).toEqual([]);
    expect(events).not.toContain("start contraindications");
  });

  it("a report that throws or rejects never fails the loader", async () => {
    const { runners } = recordingRunners({ availability: new Error("a"), linkable: new Error("b") });
    let n = 0;
    const out = await collectPieces(INPUT, runners, {
      rethrow: () => {},
      report: () => {
        n += 1;
        if (n === 1) throw new Error("sentry down");
        return Promise.reject(new Error("sentry down"));
      },
    });
    expect(out.availability).toEqual({ status: "error" });
    expect(out.linkable).toEqual({ status: "error" });
    expect(out.notes.status).toBe("ok");
  });

  it("skips, without calling, every piece the drawer would never have fetched for this input", async () => {
    const { runners, events } = recordingRunners();
    const out = await collectPieces({ ...INPUT, patientId: "", date: "" }, runners, quietDeps().deps);
    expect(out.availability).toEqual({ status: "skipped" });
    expect(out.contraindications).toEqual({ status: "skipped" });
    expect(out.noSms).toEqual({ status: "skipped" });
    expect(out.notes.status).toBe("ok");
    expect(out.linkable.status).toBe("ok");
    expect(events).toEqual(["start notes", "end notes", "start linkable", "end linkable"]);
  });
});

describe("pieceWanted mirrors the drawer's own guards", () => {
  it("availability needs a therapist AND a date; the location may be empty", () => {
    expect(pieceWanted("availability", INPUT)).toBe(true);
    expect(pieceWanted("availability", { ...INPUT, locationId: "" })).toBe(true);
    expect(pieceWanted("availability", { ...INPUT, therapistId: "" })).toBe(false);
    expect(pieceWanted("availability", { ...INPUT, date: "" })).toBe(false);
  });
  it("the patient pieces need a patient; the appointment pieces an appointment", () => {
    expect(pieceWanted("contraindications", { ...INPUT, patientId: "" })).toBe(false);
    expect(pieceWanted("noSms", { ...INPUT, patientId: "" })).toBe(false);
    expect(pieceWanted("notes", { ...INPUT, appointmentId: "" })).toBe(false);
    expect(pieceWanted("linkable", { ...INPUT, appointmentId: "" })).toBe(false);
  });
});

describe("readDrawerLoadInput", () => {
  it("keeps strings and reads anything else as empty", () => {
    expect(readDrawerLoadInput(INPUT)).toEqual(INPUT);
    expect(readDrawerLoadInput({ ...INPUT, patientId: 7, date: null })).toEqual({ ...INPUT, patientId: "", date: "" });
    for (const raw of [null, undefined, "x", 3, []]) {
      expect(readDrawerLoadInput(raw)).toEqual({ appointmentId: "", patientId: "", therapistId: "", date: "", locationId: "" });
    }
  });
});

describe("the keys a piece is served for", () => {
  it("are the keys the consumers build: the panel's key, the ids, and the pacote tick 0", () => {
    expect(drawerPieceKeys(INPUT)).toEqual({
      availability: "ther-1|2026-10-01|loc-1",
      notes: "appt-1",
      contraindications: "pat-1",
      noSms: "pat-1",
      linkable: "appt-1|0",
    });
    expect(availabilityKey("ther-1", "2026-10-01", "loc-1")).toBe(drawerPieceKeys(INPUT).availability);
    expect(linkableKey("appt-1", 0)).toBe(drawerPieceKeys(INPUT).linkable);
    expect(linkableKey("appt-1", 1)).not.toBe(drawerPieceKeys(INPUT).linkable);
  });
});
