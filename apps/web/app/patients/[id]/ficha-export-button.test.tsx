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
vi.mock("./ficha-pdf-actions", () => ({
  downloadPatientFichaUrlAction: vi.fn(),
  readPatientFichaExportRowsAction: vi.fn(),
}));

import type { ExportOverride } from "@/lib/clinical/report/export-overrides";
import { ExportEditDialog } from "./export-edit-dialog";
import { FichaExportButton } from "./ficha-export-button";
import { downloadPatientFichaUrlAction, readPatientFichaExportRowsAction } from "./ficha-pdf-actions";

const mockAction = vi.mocked(downloadPatientFichaUrlAction);
const mockRows = vi.mocked(readPatientFichaExportRowsAction);

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

async function press(overrides: ExportOverride[] | null = null): Promise<ReactNode> {
  (button(render()).props.onClick as () => void)();
  answer(overrides);
  await Promise.all(hooks.transitions);
  return render();
}

/** The export dialog the button mounted (RODICA-export-edit-before-download), or none. */
const dialogs = (node: ReactNode): El[] => elements(node).filter((el) => el.type === ExportEditDialog);

/** Answer the open dialog: null is "Manter os dados da consulta". */
function answer(overrides: ExportOverride[] | null) {
  const open = dialogs(render());
  expect(open).toHaveLength(1);
  (open[0]!.props.onExport as (o: ExportOverride[] | null) => void)(overrides);
}

const assign = vi.fn();

beforeEach(() => {
  hooks.slots = [];
  hooks.at = 0;
  hooks.transitions = [];
  mockAction.mockReset();
  mockRows.mockReset();
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

describe("FichaExportButton: the export dialog asks first (RODICA-export-edit-before-download)", () => {
  const OVERRIDES: ExportOverride[] = [
    { recordId: "7777cccc-7777-4777-8777-77777777aaaa", date: "2026-11-02", time: "10:30", text: "" },
  ];

  it("a press opens the dialog and downloads nothing: no action, no rows asked, the browser goes nowhere", () => {
    expect(dialogs(render())).toEqual([]);
    (button(render()).props.onClick as () => void)();
    const open = dialogs(render());
    expect(open).toHaveLength(1);
    expect(open[0]!.props.testId).toBe("ficha-export-dialog");
    expect(mockAction).not.toHaveBeenCalled();
    expect(mockRows).not.toHaveBeenCalled();
    expect(hooks.transitions).toEqual([]);
    expect(assign).not.toHaveBeenCalled();
  });

  it("closing the dialog exports nothing, and takes the dialog away", () => {
    (button(render()).props.onClick as () => void)();
    (dialogs(render())[0]!.props.onClose as () => void)();
    expect(dialogs(render())).toEqual([]);
    expect(mockAction).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("the dialog's rows are the server's, asked for THIS export", async () => {
    mockRows.mockResolvedValue({ rows: null });
    (button(render()).props.onClick as () => void)();
    const loadRows = dialogs(render())[0]!.props.loadRows as () => Promise<unknown>;
    await loadRows();
    expect(mockRows).toHaveBeenCalledTimes(1);
    expect(mockRows).toHaveBeenCalledWith(PATIENT);
  });

  it("'Manter os dados da consulta': the action is asked exactly as before, with no overrides", async () => {
    mockAction.mockResolvedValue({ url: SIGNED });
    await press(null);
    expect(mockAction).toHaveBeenCalledWith(PATIENT);
    expect(mockAction.mock.calls[0]).toHaveLength(1);
  });

  it("'Alterar': the dialog's values are handed to the action, and the dialog closes", async () => {
    mockAction.mockResolvedValue({ url: SIGNED });
    const tree = await press(OVERRIDES);
    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockAction).toHaveBeenCalledWith(PATIENT, OVERRIDES);
    expect(dialogs(tree)).toEqual([]);
    expect(assign).toHaveBeenCalledWith(SIGNED);
  });
});
