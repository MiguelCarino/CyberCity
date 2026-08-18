/* CyberCity DOM shim — run the SHIPPED index.html with no browser.
 *
 * WHY THIS FILE EXISTS. tools/headless.cjs deliberately loads only the pure modules: it never
 * touches src/main.js or src/render_canvas.js, so the boot path, the glyph atlas, the bloom
 * composite, the resize/layout path, fullscreen, pointer lock, every input handler in control.js
 * and the pause wiring in main.js had never executed anywhere, at all, ever. Half the project was
 * shipping unrun.
 *
 * WHAT IT TESTS. The single <script> body is cut out of the BUILT index.html and evaluated in a
 * vm context against a fake window/document/canvas — so this exercises the artifact that ships,
 * not src/. Every 2D-context entry point render_canvas.js uses is stubbed as a COUNTING stub:
 * a pass here means the page really called drawImage/fillText/fillRect the expected number of
 * times with in-bounds arguments, not merely that nothing threw. "It drew nothing" is a failure.
 *
 * WHAT IT CANNOT TEST. See the note at the bottom of the report: no rasteriser runs, so nothing
 * here says a glyph is legible, a colour is right, or the bloom looks like anything.
 *
 *   node tools/domshim.cjs            # all cases
 *   node tools/domshim.cjs --verbose  # every check, not just failures
 *   node tools/domshim.cjs --only=pause,resize
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'index.html');
const argv = process.argv.slice(2);
const VERBOSE = argv.indexOf('--verbose') >= 0;
const ONLY = (function () {
  for (const a of argv) if (a.startsWith('--only=')) return a.slice(7).split(',');
  return null;
})();

/* ---- extract the shipped script ------------------------------------------------------------
 * The page has exactly one <script> and it is inline; if that ever stops being true the shim is
 * testing something other than the deliverable and must say so rather than quietly test less. */
const html = fs.readFileSync(PAGE, 'utf8');
const opens = html.match(/<script\b/gi) || [];
if (opens.length !== 1) throw new Error('domshim: expected exactly 1 <script> in index.html, found ' + opens.length);
const m = /<script>\n?([\s\S]*?)<\/script>/.exec(html);
if (!m) throw new Error('domshim: could not find the inline <script> body');
const SCRIPT_LINE = html.slice(0, m.index).split('\n').length;   // 1-based line of <script>

/* The bundle leaks nothing to window on purpose, so there is no way to inspect CC from outside.
 * One call is spliced in — with NO newline, so every stack line number still matches index.html —
 * immediately before main.js, which means CC is captured even if boot() throws. main.js then
 * hangs CC.Main off the same object we already hold. */
const MARK = '/* src/main.js */';
if (html.indexOf(MARK) < 0) throw new Error('domshim: build no longer emits the ' + MARK + ' marker');
const CODE = m[1].replace(MARK, '__export(CC);' + MARK);
const SCRIPT = new vm.Script(CODE, { filename: 'index.html', lineOffset: SCRIPT_LINE });

/* ---- the fake DOM ---------------------------------------------------------------------------
 * Every stub counts. A stub that silently accepts anything turns "the renderer drew nothing" into
 * a green run, which is the one failure mode a fake DOM is uniquely good at hiding. */

function mkTarget(obj) {
  const L = Object.create(null);
  obj._listeners = L;
  obj.addEventListener = function (type, fn) { if (typeof fn === 'function') (L[type] || (L[type] = [])).push(fn); };
  obj.removeEventListener = function (type, fn) {
    const a = L[type]; if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  };
  obj.dispatchEvent = function (ev) { return true; };
  return obj;
}

function makeEnv(opts) {
  opts = opts || {};
  const env = {
    errors: [],
    counts: Object.create(null),
    bounds: [],            // out-of-range draw arguments, i.e. draws that paint nothing
    clock: 1000,
    perf: 1000,
    frameCost: opts.frameCost || 0,
    raf: [],
    timers: [],
    timerId: 1,
    filterSupported: opts.filterSupported !== false,
    grantPointerLock: !!opts.grantPointerLock,
    reducedMotion: !!opts.reducedMotion,
    contexts: []
  };
  const bump = (k, n) => { env.counts[k] = (env.counts[k] || 0) + (n === undefined ? 1 : n); };
  env.bump = bump;
  env.get = (k) => env.counts[k] || 0;
  env.err = (where, e) => env.errors.push({
    where: where,
    message: e && e.message ? e.message : String(e),
    stack: e && e.stack ? e.stack : '(no stack)'
  });

  function num(v) { return typeof v === 'number' && isFinite(v); }

  /* Both requestFullscreen and requestPointerLock return a Promise in current engines, and a
   * REJECTED one when the request is refused. A thenable that records whether anybody attached a
   * handler is a synchronous, deterministic stand-in for Node's unhandledRejection warning — which
   * would otherwise fire long after this synchronous test has finished. */
  function promiseStub(kind) {
    const p = {
      handled: false, kind: kind,
      then: function (res, rej) { bump(kind + '.then'); if (rej) p.handled = true; return p; },
      catch: function () { bump(kind + '.catch'); p.handled = true; return p; },
      finally: function () { bump(kind + '.finally'); return p; }
    };
    env.promises.push(p);
    return p;
  }
  env.promises = [];
  env.unhandledPromises = function () { return env.promises.filter(p => !p.handled); };

  /* ---- 2D context ------------------------------------------------------------------------ */
  function makeCtx(canvas, label) {
    const c = {
      canvas: canvas,
      _filter: 'none',
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      fillStyle: '#000',
      strokeStyle: '#000',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      _label: label,
      _ops: Object.create(null)
    };
    const op = (k) => { c._ops[k] = (c._ops[k] || 0) + 1; bump(k); bump(label + '.' + k); };

    /* ctx.filter is PROBED by render_canvas.js by writing then reading back, so an accessor is the
     * only faithful stub: with filterSupported off the write must not stick, exactly as it does not
     * on a WebKit without filter support. */
    Object.defineProperty(c, 'filter', {
      get() { return c._filter; },
      set(v) { op('setFilter'); if (env.filterSupported) c._filter = v; }
    });

    c.measureText = function (s) {
      op('measureText');
      const px = parseFloat(/([\d.]+)px/.exec(c.font) ? /([\d.]+)px/.exec(c.font)[1] : '10');
      return {
        width: String(s).length * px * 0.6,
        actualBoundingBoxAscent: px * 0.72,
        actualBoundingBoxDescent: px * 0.20
      };
    };
    c.fillText = function (s, x, y) {
      op('fillText');
      if (!num(x) || !num(y)) env.bounds.push(label + '.fillText non-finite (' + x + ',' + y + ')');
      else if (x < 0 || y < 0 || x > canvas.width || y > canvas.height)
        env.bounds.push(label + '.fillText outside canvas (' + x + ',' + y + ') vs ' + canvas.width + 'x' + canvas.height);
    };
    c.fillRect = function (x, y, w, h) {
      op('fillRect');
      if (!num(x) || !num(y) || !num(w) || !num(h))
        env.bounds.push(label + '.fillRect non-finite');
      else if (w <= 0 || h <= 0) env.bounds.push(label + '.fillRect empty ' + w + 'x' + h);
    };
    c.clearRect = function () { op('clearRect'); };
    c.save = function () { op('save'); };
    c.restore = function () { op('restore'); };
    c.drawImage = function (img) {
      op('drawImage');
      if (!img || !num(img.width) || !num(img.height) || img.width < 1 || img.height < 1) {
        env.bounds.push(label + '.drawImage source is not a drawable canvas');
        return;
      }
      const a = Array.prototype.slice.call(arguments, 1);
      for (let i = 0; i < a.length; i++) if (!num(a[i])) {
        env.bounds.push(label + '.drawImage non-finite arg ' + i + ' = ' + a[i]);
        return;
      }
      if (a.length === 8) {
        /* The whole point of a counting stub: a source rect off the edge of the atlas draws
         * NOTHING in a real canvas and throws no error, which is exactly how a palette index
         * running past the atlas would ship invisible. */
        const [sx, sy, sw, sh, dx, dy, dw, dh] = a;
        if (sw <= 0 || sh <= 0) env.bounds.push(label + '.drawImage empty src rect');
        else if (sx < 0 || sy < 0 || sx + sw > img.width + 0.001 || sy + sh > img.height + 0.001)
          env.bounds.push(label + '.drawImage src rect ' + [sx, sy, sw, sh] + ' outside ' + img.width + 'x' + img.height);
        if (dw <= 0 || dh <= 0) env.bounds.push(label + '.drawImage empty dst rect');
        else if (dx + dw > canvas.width + 0.001 || dy + dh > canvas.height + 0.001)
          env.bounds.push(label + '.drawImage dst rect ' + [dx, dy, dw, dh] + ' outside ' + canvas.width + 'x' + canvas.height);
      } else if (a.length === 4) {
        if (a[2] <= 0 || a[3] <= 0) env.bounds.push(label + '.drawImage empty dst rect');
      } else if (a.length !== 2) {
        env.bounds.push(label + '.drawImage odd arity ' + (a.length + 1));
      }
    };
    env.contexts.push(c);
    return c;
  }

  let canvasN = 0;
  function makeCanvasEl() {
    const el = mkTarget({});
    el.tagName = 'CANVAS';
    el.id = '';
    el.nodeName = 'CANVAS';
    el._label = 'cv' + (canvasN++);
    let w = 300, h = 150;
    Object.defineProperty(el, 'width', { get: () => w, set: (v) => { w = v | 0; bump('canvas.resize'); } });
    Object.defineProperty(el, 'height', { get: () => h, set: (v) => { h = v | 0; bump('canvas.resize'); } });
    el.style = {};
    el.clientWidth = 0; el.clientHeight = 0;
    el.getContext = function (type, o) {
      bump('getContext');
      if (type !== '2d') return null;
      if (!el._ctx) el._ctx = makeCtx(el, el._label);
      return el._ctx;
    };
    el.setPointerCapture = function (id) { bump('setPointerCapture'); };
    el.releasePointerCapture = function (id) { bump('releasePointerCapture'); };
    el.requestPointerLock = function () {
      bump('requestPointerLock');
      if (env.grantPointerLock) doc.pointerLockElement = el;
      return opts.legacyLockApi ? undefined : promiseStub('lockPromise');
    };
    el.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0 };
    };
    el.appendChild = function (c) { bump('appendChild'); return c; };
    return el;
  }

  function makeEl(tag) {
    const el = mkTarget({});
    el.tagName = String(tag).toUpperCase();
    el.nodeName = el.tagName;
    el.style = {};
    el.children = [];
    el.appendChild = function (c) { bump('appendChild'); el.children.push(c); return c; };
    el.removeChild = function (c) { bump('removeChild'); return c; };
    el.setAttribute = function () { bump('setAttribute'); };
    el.getBoundingClientRect = function () { return { left: 0, top: 0, width: 0, height: 0 }; };
    return el;
  }

  /* ---- document -------------------------------------------------------------------------- */
  const cc = makeCanvasEl();
  cc.id = 'cc';
  cc._label = 'cc';
  const hint = makeEl('div'); hint.id = 'hint';
  const body = makeEl('body');
  const docEl = makeEl('html');
  docEl.requestFullscreen = function () {
    bump('requestFullscreen');
    if (!opts.fullscreenDenied) {
      doc.fullscreenElement = docEl;
      env.fire(doc, 'fullscreenchange', {});
    }
    return opts.legacyFullscreenApi ? undefined : promiseStub('fsPromise');
  };

  const doc = mkTarget({});
  doc.readyState = opts.readyState || 'complete';
  doc.documentElement = docEl;
  doc.body = body;
  doc.fullscreenElement = null;
  doc.webkitFullscreenElement = null;
  doc.pointerLockElement = null;
  doc.hidden = false;
  doc.visibilityState = 'visible';
  doc.title = 'CyberCity';
  doc.getElementById = function (id) {
    bump('getElementById');
    return id === 'cc' ? cc : (id === 'hint' ? hint : null);
  };
  doc.querySelector = function () { bump('querySelector'); return null; };
  doc.createElement = function (tag) {
    bump('createElement');
    return String(tag).toLowerCase() === 'canvas' ? makeCanvasEl() : makeEl(tag);
  };
  doc.exitPointerLock = function () { bump('exitPointerLock'); doc.pointerLockElement = null; };
  doc.exitFullscreen = function () { bump('exitFullscreen'); doc.fullscreenElement = null; };
  env.doc = doc;
  env.cc = cc;

  /* ---- window ---------------------------------------------------------------------------- */
  const win = mkTarget({});
  /* 640x400 by default — a small grid, because most cases here run thousands of frames to reach an
   * idle timeout or a weather transition and the cost of a frame is linear in cells. The cases that
   * are ABOUT geometry (boot, resize, the touch case) name their own real-world size. */
  win.innerWidth = opts.w || 640;
  win.innerHeight = opts.h || 400;
  win.devicePixelRatio = opts.dpr || 1;
  win.document = doc;
  win.screen = { width: win.innerWidth, height: win.innerHeight };
  win.location = {
    hash: opts.hash || '',
    href: 'file:///index.html' + (opts.hash || ''),
    protocol: 'file:', host: '', pathname: '/index.html', search: ''
  };
  win.history = {
    replaceState: function (s, t, url) {
      bump('replaceState');
      /* replaceState must NOT fire hashchange — main.js relies on exactly that to avoid rebuilding
       * the city it is in the middle of building. */
      if (typeof url === 'string' && url.charAt(0) === '#') win.location.hash = url;
    },
    pushState: function (s, t, url) {
      bump('pushState');
      if (typeof url === 'string' && url.charAt(0) === '#') { win.location.hash = url; env.fire(win, 'hashchange', {}); }
    }
  };
  win.performance = {
    now: function () {
      bump('performance.now');
      const v = env.perf;
      env.perf += env.frameCost;      // lets a case simulate a slow frame without touching dt
      return v;
    }
  };
  win.requestAnimationFrame = function (cb) { bump('raf'); env.raf.push(cb); return env.raf.length; };
  win.cancelAnimationFrame = function () { bump('cancelRaf'); };
  win.setTimeout = function (fn, ms) {
    bump('setTimeout');
    const id = env.timerId++;
    env.timers.push({ id: id, due: env.clock + (ms || 0), fn: fn });
    return id;
  };
  win.clearTimeout = function (id) {
    bump('clearTimeout');
    for (let i = 0; i < env.timers.length; i++) if (env.timers[i].id === id) { env.timers.splice(i, 1); return; }
  };
  win.setInterval = function () { bump('setInterval'); return env.timerId++; };
  win.clearInterval = function () { bump('clearInterval'); };
  win.matchMedia = function (q) {
    bump('matchMedia');
    const mq = mkTarget({});
    mq.media = q;
    mq.matches = /reduced-motion/.test(q) ? env.reducedMotion : false;
    mq.addListener = function (fn) { mq.addEventListener('change', fn); };
    mq.removeListener = function (fn) { mq.removeEventListener('change', fn); };
    env.mq = mq;
    return mq;
  };
  win.getComputedStyle = function () {
    bump('getComputedStyle');
    return { getPropertyValue: function () { return ''; }, fontFamily: '', width: '0px', height: '0px' };
  };
  /* getGamepads is present but empty by default, which is the state of a browser with no pad
   * plugged in and the branch control.js takes on every desktop. `env.pads` is what a test writes
   * to in order to plug one in. */
  env.pads = [];
  win.navigator = {
    userAgent: 'domshim', platform: 'shim', maxTouchPoints: 5,
    getGamepads: function () { bump('getGamepads'); return env.pads; }
  };
  win.alert = function () { bump('alert'); };
  win.window = win;
  win.self = win;
  win.top = win;
  win.parent = win;
  win.console = {
    log: () => bump('console.log'),
    warn: (...a) => { bump('console.warn'); env.errors.push({ where: 'console.warn', message: a.join(' '), stack: '(console)' }); },
    error: (...a) => { bump('console.error'); env.errors.push({ where: 'console.error', message: a.join(' '), stack: '(console)' }); }
  };
  win.performance.timeOrigin = 0;
  win.__export = function (CC) { env.CC = CC; };
  env.win = win;

  /* ---- event plumbing --------------------------------------------------------------------- */
  env.fire = function (target, type, ev) {
    ev = ev || {};
    ev.type = type;
    ev.target = target;
    if (!ev.preventDefault) ev.preventDefault = function () { ev.defaultPrevented = true; };
    if (!ev.stopPropagation) ev.stopPropagation = function () { };
    const a = target._listeners && target._listeners[type];
    if (!a) return 0;
    for (const fn of a.slice()) {
      try { fn.call(target, ev); } catch (e) { env.err('event ' + type, e); }
    }
    return a.length;
  };

  env.fireTimers = function () {
    for (let guard = 0; guard < 64; guard++) {
      let idx = -1;
      for (let i = 0; i < env.timers.length; i++)
        if (env.timers[i].due <= env.clock && (idx < 0 || env.timers[i].due < env.timers[idx].due)) idx = i;
      if (idx < 0) return;
      const t = env.timers.splice(idx, 1)[0];
      try { t.fn(); } catch (e) { env.err('setTimeout', e); }
    }
  };

  /* One frame: advance the wall clock, run any due timers, then drain the rAF queue exactly as a
   * browser does — the callback re-registers itself at the top of tick(), so the splice is what
   * keeps one tick from running the next one too. */
  env.tick = function (n, dtMs) {
    n = n === undefined ? 1 : n;
    dtMs = dtMs === undefined ? 1000 / 60 : dtMs;
    for (let i = 0; i < n; i++) {
      env.clock += dtMs;
      env.perf = env.clock;
      env.fireTimers();
      const cbs = env.raf.splice(0, env.raf.length);
      for (const cb of cbs) {
        try { cb(env.clock); } catch (e) { env.err('rAF', e); }
      }
    }
  };

  env.run = function () {
    const sandbox = win;
    vm.createContext(sandbox);
    try { SCRIPT.runInContext(sandbox); }
    catch (e) { env.err('script evaluation', e); }
    return env;
  };
  return env;
}

/* ---- event constructors --------------------------------------------------------------------- */
const KEYCHAR = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyC: 'c', KeyH: 'h', KeyP: 'p', KeyF: 'f', KeyN: 'n',
  BracketLeft: '[', BracketRight: ']', Tab: 'Tab', Escape: 'Escape',
  ShiftLeft: 'Shift', ControlLeft: 'Control',
  ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6'
};
function keyEv(code, extra) {
  const e = {
    code: code, key: KEYCHAR[code] !== undefined ? KEYCHAR[code] : code,
    repeat: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false
  };
  if (extra) for (const k in extra) e[k] = extra[k];
  return e;
}
const keydown = (env, code, extra) => env.fire(env.win, 'keydown', keyEv(code, extra));
const keyup = (env, code, extra) => env.fire(env.win, 'keyup', keyEv(code, extra));

function ptrEv(o) {
  const e = {
    pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
    clientX: 0, clientY: 0, movementX: 0, movementY: 0
  };
  for (const k in o) e[k] = o[k];
  return e;
}
/* pointerdown is listened for on the CANVAS by control.js and on the WINDOW by main.js, so a
 * faithful dispatch has to bubble; the other pointer events are window-only. */
function pointerdown(env, o) {
  const e = ptrEv(o);
  env.fire(env.cc, 'pointerdown', e);
  env.fire(env.win, 'pointerdown', e);
}
const pointermove = (env, o) => env.fire(env.win, 'pointermove', ptrEv(o));
const pointerup = (env, o) => env.fire(env.win, 'pointerup', ptrEv(o));

/* ---- test scaffolding ------------------------------------------------------------------------ */
const CASES = [];
function testCase(name, fn) { CASES.push({ name: name, fn: fn }); }

function mkCheck(rec) {
  return function (ok, label, detail) {
    rec.push({ ok: !!ok, label: label, detail: detail === undefined ? '' : String(detail) });
    return !!ok;
  };
}

function dist(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
function pose(CC) { const p = CC.Control.pose; return { x: p.x, z: p.z, yaw: p.yaw, mode: p.mode }; }
function camSnap(CC) { const c = CC.Main.cam; return { x: c.x, z: c.z, yaw: c.yaw, t: c.t, eyeY: c.eyeY, horizon: c.horizon, fov: c.fov }; }

/* ============================================================================================
 * 1. plain boot + 300 ticks
 * ========================================================================================== */
testCase('boot', function (ok) {
  const env = makeEnv({ w: 1280, h: 800, dpr: 1 }).run();
  const CC = env.CC;
  if (!ok(!!CC, 'the bundle evaluated and CC exists')) return env;
  ok(!!CC.Main, 'CC.Main was published (main.js reached its last line)');
  ok(env.get('getElementById') >= 1, 'boot looked up #cc', env.get('getElementById'));
  ok(env.get('getContext') >= 3, 'contexts were created (page, scene, bloom taps)', env.get('getContext'));

  const NG = CC.GLYPHS.length, NP = CC.PALETTE.length;
  ok(env.get('fillText') === (NG - 1) * NP,
    'atlas drew every glyph in every palette colour', env.get('fillText') + ' vs ' + (NG - 1) * NP);
  ok(env.get('measureText') >= 2, 'atlas measured the advance and the ink box', env.get('measureText'));

  const before = env.get('drawImage');
  const c0 = camSnap(CC);
  env.tick(300);
  const drew = env.get('drawImage') - before;
  ok(drew > 300 * 100, 'the glyph pass actually drew cells over 300 frames', drew);
  ok(env.get('fillRect') >= 300, 'the scene buffer was cleared once per frame', env.get('fillRect'));
  ok(env.get('cc.drawImage') >= 300 * 3, 'the bloom composite ran (scene + 2 taps per frame)', env.get('cc.drawImage'));
  ok(env.get('raf') >= 300, 'the loop kept requesting frames', env.get('raf'));

  const c1 = camSnap(CC);
  ok(dist(c0, c1) > 3, 'the autopilot walked (5 s at ~1.6 m/s)', dist(c0, c1).toFixed(2) + ' m');
  ok(Math.abs(c1.t - 5) < 0.2, 'the simulation clock advanced 5 s', c1.t.toFixed(3));
  ok(CC.Main.cols > 0 && CC.Main.rows > 0, 'a grid was laid out', CC.Main.cols + 'x' + CC.Main.rows);
  ok(env.cc.width === CC.Main.cols * (env.cc.width / CC.Main.cols) && env.cc.width > 0,
    'the page canvas was sized', env.cc.width + 'x' + env.cc.height);
  ok(env.get('replaceState') === 1, 'a random seed was written to the fragment', env.get('replaceState'));
  ok(env.win.location.hash === '#' + CC.Main.seed, 'the fragment names the city that was built', env.win.location.hash);
  ok(env.get('setFilter') > 0, 'ctx.filter was probed and used for the blur taps', env.get('setFilter'));
  return env;
});

/* ============================================================================================
 * 2. resize — reallocates the frame, the atlas and every bloom buffer
 * ========================================================================================== */
testCase('resize', function (ok) {
  const env = makeEnv({ w: 1280, h: 800, dpr: 1 }).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(60);

  const sizes = [
    [390, 844, 2, 'portrait phone'],
    [3440, 1440, 1, 'ultrawide'],
    [800, 600, 1, 'small window'],
    [2560, 1440, 2, 'retina 1440p'],
    [320, 200, 1, 'absurdly small'],
    [1920, 1080, 1, 'back to 1080p']
  ];
  for (const [w, h, dpr, label] of sizes) {
    env.win.innerWidth = w; env.win.innerHeight = h; env.win.devicePixelRatio = dpr;
    const atlasBefore = env.get('fillText');
    const drawBefore = env.get('drawImage');
    env.fire(env.win, 'resize', {});
    env.tick(20);          // 333 ms: past the 180 ms debounce
    env.tick(40);
    const cols = CC.Main.cols, rows = CC.Main.rows;
    const cellW = env.cc.width / cols, cellH = env.cc.height / rows;
    ok(cols >= 48 && cols <= 260, label + ': column count inside its band', cols);
    ok(rows >= 22, label + ': row count above the floor', rows);
    ok(cellW === Math.round(cellW) && cellH === Math.round(cellH),
      label + ': cell is a whole number of device pixels', cellW + 'x' + cellH);
    ok(env.cc.width >= Math.floor(w * dpr) && env.cc.height >= Math.floor(h * dpr),
      label + ': canvas covers the viewport with no gutter',
      env.cc.width + 'x' + env.cc.height + ' vs ' + (w * dpr) + 'x' + (h * dpr));
    ok(env.cc.style.width === (env.cc.width / dpr) + 'px', label + ': CSS size matches dpr', env.cc.style.width);
    ok(env.get('drawImage') - drawBefore > 1000, label + ': kept drawing after the resize',
      env.get('drawImage') - drawBefore);
    ok(env.get('fillText') >= atlasBefore, label + ': atlas rebuild is well-formed');
    ok(CC.Main.cam.horizon > 0 && CC.Main.cam.horizon < rows,
      label + ': horizon is inside the grid', CC.Main.cam.horizon);
  }
  ok(env.bounds.length === 0, 'no draw landed outside a buffer across every size', env.bounds.slice(0, 3).join(' | '));
  return env;
});

/* ============================================================================================
 * 3. W A S D — the camera must actually move and the mode must flip to manual
 * ========================================================================================== */
testCase('wasd', function (ok) {
  const env = makeEnv({}).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(60);
  ok(CC.Control.mode === 0, 'starts on autopilot');

  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
    const p0 = pose(CC);
    keydown(env, code);
    env.tick(3);
    ok(CC.Control.mode === 1, code + ': took the camera over', 'mode=' + CC.Control.mode);
    /* Key repeat is what a browser really sends while a key is held, and control.js has a
     * dedicated branch for it that nothing had ever exercised. */
    for (let i = 0; i < 20; i++) { keydown(env, code, { repeat: true }); env.tick(6); }
    const p1 = pose(CC);
    ok(dist(p0, p1) > 1.0, code + ': the viewer pose moved', dist(p0, p1).toFixed(2) + ' m');
    ok(CC.Control.speed > 0.2, code + ': Control.speed reports motion', CC.Control.speed.toFixed(2));
    keyup(env, code);
    env.tick(20);
  }
  const c = camSnap(CC);
  ok(isFinite(c.x) && isFinite(c.z) && isFinite(c.yaw), 'the camera stayed finite', JSON.stringify(c));
  ok(env.errors.length === 0, 'no exceptions while driving');

  /* Look keys and crouch, which share the same bag. */
  const y0 = CC.Control.pose.yaw;
  keydown(env, 'ArrowRight'); env.tick(60); keyup(env, 'ArrowRight');
  ok(Math.abs(CC.Control.pose.yaw - y0) > 0.1, 'ArrowRight turned the viewer', (CC.Control.pose.yaw - y0).toFixed(3));
  keydown(env, 'KeyC'); env.tick(40);
  const eyeCrouch = CC.Main.cam.eyeY;
  keyup(env, 'KeyC'); env.tick(40);
  ok(CC.Main.cam.eyeY > eyeCrouch, 'crouch lowered the eye and standing raised it again',
    eyeCrouch.toFixed(3) + ' -> ' + CC.Main.cam.eyeY.toFixed(3));
  return env;
});

/* ============================================================================================
 * 4. let go, idle 20 s, autopilot takes back over
 * ========================================================================================== */
testCase('idle-resume', function (ok) {
  const env = makeEnv({}).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(60);
  keydown(env, 'KeyW');
  env.tick(120);
  ok(CC.Control.mode === 1, 'manual while W is held');
  keyup(env, 'KeyW');
  env.tick(1200);                                  // 20 s of synthetic idle
  ok(CC.Control.mode === 0, 'the autopilot took the camera back after 15 s idle', 'mode=' + CC.Control.mode);
  ok(CC.Control.blend < 0.01, 'the hand-back blend finished', CC.Control.blend);
  const a = camSnap(CC);
  env.tick(180);
  const b = camSnap(CC);
  ok(dist(a, b) > 2, 'the route is walking again', dist(a, b).toFixed(2) + ' m');
  ok(CC.Control.speed < 0.01, 'Control.speed reads zero on autopilot', CC.Control.speed);
  ok(env.errors.length === 0, 'no exceptions across the hand-back');
  return env;
});

/* ============================================================================================
 * 5. weather keys SHIFT+1..6 and [ ]
 *
 * The bare digits moved to the WORLDS when the frontier landed — see src/world.js and the note in
 * control.js — so every preset here is asked for with shift held. Shift is also the run key, which
 * is why the camera-seizure check below still matters: shift-2 walks faster for as long as it is
 * held, and it must still not hand the camera to the viewer.
 * ========================================================================================== */
testCase('weather-keys', function (ok) {
  const env = makeEnv({}).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(120);
  const names = CC.Weather.PRESETS.map(p => p.name);

  for (let i = 0; i < 6; i++) {
    keydown(env, 'Digit' + (i + 1), { shiftKey: true });
    keyup(env, 'Digit' + (i + 1), { shiftKey: true });
    env.tick(400);                                 // past TRANS_FORCED (5 s) at 60 Hz
    ok(CC.Weather.current === names[i], 'Digit' + (i + 1) + ' -> ' + names[i], CC.Weather.current);
    ok(CC.Weather.P.forced === true, 'Digit' + (i + 1) + ': the override is flagged as forced');
    const want = CC.Weather.PRESETS[i].p[0];
    ok(Math.abs(CC.Weather.P.rain - want) < 0.02, 'Digit' + (i + 1) + ': rain parameter reached the preset',
      CC.Weather.P.rain.toFixed(3) + ' vs ' + want);
    ok(CC.Control.mode === 0, 'Digit' + (i + 1) + ': changing the sky did NOT seize the camera');
  }
  /* WITH SHIFT DOWN THERE IS NO KEY PATH, and that is by design rather than an omission: `key` is
   * the SHIFTED character on every layout ('!' on US, '"' on UK), so it cannot carry the digit and
   * only `code` can. The bare-key path still exists and now selects a WORLD; it is tested there. */
  keydown(env, 'Digit3', { shiftKey: true }); env.tick(400);
  ok(CC.Weather.current === 'rain', 'Shift+3 -> rain', CC.Weather.current);

  keydown(env, 'BracketRight'); env.tick(400);
  ok(CC.Weather.current === 'downpour', '] cycled forward from rain', CC.Weather.current);
  keydown(env, 'BracketLeft'); env.tick(400);
  ok(CC.Weather.current === 'rain', '[ cycled back', CC.Weather.current);
  ok(env.errors.length === 0, 'no exceptions from the weather keys');
  return env;
});

/* ============================================================================================
 * 6. P — photo mode. Days-old wiring, never executed.
 * ========================================================================================== */
testCase('pause', function (ok) {
  const env = makeEnv({}).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(120);
  const before = camSnap(CC);
  const drawBefore = env.get('drawImage');

  keydown(env, 'KeyP'); keyup(env, 'KeyP');
  env.tick(180);                                    // 3 s paused
  ok(!!CC.Control.paused, 'P set the paused flag');
  const held = camSnap(CC);
  ok(held.t === before.t, 'the simulation clock HELD', before.t.toFixed(4) + ' -> ' + held.t.toFixed(4));
  ok(dist(before, held) < 1e-9, 'the camera held position', dist(before, held));
  ok(Math.abs(held.yaw - before.yaw) < 1e-9, 'the camera held its yaw');
  ok(env.get('drawImage') - drawBefore > 180 * 100, 'the renderer kept drawing while paused',
    env.get('drawImage') - drawBefore);

  /* Look and walk must still work while paused — that is the entire point of a photo mode. */
  keydown(env, 'KeyW'); env.tick(90); keyup(env, 'KeyW');
  const walked = camSnap(CC);
  ok(dist(held, walked) > 0.5, 'the viewer can still walk while paused', dist(held, walked).toFixed(2) + ' m');
  ok(walked.t === before.t, 'walking while paused did NOT advance the world clock', walked.t.toFixed(4));

  keydown(env, 'KeyP'); keyup(env, 'KeyP');
  env.tick(120);
  ok(!CC.Control.paused, 'P again released the pause');
  ok(camSnap(CC).t > before.t + 1.5, 'the clock is running again', camSnap(CC).t.toFixed(3));
  ok(env.errors.length === 0, 'no exceptions across pause/unpause');
  return env;
});

/* ============================================================================================
 * 7. H (hint), F (fullscreen), N (new seed mid-loop)
 * ========================================================================================== */
testCase('hint-fullscreen-newseed', function (ok) {
  const env = makeEnv({}).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(120);

  // --- H
  ok(CC.Control.hintAlpha(CC.Main.cam.t) > 0.9, 'the hint is up two seconds in',
    CC.Control.hintAlpha(CC.Main.cam.t));
  keydown(env, 'KeyH'); keyup(env, 'KeyH');
  env.tick(120);
  ok(CC.Control.hintAlpha(CC.Main.cam.t) === 0, 'H faded the hint out', CC.Control.hintAlpha(CC.Main.cam.t));
  keydown(env, 'KeyH'); keyup(env, 'KeyH');
  env.tick(90);
  ok(CC.Control.hintAlpha(CC.Main.cam.t) > 0.5, 'H brought it back', CC.Control.hintAlpha(CC.Main.cam.t));
  ok(CC.Control.mode === 0, 'H did not seize the camera');

  /* main.js sends EVERY keypress through goFullscreen, so pressing H above has already taken this
   * page fullscreen. F therefore has to be tested on a page nobody has touched, or the assertion
   * measures the H. */
  ok(env.doc.fullscreenElement === env.doc.documentElement,
    'any keypress at all takes the page fullscreen (main.js, by design)');

  // --- F, on a cold page
  const fs = makeEnv({ w: 640, h: 400 }).run();
  fs.tick(30);
  ok(fs.get('requestFullscreen') === 0, 'nothing goes fullscreen unprompted', fs.get('requestFullscreen'));
  keydown(fs, 'KeyF'); keyup(fs, 'KeyF');
  fs.tick(30);
  ok(fs.get('requestFullscreen') === 1, 'F asked for fullscreen', fs.get('requestFullscreen'));
  ok(fs.doc.fullscreenElement === fs.doc.documentElement, 'the document went fullscreen');
  keydown(fs, 'KeyF'); keyup(fs, 'KeyF');
  fs.tick(60);
  ok(fs.get('requestFullscreen') === 1, 'F while already fullscreen is a no-op', fs.get('requestFullscreen'));
  ok(fs.errors.length === 0, 'the fullscreenchange -> relayout path did not throw');
  ok(fs.get('drawImage') > 90 * 40, 'and the page kept drawing through it', fs.get('drawImage'));

  // --- N, three times, mid-loop
  for (let i = 0; i < 3; i++) {
    const s0 = CC.Main.seed;
    const rs = env.get('replaceState');
    keydown(env, 'KeyN'); keyup(env, 'KeyN');
    env.tick(1);
    ok(CC.Main.seed !== s0, 'N #' + (i + 1) + ': built a different city', s0 + ' -> ' + CC.Main.seed);
    ok(env.get('replaceState') === rs + 1, 'N #' + (i + 1) + ': the fragment followed the new seed');
    ok(env.win.location.hash === '#' + CC.Main.seed, 'N #' + (i + 1) + ': fragment matches', env.win.location.hash);
    const c0 = camSnap(CC);
    env.tick(120);
    ok(dist(c0, camSnap(CC)) > 1.5, 'N #' + (i + 1) + ': the new city is walking',
      dist(c0, camSnap(CC)).toFixed(2) + ' m');
    ok(!CC.Control.paused, 'N #' + (i + 1) + ': a new city does not arrive paused');
  }
  ok(env.errors.length === 0, 'no exceptions from N rebuilding the world mid-loop');
  ok(env.bounds.length === 0, 'no out-of-bounds draws after the rebuilds', env.bounds.slice(0, 2).join(' | '));

  // --- N while paused: reset() clears the flag, and the loop has to resume cleanly
  keydown(env, 'KeyP'); env.tick(30);
  keydown(env, 'KeyN'); env.tick(120);
  ok(!CC.Control.paused, 'N while paused released the pause');
  return [env, fs];
});

/* ============================================================================================
 * 7b. WORLDS — the digits, the fragment, and the rebuild that a world change is.
 *
 * This is the case that would have caught the whole shape of the feature going wrong, and there
 * are four separate things in it that only a running page can answer: that a digit reaches
 * main.js's `world` hook at all, that the hook rebuilds on the SAME seed rather than reseeding,
 * that the fragment it writes round-trips back through worldFromHash on a reload, and that a
 * rebuilt world actually draws — an element list filtered to the wrong world renders an empty
 * frame and nothing in src/ would notice.
 * ========================================================================================== */
testCase('worlds', function (ok) {
  const env = makeEnv({ hash: '#4242' }).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(90);
  ok(CC.World.id === 'cyber', 'a bare seed fragment boots the city', CC.World.id);
  const drew0 = env.get('drawImage');
  ok(drew0 > 0, 'the city drew', drew0);

  keydown(env, 'Digit2'); keyup(env, 'Digit2');
  env.tick(90);
  ok(CC.World.id === 'west', '2 moved to the frontier', CC.World.id);
  ok(CC.Main.seed === 4242, 'the seed came with it — a world change is not a reseed', CC.Main.seed);
  ok(env.win.location.hash === '#west/4242', 'the fragment names the world', env.win.location.hash);
  const drew1 = env.get('drawImage') - drew0;
  ok(drew1 > 0, 'the frontier drew', drew1);
  ok(env.errors.length === 0, 'no exceptions across the switch');

  keydown(env, 'Digit1'); keyup(env, 'Digit1');
  env.tick(60);
  ok(CC.World.id === 'cyber', '1 came back to the city', CC.World.id);
  ok(env.win.location.hash === '#4242', 'the default world drops its prefix again', env.win.location.hash);

  /* Pressing the world you are already in must not restart the walk. */
  const before = camSnap(CC);
  keydown(env, 'Digit1'); keyup(env, 'Digit1');
  env.tick(4);
  ok(dist(before, camSnap(CC)) < 3, '1 while already in the city did not rebuild');

  /* A digit past the end of the list is not a world and must not be swallowed as one. */
  keydown(env, 'Digit7'); keyup(env, 'Digit7');
  env.tick(30);
  ok(CC.World.id === 'cyber', 'a digit with no world behind it changes nothing', CC.World.id);

  /* ---- the gamepad's world button -----------------------------------------------------------
   * A pad is the one input device other than a keyboard that can reach the second world, so the
   * button is worth a test rather than worth trusting. Button 3 is Y on an Xbox pad and triangle
   * on a PlayStation one under the standard mapping. The EDGE is the thing being checked: held
   * down, it must move exactly one world and then stop. */
  /* `connected` matters: pollPad skips a pad without it, which is what a browser reports for a
   * slot that has been unplugged. */
  const pad = { connected: true, axes: [0, 0, 0, 0], buttons: [] };
  for (let i = 0; i < 8; i++) pad.buttons.push({ pressed: false, value: 0 });
  env.pads = [pad];
  env.fire(env.win, 'gamepadconnected', {});
  env.tick(10);
  ok(CC.World.id === 'cyber', 'plugging a pad in changes nothing on its own', CC.World.id);
  pad.buttons[3].pressed = true;
  env.tick(60);                                   // held down for a whole second
  ok(CC.World.id === 'west', 'Y moved to the frontier', CC.World.id);
  ok(env.win.location.hash === '#west/4242', 'and wrote the fragment', env.win.location.hash);
  /* WALK THE WHOLE ROSTER rather than assuming one more press comes home — which is what this
   * asserted while there were exactly two worlds, and which became false the moment there were
   * three. It now presses count-1 more times and checks it has arrived back at the start, so it
   * stays true however many worlds the registry grows. */
  for (var wi = 1; wi < CC.World.count; wi++) {
    pad.buttons[3].pressed = false;
    env.tick(6);
    pad.buttons[3].pressed = true;
    env.tick(20);
  }
  ok(CC.World.id === 'cyber', 'pressing Y once per world walks the whole roster home', CC.World.id);
  pad.buttons[3].pressed = false;
  env.pads = [];
  env.tick(20);
  ok(env.errors.length === 0, 'the pad threw nothing');

  // Cold boot straight into the frontier, which is the form a shared link takes.
  const w = makeEnv({ hash: '#west/77' }).run();
  w.tick(90);
  ok(!!w.CC && w.CC.World.id === 'west', '#west/77 boots the frontier', w.CC && w.CC.World.id);
  ok(!!w.CC && w.CC.Main.seed === 77, '#west/77 boots seed 77', w.CC && w.CC.Main.seed);
  ok(w.get('replaceState') === 0, 'a complete fragment is not rewritten on boot', w.get('replaceState'));
  ok(w.get('drawImage') > 0, 'the frontier drew from a cold boot', w.get('drawImage'));
  ok(w.errors.length === 0, 'cold boot into the frontier threw nothing');

  // And the alias, because it is the word a person types.
  const a = makeEnv({ hash: '#western/5' }).run();
  a.tick(30);
  ok(!!a.CC && a.CC.World.id === 'west', '#western/5 is the same place', a.CC && a.CC.World.id);

  /* THE THIRD WORLD BOOTS AND DRAWS. This is the case that would have caught the whole class of
   * silent third-world failures the plumbing audit found — a world whose theme, painter, weather
   * table or element gate falls through to the city renders a perfectly good frame of the WRONG
   * PLACE, and nothing short of looking would notice. Checking that it drew is not enough on its
   * own, so the element count is checked too: the Moon must not be running the city's rain. */
  const m = makeEnv({ hash: '#moon/9' }).run();
  m.tick(90);
  ok(!!m.CC && m.CC.World.id === 'moon', '#moon/9 boots Moonwalk', m.CC && m.CC.World.id);
  ok(!!m.CC && m.CC.Main.seed === 9, 'and seed 9', m.CC && m.CC.Main.seed);
  ok(m.get('drawImage') > 0, 'Moonwalk drew', m.get('drawImage'));
  ok(!!m.CC && m.CC.Weather.PRESETS.length === 1,
     'Moonwalk runs its own weather table, not the city\'s six',
     m.CC && m.CC.Weather.PRESETS.length);
  ok(m.errors.length === 0, 'Moonwalk threw nothing');

  /* THE CLOCK. T steps the time of day and Y stops it; neither may seize the camera. */
  const d = makeEnv({}).run();
  d.tick(60);
  /* Asserted on the PHASE and not on the name, which is a real distinction rather than pedantry:
   * the clock's six stops are not six names. 'night' is both the stop at phase 0.00 and the whole
   * band from 0.795 round to 0.225, so a seed that opens at 0.85 steps to 0.00 and is still, quite
   * correctly, called night. The first version of this check asserted the name changed and failed
   * on exactly that seed. */
  const t0 = d.CC.Daylight.P.phase;
  keydown(d, 'KeyT'); keyup(d, 'KeyT'); d.tick(6);
  ok(Math.abs(d.CC.Daylight.P.phase - t0) > 1e-6, 'T stepped the time of day',
     t0.toFixed(3) + ' -> ' + d.CC.Daylight.P.phase.toFixed(3) + ' (' + d.CC.Daylight.P.name + ')');
  ok(d.CC.Control.mode === 0, 'T did not seize the camera', d.CC.Control.mode);
  const names = {};
  for (var q = 0; q < 6; q++) { keydown(d, 'KeyT'); keyup(d, 'KeyT'); d.tick(6);
                                names[d.CC.Daylight.P.name] = 1; }
  ok(Object.keys(names).length >= 5, 'six presses of T visit the whole clock',
     Object.keys(names).join(','));
  keydown(d, 'KeyY'); keyup(d, 'KeyY'); d.tick(4);
  ok(d.CC.Daylight.frozen === true, 'Y stopped the automatic cycle');
  const held = d.CC.Daylight.P.phase;
  d.tick(600);
  ok(Math.abs(d.CC.Daylight.P.phase - held) < 1e-9, 'and the clock is holding still',
     d.CC.Daylight.P.phase.toFixed(5));
  keydown(d, 'KeyY'); keyup(d, 'KeyY'); d.tick(60);
  ok(d.CC.Daylight.frozen === false, 'Y again restarted it');
  ok(d.CC.Daylight.P.phase > held, 'and it picked up from where it stopped');
  ok(d.errors.length === 0, 'the clock keys threw nothing');
  return env;
});

/* ============================================================================================
 * 8. hashchange, including the documented #0 bug class
 * ========================================================================================== */
testCase('hash', function (ok) {
  const env = makeEnv({}).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(60);

  env.win.location.hash = '#424242';
  env.fire(env.win, 'hashchange', {});
  env.tick(60);
  ok(CC.Main.seed === 424242, 'hashchange to #424242 rebuilt that city', CC.Main.seed);

  env.win.location.hash = '#0';
  env.fire(env.win, 'hashchange', {});
  env.tick(60);
  ok(CC.Main.seed === 0, 'hashchange to #0 built city 0, not a random one', CC.Main.seed);

  const rs = env.get('replaceState');
  env.fire(env.win, 'hashchange', {});
  env.tick(30);
  ok(CC.Main.seed === 0 && env.get('replaceState') === rs, 'a hashchange to the same seed rebuilds nothing');

  env.win.location.hash = '#shinjuku';
  env.fire(env.win, 'hashchange', {});
  env.tick(60);
  const named = CC.Main.seed;
  ok(named !== 0, 'a named city folds to its own seed', named);
  env.win.location.hash = '#99999999999999999999';
  env.fire(env.win, 'hashchange', {});
  env.tick(60);
  ok(CC.Main.seed !== 0 && CC.Main.seed !== named, 'a 20-digit fragment does not fold onto city 0', CC.Main.seed);

  ok(env.errors.length === 0, 'no exceptions from any hashchange');

  // Cold boot straight into #0: the fragment must be left exactly as the visitor wrote it.
  const z = makeEnv({ hash: '#0' }).run();
  z.tick(60);
  ok(!!z.CC && z.CC.Main.seed === 0, 'cold boot at #0 builds city 0', z.CC && z.CC.Main.seed);
  ok(z.get('replaceState') === 0, 'cold boot at #0 does not overwrite the fragment', z.get('replaceState'));
  ok(z.errors.length === 0, 'cold boot at #0 threw nothing');

  const n = makeEnv({ hash: '#seed=1234' }).run();
  n.tick(30);
  ok(!!n.CC && n.CC.Main.seed === 1234, 'the #seed= form is accepted', n.CC && n.CC.Main.seed);

  const neg = makeEnv({ hash: '#-1' }).run();
  neg.tick(30);
  ok(!!neg.CC && neg.CC.Main.seed === 4294967295, '#-1 still names the top of the range', neg.CC && neg.CC.Main.seed);
  return env;
});

/* ============================================================================================
 * 9. pointer drag look, pointer lock, and two fingers at once
 * ========================================================================================== */
testCase('pointer', function (ok) {
  // --- 9a: mouse drag, pointer lock refused (the usual case without a user gesture)
  const env = makeEnv({ w: 1280, h: 800 }).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(60);
  const y0 = CC.Control.pose.yaw;
  pointerdown(env, { pointerId: 1, pointerType: 'mouse', clientX: 600, clientY: 400 });
  ok(env.get('setPointerCapture') === 1, 'the canvas captured the pointer', env.get('setPointerCapture'));
  ok(env.get('requestPointerLock') === 1, 'a click asked for pointer lock', env.get('requestPointerLock'));
  ok(env.get('requestFullscreen') === 1, 'a click also asked for fullscreen');
  pointermove(env, { pointerId: 1, pointerType: 'mouse', clientX: 640, clientY: 400 });
  env.tick(30);
  const dy = CC.Control.pose.yaw - y0;
  ok(Math.abs(dy - 40 * 0.0022) < 0.02, 'a 40 px drag turned the viewer by 40 * MOUSE radians', dy.toFixed(4));
  ok(CC.Control.mode === 1, 'dragging took the camera over');

  const y1 = CC.Control.pose.yaw;
  pointerup(env, { pointerId: 1, pointerType: 'mouse', clientX: 640, clientY: 400 });
  pointermove(env, { pointerId: 1, pointerType: 'mouse', clientX: 900, clientY: 400 });
  env.tick(30);
  ok(Math.abs(CC.Control.pose.yaw - y1) < 1e-6, 'a move after pointerup does not look', CC.Control.pose.yaw - y1);

  // --- wheel zoom
  const fov0 = CC.Main.cam.fov;
  for (let i = 0; i < 6; i++) env.fire(env.win, 'wheel', { deltaY: -100 });
  env.tick(60);
  ok(CC.Main.cam.fov < fov0 - 0.05, 'the wheel narrowed the field of view', fov0.toFixed(3) + ' -> ' + CC.Main.cam.fov.toFixed(3));
  ok(CC.Main.cam.fov >= 1.02 - 1e-9, 'fov stayed inside its clamp', CC.Main.cam.fov);

  // --- blur must release every held key
  keydown(env, 'KeyW'); env.tick(30);
  env.fire(env.win, 'blur', {});
  env.tick(300);
  const bx = camSnap(CC);
  env.tick(60);
  ok(dist(bx, camSnap(CC)) < 2.5, 'losing focus stopped the walk', dist(bx, camSnap(CC)).toFixed(2));

  // --- 9b: pointer lock granted, movementX path
  const lk = makeEnv({ grantPointerLock: true }).run();
  lk.tick(60);
  const ly0 = lk.CC.Control.pose.yaw;
  pointerdown(lk, { pointerId: 1, pointerType: 'mouse', clientX: 600, clientY: 400 });
  ok(lk.doc.pointerLockElement === lk.cc, 'pointer lock was granted to the canvas');
  for (let i = 0; i < 10; i++) pointermove(lk, { pointerId: 1, pointerType: 'mouse', movementX: 12, movementY: 0 });
  lk.tick(60);
  ok(Math.abs(lk.CC.Control.pose.yaw - ly0 - 120 * 0.0022) < 0.03,
    'locked mouse movement drives yaw through movementX', (lk.CC.Control.pose.yaw - ly0).toFixed(4));
  keydown(lk, 'Escape'); keyup(lk, 'Escape');
  lk.tick(30);
  ok(lk.get('exitPointerLock') === 1, 'Escape released pointer lock', lk.get('exitPointerLock'));
  lk.tick(200);
  ok(lk.CC.Control.mode === 0, 'Escape handed the camera back', lk.CC.Control.mode);

  // --- 9c: two fingers at once, one per screen half
  const t = makeEnv({ w: 390, h: 844, dpr: 2 }).run();
  t.tick(60);
  const TC = t.CC;
  const ty0 = TC.Control.pose.yaw;
  pointerdown(t, { pointerId: 11, pointerType: 'touch', clientX: 90, clientY: 600 });
  pointerdown(t, { pointerId: 12, pointerType: 'touch', clientX: 300, clientY: 300 });
  ok(t.get('setPointerCapture') === 2, 'both fingers were captured', t.get('setPointerCapture'));

  // The stick finger alone: it must walk and it must NOT look.
  /* The yaw baseline is taken AFTER the first stick move, not before: take-over re-seeds the
   * viewer pose out of the autopilot's (see seedFromAuto), so pyaw legitimately steps to the
   * route's current heading on the tick the thumb first moves. Measuring across that step would
   * be measuring the seed, not a leak from the stick. */
  pointermove(t, { pointerId: 11, pointerType: 'touch', clientX: 90, clientY: 530 });
  t.tick(10);
  ok(TC.Control.mode === 1, 'touch took the camera over');
  const ty0b = TC.Control.pose.yaw;
  const tp0 = pose(TC);
  for (let i = 0; i < 12; i++) {
    pointermove(t, { pointerId: 11, pointerType: 'touch', clientX: 90, clientY: 600 - 70 });
    t.tick(10);
  }
  ok(Math.abs(TC.Control.pose.yaw - ty0b) < 1e-12,
    'the walking finger did not spin the camera', TC.Control.pose.yaw - ty0b);
  ok(dist(tp0, pose(TC)) > 1.0, 'the walking finger walked', dist(tp0, pose(TC)).toFixed(2) + ' m');

  // Now the look finger, while the stick finger is still down.
  const ty1 = TC.Control.pose.yaw;
  const tp1 = pose(TC);
  for (let i = 0; i < 8; i++) {
    pointermove(t, { pointerId: 12, pointerType: 'touch', clientX: 300 + 10 * (i + 1), clientY: 300 });
    t.tick(8);
  }
  ok(Math.abs(TC.Control.pose.yaw - ty1) > 0.1, 'the look finger turned the camera',
    (TC.Control.pose.yaw - ty1).toFixed(3));
  ok(dist(tp1, pose(TC)) > 0.3, 'and the stick finger kept walking at the same time',
    dist(tp1, pose(TC)).toFixed(2) + ' m');

  pointerup(t, { pointerId: 11, pointerType: 'touch' });
  pointerup(t, { pointerId: 12, pointerType: 'touch' });
  t.tick(60);
  ok(t.errors.length === 0, 'no exceptions from the touch path');
  ok(env.errors.length === 0 && lk.errors.length === 0, 'no exceptions from the mouse or lock paths');
  return [env, lk, t];
});

/* ============================================================================================
 * 10. prefers-reduced-motion, from cold
 * ========================================================================================== */
testCase('reduced-motion', function (ok) {
  const env = makeEnv({ reducedMotion: true }).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  ok(CC.reducedMotion === true, 'CC.reducedMotion was set BEFORE any element initialised');
  const c0 = camSnap(CC);
  env.tick(300);
  const c1 = camSnap(CC);
  ok(Math.abs(c1.t - 5 * 0.35) < 0.15, 'the clock runs at 35% speed', c1.t.toFixed(3));
  ok(dist(c0, c1) > 0.5, 'reduced motion still walks — it is not a still', dist(c0, c1).toFixed(2) + ' m');
  ok(env.get('drawImage') > 300 * 100, 'and it still draws', env.get('drawImage'));

  // The live media-query change is wired too, and nothing had ever fired it.
  env.mq.matches = false;
  env.fire(env.mq, 'change', { matches: false });
  env.tick(60);
  ok(CC.reducedMotion === false, 'the media query change was honoured');
  env.mq.matches = true;
  env.fire(env.mq, 'change', { matches: true });
  env.tick(60);
  ok(CC.reducedMotion === true, 'and honoured back');

  // Look rate must be capped harder under the preference.
  keydown(env, 'ArrowRight');
  const y0 = CC.Control.pose.yaw;
  env.tick(60);
  keyup(env, 'ArrowRight');
  ok(Math.abs(CC.Control.pose.yaw - y0) < 1.2 * 0.35 + 0.2, 'yaw rate is damped', (CC.Control.pose.yaw - y0).toFixed(3));
  ok(env.errors.length === 0, 'no exceptions under reduced motion');
  return env;
});

/* ============================================================================================
 * 11. adaptive quality — degrade to one bloom tap, then to fewer columns, then recover
 * ========================================================================================== */
testCase('adaptive-quality', function (ok) {
  const env = makeEnv({ frameCost: 40 }).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  const cols0 = CC.Main.cols;
  env.tick(120);
  ok(CC.Canvas.quality === 1, 'a 40 ms frame dropped the bloom to one tap first', CC.Canvas.quality);
  const drewAtQ1 = env.get('cc.drawImage');
  env.tick(60);
  ok(env.get('cc.drawImage') - drewAtQ1 >= 60 * 2, 'the degraded composite still draws scene + one tap',
    env.get('cc.drawImage') - drewAtQ1);
  env.tick(120);
  ok(CC.Main.cols < cols0, 'and only then did it give up columns', cols0 + ' -> ' + CC.Main.cols);
  ok(env.bounds.length === 0, 'the mid-loop relayout left no bad draws', env.bounds.slice(0, 2).join(' | '));

  env.frameCost = 4;
  env.tick(900);                                     // two 6 s recovery windows
  ok(CC.Main.cols === cols0, 'columns came back first', CC.Main.cols);
  ok(CC.Canvas.quality === 2, 'then the full bloom', CC.Canvas.quality);

  // quality 0 is reachable only by hand; it must still put the frame on the glass.
  CC.Canvas.setQuality(0);
  const q0 = env.get('cc.drawImage');
  env.tick(60);
  ok(env.get('cc.drawImage') - q0 >= 60, 'quality 0 still blits the scene', env.get('cc.drawImage') - q0);
  CC.Canvas.setQuality(2);
  env.tick(30);
  ok(env.errors.length === 0, 'no exceptions across the quality ladder');
  return env;
});

/* ============================================================================================
 * 12. a browser with no ctx.filter (older WebKit) — the bloom falls back to the downsample chain
 * ========================================================================================== */
testCase('no-ctx-filter', function (ok) {
  const env = makeEnv({ filterSupported: false }).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(200);
  ok(CC.Canvas.hasFilter === false, 'the filter probe correctly reported no support');
  ok(env.get('drawImage') > 200 * 100, 'the glyph pass still ran', env.get('drawImage'));
  ok(env.get('cc.drawImage') >= 200 * 3, 'the bloom taps still composited', env.get('cc.drawImage'));
  ok(env.bounds.length === 0, 'no bad draws', env.bounds.slice(0, 2).join(' | '));
  ok(env.errors.length === 0, 'no exceptions without ctx.filter');
  return env;
});

/* ============================================================================================
 * 13. DOMContentLoaded boot — the page loaded while the document was still parsing
 * ========================================================================================== */
testCase('deferred-boot', function (ok) {
  const env = makeEnv({ readyState: 'loading' }).run();
  ok(!env.CC || !env.CC.Main || env.CC.Main.cols === 0, 'nothing booted while the document was parsing');
  env.doc.readyState = 'complete';
  env.fire(env.doc, 'DOMContentLoaded', {});
  env.tick(120);
  const CC = env.CC;
  if (!ok(!!CC && !!CC.Main, 'DOMContentLoaded booted the page')) return env;
  ok(CC.Main.cols > 0, 'a grid was laid out', CC.Main.cols + 'x' + CC.Main.rows);
  ok(env.get('drawImage') > 120 * 100, 'and it drew', env.get('drawImage'));
  ok(env.errors.length === 0, 'no exceptions on the deferred path');
  return env;
});

/* ============================================================================================
 * 14. Tab, and the no-#cc-element fallback
 * ========================================================================================== */
testCase('tab-and-fallback', function (ok) {
  const env = makeEnv({}).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(60);
  keydown(env, 'Tab'); keyup(env, 'Tab');
  env.tick(30);
  ok(CC.Control.mode === 1, 'Tab took the camera', CC.Control.mode);
  keydown(env, 'Tab'); keyup(env, 'Tab');
  env.tick(300);
  ok(CC.Control.mode === 0, 'Tab again gave it back', CC.Control.mode);

  // A page whose canvas is missing must create one rather than die.
  const f = makeEnv({});
  f.doc.getElementById = function () { f.bump('getElementById'); return null; };
  f.run();
  f.tick(60);
  ok(!!f.CC && !!f.CC.Main && f.CC.Main.cols > 0, 'boot created its own canvas when #cc was absent');
  ok(f.get('appendChild') >= 1, 'and appended it to the body', f.get('appendChild'));
  ok(f.get('drawImage') > 60 * 50, 'and drew into it', f.get('drawImage'));
  ok(f.errors.length === 0 && env.errors.length === 0, 'no exceptions');
  return [env, f];
});

/* ============================================================================================
 * 15. a backgrounded tab, an orientation flip, and a dpr the layout has to cap
 * ========================================================================================== */
testCase('background-and-orientation', function (ok) {
  const env = makeEnv({ w: 390, h: 844, dpr: 3 }).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(60);
  const cell = env.cc.width / CC.Main.cols;
  ok(cell <= 6.4 * 2 + 1, 'devicePixelRatio 3 was capped at 2 by layout', cell);

  // A tab that was in the background hands back a gap of minutes on the next rAF timestamp.
  const before = camSnap(CC);
  env.tick(1, 120000);                              // one frame, two minutes later
  const after = camSnap(CC);
  ok(after.t - before.t <= 5 / 60 + 1e-9, 'a two-minute gap advanced the sim by at most 5 ticks',
    (after.t - before.t).toFixed(4));
  ok(dist(before, after) < 1, 'and the camera did not teleport across the city', dist(before, after).toFixed(3));
  env.tick(60);
  ok(env.errors.length === 0, 'no exceptions after the gap');

  // A rAF timestamp that goes backwards (clock adjustment, or a browser quirk).
  env.tick(1, -5000);
  env.tick(30);
  ok(isFinite(CC.Main.cam.x) && isFinite(CC.Main.cam.t), 'a backwards timestamp did not poison the clock',
    CC.Main.cam.t.toFixed(3));

  // Orientation flip: same listener as resize, and it must relayout to the new aspect.
  env.win.innerWidth = 844; env.win.innerHeight = 390;
  env.fire(env.win, 'orientationchange', {});
  env.tick(20); env.tick(40);
  ok(CC.Main.cols > CC.Main.rows, 'the flip produced a landscape grid', CC.Main.cols + 'x' + CC.Main.rows);
  ok(env.cc.width >= 844 * 2 && env.cc.height >= 390 * 2, 'and a canvas that covers it',
    env.cc.width + 'x' + env.cc.height);
  ok(env.bounds.length === 0, 'no bad draws', env.bounds.slice(0, 2).join(' | '));
  ok(env.errors.length === 0, 'no exceptions across the flip');
  return env;
});

/* ============================================================================================
 * 16. a browser that REFUSES fullscreen and pointer lock
 *
 * Both entry points return a promise now, and a refused request rejects it. Nothing may be left
 * unhandled: an unhandled rejection is a console error on a page whose whole pitch is that it is
 * quiet and self-contained. This is also the only case that runs the legacy, undefined-returning
 * shape of both APIs, which the guards still have to tolerate.
 * ========================================================================================== */
testCase('denied-permissions', function (ok) {
  const env = makeEnv({ fullscreenDenied: true }).run();
  const CC = env.CC;
  if (!ok(!!CC, 'booted')) return env;
  env.tick(30);
  keydown(env, 'KeyF'); keyup(env, 'KeyF');
  pointerdown(env, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 200 });
  pointerup(env, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 200 });
  env.tick(60);
  ok(env.get('requestFullscreen') >= 1, 'fullscreen was requested', env.get('requestFullscreen'));
  ok(env.get('requestPointerLock') >= 1, 'pointer lock was requested', env.get('requestPointerLock'));
  ok(env.get('fsPromise.catch') >= 1, 'the fullscreen promise was caught', env.get('fsPromise.catch'));
  ok(env.get('lockPromise.catch') >= 1, 'the pointer-lock promise was caught', env.get('lockPromise.catch'));
  const un = env.unhandledPromises();
  ok(un.length === 0, 'no promise was left unhandled', un.map(p => p.kind).join(','));
  ok(env.doc.fullscreenElement === null, 'the page stayed windowed, as refused');
  ok(env.get('drawImage') > 90 * 40, 'and it kept drawing regardless', env.get('drawImage'));

  // The pre-promise shape of both APIs must still be tolerated.
  const old = makeEnv({ legacyFullscreenApi: true, legacyLockApi: true }).run();
  old.tick(30);
  keydown(old, 'KeyF'); keyup(old, 'KeyF');
  pointerdown(old, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 200 });
  old.tick(60);
  ok(old.get('requestFullscreen') === 1 && old.get('requestPointerLock') === 1,
    'the undefined-returning legacy APIs were called');
  ok(old.errors.length === 0, 'and nothing threw on their undefined return');
  return [env, old];
});

/* ---- run ------------------------------------------------------------------------------------ */
let failed = 0, passed = 0;
const allErrors = [];
const report = [];

for (const c of CASES) {
  if (ONLY && ONLY.indexOf(c.name) < 0) continue;
  const rec = [];
  const ok = mkCheck(rec);
  let envs = null;
  try { envs = c.fn(ok); }
  catch (e) {
    rec.push({ ok: false, label: 'the case itself threw', detail: e.message });
    allErrors.push({ where: c.name + ' (harness)', message: e.message, stack: e.stack });
  }
  const list = Array.isArray(envs) ? envs : (envs ? [envs] : []);
  for (const e of list) {
    for (const x of e.errors) allErrors.push({ where: c.name + ' / ' + x.where, message: x.message, stack: x.stack });
    for (const b of e.bounds) allErrors.push({ where: c.name + ' / draw bounds', message: b, stack: '(stub check)' });
    /* A promise the page never attached a handler to is an unhandled rejection waiting to print in
     * somebody's console, so it is reported next to the thrown exceptions rather than as a nicety. */
    for (const p of e.unhandledPromises())
      allErrors.push({
        where: c.name + ' / unhandled promise',
        message: p.kind + ' was returned to the page and never caught',
        stack: '(stub check)'
      });
  }
  const bad = rec.filter(r => !r.ok);
  passed += rec.length - bad.length;
  failed += bad.length;
  report.push({ name: c.name, rec: rec, bad: bad.length });
}

for (const r of report) {
  console.log((r.bad ? 'FAIL  ' : 'ok    ') + r.name + '  (' + (r.rec.length - r.bad) + '/' + r.rec.length + ')');
  for (const x of r.rec) {
    if (!x.ok || VERBOSE)
      console.log('        ' + (x.ok ? '.' : 'X') + ' ' + x.label + (x.detail ? '   [' + x.detail + ']' : ''));
  }
}

if (allErrors.length) {
  console.log('\n--- exceptions and bad draws (' + allErrors.length + ') ---');
  const seen = new Set();
  for (const e of allErrors) {
    const k = e.where + '|' + e.message;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log('\n[' + e.where + '] ' + e.message);
    console.log(String(e.stack).split('\n').slice(0, 6).map(s => '    ' + s.trim()).join('\n'));
  }
  const dupes = allErrors.length - seen.size;
  if (dupes) console.log('\n(' + dupes + ' further repeats of the above suppressed)');
}

console.log('\n' + (failed ? 'FAILED' : 'PASSED') + ': ' + passed + ' checks passed, ' + failed +
            ' failed, ' + allErrors.length + ' exceptions/bad draws');
process.exit(failed || allErrors.length ? 1 : 0);
