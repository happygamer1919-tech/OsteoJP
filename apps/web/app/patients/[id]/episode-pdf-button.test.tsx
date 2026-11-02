import { Button } from "@osteojp/ui";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * episode-pdf-button.test.tsx: EPI-01b, piece 3. WHAT "PDF do episódio" DOES
 * WHEN IT IS PRESSED.
 *
 *   - it asks the server action for THIS patient and THIS episode, once;
 *   - a URL: the browser is sent to it, and no error line shows;
 *   - no URL (a refusal or a failure, which the action answers alike): the
 *     error line shows, as an alert, and the browser goes nowhere;
 *   - pressing again clears the line before asking again;
 *   - while the action runs the button is `loading` and is NOT `disabled`, as
 *     the per-record "Transferir PDF" button is.
 *
 * WHICH groups show the button, and what the page hands it, is
 * page-episode-pdf.test.tsx's.
 *
 * HOW A CLICK IS TESTED WITHOUT A DOM. This suite has no jsdom (vitest runs in
 * node), so, as DeclaracaoDialog.test.tsx does, the component is called as a
 * plain function with its hooks replaced: useState keeps its values in a list
 * between calls, and useTransition runs the transition at once and keeps its
 * promise. The returned element tree is searched for the control, its handler
 * is invoked, and the component is called again to read what it now renders.
 * Everything inside EpisodePdfButton is the real code.
 *
 * IT IS NOT EVIDENCE ABOUT A SCREEN. That a real click on the running app
 * downloads the file is e2e/ficha-add-evaluation.spec.ts's question.
 */

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  at: 0,
  transitions: [] as Promise<unknown>[],
  /** What useTransition reports as "running". */
  pending: false,
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
      hooks.pending,
      (run: () => unknown) => {
        hooks.transitions.push(Promise.resolve(run()));
      },
    ],
  };
});
vi.mock("./episode-pdf-actions", () => ({
  downloadEpisodeReportUrlAction: vi.fn(),
  readEpisodeExportRowsAction: vi.fn(),
}));

import type { ExportOverride } from "@/lib/clinical/report/export-overrides";
import { ExportEditDialog } from "./export-edit-dialog";
import { downloadEpisodeReportUrlAction, readEpisodeExportRowsAction } from "./episode-pdf-actions";
import { EpisodePdfButton } from "./episode-pdf-button";

const mockAction = vi.mocked(downloadEpisodeReportUrlAction);
const mockRows = vi.mocked(readEpisodeExportRowsAction);

const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const EPISODE = "7777cccc-7777-4777-8777-777777777771";
const SIGNED = "https://storage.example/signed?token=opaque";
const LABEL = "PDF do episódio";
const ARIA = "Transferir o PDF do episódio: Osteopatia (01/09/2026)";
const ERROR = "Não foi possível gerar o PDF.";

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
  return EpisodePdfButton({
    patientId: PATIENT,
    episodeId: EPISODE,
    label: LABEL,
    ariaLabel: ARIA,
    errorLabel: ERROR,
  });
}

/** The one <Button> of the tree, so a second one fails loudly. */
function button(node: ReactNode): El {
  const found = elements(node).filter((el) => el.type === Button);
  expect(found).toHaveLength(1);
  return found[0]!;
}
const alerts = (node: ReactNode): El[] => elements(node).filter((el) => el.props.role === "alert");

/** Press the button and let the action settle; what the component renders then. */
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
  hooks.pending = false;
  mockAction.mockReset();
  mockRows.mockReset();
  assign.mockReset();
  vi.stubGlobal("window", { location: { assign } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EpisodePdfButton: what it draws before it is pressed", () => {
  it("one secondary, small button, with the label, the accessible name and no error line", () => {
    const tree = render();
    const b = button(tree);
    expect(b.props.children).toBe(LABEL);
    expect(b.props["aria-label"]).toBe(ARIA);
    expect(b.props.type).toBe("button");
    expect(b.props.variant).toBe("secondary");
    expect(b.props.size).toBe("sm");
    expect(b.props["data-testid"]).toBe("record-group-episode-pdf");
    expect(b.props.loading).toBe(false);
    expect(alerts(tree)).toEqual([]);
    // Drawing it asks the server nothing.
    expect(mockAction).not.toHaveBeenCalled();
  });
});

describe("EpisodePdfButton: pressed", () => {
  it("asks the action once, for THIS patient and THIS episode, in that order", async () => {
    mockAction.mockResolvedValue({ url: SIGNED });
    await press();
    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockAction).toHaveBeenCalledWith(PATIENT, EPISODE);
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
    expect(shown[0]!.type).toBe("p");
    expect(shown[0]!.props.children).toBe(ERROR);
    expect(shown[0]!.props["data-testid"]).toBe("record-group-episode-pdf-error");
    expect(assign).not.toHaveBeenCalled();
    // The button is still there to press again.
    expect(button(tree).props.children).toBe(LABEL);
  });

  it("pressing again after an error clears the line before asking, and a URL then leaves none", async () => {
    mockAction.mockResolvedValueOnce({ url: null });
    expect(alerts(await press())).toHaveLength(1);

    // The second answer is held back, so the render in between is observable.
    let respond: (v: { url: string | null }) => void = () => {};
    mockAction.mockImplementationOnce(() => new Promise((resolve) => (respond = resolve)));
    (button(render()).props.onClick as () => void)();
    // The line is gone as soon as the button is pressed, before the dialog answers.
    expect(alerts(render())).toEqual([]);
    answer(null);
    expect(alerts(render())).toEqual([]);

    respond({ url: SIGNED });
    await Promise.all(hooks.transitions);
    expect(alerts(render())).toEqual([]);
    expect(mockAction).toHaveBeenCalledTimes(2);
    expect(assign).toHaveBeenCalledWith(SIGNED);
  });
});

describe("EpisodePdfButton: while the action runs", () => {
  it("the button is `loading`, and is NOT `disabled` (the per-record button's behaviour)", () => {
    hooks.pending = true;
    const b = button(render());
    expect(b.props.loading).toBe(true);
    expect(b.props.disabled).toBeUndefined();
    expect("disabled" in b.props).toBe(false);
  });
});

describe("EpisodePdfButton: the export dialog asks first (RODICA-export-edit-before-download)", () => {
  const OVERRIDES: ExportOverride[] = [
    { recordId: "7777cccc-7777-4777-8777-77777777aaaa", date: "2026-11-02", time: "10:30", text: "" },
  ];

  it("a press opens the dialog and downloads nothing: no action, no rows asked, the browser goes nowhere", () => {
    expect(dialogs(render())).toEqual([]);
    (button(render()).props.onClick as () => void)();
    const open = dialogs(render());
    expect(open).toHaveLength(1);
    expect(open[0]!.props.testId).toBe("record-group-episode-pdf-dialog");
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
    expect(mockRows).toHaveBeenCalledWith(PATIENT, EPISODE);
  });

  it("'Manter os dados da consulta': the action is asked exactly as before, with no overrides", async () => {
    mockAction.mockResolvedValue({ url: SIGNED });
    await press(null);
    expect(mockAction).toHaveBeenCalledWith(PATIENT, EPISODE);
    expect(mockAction.mock.calls[0]).toHaveLength(2);
  });

  it("'Alterar': the dialog's values are handed to the action, and the dialog closes", async () => {
    mockAction.mockResolvedValue({ url: SIGNED });
    const tree = await press(OVERRIDES);
    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockAction).toHaveBeenCalledWith(PATIENT, EPISODE, OVERRIDES);
    expect(dialogs(tree)).toEqual([]);
    expect(assign).toHaveBeenCalledWith(SIGNED);
  });
});
