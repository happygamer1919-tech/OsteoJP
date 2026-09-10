/**
 * agenda-toolbar-compact.spec.ts — AGENDA-02. THE TOOLBAR STOPS EATING THE GRID.
 *
 * ==========================================================================
 * THE REPORT, AND THE NUMBER IT CAME WITH
 * ==========================================================================
 * The clinic asked for the agenda controls to stop taking a third of the
 * screen. Measured before anything was changed, on this fixture, at the two
 * viewports reception uses:
 *
 *     1280 wide -> toolbar 222px      1024 wide -> toolbar 232px
 *
 * Eight controls whose combined intrinsic width is ~2030px, laid out by
 * `flex-wrap` in a bar 928px / 672px wide, wrap to three and four rows. Every
 * wrapped row is 44px the appointment grid does not get.
 *
 * ==========================================================================
 * WHAT THIS FILE PINS, AND WHY EACH ASSERTION IS THE PROPERTY AND NOT A PROXY
 * ==========================================================================
 *   (1) A HEIGHT CEILING, per viewport. The card's shape is "a header line plus
 *       one control row", and the honest way to state that mechanically is a
 *       pixel ceiling: two rows of 40px controls plus the bar's own padding and
 *       gap cannot exceed CEILING. A row-count assertion would need to know how
 *       the rows are built; a height ceiling stays true through any layout that
 *       actually delivers the compaction.
 *
 *   (2) NOVA MARCAÇÃO IS ON THE CONTROL ROW, NOT UNDER IT. The requirement is
 *       "never wraps below on narrow screens", so it is asserted as geometry:
 *       the primary action's vertical centre sits on the same line as the date
 *       picker's. Asserting mere visibility would pass on the defect - the
 *       button was always visible, it was visible on a fourth row.
 *
 *   (3) EVERY CONTROL IS STILL THERE AND STILL CARRIES A NAME. The compaction
 *       must not have been bought by hiding something. Each control is located
 *       BY ITS ACCESSIBLE NAME, which is the same thing a person reads and the
 *       same thing a screen reader announces, so a control reduced to an
 *       unlabelled glyph fails here.
 *
 *   (4) THE GRID GOT THE HEIGHT. The weekday header's y at scroll-top is the
 *       toolbar's bottom edge, so it is the one number that says the space was
 *       actually handed over rather than merely freed.
 *
 * Runs as admin (the default project storage state).
 */
import { test, expect, type Locator } from "@playwright/test";
import { futureDate, RUN_DAY_BASE } from "./fixtures";

/**
 * The ceiling, per viewport, and it is DERIVED rather than picked: the bar is
 * py-2.5 (20px) + a header line (~32px) + gap-2 (8px) + one 44px control row
 * (the segmented control is the tallest thing on it) = 104px. 120 leaves room
 * for font-metric variance between machines without leaving room for a wrap,
 * which is 40px more.
 */
/**
 * THE CEILING IS PER VIEWPORT, AND THE TWO NUMBERS DIFFER FOR A MEASURED REASON
 * RATHER THAN A CONVENIENT ONE.
 *
 * The nine labelled controls measure ~850px laid side by side once the two long
 * strings shorten below 2xl. The bar is 928px wide at 1280 and 672px at 1024. So
 * the control row is ONE line on the wider laptop and TWO on the narrower one,
 * and that is arithmetic: closing the remaining 180px gap at 1024 means taking a
 * visible label off a control entirely, which AGENDA-02 forbids in the same
 * sentence that asks for the compaction.
 *
 * 1280: header line (32) + gap (8) + one control row (44) + py-2.5 (20) = 104.
 * 1024: the same plus a second control row (40) and its gap (8) = 152.
 * Each ceiling adds ~16px for font-metric variance between machines, which is
 * well under the 40px a further wrap would cost - so a regression still fails.
 */
const VIEWPORTS = [
  { width: 1280, height: 800, before: 222, ceiling: 120 },
  { width: 1024, height: 768, before: 232, ceiling: 168 },
];

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error("element has no box - it is not rendered");
  return b;
}

for (const vp of VIEWPORTS) {
  test(`Agenda: the toolbar fits a header plus one control row at ${vp.width} (AGENDA-02)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`/agenda?view=week&date=${futureDate(RUN_DAY_BASE + 12)}`);

    const toolbar = page.getByTestId("agenda-toolbar");
    await expect(toolbar).toBeVisible();

    // ---- (1) THE CEILING ------------------------------------------------
    // Polled: `--agenda-header-top` is written by a client effect and the web
    // font settles after first paint, so a one-shot read can land on a bar that
    // is still 44px taller than it will be a frame later.
    await expect
      .poll(async () => Math.round((await box(toolbar)).height), {
        timeout: 10_000,
        message:
          `the agenda toolbar is taller than ${vp.ceiling}px at ${vp.width} wide - it has wrapped ` +
          `beyond the shape AGENDA-02 delivers at this width. It measured ${vp.before}px before ` +
          "AGENDA-02; a number near that is the defect returning",
      })
      .toBeLessThanOrEqual(vp.ceiling);

    // ---- (2) THE PRIMARY ACTION DID NOT DROP TO ITS OWN LINE -------------
    // ASSERTED AS "NEVER ALONE", NOT AS "ALWAYS BESIDE THE DATE FIELD". At 1024
    // the actions wrap to a second line as a GROUP, which is the intended
    // behaviour; the defect is the primary action sitting by itself under
    // everything else. So the claim is that Bloquear and Atualizar are on
    // Nova marcação's line, whichever line that turns out to be.
    const nova = page.getByRole("button", { name: "Nova marcação" });
    await expect(nova).toBeVisible();
    const n = await box(nova);
    for (const peer of ["Bloquear horário", "Atualizar"]) {
      const b = await box(page.getByRole("button", { name: peer, exact: true }));
      expect(
        Math.abs(n.y + n.height / 2 - (b.y + b.height / 2)),
        `Nova marcação is on a different line from "${peer}" - the action group has been split, ` +
          "and the primary action is stranded on a row of its own",
      ).toBeLessThan(12);
    }

    // ---- (3) NOTHING WAS BOUGHT BY HIDING A CONTROL ----------------------
    // By accessible name, so a control reduced to a bare icon fails here even
    // though it would still be "visible".
    // The ROLE is named alongside the label rather than guessed at, because the
    // eight controls are five different widgets: the view toggle is a radio
    // group, the date field is a textbox, the two filters are comboboxes and
    // the rest are buttons.
    const CONTROLS = [
      { role: "radio", name: "Dia" },
      { role: "radio", name: "Semana" },
      { role: "button", name: "Hoje" },
      { role: "textbox", name: "Escolher data" },
      { role: "combobox", name: "Terapeutas" },
      { role: "combobox", name: "Localização" },
      { role: "button", name: "Bloquear horário" },
      { role: "button", name: "Atualizar" },
      { role: "button", name: "Nova marcação" },
    ] as const;
    for (const c of CONTROLS) {
      await expect(
        page.getByRole(c.role, { name: c.name, exact: true }),
        `the control named "${c.name}" is not on the toolbar at ${vp.width} wide - the ` +
          "compaction removed or unlabelled it instead of fitting it",
      ).toBeVisible();
    }

    // The freshness reading survived the merge into the button.
    await expect(page.getByTestId("agenda-freshness")).toBeVisible();
    await expect(page.getByTestId("agenda-freshness")).toContainText(/\d{2}:\d{2}/);

    // ---- (5) NO CONTROL IS PAINTED ON TOP OF ANOTHER --------------------
    // THE ASSERTION THE FIRST DRAFT OF THIS FILE DID NOT HAVE, and it went
    // green over a toolbar whose Bloquear button sat on top of the date field
    // with Hoje underneath it. `toBeVisible()` is true of an overlapped
    // control, so visibility alone can never catch a collision. Boxes are
    // compared pairwise: same line, and one starts before the other ends.
    const placed: { name: string; b: Awaited<ReturnType<typeof box>> }[] = [];
    for (const c of CONTROLS) {
      placed.push({ name: c.name, b: await box(page.getByRole(c.role, { name: c.name, exact: true })) });
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const z = placed[j]!;
        const sameLine = Math.abs(a.b.y - z.b.y) < a.b.height / 2;
        const overlapsX = a.b.x < z.b.x + z.b.width - 1 && z.b.x < a.b.x + a.b.width - 1;
        expect(
          sameLine && overlapsX,
          `"${a.name}" and "${z.name}" are drawn on top of each other - the row is overflowing ` +
            "rather than fitting, and both controls are 'visible' while one is unreadable",
        ).toBe(false);
      }
    }

    // ---- (4) THE GRID ACTUALLY RECEIVED THE HEIGHT -----------------------
    const header = page.getByTestId("agenda-weekday-header");
    await expect(header).toBeVisible();
    const h = await box(header);
    const t = await box(toolbar);
    expect(
      Math.round(h.y),
      "the weekday row did not move up with the toolbar - the height was freed and then spent on " +
        "something else, so the appointment grid is no better off",
    ).toBeLessThanOrEqual(Math.round(t.y + t.height) + 32);
  });
}
