import { Button, DatePicker, Dialog, TimeField } from "@osteojp/ui";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * R45 (strategy, 2026-10-06): the Declaração is unavailable at a location with
 * no carimbo, "with a plain notice to staff". Notice wording approved:
 * "Declaração indisponível neste local: falta o carimbo. Contacte a
 * administração."
 *
 * declaracao-actions.test.tsx proves the action REPORTS the refusal. This file
 * proves the dialog SHOWS it: the approved sentence, in the dialog's alert, and
 * not the generic "could not generate" line.
 *
 * HOW A CLICK IS TESTED WITHOUT A DOM. This suite has no jsdom (vitest runs in
 * node), so, as app/dashboard/url-carry.test.tsx does, the component is called
 * as a plain function with its hooks replaced: useState keeps its values in a
 * list between calls, and useTransition runs the transition at once and keeps
 * its promise. The returned element tree is searched for the control, its
 * handler is invoked, and the component is called again to read what it now
 * renders. Everything inside DeclaracaoDialog is the real code.
 *
 * IT IS NOT EVIDENCE ABOUT A SCREEN. That a real click on the running app shows
 * the sentence is an end-to-end question.
 */

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  at: 0,
  transitions: [] as Promise<unknown>[],
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.at++;
      if (i >= hooks.slots.length) {
        hooks.slots[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      const set = (next: unknown) => {
        hooks.slots[i] =
          typeof next === "function" ? (next as (prev: unknown) => unknown)(hooks.slots[i]) : next;
      };
      return [hooks.slots[i], set];
    },
    useTransition: () => [
      false,
      (run: () => unknown) => {
        hooks.transitions.push(Promise.resolve(run()));
      },
    ],
  };
});
vi.mock("./declaracao-actions", () => ({ generateDeclaracaoUrlAction: vi.fn() }));

import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import {
  DeclaracaoDialog,
  type DeclaracaoAppointment,
  type DeclaracaoLocation,
} from "./DeclaracaoDialog";
import { generateDeclaracaoUrlAction } from "./declaracao-actions";

const mockAction = vi.mocked(generateDeclaracaoUrlAction);
const s = getStrings(DEFAULT_LOCALE);

/** The approved wording, word for word. NOT read from the dictionary. */
const NOTICE = "Declaração indisponível neste local: falta o carimbo. Contacte a administração.";

// The locations a manual entry may choose from, as the page hands them over
// (listDeclaracaoLocations). Invented ids; stored names.
const LV: DeclaracaoLocation = { id: "00000000-0000-4000-8000-0000000000a1", name: "OsteoJP (LV)" };
const CB: DeclaracaoLocation = { id: "00000000-0000-4000-8000-0000000000a2", name: "OsteoJP (CB)" };
const MN: DeclaracaoLocation = {
  id: "00000000-0000-4000-8000-0000000000a3",
  name: "OsteoJP (Montemor-o-Novo)",
};

// A marcação at the location that has no carimbo yet.
const APPT: DeclaracaoAppointment = {
  id: "00000000-0000-4000-8000-0000000000d1",
  startsAt: "2022-03-15T09:30:00.000Z",
  endsAt: "2022-03-15T10:30:00.000Z",
  locationId: MN.id,
  locationName: MN.name,
};
// A second marcação, at a clinic that has one.
const APPT_LV: DeclaracaoAppointment = {
  id: "00000000-0000-4000-8000-0000000000d2",
  startsAt: "2022-04-20T14:00:00.000Z",
  endsAt: "2022-04-20T15:00:00.000Z",
  locationId: LV.id,
  locationName: LV.name,
};

type El = ReactElement<Record<string, unknown>>;

/** Every element in a returned tree, depth first. */
function elements(node: ReactNode): El[] {
  const out: El[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    const el = n as El;
    out.push(el);
    walk(el.props.children as ReactNode);
  };
  walk(node);
  return out;
}

/** What a manual entry may choose from in the current test. */
let offered: DeclaracaoLocation[] = [LV, CB, MN];

/** Call the component again, as React would after a state change. */
function render(): ReactNode {
  hooks.at = 0;
  return DeclaracaoDialog({
    patientId: "p1",
    appointments: [APPT, APPT_LV],
    locations: offered,
    patientNif: "123456789",
  });
}

/** The one element matching `match`, so a second one fails loudly. */
function only(node: ReactNode, match: (el: El) => boolean): El {
  const found = elements(node).filter(match);
  expect(found).toHaveLength(1);
  return found[0]!;
}

const alerts = (node: ReactNode): El[] => elements(node).filter((el) => el.props.role === "alert");

const byTestId = (id: string) => (el: El) => el.props["data-testid"] === id;
type Change = (e: { target: { value: string } }) => void;

/** Open the dialog. It opens on "Introdução manual". */
function openDialog(): void {
  (only(render(), (el) => el.type === Button).props.onClick as () => void)();
}
/** Choose a marcação by id; "" is "Introdução manual". */
function chooseMarcacao(id: string): void {
  (only(render(), byTestId("declaracao-marcacao")).props.onChange as Change)({ target: { value: id } });
}
/** Choose the manual entry's location. */
function chooseLocation(id: string): void {
  (only(render(), byTestId("declaracao-location")).props.onChange as Change)({ target: { value: id } });
}
/** Fill what a manual entry types: the date and the two times. */
function fillManualDateAndTimes(): void {
  type Set = (v: string) => void;
  (only(render(), (el) => el.type === DatePicker).props.onChange as Set)("2026-07-12");
  // Início first (it defaults Fim to an hour later), then Fim, each on a fresh
  // render so the handler sees the state the one before it left.
  const timeFields = () => elements(render()).filter((el) => el.type === TimeField);
  expect(timeFields()).toHaveLength(2);
  (timeFields()[0]!.props.onChange as Set)("14:00");
  (timeFields()[1]!.props.onChange as Set)("15:30");
}
/** Press Gerar and let the action settle. */
async function pressGerar(): Promise<ReactNode> {
  (only(render(), (el) => el.type === Dialog).props.onConfirm as () => void)();
  await Promise.all(hooks.transitions);
  return render();
}

/** Open the dialog, choose the marcação, press Gerar, and let the action settle. */
async function generateForTheMarcacao(): Promise<ReactNode> {
  openDialog();
  chooseMarcacao(APPT.id);
  return pressGerar();
}

const open = vi.fn();

beforeEach(() => {
  hooks.slots = [];
  hooks.at = 0;
  hooks.transitions = [];
  offered = [LV, CB, MN];
  mockAction.mockReset();
  open.mockReset();
  vi.stubGlobal("window", { open });
});

describe("R45 - the dialog shows the approved notice when the location has no carimbo", () => {
  it("the dictionary holds the approved wording, and it is not the generic failure line", () => {
    expect(s["documents.declaracao.noStamp"]).toBe(NOTICE);
    expect(s["documents.declaracao.noStamp"]).not.toBe(s["documents.declaracao.error"]);
    expect(getStrings("en")["documents.declaracao.noStamp"]).toBe(
      "Declaração unavailable at this location: the stamp is missing. Contact the administration.",
    );
  });

  it("a refused declaration: the notice is in the alert, the dialog stays open, nothing opens", async () => {
    mockAction.mockResolvedValue({ url: null, refused: "no_stamp" });

    const tree = await generateForTheMarcacao();

    // The action was asked about the MARCAÇÃO's location.
    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockAction).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: "p1",
        locationId: APPT.locationId,
        date: "2022-03-15",
        startTime: "09:30",
        endTime: "10:30",
      }),
    );
    const shown = alerts(tree);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.props.children).toBe(NOTICE);
    expect(only(tree, (el) => el.type === Dialog).props.open).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it("any OTHER failure keeps the generic line, so the notice means what it says", async () => {
    mockAction.mockResolvedValue({ url: null });

    const tree = await generateForTheMarcacao();

    const shown = alerts(tree);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.props.children).toBe(s["documents.declaracao.error"]);
    expect(shown[0]!.props.children).not.toBe(NOTICE);
    expect(open).not.toHaveBeenCalled();
  });

  it("a produced declaration shows no alert at all: it opens, and the dialog closes", async () => {
    mockAction.mockResolvedValue({ url: "https://storage.example/signed?token=abc" });

    const tree = await generateForTheMarcacao();

    expect(alerts(tree)).toHaveLength(0);
    expect(open).toHaveBeenCalledWith(
      "https://storage.example/signed?token=abc",
      "_blank",
      "noopener,noreferrer",
    );
    expect(only(tree, (el) => el.type === Dialog).props.open).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R45: A MANUAL ENTRY NAMES ITS LOCATION. A declaration carries one clinic's
// carimbo, so its location is given: a marcação brings its own, and a manual
// entry, which has none, is asked. The action is never sent a manual entry
// with no location, and the server refuses one that arrives anyway
// (declaracao-actions.test.tsx, lib/clinical/declaracao/generate.test.ts).
// ---------------------------------------------------------------------------
describe("R45 - the location choice of a manual entry", () => {
  const locationFields = (tree: ReactNode) => ({
    select: elements(tree).filter(byTestId("declaracao-location")),
    fixed: elements(tree).filter(byTestId("declaracao-location-fixed")),
  });

  it("is shown for a manual entry, and NOT once a marcação is chosen", () => {
    openDialog();
    // The dialog opens on "Introdução manual".
    expect(locationFields(render()).select).toHaveLength(1);

    chooseMarcacao(APPT_LV.id);
    expect(locationFields(render())).toEqual({ select: [], fixed: [] });

    chooseMarcacao("");
    expect(locationFields(render()).select).toHaveLength(1);
  });

  it("is REQUIRED, starts with nothing chosen, and is labelled with the existing staff strings", () => {
    openDialog();
    const tree = render();
    const select = only(tree, byTestId("declaracao-location"));
    expect(select.type).toBe("select");
    expect(select.props.required).toBe(true);
    expect(select.props["aria-required"]).toBe("true");
    expect(select.props.value).toBe("");
    // The label every other staff form puts on a location select.
    const label = only(
      tree,
      (el) => el.type === "label" && elements(el.props.children as ReactNode).includes(select),
    );
    expect(elements(label.props.children as ReactNode)[0]!.props.children).toBe(s["header.location"]);
    expect(s["header.location"]).toBe("Localização");
  });

  it("lists ONLY the locations it was given, in that order, under their stored names", () => {
    offered = [CB, MN];
    openDialog();
    const select = only(render(), byTestId("declaracao-location"));
    const options = elements(select.props.children as ReactNode).filter((el) => el.type === "option");
    expect(options.map((o) => [o.props.value, o.props.children])).toEqual([
      ["", s["appointment.selectLocation"]],
      [CB.id, "OsteoJP (CB)"],
      [MN.id, "OsteoJP (Montemor-o-Novo)"],
    ]);
    // Linda-a-Velha was not offered, so it is nowhere in the control.
    expect(options.some((o) => o.props.value === LV.id)).toBe(false);
  });

  it("sends the location that was chosen", async () => {
    mockAction.mockResolvedValue({ url: "https://storage.example/signed?token=abc" });
    openDialog();
    chooseLocation(CB.id);
    expect(only(render(), byTestId("declaracao-location")).props.value).toBe(CB.id);
    fillManualDateAndTimes();

    await pressGerar();

    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockAction).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: CB.id, date: "2026-07-12", startTime: "14:00", endTime: "15:30" }),
    );
  });

  it("with NO location chosen: the existing required-fields message, and the action is not called", async () => {
    openDialog();
    fillManualDateAndTimes();

    const tree = await pressGerar();

    expect(mockAction).not.toHaveBeenCalled();
    const shown = alerts(tree);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.props.children).toBe(s["appointment.requiredFields"]);
    expect(s["appointment.requiredFields"]).toBe("Preencha os campos obrigatórios.");
  });

  it("a SOLE location is applied as it stands and shown as a line, with nothing to choose", async () => {
    offered = [CB];
    mockAction.mockResolvedValue({ url: "https://storage.example/signed?token=abc" });
    openDialog();

    const { select, fixed } = locationFields(render());
    expect(select).toHaveLength(0);
    expect(fixed).toHaveLength(1);
    expect(fixed[0]!.props.children).toBe("OsteoJP (CB)");

    fillManualDateAndTimes();
    await pressGerar();

    expect(mockAction).toHaveBeenCalledWith(expect.objectContaining({ locationId: CB.id }));
  });

  it("with NO location to offer, a manual entry cannot be sent at all", async () => {
    offered = [];
    openDialog();
    fillManualDateAndTimes();

    const tree = await pressGerar();

    expect(mockAction).not.toHaveBeenCalled();
    expect(alerts(tree)[0]!.props.children).toBe(s["appointment.requiredFields"]);
  });

  it("a marcação sends ITS location, not one chosen by hand a moment before", async () => {
    mockAction.mockResolvedValue({ url: "https://storage.example/signed?token=abc" });
    openDialog();
    chooseLocation(CB.id);
    chooseMarcacao(APPT_LV.id);

    await pressGerar();

    expect(mockAction).toHaveBeenCalledWith(expect.objectContaining({ locationId: LV.id }));
  });

  it("back on manual entry, the marcação's location is NOT kept: it must be chosen again", async () => {
    openDialog();
    chooseMarcacao(APPT_LV.id);
    chooseMarcacao("");
    expect(only(render(), byTestId("declaracao-location")).props.value).toBe("");
    fillManualDateAndTimes();

    await pressGerar();

    expect(mockAction).not.toHaveBeenCalled();
  });

  it("back on manual entry with a sole location, that one is used, not the marcação's", async () => {
    offered = [CB];
    mockAction.mockResolvedValue({ url: "https://storage.example/signed?token=abc" });
    openDialog();
    chooseMarcacao(APPT_LV.id);
    chooseMarcacao("");
    fillManualDateAndTimes();

    await pressGerar();

    expect(mockAction).toHaveBeenCalledWith(expect.objectContaining({ locationId: CB.id }));
  });
});

describe("R45 - the notice does not outlive the selection it was about", () => {
  async function refusedAtTheMarcacao(): Promise<void> {
    mockAction.mockResolvedValue({ url: null, refused: "no_stamp" });
    const tree = await generateForTheMarcacao();
    expect(alerts(tree)[0]!.props.children).toBe(NOTICE);
  }

  it("choosing ANOTHER marcação clears it", async () => {
    await refusedAtTheMarcacao();
    chooseMarcacao(APPT_LV.id);
    expect(alerts(render())).toHaveLength(0);
  });

  it("switching to manual entry clears it", async () => {
    await refusedAtTheMarcacao();
    chooseMarcacao("");
    expect(alerts(render())).toHaveLength(0);
  });

  it("changing the manual location clears it", async () => {
    mockAction.mockResolvedValue({ url: null, refused: "no_stamp" });
    openDialog();
    chooseLocation(MN.id);
    fillManualDateAndTimes();
    expect(alerts(await pressGerar())[0]!.props.children).toBe(NOTICE);

    chooseLocation(CB.id);
    expect(alerts(render())).toHaveLength(0);
  });
});
