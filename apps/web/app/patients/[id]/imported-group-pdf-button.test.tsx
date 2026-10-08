import { Button } from "@osteojp/ui";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * imported-group-pdf-button.test.tsx: EXPORT-01. WHAT "PDF do episódio" ON AN
 * IMPORTED GROUP DOES WHEN IT IS PRESSED.
 *
 *   - it asks the IMPORTED group's action for THIS patient and THIS specialty,
 *     once;
 *   - a URL: the browser is sent to it, and no error line shows;
 *   - no URL (a refusal or a failure, which the action answers alike): the
 *     error line shows, as an alert, and the browser goes nowhere.
 *
 * Tested without a DOM, as episode-pdf-button.test.tsx tests the app episode's
 * button: the component is called as a plain function with its hooks replaced.
 * WHICH groups show the button is page-episode-pdf.test.tsx's.
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
vi.mock("./episode-pdf-actions", () => ({
  downloadEpisodeReportUrlAction: vi.fn(),
  downloadImportedGroupReportUrlAction: vi.fn(),
}));

import { downloadEpisodeReportUrlAction, downloadImportedGroupReportUrlAction } from "./episode-pdf-actions";
import { ImportedGroupPdfButton } from "./imported-group-pdf-button";

const mockAction = vi.mocked(downloadImportedGroupReportUrlAction);

const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const SIGNED = "https://storage.example/signed?token=opaque";
const LABEL = "PDF do episódio";
const ARIA = "Transferir o PDF do episódio: Osteopatia";
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
  return ImportedGroupPdfButton({
    patientId: PATIENT,
    specialty: "Osteopatia",
    label: LABEL,
    ariaLabel: ARIA,
    errorLabel: ERROR,
  });
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
  vi.mocked(downloadEpisodeReportUrlAction).mockReset();
  assign.mockReset();
  vi.stubGlobal("window", { location: { assign } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ImportedGroupPdfButton", () => {
  it("draws one secondary, small button with the label and the accessible name, and asks the server nothing", () => {
    const tree = render();
    const b = button(tree);
    expect(b.props.children).toBe(LABEL);
    expect(b.props["aria-label"]).toBe(ARIA);
    expect(b.props.type).toBe("button");
    expect(b.props.variant).toBe("secondary");
    expect(b.props.size).toBe("sm");
    expect(b.props["data-testid"]).toBe("record-group-imported-pdf");
    expect(alerts(tree)).toEqual([]);
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("pressed: asks the imported group's action once, for THIS patient and THIS specialty, and never the app episode's", async () => {
    mockAction.mockResolvedValue({ url: SIGNED });
    await press();
    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockAction).toHaveBeenCalledWith(PATIENT, "Osteopatia");
    expect(downloadEpisodeReportUrlAction).not.toHaveBeenCalled();
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
    expect(shown[0]!.props["data-testid"]).toBe("record-group-imported-pdf-error");
    expect(assign).not.toHaveBeenCalled();
  });
});
