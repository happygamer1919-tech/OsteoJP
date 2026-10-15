/**
 * OBS-07 - a one-time link code never leaves this process inside a Sentry event.
 *
 * ==========================================================================
 * WHAT THIS IS FOR
 * ==========================================================================
 * Three public pages are reached by a secret in the path: `/c/<code>` (the 24h
 * confirm link), `/s/<code>` (the satisfaction survey) and `/r/<token>` (the
 * email reschedule link, OBS-08). The code or the token IS the credential:
 * whoever holds it can confirm, cancel, ask to reschedule, or answer. An error
 * report or a trace that carries the page's url carries the credential to a
 * third party, and it does so from the one surface built to say nothing.
 *
 * The route stays recognisable. `/c/Ab3xK9Qz?r=generic` leaves as
 * `/c/[code]?r=generic`, and `/r/<token>?a=confirm` as `/r/[token]?a=confirm`,
 * which are also the names Next gives the routes, so an issue still groups by
 * page.
 *
 * ==========================================================================
 * TWO SHAPES, ONE SET OF MARKERS
 * ==========================================================================
 * A code is the eight character shape below. A reschedule token is the shape
 * `lib/reminders/link-token.ts` signs: base64url of a JSON payload, a dot, and
 * the base64url of its HMAC-SHA256, which is exactly 43 characters. The payload
 * is held to 32 to 512 characters (a real one is about 160). Everything said
 * below about a code is said of a token too, with `/r/` for the route, `token`
 * for the name and `[token]` for what stands in its place. The dot between the
 * halves may also travel as `%2E`. Every pattern is written once and built for
 * each shape, so the two cannot drift apart.
 *
 * ==========================================================================
 * IT WALKS THE WHOLE EVENT, AND THAT IS DELIBERATE
 * ==========================================================================
 * The url of a request is copied into more fields than anyone remembers: the
 * request url, the transaction name, navigation and fetch breadcrumbs, the
 * referer, span descriptions and span attributes, the request path the Next
 * integration records. A list of fields is a list of the ones somebody thought
 * of, and the SDK adds fields in minor releases. So this has no list: every
 * string and every object key in the value is looked at. The same choice
 * `stripFrameVars` made, for the same reason.
 *
 * ==========================================================================
 * WHAT COUNTS AS A CODE: THE EXACT SHAPE, BEHIND A MARKER THAT NAMES IT
 * ==========================================================================
 * A code is exactly LINK_CODE_LENGTH characters of the base64url alphabet, the
 * shape `lib/reminders/confirm-code.ts` issues, and the character after it is
 * not one of that alphabet. Seven characters, or nine, is not a code and is
 * left alone: `fonts.gstatic.com/s/inter/v12/a.woff2` and `/c/assets/a.js`
 * keep every segment.
 *
 * It is only ever recognised directly behind something that says "what follows
 * is the code". There are four such markers, and nothing else is looked for:
 *
 *   1. the route:  `/c/` or `/s/`, the slash written any of the ways a slash
 *                  travels (`/`, the `\/` of JSON, `%2F`, `%252F`), in any
 *                  mix, anywhere in the string.
 *   2. the name:   `code=`, `code:`, `"code":"`, `code: '`, and the same
 *                  url-encoded. A query string, a logged object. Also under
 *                  the two names the platform gives the same field: `1_code`
 *                  (a server action's field) and `nxtPcode` (how Vercel hands
 *                  a route parameter on: in the query string and in the
 *                  `x-now-route-matches` header).
 *   3. the tree:   `"code","<code>"`, the pair Next writes in the router state
 *                  it sends in a header on every server action and navigation.
 *                  Plain, JSON-escaped, url-encoded, url-encoded twice.
 *   4. the match:  `1=<code>`, a name that is one or two digits and nothing
 *                  else. The other half of `x-now-route-matches`, which reads
 *                  `1=<code>&nxtPcode=<code>`. Plain and url-encoded.
 *
 * And the same two ideas for values that are not text: an object key named
 * `code` whose value is a code, and an array where `"code"` is followed by one.
 *
 * NOTHING IS LEARNED AND CHASED. Remembering each code seen in a url, and then
 * removing that string wherever else it stands in the event, hands the choice
 * of what gets rewritten to whoever typed the path: eight characters that also
 * open the event's trace id, or a word like `clientes`, and identifiers and
 * prose are rewritten. A marker cannot be aimed like that: it only ever
 * removes what stands directly behind it.
 *
 * WHAT THAT COSTS, SAID PLAINLY. A code that stands bare, with no marker in
 * front of it (`extra: { x: "Ab3xK9Qz" }`, or the sentence "code Ab3xK9Qz"),
 * is not recognised. And an eight character value that is not a link code but
 * sits behind a marker is removed all the same: `"code":"PGRST116"` leaves as
 * `"code":"[code]"`, and a font family of eight letters after `/s/` loses its
 * name. Nothing in the shape tells those apart from a code, and of the two
 * mistakes the second is the one that sends no credential anywhere.
 *
 * ==========================================================================
 * NO REQUEST BODY LEAVES, AND NOTHING HERE TRIES TO READ ONE
 * ==========================================================================
 * All three pages post the secret as a form field, and a form post is
 * multipart/form-data: `name="1_code"`, a blank line, the code. That is one
 * shape of many a body can take, and a rule that recognises shapes is always
 * one shape short. So a body is not read at all. It is removed, whatever its
 * content type, in two independent places:
 *
 *   - AT THE SOURCE, in sentry.server.config.ts: the SDK is told not to record
 *     a request body (`maxIncomingRequestBodySize: "none"`) and not to put one
 *     on an event (`include: { data: false, cookies: false }`). The edge and
 *     the browser SDK record no request body, so there is nothing to switch
 *     off in their configs.
 *   - HERE, for every event, transaction, span and breadcrumb, whatever the
 *     configuration says: inside any `request` object the keys `data` and
 *     `cookies` are deleted, and ANYWHERE in the value a key that names the
 *     cookie header, `x-now-route-matches`, `next-router-state-tree` or a
 *     recorded body is deleted, as a header (`cookie`) and as the span
 *     attribute the SDK makes of one (`http.request.header.cookie.<name>`,
 *     `http.request.body.data`).
 *
 * The route tree header is DELETED and not scrubbed: it says which route the
 * request was for, and the transaction name and `next-url` already say that.
 * Marker 3 stays for the same text standing anywhere else.
 *
 * WHAT THE TEAM LOSES: the body and the cookies of a request, on every route,
 * in Sentry. Nothing in this repository reads either. The cookies are the
 * visitor's session.
 *
 * ==========================================================================
 * LIMITS, EACH ONE KNOWN AND NOT CLOSED HERE
 * ==========================================================================
 *   - ALL THREE PAGES MUST KEEP POSTING FormData. A server action called with
 *     a plain argument, `action(code)` or `action.bind(null, code)`, posts the
 *     body `["<code>"]`: a bare code. The body is removed in the two places
 *     above, but the same argument also reaches places that are not a body.
 *     link-codes.pages.test.ts reads the three pages and fails on such a call.
 *   - A failed database query. The query layer puts the parameters of a
 *     failed query in the error's message, as `params: <code>`: a bare code,
 *     no marker. If the lookup of a code ever throws, the code is in that
 *     message. Not closed here but in ./query-errors.ts (OBS-09), for every
 *     parameter of every failed query, which is a wider question than these
 *     pages.
 *   - Inside `stacktrace.frames[]` the fields `function`, `context_line`,
 *     `pre_context`, `post_context` and `module` are never read. The SDK puts
 *     source text there, not a url.
 *   - An object reached twice is given the treatment of the place it was
 *     first reached from. One object that is both a stack frame and ordinary
 *     data is read once, as whichever came first.
 *   - Shapes with no marker in them are not recognised: `code <code>` with a
 *     space only, three or more spaces around the `=`, `code|<code>`, a path
 *     written with backslashes only, a bare list `["<code>"]`.
 *   - Marker 4 takes any eight characters behind a name of one or two
 *     digits: `a=1&2=settings` loses the word.
 *   - A token's dot is matched plain and url-encoded up to four times
 *     (`%2E` to `%2525252E`); written as any other escape (a JavaScript
 *     unicode escape, an HTML entity) it is not, and the token stays. A token whose
 *     signature half is followed by another dot and more text (the first two
 *     thirds of a JWT, say) loses the part that has the token's shape.
 *
 * ==========================================================================
 * EVERY PATTERN IS LINEAR, AND A LONG STRING IS CUT
 * ==========================================================================
 * The text this reads is whatever a stranger put in a url, so the cost of
 * reading it must not be theirs to choose. No pattern here has `*`, `+` or an
 * open `{n,}`: every repetition is bounded by a small constant, so the work
 * at each position of the string is bounded and the whole is linear. The test
 * file reads the pattern sources and fails on an unbounded quantifier.
 *
 * And a second bound that does not depend on anybody reasoning correctly about
 * a pattern: of a string longer than MAX_TEXT_LENGTH only the first
 * MAX_TEXT_LENGTH characters and the length of one match more are read, and
 * what comes back is cut to fit within MAX_TEXT_LENGTH and says so at its
 * end. Nothing Sentry can use is that long.
 *
 * ==========================================================================
 * A STACK FRAME IS SOURCE CODE, NOT A REQUEST
 * ==========================================================================
 * Sentry matches a frame to its source map by `filename` and `abs_path`, and a
 * debug image by `code_file`. A scrubber that rewrites one of those turns a
 * readable stack into a minified one, silently. So this is structural and not
 * a matter of the patterns happening to miss: inside `stacktrace.frames[]`
 * only `vars` is walked, and inside `debug_meta.images[]` nothing is.
 *
 * ONE EXCEPTION, AND IT IS NOT A SOURCE FILE. A frame of an inline script is
 * named after the PAGE it sits in, so on these three pages `filename` is the
 * address with the secret in it. A `filename` or `abs_path` that is, as a
 * whole, the address of one of the three pages is rewritten. No chunk and no source
 * file has that shape, so no source map is ever matched by it.
 *
 * ==========================================================================
 * IT NEVER THROWS, AND IT NEVER DROPS
 * ==========================================================================
 * A hook that throws loses the event (`beforeSend`) or the breadcrumb, and a
 * hook that returns nothing drops it. So `scrubLinkCodesIn` is total:
 *
 *   - a getter is never called, and is not carried over either: the SDK
 *     would call it when it serialises the event, after this has run. An
 *     accessor property leaves as a fixed string;
 *   - a value that cannot be read at all (a revoked Proxy, a Proxy whose traps
 *     throw) becomes a fixed string, since what cannot be read cannot be shown
 *     to be clean;
 *   - an object deeper than MAX_DEPTH, or past MAX_NODES values, becomes a
 *     fixed string for the same reason, and an array is not walked past
 *     MAX_NODES either: `new Array(1e9)` has a length and no contents;
 *   - and if anything else goes wrong, the value leaves REDUCED: its own
 *     top-level numbers, booleans and scrubbed strings, and nothing nested.
 *     One console line with no payload, once, and a counter.
 *
 * It copies, it does not mutate. A console breadcrumb holds the very objects
 * the application logged, before they are printed; rewriting those in place
 * would change application state from inside an error reporter.
 *
 * No lookbehind in any pattern here. This file is bundled for browsers, and a
 * pattern an older Safari cannot parse would take the whole client
 * instrumentation down at load.
 */

/** What stands where a code stood. Also Next's own name for the segment. */
export const LINK_CODE_PLACEHOLDER = "[code]";
/** What stands where a reschedule token stood. Next's name for that segment. */
export const LINK_TOKEN_PLACEHOLDER = "[token]";

/**
 * The length of a real code. A literal and not an import, because
 * `lib/reminders/confirm-code.ts` imports `node:crypto` and this file ships to
 * the browser. link-codes.test.ts pins it to CONFIRM_CODE_LENGTH and
 * SURVEY_CODE_LENGTH, so the two cannot drift apart unnoticed.
 */
export const LINK_CODE_LENGTH = 8;

/**
 * The reschedule token's two halves. The signature is an HMAC-SHA256 in
 * base64url with no padding: 32 bytes, 43 characters. The payload's bounds are
 * wide on purpose; link-codes.test.ts signs real tokens with
 * `lib/reminders/link-token.ts` and fails if one falls outside them.
 */
export const LINK_TOKEN_SIGNATURE_LENGTH = 43;
export const LINK_TOKEN_PAYLOAD_MIN = 32;
export const LINK_TOKEN_PAYLOAD_MAX = 512;

/** A string longer than this is read only to about this length, and cut to fit within it. */
export const MAX_TEXT_LENGTH = 65_536;
export const TEXT_CUT_MARK = "[cut: longer than the link-code scrub reads]";

/** What stands where a value stood that the walk could not show to be clean. */
export const UNREADABLE_MARK = "[unreadable: removed by the link-code scrub]";
export const TOO_DEEP_MARK = "[too deep: removed by the link-code scrub]";
export const TOO_MANY_MARK = "[too many values: removed by the link-code scrub]";
/** What stands where an accessor property stood. Its getter is never called. */
export const ACCESSOR_MARK = "[accessor: removed by the link-code scrub]";

// The pieces every pattern is built from. `\x2B` is the plus sign: written
// that way so that no `+` appears in any source, and the test that looks for
// an unbounded quantifier can look for the bare character.
const ALPHABET = "A-Za-z0-9_-";
/** The secret ends here: the next character cannot continue one. */
const CODE_END = `(?![${ALPHABET}])`;
/** A percent sign, itself url-encoded up to three more times. */
const PERCENT = "%(?:25){0,3}";
const SLASH = `(?:\\\\{0,3}/|${PERCENT}2[Ff])`;
const QUOTE = `(?:\\\\{0,3}["']|${PERCENT}2[27])`;
const GAP = `(?:[\\s\\x2B]|${PERCENT}20){0,2}`;
/** `code` is a whole name: `barcode` and `postal_code` are other things. */
const NAME_START = `(?:^|[^${ALPHABET}]|${PERCENT}[0-9A-Fa-f]{2})`;
/**
 * `1_code` is how Next names the field `code` in a server action's body.
 * `nxtPcode` is how Vercel names the route parameter `code` when it hands the
 * match on (`nxtI` for an intercepted route): next/dist/lib/constants.js.
 */
const NAME_PREFIX = "(?:nxt[PI])?(?:[0-9]{1,3}_)?";
const EQUALS = `(?:=|${PERCENT}3[Dd])`;
/** The dot between a token's two halves, plain or url-encoded. */
const DOT = `(?:\\.|${PERCENT}2[Ee])`;

/**
 * One kind of secret: what it looks like, the route letters that put it in a
 * path, the name it is given as a field, and what stands in its place.
 */
type Secret = {
  shape: string;
  route: string;
  name: string;
  placeholder: string;
  encoded: string;
};

const CODE_SECRET: Secret = {
  shape: `[${ALPHABET}]{${LINK_CODE_LENGTH}}`,
  route: "[cCsS]",
  name: "[cC][oO][dD][eE]",
  placeholder: LINK_CODE_PLACEHOLDER,
  encoded: "%5Bcode%5D",
};

const TOKEN_SECRET: Secret = {
  shape: `[${ALPHABET}]{${LINK_TOKEN_PAYLOAD_MIN},${LINK_TOKEN_PAYLOAD_MAX}}${DOT}[${ALPHABET}]{${LINK_TOKEN_SIGNATURE_LENGTH}}`,
  route: "[rR]",
  name: "[tT][oO][kK][eE][nN]",
  placeholder: LINK_TOKEN_PLACEHOLDER,
  encoded: "%5Btoken%5D",
};

/**
 * The four markers for one kind of secret.
 *
 * Marker 1, the route. Group 1 is the route as written, group 2 the secret.
 * Either case of the letter: `/C/<code>` is a 404, and the 404 still carries
 * the code. One slash or two after the letter: `/c//<code>` is the same page
 * to whoever typed it.
 *
 * Marker 2, the name. Group 1 is everything up to the secret, group 2 the
 * secret.
 *
 * Marker 3, the tree. A comma, so both quotes are required: "the code,
 * password" is a sentence and `"code","Ab3xK9Qz"` is the router's state.
 *
 * Marker 4, the match. `1=<code>`: what Vercel writes in `x-now-route-matches`
 * beside `nxtPcode=<code>`, which marker 2 takes. The name is the digits and
 * nothing else: `v1=` and `123=` are other names.
 */
function markersFor(secret: Secret): RegExp[] {
  const name = `${NAME_PREFIX}${secret.name}`;
  const value = `(${secret.shape})${CODE_END}`;
  return [
    new RegExp(`(${SLASH}${secret.route}${SLASH}{1,2})${value}`, "g"),
    new RegExp(`(${NAME_START}${name}${QUOTE}?${GAP}(?:[=:]|${PERCENT}3[AaDd])${GAP}${QUOTE}?)${value}`, "g"),
    new RegExp(`(${NAME_START}${name}${QUOTE}${GAP}(?:,|${PERCENT}2[Cc])${GAP}${QUOTE})${value}`, "g"),
    new RegExp(`(${NAME_START}[0-9]{1,2}${EQUALS})${value}`, "g"),
  ];
}

const CODE_MARKERS = markersFor(CODE_SECRET);
const TOKEN_MARKERS = markersFor(TOKEN_SECRET);

/** Every pattern a hostile string is run through. The test reads the sources. */
export const LINK_CODE_PATTERNS: readonly RegExp[] = [...CODE_MARKERS, ...TOKEN_MARKERS];

/**
 * The longest stretch of text one match can cover, rounded up. Used only where
 * a long string is cut: see `cutTo`. The longest marker in front of a secret is
 * under 90 characters, and the longest token is 512, a dot of up to 9 and 43.
 */
const LONGEST_MATCH = 700;

const EXACT_CODE = new RegExp(`^${CODE_SECRET.shape}$`);
const NAME_ONLY = new RegExp(`^${NAME_PREFIX}${CODE_SECRET.name}$`);
const EXACT_TOKEN = new RegExp(`^${TOKEN_SECRET.shape}$`);
const TOKEN_NAME_ONLY = new RegExp(`^${NAME_PREFIX}${TOKEN_SECRET.name}$`);

/**
 * Function replacers throughout, never a replacement STRING: in a replacement
 * string `$1` and `$&` are instructions, and the text being rewritten is
 * whatever a stranger put in a url.
 *
 * The placeholder is written the way the marker in front of it was: when that
 * ends in a percent escape (`%2F`, `%22`, `%3D`) the last character is a hex
 * digit, and the placeholder is encoded too.
 */
function placeholderFor(secret: Secret): (match: string, before: string) => string {
  return (_match, before) => {
    const last = before.charCodeAt(before.length - 1);
    const hex = (last >= 48 && last <= 57) || (last >= 65 && last <= 70) || (last >= 97 && last <= 102);
    return before + (hex ? secret.encoded : secret.placeholder);
  };
}

const CODE_REPLACER = placeholderFor(CODE_SECRET);
const TOKEN_REPLACER = placeholderFor(TOKEN_SECRET);

/** The four markers for each secret, with no bound on the length. Exported for the timing test. */
export function scrubLinkCodesUnbounded(text: string): string {
  // The shortest thing that can match is `1=` and a code.
  if (text.length < LINK_CODE_LENGTH + 2) return text;
  let out = text;
  for (const pattern of TOKEN_MARKERS) out = out.replace(pattern, TOKEN_REPLACER);
  for (const pattern of CODE_MARKERS) out = out.replace(pattern, CODE_REPLACER);
  return out;
}

/** Can this character stand inside a match, after the first character of one? */
function inAMatch(ch: number): boolean {
  return (
    (ch >= 48 && ch <= 57) || // 0-9
    (ch >= 65 && ch <= 90) || // A-Z
    (ch >= 97 && ch <= 122) || // a-z
    ch === 95 || // _
    ch === 45 || // -
    ch === 47 || // /
    ch === 92 || // \
    ch === 37 || // %
    ch === 34 || // "
    ch === 39 || // '
    ch === 61 || // =
    ch === 58 || // :
    ch === 44 || // ,
    ch === 46 || // . between a token's two halves
    ch === 43 || // plus
    ch <= 32 // space and the control characters \s covers
  );
}

/**
 * Drop the run of characters at the end of `text[0, limit)` that could belong
 * to a match, up to the longest a match can be, and cut there.
 */
function cutTo(text: string, limit: number): string {
  let end = Math.min(limit, text.length);
  const floor = end - LONGEST_MATCH;
  while (end > floor && inAMatch(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(0, end);
}

/**
 * One string, the four markers for each secret. Pure, and idempotent: a string
 * already scrubbed comes back unchanged.
 *
 * A LONG STRING IS READ A LITTLE PAST THE CUT, AND CUT AFTER IT IS READ. A cut
 * made first could fall inside a secret and leave most of it standing, no
 * longer a match: `/c/Ab3xK9Q`, or a token short of one character of its
 * signature. So the first room-plus-one-match characters are scrubbed, and
 * every secret that lies across the cut is read whole and replaced. What can
 * be left is a secret that lies across the end of what was read; the run of
 * characters at that end that could be part of a match goes, which removes it
 * all, since it is shorter than the run that is dropped. Only then is the
 * result cut to the room, the same way, and everything left of the cut has
 * been read.
 */
export function scrubLinkCodes(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return scrubLinkCodesUnbounded(text);
  // Room for the mark, so that what comes back is within the limit and is read
  // whole the next time: a breadcrumb passes here twice, once on its own and
  // once inside its event.
  const room = MAX_TEXT_LENGTH - TEXT_CUT_MARK.length;
  const head = text.slice(0, room + LONGEST_MATCH);
  let out = scrubLinkCodesUnbounded(head);
  if (head.length < text.length) out = cutTo(out, out.length);
  // An encoded placeholder is two characters longer than the code it replaced
  // (a token's is shorter than the token), so the result can still be too long.
  if (out.length > room) out = cutTo(out, room);
  return out + TEXT_CUT_MARK;
}

/**
 * A frame's `filename` or `abs_path` that is, whole, the address of one of the
 * three pages: nothing or an origin, then `/c/<code>`, `/s/<code>` or
 * `/r/<token>`, then the end, a query or a fragment (a trailing slash allowed). A file under a
 * directory of that name has more path after it and is not this. Anchored at
 * the start, every repetition bounded.
 */
const PAGE_ADDRESS = new RegExp(
  `^(?:[A-Za-z][A-Za-z0-9.\\x2B-]{0,15}://[^/?#\\s]{1,255})?/(?:[cCsS]/${CODE_SECRET.shape}|[rR]/${TOKEN_SECRET.shape})/?(?:$|[?#])`,
);

/** Deep enough for any event the SDK builds; a bound, so a strange value ends. */
export const MAX_DEPTH = 24;
/** More values than an event Sentry would accept can hold. */
export const MAX_NODES = 250_000;

/**
 * Where in an event the walk is standing. `data` is everywhere; the others
 * exist so that a stack frame and a debug image are recognised by WHERE they
 * are (`stacktrace.frames[]`, `debug_meta.images[]`) and not by what they look
 * like, and an application object that happens to have a `frames` key is still
 * data.
 */
type Place = "data" | "request" | "stacktrace" | "frames" | "frame" | "debug_meta" | "images" | "image";

function placeOfProperty(parent: Place, key: string): Place {
  if (parent === "stacktrace" && key === "frames") return "frames";
  if (parent === "debug_meta" && key === "images") return "images";
  if (parent === "frame" || parent === "image") return "data";
  if (key === "stacktrace") return "stacktrace";
  if (key === "debug_meta") return "debug_meta";
  if (key === "request") return "request";
  return "data";
}

/** The request headers that never leave, by the name they travel under. */
const DROPPED_HEADERS: ReadonlySet<string> = new Set(["cookie", "x-now-route-matches", "next-router-state-tree"]);
/** How the SDK names a request header when it makes a span attribute of it. */
const HEADER_ATTRIBUTE = "http.request.header.";
/** And a recorded body: `http.request.body.data`. */
const BODY_ATTRIBUTE = "http.request.body";

/**
 * Is this a key whose value never leaves, whatever the value is?
 *
 * Decided by the NAME and never by the content: a body is not read to see
 * whether it holds a code (see the header). Inside a `request` object, `data`
 * is the body and `cookies` the parsed cookie header. Anywhere, a key that is
 * one of the dropped headers, written as a header (`Cookie`) or as the SDK's
 * span attribute for it (`http.request.header.x_now_route_matches`, and one
 * attribute per cookie: `http.request.header.cookie.<name>`).
 */
function neverLeaves(place: Place, key: string): boolean {
  if (place === "request" && (key === "data" || key === "cookies")) return true;
  // No header and no attribute this looks for is longer; a long key is data.
  if (key.length > 256) return false;
  const lower = key.toLowerCase();
  if (lower.startsWith(BODY_ATTRIBUTE)) return true;
  const attribute = lower.startsWith(HEADER_ATTRIBUTE);
  const header = (attribute ? lower.slice(HEADER_ATTRIBUTE.length) : lower).split("_").join("-");
  return DROPPED_HEADERS.has(header) || (attribute && header.startsWith("cookie."));
}

function placeOfItem(parent: Place): Place {
  if (parent === "frames") return "frame";
  if (parent === "images") return "image";
  return "data";
}

type Walk = {
  /** What each object became, so one reached twice is scrubbed once and a cycle ends. */
  done: WeakMap<object, unknown>;
  /** How many strings, keys or values were replaced. Zero means: hand back the original. */
  changes: number;
  nodes: number;
};

function replaced(walk: Walk, mark: string): string {
  walk.changes += 1;
  return mark;
}

function scrubString(text: string, walk: Walk): string {
  const out = scrubLinkCodes(text);
  if (out !== text) walk.changes += 1;
  return out;
}

function isPlain(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * A class instance is not data this module owns, and most of them (a Scope, a
 * Span) the SDK needs back exactly as they were. Three kinds are text in an
 * object's clothes and are read as text: a URL, its search parameters, and a
 * String object. An Error is read by its three strings. Every other instance
 * is passed through by reference and never entered; the SDK turns those into
 * plain data before `beforeSend` and `beforeSendTransaction` see the event,
 * which is where they are read.
 */
function rewriteInstance(value: object, walk: Walk): unknown {
  const tag = Object.prototype.toString.call(value);
  if (tag === "[object URL]" || tag === "[object URLSearchParams]" || tag === "[object String]") {
    const text = String(value);
    const out = scrubLinkCodes(text);
    return out === text ? value : replaced(walk, out);
  }
  if (value instanceof Error) {
    const name = String(value.name);
    const message = String(value.message);
    const stack = typeof value.stack === "string" ? value.stack : undefined;
    const cleanMessage = scrubLinkCodes(message);
    const cleanStack = stack === undefined ? undefined : scrubLinkCodes(stack);
    if (cleanMessage === message && cleanStack === stack) return value;
    walk.changes += 1;
    return { name, message: cleanMessage, stack: cleanStack };
  }
  return value;
}

function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  // Assigning to `__proto__` sets the prototype and stores nothing. A key of
  // that name arrives from JSON.parse as an ordinary own property, and leaves
  // as one.
  if (key === "__proto__") {
    Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    target[key] = value;
  }
}

/**
 * Copy-on-write walk over arrays and plain objects.
 *
 * The body runs inside a try: whatever cannot be read (a revoked Proxy throws
 * on the first question asked of it) becomes UNREADABLE_MARK, and the rest of
 * the event is walked as usual.
 */
function rewrite(value: unknown, walk: Walk, depth: number, place: Place): unknown {
  walk.nodes += 1;
  if (typeof value === "string") {
    return walk.nodes > MAX_NODES ? replaced(walk, TOO_MANY_MARK) : scrubString(value, walk);
  }
  if (value === null || typeof value !== "object") return value;
  if (walk.nodes > MAX_NODES) return replaced(walk, TOO_MANY_MARK);
  if (depth > MAX_DEPTH) return replaced(walk, TOO_DEEP_MARK);

  try {
    const known = walk.done.get(value);
    if (known !== undefined) return known;

    // A debug image is matched to its source map by `code_file`. Not entered.
    if (place === "image") return value;

    if (Array.isArray(value)) {
      const copy: unknown[] = [];
      walk.done.set(value, copy);
      let changed = false;
      const itemPlace = placeOfItem(place);
      for (let i = 0; i < value.length; i += 1) {
        if (walk.nodes > MAX_NODES) {
          // The walk ends HERE, with one mark for all that was left. A length
          // is not a number of contents: `new Array(1e9)` would otherwise be
          // gone through slot by slot, each one an empty read.
          copy.push(replaced(walk, TOO_MANY_MARK));
          changed = true;
          break;
        }
        const item: unknown = value[i];
        let next: unknown;
        if (i > 0 && typeof item === "string" && value[i - 1] === "code" && EXACT_CODE.test(item)) {
          // The router's state as a real array: ["code", "<code>", "d"].
          next = replaced(walk, LINK_CODE_PLACEHOLDER);
        } else if (i > 0 && typeof item === "string" && value[i - 1] === "token" && EXACT_TOKEN.test(item)) {
          // The same for the reschedule page: ["token", "<token>", "d"].
          next = replaced(walk, LINK_TOKEN_PLACEHOLDER);
        } else {
          next = rewrite(item, walk, depth + 1, itemPlace);
        }
        if (next !== item) changed = true;
        copy.push(next);
      }
      if (!changed) walk.done.set(value, value);
      return changed ? copy : value;
    }

    if (!isPlain(value)) {
      const out = rewriteInstance(value, walk);
      walk.done.set(value, out);
      return out;
    }

    const copy = Object.create(Object.getPrototypeOf(value) as object | null) as Record<string, unknown>;
    walk.done.set(value, copy);
    let changed = false;
    for (const key of Object.keys(value)) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (property === undefined) continue;
      if (place !== "frame" && neverLeaves(place, key)) {
        // A body, a cookie, a header that carries the route's parameters.
        // Left out of the copy, unread: see the header.
        walk.changes += 1;
        changed = true;
        continue;
      }
      if (!("value" in property)) {
        // An accessor. Calling it would run the application's code from inside
        // an error reporter, and it may throw. Carrying it over uncalled would
        // only move the call: the SDK reads every property when it serialises
        // the event, after this has run. A fixed string stands in its place.
        setOwn(copy, place === "frame" ? key : scrubLinkCodes(key), replaced(walk, ACCESSOR_MARK));
        changed = true;
        continue;
      }
      const item: unknown = property.value;

      if (place === "frame") {
        // Source code, not a request: see the header. Only `vars` is data.
        let kept: unknown = item;
        if (key === "vars") {
          kept = rewrite(item, walk, depth + 1, "data");
        } else if ((key === "filename" || key === "abs_path") && typeof item === "string" && PAGE_ADDRESS.test(item)) {
          kept = scrubString(item, walk);
        }
        if (kept !== item) changed = true;
        setOwn(copy, key, kept);
        continue;
      }

      const cleanKey = scrubLinkCodes(key);
      let next: unknown;
      if (typeof item === "string" && NAME_ONLY.test(key) && EXACT_CODE.test(item)) {
        // A form field, a route parameter, a logged object: { code: "<code>" }.
        next = replaced(walk, LINK_CODE_PLACEHOLDER);
      } else if (typeof item === "string" && TOKEN_NAME_ONLY.test(key) && EXACT_TOKEN.test(item)) {
        // The same for the reschedule page: { token: "<token>" }.
        next = replaced(walk, LINK_TOKEN_PLACEHOLDER);
      } else {
        next = rewrite(item, walk, depth + 1, placeOfProperty(place, key));
      }
      if (cleanKey !== key) {
        walk.changes += 1;
        changed = true;
      }
      if (next !== item) changed = true;
      setOwn(copy, cleanKey, next);
    }
    if (!changed) walk.done.set(value, value);
    return changed ? copy : value;
  } catch {
    const mark = replaced(walk, UNREADABLE_MARK);
    try {
      walk.done.set(value, mark);
    } catch {
      // Not even usable as a key. The mark is returned all the same.
    }
    return mark;
  }
}

function walkAndScrub<T>(value: T): T {
  const walk: Walk = { done: new WeakMap(), changes: 0, nodes: 0 };
  const out = rewrite(value, walk, 0, "data");
  // Nothing replaced anywhere: the very same object, cycles included.
  if (walk.changes === 0) return value;
  // An event that could not be read at all leaves as an empty one, not as a
  // string where the SDK expects an object.
  if (typeof out === "string" && typeof value !== "string") return {} as T;
  return out as T;
}

let failures = 0;

/** How many times the walk failed and a value left reduced. Zero is the only good number. */
export function linkCodeScrubFailures(): number {
  return failures;
}

/**
 * What leaves when the walk itself failed: the value's own top-level numbers,
 * booleans and scrubbed strings. Nothing nested, because nested is exactly
 * what could not be walked, and an unwalked url is a code on its way out.
 * `event_id`, `type`, `level`, `timestamp`, `transaction`, `span_id`,
 * `trace_id`, `category` and `message` are all top-level and all survive, so
 * the event still arrives and still says which one it was.
 */
function reduced(value: unknown): unknown {
  if (typeof value === "string") return UNREADABLE_MARK;
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  try {
    for (const key of Object.keys(value)) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (property === undefined || !("value" in property)) continue;
      if (neverLeaves("data", key)) continue;
      const item: unknown = property.value;
      if (typeof item === "string") {
        let text = UNREADABLE_MARK;
        try {
          text = scrubLinkCodes(item);
        } catch {
          // The mark stands.
        }
        setOwn(out, key, text);
      } else if (typeof item === "number" || typeof item === "boolean") {
        setOwn(out, key, item);
      }
    }
  } catch {
    return {};
  }
  return out;
}

/**
 * Run a walk so that the caller always gets a value back. Exported so the test
 * can hand it a walk that throws; `scrubLinkCodesIn` is the only caller.
 */
export function neverThrows<T>(value: T, walk: (value: T) => T): T {
  try {
    return walk(value);
  } catch {
    failures += 1;
    if (failures === 1) {
      // Once, and with nothing of the event in it. Counted before it is said:
      // this line becomes a console breadcrumb and comes back through here.
      console.warn("[link-codes] the scrub failed on a value and sent it reduced");
    }
    return reduced(value) as T;
  }
}

/**
 * The function every Sentry hook calls: an event, a transaction, a span or a
 * breadcrumb goes in, and the same shape comes out with no code in it.
 *
 * A value with nothing to remove comes back as the very same object.
 *
 * ONE ARGUMENT, and it must stay one. The SDK calls its hooks with a second
 * argument (the hint); the configs wrap this in an arrow so the hint can never
 * arrive here as something else.
 */
export function scrubLinkCodesIn<T>(value: T): T {
  return neverThrows(value, walkAndScrub);
}
