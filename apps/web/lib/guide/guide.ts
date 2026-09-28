// The guide that /ajuda shows, read from guide-data.json and narrowed to the
// viewer's role.
//
// guide-data.json is GENERATED from the lesson source in docs/guide/content by
// docs/guide/build/gen-guide-data.mjs and committed; guide-data.test.ts fails
// when it differs from the source. Never edit it by hand.
//
// Who sees what (owner ruling on the G1 proposal, Q2):
//   reception  the Receção lessons, in the Receção order
//   therapist  the Terapeuta lessons, in the Terapeuta order
//   owner      the Proprietário lessons, which are every published lesson
//   admin      the Proprietário lessons it can open: those whose capability
//              the admin role holds in packages/auth
// The capability test runs for every role, not only admin. A lesson is written
// only for roles that hold its capability (guide-roles.test.ts proves it), so
// for the three guide profiles the test changes nothing, and a lesson that
// ever named a role without the capability would stay hidden rather than
// describe a screen that role cannot open.
//
// Inside a lesson, a role block is text for some profiles only. Every lesson
// these helpers return has its role blocks already resolved for the viewer:
// a block naming the viewer's profile is unwrapped in place, any other block
// is dropped, so the page never receives text meant for another role and has
// no role block left to render. An admin reads the Proprietário blocks.
//
// This is presentation, not access control: the whole guide is public in the
// repository. Nothing about a viewer is read or stored here.

import { can, type Capability, type Role } from "@osteojp/auth";

import guideJson from "./guide-data.json";

export type GuideProfile = "rececao" | "terapeuta" | "proprietario";

/** A run of text: plain, or a UI label in bold. */
export type GuideSpan = { text: string } | { strong: string };

export type GuideBlock =
  | { type: "heading"; level: number; spans: GuideSpan[] }
  | { type: "para"; spans: GuideSpan[] }
  | { type: "list"; kind: "ul" | "ol"; start: number; items: GuideSpan[][] }
  /** Where the capture pair sits; its files are the lesson's `images`. */
  | { type: "figure" }
  /** Shown only to viewers of these profiles. */
  | { type: "role"; roles: GuideProfile[]; blocks: GuideBlock[] };

export type GuideImage = { src: string; alt: string };

export type GuideSection = {
  id: string;
  file: string;
  title: string;
  goal: string | null;
  roles: GuideProfile[];
  order: Partial<Record<GuideProfile, number>>;
  blocks: GuideBlock[];
  words: number;
};

export type GuideLesson = GuideSection & {
  section: string;
  question: string | null;
  capability: string | null;
  screens: string[];
  shots: string | null;
  faq: string[];
  answers: string[];
  see: string[];
  review: string | null;
  /** null: no capture yet, and the page shows "sem imagem" instead. */
  images: { phone: GuideImage; desktop: GuideImage } | null;
};

/** A block as one viewer reads it: every role block already resolved. */
export type GuideViewBlock = Exclude<GuideBlock, { type: "role" }>;

/** A lesson or FAQ entry as one viewer reads it. */
export type GuideViewLesson = Omit<GuideLesson, "blocks"> & { blocks: GuideViewBlock[] };

export type GuideData = {
  $comment: string;
  format: number;
  profiles: GuideProfile[];
  sections: GuideSection[];
  lessons: GuideLesson[];
  faq: GuideLesson[];
  held: { id: string; hold: string }[];
  orders: Record<GuideProfile, { sections: string[]; lessons: string[]; faq: string[] }>;
};

// The JSON's inferred type is a structural literal, not GuideData; the drift
// test holds the file to the generator, and the generator to this shape.
export const GUIDE_DATA = guideJson as unknown as GuideData;

/** The guide profile each staff role reads. Admin reads the Proprietário guide, narrowed below. */
export const PROFILE_OF_ROLE: Record<Role, GuideProfile> = {
  owner: "proprietario",
  admin: "proprietario",
  therapist: "terapeuta",
  reception: "rececao",
};

/** Whether a capability name is one packages/auth knows (the owner holds every one). */
export function isCapability(name: string): name is Capability {
  return can("owner", name as Capability);
}

/** Whether a lesson or FAQ entry is for this role: its profile is listed, and the role holds its capability. */
export function visibleTo(role: Role, item: GuideLesson): boolean {
  if (!item.roles.includes(PROFILE_OF_ROLE[role])) return false;
  if (item.capability === null) return true;
  return isCapability(item.capability) && can(role, item.capability);
}

/**
 * The blocks a role reads: a role block naming the role's profile is replaced
 * by its own blocks, any other role block is dropped, every other block stays.
 */
export function blocksFor(role: Role, blocks: GuideBlock[]): GuideViewBlock[] {
  const profile = PROFILE_OF_ROLE[role];
  return blocks.flatMap((block): GuideViewBlock[] => {
    if (block.type !== "role") return [block];
    return block.roles.includes(profile) ? blocksFor(role, block.blocks) : [];
  });
}

/** A lesson or FAQ entry as a role reads it: its role blocks resolved by blocksFor. */
export function lessonFor(role: Role, item: GuideLesson): GuideViewLesson {
  return { ...item, blocks: blocksFor(role, item.blocks) };
}

/** The sections a role sees, in its profile's order, each with its lessons in order. Empty sections are left out. */
export function guideSectionsFor(
  role: Role,
  data: GuideData = GUIDE_DATA,
): { section: GuideSection; lessons: GuideViewLesson[] }[] {
  const order = data.orders[PROFILE_OF_ROLE[role]];
  const lessonById = new Map(data.lessons.map((lesson) => [lesson.id, lesson]));
  const sectionById = new Map(data.sections.map((section) => [section.id, section]));
  const out: { section: GuideSection; lessons: GuideViewLesson[] }[] = [];
  for (const sectionId of order.sections) {
    const section = sectionById.get(sectionId);
    if (!section) continue;
    const lessons = order.lessons
      .map((id) => lessonById.get(id))
      .filter((lesson): lesson is GuideLesson => lesson !== undefined && lesson.section === sectionId)
      .filter((lesson) => visibleTo(role, lesson))
      .map((lesson) => lessonFor(role, lesson));
    if (lessons.length > 0) out.push({ section, lessons });
  }
  return out;
}

/** The lessons a role sees, in order: its section order, then the lesson order. */
export function guideLessonsFor(role: Role, data: GuideData = GUIDE_DATA): GuideViewLesson[] {
  return guideSectionsFor(role, data).flatMap((entry) => entry.lessons);
}

/** The FAQ entries a role sees, in its profile's order. */
export function guideFaqFor(role: Role, data: GuideData = GUIDE_DATA): GuideViewLesson[] {
  const entryById = new Map(data.faq.map((entry) => [entry.id, entry]));
  return data.orders[PROFILE_OF_ROLE[role]].faq
    .map((id) => entryById.get(id))
    .filter((entry): entry is GuideLesson => entry !== undefined && visibleTo(role, entry))
    .map((entry) => lessonFor(role, entry));
}
