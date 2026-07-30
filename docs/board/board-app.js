/* board-app.js - client runtime for the interactive Pre-Launch Board artifact.
   Inlined verbatim into the rendered HTML by render-board.mjs. Self-contained,
   no external requests. Seeds from the #board-data island (the committed JSON),
   holds edits in localStorage, and mirrors docs/board/validate-board.mjs so the
   Export panel tells you whether a paste-back would pass the repo validator.
   The repo JSON stays the source of truth; this never writes back to it. */
(function () {
  "use strict";

  var seedEl = document.getElementById("board-data");
  var SEED = JSON.parse(seedEl.textContent);
  var STORAGE_KEY =
    "osteojp-board:" + (SEED.board || "board") + ":v" + (SEED.schema_version || 1);

  var LANES = ["blocked_on_people", "in_flight", "rodica_batch", "incidents", "loose_ends", "shipped"];
  var LANE_LABEL = {
    blocked_on_people: "Blocked on people", in_flight: "In flight", rodica_batch: "Rodica batch",
    incidents: "Incidents", loose_ends: "Loose ends", shipped: "Shipped",
  };
  var STATUS = {
    todo: { pill: "To do", cls: "t-todo" },
    in_flight: { pill: "In flight", cls: "t-inflight" },
    blocked: { pill: "Blocked", cls: "t-blocked" },
    halted: { pill: "Halted", cls: "t-halted" },
    shipped: { pill: "Shipped", cls: "t-shipped" },
  };
  var STATUS_ORDER = ["todo", "in_flight", "blocked", "halted", "shipped"];
  var GATE_BADGE = {
    owner_merge: { label: "Owner merge", cls: "" },
    owner_authorizo: { label: "AUTORIZO", cls: "autorizo" },
    stakeholder: { label: "Stakeholder", cls: "stakeholder" },
    green_self_merge: { label: "Self-merge", cls: "selfmerge" },
    cyan_clear: { label: "CYAN", cls: "cyan" },
  };
  var GATE_ORDER = ["green_self_merge", "cyan_clear", "owner_merge", "owner_authorizo", "stakeholder"];
  var WHO = { ivan: "Ivan", jp: "JP", rodica: "Rodica", infra: "Infra" };
  var WHO_ORDER = [null, "ivan", "jp", "rodica", "infra"];
  var EV_KIND = ["pr", "journal", "sha256", "e2e", "screenshot"];
  var PRIO = ["high", "medium", "low"];
  var PRIO_LABEL = { high: "High", medium: "Medium", low: "Low" };
  var ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

  var board;
  var ui = { shippedOpen: false };
  var activeModal = null;

  // ---- utilities ------------------------------------------------------------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function dateOnly(v) {
    if (typeof v !== "string") return "";
    var m = v.match(/^\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : "";
  }
  function daysSince(iso) {
    if (!iso) return 0;
    var d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T00:00:00Z" : iso);
    if (isNaN(d.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  }
  function isIso(v) { return typeof v === "string" && ISO_RE.test(v) && !isNaN(Date.parse(v)); }

  function normalize(b) {
    (b.cards || []).forEach(function (c) { if (!c.priority) c.priority = "medium"; });
    return b;
  }
  function hasLocal() { try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; } }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (raw) { try { return normalize(JSON.parse(raw)); } catch (e) {} }
    return normalize(clone(SEED));
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(board)); } catch (e) {}
    render();
  }

  function cardsIn(lane) { return (board.cards || []).filter(function (c) { return c.lane === lane; }); }
  function findCard(id) { return (board.cards || []).filter(function (c) { return c.id === id; })[0]; }
  function findGate(id) {
    return (((board.launch_gate || {}).conditions) || []).filter(function (g) { return g.id === id; })[0];
  }
  function syncReadiness() {
    var lg = board.launch_gate; if (!lg) return;
    lg.readiness_passed = (lg.conditions || []).filter(function (g) { return g.state === "pass"; }).length;
  }
  function suggestId() {
    var n = 1, ids = {};
    (board.cards || []).forEach(function (c) { ids[c.id] = 1; });
    while (ids["NEW-" + n]) n++;
    return "NEW-" + n;
  }

  // ---- small render helpers -------------------------------------------------
  function options(list, current, labelFn) {
    return list.map(function (v) {
      var val = v === null ? "" : v;
      var lbl = labelFn ? labelFn(v) : (v === null ? "(none)" : v);
      var sel = (v === current || (v === null && (current == null || current === ""))) ? " selected" : "";
      return '<option value="' + esc(val) + '"' + sel + ">" + esc(lbl) + "</option>";
    }).join("");
  }
  function whoBadge(w) { return (w && WHO[w]) ? '<span class="who ' + w + '">' + esc(WHO[w]) + "</span>" : ""; }
  function gateBadge(g) { var b = GATE_BADGE[g] || { label: g, cls: "" }; return '<span class="gate-badge ' + b.cls + '">' + esc(b.label) + "</span>"; }
  function evidenceSlot(ev) {
    if (!ev) return '<span class="ev empty">no evidence</span>';
    var kind = ev.kind === "pr" ? "PR " : ev.kind === "journal" ? "journal " : ev.kind === "sha256" ? "sha256 " : ev.kind === "e2e" ? "e2e " : "";
    return '<span class="ev"><b>' + esc(kind) + esc(ev.ref) + "</b>" + (ev.at ? " · " + esc(ev.at) : "") + "</span>";
  }
  function statusOptions(cur) { return options(STATUS_ORDER, cur, function (s) { return STATUS[s].pill; }); }
  function prioOptions(cur) { return options(PRIO, cur, function (p) { return PRIO_LABEL[p]; }); }
  function addBtn(lane, who) {
    return '<button class="addcard" data-action="add" data-lane="' + esc(lane) + '"' +
      (who ? ' data-who="' + esc(who) + '"' : "") + ">+ Add item</button>";
  }

  // ---- tile -----------------------------------------------------------------
  function tileHTML(c, mini) {
    var st = STATUS[c.status] || { pill: c.status, cls: "" };
    var prio = c.priority || "medium";
    var wait = c.lane === "blocked_on_people"
      ? '<span class="wait" title="waiting since ' + esc(c.last_checkpoint) + '" style="margin-left:auto">' + daysSince(c.last_checkpoint) + "d</span>" : "";
    return '<div class="tile ' + (mini ? "mini " : "") + esc(st.cls) + '" data-card="' + esc(c.id) + '">' +
      '<div class="top">' +
        '<span class="id">' + esc(c.id) + "</span>" +
        '<span class="pill">' + esc(st.pill) + "</span>" +
        '<span class="prio ' + esc(prio) + '">' + esc(PRIO_LABEL[prio] || prio) + "</span>" +
        wait +
      "</div>" +
      '<div class="ttl">' + esc(c.title) + "</div>" +
      (c.notes ? '<div class="notes">' + esc(c.notes) + "</div>" : "") +
      '<div class="foot">' + gateBadge(c.gate) + whoBadge(c.blocked_on) + evidenceSlot(c.evidence) + "</div>" +
      '<div class="ctrls">' +
        '<div class="sel-wrap"><label>Status</label><select class="sel" data-action="status" data-id="' + esc(c.id) + '" aria-label="Status for ' + esc(c.id) + '">' + statusOptions(c.status) + "</select></div>" +
        '<div class="sel-wrap"><label>Priority</label><select class="sel" data-action="priority" data-id="' + esc(c.id) + '" aria-label="Priority for ' + esc(c.id) + '">' + prioOptions(prio) + "</select></div>" +
        '<span class="grow"></span>' +
        '<button class="iconbtn done" data-action="done" data-id="' + esc(c.id) + '" title="Mark as done (status = shipped)">Done</button>' +
        '<button class="iconbtn" data-action="edit" data-id="' + esc(c.id) + '" title="Edit this item">Edit</button>' +
        '<button class="iconbtn del" data-action="delete" data-id="' + esc(c.id) + '" title="Delete this item">Delete</button>' +
      "</div>" +
    "</div>";
  }

  // ---- sections -------------------------------------------------------------
  function toolbarHTML() {
    return '<div class="toolbar">' +
      '<span class="tb-title">Pre-Launch Board · interactive</span>' +
      '<span class="saved"></span>' +
      '<button class="btn primary" data-action="tb-add"><span class="ic">+</span> Add item</button>' +
      '<button class="btn" data-action="tb-export">Export JSON</button>' +
      '<button class="btn danger" data-action="tb-reset">Reset to saved</button>' +
    "</div>";
  }
  function headerHTML(passed, denom) {
    var shipped = cardsIn("shipped").length, inflight = cardsIn("in_flight").length, bop = cardsIn("blocked_on_people").length;
    return "<header>" +
      '<div class="eyebrow">OsteoJP · Pre-Launch · GREEN executor</div>' +
      "<h1>Pre-Launch Board</h1>" +
      '<p class="sub">Interactive render of <code>docs/board/prelaunch-board.json</code>. Edits are held in your browser (localStorage); the repo JSON stays the source of truth until you <b>Export</b> and paste changes back. <b>Two separate meters:</b> the lanes track DELIVERY work; the Launch Gate tracks 9 go-live conditions (human/prod actions), so it stays low until those people act - it is NOT a percentage of build work.</p>' +
      '<div class="live"><span class="dot"></span> Snapshot ' + esc(board.as_of || "") + " · <b>" + shipped + " shipped</b> · " + inflight + " in flight · " + bop + " blocked on people · launch gate " + passed + "/" + denom + "</div>" +
    "</header>";
  }
  function gateHTML(conds, passed, denom, pct) {
    var chips = conds.map(function (g) {
      var pass = g.state === "pass";
      return '<div class="gate ' + (pass ? "pass" : "fail") + '">' +
        '<div class="gt"><span class="gid">' + esc(g.id) + "</span>" +
          '<button class="gs" data-action="gate-toggle" data-gid="' + esc(g.id) + '" title="Toggle pass / fail">' + (pass ? "PASS" : "FAIL") + "</button></div>" +
        '<div class="gtt">' + esc(g.title) + "</div>" +
        '<div class="gm">' + whoBadge(g.blocked_on) + evidenceSlot(g.evidence) +
          '<button class="gedit" data-action="gate-edit" data-gid="' + esc(g.id) + '">edit</button></div>' +
      "</div>";
    }).join("");
    return '<div class="gate-wrap">' +
      '<div class="gate-head' + (passed === denom ? " complete" : "") + '">' +
        '<span class="lbl">Launch gate</span>' +
        '<span class="read"><b>' + passed + "</b> / " + denom + " passed</span>" +
        '<span class="note">Counted, never estimated. No partial credit: each condition is pass or fail, fail-closed until its evidence exists.</span>' +
      "</div>" +
      '<div class="readbar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="gates">' + chips + "</div>" +
    "</div>";
  }
  function peopleCol(person) {
    var cards = cardsIn("blocked_on_people").filter(function (c) { return c.blocked_on === person; });
    var lg = board.launch_gate || { conditions: [] };
    var load = (lg.conditions || []).filter(function (g) { return g.blocked_on === person && g.state === "fail"; }).map(function (g) { return g.id; });
    var body = cards.length
      ? cards.map(function (c) { return tileHTML(c, true); }).join("")
      : '<div class="none">No card blocked directly on ' + esc(WHO[person]) + "." + (load.length ? " Launch-gate load: " + esc(load.join(", ")) + "." : "") + "</div>";
    return '<div class="pcol ' + person + '"><div class="ph">' + esc(WHO[person]) + "</div>" +
      '<div class="board">' + body + "</div>" + addBtn("blocked_on_people", person) + "</div>";
  }
  function peopleHTML() {
    return '<h2>Blocked on people <span class="ct">· answer latency made visible</span></h2>' +
      '<div class="people">' + ["ivan", "jp", "rodica"].map(peopleCol).join("") + "</div>";
  }
  function laneHTML(lane, title, ctPrefix) {
    var cards = cardsIn(lane);
    var tiles = cards.length ? cards.map(function (c) { return tileHTML(c, false); }).join("") : "";
    return "<h2>" + esc(title) + ' <span class="ct">· ' + (ctPrefix || "") + cards.length + "</span></h2>" +
      '<div class="board">' + tiles + addBtn(lane) + "</div>";
  }
  function shippedHTML() {
    var cards = cardsIn("shipped");
    var tiles = cards.map(function (c) { return tileHTML(c, false); }).join("");
    return "<h2>Shipped</h2><details class=\"shipped\"" + (ui.shippedOpen ? " open" : "") + ">" +
      "<summary>Shipped · " + cards.length + " (every card carries evidence, guaranteed by the validator)</summary>" +
      '<div class="board">' + tiles + addBtn("shipped") + "</div></details>";
  }
  function footerHTML(passed, denom) {
    return "<footer><span class=\"mono\">osteojp · pre-launch board · interactive artifact</span>" +
      "<span>Source: docs/board/prelaunch-board.json · rendered by render-board.mjs · readiness " + passed + "/" + denom + "</span></footer>";
  }

  function updateSavedLabel() {
    var el = document.querySelector(".saved"); if (!el) return;
    if (hasLocal()) { el.textContent = "Local edits saved"; el.classList.add("dirty"); }
    else { el.textContent = "Seeded from JSON"; el.classList.remove("dirty"); }
  }

  // ---- top-level render -----------------------------------------------------
  function render() {
    var app = document.getElementById("app");
    var lg = board.launch_gate || { conditions: [] };
    var conds = lg.conditions || [];
    var passed = conds.filter(function (g) { return g.state === "pass"; }).length;
    var denom = lg.denominator || 9;
    var pct = denom ? Math.round((passed / denom) * 100) : 0;

    app.innerHTML =
      toolbarHTML() +
      headerHTML(passed, denom) +
      gateHTML(conds, passed, denom, pct) +
      peopleHTML() +
      laneHTML("in_flight", "In flight") +
      laneHTML("rodica_batch", "Rodica batch", "live inbox · ") +
      laneHTML("incidents", "Incidents") +
      laneHTML("loose_ends", "Loose ends") +
      shippedHTML() +
      footerHTML(passed, denom);

    var det = document.querySelector("details.shipped");
    if (det) det.addEventListener("toggle", function () { ui.shippedOpen = det.open; });
    updateSavedLabel();
  }

  // ---- modal infrastructure -------------------------------------------------
  function openModal(opts) {
    closeModal();
    var scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
        '<div class="modal-head"><div><h3>' + esc(opts.title) + "</h3>" +
          (opts.subtitle ? '<div class="subh">' + esc(opts.subtitle) + "</div>" : "") + "</div>" +
          '<button class="modal-x" data-action="modal-close" aria-label="Close">×</button></div>' +
        '<div class="modal-note" hidden></div>' +
        opts.body +
        (opts.foot ? '<div class="modal-foot">' + opts.foot + "</div>" : "") +
      "</div>";
    document.body.appendChild(scrim);
    scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) closeModal(); });
    activeModal = scrim;
    var f = scrim.querySelector("input,select,textarea,button:not(.modal-x)");
    if (f) f.focus();
    return scrim;
  }
  function closeModal() { if (activeModal) { activeModal.remove(); activeModal = null; } }
  function modalNote(scrim, msg) {
    var n = scrim.querySelector(".modal-note");
    if (!n) return;
    if (msg) { n.textContent = msg; n.hidden = false; } else { n.hidden = true; }
  }
  function field(cls, label, inner) {
    return '<div class="field ' + (cls || "") + '"><label>' + esc(label) + "</label>" + inner + "</div>";
  }
  function evidenceRow(pfx, ev) {
    ev = ev || {};
    return '<div class="field full"><label>Evidence</label>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
        '<select id="' + pfx + 'evkind" style="min-width:120px;flex:none">' +
          options([null].concat(EV_KIND), ev.kind, function (k) { return k === null ? "(no evidence)" : k; }) + "</select>" +
        '<input id="' + pfx + 'evref" type="text" placeholder="ref (PR #, sha256, path)" value="' + esc(ev.ref || "") + '" style="flex:1;min-width:150px" />' +
        '<input id="' + pfx + 'evat" type="date" value="' + esc(dateOnly(ev.at)) + '" style="flex:none;width:150px" />' +
      "</div>" +
      '<span class="hint">Set kind to "(no evidence)" to clear. Shipped cards and PASS gates need evidence to pass the validator.</span></div>';
  }
  function readEvidence(scrim, pfx, original) {
    var kind = scrim.querySelector("#" + pfx + "evkind").value;
    if (!kind) return null;
    var ref = scrim.querySelector("#" + pfx + "evref").value.trim();
    var at = scrim.querySelector("#" + pfx + "evat").value;
    if (original && original.at && dateOnly(original.at) === at) at = original.at; // preserve full timestamp if unchanged
    return { kind: kind, ref: ref, at: at || today() };
  }

  // ---- card add / edit ------------------------------------------------------
  function openCardModal(card, defaults) {
    defaults = defaults || {};
    var isNew = !card;
    var c = card
      ? clone(card)
      : { id: suggestId(), title: "", lane: defaults.lane || "in_flight", status: "todo",
          owner_terminal: "", gate: "owner_merge", evidence: null,
          blocked_on: defaults.blocked_on || null, last_checkpoint: today(), notes: "", priority: "medium" };
    var body = '<div class="modal-body">' +
      field("full", "ID", '<input id="f-id" type="text" value="' + esc(c.id) + '" />') +
      field("full", "Title / text", '<input id="f-title" type="text" value="' + esc(c.title) + '" />') +
      field("", "Lane", '<select id="f-lane">' + options(LANES, c.lane, function (l) { return LANE_LABEL[l]; }) + "</select>") +
      field("", "Status", '<select id="f-status">' + statusOptions(c.status) + "</select>") +
      field("", "Priority", '<select id="f-priority">' + prioOptions(c.priority) + "</select>") +
      field("", "Blocked on", '<select id="f-blocked">' + options(WHO_ORDER, c.blocked_on, function (w) { return w === null ? "(none)" : WHO[w]; }) + "</select>") +
      field("", "Owner terminal", '<input id="f-owner" type="text" value="' + esc(c.owner_terminal) + '" placeholder="green / cyan / ivan ..." />') +
      field("", "Gate", '<select id="f-gate">' + options(GATE_ORDER, c.gate, function (g) { return GATE_BADGE[g].label; }) + "</select>") +
      field("full", "Last checkpoint", '<input id="f-checkpoint" type="date" value="' + esc(dateOnly(c.last_checkpoint) || today()) + '" />') +
      evidenceRow("f-", c.evidence) +
      field("full", "Notes", '<textarea id="f-notes">' + esc(c.notes) + "</textarea>") +
    "</div>";
    var foot = '<button class="btn" data-action="modal-close">Cancel</button><span class="spacer"></span>' +
      '<button class="btn primary" id="f-save">' + (isNew ? "Add item" : "Save changes") + "</button>";
    var scrim = openModal({ title: isNew ? "Add item" : "Edit item", subtitle: isNew ? "new card" : c.id, body: body, foot: foot });
    scrim.querySelector("#f-save").addEventListener("click", function () { saveCardModal(scrim, card); });
  }
  function saveCardModal(scrim, original) {
    var v = function (id) { var el = scrim.querySelector("#" + id); return el ? el.value : ""; };
    var id = v("f-id").trim();
    var title = v("f-title").trim();
    var others = (board.cards || []).filter(function (c) { return c !== original; }).map(function (c) { return c.id; });
    scrim.querySelector("#f-id").parentNode.classList.remove("err");
    scrim.querySelector("#f-title").parentNode.classList.remove("err");
    if (!id) { scrim.querySelector("#f-id").parentNode.classList.add("err"); modalNote(scrim, "ID is required."); return; }
    if (others.indexOf(id) >= 0) { scrim.querySelector("#f-id").parentNode.classList.add("err"); modalNote(scrim, 'ID "' + id + '" is already used by another card.'); return; }
    if (!title) { scrim.querySelector("#f-title").parentNode.classList.add("err"); modalNote(scrim, "Title is required."); return; }

    var card = {
      id: id, title: title, lane: v("f-lane"), status: v("f-status"),
      owner_terminal: v("f-owner").trim(), gate: v("f-gate"),
      evidence: readEvidence(scrim, "f-", original && original.evidence),
      blocked_on: v("f-blocked") || null,
      last_checkpoint: v("f-checkpoint") || today(),
      notes: v("f-notes"), priority: v("f-priority") || "medium",
    };
    if (original) { board.cards[board.cards.indexOf(original)] = card; }
    else { board.cards = board.cards || []; board.cards.push(card); }
    closeModal(); save();
  }

  // ---- gate edit ------------------------------------------------------------
  function openGateModal(g) {
    var body = '<div class="modal-body">' +
      field("full", "Gate", '<input type="text" value="' + esc(g.id) + '" disabled />') +
      field("full", "Title", '<input id="g-title" type="text" value="' + esc(g.title) + '" />') +
      field("", "State", '<select id="g-state">' + options(["fail", "pass"], g.state, function (s) { return s.toUpperCase(); }) + "</select>") +
      field("", "Blocked on", '<select id="g-blocked">' + options(WHO_ORDER, g.blocked_on, function (w) { return w === null ? "(none)" : WHO[w]; }) + "</select>") +
      evidenceRow("g-", g.evidence) +
      field("full", "Notes", '<textarea id="g-notes">' + esc(g.notes) + "</textarea>") +
    "</div>";
    var foot = '<button class="btn" data-action="modal-close">Cancel</button><span class="spacer"></span><button class="btn primary" id="g-save">Save gate</button>';
    var scrim = openModal({ title: "Edit launch gate", subtitle: g.id, body: body, foot: foot });
    scrim.querySelector("#g-save").addEventListener("click", function () {
      g.title = scrim.querySelector("#g-title").value.trim() || g.title;
      g.state = scrim.querySelector("#g-state").value;
      g.blocked_on = scrim.querySelector("#g-blocked").value || null;
      g.evidence = readEvidence(scrim, "g-", g.evidence);
      g.notes = scrim.querySelector("#g-notes").value;
      syncReadiness(); closeModal(); save();
    });
  }

  // ---- confirms -------------------------------------------------------------
  function confirmDelete(id) {
    var c = findCard(id); if (!c) return;
    var scrim = openModal({
      title: "Delete item?", subtitle: id,
      body: '<div class="modal-body"><div class="field full"><p style="margin:0;font-size:13.5px">Delete <b>' + esc(id) + '</b> - "' + esc(c.title) + '"? This removes it from your local board only. The repo JSON is untouched until you Export and paste changes back.</p></div></div>',
      foot: '<button class="btn" data-action="modal-close">Cancel</button><span class="spacer"></span><button class="btn danger" id="c-del">Delete</button>',
    });
    scrim.querySelector("#c-del").addEventListener("click", function () {
      board.cards = (board.cards || []).filter(function (x) { return x.id !== id; });
      closeModal(); save();
    });
  }
  function confirmReset() {
    var scrim = openModal({
      title: "Reset to saved JSON?", subtitle: "discard local edits",
      body: '<div class="modal-body"><div class="field full"><p style="margin:0;font-size:13.5px">Discard every interactive edit and reload the board from the committed <code>prelaunch-board.json</code> seed. This clears the local saved copy in this browser.</p></div></div>',
      foot: '<button class="btn" data-action="modal-close">Cancel</button><span class="spacer"></span><button class="btn danger" id="c-reset">Reset</button>',
    });
    scrim.querySelector("#c-reset").addEventListener("click", function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      board = normalize(clone(SEED)); closeModal(); render();
    });
  }

  // ---- export + client-side validator mirror --------------------------------
  function evOK(id, ev, push) {
    if (ev == null) return false;
    if (typeof ev !== "object" || Array.isArray(ev)) { push(id, "evidence must be null or an object"); return false; }
    var ok = true;
    if (EV_KIND.indexOf(ev.kind) < 0) { push(id, 'evidence.kind "' + ev.kind + '" invalid'); ok = false; }
    if (typeof ev.ref !== "string" || !ev.ref.trim()) { push(id, "evidence.ref must be a non-empty string"); ok = false; }
    if (!isIso(ev.at)) { push(id, 'evidence.at "' + ev.at + '" is not ISO 8601'); ok = false; }
    return ok;
  }
  function validateBoard(b) {
    var out = [], push = function (id, msg) { out.push({ id: id, msg: msg }); };
    var LANES_ALL = ["launch_gate"].concat(LANES);
    var lg = b.launch_gate || {}, conds = lg.conditions || [];
    if (lg.denominator !== 9) push("launch_gate", "denominator must be 9, got " + lg.denominator);
    if (conds.length !== 9) push("launch_gate", "expected 9 conditions, got " + conds.length);
    var gids = {}, passed = 0;
    conds.forEach(function (g) {
      var id = g.id || "G?";
      if (gids[id]) push("launch_gate", "duplicate gate id " + id);
      gids[id] = 1;
      if (["pass", "fail"].indexOf(g.state) < 0) { push(id, 'state "' + g.state + '" not pass|fail'); return; }
      if (WHO_ORDER.indexOf(g.blocked_on == null ? null : g.blocked_on) < 0) push(id, 'blocked_on "' + g.blocked_on + '" invalid');
      var has = evOK(id, g.evidence == null ? null : g.evidence, push);
      if (g.state === "pass") { passed++; if (!has) push(id, "gate is PASS but evidence is null"); }
    });
    if (typeof lg.readiness_passed === "number" && lg.readiness_passed !== passed)
      push("launch_gate", "readiness_passed says " + lg.readiness_passed + " but " + passed + " are pass");
    var cards = b.cards || [], seen = {};
    cards.forEach(function (c) {
      var id = c.id || "card?";
      if (seen[id]) push(id, "duplicate card id");
      seen[id] = 1;
      if (typeof c.title !== "string" || !c.title.trim()) push(id, "title must be a non-empty string");
      if (LANES_ALL.indexOf(c.lane) < 0) push(id, 'lane "' + c.lane + '" is not a known lane');
      if (c.lane === "launch_gate") push(id, "cards may not live in the launch_gate lane");
      if (STATUS_ORDER.indexOf(c.status) < 0) push(id, 'status "' + c.status + '" invalid');
      if (GATE_ORDER.indexOf(c.gate) < 0) push(id, 'gate "' + c.gate + '" invalid');
      if (WHO_ORDER.indexOf(c.blocked_on == null ? null : c.blocked_on) < 0) push(id, 'blocked_on "' + c.blocked_on + '" invalid');
      if (!isIso(c.last_checkpoint)) push(id, 'last_checkpoint "' + c.last_checkpoint + '" is not ISO 8601');
      var has = evOK(id, c.evidence == null ? null : c.evidence, push);
      if (c.status === "shipped" && !has) push(id, "status=shipped but evidence is null");
      if (c.status === "blocked" && c.blocked_on == null) push(id, "status=blocked but blocked_on is null");
      if (c.lane === "blocked_on_people" && ["ivan", "jp", "rodica"].indexOf(c.blocked_on) < 0)
        push(id, "lane=blocked_on_people requires blocked_on in ivan|jp|rodica");
    });
    return out;
  }
  function copyText(text, btn) {
    var done = function () { if (btn) { var t = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = t; }, 1400); } };
    var fb = function () {
      try {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done();
      } catch (e) {}
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb);
    else fb();
  }
  function downloadJSON(text) {
    try {
      var blob = new Blob([text], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "prelaunch-board.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {}
  }
  function openExportModal() {
    syncReadiness();
    var json = JSON.stringify(board, null, 2);
    var problems = validateBoard(board);
    var vlist = problems.length
      ? problems.map(function (p) { return '<li class="warn"><b>' + esc(p.id) + '</b><span>' + esc(p.msg) + "</span></li>"; }).join("")
      : '<li class="ok"><b>OK</b><span>Passes the board validator - safe to paste into docs/board/prelaunch-board.json.</span></li>';
    var body = '<div class="modal-body">' +
      '<div class="field full"><label>Validator mirror · ' + problems.length + " issue" + (problems.length === 1 ? "" : "s") + '</label><ul class="valid-list">' + vlist + "</ul></div>" +
      '<div class="field full"><label>board JSON</label><textarea class="export-ta" id="export-ta" readonly>' + esc(json) + "</textarea>" +
      '<span class="hint">Auto-copied to your clipboard. Paste into <code>docs/board/prelaunch-board.json</code>, then run <code>node docs/board/validate-board.mjs</code>.</span></div>' +
    "</div>";
    var foot = '<button class="btn" data-action="modal-close">Close</button><span class="spacer"></span>' +
      '<button class="btn" id="export-download">Download .json</button>' +
      '<button class="btn primary" id="export-copy">Copy JSON</button>';
    var scrim = openModal({ title: "Export board JSON", subtitle: "client-side snapshot", body: body, foot: foot });
    var ta = scrim.querySelector("#export-ta");
    copyText(json);
    scrim.querySelector("#export-copy").addEventListener("click", function () { if (ta) ta.select(); copyText(json, this); });
    scrim.querySelector("#export-download").addEventListener("click", function () { downloadJSON(json); });
  }

  // ---- delegated events -----------------------------------------------------
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-action]") : null;
    if (!el) return;
    var action = el.getAttribute("data-action");
    var id = el.getAttribute("data-id");
    var gid = el.getAttribute("data-gid");
    switch (action) {
      case "done": { var c = findCard(id); if (c) { c.status = "shipped"; c.last_checkpoint = today(); save(); } break; }
      case "edit": openCardModal(findCard(id)); break;
      case "delete": confirmDelete(id); break;
      case "add": openCardModal(null, { lane: el.getAttribute("data-lane"), blocked_on: el.getAttribute("data-who") || null }); break;
      case "gate-toggle": { var g = findGate(gid); if (g) { g.state = g.state === "pass" ? "fail" : "pass"; syncReadiness(); save(); } break; }
      case "gate-edit": { var gg = findGate(gid); if (gg) openGateModal(gg); break; }
      case "tb-add": openCardModal(null, { lane: "in_flight" }); break;
      case "tb-export": openExportModal(); break;
      case "tb-reset": confirmReset(); break;
      case "modal-close": closeModal(); break;
    }
  });
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (!el || !el.matches || !el.matches("select[data-action]")) return;
    var action = el.getAttribute("data-action"), id = el.getAttribute("data-id");
    if (action === "status") { var c = findCard(id); if (c) { c.status = el.value; c.last_checkpoint = today(); save(); } }
    else if (action === "priority") { var cc = findCard(id); if (cc) { cc.priority = el.value; save(); } }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  // ---- boot -----------------------------------------------------------------
  board = load();
  render();
})();
