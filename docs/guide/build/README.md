# Building the platform guide PDFs

Run from the repository root:

```sh
node docs/guide/build/build-guide.mjs
```

It reads the lesson source, `docs/guide/content/NN-<section>/` and `docs/guide/content/00-perguntas/` (the same source `/ajuda` reads, below), through `guide-model.mjs`, and prints four A4 PDFs, printing each with its path, pages, size, lessons, FAQ entries and whether it is committed:

* **`docs/guide/pdf/guia-plataforma-osteojp.pdf`, the full guide, COMMITTED**: every published lesson and FAQ entry, in the Proprietário order, with every role block printed under a small "Só para <Role>" label ("Só para Terapeuta", "Só para Receção e Proprietário").
* **`docs/guide/build/guia-rececao.pdf`, `guia-terapeuta.pdf`, `guia-proprietario.pdf`, one per role, BUILT AND NEVER COMMITTED** (the `*.pdf` of `docs/guide/build` is gitignored): the lessons and FAQ entries of that profile (`lessonsFor` and `faqFor` in `guide-model.mjs`), in its order, with only the role blocks written for it, unwrapped as `/ajuda` shows them. Admin is not a PDF profile.
* **`docs/guide/pdf/guide-pdf.manifest.json`, COMMITTED**: the source hash the committed PDF was built from, and the full guide's file name, profile, pages, size and sha256. It names no role PDF. Written by the builder; never edited by hand.

**Only the full guide is committed, for the weight of the repository.** Every rebuild rewrites every PDF it prints, because Chromium stamps each with its build time, so a byte-identical rebuild is impossible and each rebuild is a new file in the history of a public repository. The four PDFs together were about 34 MB of history per lesson change; the full guide alone is about 9 MB. The spec item ("One content source feeds both the PDF and /ajuda. The PDF is regenerated from it in the same PR that changes it; a CI check fails when the two diverge.") names one PDF, the full guide, and it holds every lesson and every role block. Decision of the lead, 2026-09-28. A role PDF is built when someone needs one to hand out:

```sh
node docs/guide/build/build-guide.mjs
# then take docs/guide/build/guia-rececao.pdf (or guia-terapeuta.pdf, guia-proprietario.pdf)
```

The committed PDF's page count and source hash are in the manifest; the builder prints every PDF's page count when it runs. Numbers written here would go stale with the next lesson PR, so none are.

Each PDF has a cover, an index, "Perguntas frequentes" first, then the sections. A lesson prints its title, its goal, its body and its capture pair side by side (the phone capture and the desktop capture, at one height, each captioned by its alt text), or, while it has no capture, a small "Sem imagem" note with the same words as `/ajuda` (`guide.noImage`, `guide.noImageHint` in `packages/i18n/src/strings.pt.json`): never a broken image. An FAQ entry prints its question, its answer and the lessons it links that the same PDF prints; its capture pair is its primary lesson's, and prints with that lesson. A held lesson (`hold: GUEST-05`) is never printed. The colours are tokens read from `packages/ui/theme.css`: text `--color-text-primary`, secondary text `--color-text-secondary`, headings `--color-primary-800`, the cover bar and title rule `--color-accent-2-500`, the role and "Só para" labels `--color-accent-2-700`, borders `--color-border-strong`, the "Sem imagem" note `--color-surface-muted`, the page `--color-surface`.

**A capture pair of two or three frames prints small.** Side by side at one height across 174 mm, a pair of two frames is about 41 mm tall and a pair of three about 28 mm. The captures are embedded at their full resolution, so they read when the PDF is zoomed on a screen, not on paper.

## The rule: the PR that changes the lesson source rebuilds the PDF

The full guide PDF is committed, so a PR that changes a lesson, an FAQ entry, a section file or a capture also runs, after its last edit:

```sh
node docs/guide/build/gen-guide-data.mjs
node docs/guide/build/build-guide.mjs
```

and commits `apps/web/lib/guide/guide-data.json`, `docs/guide/pdf/guia-plataforma-osteojp.pdf` and the manifest with the change, in the same PR. The three role PDFs the same command writes to `docs/guide/build/` are gitignored and stay out of the commit.

**The check is `apps/web/lib/guide/guide-pdf.test.ts`**, in `pnpm test` (CI job "Lint + typecheck + test"). It needs neither Chromium nor the network. It fails when:

* the source hash of the lesson source as it is now is not the manifest's: the source changed and the PDF was not rebuilt;
* the committed PDF's sha256 is not the manifest's: a PDF replaced by hand;
* the PDF's document title (its Info `/Title`) does not end with "(fonte <the first 16 hex of the manifest's source hash>)", which the builder puts there so each PDF names the source it was printed from;
* `docs/guide/pdf` holds a file the manifest does not name (a role PDF included), or lacks one it names;
* the manifest names anything but the full guide, alone.

Seeded arms prove each failure both ways on copies in a temporary folder, and an untouched copy passes. The title arm runs on both forms Chromium writes a title in: a literal string, on a copy of the committed PDF, and UTF-16 in a hex string (the form of a title with an accent, such as the Receção PDF's), on a small hand-written PDF, since the committed PDF's title has no accent.

The source hash is `guideSourceHash` in `guide-model.mjs`: the sha256 of the published model (every section, every published lesson and FAQ entry with its front matter and blocks, role blocks included, and each profile's order) plus the sha256 of every capture those lessons and entries show. A held lesson is not in it, so editing one does not ask for a rebuild. The builder's code, its CSS and the theme tokens are not in it either: a change to how the PDFs look does not fail the check, so rebuild in the PR that makes it. Nor are the four platform strings the PDF shares with /ajuda (`guide.noImage`, `guide.noImageHint`, `guide.tabFaq` and `guide.faqLessonsLabel` in `packages/i18n/src/strings.pt.json`): a PR that rewords one must rebuild the PDF too, or the two say different words while the check stays green. The file names, which PDF is committed, the folders, the manifest and the title, shared by the builder and the check, are in `guide-pdf.mjs` (`PDF_JOBS`, `COMMITTED_JOBS`, `PDF_DIR`, `BUILD_DIR`).

Every rebuild rewrites the committed PDF (Chromium stamps it with its build time), so each one adds about 9 MB to the repository's history. Rebuild once per PR, after the last edit.

## Chapter mode, and what is no longer the PDFs' source

The three chapter files at the top of `docs/guide/content` (`01-rececao.md`, `02-terapeuta.md`, `03-proprietario.md`) and the captures under `docs/guide/screens` are **no longer the PDFs' source**. They stay in the repository until the GATE-CHANGE #1481 lets the frozen `scripts/guide-content.test.mjs` stop requiring them; until then that test checks them, and spawns the builder's chapter mode on a temporary folder to assert its lint messages.

Chapter mode is the old builder, with the same lint and the same messages (the frozen `scripts/guide-content.test.mjs` asserts them), and runs only with `--content`. One thing did change: its colours now come from `packages/ui/theme.css` like the lesson mode's, and it stops if a token is missing.

```sh
node docs/guide/build/build-guide.mjs --content docs/guide/content --out <dir>
```

It reads the flat chapter files `<dir>/*.md` in file-name order (never the lesson folders) and writes four PDFs to `--out`, by default `docs/guide/build`, whose `*.pdf` is gitignored: `guia-plataforma-osteojp.pdf` (cover, index, every chapter) and one per role (cover and that role's chapter). Those are the file names the lesson build gives its role PDFs in the same folder, so a chapter build there replaces them; neither is committed. A chapter belongs to a role by its file name (`01-rececao.md`, `02-terapeuta.md`, `03-proprietario.md`), or failing that by its `# ` title. A chapter that names no role goes into every PDF. It writes no manifest.

## What a chapter may contain

`#`, `##` and `###` headings, paragraphs, `* ` and `1. ` lists, `**bold**`, and image lines `![alt](../screens/<role>/<name>-390.png)` alone on their line, with paths relative to `docs/guide/content`. The phone capture (`-390`) and the desktop capture (`-desktop`) of one screen go on consecutive image lines (blank lines between them are fine) and print side by side. Each image is captioned with its alt text ("Agenda no telemóvel"), so a screenshot that a page break has moved away from its heading still names its screen; an image with no alt text is captioned "Telemóvel" or "Computador". A paragraph directly followed by a list is kept on the page of the list's first item. A lesson uses the same subset, plus its front matter and role blocks (below).

No dashes: no em dash, no en dash, no character that prints like a hyphen but is not the keyboard one (U+2010, U+2011, the minus sign U+2212 and their small and fullwidth forms), and no hyphen used as punctuation or as a list marker. A hyphen that starts or ends a word ("outro- solto") counts as punctuation. A hyphen inside a word such as palavra-passe or e-mail is fine.

## When it refuses

With the lesson source, it prints nothing and exits 1 when the source has a problem (every problem listed with its file and line, as `gen-guide-data.mjs` lists them), when an image does not load in the page, or when a printed PDF's title does not carry the source hash; it writes the PDFs and the manifest only after all four are printed and checked. In chapter mode it prints nothing and exits 1 when there is no chapter file, when a chapter has a dash or a hyphen used as punctuation, when it uses Markdown outside the list above, when an image it names does not exist, or when a role has no chapter; every problem is listed with its file and line. Exit 2 is a bad argument.

## Requirements

No dependency of its own. Playwright comes from `apps/web` (`@playwright/test`), so run `pnpm install` first. If Chromium is missing: `pnpm --filter web exec playwright install chromium`.

## Options

* `--out <dir>`: write all four PDFs (and, with the lesson source, the manifest) into that one folder, for a trial build that leaves `docs/guide/pdf` and `docs/guide/build` alone. Never `--out docs/guide/pdf`: the three role PDFs would land beside the committed one, and the check fails the folder.
* `--content <dir>`: chapter mode: read flat chapter files from that directory (image paths resolve against it).

## The content check

`scripts/guide-content.test.mjs` runs in `pnpm test:scripts` and checks the chapters without printing them: at least three chapter files, no dashes, no hyphen used as punctuation (and a seeded line proving each of those rules both refuses an offence and accepts palavra-passe, in this test and in the builder's chapter mode), every image exists under `docs/guide/screens`, every screen entry of `docs/guide/outline.md` links its phone and desktop capture (an entry with no capture fails, with a seeded line proving the check both ways), every capture the outline links is shown, phone and desktop images paired, and only the Markdown above. It fails, rather than skips, when `docs/guide/content` does not exist.

```sh
node --test scripts/guide-content.test.mjs
```

## The lesson source (Suporte e Guia)

The guide is short lessons in section folders: one source for `/ajuda` and for the PDFs above.

```
docs/guide/content/NN-<section>/_seccao.md      the section: title, goal, roles, its position per role
docs/guide/content/NN-<section>/NN-<slug>.md    a lesson
docs/guide/content/00-perguntas/NN-<slug>.md    an FAQ entry
```

A lesson file opens with a flat front matter block (a line of three hyphens, one `key: value` per line, a line of three hyphens), then a body in the Markdown subset above that starts with `## <title>`. The keys are a closed set: `id title goal roles order capability screens shots faq question answers see review hold`. `id`, `title`, `roles` and `goal` (`question` in an FAQ entry) are required. `roles` names `rececao`, `terapeuta` and `proprietario`; `order` gives each of them a position (`rececao 1, terapeuta 3, proprietario 2`); `capability` is the `packages/auth` permission the task needs; `hold` keeps a lesson out of `/ajuda`. A line `::: terapeuta` (one or more roles) opens a role block and a line `:::` closes it: only those roles see what is inside. A lesson stays under 200 words, role blocks included. Its capture pair, once it exists, is `apps/web/public/ajuda/<section>/<slug>-390.png` and `<slug>-desktop.png`, on consecutive image lines, with `shots: <id>`.

An FAQ entry (`00-perguntas/NN-<slug>.md`, Perguntas frequentes) takes `id` (`perguntas.<slug>`), `title`, `question`, `roles`, `order`, `capability` and `see`, then a short answer of three to five lines with no heading of its own. `see` names the lessons it links, its primary lesson first: the lesson that teaches the task in full, which names the entry back with `faq: <slug>`. The entry is read by the roles of its primary lesson or fewer, with the same `capability`, and every lesson it links is published and read by at least one of its roles; `/ajuda` shows each viewer only the links to lessons in that viewer's own guide. An entry has no capture of its own and no `shots`: it carries its primary lesson's capture pair, on the same two image lines, exactly when that lesson has one, and until then `/ajuda` shows the "Sem imagem" card. The order a role reads the entries in is their `order` positions for that role, not the file numbers: the model holds the numbers unique in the folder and each role's positions unique, but does not hold the two in step. The seven base tasks are `01` to `07`, numbered in the order their `order` keys give every role today.

* `guide-model.mjs` reads and checks the source (every problem with its file and line) and orders it per role. It also holds the dash list, the line lint and the Markdown parser the builder's chapter mode uses, so the chapters and the lessons are read by one parser, and `guideSourceHash`, the source hash the PDFs are bound to.
* `gen-guide-data.mjs` writes `apps/web/lib/guide/guide-data.json`, the data `/ajuda` renders, and refuses to write while the source has a problem. `--check` compares without writing.

```sh
node docs/guide/build/gen-guide-data.mjs
```

The JSON is committed, and the command prints what it carries (sections, lessons, FAQ entries, held items). `apps/web/lib/guide/guide-data.test.ts` regenerates it and fails when it differs, so run the command above in the same PR as any lesson change. `guide-roles.test.ts` holds each role to its exact lesson list (an administrator reads the Proprietário lessons whose capability it holds) and to exactly the role blocks written for it (`apps/web/lib/guide/guide.ts` resolves them before the page sees a lesson), and holds a lesson whose page checks something other than its capability to that page's own check. `guide-lessons.test.ts` holds every lesson to the word limit, its capture pair, no dashes, bold terms that quote `packages/i18n/src/strings.pt.json`, the seven FAQ base tasks to their primary lessons and their files, and every FAQ answer to three to five lines for each role that reads it. `guide-roles.test.ts` also holds each role to its exact FAQ entries, to the lessons each one links for that role and to exactly the role lines of its answers, and holds an answer's role line that names a gated screen to that screen's own check.

## The screenshots (Suporte e Guia)

Every lesson capture is an annotated screenshot of the real staff platform, taken on a LOCAL stack that holds only invented people. Four pieces:

* `seed-guide.mjs` writes the guide's own clinic, "Clínica Exemplo", as a tenant of its own beside the e2e fixture: six staff accounts, two locations, three services and a pack with prices, working hours, sixteen patients with past visits, and the week of 5 to 10 October 2026 in the agenda. Every name is invented ("Marta Exemplo", "Bruno Fictício", "Rita Exemplo"). It refuses any target that is not local (`scripts/local-target.mjs`) and is safe to run again.
* `docs/guide/shots/<lesson id>.shots.json` is one capture spec per lesson: the profile that logs in, the frames, what each frame clicks, and what it annotates. Targets are a CSS selector, a role plus an i18n KEY, a label KEY or a whole form field KEY, never Portuguese copy, and each must match exactly one visible element or the run stops. `capture-guide.mjs` documents the format at its top.
* `capture-guide.mjs` runs the specs. It refuses a base URL whose host is not `localhost` or `127.0.0.1`, or that carries a user name or password, and exits 2 before it opens a browser. `apps/web/lib/guide/guide-capture.test.ts` holds that refusal on the deployed hosts and on hosts that look local and are not (a subdomain, a user part, a fragment, `0.0.0.0`), and runs the command itself on two hosts under `.invalid` with no browser installed, so that even a broken refusal reaches nothing. Per lesson it writes `apps/web/public/ajuda/<section>/<slug>-390.png` (390 x 844 at scale 2) and `<slug>-desktop.png` (1440 x 900), each the frames side by side, drawn in the `accent-1-700` token with numbers matching the lesson's steps, plus a text record per image.
* The text record, `docs/guide/shots/text/<section>/<slug>-<size>.txt`: first line `sha256 <hex of the PNG>`, then per frame a line `## frame N` and the page's visible text at capture time, then a line `## frame N form values` and what the frame's visible form fields show, one per line: the value of each input and text box (its placeholder when it is empty) and the chosen option of each list. The page text alone leaves form fields out, so a name typed in a field would be in the image and not in the record. Password, hidden, checkbox, radio and file inputs show no value as text and are left out. It is how CI knows what an image shows without reading pixels.

A capture run, from the repository root:

```sh
node scripts/lane-stack.mjs up --lane amber
node docs/guide/build/seed-guide.mjs --lane amber
# start apps/web on the lane's port (3040 for amber) with the lane's env, in UTC as in production, then:
node docs/guide/build/capture-guide.mjs --base-url http://localhost:3040
node docs/guide/build/gen-guide-data.mjs
```

Use `http://localhost`, never `127.0.0.1`: the Next 16 dev server does not hydrate there. `--only <id>,<id>` runs some specs; `--frames <dir>` also writes each frame alone. A lesson gains its capture by adding `shots: <id>` to its front matter and its two image lines at the end of its body; a lesson with no capture shows a "sem imagem" card on `/ajuda`, never a broken image.

Byte stability: the seed writes fixed dates and fixed creation times, a spec opens the agenda and Início on a fixed day (`?date=2026-10-06`), and a spec's `stabilize` list hides a clock or fixes a greeting, so a second run over an unchanged platform on the same day rewrites the same bytes and `git diff` shows only what changed. Two exceptions:

* **Início follows the real clock in four places** the date parameter does not reach. The week chart and the month's revenue are the real week and month. "Marcações hoje" and "Próximas marcações" are worse: `apps/web/app/dashboard/page.tsx` fetches the bookings from the real today to seven days later and only then keeps those of `?date`, so a day outside that window shows none. The seed puts 12 bookings on 6 October 2026. Captured before 30 September 2026, the five Início images show 0 of them; captured from 30 September to 5 October they show all 12 (on 6 October itself, only those still to come); captured after 6 October they show 0 again. The Início images therefore change whenever they are recaptured on another day, and show a full day only when captured in that window. Fixing it is a change to the dashboard, outside the guide.
* **Two sources of drift outside the clock were measured, and neither changes what an image says.** First, bookings that start at the same minute are listed in whatever order the database returns them, because `listAppointments` in `apps/web/lib/scheduling/data.ts` orders by start time only; running the seed again rewrites those rows and can swap them. After the seed ran again on 28 September, `agenda/encontrar-marcacoes-desktop.png` listed bookings that start at the same minute on 5, 6 and 7 October in another order, with the same bookings on each day, and three runs after that were identical. Second, an occasional raster difference of 1 or 2 colour levels on the rounded corners of form fields, invisible to the eye: `pacotes/atribuir-pacote-desktop.png` differed from the capture of a few hours earlier in 103 pixels, every one on the left corners of the drawer's fields, with its text identical, and three runs in a row after that were identical. The earlier one in four difference on `agenda/registar-o-estado-desktop.png` did not recur in four runs, and its pixels were not kept, so which of the two it was is not known. So a recapture can rewrite an image whose content did not change; the text record shows whether anything a reader sees did.

## The names check

The repository is public. `apps/web/lib/guide/guide-names.test.ts` (in `pnpm test`, CI job "Lint + typecheck + test") holds the guide's committed files to having no production name in them:

* every file under `apps/web/public/ajuda` is a PNG with its text record, the record's `sha256` line is that PNG's, and the record has every frame's form values. Any other file there (a JPEG, a WebP, an SVG) fails, because it would escape this check and the scan. A seeded arm runs the record writer of `capture-guide.mjs` (`textRecord`) through this check, so the tool and the check agree on what a record is;
* the text records, `docs/guide/content`, `docs/guide/shots`, `seed-guide.mjs`, `apps/web/lib/guide/guide-data.json`, the guide tests' fixture `apps/web/lib/guide/guide-test-fixture.ts`, the e2e seed `apps/web/e2e/seed` and the e2e fixtures `apps/web/e2e/fixtures.ts` are scanned against the production names list in the environment variable `GUIDE_FORBIDDEN_NAMES`. The e2e specs and helpers are not: the people they name are the ones the e2e fixtures and seed create. A hit fails with the file, the line and the line's context hash, never the words. A line waived in `guide-names-waived.txt` does not fail (below);
* with `GUIDE_FORBIDDEN_NAMES` empty the scan cannot run: it fails when `GUIDE_NAMES_REQUIRED` is `1`, and otherwise passes with a console line saying the check is not wired yet;
* seeded arms prove it both ways on a synthetic list, through the same function the live check runs: not wired, fail closed, a hit through the environment (whole list and split list), no hit, a malformed list, and a waiver. Another holds that what the check decides carries no size of the list, so its public log cannot print one.

Once GATE-CHANGE #1481 merges, `guide-names-waived.txt` is a frozen gate file (with `guide-names.mjs` and `guide-names.test.ts`, pinned in `.github/gate-manifest.json`), so adding or removing a waiver is itself a GATE-CHANGE the owner merges.

**The legacy captures under `docs/guide/screens` are not scanned**: they have no text records. They are pinned instead. `legacy-screens.sha256` lists each of the 94 files with its sha256, and the test holds that list's own sha256 and its count, so a file cannot be added there, removed or changed without editing the test. G1-5 is complete only when PR 7 retires them with the chapters.

**The list is personal data, although it holds no name in clear.** `guide-names.mjs` normalizes a name (NFKD, no accents, lower case, letters and digits only, single spaces), keeps its first four words (a candidate in a text is a run of 2 to 4 words, so a longer name is found by its first four; a one word name is left out, it could never be found), and keeps the first 4 bytes of its sha256. The list is those numbers sorted, written as gaps in LEB128, compressed with deflate and written in base64 after `v1:`. Four bytes do not hide a name from someone who guesses it: whoever holds the list can hash any name they suspect and look it up, and at about 13 000 entries a name that is not in the list matches by chance only about 3 times in a million. So the list answers, for any named person, whether that person is a patient or a member of staff of the clinic. It is handled as personal data: it exists only in the Actions secret and in the owner's own paste below; it is never printed, committed, written to a file, pasted into a conversation or given to an agent; and the check never prints how many names it holds, because its log is public. Measured on 15 000 synthetic names: 55 755 bytes, OVER the 49 152 bytes of one Actions secret; one secret holds about 13 000 names. `encode-guide-names.mjs` refuses a list that does not fit and says how many parts to split it into; `--part k/N` writes one part (by hash range), and the test reads several parts from one variable, separated by spaces.

A 32 bit hash can collide: with N names and U distinct candidate runs in the scanned files, about U x N / 4 294 967 296 runs match by chance. Measured with this PR's captures and the files listed above, U is about 92 600: at 10 000 names that is about 0.22 chance hits, at 13 000 about 0.28, so a first red on wiring may be a collision rather than a name (each later PR adds only its own new runs).

**When the check goes red**, open each file at the line it names:

1. If a real person's name is on the line, replace it with an invented one. In a text record that means fixing `seed-guide.mjs` or the spec and capturing again, never editing the record.
2. If every word on the line is platform copy (`packages/i18n/src/strings.pt.json`) or an invented name of `seed-guide.mjs`, it is a chance match of the hash, and platform copy cannot be renamed. Copy the context hash the check printed beside that line into `guide-names-waived.txt`, with a note naming the file and line and why it is not a name. Once #1481 has merged, that is a GATE-CHANGE of its own: a PR titled `GATE-CHANGE` that carries the waiver file and the regenerated gate manifest and nothing else, which the owner merges; the PR that went red then merges `main` in and goes green. Before #1481 merges, the waiver goes in the PR that went red.

A waiver covers the line's words and the three words after it, which are all the words a candidate starting on that line can hold. Any change to them brings the line back into the check, and a waiver that no longer matches any line of the scanned files fails the check until it is removed.

**What a red check makes public.** The context hash is the sha256 of text that is already public, so it adds nothing to what the line says. The hit itself does disclose something. The Actions log of this public repository is public, and a line named there tells anyone who opens it that a run of 2 to 4 words on that line is in the list. On a real name, that confirms the person is a patient or a member of staff. On a chance match, it gives away one of the list's 4 byte values, against which anyone can test names they suspect. A committed waiver says the same, for good. That is the price of a check that must say where to look. It is kept small in two ways: likely names are taken out of the scanned files before the secret is wired (the three common e2e names, below), and a red check is fixed at once, not left open: a real name is replaced in the PR that went red, and a chance match is waived by the owner's GATE-CHANGE above.

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

**Only if that block stopped with `over the 49152 bytes of one Actions secret; split it with --part 1/2 to --part 2/2`**, paste the two blocks below instead, one after the other, unchanged. The first writes half the list to `GUIDE_FORBIDDEN_NAMES` (replacing whatever is there), the second the other half to `GUIDE_FORBIDDEN_NAMES_2`. Each reads production once more, read only, the same way. The last line should list both secrets.

```sh
(
set -o pipefail
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs || { echo "STOP: not the production target; nothing was read"; exit 1; }
LIST=$(PGOPTIONS='-c default_transaction_read_only=on' psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -f docs/guide/build/guide-names.sql | node docs/guide/build/encode-guide-names.mjs --part 1/2) || { echo "STOP: part 1 of the list was not built (read the line above); the secret is unchanged"; exit 1; }
echo "encoded list, part 1 of 2: ${#LIST} bytes"
printf '%s' "${LIST}" | gh secret set GUIDE_FORBIDDEN_NAMES --repo happygamer1919-tech/OsteoJP
)
```

```sh
(
set -o pipefail
set -o allexport && . /Users/ivan/osteojp-secrets/new-prod.env && set +o allexport
node scripts/assert-production-target.mjs || { echo "STOP: not the production target; nothing was read"; exit 1; }
LIST=$(PGOPTIONS='-c default_transaction_read_only=on' psql "${DATABASE_URL_DIRECT}" -X -q -A -t -v ON_ERROR_STOP=1 -P pager=off -f docs/guide/build/guide-names.sql | node docs/guide/build/encode-guide-names.mjs --part 2/2) || { echo "STOP: part 2 of the list was not built (read the line above); the secret is unchanged"; exit 1; }
echo "encoded list, part 2 of 2: ${#LIST} bytes"
printf '%s' "${LIST}" | gh secret set GUIDE_FORBIDDEN_NAMES_2 --repo happygamer1919-tech/OsteoJP
)
gh secret list --repo happygamer1919-tech/OsteoJP | grep GUIDE_FORBIDDEN_NAMES
```

If a part block stops because that part is still over one secret, or the first block asked for three parts or more, stop there and send the lead the line it printed: the blocks for three parts are written for you, never edited by hand. The CI step of PR 5 passes both secrets in `GUIDE_FORBIDDEN_NAMES`, separated by a space; with only the first secret set, the second is empty and changes nothing.

Wiring it into CI is a GATE-CHANGE (PR 5, the owner merges): the "Lint + typecheck + test" step gets `GUIDE_FORBIDDEN_NAMES` from the secret and `GUIDE_NAMES_REQUIRED: "1"`, and `turbo.json`'s `test` task must list both variables in `env`, because turbo's strict environment mode hides every variable a task does not declare: without that the test sees neither, and passes as "not wired yet".

**Before PR 5 wires the secret, the three common names of the e2e fixtures are renamed.** `apps/web/e2e/fixtures.ts` and `apps/web/e2e/seed/seed-e2e.mjs` create "Maria Silva", "João Pereira" and "Ana Costa", and the e2e specs and helpers name them. Common names are the likeliest to be in the list, and both files are scanned: with the secret wired, a hit there would publish in the log that someone of that name is a patient or a member of staff. They become invented names in the style of the guide's ("Marta Exemplo"). The rename is its own card and its own PR, gated by the e2e suite, and PR 5 does not merge before it.
