// INC-06 regression guard, 2026-08-09.
//
// THE DEFECT THIS EXISTS FOR, stated as the production fact it was:
// two portal pedidos were created against osteojp-api on 2026-08-09 (09:02:52
// and 09:04:08). Both logged
//   [notifications] patient-change NOT DELIVERED (stub consumer, ...)
// and a LEFT JOIN to staff_notifications returned null for both. Reception never
// saw them; and because migration 0059 keys "unconfirmed pedido" on that
// notification row, both pedidos then BLOCKED a staff booking with "Conflito de
// terapeuta", inverting JP's option-B ruling in production.
//
// WHY NO EXISTING TEST CAUGHT IT, which is the thing worth fixing about the
// tests and not only about the code. Every suite that emitted first called
// setPatientChangeConsumer, so every suite tested a REGISTERED module. Nothing
// tested the state the booking bundle was actually in: a fresh module copy that
// nobody had registered and nobody could register. That state was the defect.
//
// SO THE SUBJECT HERE IS AN UNREGISTERED MODULE. Each case resets the module
// registry and imports patient-change fresh, exactly as a second bundled copy
// arrives at runtime, and asserts it delivers ANYWAY.
//
// PROVEN TO FAIL ON THE BROKEN CODE. The negative arm at the bottom is not a
// nicety: it reconstructs the pre-fix shape (an unregistered module whose emit
// falls through to the stub) and asserts that the same predicates this file
// applies to the real module DO fail against it. A guard that has never been
// seen red is a guard nobody has tested.

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PatientChangeEvent, ConsumerResult } from "./patient-change";

const EVENT: PatientChangeEvent = {
  kind: "appointment_request",
  tenantId: "11111111-1111-1111-1111-111111111111",
  appointmentId: "22222222-2222-2222-2222-222222222222",
  patientId: "33333333-3333-3333-3333-333333333333",
  audience: { reception: true, practitionerIds: ["44444444-4444-4444-4444-444444444444"] },
  previousStartsAt: "2026-08-10T09:00:00.000Z",
  newStartsAt: "2026-08-10T09:00:00.000Z",
  occurredAt: "2026-08-09T09:02:52.000Z",
};

/** The exact substring the two production log lines carried. */
const STUB_MARKER = "NOT DELIVERED (stub consumer";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("./centre");
});

/**
 * Import patient-change into a FRESH module registry with ./centre mocked, and
 * emit once without ever calling setPatientChangeConsumer.
 *
 * The mock is what keeps this a unit test: the real centre opens a database. It
 * mocks the MODULE THE CODE MUST REACH, not the seam the code used to be
 * configured through, so the assertion is "did it find the centre by itself".
 */
async function emitFromUnregisteredModule(): Promise<{
  result: ConsumerResult;
  reachedCentre: boolean;
  logged: string;
}> {
  vi.resetModules();
  const persisting = vi.fn(async () => ({ delivered: true }));
  vi.doMock("./centre", () => ({ persistingConsumer: persisting }));

  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  const { emitPatientChange } = await import("./patient-change");
  const result = await emitPatientChange(EVENT);

  return {
    result,
    reachedCentre: persisting.mock.calls.length === 1,
    logged: [...info.mock.calls, ...error.mock.calls].flat().map(String).join(" "),
  };
}

describe("INC-06: an unregistered module copy still delivers", () => {
  it("reaches the real centre consumer with no registration call whatsoever", async () => {
    const { reachedCentre } = await emitFromUnregisteredModule();
    expect(reachedCentre).toBe(true);
  });

  it("reports delivered:true, so nothing downstream reads it as a no-op", async () => {
    const { result } = await emitFromUnregisteredModule();
    expect(result.delivered).toBe(true);
  });

  it("never logs the stub line that both production pedidos logged", async () => {
    const { logged } = await emitFromUnregisteredModule();
    expect(logged).not.toContain(STUB_MARKER);
  });

  it("an EXPLICIT stub still wins, so the test seam is intact", async () => {
    vi.resetModules();
    const persisting = vi.fn(async () => ({ delivered: true }));
    vi.doMock("./centre", () => ({ persistingConsumer: persisting }));
    vi.spyOn(console, "info").mockImplementation(() => {});

    const mod = await import("./patient-change");
    mod.setPatientChangeConsumer(mod.stubConsumer);
    const result = await mod.emitPatientChange(EVENT);
    mod.resetPatientChangeConsumer();

    expect(result.delivered).toBe(false);
    expect(persisting).not.toHaveBeenCalled();
  });
});

/**
 * COMMENTS STRIPPED BEFORE EVERY SOURCE ASSERTION, and this file is the reason
 * the rule is not optional: both files below DESCRIBE the pre-fix shape at
 * length, in prose, because the incident is worth recording where it happened.
 * A predicate run over raw text matches those descriptions and goes red on
 * correct code — which is a guard that punishes documentation, the opposite of
 * what this one is for.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

async function readStripped(...segments: string[]): Promise<string> {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  return stripComments(readFileSync(join(__dirname, ...segments), "utf8"));
}

describe("INC-06: source shape - the stub is not the fallback", () => {
  it("emitPatientChange resolves ./centre and never falls back to stubConsumer", async () => {
    const src = await readStripped("patient-change.ts");

    expect(src).toMatch(/await import\(["']\.\/centre["']\)/);
    expect(src).not.toMatch(/^\s*let\s+consumer[^=]*=\s*stubConsumer/m);
    expect(src).not.toMatch(/(\?\?|\|\|)\s*stubConsumer/);
  });

  it("the boot hook does not register the consumer, because it cannot", async () => {
    const src = await readStripped("..", "..", "instrumentation.ts");

    expect(src).not.toMatch(/setPatientChangeConsumer\s*\(/);
  });

  it("the stripper does not blind the guard: a real call still matches", () => {
    const live = stripComments(
      ["// setPatientChangeConsumer(persistingConsumer);", "register(); setPatientChangeConsumer(x);"].join("\n"),
    );
    expect(live).toMatch(/setPatientChangeConsumer\s*\(/);
    expect(stripComments("// setPatientChangeConsumer(x);")).not.toMatch(
      /setPatientChangeConsumer\s*\(/,
    );
  });
});

/**
 * THE NEGATIVE ARM. Everything above passes on the fixed module; this proves the
 * predicates are the reason, by running them against a reconstruction of the
 * BROKEN one.
 *
 * `brokenModule` is the pre-INC-06 shape in six lines: a module-level consumer
 * initialised to a stub, a setter that a second bundled copy never receives, and
 * an emit that returns whatever the variable holds. If the assertions above are
 * doing real work, the same three must go red here.
 */
describe("INC-06 negative arm: the guard fails against the pre-fix shape", () => {
  function brokenModule() {
    const logs: string[] = [];
    const stub = async (): Promise<ConsumerResult> => {
      logs.push(`[notifications] patient-change ${STUB_MARKER}, centre not built yet)`);
      return { delivered: false };
    };
    let consumer: (e: PatientChangeEvent) => Promise<ConsumerResult> = stub;
    return {
      logs,
      setConsumer(next: typeof consumer) {
        consumer = next;
      },
      async emit(e: PatientChangeEvent) {
        return consumer(e);
      },
    };
  }

  it("the broken shape fails ALL THREE production assertions", async () => {
    const centre = vi.fn(async () => ({ delivered: true }));
    // A SECOND copy is registered, exactly as instrumentation.js did. The copy
    // under test is untouched - which was the whole defect.
    brokenModule().setConsumer(centre);

    const bookingCopy = brokenModule();
    const result = await bookingCopy.emit(EVENT);
    const logged = bookingCopy.logs.join(" ");

    expect(centre).not.toHaveBeenCalled();
    expect(result.delivered).toBe(false);
    expect(logged).toContain(STUB_MARKER);
  });

  it("the source-shape predicates reject the pre-fix source text", () => {
    const preFix = [
      "let consumer: PatientChangeConsumer = stubConsumer;",
      "export async function emitPatientChange(e) { return await consumer(e); }",
    ].join("\n");

    expect(preFix).not.toMatch(/await import\(["']\.\/centre["']\)/);
    expect(preFix).toMatch(/^\s*let\s+consumer[^=]*=\s*stubConsumer/m);
  });

  it("the boot-hook predicate rejects the pre-fix instrumentation", () => {
    const preFix = "setPatientChangeConsumer(persistingConsumer);";
    expect(preFix).toMatch(/setPatientChangeConsumer\s*\(/);
  });
});
