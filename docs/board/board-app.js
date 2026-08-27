/* board-app.js - client runtime for the board portal artifacts.
   Inlined verbatim into the rendered HTML by render-board.mjs. Self-contained,
   zero external requests. Seeds from the #board-data island (the committed
   JSON), holds edits in localStorage, and mirrors docs/board/validate-board.mjs
   so Export tells you whether a paste-back would pass the repo validator.
   The repo JSON stays the source of truth; this never writes back to it.

   ONE APP, TWO BOARDS. Everything that differs between the pre-launch board and
   the portal board (people set, display labels, brandmark, paths, terminal
   defaults) arrives in the #board-config island, derived in Node by
   docs/board/board-config.mjs. This file holds no per-board literal except the
   single documented fallback below.

   THE ONE STRUCTURAL IDEA (owner CR): a card's LANE IS DERIVED, never stored by
   hand. You change what is TRUE about a card - its status, who it waits on -
   and the board puts it where that truth belongs. Marking something done moves
   it to Shipped; dragging it to Shipped marks it done (and asks for the
   evidence the repo validator will demand). The two can no longer disagree.

     lane(card) =
       status shipped                                      -> shipped
       home in_flight AND status blocked AND blocked on a person
                                                           -> blocked_on_people
       otherwise                                           -> home lane

   `home_lane` is the card's KIND (work item / incident / Rodica inbox / loose
   end) and is the only lane fact a human sets. Incidents and inbox items keep
   their kind while blocked - they are categories, not states. */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- data -- */
  var SEED = JSON.parse(document.getElementById("board-data").textContent);

  /* -------------------------------------------------------------- config -- */
  /**
   * THE ONLY per-board literal in this file, and the only place the strings
   * "ivan", "rodica", "Pre-Launch" or "prelaunch-board.json" are allowed to
   * appear. It is the fallback for a page rendered without a #board-config
   * island (an older renderer, or a hand-saved copy), and it holds the
   * pre-launch board's values because that is the board this app shipped for.
   * Kept in lock-step with docs/board/board-config.mjs, which is where the real
   * configuration lives and where a new board is added.
   */
  var FALLBACK_CONFIG = {
    boardName: "OsteoJP - Pre-Launch Board",
    owner: "ivan",
    people: ["ivan", "jp", "rodica"],
    whoOrder: [null, "ivan", "jp", "rodica", "infra"],
    whoLabels: { ivan: "Ivan", jp: "JP", rodica: "Rodica", infra: "Infra" },
    laneLabels: {
      blocked_on_people: "Blocked on people", in_flight: "In flight",
      rodica_batch: "Rodica inbox", incidents: "Incidents",
      loose_ends: "Loose ends", shipped: "Shipped",
    },
    laneHints: {
      blocked_on_people: "someone owes an answer", in_flight: "being executed now",
      rodica_batch: "fresh reports land here", incidents: "live problems",
      loose_ends: "tracked, not batched", shipped: "done, with proof",
    },
    kindLabels: {
      in_flight: "Work item", rodica_batch: "Rodica inbox",
      incidents: "Incident", loose_ends: "Loose end",
    },
    denominator: 9,
    denominatorWord: "Nine",
    brandmark: "OsteoJP · Pre-Launch",
    footerLabel: "osteojp · pre-launch portal",
    briefTitle: "Made in the Pre-Launch Portal",
    sourcePath: "docs/board/prelaunch-board.json",
    exportFilename: "prelaunch-board.json",
    validateCommand: "node docs/board/validate-board.mjs",
    ownerTerminalDefault: "green",
    ownerTerminalPlaceholder: "green / cyan / ivan",
    newIdPrefix: "NEW-",
  };

  /**
   * Read once, at boot, and FREEZE.
   *
   * CFG is derived from the published seed and never from `board`. The board key
   * in localStorage persists clone(board) including `lanes`, so a stale snapshot
   * carries its own mutable copy of lanes[blocked_on_people].columns. Reading the
   * people set off `board` would let that stale copy silently redefine PEOPLE,
   * and therefore laneOf(), and therefore the in-browser validate() - which would
   * start disagreeing with validate-board.mjs about the very same file. take-seed,
   * undo, reset and every mutate() leave CFG untouched by construction.
   */
  var CFG = (function () {
    var el = document.getElementById("board-config");
    if (!el) return Object.freeze(FALLBACK_CONFIG);
    try { return Object.freeze(JSON.parse(el.textContent)); } catch (e) { return Object.freeze(FALLBACK_CONFIG); }
  })();
  // PORTAL_GEN is bumped whenever the app's own data handling changes shape. The
  // v1 board stored its snapshot under the un-generationed key, and a browser
  // that had used it would otherwise resurrect that stale copy (16 cards) over
  // a freshly published 31-card seed. Storage is per generation, per schema.
  var PORTAL_GEN = "p2";
  var STORAGE_KEY = "osteojp-board:" + (SEED.board || "board") + ":v" + (SEED.schema_version || 1) + ":" + PORTAL_GEN;
  var UI_KEY = STORAGE_KEY + ":ui";

  var KIND_LANES = ["in_flight", "rodica_batch", "incidents", "loose_ends"];
  var ALL_LANES = ["blocked_on_people", "in_flight", "rodica_batch", "incidents", "loose_ends", "shipped"];
  // Display vocabulary is per board. The lane IDs above are NOT: `rodica_batch`
  // is the id on both boards, and only its label differs ("Rodica inbox" on the
  // pre-launch board, "Stakeholder feedback" on the portal board).
  var LANE_LABEL = CFG.laneLabels;
  var LANE_HINT = CFG.laneHints;
  var KIND_LABEL = CFG.kindLabels;
  var STATUS_ORDER = ["todo", "in_flight", "blocked", "halted", "shipped"];
  var STATUS_LABEL = { todo: "To do", in_flight: "In flight", blocked: "Blocked", halted: "Halted", shipped: "Shipped" };
  var GATE_ORDER = ["green_self_merge", "cyan_clear", "owner_merge", "owner_authorizo", "stakeholder"];
  var GATE_BADGE = {
    green_self_merge: { label: "Self-merge", cls: "selfmerge" },
    cyan_clear: { label: "CYAN", cls: "cyan" },
    owner_merge: { label: "Owner merge", cls: "" },
    owner_authorizo: { label: "AUTORIZO", cls: "autorizo" },
    stakeholder: { label: "Stakeholder", cls: "stakeholder" },
  };
  // The people set is board-relative: ivan/jp/rodica on the pre-launch board,
  // ivan/jp/lawyer on the portal board. WHO_ORDER is `blocked_on`'s full domain.
  // OWNER is the "you" in "Your move" and the "On you" tile.
  var WHO = CFG.whoLabels;
  var WHO_ORDER = CFG.whoOrder;
  var PEOPLE = CFG.people;
  var OWNER = CFG.owner;
  // Focus splits "Your move" from "Waiting on others": everyone who is not you,
  // plus infra. Derived so a board with a different people set splits correctly.
  var OTHERS = PEOPLE.filter(function (p) { return p !== OWNER; }).concat(["infra"]);
  var DENOM = CFG.denominator;
  var EV_KIND = ["pr", "journal", "sha256", "e2e", "screenshot"];
  var PRIO = ["high", "medium", "low"];
  // WF-01: the board card IS the loop spec. These four must stay in lock-step
  // with docs/board/validate-board.mjs - one rule, two independent
  // implementations, the same arrangement deriveLane already has. The reason
  // the browser needs its own copy is Export: a board that leaves this app must
  // already satisfy the rule the CI validator will apply to it.
  var LOOP_SPEC_SECTIONS = [
    "scope_and_ground_truth",
    "ordered_steps",
    "definition_of_done",
    "verification",
    "restrictions_and_scope_boundary",
    "halt_loud_protocol",
    "report_back_format",
  ];
  var LOOP_SPEC_OPTIONAL = ["briefing"];
  var CARD_KIND = ["loop"];
  var LOOP_SPEC_REQUIRED_AT = ["in_flight", "shipped"];
  var SPEC_LABEL = {
    briefing: "Briefing",
    scope_and_ground_truth: "Scope and ground truth",
    ordered_steps: "Ordered steps",
    definition_of_done: "Definition of done",
    verification: "Verification",
    restrictions_and_scope_boundary: "Restrictions and scope boundary",
    halt_loud_protocol: "Halt-loud protocol",
    report_back_format: "Report-back format",
  };
  var PRIO_LABEL = { high: "High", medium: "Medium", low: "Low" };
  // RULINGS ARE A VIEW, NOT A LANE, and that is the whole of the owner's ruling
  // of 2026-08-27: "recorded rulings are not build work and must stop rendering
  // as to-do tasks". A ruling has no status, so it cannot sit in a lane without
  // borrowing one, and every lane on this board means something about work.
  // Giving them their own view is what stops a decision being read as a task.
  //
  // Its key is `6`. The footer's "keys 1-5" hint moves with it.
  var VIEWS = [
    { id: "focus", label: "Focus" },
    { id: "board", label: "Board" },
    { id: "gate", label: "Launch gate" },
    { id: "list", label: "List" },
    { id: "timeline", label: "Timeline" },
    { id: "rulings", label: "Rulings" },
  ];
  var ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

  var board;
  var ui = {
    view: "focus",
    q: "",
    fStatus: [],
    fWho: [],
    fPrio: [],
    sort: { key: "checkpoint", dir: -1 },
    openGateNotes: {},
    openRulingNotes: {},
    shippedOpen: false,
  };
  var undoStack = [];
  var seedNoticeDismissed = false;
  var drawerId = null;
  var modal = null;
  var dragId = null;

  /* --------------------------------------------------------------- utils -- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function dateOnly(v) { var m = typeof v === "string" && v.match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : ""; }
  function isIso(v) { return typeof v === "string" && ISO_RE.test(v) && !isNaN(Date.parse(v)); }
  function daysSince(iso) {
    if (!iso) return 0;
    var d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T00:00:00Z" : iso);
    if (isNaN(d.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  }
  function relDay(iso) {
    var d = daysSince(iso);
    return d === 0 ? "today" : d === 1 ? "yesterday" : d + " days ago";
  }
  function byId(id) { return (board.cards || []).filter(function (c) { return c.id === id; })[0]; }
  function gateById(id) { return ((board.launch_gate || {}).conditions || []).filter(function (g) { return g.id === id; })[0]; }

  /* --------------------------------------------- lane derivation (the rule) */
  function homeOf(c) {
    if (KIND_LANES.indexOf(c.home_lane) >= 0) return c.home_lane;
    if (KIND_LANES.indexOf(c.lane) >= 0) return c.lane;
    return "in_flight"; // shipped / blocked_on_people are STATES, never homes
  }
  function laneOf(c) {
    if (c.status === "shipped") return "shipped";
    var home = homeOf(c);
    if (home === "in_flight" && c.status === "blocked" && PEOPLE.indexOf(c.blocked_on) >= 0) {
      return "blocked_on_people";
    }
    return home;
  }
  function normalize(b) {
    (b.cards || []).forEach(function (c) {
      if (!c.priority) c.priority = "medium";
      c.home_lane = homeOf(c);
      c.lane = laneOf(c); // keep the stored lane honest at all times
    });
    return b;
  }
  function syncDerived() {
    (board.cards || []).forEach(function (c) { c.lane = laneOf(c); });
    var lg = board.launch_gate;
    if (lg) lg.readiness_passed = (lg.conditions || []).filter(function (g) { return g.state === "pass"; }).length;
  }

  /* ------------------------------------------------------------- storage -- */
  // PL-28: the fingerprint of the publish THIS browser's snapshot was taken
  // from. Kept beside the board rather than inside it, so it never leaks into an
  // Export or a diff - it describes the snapshot's provenance, not its content.
  var basedOnFingerprint = null;

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (raw) {
      try {
        var stored = JSON.parse(raw);
        // A snapshot written before PL-28 has no provenance. Treat it as stale
        // rather than current: it is the only safe default, and it is exactly
        // the case that stranded the owner on the intake board.
        basedOnFingerprint = stored.__basedOn || null;
        delete stored.__basedOn;
        return normalize(stored);
      } catch (e) {}
    }
    basedOnFingerprint = SEED.fingerprint || null;
    return normalize(clone(SEED));
  }

  /** Persist the board plus the provenance of the publish it came from. */
  function writeSnapshot() {
    try {
      var payload = clone(board);
      payload.__basedOn = basedOnFingerprint;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }
  function loadUi() {
    try {
      var raw = localStorage.getItem(UI_KEY);
      if (raw) { var u = JSON.parse(raw); Object.keys(u).forEach(function (k) { ui[k] = u[k]; }); }
    } catch (e) {}
  }
  function persistUi() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({
        view: ui.view, fStatus: ui.fStatus, fWho: ui.fWho, fPrio: ui.fPrio, sort: ui.sort,
        shippedOpen: ui.shippedOpen,
      }));
    } catch (e) {}
  }
  function commit(label) {
    syncDerived();
    writeSnapshot();
    render();
    if (label) toast(label, true);
  }
  function mutate(label, fn) {
    undoStack.push({ label: label, snap: clone(board) });
    if (undoStack.length > 30) undoStack.shift();
    fn();
    commit(label);
  }
  function undo() {
    var prev = undoStack.pop();
    if (!prev) { toast("Nothing to undo", false); return; }
    board = normalize(prev.snap);
    writeSnapshot();
    render();
    toast("Undid: " + prev.label, false);
  }

  /* --------------------------------------------------------- diff vs seed -- */
  function diffVsSeed() {
    var seedCards = {}, out = { added: [], removed: [], changed: [], gates: [] };
    (SEED.cards || []).forEach(function (c) { seedCards[c.id] = c; });
    var liveIds = {};
    (board.cards || []).forEach(function (c) {
      liveIds[c.id] = 1;
      var s = seedCards[c.id];
      if (!s) { out.added.push(c.id); return; }
      var fields = ["title", "status", "home_lane", "gate", "blocked_on", "priority", "notes", "owner_terminal", "last_checkpoint"];
      var diffs = fields.filter(function (f) {
        var a = f === "home_lane" ? homeOf(s) : f === "priority" ? (s[f] || "medium") : s[f];
        var b = c[f];
        return JSON.stringify(a == null ? null : a) !== JSON.stringify(b == null ? null : b);
      });
      if (JSON.stringify(s.evidence || null) !== JSON.stringify(c.evidence || null)) diffs.push("evidence");
      if (diffs.length) out.changed.push({ id: c.id, fields: diffs, from: s, to: c });
    });
    (SEED.cards || []).forEach(function (c) { if (!liveIds[c.id]) out.removed.push(c.id); });
    var seedGates = {};
    ((SEED.launch_gate || {}).conditions || []).forEach(function (g) { seedGates[g.id] = g; });
    ((board.launch_gate || {}).conditions || []).forEach(function (g) {
      var s = seedGates[g.id];
      if (!s) return;
      if (s.state !== g.state || JSON.stringify(s.evidence || null) !== JSON.stringify(g.evidence || null) || s.notes !== g.notes) {
        out.gates.push({ id: g.id, from: s.state, to: g.state });
      }
    });
    out.total = out.added.length + out.removed.length + out.changed.length + out.gates.length;
    return out;
  }

  /* -------------------------------------------------------------- filters -- */
  function matches(c) {
    if (ui.fStatus.length && ui.fStatus.indexOf(c.status) < 0) return false;
    if (ui.fWho.length && ui.fWho.indexOf(c.blocked_on || "none") < 0) return false;
    if (ui.fPrio.length && ui.fPrio.indexOf(c.priority || "medium") < 0) return false;
    var q = ui.q.trim().toLowerCase();
    if (!q) return true;
    return [c.id, c.title, c.notes, c.owner_terminal, (c.evidence || {}).ref]
      .filter(Boolean).join(" ").toLowerCase().indexOf(q) >= 0;
  }
  function visibleCards() { return (board.cards || []).filter(matches); }
  function cardsInLane(lane) {
    return visibleCards().filter(function (c) { return laneOf(c) === lane; }).sort(function (a, b) {
      var p = PRIO.indexOf(a.priority || "medium") - PRIO.indexOf(b.priority || "medium");
      if (p) return p;
      return String(b.last_checkpoint).localeCompare(String(a.last_checkpoint));
    });
  }
  function filtersActive() { return !!(ui.q.trim() || ui.fStatus.length || ui.fWho.length || ui.fPrio.length); }

  /* --------------------------------------------------------------- pieces -- */
  function tag(cls, text) { return '<span class="tag ' + cls + '">' + esc(text) + "</span>"; }
  function whoTag(w) { return w && WHO[w] ? tag("who " + w, WHO[w]) : ""; }
  function gateTag(g) { var b = GATE_BADGE[g] || { label: g, cls: "" }; return tag("gate " + b.cls, b.label); }
  function evidenceBit(ev) {
    if (!ev) return '<span class="ev none">no evidence yet</span>';
    var k = ev.kind === "pr" ? "PR " : ev.kind === "journal" ? "journal " : ev.kind === "sha256" ? "sha " : ev.kind === "e2e" ? "e2e " : ev.kind === "screenshot" ? "shot " : "";
    var ref = String(ev.ref || "").trim();
    // Do not stutter: many refs already begin with their own kind word
    // ("PR #704 - ...", "journal migration 0049 ...").
    if (k && ref.toLowerCase().indexOf(k.trim().toLowerCase()) === 0) k = "";
    var short = ref.length > 34 ? ref.slice(0, 34).replace(/[\s\-–—]+$/, "") + "…" : ref;
    return '<span class="ev" title="' + esc(ref) + '"><b>' + esc(k + short) + "</b>" + (ev.at ? " · " + esc(dateOnly(ev.at)) : "") + "</span>";
  }
  function staleBit(c) {
    var d = daysSince(c.last_checkpoint);
    if (c.status === "shipped") return '<span class="stale">' + esc(dateOnly(c.last_checkpoint)) + "</span>";
    var cls = d >= 14 ? " bad" : d >= 7 ? " warn" : "";
    return '<span class="stale' + cls + '" title="last checkpoint ' + esc(dateOnly(c.last_checkpoint)) + '">' + d + "d</span>";
  }

  function cardHTML(c) {
    var prio = c.priority || "medium";
    return '<article class="card s-' + esc(c.status) + '" draggable="true" data-card="' + esc(c.id) + '" tabindex="0">' +
      '<div class="row1">' +
        '<span class="cid">' + esc(c.id) + "</span>" +
        tag("st-" + c.status, STATUS_LABEL[c.status] || c.status) +
        (prio !== "medium" ? tag("prio-" + prio, PRIO_LABEL[prio]) : "") +
        staleBit(c) +
      "</div>" +
      '<div class="ttl">' + esc(c.title) + "</div>" +
      '<div class="row2">' + gateTag(c.gate) + whoTag(c.blocked_on) + evidenceBit(c.evidence) +
        '<span class="qa">' +
          (c.status === "shipped"
            ? '<button class="iconbtn" data-act="reopen" data-id="' + esc(c.id) + '" title="Reopen: back to in flight">Reopen</button>'
            : '<button class="iconbtn go" data-act="ship" data-id="' + esc(c.id) + '" title="Mark done - asks for the evidence the repo validator requires">Done</button>') +
          '<button class="iconbtn" data-act="open" data-id="' + esc(c.id) + '" title="Open details">Open</button>' +
        "</span>" +
      "</div>" +
    "</article>";
  }

  function laneHTML(lane) {
    var cards = cardsInLane(lane);
    var body;
    // Shipped is history: it is the biggest lane and the least worked, so it
    // collapses to a count. It still accepts drops while collapsed.
    if (lane === "shipped" && !ui.shippedOpen) {
      return '<section class="lane" data-lane="shipped">' +
        '<div class="lh"><span class="rail"></span><span class="t">' + esc(LANE_LABEL.shipped) + "</span>" +
          '<span class="c">' + cards.length + "</span></div>" +
        '<div class="lb"><button class="addcard" data-act="shipped-toggle">Show ' + cards.length + " shipped</button></div></section>";
    }
    if (lane === "blocked_on_people") {
      body = PEOPLE.map(function (p) {
        var mine = cards.filter(function (c) { return c.blocked_on === p; });
        if (!mine.length) return "";
        return '<div class="subhead ' + p + '">' + esc(WHO[p]) + " · " + mine.length + "</div>" + mine.map(cardHTML).join("");
      }).join("");
      if (!body) body = '<div class="empty">Nobody owes an answer right now.</div>';
    } else {
      body = cards.length ? cards.map(cardHTML).join("")
        : '<div class="empty">' + (filtersActive() ? "Nothing here matches the filter." : "Empty.") + "</div>";
    }
    return '<section class="lane" data-lane="' + lane + '">' +
      '<div class="lh"><span class="rail"></span><span class="t">' + esc(LANE_LABEL[lane]) + "</span>" +
        '<span class="c">' + cards.length + "</span></div>" +
      '<div class="lb">' + body +
        (lane === "shipped"
          ? '<button class="addcard" data-act="shipped-toggle">Hide shipped</button>'
          : '<button class="addcard" data-act="add" data-lane="' + lane + '">+ Add here</button>') +
      "</div></section>";
  }

  /* ---------------------------------------------------------- cockpit bar -- */
  function statHTML(key, cls, value, label, meta, pressed) {
    return '<button class="stat ' + cls + '" data-act="stat" data-key="' + key + '" aria-pressed="' + (pressed ? "true" : "false") + '">' +
      '<span class="k">' + esc(label) + "</span>" +
      '<span class="v">' + esc(String(value)) + "</span>" +
      '<span class="m">' + esc(meta) + "</span></button>";
  }
  function cockpitHTML() {
    var all = board.cards || [];
    var shipped = all.filter(function (c) { return c.status === "shipped"; }).length;
    var flight = all.filter(function (c) { return c.status === "in_flight"; }).length;
    var blocked = all.filter(function (c) { return c.status === "blocked"; }).length;
    var mine = all.filter(function (c) { return c.status === "blocked" && c.blocked_on === OWNER; }).length;
    var lg = board.launch_gate || { conditions: [], denominator: DENOM };
    var conds = lg.conditions || [];
    var passed = conds.filter(function (g) { return g.state === "pass"; }).length;
    var denom = lg.denominator || DENOM;
    var open = conds.filter(function (g) { return g.state !== "pass"; });

    var stats = '<div class="stats">' +
      statHTML("shipped", "ok", shipped, "Shipped", shipped + " of " + all.length + " cards", ui.fStatus.length === 1 && ui.fStatus[0] === "shipped") +
      statHTML("in_flight", "go", flight, "In flight", "being executed", ui.fStatus.length === 1 && ui.fStatus[0] === "in_flight") +
      statHTML("blocked", "stop", blocked, "Blocked", "waiting on someone", ui.fStatus.length === 1 && ui.fStatus[0] === "blocked") +
      statHTML("mine", "todo", mine, "On you", mine === 0 ? "nothing waiting" : "your move", ui.fWho.length === 1 && ui.fWho[0] === OWNER) +
    "</div>";

    var pips = conds.map(function (g) {
      return '<button class="' + (g.state === "pass" ? "pass" : "") + '" data-act="gate-toggle" data-gid="' + esc(g.id) + '" ' +
        'title="' + esc(g.id + " · " + g.title) + '">' + esc(g.id) + "</button>";
    }).join("");

    return '<div class="cockpit">' + stats +
      '<div class="gatecard' + (passed === denom ? " complete" : "") + '">' +
        '<div class="gh"><span class="lbl">Launch gate</span>' +
          '<span class="read"><b>' + passed + "</b> / " + denom + "</span></div>" +
        '<div class="pips">' + pips + "</div>" +
        '<p class="note">' + esc(CFG.denominatorWord) + ' go/no-go conditions, counted never estimated. This is <b>not</b> a percentage of build work: it moves only when a person or a production action clears a condition. ' +
          (open.length ? "Open: " + open.map(function (g) { return esc(g.id) + (g.blocked_on ? " (" + esc(WHO[g.blocked_on] || g.blocked_on) + ")" : ""); }).join(", ") + "." : "All " + CFG.denominatorWord.toLowerCase() + " cleared.") +
        "</p>" +
      "</div></div>";
  }

  /* ----------------------------------------------------------- filter row -- */
  function chip(act, val, label, count, pressed) {
    return '<button class="chip" data-act="' + act + '" data-v="' + esc(val) + '" aria-pressed="' + (pressed ? "true" : "false") + '">' +
      esc(label) + (count != null ? '<span class="n">' + count + "</span>" : "") + "</button>";
  }
  function filtersHTML() {
    var all = board.cards || [];
    var n = function (fn) { return all.filter(fn).length; };
    var out = STATUS_ORDER.map(function (s) {
      return chip("f-status", s, STATUS_LABEL[s], n(function (c) { return c.status === s; }), ui.fStatus.indexOf(s) >= 0);
    }).join("") + '<span class="sep"></span>' +
    PEOPLE.concat(["infra"]).map(function (w) {
      return chip("f-who", w, WHO[w], n(function (c) { return c.blocked_on === w; }), ui.fWho.indexOf(w) >= 0);
    }).join("") + '<span class="sep"></span>' +
    chip("f-prio", "high", "High priority", n(function (c) { return c.priority === "high"; }), ui.fPrio.indexOf("high") >= 0);
    if (filtersActive()) out += '<button class="btn btn-sm ghost push" data-act="clear-filters">Clear filters</button>';
    return '<div class="filters">' + out + "</div>";
  }

  /* ---------------------------------------------------------- focus view -- */
  function focusList(cards, emptyMsg) {
    if (!cards.length) return '<p class="lede">' + esc(emptyMsg) + "</p>";
    return cards.map(cardHTML).join("");
  }
  function focusHTML() {
    var vis = visibleCards();
    var lg = board.launch_gate || { conditions: [] };
    var stale = function (a, b) { return daysSince(b.last_checkpoint) - daysSince(a.last_checkpoint); };

    var onIvan = vis.filter(function (c) { return c.status === "blocked" && c.blocked_on === OWNER; }).sort(stale);
    var gatesIvan = (lg.conditions || []).filter(function (g) { return g.state !== "pass" && g.blocked_on === OWNER; });
    var onOthers = vis.filter(function (c) { return c.status === "blocked" && OTHERS.indexOf(c.blocked_on) >= 0; }).sort(stale);
    var moving = vis.filter(function (c) { return c.status === "in_flight"; }).sort(stale);
    var next = vis.filter(function (c) { return c.status === "todo"; }).sort(stale);
    var recent = vis.filter(function (c) { return c.status === "shipped"; })
      .sort(function (a, b) { return String(b.last_checkpoint).localeCompare(String(a.last_checkpoint)); }).slice(0, 6);

    var gateBits = gatesIvan.map(function (g) {
      return '<article class="card s-blocked" tabindex="0">' +
        '<div class="row1"><span class="cid">' + esc(g.id) + "</span>" + tag("st-blocked", "Launch gate") +
          '<span class="stale">' + esc(g.blocked_on ? WHO[g.blocked_on] : "") + "</span></div>" +
        '<div class="ttl">' + esc(g.title) + "</div>" +
        '<div class="row2">' + evidenceBit(g.evidence) +
          '<span class="qa"><button class="iconbtn go" data-act="gate-toggle" data-gid="' + esc(g.id) + '">Mark pass</button>' +
          '<button class="iconbtn" data-act="gate-edit" data-gid="' + esc(g.id) + '">Open</button></span>' +
        "</div></article>";
    }).join("");

    return '<div class="focuswrap">' +
      '<section class="focusgroup"><h3>Your move<span class="n">' + (onIvan.length + gatesIvan.length) + "</span></h3>" +
        '<div class="fbody"><p class="lede">Everything that cannot move until you personally act. Launch-gate conditions sit here too, because those are the ones holding the launch.</p>' +
        gateBits + focusList(onIvan, "No card is waiting on you.") + "</div></section>" +
      '<section class="focusgroup"><h3>Waiting on others<span class="n">' + onOthers.length + "</span></h3>" +
        '<div class="fbody">' + focusList(onOthers, "Nobody else is holding anything up.") + "</div></section>" +
      '<section class="focusgroup"><h3>Moving now<span class="n">' + moving.length + "</span></h3>" +
        '<div class="fbody">' + focusList(moving, "Nothing is in flight.") + "</div></section>" +
      '<section class="focusgroup"><h3>Next up<span class="n">' + next.length + "</span></h3>" +
        '<div class="fbody">' + focusList(next, "Nothing queued.") + "</div></section>" +
      '<section class="focusgroup"><h3>Recently shipped<span class="n">' + recent.length + "</span></h3>" +
        '<div class="fbody">' + focusList(recent, "Nothing shipped yet.") + "</div></section>" +
    "</div>";
  }

  /* ----------------------------------------------------------- gate view -- */
  function gateViewHTML() {
    var lg = board.launch_gate || { conditions: [], denominator: DENOM };
    var conds = lg.conditions || [];
    var rows = conds.map(function (g) {
      var open = !!ui.openGateNotes[g.id];
      var notes = String(g.notes || "");
      return '<article class="gaterow ' + (g.state === "pass" ? "pass" : "fail") + '">' +
        '<div class="g1"><span class="gid">' + esc(g.id) + "</span>" + whoTag(g.blocked_on) +
          '<button class="gstate" data-act="gate-toggle" data-gid="' + esc(g.id) + '" title="Toggle pass / fail">' +
          (g.state === "pass" ? "PASS" : "FAIL") + "</button></div>" +
        '<div class="gtitle">' + esc(g.title) + "</div><div>" + evidenceBit(g.evidence) + "</div>" +
        (notes ? '<div class="gnotes' + (open ? "" : " clip") + '">' + esc(notes) + "</div>" +
          (notes.length > 220 ? '<button class="gmore" data-act="gate-notes" data-gid="' + esc(g.id) + '">' + (open ? "Show less" : "Read the full note") + "</button>" : "") : "") +
        '<div><button class="btn btn-sm" data-act="gate-edit" data-gid="' + esc(g.id) + '">Edit condition</button></div>' +
      "</article>";
    }).join("");
    var passed = conds.filter(function (g) { return g.state === "pass"; }).length;
    return '<h2 class="section">Launch gate · ' + passed + " of " + (lg.denominator || DENOM) + " cleared</h2>" +
      '<div class="gategrid">' + rows + "</div>";
  }

  /* ----------------------------------------------------------- list view -- */
  function sortCards(cards) {
    var k = ui.sort.key, dir = ui.sort.dir;
    var val = function (c) {
      switch (k) {
        case "id": return c.id;
        case "title": return c.title;
        case "status": return String(STATUS_ORDER.indexOf(c.status));
        case "lane": return laneOf(c);
        case "who": return c.blocked_on || "";
        case "gate": return c.gate;
        default: return c.last_checkpoint || "";
      }
    };
    return cards.slice().sort(function (a, b) {
      var x = String(val(a)), y = String(val(b));
      return x < y ? -dir : x > y ? dir : 0;
    });
  }
  function th(key, label) {
    var active = ui.sort.key === key;
    return '<th data-act="sort" data-k="' + key + '">' + esc(label) +
      (active ? ' <span class="arrow">' + (ui.sort.dir > 0 ? "▲" : "▼") + "</span>" : "") + "</th>";
  }
  function listHTML() {
    var rows = sortCards(visibleCards()).map(function (c) {
      return '<tr data-act="open" data-id="' + esc(c.id) + '">' +
        '<td><span class="cid">' + esc(c.id) + "</span></td>" +
        '<td class="t">' + esc(c.title) + "</td>" +
        "<td>" + tag("st-" + c.status, STATUS_LABEL[c.status]) + "</td>" +
        "<td>" + esc(LANE_LABEL[laneOf(c)]) + "</td>" +
        "<td>" + (c.blocked_on ? whoTag(c.blocked_on) : '<span class="ev none">—</span>') + "</td>" +
        "<td>" + gateTag(c.gate) + "</td>" +
        '<td class="mono">' + esc(dateOnly(c.last_checkpoint)) + "</td>" +
        "<td>" + evidenceBit(c.evidence) + "</td></tr>";
    }).join("");
    return '<h2 class="section">All cards · ' + visibleCards().length + "</h2>" +
      '<div class="tablewrap"><table class="board"><thead><tr>' +
      th("id", "ID") + th("title", "Title") + th("status", "Status") + th("lane", "Lane") +
      th("who", "Waiting on") + th("gate", "Gate") + th("checkpoint", "Checkpoint") +
      "<th>Evidence</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  /* ------------------------------------------------------- timeline view -- */
  function timelineHTML() {
    var byDay = {};
    visibleCards().forEach(function (c) {
      var d = dateOnly(c.last_checkpoint) || "unknown";
      (byDay[d] = byDay[d] || []).push(c);
    });
    var days = Object.keys(byDay).sort().reverse();
    if (!days.length) return '<h2 class="section">Timeline</h2><p class="lede">Nothing matches.</p>';
    var body = days.map(function (d) {
      var items = byDay[d].sort(function (a, b) { return STATUS_ORDER.indexOf(b.status) - STATUS_ORDER.indexOf(a.status); });
      return '<div class="tl-day"><div class="tl-date">' + esc(d) + '<span class="rel">' + esc(relDay(d)) + "</span></div>" +
        '<div class="tl-items">' + items.map(function (c) {
          return '<div class="tl-item s-' + esc(c.status) + '" data-act="open" data-id="' + esc(c.id) + '">' +
            '<span class="tl-dot"></span><span class="tl-id">' + esc(c.id) + "</span>" +
            '<span class="tl-t">' + esc(c.title) + "</span></div>";
        }).join("") + "</div></div>";
    }).join("");
    return '<h2 class="section">Timeline · every card by its last checkpoint</h2><div class="timeline">' + body + "</div>";
  }

  /* ------------------------------------------------------ rulings view -- */
  /**
   * RECORDED DECISIONS. Never a card, never in a lane, never in a count.
   *
   * The fields are deliberately the ones a ruling HAS - what was decided, when,
   * by whom, what it binds, and whether a later ruling replaced it. There is no
   * status chip and no evidence chip, because a ruling is not done or not done
   * and a control offering to "close" one would be an invitation to lie.
   *
   * A SUPERSEDED RULING IS SHOWN, NOT HIDDEN. It is struck through and names the
   * ruling that replaced it. Hiding it would take the chain with it, and the
   * chain is the only record of why a decision stopped applying.
   *
   * Search applies here too: `/` over the ruling text, the title and the notes,
   * so looking for "migration" finds the ruling that governs migrations rather
   * than only the cards that mention them.
   */
  function visibleRulings() {
    var q = ui.q.trim().toLowerCase();
    var all = board.rulings || [];
    if (!q) return all;
    return all.filter(function (r) {
      return [r.id, r.title, r.ruling, r.notes, (r.governs || []).join(" ")]
        .filter(Boolean).join(" ").toLowerCase().indexOf(q) >= 0;
    });
  }
  function rulingsHTML() {
    var all = board.rulings || [];
    if (!all.length) {
      return '<h2 class="section">Rulings</h2>' +
        '<p class="lede">No recorded rulings on this board. A ruling is a decision somebody took — ' +
        'it has no status and nothing finishes it, which is why it lives here and not in a lane.</p>';
    }
    var rows = visibleRulings();
    if (!rows.length) return '<h2 class="section">Rulings · ' + all.length + "</h2><p class=\"lede\">Nothing matches.</p>";
    var body = rows.map(function (r) {
      var sup = r.superseded_by || null;
      var notes = String(r.notes || "");
      var open = !!ui.openRulingNotes[r.id];
      return '<article class="ruling' + (sup ? " superseded" : "") + '">' +
        '<div class="r1"><span class="rid">' + esc(r.id) + "</span>" +
          '<span class="rdate mono">' + esc(String(r.date || "")) + "</span>" +
          '<span class="rby">ruled by ' + esc(String(r.ruled_by || "")) + "</span>" +
          (sup ? '<span class="rsup">superseded by ' + esc(sup) + "</span>" : "") +
        "</div>" +
        (r.title ? '<div class="rtitle">' + esc(r.title) + "</div>" : "") +
        '<blockquote class="rtext">' + esc(String(r.ruling || "")) + "</blockquote>" +
        '<div class="rgoverns"><span class="lbl">Governs</span>' +
          (r.governs || []).map(function (g) { return '<code>' + esc(g) + "</code>"; }).join("") +
        "</div>" +
        (notes
          ? '<div class="rnotes' + (open ? "" : " clip") + '">' + esc(notes) + "</div>" +
            (notes.length > 220
              ? '<button class="gmore" data-act="ruling-notes" data-rid="' + esc(r.id) + '">' +
                (open ? "Show less" : "Read the full record") + "</button>"
              : "")
          : "") +
      "</article>";
    }).join("");
    var superseded = all.filter(function (r) { return !!r.superseded_by; }).length;
    return '<h2 class="section">Rulings · ' + all.length + " recorded decision" + (all.length === 1 ? "" : "s") +
        (superseded ? " · " + superseded + " superseded" : "") + "</h2>" +
      '<p class="lede">Decisions the owner took. <b>They are not cards.</b> They carry no status, no gate and no ' +
        'evidence, because a ruling is not done or not done — nothing here is work anybody owes. They are ' +
        'excluded from every count on this page for that reason.</p>' +
      '<div class="rulings">' + body + "</div>";
  }

  /* ------------------------------------------------------------- chrome -- */
  function cmdbarHTML() {
    var d = diffVsSeed();
    return '<div class="cmdbar">' +
      '<span class="brandmark"><i></i>' + esc(CFG.brandmark) + '</span>' +
      '<div class="views">' + VIEWS.map(function (v) {
        return '<button data-act="view" data-v="' + v.id + '" aria-pressed="' + (ui.view === v.id ? "true" : "false") + '">' + esc(v.label) + "</button>";
      }).join("") + "</div>" +
      '<div class="searchwrap"><input id="q" type="search" placeholder="Search cards, notes, evidence…" value="' + esc(ui.q) + '" /><span class="hint">/</span></div>' +
      '<button class="savechip' + (d.total ? " dirty" : "") + '" data-act="export" title="Review and export your changes">' +
        (d.total ? d.total + " local change" + (d.total === 1 ? "" : "s") : "matches the repo") + "</button>" +
      '<button class="btn" data-act="undo"' + (undoStack.length ? "" : " disabled") + ' title="Undo (Ctrl/Cmd+Z)">Undo</button>' +
      '<button class="btn" data-act="add" data-lane="in_flight"><span class="ic">+</span> New</button>' +
      '<button class="btn primary" data-act="export">Export</button>' +
    "</div>";
  }
  function footerHTML() {
    var lg = board.launch_gate || {};
    return '<footer class="pf"><span class="mono">' + esc(CFG.footerLabel) + ' · snapshot ' + esc(board.as_of || "") + "</span>" +
      '<span class="mono">source ' + esc(CFG.sourcePath) + ' · readiness ' +
      ((lg.conditions || []).filter(function (g) { return g.state === "pass"; }).length) + "/" + (lg.denominator || DENOM) +
      " · keys / n e u 1-" + VIEWS.length + " · </span>" +
      '<button class="btn btn-sm ghost" data-act="reset">Discard local changes</button></footer>';
  }

  /**
   * True when the published board differs from the publish this browser's
   * snapshot was taken from.
   *
   * PL-28: this compared `as_of` DATES, so it could not see a same-day
   * republish. Every publish on 2026-07-31 carried as_of "2026-07-31", making
   * `SEED.as_of > board.as_of` false for all four - the owner kept looking at
   * the intake snapshot (nothing shipped, "no evidence yet") while main said 30
   * shipped, and the portal never offered him the newer board. Comparing a
   * content fingerprint catches any change, same day or not.
   *
   * A pre-PL-28 snapshot has no recorded provenance; it is treated as stale, so
   * anyone stranded by the old logic is offered the new board on first load.
   */
  function seedIsNewer() {
    if (seedNoticeDismissed) return false;
    if (!SEED.fingerprint) {
      // Rendered by an older renderer: fall back to the date comparison rather
      // than claiming staleness we cannot actually establish.
      var a = String(board.as_of || ""), b = String(SEED.as_of || "");
      return !!b && !!a && b > a;
    }
    return basedOnFingerprint !== SEED.fingerprint;
  }
  function seedNoticeHTML() {
    if (!seedIsNewer()) return "";
    var d = diffVsSeed();
    // PL-28: same-day republishes are the common case, so leading with two
    // identical dates reads as a bug. Lead with what actually differs.
    var when = SEED.as_of === (board.as_of || "")
      ? "snapshot " + esc(SEED.as_of) + ", republished since you loaded it"
      : "snapshot " + esc(SEED.as_of) + ", yours is " + esc(board.as_of || "?");
    return '<div class="notice"><span class="dot"></span>' +
      "<span>A newer board was published — <b>" + when + "</b>." +
      (d.total ? " Taking it discards " + d.total + " local change" + (d.total === 1 ? "" : "s") + "." : "") + "</span>" +
      '<button class="btn btn-sm primary" data-act="take-seed">Load the new board</button>' +
      '<button class="btn btn-sm ghost" data-act="dismiss-notice">Keep mine</button></div>';
  }

  function render() {
    var main = ui.view === "board"
      ? filtersHTML() + '<div class="lanes">' + ALL_LANES.map(laneHTML).join("") + "</div>"
      : ui.view === "gate" ? gateViewHTML()
      : ui.view === "list" ? filtersHTML() + listHTML()
      : ui.view === "timeline" ? filtersHTML() + timelineHTML()
      // No filtersHTML(): every filter on this board is a filter over card
      // STATE - status, who is blocked, priority - and a ruling has none of it.
      // Offering them here would render controls that can only ever empty the
      // list, which reads as a bug rather than as a rule.
      : ui.view === "rulings" ? rulingsHTML()
      : filtersHTML() + focusHTML();

    document.getElementById("app").innerHTML = cmdbarHTML() + seedNoticeHTML() + cockpitHTML() + main + footerHTML();
    persistUi();
    if (drawerId) renderDrawer();
  }

  /* -------------------------------------------------------------- toasts -- */
  function toast(msg, withUndo) {
    var host = document.querySelector(".toasts");
    if (!host) { host = document.createElement("div"); host.className = "toasts"; document.body.appendChild(host); }
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = "<span>" + esc(msg) + "</span>" + (withUndo ? '<button data-act="undo">Undo</button>' : "");
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, withUndo ? 5200 : 2600);
  }

  /* -------------------------------------------------------------- modals -- */
  function openModal(opts) {
    closeModal();
    var scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.innerHTML = '<div class="modal' + (opts.wide ? " wide" : "") + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
      '<div class="modal-head"><div><h3>' + esc(opts.title) + "</h3>" +
        (opts.subtitle ? '<div class="subh">' + esc(opts.subtitle) + "</div>" : "") + "</div>" +
        '<button class="xbtn" data-act="modal-close" aria-label="Close">×</button></div>' +
      '<div class="modal-note" hidden></div>' + opts.body +
      (opts.foot ? '<div class="modal-foot">' + opts.foot + "</div>" : "") + "</div>";
    document.body.appendChild(scrim);
    scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) closeModal(); });
    modal = scrim;
    var first = scrim.querySelector("input,select,textarea");
    if (first) first.focus();
    return scrim;
  }
  function closeModal() { if (modal) { modal.remove(); modal = null; } }
  function modalNote(scrim, msg) {
    var n = scrim.querySelector(".modal-note");
    if (!n) return;
    if (msg) { n.textContent = msg; n.hidden = false; } else { n.hidden = true; }
  }
  function field(cls, label, inner, hint) {
    return '<div class="field ' + (cls || "") + '"><label>' + esc(label) + "</label>" + inner +
      (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + "</div>";
  }
  function options(list, cur, labelFn) {
    return list.map(function (v) {
      var val = v === null ? "" : v;
      var lbl = labelFn ? labelFn(v) : v === null ? "(none)" : v;
      var sel = v === cur || (v === null && (cur == null || cur === "")) ? " selected" : "";
      return '<option value="' + esc(val) + '"' + sel + ">" + esc(lbl) + "</option>";
    }).join("");
  }
  function evidenceFields(pfx, ev) {
    ev = ev || {};
    return '<div class="field full"><label>Evidence</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
        '<select id="' + pfx + 'k" style="flex:none;min-width:130px">' + options([null].concat(EV_KIND), ev.kind, function (k) { return k === null ? "(none)" : k; }) + "</select>" +
        '<input id="' + pfx + 'r" type="text" placeholder="PR number, sha256, path…" value="' + esc(ev.ref || "") + '" style="flex:1;min-width:160px" />' +
        '<input id="' + pfx + 'a" type="date" value="' + esc(dateOnly(ev.at) || today()) + '" style="flex:none;width:150px" />' +
      '</div><span class="hint">A shipped card and a passed condition MUST carry evidence — the one rule the repo validator will not bend.</span></div>';
  }
  function readEvidence(scrim, pfx, original) {
    var k = scrim.querySelector("#" + pfx + "k").value;
    if (!k) return null;
    var at = scrim.querySelector("#" + pfx + "a").value;
    if (original && original.at && dateOnly(original.at) === at) at = original.at;
    return { kind: k, ref: scrim.querySelector("#" + pfx + "r").value.trim(), at: at || today() };
  }

  /* ------------------------------------------------------ ship (with proof) */
  function shipCard(id) {
    var c = byId(id);
    if (!c) return;
    if (c.evidence && c.evidence.ref) {
      mutate("Shipped " + id, function () { c.status = "shipped"; c.last_checkpoint = today(); });
      return;
    }
    var scrim = openModal({
      title: "Mark " + id + " as done", subtitle: "evidence required",
      body: '<div class="modal-body"><div class="field full"><p style="margin:0;font-size:13px;color:var(--ink-2);line-height:1.6">' +
        "A card cannot be shipped without proof — a PR number, a journal entry, a hash, a passing test run or a screenshot. " +
        "The repo validator rejects a shipped card with no evidence, so the board asks for it here rather than letting you record something it will refuse." +
        "</p></div>" + evidenceFields("s-", { kind: "pr", at: today() }) + "</div>",
      foot: '<button class="btn" data-act="modal-close">Cancel</button><span class="spacer"></span><button class="btn primary" id="s-go">Mark done</button>',
    });
    scrim.querySelector("#s-go").addEventListener("click", function () {
      var ev = readEvidence(scrim, "s-", null);
      if (!ev || !ev.ref) { modalNote(scrim, "Add the evidence reference (the PR number, for example) before marking this done."); return; }
      closeModal();
      mutate("Shipped " + id, function () { c.evidence = ev; c.status = "shipped"; c.last_checkpoint = today(); });
    });
  }

  /* ------------------------------------------------------------ card edit -- */
  function suggestId() {
    var n = 1, seen = {};
    (board.cards || []).forEach(function (c) { seen[c.id] = 1; });
    while (seen[CFG.newIdPrefix + n]) n++;
    return CFG.newIdPrefix + n;
  }
  function openCardModal(card, defaults) {
    defaults = defaults || {};
    var isNew = !card;
    var c = card ? clone(card) : {
      id: suggestId(), title: "", home_lane: defaults.home || "in_flight", status: "todo",
      owner_terminal: CFG.ownerTerminalDefault, gate: "owner_merge", evidence: null, blocked_on: defaults.who || null,
      last_checkpoint: today(), notes: "", priority: "medium",
    };
    var body = '<div class="modal-body">' +
      field("", "ID", '<input id="f-id" type="text" value="' + esc(c.id) + '" />') +
      field("", "Kind", '<select id="f-home">' + options(KIND_LANES, homeOf(c), function (l) { return KIND_LABEL[l]; }) + "</select>", "Where it lives when it is neither blocked nor shipped") +
      field("full", "Title", '<input id="f-title" type="text" value="' + esc(c.title) + '" />') +
      field("", "Status", '<select id="f-status">' + options(STATUS_ORDER, c.status, function (s) { return STATUS_LABEL[s]; }) + "</select>") +
      field("", "Waiting on", '<select id="f-who">' + options(WHO_ORDER, c.blocked_on, function (w) { return w === null ? "(nobody)" : WHO[w]; }) + "</select>") +
      field("", "Priority", '<select id="f-prio">' + options(PRIO, c.priority || "medium", function (p) { return PRIO_LABEL[p]; }) + "</select>") +
      field("", "Merge gate", '<select id="f-gate">' + options(GATE_ORDER, c.gate, function (g) { return GATE_BADGE[g].label; }) + "</select>") +
      field("", "Owner terminal", '<input id="f-owner" type="text" value="' + esc(c.owner_terminal || "") + '" placeholder="' + esc(CFG.ownerTerminalPlaceholder) + '" />') +
      field("", "Last checkpoint", '<input id="f-cp" type="date" value="' + esc(dateOnly(c.last_checkpoint) || today()) + '" />') +
      evidenceFields("f-", c.evidence) +
      field("full", "Notes", '<textarea id="f-notes">' + esc(c.notes || "") + "</textarea>", "Context, quotes, decisions. Shown in the detail panel, never on the card face.") +
    "</div>";
    var scrim = openModal({
      title: isNew ? "New card" : "Edit " + c.id, subtitle: isNew ? "" : "card", wide: true, body: body,
      foot: '<button class="btn" data-act="modal-close">Cancel</button><span class="spacer"></span><button class="btn primary" id="f-save">' + (isNew ? "Add card" : "Save") + "</button>",
    });
    scrim.querySelector("#f-save").addEventListener("click", function () {
      var v = function (fid) { var el = scrim.querySelector("#" + fid); return el ? el.value : ""; };
      var id = v("f-id").trim(), title = v("f-title").trim();
      var taken = (board.cards || []).filter(function (x) { return x !== card; }).map(function (x) { return x.id; });
      if (!id) { modalNote(scrim, "The card needs an ID."); return; }
      if (taken.indexOf(id) >= 0) { modalNote(scrim, 'The ID "' + id + '" is already used by another card.'); return; }
      if (!title) { modalNote(scrim, "The card needs a title."); return; }
      var status = v("f-status"), ev = readEvidence(scrim, "f-", c.evidence), who = v("f-who") || null;
      if (status === "shipped" && (!ev || !ev.ref)) { modalNote(scrim, "A shipped card needs evidence. Add the reference, or set the status back."); return; }
      if (status === "blocked" && !who) { modalNote(scrim, "A blocked card must name who or what it waits on."); return; }
      var next = {
        id: id, title: title, home_lane: v("f-home"), status: status, owner_terminal: v("f-owner").trim(),
        gate: v("f-gate"), evidence: ev, blocked_on: who, last_checkpoint: v("f-cp") || today(),
        notes: v("f-notes"), priority: v("f-prio"),
      };
      next.lane = laneOf(next);
      closeModal();
      mutate(isNew ? "Added " + id : "Saved " + id, function () {
        if (card) board.cards[board.cards.indexOf(card)] = next;
        else (board.cards = board.cards || []).push(next);
      });
      if (isNew) openDrawer(id);
    });
  }

  function openGateModal(g) {
    var body = '<div class="modal-body">' +
      field("full", "Condition", '<input type="text" value="' + esc(g.id) + '" disabled />') +
      field("full", "Title", '<input id="g-title" type="text" value="' + esc(g.title) + '" />') +
      field("", "State", '<select id="g-state">' + options(["fail", "pass"], g.state, function (s) { return s.toUpperCase(); }) + "</select>") +
      field("", "Waiting on", '<select id="g-who">' + options(WHO_ORDER, g.blocked_on, function (w) { return w === null ? "(nobody)" : WHO[w]; }) + "</select>") +
      evidenceFields("g-", g.evidence) +
      field("full", "Notes", '<textarea id="g-notes">' + esc(g.notes || "") + "</textarea>") +
    "</div>";
    var scrim = openModal({
      title: "Launch condition " + g.id, subtitle: "go / no-go", wide: true, body: body,
      foot: '<button class="btn" data-act="modal-close">Cancel</button><span class="spacer"></span><button class="btn primary" id="g-save">Save</button>',
    });
    scrim.querySelector("#g-save").addEventListener("click", function () {
      // Read EVERY field before the modal is torn down: mutate() re-renders, and
      // a querySelector after that would be reading a detached node.
      var next = {
        title: scrim.querySelector("#g-title").value.trim(),
        state: scrim.querySelector("#g-state").value,
        who: scrim.querySelector("#g-who").value || null,
        notes: scrim.querySelector("#g-notes").value,
        ev: readEvidence(scrim, "g-", g.evidence),
      };
      if (next.state === "pass" && (!next.ev || !next.ev.ref)) {
        modalNote(scrim, "A passed condition needs evidence — that is what makes readiness counted rather than claimed.");
        return;
      }
      closeModal();
      mutate("Saved " + g.id, function () {
        g.title = next.title || g.title;
        g.state = next.state;
        g.blocked_on = next.who;
        g.notes = next.notes;
        g.evidence = next.ev;
      });
    });
  }

  function toggleGate(gid) {
    var g = gateById(gid);
    if (!g) return;
    if (g.state === "pass") { mutate(gid + " back to FAIL", function () { g.state = "fail"; }); return; }
    if (g.evidence && g.evidence.ref) { mutate(gid + " cleared", function () { g.state = "pass"; }); return; }
    var scrim = openModal({
      title: "Clear " + gid + "?", subtitle: "evidence required",
      body: '<div class="modal-body"><div class="field full"><p style="margin:0;font-size:13px;color:var(--ink-2);line-height:1.6">' +
        esc(g.title) + "</p></div>" + evidenceFields("gt-", { kind: "screenshot", at: today() }) + "</div>",
      foot: '<button class="btn" data-act="modal-close">Cancel</button><span class="spacer"></span><button class="btn primary" id="gt-go">Mark PASS</button>',
    });
    scrim.querySelector("#gt-go").addEventListener("click", function () {
      var ev = readEvidence(scrim, "gt-", null);
      if (!ev || !ev.ref) { modalNote(scrim, "Name the proof: an attestation, a screenshot reference, a hash."); return; }
      closeModal();
      mutate(gid + " cleared", function () { g.state = "pass"; g.evidence = ev; });
    });
  }

  function confirmDelete(id) {
    var c = byId(id);
    if (!c) return;
    var scrim = openModal({
      title: "Delete " + id + "?", subtitle: "local only",
      body: '<div class="modal-body"><div class="field full"><p style="margin:0;font-size:13px;line-height:1.6">Remove <b>' + esc(id) + "</b> — “" + esc(c.title) +
        "” — from your copy of the board. The repo JSON is untouched until you export and paste the change back. Undo restores it.</p></div></div>",
      foot: '<button class="btn" data-act="modal-close">Cancel</button><span class="spacer"></span><button class="btn danger" id="d-go">Delete</button>',
    });
    scrim.querySelector("#d-go").addEventListener("click", function () {
      closeModal();
      closeDrawer();
      mutate("Deleted " + id, function () {
        board.cards = (board.cards || []).filter(function (x) { return x.id !== id; });
      });
    });
  }

  /* -------------------------------------------------------------- drawer -- */
  function closeDrawer() {
    drawerId = null;
    var d = document.querySelector(".drawer-scrim");
    if (d) d.remove();
  }
  /* WF-01: the loop spec, rendered section by section rather than as one blob.
     A MISSING SECTION IS DRAWN, NOT OMITTED. An absent section rendered as
     nothing looks identical to a spec that never needed it, and this drawer is
     where somebody decides whether a loop is startable - so the gap has to be
     the visible thing. Same reason the sweep document's blank Observed boxes are
     printed rather than skipped. */
  function specBlock(c) {
    var isLoop = c.card_kind === "loop";
    if (!isLoop && !c.spec) return "";
    var spec = c.spec && typeof c.spec === "object" ? c.spec : {};
    var missing = LOOP_SPEC_SECTIONS.filter(function (k) {
      return typeof spec[k] !== "string" || !spec[k].trim();
    });
    var startable = missing.length === 0;
    var head =
      '<div class="seg"><span class="lbl">Loop spec — ' +
      (startable
        ? String(LOOP_SPEC_SECTIONS.length) + " of " + String(LOOP_SPEC_SECTIONS.length) + " sections, startable"
        : String(LOOP_SPEC_SECTIONS.length - missing.length) + " of " + String(LOOP_SPEC_SECTIONS.length) +
          " sections — NOT startable") +
      "</span>";
    if (!isLoop) {
      head +=
        '<div class="notesblock" style="color:var(--stop)">This card carries a spec but has not declared ' +
        "card_kind \"loop\". The validator rejects that: a spec without the marker is a missing marker, " +
        "not a bonus field.</div>";
    }
    var body = LOOP_SPEC_OPTIONAL.concat(LOOP_SPEC_SECTIONS)
      .map(function (k) {
        var v = typeof spec[k] === "string" ? spec[k].trim() : "";
        if (!v && LOOP_SPEC_OPTIONAL.indexOf(k) >= 0) return ""; // optional: absent is fine
        var label = SPEC_LABEL[k] || k;
        if (!v) {
          return (
            '<div style="margin-top:8px"><span class="lbl" style="color:var(--stop)">' +
            esc(label) +
            ' — MISSING</span></div>'
          );
        }
        return (
          '<div style="margin-top:8px"><span class="lbl">' + esc(label) + "</span>" +
          '<div class="notesblock">' + esc(v) + "</div></div>"
        );
      })
      .join("");
    var extra = Object.keys(spec).filter(function (k) {
      return LOOP_SPEC_SECTIONS.indexOf(k) < 0 && LOOP_SPEC_OPTIONAL.indexOf(k) < 0;
    });
    if (extra.length) {
      body +=
        '<div style="margin-top:8px"><span class="lbl" style="color:var(--stop)">Not a Loop Package section: ' +
        esc(extra.join(", ")) + "</span></div>";
    }
    return head + body + "</div>";
  }

  function renderDrawer() {
    var c = byId(drawerId);
    if (!c) { closeDrawer(); return; }
    var host = document.querySelector(".drawer-scrim");
    if (!host) {
      host = document.createElement("div");
      host.className = "drawer-scrim";
      host.addEventListener("mousedown", function (e) { if (e.target === host) closeDrawer(); });
      document.body.appendChild(host);
    }
    host.innerHTML = '<aside class="drawer" role="dialog" aria-modal="true" aria-label="Card ' + esc(c.id) + '">' +
      '<div class="drawer-head"><div><div class="sub">' + esc(c.id) + " · " + esc(KIND_LABEL[homeOf(c)]) + "</div>" +
        "<h3>" + esc(c.title) + "</h3></div>" +
        '<button class="xbtn" data-act="drawer-close" aria-label="Close">×</button></div>' +
      '<div class="drawer-body">' +
        '<div class="seg"><span class="lbl">Status — this moves the card by itself</span>' +
          '<div class="segrow status">' + STATUS_ORDER.map(function (s) {
            return '<button data-act="set-status" data-id="' + esc(c.id) + '" data-v="' + s + '" aria-pressed="' + (c.status === s ? "true" : "false") + '">' + esc(STATUS_LABEL[s]) + "</button>";
          }).join("") + "</div>" +
          '<span class="hint" style="font-size:11px;color:var(--ink-3)">Now in <b>' + esc(LANE_LABEL[laneOf(c)]) + "</b> — " + esc(LANE_HINT[laneOf(c)]) + ".</span></div>" +
        '<div class="seg"><span class="lbl">Waiting on</span><div class="segrow">' +
          WHO_ORDER.map(function (w) {
            return '<button data-act="set-who" data-id="' + esc(c.id) + '" data-v="' + esc(w || "") + '" aria-pressed="' + ((c.blocked_on || null) === w ? "true" : "false") + '">' + esc(w === null ? "Nobody" : WHO[w]) + "</button>";
          }).join("") + "</div></div>" +
        '<div class="seg"><span class="lbl">Kind</span><div class="segrow">' +
          KIND_LANES.map(function (l) {
            return '<button data-act="set-home" data-id="' + esc(c.id) + '" data-v="' + l + '" aria-pressed="' + (homeOf(c) === l ? "true" : "false") + '">' + esc(KIND_LABEL[l]) + "</button>";
          }).join("") + "</div></div>" +
        '<div class="seg"><span class="lbl">Priority</span><div class="segrow">' +
          PRIO.map(function (p) {
            return '<button data-act="set-prio" data-id="' + esc(c.id) + '" data-v="' + p + '" aria-pressed="' + ((c.priority || "medium") === p ? "true" : "false") + '">' + esc(PRIO_LABEL[p]) + "</button>";
          }).join("") + "</div></div>" +
        '<dl class="kv">' +
          "<dt>Evidence</dt><dd>" + evidenceBit(c.evidence) + "</dd>" +
          "<dt>Merge gate</dt><dd>" + gateTag(c.gate) + "</dd>" +
          "<dt>Terminal</dt><dd>" + esc(c.owner_terminal || "—") + "</dd>" +
          '<dt>Checkpoint</dt><dd class="mono">' + esc(dateOnly(c.last_checkpoint)) + " · " + esc(relDay(c.last_checkpoint)) + "</dd>" +
        "</dl>" +
        specBlock(c) +
        (c.notes ? '<div class="seg"><span class="lbl">Notes</span><div class="notesblock">' + esc(c.notes) + "</div></div>" : "") +
      "</div>" +
      '<div class="drawer-foot">' +
        (c.status === "shipped"
          ? '<button class="btn" data-act="reopen" data-id="' + esc(c.id) + '">Reopen</button>'
          : '<button class="btn primary" data-act="ship" data-id="' + esc(c.id) + '">Mark done</button>') +
        '<button class="btn" data-act="edit" data-id="' + esc(c.id) + '">Edit fields</button>' +
        '<span style="flex:1"></span>' +
        '<button class="btn danger" data-act="delete" data-id="' + esc(c.id) + '">Delete</button>' +
      "</div></aside>";
  }
  function openDrawer(id) { drawerId = id; renderDrawer(); }

  /* -------------------------------------------------- validator + export -- */
  function evOK(id, ev, push) {
    if (ev == null) return false;
    if (typeof ev !== "object" || Array.isArray(ev)) { push(id, "evidence must be null or an object"); return false; }
    var ok = true;
    if (EV_KIND.indexOf(ev.kind) < 0) { push(id, 'evidence.kind "' + ev.kind + '" is not valid'); ok = false; }
    if (typeof ev.ref !== "string" || !ev.ref.trim()) { push(id, "evidence.ref must not be empty"); ok = false; }
    if (!isIso(ev.at)) { push(id, 'evidence.at "' + ev.at + '" is not an ISO date'); ok = false; }
    return ok;
  }
  /* WF-01, mirrored from docs/board/validate-board.mjs. Kept as a separate
     implementation on purpose - the same arrangement as laneOf/deriveLane - so
     that a board exported from this app cannot be red in CI while looking green
     here. */
  function loopSpecOK(id, c, push) {
    var kind = c.card_kind == null ? null : c.card_kind;
    if (kind !== null && CARD_KIND.indexOf(kind) < 0) push(id, 'card_kind "' + kind + '" is not valid');
    var spec = c.spec == null ? null : c.spec;
    if (spec !== null) {
      if (typeof spec !== "object" || Array.isArray(spec)) { push(id, "spec must be an object"); return; }
      if (kind !== "loop") push(id, "carries a spec but has not declared card_kind loop");
      var allowed = LOOP_SPEC_SECTIONS.concat(LOOP_SPEC_OPTIONAL);
      Object.keys(spec).forEach(function (k) {
        if (allowed.indexOf(k) < 0) push(id, 'spec section "' + k + '" is not a Loop Package section');
        else if (typeof spec[k] !== "string" || !spec[k].trim()) push(id, "spec." + k + " is empty");
      });
    }
    if (kind === "loop" && LOOP_SPEC_REQUIRED_AT.indexOf(c.status) >= 0) {
      var have = spec && typeof spec === "object" && !Array.isArray(spec) ? spec : {};
      var missing = LOOP_SPEC_SECTIONS.filter(function (k) {
        return typeof have[k] !== "string" || !have[k].trim();
      });
      if (missing.length) push(id, "loop card is " + c.status + " with " + missing.length + " spec section(s) missing: " + missing.join(", "));
    }
  }

  // RULINGS - mirrored from docs/board/validate-board.mjs for the reason this
  // whole validate() exists: a board that leaves this app through Export must
  // already satisfy the rule CI will apply to it, or it is green here and red
  // there. Same arrangement as loopSpecOK above.
  var RULING_REQUIRED = ["id", "ruling", "date", "ruled_by", "superseded_by", "governs"];
  var RULING_OPTIONAL = ["title", "notes", "external_agenda"];
  var RULING_FORBIDDEN = [
    "status", "gate", "evidence", "acceptance", "lane", "home_lane", "blocked_on",
    "card_kind", "spec", "deferred", "open_on_purpose", "priority", "owner_terminal",
    "last_checkpoint",
  ];
  function rulingOK(id, r, push, ids) {
    if (typeof r !== "object" || r === null || Array.isArray(r)) { push(id, "ruling must be an object"); return; }
    RULING_REQUIRED.forEach(function (k) {
      if (!(k in r)) push(id, 'ruling is missing required field "' + k + '"');
    });
    RULING_FORBIDDEN.forEach(function (k) {
      if (k in r) push(id, 'ruling carries "' + k + '" - a ruling is not done or not done');
    });
    var allowed = RULING_REQUIRED.concat(RULING_OPTIONAL);
    Object.keys(r).forEach(function (k) {
      if (allowed.indexOf(k) < 0 && RULING_FORBIDDEN.indexOf(k) < 0)
        push(id, 'ruling field "' + k + '" is not a ruling field');
    });
    if (typeof r.ruling !== "string" || !r.ruling.trim()) push(id, "ruling text is empty");
    if (!isIso(r.date)) push(id, "ruling date is not an ISO date");
    if (typeof r.ruled_by !== "string" || !r.ruled_by.trim()) push(id, "ruled_by does not name who decided");
    var sup = r.superseded_by == null ? null : r.superseded_by;
    if (sup !== null && ids.indexOf(sup) < 0) push(id, 'superseded_by "' + sup + '" names no ruling on this board');
    if (sup !== null && sup === r.id) push(id, "superseded_by names itself");
    if (!Array.isArray(r.governs) || !r.governs.length) push(id, "governs must name at least one card or file");
    if ("external_agenda" in r && r.external_agenda !== true)
      push(id, 'external_agenda must be exactly true, or be absent');
  }

  function validate(b) {
    var out = [], push = function (id, msg) { out.push({ id: id, msg: msg }); };
    var rulings = b.rulings || [];
    var rulingIds = rulings.map(function (r) { return r && r.id; });
    var rseen = {};
    rulings.forEach(function (r) {
      var id = (r && r.id) || "ruling?";
      if (rseen[id]) push(id, "duplicate ruling id");
      rseen[id] = 1;
      rulingOK(id, r, push, rulingIds);
    });
    var lg = b.launch_gate || {}, conds = lg.conditions || [];
    if (lg.denominator !== DENOM) push("launch gate", "denominator must be " + DENOM + ", got " + lg.denominator);
    if (conds.length !== DENOM) push("launch gate", "expected " + DENOM + " conditions, got " + conds.length);
    var passed = 0, gseen = {};
    conds.forEach(function (g) {
      var id = g.id || "G?";
      if (gseen[id]) push("launch gate", "duplicate condition id " + id);
      gseen[id] = 1;
      if (["pass", "fail"].indexOf(g.state) < 0) { push(id, 'state "' + g.state + '" is not pass or fail'); return; }
      var has = evOK(id, g.evidence == null ? null : g.evidence, push);
      if (g.state === "pass") { passed++; if (!has) push(id, "condition is PASS with no evidence"); }
    });
    if (typeof lg.readiness_passed === "number" && lg.readiness_passed !== passed)
      push("launch gate", "readiness says " + lg.readiness_passed + " but " + passed + " conditions pass");
    var seen = {};
    (b.cards || []).forEach(function (c) {
      var id = c.id || "card?";
      if (seen[id]) push(id, "duplicate card id");
      if (rulingIds.indexOf(id) >= 0) push(id, "id exists in BOTH cards and rulings - a move is a move");
      seen[id] = 1;
      if (typeof c.title !== "string" || !c.title.trim()) push(id, "title is empty");
      if (ALL_LANES.indexOf(c.lane) < 0) push(id, 'lane "' + c.lane + '" is not a lane');
      if (c.lane !== laneOf(c)) push(id, "stored lane disagrees with its status (should be " + laneOf(c) + ")");
      if (STATUS_ORDER.indexOf(c.status) < 0) push(id, 'status "' + c.status + '" is not valid');
      if (GATE_ORDER.indexOf(c.gate) < 0) push(id, 'gate "' + c.gate + '" is not valid');
      if (WHO_ORDER.indexOf(c.blocked_on == null ? null : c.blocked_on) < 0) push(id, 'waiting-on "' + c.blocked_on + '" is not valid');
      if (KIND_LANES.indexOf(c.home_lane) < 0) push(id, 'home_lane "' + c.home_lane + '" is not a kind');
      if (PRIO.indexOf(c.priority || "medium") < 0) push(id, 'priority "' + c.priority + '" is not valid');
      if (!isIso(c.last_checkpoint)) push(id, "last_checkpoint is not an ISO date");
      var has = evOK(id, c.evidence == null ? null : c.evidence, push);
      if (c.status === "shipped" && !has) push(id, "shipped with no evidence");
      if (c.status === "blocked" && (c.blocked_on || null) === null) push(id, "blocked but nobody is named");
      if (c.lane === "blocked_on_people" && PEOPLE.indexOf(c.blocked_on) < 0) push(id, "in the people lane without a person");
      loopSpecOK(id, c, push);
    });
    return out;
  }
  function exportJSON() {
    syncDerived();
    var out = clone(board);
    out.as_of = today();
    return JSON.stringify(out, null, 2);
  }
  function handoffBrief() {
    var d = diffVsSeed();
    var lines = ["# Board changes — " + today(), ""];
    if (!d.total) {
      lines.push("No local changes: the board matches the committed JSON.");
      return lines.join("\n");
    }
    lines.push(CFG.briefTitle + ", against the snapshot of " + (SEED.as_of || "?") + ".", "");
    if (d.changed.length) {
      lines.push("## Changed");
      d.changed.forEach(function (ch) {
        var bits = ch.fields.map(function (f) {
          if (f === "notes") return "notes edited";
          if (f === "evidence") return "evidence " + (ch.to.evidence ? "set to " + ch.to.evidence.kind + " " + ch.to.evidence.ref : "cleared");
          var from = f === "home_lane" ? homeOf(ch.from) : ch.from[f];
          return f + ": " + (from == null ? "none" : from) + " -> " + (ch.to[f] == null ? "none" : ch.to[f]);
        });
        lines.push("- **" + ch.id + "** (" + ch.to.title + "): " + bits.join("; "));
      });
      lines.push("");
    }
    if (d.added.length) {
      lines.push("## Added");
      d.added.forEach(function (id) {
        var c = byId(id);
        lines.push("- **" + id + "**: " + c.title + " — " + STATUS_LABEL[c.status] + ", " + KIND_LABEL[homeOf(c)] +
          (c.blocked_on ? ", waiting on " + WHO[c.blocked_on] : ""));
        if (c.notes) lines.push("  - " + String(c.notes).replace(/\s+/g, " "));
      });
      lines.push("");
    }
    if (d.removed.length) { lines.push("## Removed"); d.removed.forEach(function (i) { lines.push("- " + i); }); lines.push(""); }
    if (d.gates.length) {
      lines.push("## Launch gate");
      d.gates.forEach(function (g) { lines.push("- **" + g.id + "**: " + g.from + " -> " + g.to); });
      lines.push("");
    }
    lines.push("Apply to `" + CFG.sourcePath + "`, run `" + CFG.validateCommand + "`, re-render and re-publish the artifact.");
    return lines.join("\n");
  }
  function copyText(text, btn) {
    var ok = function () { if (btn) { var t = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = t; }, 1400); } };
    var fallback = function () {
      try {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); ok();
      } catch (e) {}
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }
  function saveFile(filename, text, btn) {
    var dl = window.claude && window.claude.downloads;
    if (dl && dl.save) {
      dl.save({ filename: filename, data: text }).then(
        function () { toast("Saved " + filename, false); },
        function (err) {
          var code = err && err.code;
          if (code === "declined") return;
          copyText(text, btn);
          toast(code === "unavailable" ? "Download unavailable here — copied instead" : "Download failed — copied instead", false);
        },
      );
      return;
    }
    try {
      var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      var a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 800);
    } catch (e) { copyText(text, btn); }
  }
  function openExport() {
    var json = exportJSON();
    var problems = validate(board);
    var d = diffVsSeed();
    var vlist = problems.length
      ? problems.map(function (p) { return '<li class="warn"><b>' + esc(p.id) + "</b><span>" + esc(p.msg) + "</span></li>"; }).join("")
      : '<li class="ok"><b>VALID</b><span>Passes every rule the repo validator enforces — safe to paste back.</span></li>';
    var changes = d.total
      ? '<ul class="checklist">' +
          d.changed.map(function (ch) { return '<li class="info"><b>' + esc(ch.id) + "</b><span>" + esc(ch.fields.join(", ")) + "</span></li>"; }).join("") +
          d.added.map(function (id) { return '<li class="info"><b>' + esc(id) + "</b><span>added</span></li>"; }).join("") +
          d.removed.map(function (id) { return '<li class="info"><b>' + esc(id) + "</b><span>removed</span></li>"; }).join("") +
          d.gates.map(function (g) { return '<li class="info"><b>' + esc(g.id) + "</b><span>" + esc(g.from + " → " + g.to) + "</span></li>"; }).join("") +
        "</ul>"
      : '<p style="margin:0;font-size:12.5px;color:var(--ink-2)">Nothing has been changed in this browser — the board still matches the committed JSON.</p>';

    var scrim = openModal({
      title: "Export", subtitle: d.total + " local change" + (d.total === 1 ? "" : "s"), wide: true,
      body: '<div class="modal-body">' +
        '<div class="field full"><label>What changed</label>' + changes + "</div>" +
        '<div class="field full"><label>Validator · ' + problems.length + " issue" + (problems.length === 1 ? "" : "s") + "</label>" +
          '<ul class="checklist">' + vlist + "</ul></div>" +
        '<div class="field full"><label>board JSON</label><textarea class="codebox" id="x-json" readonly>' + esc(json) + "</textarea>" +
          '<span class="hint">Paste into ' + esc(CFG.sourcePath) + ', run ' + esc(CFG.validateCommand) + ', then re-render and re-publish.</span></div>' +
      "</div>",
      foot: '<button class="btn" data-act="modal-close">Close</button>' +
        '<button class="btn" id="x-brief">Copy change brief</button><span class="spacer"></span>' +
        '<button class="btn" id="x-file">Download .json</button>' +
        '<button class="btn primary" id="x-copy">Copy JSON</button>',
    });
    copyText(json);
    scrim.querySelector("#x-copy").addEventListener("click", function () {
      var ta = scrim.querySelector("#x-json"); if (ta) ta.select();
      copyText(json, this);
    });
    scrim.querySelector("#x-file").addEventListener("click", function () { saveFile(CFG.exportFilename, json, this); });
    scrim.querySelector("#x-brief").addEventListener("click", function () { copyText(handoffBrief(), this); });
  }
  function confirmReset() {
    var scrim = openModal({
      title: "Discard local changes?", subtitle: "back to the committed JSON",
      body: '<div class="modal-body"><div class="field full"><p style="margin:0;font-size:13px;line-height:1.6">' +
        "Throw away every change made in this browser and reload the board exactly as the repo has it. This cannot be undone.</p></div></div>",
      foot: '<button class="btn" data-act="modal-close">Cancel</button><span class="spacer"></span><button class="btn danger" id="r-go">Discard</button>',
    });
    scrim.querySelector("#r-go").addEventListener("click", function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      board = normalize(clone(SEED));
      basedOnFingerprint = SEED.fingerprint || null;
      undoStack = [];
      closeModal();
      render();
      toast("Reset to the committed board", false);
    });
  }

  /* ------------------------------------------------------- drag and drop -- */
  function dropOnLane(id, lane) {
    var c = byId(id);
    if (!c || laneOf(c) === lane) return;
    if (lane === "shipped") { shipCard(id); return; }
    mutate("Moved " + id + " to " + LANE_LABEL[lane], function () {
      if (lane === "blocked_on_people") {
        c.home_lane = "in_flight";
        c.status = "blocked";
        if (PEOPLE.indexOf(c.blocked_on) < 0) c.blocked_on = OWNER;
      } else {
        c.home_lane = lane;
        if (c.status === "shipped") c.status = "in_flight";
        else if (c.status === "blocked" && lane === "in_flight" && PEOPLE.indexOf(c.blocked_on) >= 0) c.status = "in_flight";
      }
      c.last_checkpoint = today();
    });
  }
  document.addEventListener("dragstart", function (e) {
    var card = e.target.closest && e.target.closest(".card[data-card]");
    if (!card) return;
    dragId = card.getAttribute("data-card");
    card.classList.add("dragging");
    try { e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; } catch (err) {}
  });
  document.addEventListener("dragend", function () {
    dragId = null;
    var d = document.querySelector(".card.dragging");
    if (d) d.classList.remove("dragging");
    Array.prototype.forEach.call(document.querySelectorAll(".lane.drop"), function (l) { l.classList.remove("drop"); });
  });
  document.addEventListener("dragover", function (e) {
    var lane = e.target.closest && e.target.closest(".lane[data-lane]");
    if (!lane || !dragId) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "move"; } catch (err) {}
    if (!lane.classList.contains("drop")) {
      Array.prototype.forEach.call(document.querySelectorAll(".lane.drop"), function (l) { l.classList.remove("drop"); });
      lane.classList.add("drop");
    }
  });
  document.addEventListener("drop", function (e) {
    var lane = e.target.closest && e.target.closest(".lane[data-lane]");
    if (!lane || !dragId) return;
    e.preventDefault();
    var id = dragId;
    dragId = null;
    dropOnLane(id, lane.getAttribute("data-lane"));
  });

  /* -------------------------------------------------------------- events -- */
  function toggleIn(arr, v) {
    var i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v);
  }
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-act]");
    if (!el) return;
    var act = el.getAttribute("data-act");
    var id = el.getAttribute("data-id");
    var gid = el.getAttribute("data-gid");
    var v = el.getAttribute("data-v");
    var c = id ? byId(id) : null;

    switch (act) {
      case "view": ui.view = v; render(); break;
      case "open": openDrawer(id); break;
      case "drawer-close": closeDrawer(); break;
      case "edit": openCardModal(byId(id)); break;
      case "add": openCardModal(null, { home: el.getAttribute("data-lane") === "blocked_on_people" ? "in_flight" : (el.getAttribute("data-lane") || "in_flight") }); break;
      case "delete": confirmDelete(id); break;
      case "ship": shipCard(id); break;
      case "reopen":
        if (c) mutate("Reopened " + id, function () { c.status = "in_flight"; c.last_checkpoint = today(); });
        break;
      case "set-status":
        if (!c) break;
        if (v === "shipped") { shipCard(id); break; }
        mutate(id + " → " + STATUS_LABEL[v], function () {
          c.status = v;
          if (v === "blocked" && !c.blocked_on) c.blocked_on = OWNER;
          c.last_checkpoint = today();
        });
        break;
      case "set-who":
        if (!c) break;
        mutate(id + " waiting on " + (v ? WHO[v] : "nobody"), function () {
          c.blocked_on = v || null;
          if (!v && c.status === "blocked") c.status = "in_flight";
          c.last_checkpoint = today();
        });
        break;
      case "set-home": if (c) mutate(id + " → " + KIND_LABEL[v], function () { c.home_lane = v; }); break;
      case "set-prio": if (c) mutate(id + " priority " + PRIO_LABEL[v], function () { c.priority = v; }); break;
      case "gate-toggle": toggleGate(gid); break;
      case "gate-edit": { var g = gateById(gid); if (g) openGateModal(g); break; }
      case "gate-notes": ui.openGateNotes[gid] = !ui.openGateNotes[gid]; render(); break;
      case "shipped-toggle": ui.shippedOpen = !ui.shippedOpen; render(); break;
      case "ruling-notes": {
        var rid = t.getAttribute("data-rid");
        ui.openRulingNotes[rid] = !ui.openRulingNotes[rid];
        render();
        break;
      }
      case "stat":
        if (el.getAttribute("data-key") === "mine") {
          ui.fWho = ui.fWho.length === 1 && ui.fWho[0] === OWNER ? [] : [OWNER];
          ui.fStatus = [];
        } else {
          var k = el.getAttribute("data-key");
          ui.fStatus = ui.fStatus.length === 1 && ui.fStatus[0] === k ? [] : [k];
          ui.fWho = [];
        }
        render();
        break;
      case "f-status": toggleIn(ui.fStatus, v); render(); break;
      case "f-who": toggleIn(ui.fWho, v); render(); break;
      case "f-prio": toggleIn(ui.fPrio, v); render(); break;
      case "clear-filters": ui.q = ""; ui.fStatus = []; ui.fWho = []; ui.fPrio = []; render(); break;
      case "sort": {
        var key = el.getAttribute("data-k");
        if (ui.sort.key === key) ui.sort.dir = -ui.sort.dir; else ui.sort = { key: key, dir: 1 };
        render();
        break;
      }
      case "export": openExport(); break;
      case "reset": confirmReset(); break;
      case "take-seed":
        try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
        board = normalize(clone(SEED));
        // PL-28: adopt the publish's provenance too, or the notice would come
        // straight back on the board the user just chose to load.
        basedOnFingerprint = SEED.fingerprint || null;
        undoStack = [];
        render();
        toast("Loaded the published board (" + SEED.as_of + ")", false);
        break;
      case "dismiss-notice": seedNoticeDismissed = true; render(); break;
      case "undo": undo(); break;
      case "modal-close": closeModal(); break;
    }
  });

  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "q") {
      ui.q = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var again = document.getElementById("q");
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) {} }
    }
  });

  document.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "");
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if (e.key === "Escape") {
      if (modal) closeModal();
      else if (drawerId) closeDrawer();
      else if (typing && e.target.id === "q") { ui.q = ""; render(); }
      return;
    }
    if (typing) return;
    if (e.key === "/") { e.preventDefault(); var q = document.getElementById("q"); if (q) q.focus(); return; }
    if (e.key === "n") { e.preventDefault(); openCardModal(null, { home: "in_flight" }); return; }
    if (e.key === "e") { e.preventDefault(); openExport(); return; }
    if (e.key === "u") { e.preventDefault(); undo(); return; }
    // DERIVED FROM VIEWS, not a hand-written list. The literal ["1".."5"] was
    // already one view short the moment a sixth was added, and a number key that
    // silently does nothing is indistinguishable from a broken keyboard.
    var i = VIEWS.map(function (_, n) { return String(n + 1); }).indexOf(e.key);
    if (i >= 0 && VIEWS[i]) { ui.view = VIEWS[i].id; render(); }
  });

  /* ---------------------------------------------------------------- boot -- */
  loadUi();
  board = load();
  render();
})();
