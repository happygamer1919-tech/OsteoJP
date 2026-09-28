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

The JSON is committed. `apps/web/lib/guide/guide-data.test.ts` regenerates it and fails when it differs, so run the command above in the same PR as any lesson change. `guide-roles.test.ts` holds each role to its exact lesson list (an administrator reads the Proprietário lessons whose capability it holds) and to exactly the role blocks written for it (`apps/web/lib/guide/guide.ts` resolves them before the page sees a lesson), and holds a lesson whose page checks something other than its capability to that page's own check. `guide-lessons.test.ts` holds every lesson to the word limit, its capture pair, no dashes, bold terms that quote `packages/i18n/src/strings.pt.json`, and the seven FAQ base tasks to their primary lessons.

## The screenshots (Suporte e Guia)

Every lesson capture is an annotated screenshot of the real staff platform, taken on a LOCAL stack that holds only invented people. Four pieces:

* `seed-guide.mjs` writes the guide's own clinic, "Clínica Exemplo", as a tenant of its own beside the e2e fixture: six staff accounts, two locations, three services and a pack with prices, working hours, sixteen patients with past visits, and the week of 5 to 10 October 2026 in the agenda. Every name is invented ("Marta Exemplo", "Bruno Fictício", "Rita Exemplo"). It refuses any target that is not local (`scripts/local-target.mjs`) and is safe to run again.
* `docs/guide/shots/<lesson id>.shots.json` is one capture spec per lesson: the profile that logs in, the frames, what each frame clicks, and what it annotates. Targets are a CSS selector, a role plus an i18n KEY, a label KEY or a whole form field KEY, never Portuguese copy, and each must match exactly one visible element or the run stops. `capture-guide.mjs` documents the format at its top.
* `capture-guide.mjs` runs the specs. It refuses a base URL whose host is not `localhost` or `127.0.0.1`. Per lesson it writes `apps/web/public/ajuda/<section>/<slug>-390.png` (390 x 844 at scale 2) and `<slug>-desktop.png` (1440 x 900), each the frames side by side, drawn in the `accent-1-700` token with numbers matching the lesson's steps, plus a text record per image.
* The text record, `docs/guide/shots/text/<section>/<slug>-<size>.txt`: first line `sha256 <hex of the PNG>`, then each frame's visible page text at capture time. It is how CI knows what an image shows without reading pixels.

A capture run, from the repository root:

```sh
node scripts/lane-stack.mjs up --lane amber
node docs/guide/build/seed-guide.mjs --lane amber
# start apps/web on the lane's port (3040 for amber) with the lane's env, in UTC as in production, then:
node docs/guide/build/capture-guide.mjs --base-url http://localhost:3040
node docs/guide/build/gen-guide-data.mjs
```

Use `http://localhost`, never `127.0.0.1`: the Next 16 dev server does not hydrate there. `--only <id>,<id>` runs some specs; `--frames <dir>` also writes each frame alone. A lesson gains its capture by adding `shots: <id>` to its front matter and its two image lines at the end of its body; a lesson with no capture shows a "sem imagem" card on `/ajuda`, never a broken image.

Byte stability: the seed writes fixed dates and fixed creation times, a spec opens the agenda and Início on a fixed day (`?date=2026-10-06`), and a spec's `stabilize` list hides a clock or fixes a greeting, so a second run over an unchanged platform rewrites the same bytes and `git diff` shows only what changed. Início follows the real clock in two places the date parameter does not reach (the week chart and the month's revenue), so its captures change with the week.

## The names check

The repository is public. `apps/web/lib/guide/guide-names.test.ts` (in `pnpm test`, CI job "Lint + typecheck + test") holds the guide's committed files to having no production name in them:

* every PNG under `apps/web/public/ajuda` has its text record, and the record's `sha256` line is that PNG's;
* the text records, `docs/guide/content`, `docs/guide/shots`, `seed-guide.mjs`, `apps/web/lib/guide/guide-data.json` and `apps/web/e2e/seed` are scanned against the production names list in the environment variable `GUIDE_FORBIDDEN_NAMES`. A hit fails with the file and line only, never the words;
* with `GUIDE_FORBIDDEN_NAMES` empty the scan cannot run: it fails when `GUIDE_NAMES_REQUIRED` is `1`, and otherwise passes with a console line saying the check is not wired yet;
* seeded arms prove it both ways on a synthetic list.

The legacy captures under `docs/guide/screens` have no text records; the test lists them and they retire when the PDFs move to the lesson source.

**The list holds no name.** `guide-names.mjs` normalizes a name (NFKD, no accents, lower case, letters and digits only, single spaces), keeps its first four words (a candidate in a text is a run of 2 to 4 words, so a longer name is found by its first four; a one word name is left out, it could never be found), and keeps the first 4 bytes of its sha256. The list is those numbers sorted, written as gaps in LEB128, compressed with deflate and written in base64 after `v1:`. Measured on 15 000 synthetic names: 55 755 bytes, OVER the 49 152 bytes of one Actions secret; one secret holds about 13 000 names. `encode-guide-names.mjs` refuses a list that does not fit and says how many parts to split it into; `--part k/N` writes one part (by hash range), and the test reads several parts from one variable, separated by spaces.

A 32 bit hash can collide: with N names and U distinct candidate runs in the scanned files, about U x N / 4 294 967 296 runs match by chance. Measured with this PR's captures, U is about 83 500: at 10 000 names that is about 0.19 chance hits, at 13 000 about 0.25, so a first red on wiring may be a collision rather than a name (each later PR adds only its own new runs). A hit names the file and line, and the words on that line are either a real name (replace it) or not.

### Building the list: OWNER-RUN, never by an agent

Run by the owner, in zsh, from the root of a checkout of `main`, in one paste. The names go from `psql` straight into the encoder and leave it as hashes; no terminal and no file sees a name. It reads production read only (`guide-names.sql`: `patients.full_name` and `users.full_name`), refuses unless the target guard confirms production, refuses to set an empty list, and prints only the list's size in bytes.

```sh
(
set -o pipefail
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs || { echo "STOP: not the production target; nothing was read"; exit 1; }
LIST=$(PGOPTIONS='-c default_transaction_read_only=on' psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -f docs/guide/build/guide-names.sql | node docs/guide/build/encode-guide-names.mjs) || { echo "STOP: the list was not built (read the line above); the secret is unchanged"; exit 1; }
echo "encoded list: ${#LIST} bytes"
printf '%s' "${LIST}" | gh secret set GUIDE_FORBIDDEN_NAMES --repo happygamer1919-tech/OsteoJP
)
gh secret list --repo happygamer1919-tech/OsteoJP | grep GUIDE_FORBIDDEN_NAMES
```

If the encoder answers that the list is over one secret, run the block once per part, with `--part 1/2` (then `--part 2/2`) after `encode-guide-names.mjs` and the secret names `GUIDE_FORBIDDEN_NAMES` and `GUIDE_FORBIDDEN_NAMES_2`; the CI step then passes both, joined by a space, in `GUIDE_FORBIDDEN_NAMES`.

Wiring it into CI is a GATE-CHANGE (PR 5, the owner merges): the "Lint + typecheck + test" step gets `GUIDE_FORBIDDEN_NAMES` from the secret and `GUIDE_NAMES_REQUIRED: "1"`, and `turbo.json`'s `test` task must list both variables in `env`, because turbo's strict environment mode hides every variable a task does not declare: without that the test sees neither, and passes as "not wired yet".
