/* CyberCity build — concatenate src/ into index.html plus one script per secondary world.
 *
 * No dependencies, no bundler, no minifier, no source maps. The modules were written to be
 * concatenated: each is an IIFE that resolves CC out of lexical scope, so wrapping the lot in one
 * more IIFE is the entire "bundling" step. Everything this script does beyond `join('\n')` is
 * removing the CommonJS tails that exist only so tools/headless.cjs can require the same files,
 * and — since the split, see THE SPLIT below — parking three worlds' modules in w/*.js so that
 * the one IIFE can call them back in at exactly the place they used to sit.
 *
 * Run: node build.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname);
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'index.html');

/* Order is load-bearing, not alphabetical: city.js binds core's helpers at make(), raycast.js
 * throws without CC.Surf, every element pushes onto CC.ELEMENTS before main.js reads that array,
 * and main.js boots on the last line of the file. compose.js is optional — the contract allows it
 * to not exist yet — so it is filtered out rather than assumed. */
const ORDER = [
  'core.js',
  'world.js',           // first after core: city.js resolves CC.World inside make(), weather_state
                        // inside init(), surfaces inside beginFrame — all of them AFTER load, so
                        // only the registry's existence matters here, not its value
  'proj.js',            // the shared element camera; every world-space element file holds one
  'daylight.js',        // before weather_state.js and before the elements: both read the hour
  'weather_state.js',   // before the elements: they read CC.Weather from init() onwards
  'city.js',
  'surfaces.js',
  '@painters',          // expands to src/surf_*.js, sorted. Globbed rather than named one by one
                        // for the same reason @elements is: a painter dropped into src/ and not
                        // added to this list is silently absent from the bundle, and the symptom
                        // is not an error — it is a world that renders as the city
  'raycast.js',
  'control.js',         // after city.js, whose route it re-anchors to; before main.js, which drives it
  'compose.js',
  '@elements',        // expands to src/elements/*.js, sorted, so a build is reproducible
  'render_canvas.js',
  'main.js'
];

function expand(list) {
  const out = [];
  for (const name of list) {
    if (name === '@painters') {
      for (const pf of fs.readdirSync(SRC).sort())
        if (/^surf_.*\.js$/.test(pf)) out.push(path.join(SRC, pf));
      continue;
    }
    if (name === '@elements') {
      const dir = path.join(SRC, 'elements');
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).sort())
        if (f.endsWith('.js')) out.push(path.join(dir, f));
      continue;
    }
    const p = path.join(SRC, name);
    if (fs.existsSync(p)) out.push(p);
    else if (name !== 'compose.js') throw new Error('missing required module src/' + name);
  }
  return out;
}

/* ---- CommonJS strip -------------------------------------------------------------------------
 * Two shapes appear in src/, both harmless at runtime in a browser (the ternary short-circuits
 * before require is ever evaluated, and `typeof module` is a safe read on an undeclared name) —
 * but leaving them in ships dead branches referencing `require`, which is exactly the kind of
 * thing a CSP-conscious reader greps for in a "zero network requests" file. They come out. */
function strip(src) {
  return src
    // `(typeof CC !== 'undefined' ? CC : require('../core.js'))` -> `CC`
    .replace(/typeof\s+CC\s*!==\s*(['"])undefined\1\s*\?\s*CC\s*:\s*require\(\s*(['"]).*?\2\s*\)/g, 'CC')
    // one-liner: `if (typeof module !== 'undefined') module.exports = X;`
    .replace(/^[ \t]*if\s*\(\s*typeof\s+module\s*!==\s*(['"])undefined\1\s*\)\s*module\.exports\s*=[^\n]*;[ \t]*$/gm, '')
    // wrapped form: the `if` on its own line, the assignment on the next
    .replace(/^[ \t]*if\s*\(\s*typeof\s+module\s*!==\s*(['"])undefined\1\s*\)\r?\n[ \t]*module\.exports\s*=[^;]*;[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

/* ---- comment strip ---------------------------------------------------------------------------
 * src/ is ~40% prose by weight — this codebase explains WHY on nearly every non-obvious line — and
 * carrying all of it inline would put index.html at 253 KB against a 200 KB budget. The comments
 * belong in src/, which is where anyone editing this reads them; the deliverable is a picture.
 *
 * This is a scanner, not a regex, because a regex cannot tell `//` inside a string or a regex
 * literal from a comment, and getting that wrong corrupts the page silently. It tracks the three
 * literal forms and uses the standard previous-significant-token rule to decide whether a `/`
 * opens a regex or is a division. The `new Function` compile check further down is the backstop:
 * anything this mangles fails the build instead of shipping. */
const REGEX_OK_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void',
                                'instanceof', 'throw', 'do', 'else', 'yield', 'await']);
const IDENT = /[A-Za-z0-9_$]/;
/* A `/` after any of these is division, never a regex, because all of them end a VALUE.
 * `)` and `]` are the ones that matter here: `(v - 0.62) / (st.gnd - 2.2)` is everywhere in
 * surfaces.js, and reading that `/` as a regex opener swallows the rest of the file into a
 * literal and every comment after it ships. */
const DIV_AFTER = /[A-Za-z0-9_$)\]]/;

/* ---- indent folding -------------------------------------------------------------------------
 * Two spaces of indent per level become one, and ONLY at the start of a line the scanner reached
 * through the code path — never inside a string, because a template literal's newline is emitted
 * by the string branch below and the fold only ever fires immediately after the fallthrough or the
 * block-comment branch has written a '\n' itself. Multi-line templates are therefore safe by
 * construction rather than by inspection, which matters: there are none in src/ today and this has
 * to keep being true when there are.
 *
 * WHY IT HAPPENED, and it is a raise refused rather than a tidy. The 560 KB budget below is a
 * commitment with a whole essay attached saying the next pass over the line must CUT before it
 * moves the number. This pass went over — three worlds' worth of texture and colour work landed at
 * 575.5 KB — and the two things the essay names as cuttable are content (wrong way round; that is
 * the deliverable) and indentation, which it refuses on the grounds that stripping it turns a
 * viewable page source into a wall.
 *
 * Both of the numbers that refusal rests on are now false, and that is the finding. The note under
 * the return below says indentation costs "~6 KB"; the budget essay says "about 25 KB". MEASURED on
 * the bundle this pass produces: 84,232 bytes of leading whitespace over 16,505 lines, 14.3% of the
 * file. It stopped being a rounding error two worlds ago and nobody re-measured it.
 *
 * So the fold is the middle answer neither note considered: HALVE it, do not strip it. Every line
 * keeps its indentation and its structure, at one space per level instead of two, and the page
 * source is still a nested document rather than a wall — which is the thing the refusal was
 * actually protecting. Worth 42,134 bytes, taking the bundle to 534.4 KB with 25.6 KB of headroom
 * under a line that does not move. Rejected: stripping indentation outright (worth 84 KB and it is
 * the wall the note refuses), and stripping the blank line decomment leaves between paragraphs
 * (2.4 KB, and it is the only thing left separating one thought from the next). */
function foldIndent(src, i) {
  let w = 0;
  while (i < src.length && (src[i] === ' ' || src[i] === '\t')) { w++; i++; }
  return { text: w > 1 ? ' '.repeat(w >> 1) : '', i: i };
}

function decomment(src) {
  let out = '', i = 0, prev = '', word = '';
  const n = src.length;
  /* ...except after a keyword, where `return /re/` is a regex even though `n` is an ident char. */
  const regexAllowed = () => prev === '' || !DIV_AFTER.test(prev) || REGEX_OK_WORDS.has(word);

  { const f = foldIndent(src, 0); out += f.text; i = f.i; }   // the file's own first line

  while (i < n) {
    const c = src[i];

    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;      // the newline itself stays: ASI depends on it
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const start = i; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      /* A comment sits BETWEEN two tokens, so it cannot vanish without leaving a separator behind
       * or an inline one welds its two neighbours into a single identifier. A multi-line one
       * collapses to a newline instead, so ASI keeps behaving exactly as it did in src/. */
      if (src.slice(start, i).indexOf('\n') >= 0) {
        out += '\n';
        const f = foldIndent(src, i); out += f.text; i = f.i;
      } else out += ' ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      out += c; i++;
      while (i < n) {
        const d = src[i]; out += d; i++;
        if (d === '\\') { out += src[i]; i++; continue; }
        if (d === c) break;
      }
      prev = c; word = ''; continue;
    }
    if (c === '/' && regexAllowed()) {
      out += c; i++;
      let inClass = false;
      while (i < n) {
        const d = src[i]; out += d; i++;
        if (d === '\\') { out += src[i]; i++; continue; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
      }
      while (i < n && IDENT.test(src[i])) { out += src[i]; i++; }   // flags
      prev = '/'; word = ''; continue;
    }

    out += c; i++;
    if (c === '\n') { const f = foldIndent(src, i); out += f.text; i = f.i; continue; }
    if (!/\s/.test(c)) {
      prev = c;
      word = IDENT.test(c) ? word + c : '';
    }
  }
  /* Trailing whitespace and the blank lines the comments left behind. Indentation is HALVED rather
   * than kept whole or stripped — see foldIndent above for the measurement that changed the answer
   * and the 84,232 bytes it was hiding. */
  return out.replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n\n').trim();
}

/* ---- THE SPLIT --------------------------------------------------------------------------------
 * Three worlds leave index.html. Each one's painter and its prefixed elements go to w/<world>.js,
 * and the page loads those with plain synchronous <script src> tags placed BEFORE the inline
 * script — the essay at the bottom of this file is the decision and the reason; this is the how.
 *
 * THE CHUNKS DEFINE, THEY DO NOT RUN. Each module in a chunk is wrapped as one function filed under
 * its src/ path in a single scratch global, self.CCW, and the inline IIFE calls each one back
 * (`W(path)`) at exactly the place in ORDER the module used to be pasted. That is the whole design,
 * and the obvious alternative — cut the inline script into two tags and let the chunks run between
 * them — was measured against it and lost on two counts:
 *   REGISTRATION ORDER IS STATE. Elements push onto CC.ELEMENTS in file order, main.js sorts by
 *     layer with ties broken by that order, and every element draws from ONE shared rng in that
 *     sequence. jp_* sorts between hud.js and market.js; running the chunks as a block would move
 *     four Edo elements behind eleven shared ones and reseed whatever ties them — a different
 *     frame in the browser from the one tools/headless.cjs renders, with nothing failing.
 *   A SECOND TAG IS A SECOND SCOPE. The bundle is one IIFE with one `var CC` and nothing on window;
 *     two tags cannot share a lexical scope, so CC would have to become a global for good.
 * Filed-and-called-back keeps both: execution order is byte-for-byte today's ORDER, and the only
 * global is CCW, which the inline script takes a reference to and deletes on its first line.
 *
 * A MISSING CHUNK DEGRADES, IT DOES NOT BREAK. W() skips a path nobody filed, so a w/ file that
 * failed to load costs that world (it renders as the city, see raycast.js) and the default city
 * still boots. tools/domshim.cjs runs the real tags in DOM order and fails if any are absent, which
 * is where that has to be caught — not in the visitor's browser.
 *
 * AND A CHUNK THAT THROWS DEGRADES THE SAME WAY, which the sentence above used to promise without
 * doing. A module is called back synchronously inside the ONE bundle IIFE, so an exception in it
 * aborted every module after it — render_canvas.js and main.js included — and the page stayed
 * black. W() now catches, logs, and carries on: the world that threw is lost, the city is not.
 * The likeliest way to get there is not a bug but a CACHE: the bundle and its chunks are a matched
 * pair (a chunk's body uses whatever CC API its bundle had), and GitHub Pages serves both with
 * max-age 600, so for ten minutes after a deploy a visitor can hold a new page and an old chunk.
 * Each tag therefore carries ?v=<the chunk's content hash>, so a new bundle always asks for its
 * own chunk by a URL no cache has seen; the catch is for whatever still gets through.
 *
 * Routing is by NAME, matching how @painters and @elements already glob: a world's painter plus
 * every element carrying its prefix. A painter or element no rule claims stays inline, so a new
 * world lands in index.html until somebody gives it a chunk — the safe default, since inline is
 * what has always worked. */
const CHUNKS = [
  ['west', /^(surf_west\.js|elements\/west_)/],
  ['jp',   /^(surf_japan\.js|elements\/jp_)/],
  ['moon', /^(surf_moon\.js|elements\/moon_)/]
];
const WDIR = path.join(ROOT, 'w');
const CAP_PAGE = 600 * 1024, CAP_CHUNK = 160 * 1024;

const files = expand(ORDER);
const inline = [], chunkParts = {}, chunkFiles = {};
for (const [w] of CHUNKS) { chunkParts[w] = []; chunkFiles[w] = []; }
for (const p of files) {
  const rel = path.relative(SRC, p).split(path.sep).join('/');
  /* ---- one 'use strict', not thirty-three -----------------------------------------------------
   * Every module in src/ opens its IIFE with `'use strict';` because every module is also
   * `require`d on its own by tools/headless.cjs, where nothing else would supply it. Concatenated,
   * that is 33 copies of the same 13-byte directive inside one wrapper that is itself sloppy-mode —
   * so the directive is doing real work per module and cannot simply be deleted.
   *
   * Hoisting it is the cut. One directive on the wrapper makes the WHOLE bundle strict, which is
   * exactly the union of what the 33 were doing individually, and there is no code in the bundle
   * outside a module IIFE for it to newly apply to. 481 bytes, and the only non-content cut left
   * after the dead-identifier sweep that does not touch a line of source. A chunked module's
   * wrapper function carries the directive instead, since a w/ file is its own script and would
   * otherwise be sloppy.
   *
   * The match is deliberately narrow: a line whose ENTIRE content is the directive. A `'use strict'`
   * inside a string literal or trailing another statement is left alone, because this runs after
   * decomment() and has no parser to tell it apart. */
  const body = ('/* src/' + rel + ' */\n' + decomment(strip(fs.readFileSync(p, 'utf8'))) + '\n')
    .replace(/^[ \t]*(['"])use strict\1;[ \t]*$\n?/gm, '');
  const hit = CHUNKS.find(c => c[1].test(rel));
  if (!hit) { inline.push(body); continue; }
  chunkFiles[hit[0]].push(p);
  chunkParts[hit[0]].push('W[' + JSON.stringify(rel) + '] = function (CC) {\n\'use strict\';\n' + body + '};\n');
  inline.push('W(' + JSON.stringify(rel) + ');\n');
}

/* One IIFE, one `var CC`. core.js declares CC with `var`, so it is hoisted to the top of this
 * function and every later module's `typeof CC !== 'undefined'` guard sees it. Nothing leaks to
 * window, which is the point: the page has no API surface to poke at. W is declared ahead of
 * core.js's `var CC` but only ever CALLED after it, so every chunk receives the live object. */
const bundle = "(function () {\n'use strict';\nvar W = (function (o) { delete self.CCW; " +
  "return function (k) { if (o[k]) try { o[k](CC); } catch (e) { console.error(k, e); } }; })(self.CCW || {});\n" + inline.join('\n') + '\n})();\n';
const chunks = CHUNKS.filter(([w]) => chunkParts[w].length).map(([w]) => ({
  name: w, rel: 'w/' + w + '.js', files: chunkFiles[w],
  text: '/* CyberCity — ' + w + ' world. Generated by build.js from src/; loaded by index.html, which\n' +
        ' * calls each function below back at its place in the build order. Do not edit by hand. */\n' +
        "(function (W) {\n" + chunkParts[w].join('\n') + '})(self.CCW || (self.CCW = {}));\n'
}));

/* Every check that used to run on the one bundle now runs on EVERY script that ships, and the
 * global list runs on their concatenation: a painter that moved to a chunk still has to be in
 * the deliverable, it just no longer has to be in index.html. */
const shipped = [{ rel: 'index.html', text: bundle }].concat(chunks);
for (const c of shipped) {
  const t = c.text, at = ' (' + c.rel + ')';
  /* The page must open with no module loader, so nothing may reference one. */
  if (/\brequire\s*\(/.test(t)) throw new Error('build: a require() survived the strip' + at);
  if (/\bmodule\.exports\b/.test(t)) throw new Error('build: a module.exports survived the strip' + at);
  if (/\bimport\s|\bexport\s/.test(t)) throw new Error('build: ESM syntax in the bundle' + at);
  /* A literal closing script tag anywhere in the sources would end the inline block early and dump
   * the rest of the city into the document as text. A chunk is not inline and could survive one,
   * and is held to the same rule anyway so a module can move between the two without re-checking. */
  if (/<\/script/i.test(t)) throw new Error('build: source contains a closing script tag' + at);
  /* Compiles each script without running it. This is what makes the comment scanner safe to
   * trust: if it ever mangles a regex literal or a template string, the build stops here. */
  try { new Function(t); }
  catch (e) { throw new Error('build: ' + c.rel + ' does not parse — ' + e.message); }
}

/* Every module named its global; if one is missing it was dropped, mis-ordered, or the comment
 * scanner ate something structural. Cheap, and it has caught both. */
const all = shipped.map(c => c.text).join('\n');
for (const need of ['var CC', 'CC.City', 'CC.Surf', 'CC.Cast', 'CC.Canvas', 'CC.Main',
                    'CC.World', 'CC.SurfWest', 'CC.SurfMoon', 'CC.SurfJapan',
                    'CC.Daylight', 'CC.ELEMENTS.push'])
  if (!all.includes(need)) throw new Error('build: bundle is missing ' + need);

/* The page is black before a single pixel of city is drawn — html, body and canvas all — so that
 * entering fullscreen never flashes white and never shows a seam at an edge the canvas overhangs.
 * The hint is CSS-only on purpose: it fades itself out and no JavaScript ever has to know it
 * existed, which keeps main.js free of anything resembling UI. Its wording is picked by
 * (pointer: coarse) in CSS, so a phone reads "tap" from the first frame.
 *
 * The fleet chrome sits around the city, never in it: carino-ui.css (tokens and components,
 * linked before the page's own style), carino-navbar.js with data-immersive (it slides away in
 * fullscreen or after 3 s idle), carino-lang.js + i18n.js, and ui.js, which owns the help
 * overlay and the pause button and talks to main.js only through window events. The body is
 * Branding's play column: the navbar on top, .play-stage taking every remaining pixel, the
 * canvas inside it. None of those files is part of the bundle. */
const PREV = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
const BASELINE = (PREV.match(/<!-- carino:head[\s\S]*?<!-- \/carino:head -->\n/) || [''])[0];

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#000000">
<title>CyberCity</title>
<link rel="icon" type="image/webp" href="logo.webp">
${BASELINE}<link rel="stylesheet" href="fonts/carino-fonts.css">
<link rel="stylesheet" href="carino-ui.css">
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; overflow: hidden; }
  body { overscroll-behavior: none; }
  .play-stage { background: #000; }
  /* The canvas is allowed to overhang the stage by a fraction of a cell (see main.js layout), so
     it is pinned to the stage's corner and the stage's overflow hides the remainder. main.js
     sizes it from the stage, not the window, so the navbar never covers a row of city. */
  #cc { position: absolute; left: 0; top: 0; display: block; background: #000;
        image-rendering: auto; }
  /* Nothing on the stage is selectable, draggable or scrollable: every gesture is a fullscreen
     request. Kept off the body so the help overlay can still scroll on a phone. */
  .play-stage { -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
                touch-action: none; }
  #hint {
    position: absolute; left: 50%; bottom: 6vh; transform: translateX(-50%);
    font: 500 var(--fs-sm)/1 var(--mono);
    letter-spacing: .28em; text-transform: uppercase; color: var(--text-sec); white-space: nowrap;
    pointer-events: none; opacity: 0;
    animation: hint 9s ease-in-out .8s 1 forwards;
  }
  #hint .h-coarse { display: none; }
  @media (pointer: coarse) { #hint .h-fine { display: none; } #hint .h-coarse { display: inline; } }
  /* Ends at opacity 0 and stays there — 'forwards' holds the last keyframe, so the hint is gone
     for good after one play and never reappears on resize or fullscreen change. */
  @keyframes hint { 0% { opacity: 0 } 12% { opacity: .6 } 70% { opacity: .6 } 100% { opacity: 0 } }
  @media (prefers-reduced-motion: reduce) { #hint { animation-duration: 14s } }
  /* The help overlay: Branding's modal; the touch section shows on coarse pointers only. */
  .cc-keys { display: grid; grid-template-columns: max-content 1fr; gap: 8px 14px; align-items: center;
             margin: 12px 0 0; font-family: var(--mono); font-size: var(--fs-btn); color: var(--text-muted); }
  .cc-keys dt { white-space: nowrap; }
  .cc-keys dd { margin: 0; text-transform: uppercase; letter-spacing: .06em; }
  .cc-touch { display: none; margin: 14px 0 0; }
  .modal-head > div:first-child { flex: 1; }
  @media (pointer: coarse) { .cc-touch { display: block; } }
  #ccPause[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); background: var(--accent-faint); }
</style>
</head>
<body class="play-body">
<div data-carino-actions>
  <button type="button" class="cs-btn" id="ccPause" aria-pressed="false">Pause</button>
  <button type="button" class="cs-btn" id="ccHelpBtn" data-priority="1" aria-haspopup="dialog" aria-controls="ccHelp">? <span data-i18n>Help</span></button>
</div>
<main class="play-stage" id="stage">
<canvas id="cc"></canvas>
<div id="hint"><span class="h-fine" data-i18n>click for fullscreen</span><span class="h-coarse" data-i18n>tap for fullscreen</span></div>
</main>
<div class="modal-scrim" id="ccHelp" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ccHelpTitle">
    <div class="modal-head">
      <div><div class="modal-title" id="ccHelpTitle" data-i18n>How to play</div><div class="modal-sub">CyberCity</div></div>
      <button type="button" class="modal-x" id="ccHelpX" aria-label="Close">✕</button>
    </div>
    <div class="modal-body">
      <p style="margin:0" data-i18n>Four worlds drawn in text characters. Leave it alone and it walks itself; take the camera whenever you like. Opening this pauses the city.</p>
      <div class="cc-touch">
        <div class="modal-sub" data-i18n>Touch</div>
        <p style="margin:6px 0 0" data-i18n>Left half of the screen walks, right half looks. Tap the city for fullscreen.</p>
      </div>
      <dl class="cc-keys">
        <dt><span class="kbd">W</span> <span class="kbd">A</span> <span class="kbd">S</span> <span class="kbd">D</span></dt><dd data-i18n>Walk</dd>
        <dt><span class="kbd">←</span> <span class="kbd">→</span> <span class="kbd">↑</span> <span class="kbd">↓</span></dt><dd data-i18n>Look (or drag)</dd>
        <dt><span class="kbd">Shift</span> <span class="kbd">C</span></dt><dd data-i18n>Run, crouch</dd>
        <dt><span class="kbd">1</span>–<span class="kbd">4</span></dt><dd data-i18n>Change world</dd>
        <dt><span class="kbd">[</span> <span class="kbd">]</span></dt><dd data-i18n>Change the weather</dd>
        <dt><span class="kbd">T</span> <span class="kbd">Y</span></dt><dd data-i18n>Time of day, stop the clock</dd>
        <dt><span class="kbd">N</span></dt><dd data-i18n>New city</dd>
        <dt><span class="kbd">Tab</span></dt><dd data-i18n>Take or give back the camera</dd>
        <dt><span class="kbd accent">P</span> <span class="kbd accent">Space</span></dt><dd data-i18n>Pause</dd>
        <dt><span class="kbd">F</span></dt><dd data-i18n>Fullscreen</dd>
        <dt><span class="kbd">?</span> <span class="kbd">H</span></dt><dd data-i18n>Help</dd>
        <dt><span class="kbd">Esc</span></dt><dd data-i18n>Close</dd>
      </dl>
      <p style="margin:14px 0 0;font-size:var(--fs-sm);color:var(--text-muted)" data-i18n>No sound. Nothing is sent anywhere.</p>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn" id="ccFull" data-i18n>Fullscreen</button>
      <button type="button" class="btn btn-primary" id="ccResume" data-i18n>Resume</button>
    </div>
  </div>
</div>
${chunks.map(c => '<script src="' + c.rel + '?v=' + crypto.createHash('sha1').update(c.text).digest('hex').slice(0, 10) + '"></script>\n').join('')}<script>
${bundle}</script>
<script src="carino-navbar.js" data-app="CyberCity" data-repo="CyberCity" data-immersive defer></script>
<script src="carino-lang.js" defer></script>
<script src="i18n.js" defer></script>
<script src="ui.js" defer></script>
</body>
</html>
`;

fs.writeFileSync(OUT, HTML, 'utf8');
/* w/ is rewritten whole: a chunk this build did not produce (a world renamed or folded back
 * inline) would otherwise sit there being published and never loaded. */
fs.mkdirSync(WDIR, { recursive: true });
for (const f of fs.readdirSync(WDIR))
  if (f.endsWith('.js') && !chunks.some(c => c.rel === 'w/' + f)) fs.unlinkSync(path.join(WDIR, f));
for (const c of chunks) fs.writeFileSync(path.join(ROOT, c.rel), c.text, 'utf8');

const kb = n => n + ' bytes  (' + (n / 1024).toFixed(1) + ' KB)';
const bytes = Buffer.byteLength(HTML, 'utf8');
let over = false;
for (const p of files)
  console.log('  + ' + path.relative(ROOT, p).split(path.sep).join('/'));
console.log('index.html  ' + kb(bytes) + '  ' + (files.length - chunks.reduce((n, c) => n + c.files.length, 0)) +
            ' modules  headroom ' + (CAP_PAGE - bytes));
if (bytes > CAP_PAGE) { console.error('build: index.html is over the 600 KB budget'); over = true; }
for (const c of chunks) {
  const n = Buffer.byteLength(c.text, 'utf8');
  console.log(c.rel.padEnd(11) + ' ' + kb(n) + '  ' + c.files.length + ' modules  headroom ' + (CAP_CHUNK - n));
  if (n > CAP_CHUNK) { console.error('build: ' + c.rel + ' is over the 160 KB per-world budget'); over = true; }
}
/* THE BUDGET WAS 200 KB AND IT IS NOW 300 KB. That is a raise, not a discovery, and it is being
 * written down rather than quietly deleted. src/ went from roughly 190 KB to roughly 530 KB in one
 * pass — twelve new ambient elements, a weather director every element reads, four input devices,
 * a rewritten road and facade — and the stripped bundle came out at 266 KB against a ceiling set
 * when the city had a third of the content in it. Nothing here is dead weight to cut: the comment
 * scanner already removes ~40% of the source by volume, and the remaining bytes are all reachable
 * code. The alternatives were to strip indentation (about 25 KB, and it turns a viewable page
 * source into a wall, which the decomment note above explicitly refuses) or to delete elements to
 * make a number, which is the wrong way round.
 *
 * 300 KB is still a hard stop and still means something: it is one HTTP response, it parses in
 * well under a frame on anything made this decade, and it leaves the deliverable a file somebody
 * can read. If a later pass pushes past it, the answer is to cut content, not to move this line
 * again.
 *
 * ---- AND THE PARAGRAPH ABOVE HAS NOW BEEN OVERRIDDEN. 300 KB -> 420 KB. ----
 * It is left standing rather than edited, because a commitment that gets quietly reworded the
 * first time it binds was never a commitment, and whoever reads this next is owed the sentence
 * that was broken along with the reason.
 *
 * What happened: a content pass added four new element files — aerial traffic, police, storey-
 * scale advertising and a street market — plus store types on the ground floor and more costume
 * on the crowd. That is 19 modules against 15 and 363 KB against 286. The instruction above says
 * the answer is to cut content. Cutting content was the one thing this pass was for, so the
 * instruction and the work are in direct contradiction and the instruction is the part that gives.
 *
 * The reason it is safe to give is that the 300 KB was never measuring the thing that matters.
 * What crosses a wire is the COMPRESSED size, and this file is ~100 KB gzipped: the raw number
 * grew 27% and the transferred number is still smaller than a single photograph. Parse cost is
 * unchanged in any way a frame can see (measured 3.0 ms/frame before this pass and 3.0 ms after,
 * at 213x67), and the readability argument the note above makes — that the page source stays
 * something a person can open and read — is about indentation and comments, both of which are
 * still here and still untouched by the stripper.
 *
 * So the honest budget is: this is a single self-contained file that must stay downloadable in
 * one response and readable by a human, and 420 KB raw / ~115 KB gzipped is comfortably inside
 * both. What is NOT licensed by this raise is another one. Three raises in a row is not a budget,
 * it is a formality, and the next pass that lands here should cut before it edits this line.
 *
 * ---- AND THE PASS AFTER THAT COULD NOT HOLD IT. 420 KB -> 560 KB. ----
 * Third raise, and this note is written before the number is changed rather than after, because
 * the paragraph below says the next pass must CUT and that instruction is owed an answer rather
 * than an edit.
 *
 * WHAT LANDED: a third world (Moonwalk — a painter, a district table, a theme block and two
 * element files), a day/night cycle across all three (a director, a second EXPOSURE ladder and a
 * day branch in both existing texture layers), and the frontier's missing content (desert and
 * livestock). The stripped bundle went 416 -> 482 KB before the Moon's elements were in.
 *
 * WHAT WAS ACTUALLY CUT, and the honest number is smaller than the estimate that justified it. The
 * world-space element files each carried their own byte-identical copy of the same projection
 * scaffolding — the V basis, view(), project(), emit(), column() and litFace() — because
 * west_town.js was written first and every file since was written by copying it. That is real
 * duplicated CODE rather than duplicated prose, so the comment stripper does not touch it.
 *
 * Estimated at 8-11 KB from the comment-stripped source; MEASURED at 7.3 KB gross across the four
 * frontier files and 4.6 KB net once src/proj.js's own 2.7 KB is paid for. About one per cent of
 * the bundle. The estimate was high because it counted per-file weather and day caches that had to
 * stay behind in each file's own view().
 *
 * The bytes were the cheap reason. The real one is that six copies of a projection which MUST match
 * src/raycast.js exactly is six places for it to stop matching, and the way that fails is never a
 * crash — it is one file quietly keeping an old term and its objects sinking into the ground while
 * nothing reports it. That is now impossible.
 *
 * AND IT COST SOMETHING TO TAKE, which is worth recording. Three of the four files kept a
 * per-frame cache (W_WIND, D_SUN, SUN/LAMP/WARM) that was assigned inside the view() body being
 * moved; two of those were missed on the first pass and sat at their declared defaults, so the
 * desert and the livestock stopped following the clock while the street behind them still did.
 * Caught by byte-comparing three frontier fixtures before and after — which is the only reason it
 * was caught at all, and is why that comparison is the standing procedure here. The residual after
 * the repair is 49-362 cells of 12000 per fixture, and the cause is an ordering effect the shared
 * version genuinely fixes: the old litFace() read a module handle that view() assigned, so on the
 * first frame of a replay it returned a neutral 0.5 and the new one returns the real value.
 *
 * WHAT WAS NOT CUT, and why not: stripping indentation is worth about 25 KB and the decomment note
 * above refuses it on the grounds that it turns a viewable page source into a wall, which is still
 * true. Deleting content to make a number is what the paragraph below forbids and it is still the
 * wrong way round. Splitting the worlds into separate payloads — named below as the escape hatch —
 * costs the "one self-contained file" property, which is the whole deliverable, and is not spent
 * for a number that is still comfortably inside every constraint the budget was protecting.
 *
 * SO WHAT DOES 560 KB STILL MEAN? Exactly what 420 meant and 300 meant before it: one HTTP
 * response, ~145 KB gzipped, parsing in well under a frame, and a page source a person can open
 * and read. Three worlds and a day cycle in 560 KB is still smaller than one photograph.
 *
 * AND THE NUMBER WAS SET TWICE IN ONE PASS, which is worth admitting rather than tidying away. It
 * was first raised to 520 while the tree was incomplete — the Moon's painter was in and its two
 * element files were not — and 520 was chosen against a 484 KB measurement that had 55 KB of world
 * still to arrive. When it did, the build failed at 523 and the line had to move again. The lesson
 * is not about the number: it is that a budget set against a half-finished tree is a guess with a
 * decimal point on it, and the right moment to set one is after the last file lands.
 *

 * THE CHERRY PASS COST 755 BYTES and made NONE of the three moves this essay asks for, which is
 * recorded here because the contract asks each pass to say which one it did. It cut nothing, moved
 * no line, and added content: 606,893 -> 607,648, leaving 6,752 bytes. Most of it is one function —
 * the petal drift reading the crown anchors src/elements/jp_flora.js had been publishing to nobody
 * since it landed — and the rest is a constant and a glyph. Four of the pass's ten edits were zero
 * bytes or negative, which is the only reason a change that rewrote three files fits in a tenth of
 * the headroom at all.
 *
 * So the finding below stands untouched for the fourth pass running, and the margin is now a tenth
 * smaller than when it was written. The next feature of any size cannot be paid for out of this.
 * THE MOON COST 55 KB stripped — 11.5 for the painter, 43.4 for eleven elements — against the
 * frontier's 65. Neither is bloated; a world in this engine is simply about that big.
 *
 * ---- AND THE PASS BEFORE THIS ONE DID NOT EDIT IT. 420 KB HELD, AT 416.0. ----
 * The second world landed — src/world.js, src/surf_west.js and three src/elements/west_*.js, plus
 * a second district table and a second weather table inside existing files — and it came to 53 KB
 * stripped against 57 KB of headroom. Nothing was cut and nothing needed to be. 24 modules, 416.0
 * KB, four under the line.
 *
 * WHICH MEANS THE NEXT PASS IS THE ONE THAT HAS TO CUT, and it should read the paragraph above as
 * addressed to it rather than to this one. Four kilobytes is not headroom; it is one element file.
 * There is now an obvious place to find room that did not exist before — the frontier and the city
 * do not need to be in the same response, and splitting them is a real answer that costs the
 * "one self-contained file" property. Spend that only when it is the last option, and write down
 * that you did.
 *
 * ---- AND THE PASS AFTER THAT WENT OVER AND THE LINE DID NOT MOVE. 560 KB HELD, AT 534.4. ----
 * Fourth time at this line, first time it has held under pressure, and the paragraph two above
 * asking for a cut is the one that got answered.
 *
 * WHAT LANDED: a colour pass across all three worlds — eight swatches appended to the palette with
 * a night and a day rung each, a daylight fill for the frontier's walls, road and dome, a widened
 * district table and a longer crowd for the city, and relief on the Moon in place of straight
 * lattice edges. Sixteen files, +4413 lines of src/, and 49.6 KB of stripped bundle. That put the
 * build at 589,337 bytes — 575.5 KB, 15.5 over — and it failed here, which is the gate working.
 *
 * WHAT WAS CUT: nothing anybody can see. 42,018 bytes of leading whitespace, by halving the indent
 * in decomment() rather than stripping it; the reasoning and the rejected alternatives are written
 * out at foldIndent(). The short version is that this line's own essay named indentation as worth
 * "about 25 KB" and refused it as a wall, and both halves of that are wrong now: it is 84,232
 * bytes, and halving is not stripping. 534.4 KB, 25.6 KB under.
 *
 * WHAT THAT BUYS THE NEXT PASS, honestly: 25.5 KB is about a third of a world, so this is not a
 * reprieve. The next pass over the line has the same three options and one fewer of them — the
 * whitespace is spent now — and the two that remain are the two the essay above already refuses.
 * Splitting the payload is still the escape hatch and it is still the last one.
 *
 * ---- AND THE PASS AFTER THAT MOVED IT. 560 KB -> 580 KB, AT 567.5. ----
 * Fifth time at this line. The paragraph directly above says the next pass has three options and
 * one fewer of them; this is the answer to that paragraph, taken in the order the note at the head
 * of the file demands — cut what is not content, then cut content, then move the line, and write
 * down which one you did. What was done is the third, and the first two were tried first.
 *
 * WHAT LANDED: a fourth world. EDO — a castle town on a wet evening — as src/surf_japan.js and
 * src/elements/jp_town.js, plus a district table, a theme block, a weather table and a registry row
 * inside four existing files, and thirteen shared atmospheric elements widened to include it.
 *
 * WHAT IT COST, and this is the number worth recording: 33.2 KB stripped, against the frontier's
 * 65 and the Moon's 55. A world in this engine used to be "simply about that big" and it is now
 * about half that big, and the reason is not that this one is thinner — it has a painter, five
 * elements of its own, its own lighting model and its own sky. It is that the three registries the
 * Moon's pass built (src/proj.js's shared element camera, CC.SURFACES's painter map and city.js's
 * THEMES map) mean a fourth world writes almost no scaffolding: no projection, no view/emit/column,
 * no per-world branch anywhere in raycast.js, main.js, control.js or tools/headless.cjs. The
 * previous two passes paid for this one.
 *
 * WHAT WAS CUT FIRST, and it is honest to say it was almost nothing: 305 bytes of glyph constants
 * declared and never used in the two new files. That is the whole of the non-content cut available,
 * and it was looked for rather than assumed. The two candidates the essays above name are still
 * the only two:
 *   STRIPPING INDENTATION OUTRIGHT is worth about 42 KB on top of the halving that already
 *     happened, and it is refused for the third time on the third file's own grounds — halving
 *     leaves a nested document a person can read, and stripping leaves a wall. That refusal is the
 *     one thing about this budget that has never moved and it should not move now.
 *   SPLITTING THE PAYLOAD costs the "one self-contained file" property, which is not a constraint
 *     on the deliverable, it IS the deliverable — the contract's first line. Spending it to avoid
 *     a 20 KB raise would be trading the thing the project is for a number that still describes
 *     one HTTP response.
 * Deleting content to make a number is what the 420 essay forbids and it is still the wrong way
 * round: the content is the point.
 *
 * SO: 580 KB, ~152 KB gzipped, still one response, still parsing in well under a frame, still a
 * page source a person can open and read. Four worlds and a day cycle in 580 KB.
 *
 * THE HEADROOM IS DELIBERATELY SMALL and that is the whole of what this raise is willing to give.
 * 12.5 KB is a third of a world and about one element file — it is not a reprieve and it is not
 * meant to be. The 420 pass raised the line and left 4 KB and the note called that "not headroom";
 * this leaves three times that and says the same thing about it. The number was also set AFTER the
 * last source file landed rather than while the tree was half-written, which is the one lesson the
 * 560 pass wrote down about itself and then had to learn twice.
 *
 * WHAT THE NEXT PASS HAS. Two options, not three. The whitespace is spent, the unused-identifier
 * sweep is spent, and the indentation refusal has now been reaffirmed three times, which should be
 * read as settled rather than as an option still on the table. That leaves splitting the payload —
 * and a fifth world is where it stops being the escape hatch and starts being the design. If you
 * are here to add one: split first, then add it, and do not touch this line again. *
 * ---- AND THE PASS AFTER THAT MOVED IT AGAIN. 580 KB -> 600 KB, AT 590.1. ----
 * Sixth time at this line, and the paragraph directly above it says not to do this. It is owed a
 * straight answer rather than an edit, so here is the arithmetic that overruled it.
 *
 * WHAT LANDED: content for EDO — a CANAL in the map with a reflecting water surface, festival
 * BANNERS, SAKURA trees, a castle KEEP, red-papered lanterns, a wider district accent, and dyed
 * umbrellas on the crowd. Asked for by name, all of it.
 *
 * WHAT WAS CUT FIRST, because the procedure at the head of this file demands it and because the
 * paragraph above says the sweep is spent — it was not:
 *   - `edgeDist()` in jp_town.js, dead on arrival one pass earlier when the stone lanterns were
 *     rewritten to walk the street instead of a lattice.  MEASURED -416.
 *   - `'use strict'` hoisted from 33 module IIFEs onto the wrapper. Every module needs its own when
 *     `require`d alone by the harness, and concatenated they are 33 copies inside one sloppy-mode
 *     wrapper; one directive on the wrapper is the exact union of what they were doing.
 *     MEASURED -481, and all 36 four-world fixtures byte-identical.
 * Both were taken. -897 total, and the pass ends up carrying more content per byte than it did.
 *
 * WHY THE LINE MOVED ANYWAY, AND THIS IS THE PART THAT IS NOT A DODGE. The content is 24 KB and the
 * headroom was 13. THERE IS NO COMBINATION THAT FITS, and that was checked rather than assumed:
 *     everything, after the two cuts above ............ 604,283   (10,363 over)
 *     minus the castle keep (7.0 KB) .................. 597,325    (3,405 over)
 *     minus the keep AND the duplicated helpers ....... 594,975    (1,055 over)
 * The last row is with EVERY cut this tree has left, including one that is not free (see below),
 * and it is still over. So the choice was never "cut or raise" — it was "raise, or delete a third
 * of what was asked for". Deleting content to make a number is what the 420 essay forbids and it
 * is still the wrong way round.
 *
 * WHAT WAS MEASURED, BANKED AND DELIBERATELY NOT TAKEN, so the next pass does not re-derive it:
 * the duplicated function bodies. `streetSpan` is byte-identical across market.js, west_town.js,
 * west_stock.js and structure.js; `objVisible` across west_town.js and west_stock.js; `corridor`
 * across police.js and street.js. Hoisting them into src/proj.js is worth about 2,350 bytes and it
 * is the cut proj.js's own header asks for. It was NOT taken here for one reason: it does not
 * change the outcome. It saves 2.3 KB against a 10.4 KB overrun, so the line moves either way — and
 * it touches six files belonging to three shipped worlds, in exactly the operation this file
 * already records as having cost two silent clock-cache bugs the last time it was performed.
 * Risk with no benefit is not a cut, it is a coin flip. TAKE IT when it is worth something.
 *
 * SO WHAT DOES 600 KB MEAN? ~157 KB gzipped, one HTTP response, parsing in well under a frame, and
 * a page source a person can still open and read. Four worlds, a day cycle and a canal in 600 KB.
 *
 * AND THE HONEST WARNING, which is the same one the paragraph above gives and it is now overdue:
 * THE NEXT PASS MUST SPLIT. Not because 600 is a magic number but because the last three passes
 * have each ended with the same finding — the content is bigger than the headroom and the cuts are
 * rounding errors against it. The banked duplication cut above is the last non-content cut in the
 * tree and it is worth two thousand bytes. A world is thirty thousand. Splitting the payload costs
 * the "one self-contained file" property, which is the first line of CONTRACT.md and is a real
 * loss — but it is the only remaining answer that is not "ship less", and it should be taken
 * deliberately, by someone who has decided that trade, rather than discovered at this line again.
 *
 * ---- AND THE PASS AFTER THAT SPLIT IT. ONE 600 KB LINE -> 600 KB + 3 x 160 KB. ----
 * Seventh time at this line, and the first time the answer is the one the last three paragraphs
 * asked for. It was DECIDED, by the owner, before a byte of it was written — which is the condition
 * the paragraph directly above set — and this is the record of what was traded.
 *
 * WHY NOW: the high-definition pass (an underpainting behind the glyphs, a pixel-path printer,
 * density-correct optics) was costed at 8.5-9 KB against 1,983 bytes of headroom. The banked
 * duplication cut is 2.35 KB of it. No ordering of the three moves closes that, and the fourth
 * option — the next world — was already known not to fit. So it split.
 *
 * WHAT WAS SPENT: the "one self-contained file" property. index.html is still the page, still
 * opens with no server (file:// runs classic <script src> fine), still makes no request outside
 * its own folder — but it is now one file and a w/ directory, and copying index.html alone gets
 * you the city and three worlds that render as the city. CONTRACT.md's first line says so now.
 *
 * WHAT WAS CONSIDERED AND REFUSED:
 *   ONE FILE, COMPRESSED. A deflate-raw blob inflated by DecompressionStream at boot is ~210 KB and
 *     roughly triples the headroom while keeping one file. It also turns the page source into a
 *     base64 wall — the thing the indentation refusal has protected three times — puts an async
 *     step in front of a boot that has never had one, and drops every browser without that API.
 *   LAZY CHUNKS. Fetching a world when it is first selected is the smaller first load, and it is
 *     the one that changes behaviour: init order, the shared rng sequence and the world switch would
 *     all gain an await. Synchronous tags cost ~220 KB of parse on a first visit and nothing else.
 *   TWO INLINE TAGS WITH THE CHUNKS RUN BETWEEN THEM, which is the plan's first sketch. It reorders
 *     CC.ELEMENTS and promotes CC to a global — see THE SPLIT above for why both matter.
 *
 * WHAT THE LINES ARE NOW, and both are hard stops: index.html at 600 KB (the old number, kept, now
 * holding the engine and the city with about 220 KB under it), and each w/*.js at 160 KB — a little
 * over twice the biggest world (the frontier, ~94 KB) so one world can double before anyone is here
 * again. A fifth world is a fourth chunk and a CHUNKS row, not a raise.
 *
 * WHAT IS NOT LICENSED: reading 220 KB of headroom as permission. Every essay above that ended with
 * room to spare was followed by a pass that spent it. Cut first, still. */
if (over) process.exit(1);
