// The page draws what the core returns and decides nothing. It loads the
// data files, starts the core through the shim, passes the clock, keys and
// mouse in each display frame, builds the menus and HUD from the core's
// view model, draws the 3D frame and plays the sounds the core names.
import init, { Game, numbers, mesh, uniforms, clear_colour } from "./pkg/tool_shim.js?v=cncmgljlkmia";
import { makeRenderer } from "./gl.js?v=cncmgljlkmia";

const SAVE_KEY = "ape-race.settings";
// The kept replays (TRIAGE T15) live under their own key: the core writes
// and reads the text, the page only stores it.
const REPLAYS_KEY = "ape-race.replays";
const el = (id) => document.getElementById(id);
const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function readStore(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch (e) {
    return "";
  }
}

// Whether the text was stored. A failed write leaves what was there before.
function writeStore(key, text) {
  try {
    localStorage.setItem(key, text);
    return true;
  } catch (e) {
    // Storage can be blocked or full; settings then last for this visit only.
    return false;
  }
}

let game;
let ui = null;
let panelsText = "";
const canvas = el("view");

// ---- menus, from the core's panels ----

function send(id, value) {
  game.act(id, value);
  afterAct();
}

// A click that takes the player back into the race (Start, Resume,
// Restart) captures the mouse again, so the camera can be turned at once
// (TRIAGE row 3). Automated browsers are left alone: a pointer-lock request
// from a menu click stalls headless Chromium (SECOND-ORDER R2).
function afterAct() {
  ui = JSON.parse(game.ui());
  handle(ui);
  if (ui.want_pointer && document.pointerLockElement !== canvas && !navigator.webdriver) lockPointer();
}

function button(item) {
  const b = make("button", item.quiet ? "button quiet" : "button", item.text);
  b.type = "button";
  b.id = item.id;
  b.disabled = item.disabled === true;
  b.addEventListener("click", () => send(item.id, ""));
  return b;
}

// A text field (one line, or several for a pasted code). Each keystroke goes
// to the core; drawMenus keeps the focus and caret across the rebuild.
function field(item) {
  const wrap = make("div", "field text-field");
  const label = make("label", "", item.label);
  const input = make(item.multiline ? "textarea" : "input");
  input.id = item.id;
  input.value = item.value;
  if (item.placeholder) input.placeholder = item.placeholder;
  input.spellcheck = false;
  label.htmlFor = item.id;
  input.addEventListener("input", () => send(item.id, input.value));
  wrap.append(label, input);
  return wrap;
}

// A code and its Copy button: the core gives the text; putting it on the
// clipboard is the page's job.
function copy(item) {
  const wrap = make("div", "field copy-field");
  const code = make("span", "copy-code", item.value);
  code.id = item.id + ".code";
  const b = make("button", "button quiet", item.text);
  b.type = "button";
  b.id = item.id;
  b.disabled = item.disabled === true;
  b.addEventListener("click", () => {
    if (navigator.clipboard) navigator.clipboard.writeText(item.copy).catch(() => {});
    send(item.id, "");
  });
  // a bare copy is the button alone (the invite link is not shown)
  if (item.bare) return b;
  wrap.append(make("label", "", item.label), code, b);
  return wrap;
}

function picker(item) {
  const box = make("div", "picker");
  const prev = make("button", "", "‹");
  prev.type = "button";
  prev.id = item.id + ".prev";
  prev.addEventListener("click", () => send(item.id + ".prev", ""));
  const next = make("button", "", "›");
  next.type = "button";
  next.id = item.id + ".next";
  next.addEventListener("click", () => send(item.id + ".next", ""));
  const name = make("div", "name", item.text);
  name.id = item.id;
  box.append(prev, name, next);
  return box;
}

function stats(item) {
  const box = make("div", "stats");
  item.rows.forEach((row) => {
    const line = make("div", "stat");
    const pips = make("div", "pips");
    for (let k = 0; k < row.max; k += 1) pips.append(make("span", k < row.value ? "pip on" : "pip"));
    line.append(make("span", "label", row.label), pips);
    box.append(line);
  });
  return box;
}

function select(item) {
  const wrap = make("div", "field");
  const label = make("label", "", item.label);
  const input = make("select");
  item.options.forEach((o) => {
    const opt = make("option", "", o.text);
    opt.value = o.value;
    input.append(opt);
  });
  input.value = item.value;
  input.id = item.id;
  label.htmlFor = item.id;
  input.addEventListener("change", () => send(item.id, input.value));
  wrap.append(label, input);
  return wrap;
}

// A grid of picture cards, one per choice (TRIAGE T54: the maps). The core
// gives each card's id, picture, name and whether it is the chosen one; a
// read-only grid (a joiner's lobby) shows the pick and presses nothing.
// The arrow keys move between cards; Enter or Space presses one.
function tiles(item) {
  const wrap = make("div", "tiles-field");
  wrap.append(make("span", "tiles-label", item.label));
  const grid = make("div", item.read_only ? "tiles read-only" : "tiles");
  grid.id = item.id;
  grid.dataset.value = item.value;
  grid.setAttribute("role", "radiogroup");
  grid.setAttribute("aria-label", item.label);
  item.options.forEach((o) => {
    const b = make("button", o.chosen ? "tile chosen" : "tile");
    b.type = "button";
    b.id = o.id;
    b.dataset.value = o.value;
    b.disabled = item.read_only === true;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", o.chosen ? "true" : "false");
    const img = make("img");
    img.src = o.picture + "?v=cncmgljlkmia";
    img.alt = "";
    img.draggable = false;
    b.append(img, make("span", "tile-name", o.text));
    b.addEventListener("click", () => send(item.id, o.value));
    b.addEventListener("keydown", (e) => {
      const to = { ArrowRight: b.nextElementSibling, ArrowDown: b.nextElementSibling, ArrowLeft: b.previousElementSibling, ArrowUp: b.previousElementSibling }[e.key];
      if (to) {
        e.preventDefault();
        to.focus();
      }
    });
    grid.append(b);
  });
  wrap.append(grid);
  return wrap;
}

function slider(item) {
  const wrap = make("div", "field slider");
  const label = make("label", "", item.label);
  const input = make("input");
  input.type = "range";
  input.id = item.id;
  input.setAttribute("min", item.min);
  input.setAttribute("max", item.max);
  input.setAttribute("step", item.step);
  input.value = item.value;
  label.htmlFor = item.id;
  input.addEventListener("change", () => send(item.id, input.value));
  wrap.append(label, input, make("span", "slider-value", item.text));
  return wrap;
}

function toggle(item) {
  const wrap = make("label", "toggle");
  const input = make("input");
  input.type = "checkbox";
  input.id = item.id;
  input.checked = item.value;
  input.addEventListener("change", () => send(item.id, input.checked ? "on" : "off"));
  wrap.append(make("span", "", item.label), input);
  return wrap;
}

// A row of checkboxes under one label (TRIAGE T42: the items crates give).
function checks(item) {
  const wrap = make("div", "checks");
  wrap.append(make("span", "checks-label", item.label));
  const row = make("div", "checks-row");
  item.options.forEach((o) => {
    const box = make("label", "check");
    const input = make("input");
    input.type = "checkbox";
    input.id = o.id;
    input.checked = o.value;
    input.addEventListener("change", () => send(o.id, input.checked ? "on" : "off"));
    box.append(input, make("span", "", o.text));
    row.append(box);
  });
  wrap.append(row);
  if (item.note) wrap.append(make("span", "checks-note", item.note));
  return wrap;
}

function list(item) {
  const table = make("table", "pairs");
  item.rows.forEach((r) => {
    const tr = make("tr");
    tr.append(make("td", "", r[0]), make("td", "", r[1]));
    table.append(tr);
  });
  return table;
}

// A results table: the last value of each row says whether it is this player.
function cells(item) {
  const table = make("table", "cells");
  const head = make("tr");
  item.head.forEach((h) => head.append(make("th", "", h)));
  table.append(head);
  item.rows.forEach((r) => {
    const tr = make("tr", r[r.length - 1] === true ? "me" : "");
    r.slice(0, -1).forEach((c) => tr.append(make("td", "", c)));
    table.append(tr);
  });
  return table;
}

const builders = { button, picker, stats, select, tiles, slider, toggle, checks, list, table: cells, field, copy };

function drawMenus() {
  const text = JSON.stringify(ui.panels || []);
  if (text === panelsText) return;
  panelsText = text;
  const focused = document.activeElement && document.activeElement.id;
  const caret = focused ? document.activeElement.selectionStart : null;
  const box = el("menus");
  box.replaceChildren();
  (ui.panels || []).forEach((p) => {
    const panel = make("div", "panel " + p.kind);
    if (p.heading) {
      const h = make("h2", "", p.heading);
      // a heading the core makes clickable (the title's secret)
      if (p.click) {
        h.id = p.click;
        h.addEventListener("click", () => send(p.click, ""));
      }
      panel.append(h);
    }
    if (p.sub) panel.append(make("div", "sub", p.sub));
    p.items.forEach((item) => panel.append(builders[item.type](item)));
    box.append(panel);
  });
  const again = focused && el(focused);
  // a map card keeps the focus too, so the arrow keys go on from it
  if (again && (again.tagName !== "BUTTON" || again.classList.contains("tile"))) {
    again.focus();
    if (caret !== null && caret !== undefined && again.setSelectionRange) again.setSelectionRange(caret, caret);
  }
}

// ---- the race HUD ----

function pair(id, kv) {
  const node = el(id);
  const k = node.querySelector(".k");
  const v = node.querySelector(".v");
  if (k.textContent !== kv[0]) k.textContent = kv[0];
  if (v.textContent !== kv[1]) v.textContent = kv[1];
}

function drawHud(h) {
  pair("hud-place", h.place);
  pair("hud-time", h.time);
  drawSpeedo(h.speedo);
  pair("hud-best", h.best);
  pair("hud-bananas", h.bananas);
  pair("hud-map", h.map);
  pair("hud-item", h.item);
  el("hud-item").className = h.item_key ? "item-slot full" : "item-slot";
  // the item's picture, made by the core (TRIAGE T19)
  const icon = el("hud-item-icon");
  if (icon.dataset.key !== h.item_key) {
    icon.dataset.key = h.item_key;
    icon.innerHTML = h.item_icon;
  }
  el("hud-big").textContent = h.big;
  el("hud-big").className = h.big_class;
  el("hud-hint").textContent = h.hint;
  // a course reward's name, briefly (the core says when)
  if (el("hud-reward").textContent !== h.reward) el("hud-reward").textContent = h.reward;
  el("hud-reticle").className = h.cooldown ? "reticle cool" : "reticle";
  drawMinimap(h.minimap);
  drawReplayBar(h.replay);
}

// The replay's seek bar: the core gives the place (out of max); a drag
// sends the new place when let go. While held, the core's place waits.
let seeking = false;

function drawReplayBar(r) {
  const bar = el("replay-bar");
  bar.hidden = !r;
  if (!r) return;
  const seek = el("replay-seek");
  if (seek.max !== String(r.max)) seek.max = r.max;
  if (!seeking) seek.value = r.value;
  el("replay-at").textContent = r.at;
  el("replay-of").textContent = r.of;
}

// The core draws the dial's face once and turns the banana each frame.
let speedoFace = "";

function drawSpeedo(sp) {
  if (speedoFace !== ui.speedo_face) {
    speedoFace = ui.speedo_face;
    el("speedo-face").innerHTML = ui.speedo_face;
    el("speedo-needle").innerHTML = ui.speedo_needle;
  }
  el("speedo-needle").style.transform = sp.needle;
  el("speedo-value").textContent = sp.value;
  el("speedo-unit").textContent = sp.unit;
  el("speedo-shout").textContent = sp.shout;
  el("speedo").className = "speedo hype-" + sp.hype;
  // glow and shake follow the exact speed (TRIAGE row 15, a try)
  el("speedo").style.setProperty("--hype", sp.amount);
  // a hype call-out's splash (TRIAGE T22): the flash and the popping shout
  el("hype-flash").style.opacity = sp.screen;
  el("hype-flash").className = "hype-flash burst-" + sp.burst;
  el("speedo").dataset.burst = sp.burst;
  el("speedo").style.setProperty("--flash", sp.flash);
}

function drawMinimap(m) {
  const mini = el("minimap");
  if (mini.width !== m.size) {
    mini.width = m.size;
    mini.height = m.size;
  }
  const ctx = mini.getContext("2d");
  ctx.clearRect(0, 0, m.size, m.size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = m.track;
  ctx.lineWidth = m.width;
  ctx.beginPath();
  for (let i = 0; i < m.line.length; i += m.stride) ctx.lineTo(m.line[i], m.line[i + 1]);
  ctx.stroke();
  // a fork's other branch (the Ski Slope)
  m.branches.forEach((b) => {
    ctx.beginPath();
    for (let i = 0; i < b.length; i += m.stride) ctx.lineTo(b[i], b[i + 1]);
    ctx.stroke();
  });
  ctx.fillStyle = m.finish_colour;
  ctx.beginPath();
  ctx.arc(m.finish[0], m.finish[1], m.dot, 0, m.circle);
  ctx.fill();
  m.apes.forEach((a) => {
    ctx.fillStyle = a.colour;
    ctx.strokeStyle = a.me ? m.me_ring : m.ring;
    ctx.lineWidth = m.ring_width;
    ctx.beginPath();
    // a shape from the core (the colourblind mode), or a round dot
    if (a.shape) {
      for (let i = 0; i < a.shape.length; i += m.stride) ctx.lineTo(a.shape[i], a.shape[i + 1]);
      ctx.closePath();
    } else {
      ctx.arc(a.x, a.y, a.me ? m.me_dot : m.dot, 0, m.circle);
    }
    ctx.fill();
    ctx.stroke();
  });
}

// ---- input ----

function lockPointer() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {
    // Pointer lock may be refused (a headless browser); the mouse then does nothing.
  }
}

function typing(e) {
  const t = e.target && e.target.tagName;
  return t === "INPUT" || t === "SELECT" || t === "TEXTAREA";
}

function bindInput() {
  ["keydown", "keyup"].forEach((type) => {
    window.addEventListener(type, (e) => {
      if (typing(e)) return;
      if (ui && ui.screen === "race" && !e.ctrlKey) e.preventDefault();
      if (e.repeat) return;
      game.key(e.code, type === "keydown");
    });
  });
  window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement === canvas) game.mouse_move(e.movementX, e.movementY);
  });
  // a drag over the free (uncaptured) view, and the wheel: the core decides
  // what they do (in a replay, steer and zoom the orbit camera, TRIAGE T23)
  canvas.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas && e.buttons === 1) game.drag(e.movementX, e.movementY);
  });
  canvas.addEventListener("wheel", (e) => game.wheel(e.deltaY), { passive: true });
  window.addEventListener("mousedown", (e) => game.mouse_button(e.button, true));
  window.addEventListener("mouseup", (e) => game.mouse_button(e.button, false));
  canvas.addEventListener("click", () => {
    if (ui && ui.want_pointer && document.pointerLockElement !== canvas && !navigator.webdriver) lockPointer();
  });
  document.addEventListener("pointerlockchange", () => {
    game.pointer_lock(document.pointerLockElement === canvas);
  });
  window.addEventListener("blur", () => game.blur());
  const seek = el("replay-seek");
  seek.addEventListener("pointerdown", () => {
    seeking = true;
  });
  seek.addEventListener("change", () => {
    seeking = false;
    send("replay.seek", seek.value);
  });
  window.addEventListener("contextmenu", (e) => {
    if (ui && ui.screen === "race") e.preventDefault();
  });
}

// ---- sound: the core makes every sound (WAV bytes); the page only plays ----

let audio = null;
let buffers = {};
let buffersVolume = null;
let wind = null;

function wakeAudio() {
  if (!audio) {
    try {
      audio = new AudioContext();
    } catch (e) {
      audio = null;
    }
  } else if (audio.state === "suspended") {
    audio.resume();
  }
}
window.addEventListener("pointerdown", wakeAudio, true);
window.addEventListener("keydown", wakeAudio, true);

async function bufferFor(key) {
  if (buffersVolume !== ui.volume) {
    buffers = {};
    buffersVolume = ui.volume;
    if (wind) {
      wind.source.stop();
      wind = null;
    }
  }
  if (!buffers[key]) {
    const bytes = game.sound(key);
    if (!bytes.length) return null;
    buffers[key] = audio.decodeAudioData(bytes.slice().buffer);
  }
  return buffers[key];
}

async function play(key) {
  if (!audio) return;
  try {
    const buffer = await bufferFor(key);
    if (!buffer) return;
    const source = audio.createBufferSource();
    source.buffer = await buffer;
    source.connect(audio.destination);
    source.start();
    document.body.dataset.sound = key;
  } catch (e) {
    // A sound that cannot play is skipped; the race goes on.
  }
}

let windStarting = false;

async function setWind(gain) {
  if (!audio || audio.state !== "running") return;
  if (!wind && !windStarting && gain > 0) {
    windStarting = true;
    try {
      const buffer = await bufferFor("wind");
      if (buffer) {
        const source = audio.createBufferSource();
        source.buffer = await buffer;
        source.loop = true;
        const level = audio.createGain();
        level.gain.value = 0;
        source.connect(level);
        level.connect(audio.destination);
        source.start();
        wind = { source, level };
      }
    } catch (e) {
      wind = null;
    }
    windStarting = false;
  }
  if (wind) wind.level.gain.value = gain;
}

// ---- online play: the transport (PLAN P13) ----
// online.js is imported only when a player hosts or joins.

let online = null;

function onNet(e) {
  game.net_event(e.kind, e.peer || "", e.text || "", !!e.host);
}

async function netRequest(req) {
  try {
    if (!online) online = await import("./online.js?v=cncmgljlkmia");
    if (req.op === "host_room") await online.hostRoom(req.room, onNet);
    else if (req.op === "join_room") await online.joinRoom(req.room, onNet);
    else if (req.op === "host_code") game.net_code("invite", await online.hostByCode(onNet));
    else if (req.op === "invite_code") game.net_code("invite", await online.inviteByCode());
    else if (req.op === "join_code") game.net_code("reply", await online.joinByCode(req.invite, onNet));
    else if (req.op === "accept_reply") await online.acceptAnswer(req.reply);
    else if (req.op === "leave") online.leave();
  } catch (err) {
    game.net_event("error", "", (err && err.message) || "online.signal_failed", false);
  }
}

function flushNet() {
  const out = JSON.parse(game.outbox());
  if (!online) return;
  out.forEach((m) => {
    if (m.to === null) online.broadcast(m.text);
    else online.send(m.to, m.text);
  });
}

// ---- the loop ----

function handle(view) {
  if (view.error) {
    el("message").textContent = view.error;
    return;
  }
  if (view.save) writeStore(SAVE_KEY, view.save);
  // Storage full: the core asks again with fewer recent replays, never
  // fewer bests (TRIAGE T55).
  if (view.save_replays && !writeStore(REPLAYS_KEY, view.save_replays)) game.replays_not_saved();
  if (view.sounds) view.sounds.forEach(play);
  // Messages first: a Leave goes out before the transport closes.
  if (view.net_requests) {
    flushNet();
    view.net_requests.forEach(netRequest);
  }
  if (view.remote_moved !== undefined) document.body.dataset.remoteMoved = String(view.remote_moved);
  document.body.dataset.screen = view.screen;
  el("version").textContent = view.version;
  // where the menus sit beside the previewed ape: the core decides (T47)
  document.body.dataset.dock = view.dock;
  document.body.style.setProperty("--dock-w", view.dock_w);
  document.body.style.setProperty("--dock-top", view.dock_top);
  el("hud").hidden = view.screen !== "race" || !view.hud;
  if (view.hud) drawHud(view.hud);
  drawMenus();
  setWind(view.wind);
  if (!view.want_pointer && document.pointerLockElement === canvas) document.exitPointerLock();
}

async function start() {
  await init({ module_or_path: "pkg/tool_shim_bg.wasm?v=cncmgljlkmia" });
  const [strings, vertex, fragment] = await Promise.all(
    ["data/strings.json", "data/shaders/scene.vert", "data/shaders/scene.frag"].map((f) =>
      fetch(f + "?v=cncmgljlkmia").then((r) => r.text()),
    ),
  );
  const entropy = new Uint32Array(1);
  crypto.getRandomValues(entropy);
  game = new Game(strings, readStore(SAVE_KEY), entropy[0]);
  game.load_replays(readStore(REPLAYS_KEY));
  const first = JSON.parse(game.ui());
  if (first.error) {
    el("message").textContent = first.error;
    document.body.dataset.ready = "true";
    return;
  }
  el("tab-icon").href = first.tab_icon;
  const N = JSON.parse(numbers());
  let renderer = null;
  try {
    renderer = makeRenderer(canvas, N, { vertex, fragment }, (id) => mesh(id), uniforms(), clear_colour());
  } catch (e) {
    renderer = null;
  }
  if (!renderer) el("message").textContent = first.no_webgl;

  function resize() {
    const [w, h] = game.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    if (renderer) renderer.resize(w, h);
  }
  window.addEventListener("resize", resize);
  resize();
  bindInput();
  if (new URLSearchParams(location.search).has("lineup")) game.act("screen.lineup", "");
  // `?map=city`: a look at another map (a test hook until the map selector)
  const map = new URLSearchParams(location.search).get("map");
  if (map) game.act("flag.map", map);
  const at = new URLSearchParams(location.search).get("at");
  if (at) game.act("flag.fly_at", at);
  // `?tile=<spec>`: a home-page screenshot, held still (scripts/tiles.py)
  const tile = new URLSearchParams(location.search).get("tile");
  if (tile) game.act("screen.tile", tile);
  // This browser's id for online play, and `?codes`: the pasted-code path,
  // for the automated online check only.
  game.act("flag.client", crypto.randomUUID());
  if (new URLSearchParams(location.search).has("codes")) game.act("flag.codes", "on");
  // invite links: the page's own address, and a room to join if opened from one
  game.act("flag.page_url", location.origin + location.pathname);
  const linked = new URLSearchParams(location.hash.slice(1)).get("room");
  if (linked) {
    history.replaceState(null, "", location.pathname + location.search);
    game.act("flag.room_link", linked);
  }

  let sceneVersion = null;
  function frame(now) {
    game.advance(now);
    ui = JSON.parse(game.ui());
    handle(ui);
    if (renderer) {
      if (game.scene_version() !== sceneVersion) {
        sceneVersion = game.scene_version();
        game.build_scene();
        renderer.setScene(game.static_instances(), game.terrain());
      }
      game.build_frame();
      renderer.frame(game.view(), game.instances(), game.draws());
    }
    flushNet();
    requestAnimationFrame(frame);
  }
  document.body.dataset.ready = "true";
  requestAnimationFrame(frame);
}

start();
