# Building the platform guide PDF

Run from the repository root:

```sh
node docs/guide/build/build-guide.mjs
```

It reads the chapters in `docs/guide/content/*.md` (in file-name order) and writes four A4 PDFs here, printing each path with its page count:

* `guia-plataforma-osteojp.pdf`: cover, index, every chapter.
* `guia-rececao.pdf`, `guia-terapeuta.pdf`, `guia-proprietario.pdf`: cover and that role's chapter.

A chapter belongs to a role by its file name (`01-rececao.md`, `02-terapeuta.md`, `03-proprietario.md`), or failing that by its `# ` title. A chapter that names no role goes into every PDF.

## What a chapter may contain

`#`, `##` and `###` headings, paragraphs, `* ` and `1. ` lists, `**bold**`, and image lines `![alt](../screens/<role>/<name>-390.png)` alone on their line, with paths relative to `docs/guide/content`. The phone capture (`-390`) and the desktop capture (`-desktop`) of one screen go on consecutive image lines (blank lines between them are fine) and print side by side. Each image is captioned with its alt text ("Agenda no telemóvel"), so a screenshot that a page break has moved away from its heading still names its screen; an image with no alt text is captioned "Telemóvel" or "Computador". A paragraph directly followed by a list is kept on the page of the list's first item.

No dashes: no em dash, no en dash, no character that prints like a hyphen but is not the keyboard one (U+2010, U+2011, the minus sign U+2212 and their small and fullwidth forms), and no hyphen used as punctuation or as a list marker. A hyphen that starts or ends a word ("outro- solto") counts as punctuation. A hyphen inside a word such as palavra-passe or e-mail is fine.

## When it refuses

It prints nothing and exits 1 when there is no chapter file, when a chapter has a dash or a hyphen used as punctuation, when it uses Markdown outside the list above, when an image it names does not exist, or when a role has no chapter. Every problem is listed with its file and line. Exit 2 is a bad argument.

## Requirements

No dependency of its own. Playwright comes from `apps/web` (`@playwright/test`), so run `pnpm install` first. If Chromium is missing: `pnpm --filter web exec playwright install chromium`.

## Options

* `--content <dir>`: read chapters from another directory (image paths resolve against it).
* `--out <dir>`: write the PDFs somewhere else.

## The content check

`scripts/guide-content.test.mjs` runs in `pnpm test:scripts` and checks the chapters without printing them: at least three chapter files, no dashes, no hyphen used as punctuation (and a seeded line proving each of those rules both refuses an offence and accepts palavra-passe, in this test and in the builder), every image exists under `docs/guide/screens`, every screen entry of `docs/guide/outline.md` links its phone and desktop capture (an entry with no capture fails, with a seeded line proving the check both ways), every capture the outline links is shown, phone and desktop images paired, and only the Markdown above. It fails, rather than skips, when `docs/guide/content` does not exist.

```sh
node --test scripts/guide-content.test.mjs
```

## The lesson source (Suporte e Guia)

The guide is moving from the three chapters to short lessons in section folders, one source for `/ajuda` and, in a later PR, for the PDFs. Until then this builder keeps printing the chapters, and the lessons feed only `/ajuda`.

```
docs/guide/content/NN-<section>/_seccao.md      the section: title, goal, roles, its position per role
docs/guide/content/NN-<section>/NN-<slug>.md    a lesson
docs/guide/content/00-perguntas/NN-<slug>.md    an FAQ entry
```

A lesson file opens with a flat front matter block (a line of three hyphens, one `key: value` per line, a line of three hyphens), then a body in the Markdown subset above that starts with `## <title>`. The keys are a closed set: `id title goal roles order capability screens shots faq question answers see review hold`. `id`, `title`, `roles` and `goal` (`question` in an FAQ entry) are required. `roles` names `rececao`, `terapeuta` and `proprietario`; `order` gives each of them a position (`rececao 1, terapeuta 3, proprietario 2`); `capability` is the `packages/auth` permission the task needs; `hold` keeps a lesson out of `/ajuda`. A line `::: terapeuta` (one or more roles) opens a role block and a line `:::` closes it: only those roles see what is inside. A lesson stays under 200 words, role blocks included. Its capture pair, once it exists, is `apps/web/public/ajuda/<section>/<slug>-390.png` and `<slug>-desktop.png`, on consecutive image lines, with `shots: <id>`.

* `guide-model.mjs` reads and checks the source (every problem with its file and line) and orders it per role. It also holds the dash list, the line lint and the Markdown parser this builder uses, so the chapters and the lessons are read by one parser.
* `gen-guide-data.mjs` writes `apps/web/lib/guide/guide-data.json`, the data `/ajuda` renders, and refuses to write while the source has a problem. `--check` compares without writing.

```sh
node docs/guide/build/gen-guide-data.mjs
```

The JSON is committed. `apps/web/lib/guide/guide-data.test.ts` regenerates it and fails when it differs, so run the command above in the same PR as any lesson change. `guide-roles.test.ts` holds each role to its exact lesson list (an administrator reads the Proprietário lessons whose capability it holds), and `guide-lessons.test.ts` holds every lesson to the word limit, its capture pair, no dashes, and bold terms that quote `packages/i18n/src/strings.pt.json`.
