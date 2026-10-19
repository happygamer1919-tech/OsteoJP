// Q-J (a): A LESSON THAT WAITS ON A FEATURE FOLLOWS THAT FEATURE'S SWITCH.
//
// The survey lesson (docs/guide/content/08-portal/09-avaliacao-de-satisfacao.md)
// carries "feature: survey". The owner's rule for SAT-01 (2026-10-12): while the
// survey is switched off, staff see nothing of it. So /ajuda asks the question
// the survey's own staff screens ask, surveyVisible() in
// lib/reminders/survey-mode.ts: off (and anything that reads as off) hides the
// lesson from every list, its address and every FAQ link; canary and on show
// it, as the screens do. The PDFs never print it, whatever the switch reads.
//
// Each arm sets SURVEY_SEND_MODE itself (vi.stubEnv) and every arm is undone
// after it, so no test here depends on the shell it runs in.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ROLES, type Role } from "@osteojp/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REPO_ROOT,
  guideSourceHash,
  loadGuide,
  printableGuide,
} from "../../../../docs/guide/build/guide-model.mjs";
import { readManifest } from "../../../../docs/guide/build/guide-pdf.mjs";
import { SURVEY_LIST_HREF, commsSectionsThatExist } from "../nav/comms-sections";
import { surveyVisible } from "../reminders/survey-mode";

import {
  GUIDE_DATA,
  GUIDE_FEATURES,
  featureShown,
  guideFaqFor,
  guideLessonsFor,
  guideSectionsFor,
} from "./guide";
import { lessonPageFor, sectionFor } from "./guide-routes";
import { INICIO_SECTION, exampleLesson, guideFile, loadFixture } from "./guide-test-fixture";

const SURVEY_LESSON = "portal.avaliacao-de-satisfacao";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Sets the switch for one arm; undefined deletes it, as an unset variable. */
function mode(value: string | undefined) {
  vi.stubEnv("SURVEY_SEND_MODE", value);
}

/** Every place a viewer could meet the lesson: the lists, the section page, the address, and the FAQ links. */
function reachable(role: Role): Record<string, boolean> {
  return {
    lessons: guideLessonsFor(role).some((l) => l.id === SURVEY_LESSON),
    sections: guideSectionsFor(role).some((e) => e.lessons.some((l) => l.id === SURVEY_LESSON)),
    sectionPage: (sectionFor(role, "portal")?.lessons ?? []).some((l) => l.id === SURVEY_LESSON),
    address: lessonPageFor(role, "portal", "avaliacao-de-satisfacao") !== null,
    faqLinks: guideFaqFor(role).some((entry) => entry.lessons.some((l) => l.id === SURVEY_LESSON)),
  };
}

const NOWHERE = { lessons: false, sections: false, sectionPage: false, address: false, faqLinks: false };
const LISTED = { lessons: true, sections: true, sectionPage: true, address: true, faqLinks: false };

describe("the survey lesson is there to prove something", () => {
  it("is published in guide-data.json with feature survey, for the three profiles, gated on surveys:read", () => {
    const lesson = GUIDE_DATA.lessons.find((l) => l.id === SURVEY_LESSON);
    expect(lesson).toBeDefined();
    expect(lesson!.feature).toBe("survey");
    expect(lesson!.capability).toBe("surveys:read");
    expect(lesson!.roles).toEqual(["rececao", "terapeuta", "proprietario"]);
    // Every profile's order names it, so only the switch can hide it.
    for (const profile of ["rececao", "terapeuta", "proprietario"] as const) {
      expect(GUIDE_DATA.orders[profile].lessons).toContain(SURVEY_LESSON);
    }
  });

  it("every feature named in guide-data.json has an entry in GUIDE_FEATURES (a typo would hide a lesson for good)", () => {
    const named = [...GUIDE_DATA.lessons, ...GUIDE_DATA.faq].flatMap((l) => (l.feature === null ? [] : [l.feature]));
    expect(named).toContain("survey");
    expect(named.filter((name) => !Object.hasOwn(GUIDE_FEATURES, name))).toEqual([]);
  });
});

describe("the guide asks the survey screens' own question (surveyVisible)", () => {
  // The Comunicações tab exists exactly when the switch shows the survey
  // (lib/nav/comms-sections.ts), so the lesson and the tab cannot disagree.
  for (const value of [undefined, "", "off", "canary", "on", "ON", "On", " on", "on\n", "Canary", "yes"]) {
    it(`SURVEY_SEND_MODE=${JSON.stringify(value)}: the lesson shows exactly when the survey's tab exists`, () => {
      mode(value);
      const tabExists = commsSectionsThatExist().some((c) => c.href === SURVEY_LIST_HREF);
      expect(featureShown("survey")).toBe(surveyVisible());
      expect(featureShown("survey")).toBe(tabExists);
      expect(featureShown("survey")).toBe(value === "canary" || value === "on");
    });
  }
});

describe("hidden while the survey is off (owner, 2026-10-12: staff see nothing of it)", () => {
  for (const value of ["off", undefined, "ON"]) {
    for (const role of ROLES) {
      it(`SURVEY_SEND_MODE=${JSON.stringify(value)}, ${role}: in no list, not on the Portal section page, not found at its address, linked by no FAQ entry`, () => {
        mode(value);
        expect(reachable(role)).toEqual(NOWHERE);
      });
    }
  }

  it("the rest of the Portal section is still there for every role (only the lesson goes)", () => {
    mode("off");
    for (const role of ROLES) {
      expect(sectionFor(role, "portal")?.lessons.length ?? 0, role).toBeGreaterThan(0);
    }
  });
});

describe("shown while the survey is on, and under canary, as the survey's screens are", () => {
  for (const value of ["canary", "on"]) {
    for (const role of ROLES) {
      it(`SURVEY_SEND_MODE=${value}, ${role}: listed, on the Portal section page, and open at its address`, () => {
        mode(value);
        expect(reachable(role)).toEqual(LISTED);
      });
    }

    it(`SURVEY_SEND_MODE=${value}: in each profile's place, the last lesson of Portal do paciente`, () => {
      mode(value);
      const portal = (role: Role) => (sectionFor(role, "portal")?.lessons ?? []).map((l) => l.id);
      expect(portal("reception").at(-1)).toBe(SURVEY_LESSON);
      expect(portal("therapist").at(-1)).toBe(SURVEY_LESSON);
      expect(portal("owner").at(-1)).toBe(SURVEY_LESSON);
      // An admin reads the Proprietário guide, narrowed to its capabilities; it holds surveys:read.
      expect(portal("admin").at(-1)).toBe(SURVEY_LESSON);
    });

    it(`SURVEY_SEND_MODE=${value}: each role reads its own role blocks (the switch paragraph is for reception and the Proprietário guide)`, () => {
      mode(value);
      const text = (role: Role) => JSON.stringify(lessonPageFor(role, "portal", "avaliacao-de-satisfacao")?.lesson.blocks);
      for (const role of ["reception", "admin", "owner"] as const) expect(text(role)).toContain("interruptor");
      expect(text("therapist")).not.toContain("interruptor");
    });
  }

  it("on adds exactly the one lesson to each role's guide, and nothing else moves", () => {
    for (const role of ROLES) {
      mode("off");
      const off = guideLessonsFor(role).map((l) => l.id);
      mode("on");
      const on = guideLessonsFor(role).map((l) => l.id);
      expect(on.filter((id) => id !== SURVEY_LESSON), role).toEqual(off);
      expect(on.length - off.length, role).toBe(1);
    }
  });
});

describe("featureShown fails closed", () => {
  it("no feature: shown, whatever the switch", () => {
    mode("off");
    expect(featureShown(null)).toBe(true);
  });

  it("a feature with no entry in GUIDE_FEATURES, or an inherited property name: hidden, even with the survey on", () => {
    mode("on");
    for (const name of ["agenda", "surveys", "constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(featureShown(name), name).toBe(false);
    }
  });
});

describe("the PDFs never print a feature lesson (a committed PDF cannot read a switch)", () => {
  const guide = loadGuide();

  it("printableGuide leaves the survey lesson out and keeps every other lesson and FAQ entry", () => {
    expect(guide.errors).toEqual([]);
    const printable = printableGuide(guide);
    expect(guide.lessons.some((l) => l.id === SURVEY_LESSON)).toBe(true);
    expect(printable.lessons.some((l) => l.id === SURVEY_LESSON)).toBe(false);
    expect(printable.lessons.map((l) => l.id)).toEqual(guide.lessons.filter((l) => l.feature === null).map((l) => l.id));
    expect(printable.faq.map((f) => f.id)).toEqual(guide.faq.map((f) => f.id));
  });

  it("the manifest counts the printed lessons: the published ones less the survey lesson", () => {
    const manifest = readManifest();
    const printedLessons = printableGuide(guide).lessons.filter((l) => !l.hold).length;
    expect(manifest.source.lessons).toBe(printedLessons);
    expect(manifest.source.lessons).toBe(GUIDE_DATA.lessons.length - 1);
    for (const pdf of manifest.pdfs) expect(pdf.lessons).toBe(printedLessons);
  });

  it("build-guide.mjs prints, counts and hashes printableGuide(loadGuide()), never the loaded guide itself", () => {
    const source = readFileSync(join(REPO_ROOT, "docs/guide/build/build-guide.mjs"), "utf8");
    expect(source).toMatch(/import \{[^}]*\bprintableGuide\b[^}]*\} from '\.\/guide-model\.mjs'/);
    expect(source).toContain("const guide = printableGuide(loaded);");
    // The one other loadGuide() call in the builder would be a second, unfiltered source.
    expect(source.match(/loadGuide\(/g)).toHaveLength(1);
  });

  it("the source hash ignores a feature lesson: adding one leaves the hash as it was (seeded)", () => {
    const support = guideFile(
      { id: "inicio.apoio", title: "Apoio", goal: "Servir a secção.", roles: "rececao, terapeuta, proprietario", order: "rececao 9, terapeuta 9, proprietario 9" },
      "## Apoio\n\nTexto.",
    );
    const base = { "01-inicio/_seccao.md": INICIO_SECTION, "01-inicio/09-apoio.md": support };
    const without = loadFixture(base);
    const withFeature = loadFixture({ ...base, "01-inicio/01-exemplo.md": exampleLesson({ feature: "survey" }) });
    const withPlain = loadFixture({ ...base, "01-inicio/01-exemplo.md": exampleLesson() });
    expect([without.errors, withFeature.errors, withPlain.errors]).toEqual([[], [], []]);
    expect(guideSourceHash(withFeature)).toBe(guideSourceHash(without));
    // The control: the same lesson without the key is printed, so it moves the hash.
    expect(guideSourceHash(withPlain)).not.toBe(guideSourceHash(without));
  });
});

describe("the model holds the key to its shape", () => {
  const support = guideFile(
    { id: "inicio.apoio", title: "Apoio", goal: "Servir a secção.", roles: "rececao, terapeuta, proprietario", order: "rececao 9, terapeuta 9, proprietario 9" },
    "## Apoio\n\nTexto.",
  );
  const LESSON = "01-inicio/01-exemplo.md";

  it("null arm: a lesson with feature: survey loads, and carries the name into the JSON", () => {
    const guide = loadFixture({ "01-inicio/_seccao.md": INICIO_SECTION, "01-inicio/09-apoio.md": support, [LESSON]: exampleLesson({ feature: "survey" }) });
    expect(guide.errors).toEqual([]);
    expect(guide.lessons.find((l) => l.id === "inicio.exemplo")?.feature).toBe("survey");
  });

  it("refuses a feature name that is not a slug", () => {
    const guide = loadFixture({ "01-inicio/_seccao.md": INICIO_SECTION, "01-inicio/09-apoio.md": support, [LESSON]: exampleLesson({ feature: "Survey On" }) });
    expect(guide.errors).toEqual([`${LESSON}:7: "Survey On" is not a feature name such as survey`]);
  });

  it("refuses the key on a section file", () => {
    const section = guideFile(
      { id: "inicio", title: "Início", goal: "Orientar-se.", roles: "rececao, terapeuta, proprietario", order: "rececao 1, terapeuta 1, proprietario 1", feature: "survey" },
      "## Início\n\nTexto.",
    );
    const guide = loadFixture({ "01-inicio/_seccao.md": section, "01-inicio/09-apoio.md": support });
    expect(guide.errors).toEqual(['01-inicio/_seccao.md:7: a section file takes id, title, goal, roles and order, not "feature"']);
  });

  it("a section must stand without its feature lessons: one served only by a feature lesson is refused", () => {
    const guide = loadFixture({ "01-inicio/_seccao.md": INICIO_SECTION, [LESSON]: exampleLesson({ feature: "survey" }) });
    expect(guide.errors).toEqual([
      '01-inicio/_seccao.md: the section lists "rececao", but no published lesson in it does',
      '01-inicio/_seccao.md: the section lists "terapeuta", but no published lesson in it does',
      '01-inicio/_seccao.md: the section lists "proprietario", but no published lesson in it does',
    ]);
  });

  it("an FAQ entry waits on the same feature as its primary lesson, both ways", () => {
    const entry = (front: Record<string, string>) =>
      guideFile(
        { id: "perguntas.exemplo", title: "Exemplo", question: "Como?", roles: "rececao", order: "rececao 1", see: "inicio.exemplo", ...front },
        "## Exemplo\n\nAssim.",
      );
    const files = (lessonFront: Record<string, string>, entryFront: Record<string, string>) => ({
      "01-inicio/_seccao.md": INICIO_SECTION,
      "01-inicio/09-apoio.md": support,
      [LESSON]: exampleLesson({ faq: "exemplo", ...lessonFront }),
      "00-perguntas/01-exemplo.md": entry(entryFront),
    });
    expect(loadFixture(files({ feature: "survey" }, { feature: "survey" })).errors).toEqual([]);
    expect(loadFixture(files({}, {})).errors).toEqual([]);
    expect(loadFixture(files({ feature: "survey" }, {})).errors).toEqual([
      '00-perguntas/01-exemplo.md: feature is the primary lesson\'s, "survey", not "none"',
    ]);
    expect(loadFixture(files({}, { feature: "survey" })).errors).toEqual([
      '00-perguntas/01-exemplo.md: feature is the primary lesson\'s, "none", not "survey"',
    ]);
  });
});
