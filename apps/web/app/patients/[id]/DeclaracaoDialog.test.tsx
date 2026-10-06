import { Button, Dialog } from "@osteojp/ui";
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
import { DeclaracaoDialog, type DeclaracaoAppointment } from "./DeclaracaoDialog";
import { generateDeclaracaoUrlAction } from "./declaracao-actions";

const mockAction = vi.mocked(generateDeclaracaoUrlAction);
const s = getStrings(DEFAULT_LOCALE);

/** The approved wording, word for word. NOT read from the dictionary. */
const NOTICE = "Declaração indisponível neste local: falta o carimbo. Contacte a administração.";

// A marcação at the location that has no carimbo yet. Invented ids.
const APPT: DeclaracaoAppointment = {
  id: "00000000-0000-4000-8000-0000000000d1",
  startsAt: "2022-03-15T09:30:00.000Z",
  endsAt: "2022-03-15T10:30:00.000Z",
  locationId: "00000000-0000-4000-8000-0000000000a3",
  locationName: "OsteoJP (Montemor-o-Novo)",
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

/** Call the component again, as React would after a state change. */
function render(): ReactNode {
  hooks.at = 0;
  return DeclaracaoDialog({ patientId: "p1", appointments: [APPT], patientNif: "123456789" });
}

/** The one element matching `match`, so a second one fails loudly. */
function only(node: ReactNode, match: (el: El) => boolean): El {
  const found = elements(node).filter(match);
  expect(found).toHaveLength(1);
  return found[0]!;
}

const alerts = (node: ReactNode): El[] => elements(node).filter((el) => el.props.role === "alert");

/** Open the dialog, choose the marcação, press Gerar, and let the action settle. */
async function generateForTheMarcacao(): Promise<ReactNode> {
  (only(render(), (el) => el.type === Button).props.onClick as () => void)();
  const select = only(render(), (el) => el.props["data-testid"] === "declaracao-marcacao");
  (select.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: APPT.id } });
  (only(render(), (el) => el.type === Dialog).props.onConfirm as () => void)();
  await Promise.all(hooks.transitions);
  return render();
}

const open = vi.fn();

beforeEach(() => {
  hooks.slots = [];
  hooks.at = 0;
  hooks.transitions = [];
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
