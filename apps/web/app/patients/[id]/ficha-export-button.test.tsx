import { Button } from "@osteojp/ui";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ficha-export-button.test.tsx: EXPORT-01. WHAT "Exportar ficha" DOES WHEN IT
 * IS PRESSED.
 *
 *   - it asks the whole-patient export's action for THIS patient, once;
 *   - a URL: the browser is sent to it, and no error line shows;
 *   - no URL (a refusal or a failure, which the action answers alike): the
 *     error line shows, as an alert, and the browser goes nowhere.
 *
 * Tested without a DOM, as episode-pdf-button.test.tsx tests a group's button:
 * the component is called as a plain function with its hooks replaced.
 * WHETHER the tab shows the button is page-ficha-export.test.tsx's.
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
      if (i >= hooks.slots.length) hooks.slots[i] = initial;
      const set = (next: unknown) => {
        hooks.slots[i] = next;
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
vi.mock("./ficha-pdf-actions", () => ({ downloadPatientFichaUrlAction: vi.fn() }));

import { FichaExportButton } from "./ficha-export-button";
import { downloadPatientFichaUrlAction } from "./ficha-pdf-actions";

const mockAction = vi.mocked(downloadPatientFichaUrlAction);

const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const SIGNED = "https://storage.example/signed?token=opaque";
const LABEL = "Exportar ficha";
const ERROR = "Não foi possível gerar o PDF.";

type El = ReactElement<Record<string, unknown>>;

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

function render(): ReactNode {
  hooks.at = 0;
  return FichaExportButton({ patientId: PATIENT, label: LABEL, errorLabel: ERROR });
}

function button(node: ReactNode): El {
  const found = elements(node).filter((el) => el.type === Button);
  expect(found).toHaveLength(1);
  return found[0]!;
}
const alerts = (node: ReactNode): El[] => elements(node).filter((el) => el.props.role === "alert");

async function press(): Promise<ReactNode> {
  (button(render()).props.onClick as () => void)();
  await Promise.all(hooks.transitions);
  return render();
}

const assign = vi.fn();

beforeEach(() => {
  hooks.slots = [];
  hooks.at = 0;
  hooks.transitions = [];
  mockAction.mockReset();
  assign.mockReset();
  vi.stubGlobal("window", { location: { assign } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FichaExportButton", () => {
  it("draws one secondary button with the label, and asks the server nothing", () => {
    const tree = render();
    const b = button(tree);
    expect(b.props.children).toBe(LABEL);
    expect(b.props.type).toBe("button");
    expect(b.props.variant).toBe("secondary");
    expect(b.props["data-testid"]).toBe("ficha-export");
    expect(alerts(tree)).toEqual([]);
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("pressed: asks the whole-patient export once, for THIS patient", async () => {
    mockAction.mockResolvedValue({ url: SIGNED });
    await press();
    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockAction).toHaveBeenCalledWith(PATIENT);
  });

  it("a URL: the browser is sent to exactly that URL, and no error line shows", async () => {
    mockAction.mockResolvedValue({ url: SIGNED });
    const tree = await press();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(SIGNED);
    expect(alerts(tree)).toEqual([]);
  });

  it("no URL: the error line shows, as an alert with the label it was given, and the browser goes nowhere", async () => {
    mockAction.mockResolvedValue({ url: null });
    const tree = await press();
    const shown = alerts(tree);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.props.children).toBe(ERROR);
    expect(shown[0]!.props["data-testid"]).toBe("ficha-export-error");
    expect(assign).not.toHaveBeenCalled();
  });
});
