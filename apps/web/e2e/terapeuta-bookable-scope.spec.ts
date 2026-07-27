/**
 * terapeuta-bookable-scope.spec.ts (PL-05, Pre-Launch, Claude-found 2026-07-27).
 *
 * The Terapeuta dropdown (booking drawer + agenda toolbar) must list only
 * BOOKABLE practitioners. Before this loop the source query was
 * `is_active AND role != 'reception'`, so the owner ("E2E Owner") and the admin
 * ("E2E Admin") were selectable as Terapeuta - the CB screenshot bug ("Ivan M",
 * "Lurdes Cruz"). Runs as admin (default storageState). No seed change.
 *
 * Seeded roster (seed-e2e.mjs):
 *   E2E Owner                  - role owner,     0 mappings -> DROP
 *   E2E Admin                  - role admin,     0 mappings -> DROP
 *   E2E Reception              - role reception             -> DROP (already)
 *   E2E Therapist              - role therapist, mapped     -> KEEP
 *   E2E Terapeuta Sem Servicos - role therapist, 0 mappings -> KEEP (a therapist
 *                                stays bookable even with no mappings yet)
 *
 * The practising-owner case (role=owner WITH a mapping, the JP analogue) has no
 * seed row; it is proved by the unit test therapist-bookable.test.ts.
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment } from "./helpers";
import { futureDate, RUN_DAY_BASE } from "./fixtures";

const OWNER = "E2E Owner";
const ADMIN = "E2E Admin";
const THERAPIST = "E2E Therapist";
const THERAPIST_ZERO = "E2E Terapeuta Sem Servicos";

test("PL-05: booking Terapeuta dropdown excludes owner + admin, keeps therapists", async ({
  page,
}, testInfo) => {
  const dialog = await openNewAppointment(page, futureDate(RUN_DAY_BASE + 90 + testInfo.retry));
  const therapist = dialog.getByLabel(/Terapeuta/i);
  const names = async () =>
    (await therapist.locator("option").allTextContents()).map((t) => t.trim());

  // On open the full roster shows (default location) - so this is the unfiltered
  // source, exactly where the owner + admin used to leak in.
  await expect.poll(names).toContain(THERAPIST);
  await expect.poll(names).toContain(THERAPIST_ZERO);
  await expect.poll(names).not.toContain(OWNER);
  await expect.poll(names).not.toContain(ADMIN);
});

test("PL-05: agenda toolbar Terapeutas filter excludes owner + admin", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/agenda?view=week&date=${futureDate(RUN_DAY_BASE + 90)}`);

  const options = () =>
    expect.poll(async () =>
      (await page.getByLabel("Terapeutas").locator("option").allTextContents()).map((t) =>
        t.trim(),
      ),
    );

  // "Todas as localizações" (default) is the full bookable roster.
  await options().toContain(THERAPIST);
  await options().toContain(THERAPIST_ZERO);
  await options().not.toContain(OWNER);
  await options().not.toContain(ADMIN);
});
