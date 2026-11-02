import { Button, DatePicker, Dialog, TimeField } from "@osteojp/ui";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * export-edit-dialog.test.tsx: RODICA-export-edit-before-download (owner
 * ruling 2026-11-02). WHAT THE EXPORT DIALOG ASKS AND ANSWERS.
 *
 *   - it opens on "Manter os dados da consulta"; "Exportar" then answers
 *     null (the export as before) and asks the server nothing;
 *   - "Alterar" asks for the export's rows once and shows one row per
 *     registo: Data, Hora and Texto, each set to what the registo prints;
 *   - every value may be changed, the text emptied; "Exportar" answers every
 *     row; one date and hour can be applied to all rows;
 *   - a bad value shows an alert and answers nothing; rows that cannot be
 *     read show an alert and "Exportar" stays disabled.
 *
 * Tested without a DOM, as DeclaracaoDialog.test.tsx tests its dialog: the
 * component is called as a plain function with its hooks replaced. It is
 * not evidence about a screen.
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

import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import type { ExportOverride, ExportRow } from "@/lib/clinical/report/export-overrides";
import { ExportEditDialog } from "./export-edit-dialog";

const s = getStrings(DEFAULT_LOCALE);
const T = "ficha-export-dialog";
const R1 = "7777cccc-7777-4777-8777-777777777771";
const R2 = "7777cccc-7777-4777-8777-777777777772";
const ROWS: ExportRow[] = [
  { recordId: R1, group: "Fisioterapia", version: 1, date: "2026-11-01", time: "09:00", text: "Conteúdo importado" },
  { recordId: R2, group: "Sem episódio", version: 2, date: "2026-10-20", time: "", text: "" },
];

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

const onExport = vi.fn<(o: ExportOverride[] | null) => void>();
const onClose = vi.fn();
const loadRows = vi.fn<() => Promise<{ rows: ExportRow[] | null }>>();

function render(): ReactNode {
  hooks.at = 0;
  return ExportEditDialog({ onClose, loadRows, onExport, testId: T });
}

const byTestId = (node: ReactNode, id: string): El[] => elements(node).filter((el) => el.props["data-testid"] === id);
const one = (node: ReactNode, id: string): El => {
  const found = byTestId(node, id);
  expect(found, id).toHaveLength(1);
  return found[0]!;
};
const dialog = (node: ReactNode): El => elements(node).find((el) => el.type === Dialog)!;
const alerts = (node: ReactNode): El[] => elements(node).filter((el) => el.props.role === "alert");
/** The rows on screen, each with its three controls. */
function rowsOf(node: ReactNode) {
  return byTestId(node, `${T}-row`).map((li) => {
    const inside = elements(li.props.children as ReactNode);
    return {
      caption: inside.find((el) => el.type === "span")!.props.children as string,
      date: inside.find((el) => el.type === DatePicker)!,
      time: inside.find((el) => el.type === TimeField)!,
      text: inside.find((el) => el.props["data-testid"] === `${T}-row-text`)!,
    };
  });
}

function confirm() {
  (dialog(render()).props.onConfirm as () => void)();
}

async function chooseChange(): Promise<ReactNode> {
  (one(render(), `${T}-change`).props.onChange as () => void)();
  await Promise.all(hooks.transitions);
  return render();
}

beforeEach(() => {
  hooks.slots = [];
  hooks.at = 0;
  hooks.transitions = [];
  onExport.mockReset();
  onClose.mockReset();
  loadRows.mockReset();
  loadRows.mockResolvedValue({ rows: ROWS.map((r) => ({ ...r })) });
});

describe("ExportEditDialog: the question", () => {
  it("opens on 'Manter os dados da consulta', with both choices, the title and 'Exportar', and asks the server nothing", () => {
    const tree = render();
    expect(dialog(tree).props.open).toBe(true);
    expect(dialog(tree).props.title).toBe("Exportar PDF");
    expect(dialog(tree).props.confirmLabel).toBe("Exportar");
    expect(dialog(tree).props.confirmDisabled).toBe(false);
    expect(one(tree, `${T}-keep`).props.checked).toBe(true);
    expect(one(tree, `${T}-change`).props.checked).toBe(false);
    expect(elements(tree).some((el) => el.props.children === "Manter os dados da consulta")).toBe(true);
    expect(elements(tree).some((el) => el.props.children === "Alterar")).toBe(true);
    expect(byTestId(tree, `${T}-row`)).toEqual([]);
    expect(loadRows).not.toHaveBeenCalled();
  });

  it("'Manter' then 'Exportar': answers null, and nothing was read", () => {
    confirm();
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith(null);
    expect(loadRows).not.toHaveBeenCalled();
  });

  it("'Cancelar' is the dialog's close, and answers nothing", () => {
    (dialog(render()).props.onClose as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onExport).not.toHaveBeenCalled();
  });
});

describe("ExportEditDialog: 'Alterar'", () => {
  it("asks for the rows once, and shows one row per registo set to what it prints", async () => {
    const tree = await chooseChange();
    expect(loadRows).toHaveBeenCalledTimes(1);
    const rows = rowsOf(tree);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.caption).toBe("Fisioterapia · Consulta de 01/11/2026 09:00");
    expect(rows[1]!.caption).toBe("Sem episódio · Consulta de 20/10/2026 sem hora · Versão 2");
    expect(rows.map((r) => r.date.props.value)).toEqual(["2026-11-01", "2026-10-20"]);
    expect(rows.map((r) => r.time.props.value)).toEqual(["09:00", ""]);
    expect(rows.map((r) => r.text.props.value)).toEqual(["Conteúdo importado", ""]);
    expect(rows[0]!.text.props.maxLength).toBe(200);
    expect(elements(tree).some((el) => el.props.children === s["patients.exportEdit.note"])).toBe(true);
    // Choosing again does not ask again.
    (one(render(), `${T}-keep`).props.onChange as () => void)();
    (one(render(), `${T}-change`).props.onChange as () => void)();
    expect(loadRows).toHaveBeenCalledTimes(1);
  });

  it("before the rows arrive, 'Exportar' is disabled", () => {
    loadRows.mockReturnValue(new Promise(() => {}));
    (one(render(), `${T}-change`).props.onChange as () => void)();
    expect(dialog(render()).props.confirmDisabled).toBe(true);
    confirm();
    expect(onExport).not.toHaveBeenCalled();
  });

  it("unchanged rows: 'Exportar' answers every row with its own values", async () => {
    await chooseChange();
    confirm();
    expect(onExport).toHaveBeenCalledWith([
      { recordId: R1, date: "2026-11-01", time: "09:00", text: "Conteúdo importado" },
      { recordId: R2, date: "2026-10-20", time: "", text: "" },
    ]);
  });

  it("a changed date, hour and text, and an emptied 'Conteúdo importado', are answered as changed", async () => {
    let rows = rowsOf(await chooseChange());
    (rows[0]!.date.props.onChange as (v: string) => void)("2026-11-02");
    rows = rowsOf(render());
    (rows[0]!.time.props.onChange as (v: string) => void)("15:45");
    rows = rowsOf(render());
    (rows[0]!.text.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: "" } });
    rows = rowsOf(render());
    (rows[1]!.text.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: "Texto extra" } });
    confirm();
    expect(onExport).toHaveBeenCalledWith([
      { recordId: R1, date: "2026-11-02", time: "15:45", text: "" },
      { recordId: R2, date: "2026-10-20", time: "", text: "Texto extra" },
    ]);
  });

  it("'Aplicar a todos' sets one date and hour on every row and leaves each text alone", async () => {
    const tree = await chooseChange();
    const all = one(tree, `${T}-all`);
    const inside = elements(all.props.children as ReactNode);
    (inside.find((el) => el.type === DatePicker)!.props.onChange as (v: string) => void)("2026-11-02");
    (elements(one(render(), `${T}-all`).props.children as ReactNode).find((el) => el.type === TimeField)!.props
      .onChange as (v: string) => void)("10:00");
    const apply = one(render(), `${T}-apply-all`);
    expect(apply.type).toBe(Button);
    (apply.props.onClick as () => void)();
    const rows = rowsOf(render());
    expect(rows.map((r) => [r.date.props.value, r.time.props.value, r.text.props.value])).toEqual([
      ["2026-11-02", "10:00", "Conteúdo importado"],
      ["2026-11-02", "10:00", ""],
    ]);
  });

  it("one registo: no 'apply to all'", async () => {
    loadRows.mockResolvedValue({ rows: [{ ...ROWS[0]! }] });
    const tree = await chooseChange();
    expect(rowsOf(tree)).toHaveLength(1);
    expect(byTestId(tree, `${T}-all`)).toEqual([]);
  });

  it("a bad value: an alert, and nothing is answered", async () => {
    const rows = rowsOf(await chooseChange());
    (rows[0]!.text.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: "a".repeat(201) } });
    confirm();
    expect(onExport).not.toHaveBeenCalled();
    const shown = alerts(render());
    expect(shown).toHaveLength(1);
    expect(shown[0]!.props.children).toBe("Verifique a data e a hora de cada registo.");
  });

  it("rows that cannot be read: an alert, and 'Exportar' stays disabled", async () => {
    loadRows.mockResolvedValue({ rows: null });
    const tree = await chooseChange();
    expect(alerts(tree).map((a) => a.props.children)).toEqual(["Não foi possível carregar os registos."]);
    expect(dialog(tree).props.confirmDisabled).toBe(true);
    // "Manter" still exports as before.
    (one(render(), `${T}-keep`).props.onChange as () => void)();
    confirm();
    expect(onExport).toHaveBeenCalledWith(null);
  });
});
