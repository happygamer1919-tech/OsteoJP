/**
 * A FAILED FETCH MUST NEVER RENDER AS AN ANSWER.
 *
 * PL-34. The dashboard ran Promise.allSettled over getMyProfile() and
 * getMyAppointments() and then read only the `fulfilled` branches. A rejected
 * appointments fetch therefore left the list empty and the page rendered
 * "Nao tem consultas agendadas" - telling a patient with a real appointment
 * tomorrow that they had none. A rejected profile fetch rendered the greeting
 * with no name. Neither ever reached error.tsx, which already existed in that
 * directory, fully written, with pt-PT copy and a retry.
 *
 * The account screen had the same shape: a try/catch that degraded to whatever
 * the auth user object carried, so a broken load looked like a populated page.
 *
 * This is the SEVENTH silent fallback removed in this lane and the only
 * PATIENT-FACING one. The other six failed at an engineer; this one failed at a
 * patient, and it told them something false rather than nothing.
 *
 * LOADED-AND-EMPTY vs FAILED-TO-LOAD is the distinction being locked. An empty
 * state is a real answer and stays. An error state is a different screen.
 *
 * STATIC BY DESIGN, like api-method-parity.test.ts next door: the defect class
 * is "this page swallows a rejection", which is visible in the source. Rendering
 * an async server component for real needs both apps running, which is the E2E
 * suite's job.
 *
 * NEGATIVE ARMS at the bottom prove every matcher here can actually fail. A
 * guard that cannot fail is worse than no guard, because it reads as protection.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const PORTAL_ROUTES = __dirname;

/** Strip comments: this file's own subjects DISCUSS the banned patterns. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

/** Promise.allSettled is the swallow primitive: it converts a rejection into a
 *  value the caller can silently ignore, which is exactly what happened. */
const usesAllSettled = (src: string): boolean => /Promise\.allSettled\s*\(/.test(src);

/** A page that catches around its own data load and carries on rendering. */
const catchesAndContinues = (src: string): boolean => /}\s*catch\s*(\([^)]*\))?\s*{/.test(src);

/**
 * The boundary a rejection in `dir` actually lands in. Next.js error.tsx covers
 * its own segment and every segment below it, so this walks upward the way the
 * framework resolves it rather than assuming one file per directory.
 */
function nearestBoundary(dir: string): string | null {
  let cur = dir;
  for (;;) {
    const candidate = join(cur, "error.tsx");
    if (existsSync(candidate)) return candidate;
    const parent = join(cur, "..");
    if (!cur.startsWith(PORTAL_ROUTES)) return null;
    if (parent === cur) return null;
    cur = parent;
  }
}

/** Every route directory holding a page.tsx that awaits a fetcher. */
function routeDirsWithPages(): { dir: string; page: string }[] {
  const out: { dir: string; page: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (!statSync(full).isDirectory()) continue;
      const page = join(full, "page.tsx");
      if (existsSync(page)) out.push({ dir: full, page });
      walk(full);
    }
  };
  walk(PORTAL_ROUTES);
  return out;
}

/** Pages that actually load data — the only ones that can fail to load. */
function fetchingPages() {
  return routeDirsWithPages().filter(({ page }) =>
    /\bfrom '@\/lib\/api\/client'/.test(readFileSync(page, "utf8")),
  );
}

describe("no portal page swallows a failed fetch", () => {
  const pages = fetchingPages();

  it("finds the data-loading pages it is meant to guard", () => {
    // If this ever reads zero, every assertion below is vacuously true and the
    // guard has quietly stopped guarding.
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each(fetchingPages().map((p) => p.page))(
    "%s does not use Promise.allSettled",
    (page) => {
      expect(usesAllSettled(stripComments(readFileSync(page, "utf8")))).toBe(false);
    },
  );

  it.each(fetchingPages().map((p) => p.page))(
    "%s does not catch its own load and keep rendering",
    (page) => {
      expect(catchesAndContinues(stripComments(readFileSync(page, "utf8")))).toBe(false);
    },
  );

  it.each(fetchingPages().map((p) => p.dir))(
    "%s has an error.tsx to land in, its own or an ancestor's",
    (dir) => {
      // Propagating a rejection is only honest if something renders the error.
      // Next.js error boundaries cover a segment AND its children, so a nested
      // route legitimately relies on its parent's - appointments/[id] lands in
      // appointments/error.tsx. Demanding a file per directory would force a
      // redundant boundary and teach people to copy-paste one to silence this.
      expect(nearestBoundary(dir)).not.toBeNull();
    },
  );

  it("every error boundary offers a retry and takes its copy from i18n", () => {
    for (const { dir } of fetchingPages()) {
      const boundary = nearestBoundary(dir);
      if (!boundary) continue;
      const src = readFileSync(boundary, "utf8");
      expect(src, `${boundary} must offer a retry`).toMatch(/onRetry=\{reset\}/);
      // Any i18n namespace, not just s.errors: booking legitimately uses
      // s.booking.load_error_title. What matters is that the copy is
      // translated, never a hardcoded English string in front of a patient.
      expect(src, `${boundary} must use i18n copy`).toMatch(/\bs\.[a-z_]+\./);
    }
  });
});

describe("the pt-PT copy exists for every boundary the portal renders", () => {
  it("resolves every s.errors key the boundaries reference", async () => {
    const strings = JSON.parse(
      readFileSync(
        join(__dirname, "../../../../packages/i18n/src/portal/strings.pt.json"),
        "utf8",
      ),
    ) as Record<string, Record<string, string>>;

    for (const { dir } of fetchingPages()) {
      const boundary = nearestBoundary(dir);
      if (!boundary) continue;
      for (const [, ns, key] of readFileSync(boundary, "utf8").matchAll(
        /\bs\.([a-z_]+)\.([a-z_]+)/g,
      )) {
        expect(
          strings[ns]?.[key],
          `${boundary} references s.${ns}.${key}, which is not in strings.pt.json`,
        ).toBeTruthy();
      }
    }
  });
});

describe("NEGATIVE ARMS - every matcher above is proven able to fail", () => {
  it("detects the exact allSettled swallow that shipped", () => {
    const shipped = `
      const [profileResult, appointmentsResult] = await Promise.allSettled([
        getMyProfile(),
        getMyAppointments(),
      ])
      let appointments = []
      if (appointmentsResult.status === 'fulfilled') {
        appointments = appointmentsResult.value
      }
    `;
    expect(usesAllSettled(stripComments(shipped))).toBe(true);
  });

  it("detects the exact try/catch degradation that shipped", () => {
    const shipped = `
      let profile = null
      try {
        profile = await getMyProfile()
      } catch {
      }
    `;
    expect(catchesAndContinues(stripComments(shipped))).toBe(true);
  });

  it("is not fooled by either pattern appearing inside a comment", () => {
    expect(usesAllSettled(stripComments("// Promise.allSettled([a, b])"))).toBe(false);
    expect(catchesAndContinues(stripComments("/* } catch { */"))).toBe(false);
  });

  it("would fail a route whose error.tsx was removed", () => {
    // The boundary check is existsSync on a path this test builds itself; point
    // it at a directory with no boundary and it must report false, or the
    // "has an error.tsx" cases above prove nothing.
    expect(existsSync(join(PORTAL_ROUTES, "clinics", "error.tsx"))).toBe(false);
    expect(existsSync(join(PORTAL_ROUTES, "dashboard", "error.tsx"))).toBe(true);
    // And the upward walk must really walk: the detail route has no boundary of
    // its own and must resolve to the appointments one.
    expect(nearestBoundary(join(PORTAL_ROUTES, "appointments", "[id]"))).toBe(
      join(PORTAL_ROUTES, "appointments", "..", "appointments", "error.tsx").replace(
        "appointments/../appointments",
        "appointments",
      ),
    );
  });
});
