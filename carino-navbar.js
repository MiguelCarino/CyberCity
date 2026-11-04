/* ============================================================
   carino-navbar.js — the shared Carino navbar, self-injecting.
   ------------------------------------------------------------
   Drop this file into any Carino Systems project and include it:

     <script src="carino-navbar.js" data-app="AppName" data-repo="RepoName" defer></script>

   Attributes on the script tag:
     data-app      the product's name, shown beside "Carino" (required)
     data-name     a display name when it differs from data-app (optional)
     data-repo     the GitHub repository (falls back to data-app)
     data-license  the repo's licence as an SPDX id (AGPL-3.0, MIT, …)
     data-mark     the page's mark, for a page WITHOUT carino-theme.js.
                   With carino-theme.js the mark is its theme switch,
                   which it inserts in the same place; this file then
                   draws none.
     data-version  the version shown at the foot of the About tab. A page
                   may also set it at run time: CarinoNav.version('1.3.1').
                   Without one the version is 0.0.YYYYMMDD, the date the
                   page was last modified (its Last-Modified header).
     data-changelog  a link to the changelog, shown under the version
     data-immersive  see "Immersive mode" below

   The bar, left to right:
     [mark] Carino Product   12:04 LOCAL      [app controls] [status] [⋯] [About]

   "Carino" goes to the hub (carino.systems); the product name links to
   the app's own root, so clicking it reloads the site. Below 360px the
   word "Carino" is dropped: the mark is already the gold C.

   It injects its own (scoped) styles + the markup. The live CLOCK
   (Local/UTC/Epoch/TAI/.beats + click-to-cycle) lives in the companion
   file carino-clock.js, which this script loads from the SAME site, so
   there is no external/CDN dependency and each site works standalone/
   offline. To change it, edit the canonical copy and run propagate.sh.
   All styles are scoped under #carinoNav so nothing leaks into the app.

   The bar stays on screen: it sticks to the top of the page at every
   width, so anything else a page makes sticky sits under it, at
   top: var(--nav-h) (carino-ui.css), never at top: 0.

   Right-cluster order is fixed by CSS `order`, not by DOM position,
   because several scripts insert into it:
     1  the app's own controls (.cn-actions)
     2  status     (carino-diag.js, or an app's own toggle)
     5  "⋯"        (only while something is folded into it)
     6  About      (never folds)

   About. The one button on the right that every site has. It opens a
   window with tabs down its side (across the top on a phone):
     About       the product's name, its one-line description (the
                 baseline head's carino:line), the page's mark drawn
                 large, then what the page must say:
                 <div data-carino-about hidden> anywhere in the page
                 (a data credit, a "not advice" line, a trademark notice,
                 which outside services it calls, and that it runs in
                 the browser), and last the version, with the changelog
                 link (data-changelog) under it.
                 The tab scrolls when that is taller than the window.
     How to use  <div data-carino-howto hidden> anywhere in the page; the
                 tab is left out when a page has none
     Contact     LinkedIn, and where to open an issue
     Licence     a short plain-words summary of the licence
                 (data-license), then the licence and the source on GitHub,
                 then what the page credits: <div data-carino-licence hidden>
                 (bundled libraries and their licences, third-party notices,
                 an upstream project)
     Language    a grid: Auto plus the five languages (carino-lang.js keeps
                 the preference; it draws no button of its own next to this
                 bar). Under it the project's key words, in the language
                 picked, so a visitor sees how they translate:
                 <ul data-carino-words hidden><li>Network</li>…</ul>, English,
                 translated through the site's window.t
     Legal       a short summary and the link to carino.systems/legal.html,
                 the one legal notice, privacy and cookie page for every
                 site (left out on that page itself)
   The disclaimer box opens with the word "Disclaimer:". The Licence tab
   ends with a Third-party part: the fonts the page loads (all SIL OFL 1.1,
   read from document.fonts) and then the page's own data-carino-licence
   block. Bundled code is listed as names and SPDX ids, which need no
   translating:
     <ul data-carino-libs data-href="…/vendor/README.md" hidden>
       <li data-licence="MIT">html2canvas</li> …
     </ul>
   data-href points at the page that carries the licence texts.
   On a touch screen a sideways swipe moves between the tabs.
   Both blocks are moved (not cloned) into the window, so ids, handlers and
   data-i18n survive and a script may keep rewriting a line in them.
   Sites carry no footer. The button keeps the id cnLegal, which a site
   may .click() to open the window.

   Fitting. The brand must never be squeezed out and the clock must stay
   readable, at any width. When the right cluster would do either, first
   the clock steps aside (as it already does below 900px), then the app's
   controls fold into a generated "⋯" menu. Controls marked
   data-priority="1" stay in the bar (an app's one main action), and
   data-priority="2" ones too while there is room (a Live page's source
   badge); without any mark, the first .btn-primary / .primary control
   stays. If even those squeeze the brand, priority 2 folds, then 1, and
   last the product name gives way to an ellipsis. The real nodes move
   (never clones) and return when there is room again, and the menu sits
   inside #carinoNav, so `#carinoNav .cn-actions …` rules still apply. If an
   app has moved .cn-actions somewhere else itself (Topo's drawer), it is
   left alone.

   Immersive mode (Games and ambient pages). Opt in on the script tag:
     <script src="carino-navbar.js" data-app="…" data-immersive defer>
   (data-immersive="5000" sets the idle delay in ms; 3000 by default). In
   fullscreen, or after that long without the pointer near the top, the bar
   slides away; moving the pointer to the top edge, focusing into it or
   pressing Esc brings it back. On touch screens it only hides in
   fullscreen. Under reduced motion it hides and shows without sliding.
   Each change fires `carino:navbar` with detail {hidden}. A page that
   needs it only some of the time (Asobi: while a game is open, not on
   its scrolling chooser) switches it at run time instead:
   window.CarinoNav.immersive(true | false).

   Language. The bar's own words (tooltips, tabs, the legal summary) come
   from a small dictionary in this file for es, pt-BR, ja and ru, picked by
   CarinoLang.current (or <html lang>), so a site with no i18n.js of its own
   still gets them. A site's window.t wins when it has the string. They
   re-render on carino:langchange, one tick late so the site's own handler
   has switched its dictionary first.
   ============================================================ */
(function () {
  'use strict';

  var SCRIPT = document.currentScript;
  function attr(n) { return (SCRIPT && SCRIPT.getAttribute(n)) || ''; }
  var TAG = attr('data-app');
  var NAME = attr('data-name') || TAG;
  // The GitHub links point at THIS project's repository, not the profile.
  var REPO = attr('data-repo') || TAG;
  var GH_URL = 'https://github.com/MiguelCarino' + (REPO ? '/' + REPO : '');
  var MARK = attr('data-mark');
  // The repo's licence as its SPDX id (data-license="AGPL-3.0"); the About
  // window links it to the licence's own home, not to a copy.
  var LICENCE = attr('data-license');
  var LICENCE_HOME = {
    'AGPL-3.0': 'https://www.gnu.org/licenses/agpl-3.0.html',
    'AGPL-3.0-or-later': 'https://www.gnu.org/licenses/agpl-3.0.html',
    'GPL-3.0': 'https://www.gnu.org/licenses/gpl-3.0.html',
    'GPL-3.0-or-later': 'https://www.gnu.org/licenses/gpl-3.0.html',
    'MIT': 'https://opensource.org/license/mit',
    'MPL-2.0': 'https://www.mozilla.org/en-US/MPL/2.0/',
    'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0'
  }[LICENCE] || (LICENCE ? 'https://spdx.org/licenses/' + LICENCE + '.html' : '');
  var CLOCK_SRC = 'carino-clock.js'; // local copy shipped in each site (no CDN)
  var LEGAL_URL = 'https://carino.systems/legal.html';
  var LINKEDIN_URL = 'https://www.linkedin.com/in/miguelcarino94/';
  var ON_LEGAL = /\/legal(\.html)?$/.test(location.pathname);
  var CHANGELOG = attr('data-changelog');
  var VERSION = attr('data-version') || ((document.querySelector('meta[name="carino:version"]') || {}).content || '');
  // No version staged: the date the page was last modified, as 0.0.YYYYMMDD.
  function dateVersion() {
    var d = new Date(document.lastModified);
    if (isNaN(d)) d = new Date();
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return '0.0.' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }
  // The licence in plain words, by family. A summary only; the button
  // under it opens the full terms.
  var LICENCE_SUMMARY = (function (id) {
    if (!id) return 'No licence is stated for this code yet, so the usual copyright rules apply: you may read the source, but ask before reusing it.';
    if (/^AGPL/.test(id)) return 'Free software: you may use, study, change and share it. If you share it, or let people use a changed version over a network, you must offer them its source code under the same licence.';
    if (/^GPL/.test(id)) return 'Free software: you may use, study, change and share it. If you share it or a changed version, you must pass on its source code under the same licence.';
    if (/^MPL/.test(id)) return 'Free software: you may use, change and share it, also inside larger works under other licences. Changes to its own files stay under the MPL, with their source available.';
    if (/^MIT$/.test(id)) return 'A permissive licence: you may use, copy, change, share and sell it, as long as the copyright and licence notice stay with it.';
    if (/^Apache/.test(id)) return 'A permissive licence: you may use, change, share and sell it, as long as you keep its notices and mark the files you changed. It includes a patent licence.';
    return '';
  })(LICENCE);
  // [code, native name]; carino-lang.js owns the preference itself
  var LANGS = [['en', 'English'], ['es', 'Español'], ['pt-BR', 'Português'], ['ja', '日本語'], ['ru', 'Русский']];

  var CSS = ''
    + '#carinoNav{--cn-accent:#eab308;--cn-bg:#050505;--cn-border:#262626;--cn-text:#fff;--cn-muted:#8a8a8a;--cn-faint:rgba(234,179,8,.1);'
    + '--cn-mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;'
    + '--cn-sans:"IBM Plex Sans",system-ui,-apple-system,sans-serif;'
    + 'height:60px;flex-shrink:0;box-sizing:border-box;background:linear-gradient(180deg,#0f0f0f 0%,#050505 100%);'
    + 'border-bottom:1px solid var(--cn-border);display:flex;align-items:center;justify-content:space-between;'
    + 'gap:16px;padding:0 20px;position:sticky;top:0;z-index:2147483000;font-family:var(--cn-sans);}'
    + '#carinoNav *,#carinoNav *::before,#carinoNav *::after{box-sizing:border-box;}'
    + '#carinoNav .cn-left{display:flex;align-items:center;gap:18px;min-width:0;flex:1 1 auto;overflow:hidden;}'
    + '#carinoNav .cn-right{display:flex;align-items:center;gap:12px;flex-shrink:0;min-width:0;}'
    // brand: [mark] Carino Product
    + '#carinoNav .cn-brand{display:flex;align-items:center;flex-shrink:0;min-width:0;}'
    + '#carinoNav .cn-mark{flex:none;display:inline-flex;width:32px;height:32px;align-items:center;justify-content:center;margin:0 8px 0 -4px;border-radius:8px;}'
    + '#carinoNav .cn-mark img{width:28px;height:28px;display:block;}'
    + '#carinoNav .cn-mark:focus-visible{outline:2px solid var(--cn-accent);outline-offset:1px;}'
    + '#carinoNav .brand-name,#carinoNav .cn-product{font-family:"Red Hat Display",var(--cn-sans);font-weight:900;font-size:1.5rem;line-height:1.1;'
    + 'text-decoration:none;white-space:nowrap;cursor:pointer;}'
    + '#carinoNav .brand-name{background:linear-gradient(130deg,#fef08a 0%,#eab308 50%,#b45309 100%);-webkit-background-clip:text;background-clip:text;'
    + '-webkit-text-fill-color:transparent;margin-right:.28em;flex:none;}'
    + '#carinoNav .cn-product{color:var(--cn-text);-webkit-text-fill-color:var(--cn-text);transition:text-shadow .2s;min-width:0;}'
    + '#carinoNav .cn-product:hover,#carinoNav .cn-product:focus-visible{text-shadow:0 0 14px rgba(234,179,8,.45);outline:none;}'
    + '#carinoNav .cn-product:empty{display:none;}'
    + '#carinoNav.cn-squeeze .cn-brand{flex-shrink:1;}'
    + '#carinoNav.cn-squeeze .cn-product{overflow:hidden;text-overflow:ellipsis;}'
    + '@media(max-width:640px){#carinoNav{gap:10px;padding:0 14px;}#carinoNav .brand-name,#carinoNav .cn-product{font-size:1.25rem;}}'
    + '@media(max-width:359.98px){#carinoNav .brand-name{display:none;}}'
    // clock
    + '#carinoNav .header-clock{display:flex;align-items:baseline;gap:8px;border-left:1px solid var(--cn-border);padding-left:18px;min-width:0;overflow:hidden;cursor:pointer;user-select:none;}'
    + '#carinoNav .header-clock:hover .clock-tz{filter:brightness(1.12);}'
    + '#carinoNav .clock-time{font-family:var(--cn-mono);font-size:1.05rem;font-weight:700;color:var(--cn-text);flex-shrink:0;}'
    + '#carinoNav .clock-tz{font-family:var(--cn-mono);font-size:.58rem;font-weight:700;color:#050505;background:var(--cn-accent);padding:2px 5px;border-radius:3px;flex-shrink:0;}'
    + '@media(max-width:900px){#carinoNav .header-clock{display:none;}}'
    + '#carinoNav.cn-noclock .header-clock{display:none;}'
    // buttons
    + '#carinoNav .icon-btn{width:32px;height:32px;border:1px solid var(--cn-border);border-radius:4px;display:flex;'
    + 'align-items:center;justify-content:center;color:var(--cn-muted);transition:.2s;text-decoration:none;background:transparent;cursor:pointer;}'
    + '#carinoNav .icon-btn:hover{border-color:var(--cn-accent);color:#050505;background:var(--cn-accent);transform:translateY(-2px);box-shadow:0 4px 12px rgba(234,179,8,.18);}'
    + '#carinoNav .icon-btn svg{width:15px;height:15px;}'
    + '#carinoNav .cn-actions{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0;}'
    // Slot order, independent of which script inserted what first.
    + '#carinoNav .cn-right > *{order:1;flex-shrink:0;}'
    + '#carinoNav .cn-right > #cnDiagBtn,#carinoNav .cn-right > .status-toggle{order:2;}'
    + '#carinoNav .cn-right > .cn-keep{order:1;display:flex;align-items:center;gap:8px;}'
    + '#carinoNav .cn-right > .cn-more{order:5;}'
    + '#carinoNav .cn-right > .cn-help-btn{order:6;}'
    + '#carinoNav .cn-more[hidden],#carinoNav .cn-keep:empty{display:none;}'
    + '#carinoNav .cn-more[aria-expanded="true"]:not(:hover){border-color:var(--cn-accent);color:var(--cn-accent);}'
    + '#carinoNav .cn-more-menu{position:absolute;top:calc(100% + 6px);right:12px;z-index:3;display:flex;flex-direction:column;'
    + 'align-items:stretch;gap:12px;min-width:220px;max-width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 80px);overflow:auto;'
    + 'padding:12px;background:#0b0b0b;border:1px solid rgba(234,179,8,.3);border-radius:8px;box-shadow:0 18px 40px rgba(0,0,0,.7);}'
    + '#carinoNav .cn-more-menu[hidden]{display:none;}'
    + '#carinoNav .cn-more-menu .cn-actions{flex-wrap:wrap;overflow:visible;gap:8px;}'
    // About: a labelled button; an icon alone on a phone
    + '#carinoNav .cn-help-btn{width:auto;gap:6px;padding:0 10px;font-family:var(--cn-mono);font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap;}'
    + '#carinoNav .cn-help-btn svg{width:15px;height:15px;flex:none;}'
    + '@media(max-width:640px){#carinoNav .cn-help-btn{width:32px;padding:0;}#carinoNav .cn-help-btn .lbl{display:none;}}'
    // the About window: a scrim under the bar, one card, tabs down its side
    + '#carinoNav .cn-help{position:fixed;inset:60px 0 0 0;z-index:5;display:flex;align-items:center;justify-content:center;'
    + 'padding:clamp(12px,3vh,40px) 16px;background:rgba(0,0,0,.66);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:cn-fade .25s ease both;}'
    + '#carinoNav .cn-help[hidden]{display:none;}'
    + '#carinoNav .cn-help-card{position:relative;display:grid;grid-template-columns:184px minmax(0,1fr);width:min(100%,820px);height:min(100%,560px);overflow:hidden;'
    + 'border-radius:22px;border:1px solid var(--cn-border);background:linear-gradient(180deg,#161616,#0b0b0b);'
    + 'box-shadow:0 30px 80px rgba(0,0,0,.7);color:var(--cn-text);font-family:var(--cn-sans);animation:cn-rise .42s cubic-bezier(.16,1,.3,1) both;}'
    + '#carinoNav .cn-abtabs{display:flex;flex-direction:column;gap:4px;padding:18px 10px;border-right:1px solid var(--cn-border);overflow:auto;}'
    + '#carinoNav .cn-tab{display:block;width:100%;text-align:left;padding:10px 14px;border:0;border-radius:10px;background:transparent;cursor:pointer;'
    + 'color:var(--cn-muted);font:600 .95rem/1.2 var(--cn-sans);white-space:nowrap;border-left:3px solid transparent;}'
    + '#carinoNav .cn-tab:hover{color:var(--cn-text);background:rgba(255,255,255,.04);}'
    + '#carinoNav .cn-tab:focus-visible{outline:2px solid var(--cn-accent);outline-offset:-2px;}'
    + '#carinoNav .cn-tab[aria-selected="true"]{color:var(--cn-text);background:var(--cn-faint);border-left-color:var(--cn-accent);}'
    + '#carinoNav .cn-tab[hidden]{display:none;}'
    + '#carinoNav .cn-panels{position:relative;overflow-y:auto;overscroll-behavior:contain;min-height:0;}'
    + '#carinoNav .cn-panel{padding:clamp(22px,4vh,36px) clamp(20px,4vw,40px) 28px;}'
    + '#carinoNav .cn-panel[hidden]{display:none;}'
    + '#carinoNav .cn-panel h2,#carinoNav .cn-panel h3{margin:0 0 12px;padding:0;border:0;text-transform:none;color:var(--cn-text);font-family:"Red Hat Display",var(--cn-sans);font-weight:900;letter-spacing:-.02em;line-height:1.15;}'
    + '#carinoNav .cn-panel h2{font-size:clamp(1.4rem,1rem + 1.4vh,2rem);}'
    + '#carinoNav .cn-panel h3{font-size:1.25rem;}'
    + '#carinoNav .cn-panel p{margin:0 0 10px;color:var(--cn-muted);font-size:.95rem;line-height:1.55;}'
    + '#carinoNav .cn-panel a{color:var(--cn-accent);}'
    + '#carinoNav .cn-p-about{text-align:center;padding-top:clamp(28px,7vh,64px);}'
    + '#carinoNav .cn-p-about > p{max-width:52ch;margin:0 auto;font-size:1.05rem;color:var(--cn-text);}'
    + '#carinoNav .cn-x{position:absolute;top:12px;right:12px;z-index:1;width:36px;height:36px;border-radius:999px;border:1px solid var(--cn-border);'
    + 'background:transparent;color:var(--cn-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;}'
    + '#carinoNav .cn-x:hover,#carinoNav .cn-x:focus-visible{border-color:var(--cn-accent);color:var(--cn-accent);outline:none;}'
    + '#carinoNav .cn-x svg{width:16px;height:16px;}'
    // what the page must say: a highlighted box in the accent
    + '#carinoNav .cn-ab-page{max-width:60ch;margin:22px auto 0;padding:12px 16px;text-align:center;border-radius:12px;'
    + 'background:rgba(234,179,8,.1);border:1px solid rgba(234,179,8,.35);}'
    + '#carinoNav .cn-ab-page p{margin:0 0 8px;max-width:none;width:auto;text-align:center;color:var(--cn-text);font-size:.9rem;line-height:1.55;}'
    + '#carinoNav .cn-ab-page p:last-child{margin-bottom:0;}'
    + '#carinoNav .cn-ab-page .cn-ab-meta{font-family:var(--cn-mono);font-size:.72rem;color:var(--cn-muted);}'
    + '#carinoNav .cn-howto{color:var(--cn-text);font-size:.95rem;line-height:1.55;}'
    // the page's mark, large, between the line and the disclaimer
    + '#carinoNav .cn-bigmark{display:flex;justify-content:center;margin:26px 0 4px;}'
    + '#carinoNav .cn-bigmark:empty{display:none;}'
    + '#carinoNav .cn-bigmark img{width:clamp(88px,18vh,128px);height:auto;aspect-ratio:1;display:block;}'
    + '#carinoNav .cn-version{margin:28px auto 0 !important;text-align:center;font-family:var(--cn-mono);font-size:.78rem !important;letter-spacing:.06em;color:var(--cn-muted) !important;}'
    + '#carinoNav .cn-lic-sum{color:var(--cn-text) !important;font-size:1rem !important;max-width:58ch;}'
    + '#carinoNav .cn-lic-note{font-size:.82rem !important;margin-bottom:18px !important;}'
    // link cards
    + '#carinoNav .cn-ways{display:grid;gap:12px;}'
    + '#carinoNav .cn-way{display:flex;align-items:center;gap:14px;padding:15px 18px;border-radius:16px;text-decoration:none;color:var(--cn-text) !important;'
    + 'border:1px solid var(--cn-border);background:rgba(255,255,255,.025);transition:border-color .2s ease,transform .35s cubic-bezier(.16,1,.3,1),background .2s ease;}'
    + '#carinoNav .cn-way svg{width:26px;height:26px;flex:none;color:var(--cn-accent);}'
    + '#carinoNav .cn-way b{display:block;font-family:"Red Hat Display",var(--cn-sans);font-weight:800;font-size:1.02rem;}'
    + '#carinoNav .cn-way small{display:block;margin-top:2px;color:var(--cn-muted);font-size:.84rem;line-height:1.4;}'
    + '#carinoNav .cn-way:hover,#carinoNav .cn-way:focus-visible{border-color:var(--cn-accent);background:rgba(234,179,8,.08);transform:translateY(-2px);outline:none;}'
    + '#carinoNav .cn-issues{margin:18px 0 0;color:var(--cn-muted);font-size:.88rem;line-height:1.5;}'
    + '#carinoNav .cn-issues a{display:inline-flex;align-items:center;gap:6px;font-weight:600;text-decoration:none;}'
    + '#carinoNav .cn-issues a:hover,#carinoNav .cn-issues a:focus-visible{text-decoration:underline;outline:none;}'
    + '#carinoNav .cn-issues svg{width:15px;height:15px;}'
    // language rows
    + '#carinoNav .cn-langs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;}'
    + '#carinoNav .cn-words-h{margin:26px 0 10px !important;font-size:1rem !important;}'
    // key words: two lanes take turns rising through a soft-edged stage, so one
    // word fades out at the top while the next comes up from below
    + '#cnPanel-language:not([hidden]){display:flex;flex-direction:column;min-height:100%;box-sizing:border-box;}'
    + '#carinoNav .cn-float{position:relative;flex:1 0 170px;overflow:hidden;'
    + '-webkit-mask-image:linear-gradient(transparent,#000 22%,#000 78%,transparent);mask-image:linear-gradient(transparent,#000 22%,#000 78%,transparent);}'
    + '#carinoNav .cn-fl{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);padding:0 16px;text-align:center;opacity:0;will-change:top,opacity;'
    + 'animation:cn-drift 8s linear infinite both;}'
    + '#carinoNav .cn-fl2{animation-delay:4s;}'
    + '#carinoNav .cn-fl b{display:inline-block;max-width:100%;font-family:"Red Hat Display",var(--cn-sans);font-weight:900;font-size:clamp(1.35rem,5vw,1.9rem);'
    + 'line-height:1.15;letter-spacing:-.01em;overflow-wrap:anywhere;background:linear-gradient(130deg,#fef08a 0%,#eab308 50%,#b45309 100%);'
    + '-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#eab308;}'
    + '#carinoNav .cn-fl small{display:block;margin-top:4px;font-family:var(--cn-mono);font-size:.74rem;color:var(--cn-muted);overflow-wrap:anywhere;}'
    + '#carinoNav .cn-fl small:empty{display:none;}'
    + '@keyframes cn-drift{0%{opacity:0;top:90%;}22%{opacity:1;}72%{opacity:1;}100%{opacity:0;top:10%;}}'
    + '@keyframes cn-glow{0%{opacity:0;top:50%;}22%,72%{opacity:1;top:50%;}100%{opacity:0;top:50%;}}'
    + '@media(prefers-reduced-motion:reduce){#carinoNav .cn-fl{animation-name:cn-glow;}}'
    + '#carinoNav .cn-words{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}'
    + '#carinoNav .cn-changelog{display:block;margin-top:6px;text-align:center;font-family:var(--cn-mono);font-size:.78rem;}'
    + '#carinoNav .cn-lic-page{color:var(--cn-muted);font-size:.9rem;line-height:1.55;}'
    + '#carinoNav .cn-third-h{margin:26px 0 8px !important;font-size:1rem !important;}'
    + '#carinoNav .cn-third{margin:0 0 8px !important;font-size:.9rem !important;}'
    + '#carinoNav .cn-libs{list-style:none;margin:0 0 8px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px 16px;font-size:.9rem;color:var(--cn-text);}'
    + '#carinoNav .cn-libs small{margin-left:6px;font-family:var(--cn-mono);font-size:.72rem;color:var(--cn-muted);}'
    + '#carinoNav .cn-ab-label{display:block;margin:0 0 4px;font-family:var(--cn-mono);font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--cn-accent);}'
    + '#carinoNav .cn-panels{touch-action:pan-y;}'
    + '#carinoNav .cn-panel.cn-from-r{animation:cn-slide-r .28s cubic-bezier(.16,1,.3,1) both;}'
    + '#carinoNav .cn-panel.cn-from-l{animation:cn-slide-l .28s cubic-bezier(.16,1,.3,1) both;}'
    + '@keyframes cn-slide-r{from{opacity:0;transform:translate3d(36px,0,0)}to{opacity:1;transform:none}}'
    + '@keyframes cn-slide-l{from{opacity:0;transform:translate3d(-36px,0,0)}to{opacity:1;transform:none}}'
    + '@media(prefers-reduced-motion:reduce){#carinoNav .cn-panel.cn-from-r,#carinoNav .cn-panel.cn-from-l{animation:none;}}'
    + '#carinoNav .cn-lic-page p{margin:0 0 8px;}'
    + '#carinoNav .cn-lang{display:flex;min-width:0;justify-content:space-between;align-items:center;gap:12px;width:100%;padding:12px 16px;border-radius:12px;cursor:pointer;'
    + 'border:1px solid var(--cn-border);background:transparent;color:var(--cn-text);font:600 1rem/1.2 var(--cn-sans);text-align:left;}'
    + '#carinoNav .cn-lang small{font-family:var(--cn-mono);font-size:.72rem;font-weight:400;color:var(--cn-muted);}'
    + '#carinoNav .cn-lang:hover,#carinoNav .cn-lang:focus-visible{border-color:var(--cn-accent);outline:none;}'
    + '#carinoNav .cn-lang[aria-checked="true"]{border-color:var(--cn-accent);background:var(--cn-faint);color:var(--cn-accent);}'
    // a system face for the one Cyrillic label (see carino-lang.js)
    + '#carinoNav .cn-lang [lang="ru"]{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}'
    + '#carinoNav .cn-legal-list{margin:0 0 18px;padding-left:1.2em;color:var(--cn-muted);font-size:.95rem;line-height:1.55;}'
    + '#carinoNav .cn-legal-list li{margin-bottom:8px;}'
    + '@keyframes cn-fade{from{opacity:0}to{opacity:1}}'
    + '@keyframes cn-rise{from{opacity:0;transform:translate3d(0,18px,0) scale(.975)}to{opacity:1;transform:none}}'
    // a phone: a bottom sheet, the tabs a scrolling row across its top
    + '@media(max-width:640px){'
    + '#carinoNav .cn-help{align-items:flex-end;padding:10px 10px calc(10px + env(safe-area-inset-bottom,0px));}'
    + '#carinoNav .cn-help-card{display:flex;flex-direction:column;height:auto;min-height:min(100%,420px);max-height:100%;border-radius:18px;}'
    + '#carinoNav .cn-abtabs{flex-direction:row;flex:none;margin-right:52px;padding:10px;border-right:0;border-bottom:1px solid var(--cn-border);overflow-x:auto;overflow-y:hidden;scrollbar-width:none;}'
    + '#carinoNav .cn-abtabs::-webkit-scrollbar{display:none;}'
    + '#carinoNav .cn-tab{width:auto;flex:none;padding:8px 12px;border-left:0;border-bottom:3px solid transparent;border-radius:8px;}'
    + '#carinoNav .cn-tab[aria-selected="true"]{border-bottom-color:var(--cn-accent);}'
    + '#carinoNav .cn-panels{flex:1 1 auto;}#carinoNav .cn-p-about{padding-top:28px;}'
    + '#carinoNav .cn-x{top:9px;right:10px;}}'
    + '@media(prefers-reduced-motion:reduce){#carinoNav .cn-help,#carinoNav .cn-help-card{animation:none;}#carinoNav .cn-way{transition:none;}}'
    // Immersive: collapse the bar's own height so the stage below takes it.
    + '#carinoNav{transition:margin-top .25s ease,opacity .25s ease;}'
    // Back in the flow while hidden, or sticking would hold it at the top.
    + '#carinoNav.cn-immersed{position:relative;margin-top:-60px;opacity:0;pointer-events:none;}'
    + '@media print{#carinoNav{display:none !important;}}'
    + '@media(prefers-reduced-motion:reduce){#carinoNav{transition:none;}}';

  var GH = 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22';
  var LI = '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle>';
  var SHIELD = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>';
  // an i in a circle: the About button
  var INFO = '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>';
  var DOC = '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M9 13h6"></path><path d="M9 17h6"></path>';
  var CLOSE = '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>';
  function svg(body) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  // The legal page in four lines; the page itself has the rest.
  var LEGAL_LINES = [
    'Run by Miguel Cariño, an individual in Mexico. Free, with no sign-up and no accounts.',
    'No analytics, advertising or trackers. Files you open are processed in your browser and are not uploaded.',
    'One cookie, carino_lang, remembers your language. Settings stay in your browser.',
    'Provided as is, without warranty. Not medical, tax, legal or financial advice.'
  ];

  var L10N = {
    es: {
      'Carino Systems — back to hub': 'Carino Systems — volver al hub',
      '{app} — reload': '{app} — recargar',
      'About': 'Acerca de',
      'How to use': 'Cómo se usa',
      'Contact': 'Contacto',
      'Licence': 'Licencia',
      'Language': 'Idioma',
      'Legal': 'Legal',
      'Close': 'Cerrar',
      'More': 'Más',
      'Write to me on LinkedIn.': 'Escríbeme en LinkedIn.',
      'Found a problem or have an idea?': '¿Encontraste un problema o tienes una idea?',
      'Open an issue on GitHub': 'Abre un issue en GitHub',
      '{licence}: read the full terms.': '{licence}: lee los términos completos.',
      'Source code': 'Código fuente',
      'The source code and its history on GitHub.': 'El código fuente y su historial en GitHub.',
      'Auto': 'Auto',
      'Follows your browser': 'Sigue a tu navegador',
      'Legal notice & privacy': 'Aviso legal y privacidad',
      'The full notice: who runs this, what is stored, and cookies.': 'El aviso completo: quién lo opera, qué se guarda y las cookies.',
      'Run by Miguel Cariño, an individual in Mexico. Free, with no sign-up and no accounts.': 'Operado por Miguel Cariño, persona física en México. Gratuito, sin registro y sin cuentas.',
      'No analytics, advertising or trackers. Files you open are processed in your browser and are not uploaded.': 'Sin analítica, publicidad ni rastreadores. Los archivos que abres se procesan en tu navegador y no se suben.',
      'One cookie, carino_lang, remembers your language. Settings stay in your browser.': 'Una cookie, carino_lang, recuerda tu idioma. Los ajustes se quedan en tu navegador.',
      'Provided as is, without warranty. Not medical, tax, legal or financial advice.': 'Se ofrece tal cual, sin garantía. No es asesoría médica, fiscal, legal ni financiera.',
      'Version {v}': 'Versión {v}',
      'Bundled libraries': 'Bibliotecas incluidas',
      'Their licence texts': 'Sus textos de licencia',
      'Disclaimer:': 'Aviso:',
      'Third-party': 'De terceros',
      'Fonts: {list}, under the SIL Open Font License 1.1.': 'Fuentes: {list}, bajo la SIL Open Font License 1.1.',
      'Key words': 'Palabras clave',
      'Changelog': 'Historial de cambios',
      'This is a summary. The full licence is what applies.': 'Esto es un resumen. Lo que rige es la licencia completa.',
      'No licence is stated for this code yet, so the usual copyright rules apply: you may read the source, but ask before reusing it.': 'Este código aún no declara una licencia, así que rigen las reglas habituales de derechos de autor: puedes leer el código fuente, pero pregunta antes de reutilizarlo.',
      'Free software: you may use, study, change and share it. If you share it, or let people use a changed version over a network, you must offer them its source code under the same licence.': 'Software libre: puedes usarlo, estudiarlo, modificarlo y compartirlo. Si lo compartes, o dejas que otros usen una versión modificada a través de una red, debes ofrecerles su código fuente bajo la misma licencia.',
      'Free software: you may use, study, change and share it. If you share it or a changed version, you must pass on its source code under the same licence.': 'Software libre: puedes usarlo, estudiarlo, modificarlo y compartirlo. Si lo compartes, o compartes una versión modificada, debes entregar su código fuente bajo la misma licencia.',
      'Free software: you may use, change and share it, also inside larger works under other licences. Changes to its own files stay under the MPL, with their source available.': 'Software libre: puedes usarlo, modificarlo y compartirlo, también dentro de obras mayores con otras licencias. Los cambios a sus propios archivos siguen bajo la MPL, con su código fuente disponible.',
      'A permissive licence: you may use, copy, change, share and sell it, as long as the copyright and licence notice stay with it.': 'Una licencia permisiva: puedes usarlo, copiarlo, modificarlo, compartirlo y venderlo, siempre que conserve el aviso de derechos de autor y de licencia.',
      'A permissive licence: you may use, change, share and sell it, as long as you keep its notices and mark the files you changed. It includes a patent licence.': 'Una licencia permisiva: puedes usarlo, modificarlo, compartirlo y venderlo, siempre que conserves sus avisos y señales los archivos que cambiaste. Incluye una licencia de patentes.',
    },
    'pt-BR': {
      'Carino Systems — back to hub': 'Carino Systems — voltar ao hub',
      '{app} — reload': '{app} — recarregar',
      'About': 'Sobre',
      'How to use': 'Como usar',
      'Contact': 'Contato',
      'Licence': 'Licença',
      'Language': 'Idioma',
      'Legal': 'Legal',
      'Close': 'Fechar',
      'More': 'Mais',
      'Write to me on LinkedIn.': 'Escreva-me no LinkedIn.',
      'Found a problem or have an idea?': 'Encontrou um problema ou tem uma ideia?',
      'Open an issue on GitHub': 'Abra uma issue no GitHub',
      '{licence}: read the full terms.': '{licence}: leia os termos completos.',
      'Source code': 'Código-fonte',
      'The source code and its history on GitHub.': 'O código-fonte e seu histórico no GitHub.',
      'Auto': 'Auto',
      'Follows your browser': 'Segue o seu navegador',
      'Legal notice & privacy': 'Aviso legal e privacidade',
      'The full notice: who runs this, what is stored, and cookies.': 'O aviso completo: quem mantém, o que é guardado e os cookies.',
      'Run by Miguel Cariño, an individual in Mexico. Free, with no sign-up and no accounts.': 'Mantido por Miguel Cariño, pessoa física no México. Gratuito, sem cadastro e sem contas.',
      'No analytics, advertising or trackers. Files you open are processed in your browser and are not uploaded.': 'Sem análise, publicidade ou rastreadores. Os arquivos que você abre são processados no navegador e não são enviados.',
      'One cookie, carino_lang, remembers your language. Settings stay in your browser.': 'Um cookie, carino_lang, lembra o seu idioma. As configurações ficam no seu navegador.',
      'Provided as is, without warranty. Not medical, tax, legal or financial advice.': 'Fornecido como está, sem garantia. Não é orientação médica, fiscal, jurídica ou financeira.',
      'Version {v}': 'Versão {v}',
      'Bundled libraries': 'Bibliotecas incluídas',
      'Their licence texts': 'Os textos das licenças',
      'Disclaimer:': 'Aviso:',
      'Third-party': 'De terceiros',
      'Fonts: {list}, under the SIL Open Font License 1.1.': 'Fontes: {list}, sob a SIL Open Font License 1.1.',
      'Key words': 'Palavras-chave',
      'Changelog': 'Histórico de mudanças',
      'This is a summary. The full licence is what applies.': 'Isto é um resumo. O que vale é a licença completa.',
      'No licence is stated for this code yet, so the usual copyright rules apply: you may read the source, but ask before reusing it.': 'Este código ainda não declara uma licença, então valem as regras usuais de direitos autorais: você pode ler o código-fonte, mas pergunte antes de reutilizá-lo.',
      'Free software: you may use, study, change and share it. If you share it, or let people use a changed version over a network, you must offer them its source code under the same licence.': 'Software livre: você pode usá-lo, estudá-lo, modificá-lo e compartilhá-lo. Se você o compartilhar, ou deixar outras pessoas usarem uma versão modificada por uma rede, deve oferecer a elas o código-fonte sob a mesma licença.',
      'Free software: you may use, study, change and share it. If you share it or a changed version, you must pass on its source code under the same licence.': 'Software livre: você pode usá-lo, estudá-lo, modificá-lo e compartilhá-lo. Se compartilhar ele ou uma versão modificada, deve repassar o código-fonte sob a mesma licença.',
      'Free software: you may use, change and share it, also inside larger works under other licences. Changes to its own files stay under the MPL, with their source available.': 'Software livre: você pode usá-lo, modificá-lo e compartilhá-lo, inclusive dentro de obras maiores com outras licenças. Alterações nos próprios arquivos dele continuam sob a MPL, com o código-fonte disponível.',
      'A permissive licence: you may use, copy, change, share and sell it, as long as the copyright and licence notice stay with it.': 'Uma licença permissiva: você pode usá-lo, copiá-lo, modificá-lo, compartilhá-lo e vendê-lo, desde que o aviso de direitos autorais e de licença o acompanhe.',
      'A permissive licence: you may use, change, share and sell it, as long as you keep its notices and mark the files you changed. It includes a patent licence.': 'Uma licença permissiva: você pode usá-lo, modificá-lo, compartilhá-lo e vendê-lo, desde que mantenha os avisos e marque os arquivos que alterou. Inclui uma licença de patentes.',
    },
    ja: {
      'Carino Systems — back to hub': 'Carino Systems — ハブに戻る',
      '{app} — reload': '{app} — 再読み込み',
      'About': '概要',
      'How to use': '使い方',
      'Contact': 'お問い合わせ',
      'Licence': 'ライセンス',
      'Language': '言語',
      'Legal': '法的事項',
      'Close': '閉じる',
      'More': 'その他',
      'Write to me on LinkedIn.': 'LinkedIn でご連絡ください。',
      'Found a problem or have an idea?': '問題を見つけた、またはアイデアがありますか？',
      'Open an issue on GitHub': 'GitHub で Issue を作成',
      '{licence}: read the full terms.': '{licence}：条文の全文を読む。',
      'Source code': 'ソースコード',
      'The source code and its history on GitHub.': 'GitHub 上のソースコードとその履歴。',
      'Auto': '自動',
      'Follows your browser': 'ブラウザーの設定に従います',
      'Legal notice & privacy': '法的事項とプライバシー',
      'The full notice: who runs this, what is stored, and cookies.': '全文：運営者、保存される情報、Cookie について。',
      'Run by Miguel Cariño, an individual in Mexico. Free, with no sign-up and no accounts.': 'メキシコの個人、Miguel Cariño が運営しています。無料で、登録もアカウントも不要です。',
      'No analytics, advertising or trackers. Files you open are processed in your browser and are not uploaded.': 'アクセス解析、広告、トラッカーはありません。開いたファイルはブラウザー内で処理され、アップロードされません。',
      'One cookie, carino_lang, remembers your language. Settings stay in your browser.': 'Cookie は言語を記憶する carino_lang の一つだけです。設定はブラウザー内に保存されます。',
      'Provided as is, without warranty. Not medical, tax, legal or financial advice.': '現状のまま無保証で提供されます。医療、税務、法律、金融の助言ではありません。',
      'Version {v}': 'バージョン {v}',
      'Bundled libraries': '同梱ライブラリ',
      'Their licence texts': 'ライセンス全文',
      'Disclaimer:': '免責事項：',
      'Third-party': 'サードパーティ',
      'Fonts: {list}, under the SIL Open Font License 1.1.': 'フォント：{list}（SIL Open Font License 1.1）。',
      'Key words': '主な用語',
      'Changelog': '変更履歴',
      'This is a summary. The full licence is what applies.': 'これは要約です。適用されるのはライセンスの全文です。',
      'No licence is stated for this code yet, so the usual copyright rules apply: you may read the source, but ask before reusing it.': 'このコードにはまだライセンスが明記されていないため、通常の著作権のルールが適用されます。ソースコードを読むことはできますが、再利用する前にご相談ください。',
      'Free software: you may use, study, change and share it. If you share it, or let people use a changed version over a network, you must offer them its source code under the same licence.': 'フリーソフトウェアです。使用、研究、変更、共有ができます。共有する場合、または変更版をネットワーク経由で他の人に使わせる場合は、同じライセンスでソースコードを提供する必要があります。',
      'Free software: you may use, study, change and share it. If you share it or a changed version, you must pass on its source code under the same licence.': 'フリーソフトウェアです。使用、研究、変更、共有ができます。本体または変更版を共有する場合は、同じライセンスでソースコードも渡す必要があります。',
      'Free software: you may use, change and share it, also inside larger works under other licences. Changes to its own files stay under the MPL, with their source available.': 'フリーソフトウェアです。使用、変更、共有ができ、他のライセンスの大きな作品に組み込むこともできます。このソフトウェア自身のファイルへの変更は MPL のままとなり、そのソースコードを公開する必要があります。',
      'A permissive licence: you may use, copy, change, share and sell it, as long as the copyright and licence notice stay with it.': '寛容なライセンスです。著作権表示とライセンス表示を残す限り、使用、複製、変更、共有、販売ができます。',
      'A permissive licence: you may use, change, share and sell it, as long as you keep its notices and mark the files you changed. It includes a patent licence.': '寛容なライセンスです。表示を残し、変更したファイルを明示する限り、使用、変更、共有、販売ができます。特許ライセンスも含まれます。',
    },
    ru: {
      'Carino Systems — back to hub': 'Carino Systems — вернуться в хаб',
      '{app} — reload': '{app} — перезагрузить',
      'About': 'О сайте',
      'How to use': 'Как пользоваться',
      'Contact': 'Связаться',
      'Licence': 'Лицензия',
      'Language': 'Язык',
      'Legal': 'Правовое',
      'Close': 'Закрыть',
      'More': 'Ещё',
      'Write to me on LinkedIn.': 'Напишите мне в LinkedIn.',
      'Found a problem or have an idea?': 'Нашли проблему или есть идея?',
      'Open an issue on GitHub': 'Откройте issue на GitHub',
      '{licence}: read the full terms.': '{licence}: полный текст лицензии.',
      'Source code': 'Исходный код',
      'The source code and its history on GitHub.': 'Исходный код и его история на GitHub.',
      'Auto': 'Авто',
      'Follows your browser': 'Следует настройкам браузера',
      'Legal notice & privacy': 'Правовая информация и конфиденциальность',
      'The full notice: who runs this, what is stored, and cookies.': 'Полный текст: кто ведёт сайт, что хранится и cookie.',
      'Run by Miguel Cariño, an individual in Mexico. Free, with no sign-up and no accounts.': 'Ведёт Мигель Кариньо, частное лицо в Мексике. Бесплатно, без регистрации и учётных записей.',
      'No analytics, advertising or trackers. Files you open are processed in your browser and are not uploaded.': 'Без аналитики, рекламы и трекеров. Открытые файлы обрабатываются в браузере и никуда не загружаются.',
      'One cookie, carino_lang, remembers your language. Settings stay in your browser.': 'Один cookie, carino_lang, запоминает язык. Настройки хранятся в браузере.',
      'Provided as is, without warranty. Not medical, tax, legal or financial advice.': 'Предоставляется как есть, без гарантий. Не является медицинской, налоговой, юридической или финансовой консультацией.',
      'Version {v}': 'Версия {v}',
      'Bundled libraries': 'Встроенные библиотеки',
      'Their licence texts': 'Тексты их лицензий',
      'Disclaimer:': 'Оговорка:',
      'Third-party': 'Сторонние компоненты',
      'Fonts: {list}, under the SIL Open Font License 1.1.': 'Шрифты: {list}, по лицензии SIL Open Font License 1.1.',
      'Key words': 'Ключевые слова',
      'Changelog': 'История изменений',
      'This is a summary. The full licence is what applies.': 'Это краткое изложение. Действует полный текст лицензии.',
      'No licence is stated for this code yet, so the usual copyright rules apply: you may read the source, but ask before reusing it.': 'Для этого кода лицензия пока не указана, поэтому действуют обычные нормы авторского права: исходный код можно читать, но перед повторным использованием спросите разрешения.',
      'Free software: you may use, study, change and share it. If you share it, or let people use a changed version over a network, you must offer them its source code under the same licence.': 'Свободная программа: её можно использовать, изучать, изменять и распространять. Если вы распространяете её или даёте другим пользоваться изменённой версией по сети, вы должны предоставить им исходный код на тех же условиях.',
      'Free software: you may use, study, change and share it. If you share it or a changed version, you must pass on its source code under the same licence.': 'Свободная программа: её можно использовать, изучать, изменять и распространять. Распространяя её или изменённую версию, вы должны передавать и исходный код на тех же условиях.',
      'Free software: you may use, change and share it, also inside larger works under other licences. Changes to its own files stay under the MPL, with their source available.': 'Свободная программа: её можно использовать, изменять и распространять, в том числе в составе более крупных работ под другими лицензиями. Изменения её собственных файлов остаются под MPL, а их исходный код должен быть доступен.',
      'A permissive licence: you may use, copy, change, share and sell it, as long as the copyright and licence notice stay with it.': 'Разрешительная лицензия: программу можно использовать, копировать, изменять, распространять и продавать при условии, что с ней сохраняется уведомление об авторском праве и лицензии.',
      'A permissive licence: you may use, change, share and sell it, as long as you keep its notices and mark the files you changed. It includes a patent licence.': 'Разрешительная лицензия: программу можно использовать, изменять, распространять и продавать, если сохранять её уведомления и отмечать изменённые файлы. Включает патентную лицензию.',
    },
  };

  function langNow() {
    var l = String((window.CarinoLang && window.CarinoLang.current) || document.documentElement.lang || 'en');
    return /^pt/i.test(l) ? 'pt-BR' : l.slice(0, 2).toLowerCase();
  }
  // A site's window.t answers first; only a string it does not know (t
  // hands the key back) falls to the dictionary above. `literal` is the
  // finished English ("Learn — reload"), which is how site dictionaries key
  // it; `key` is the template with {name} slots, tried after it.
  function tr(key, vars, literal) {
    var fill = function (s) {
      return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && k in vars ? vars[k] : m; });
    };
    var en = literal || fill(key);
    if (typeof window.t === 'function') {
      try {
        var v = window.t(en);
        if (typeof v === 'string' && v && v !== en) return v;
        if (vars) { v = window.t(key); if (typeof v === 'string' && v && v !== key) return fill(v); }
      } catch (e) { /* not an i18n function after all */ }
    }
    var d = L10N[langNow()];
    return d && d[key] ? fill(d[key]) : en;
  }
  function label(el, text, aria) {
    if (!el) return;
    el.title = text;
    if (aria) el.setAttribute('aria-label', text);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // A page with carino-theme.js gets its mark from there, as the theme
  // switch; only a page without it gets a plain mark from this file.
  var THEMED = !!document.querySelector('script[src*="carino-theme.js"]');

  var MARKUP = ''
    + '<header class="top-header" id="carinoNav" data-cn-lang="about">'
    + '<div class="cn-left">'
    + '<span class="cn-brand">'
    + (MARK && !THEMED ? '<a class="cn-mark" href="./"><img src="' + esc(MARK) + '" alt="" width="28" height="28"></a>' : '')
    + '<a class="brand-name" href="https://carino.systems/">Carino</a>'
    + '<a class="cn-product" href="./"></a>'
    + '</span>'
    + '<div class="header-clock">'
    + '<span class="clock-time">00:00:00</span>'
    + '<span class="clock-tz">LOCAL</span>'
    + '</div></div>'
    + '<div class="cn-right">'
    + '<button type="button" class="icon-btn cn-help-btn" id="cnLegal" aria-haspopup="dialog" aria-expanded="false" aria-controls="cnAbout">'
    + svg(INFO) + '<span class="lbl" data-cn-t="About"></span></button>'
    + '</div>'
    + '</header>';

  // The product's name in the About window: "Carino" and the name, unless
  // the name already has it.
  var PRODUCT = /^carino\b/i.test(NAME) ? NAME : 'Carino' + (NAME ? ' ' + NAME : ' Systems');

  // Tooltips, aria-labels and the window's words.
  function relabel() {
    var nav = document.getElementById('carinoNav');
    if (!nav) return;
    label(nav.querySelector('.brand-name'), tr('Carino Systems — back to hub'));
    if (NAME) label(nav.querySelector('.cn-product'), tr('{app} — reload', { app: NAME }));
    label(nav.querySelector('.cn-mark'), tr('{app} — reload', { app: NAME || 'Carino' }), true);
    label(nav.querySelector('#cnLegal'), tr('About'), true);
    var ht = nav.querySelector('#cnHelpTitle');
    if (ht) ht.textContent = PRODUCT;
    var lc = nav.querySelector('#cnLicence small');
    if (lc) lc.textContent = tr('{licence}: read the full terms.', { licence: LICENCE });
    var hl = nav.querySelector('#cnHelpLine');
    if (hl) hl.textContent = pageLine();
    var vr = nav.querySelector('#cnVersion');
    if (vr) vr.textContent = tr('Version {v}', { v: VERSION || dateVersion() });
    Array.prototype.forEach.call(nav.querySelectorAll('[data-cn-t]'), function (el) { el.textContent = tr(el.getAttribute('data-cn-t')); });
    label(nav.querySelector('.cn-x'), tr('Close'), true);
    var more = nav.querySelector('.cn-more');
    if (more) label(more, tr('More'), true);
    renderLangs(nav);
  }

  // carino-navbar.js is deferred and executes BEFORE carino-lang.js and the
  // site's i18n.js, so neither the language nor window.t exists yet when
  // inject() first renders. Each site's i18n.js adopts the fleet locale in its
  // own DOMContentLoaded or carino:langchange handler, registered after this
  // one, so re-render on a timeout, once every handler has finished; the
  // refit waits one tick more, for carino-clock.js to repaint its label too.
  function rerender() {
    setTimeout(function () { relabel(); setTimeout(queueFit, 0); }, 0);
  }
  window.addEventListener('carino:langchange', rerender);
  document.addEventListener('DOMContentLoaded', rerender);

  function loadClockModule() {
    if (document.querySelector('script[data-carino-clock]')) return;
    var s = document.createElement('script');
    s.src = CLOCK_SRC;
    s.async = true;
    s.setAttribute('data-carino-clock', '');
    document.head.appendChild(s);
  }

  // Move an app's own header controls INTO the navbar's right cluster so there
  // is a single top bar. The real DOM nodes are moved (not cloned), so their
  // event handlers and ids are preserved. An app can opt in explicitly with
  // [data-carino-actions] (the controls) + [data-carino-strip] (the now-empty
  // wrapper to delete); otherwise we auto-detect the leftover `header.cs-header`
  // bar that this migration leaves as a direct child of <body>.
  function relocateActions(nav) {
    var actions = document.querySelector('[data-carino-actions]');
    var strip = document.querySelector('[data-carino-strip]');
    if (!actions) {
      var old = document.querySelector('body > header.cs-header');
      if (old) { actions = old.querySelector('.cs-right') || old; strip = old; }
    }
    if (actions) {
      actions.classList.add('cn-actions');
      var right = nav.querySelector('.cn-right');
      right.insertBefore(actions, right.firstChild);
    }
    if (strip && strip !== actions && strip.parentNode) strip.remove();
  }

  // ---- about -----------------------------------------------------------
  // The site's one short line (sites.json "line", written into the head
  // block as carino:line and translated in #carino-head-i18n); the long
  // description is the fallback for a page the generator has not reached.
  function pageLine() {
    var lang = langNow(), d = '';
    try {
      var j = JSON.parse((document.getElementById('carino-head-i18n') || {}).textContent || '{}');
      if (lang !== 'en' && j[lang]) d = j[lang].line || j[lang].desc || '';
    } catch (e) { /* no translations */ }
    if (!d) {
      var m = document.querySelector('meta[name="carino:line"]') || document.querySelector('meta[name="description"]');
      d = m ? m.content : '';
    }
    return d;
  }

  function way(href, icon, title, sub, id) {
    var ext = href === LEGAL_URL ? '' : ' target="_blank" rel="noopener"';
    return '<a class="cn-way" href="' + href + '"' + ext + (id ? ' id="' + id + '"' : '') + '>' + svg(icon)
      + '<span><b data-cn-t="' + title + '"></b><small' + (sub ? ' data-cn-t="' + sub + '"' : '') + '></small></span></a>';
  }

  // Language rows: Auto plus the five. carino-lang.js keeps the choice.
  function renderLangs(nav) {
    var box = nav.querySelector('.cn-langs');
    var L = window.CarinoLang;
    if (!box || !L) return;
    var manual = L.mode === 'manual', cur = L.current;
    var rows = [['auto', tr('Auto'), tr('Follows your browser')]].concat(LANGS.map(function (l) { return [l[0], l[1], l[0].toUpperCase()]; }));
    box.innerHTML = rows.map(function (r) {
      var on = r[0] === 'auto' ? !manual : (manual && r[0] === cur);
      return '<button type="button" class="cn-lang" role="radio" aria-checked="' + on + '" data-lang="' + r[0] + '">'
        + '<span' + (r[0] === 'auto' ? '' : ' lang="' + r[0] + '"') + '>' + esc(r[1]) + '</span><small>' + esc(r[2]) + '</small></button>';
    }).join('');
    paintWords(nav);
  }

  // Key words. The floating lanes keep running through a language change:
  // only their text is swapped. A hidden list carries all of them for
  // screen readers.
  var wordAt = 0;
  function wordText(el, k) {
    var v = tr(k), en = /^en/.test(langNow());
    el.setAttribute('data-k', k);
    el.querySelector('b').textContent = v;
    el.querySelector('small').textContent = en || v === k ? '' : k;
  }
  function paintWords(nav) {
    var list = nav.querySelector('.cn-words');
    if (!list) return;
    var en = /^en/.test(langNow());
    list.setAttribute('lang', langNow());
    list.innerHTML = WORDS.map(function (k) {
      var v = tr(k);
      return '<li><b>' + esc(v) + '</b><small lang="en">' + (en || v === k ? '' : esc(k)) + '</small></li>';
    }).join('');
    var fl = nav.querySelector('.cn-float');
    if (!fl) return;
    fl.setAttribute('lang', langNow());
    Array.prototype.forEach.call(fl.querySelectorAll('.cn-fl'), function (el) {
      if (!el.hasAttribute('data-k')) { wordText(el, WORDS[wordAt % WORDS.length]); wordAt++; }
      else wordText(el, el.getAttribute('data-k'));
    });
  }

  // The mark the bar shows (the theme switch's current image, a plain
  // data-mark, or a site's own), copied large into the About tab.
  function paintMark(nav) {
    var box = nav.querySelector('.cn-bigmark');
    if (!box) return;
    var imgs = Array.prototype.slice.call(nav.querySelectorAll('.cn-brand img'));
    var shown = imgs.filter(function (i) { return getComputedStyle(i).display !== 'none'; });
    var src = (shown[0] || imgs[0]);
    box.innerHTML = '';
    if (!src) return;
    var big = document.createElement('img');
    big.src = src.currentSrc || src.src;
    big.alt = '';
    big.width = 128; big.height = 128;
    box.appendChild(big);
  }

  // Bundled libraries: [name, SPDX id], and where their licence texts are.
  var LIBS = [], LIBS_HREF = '';
  (function () {
    var u = document.querySelector('[data-carino-libs]');
    if (!u) return;
    LIBS_HREF = u.getAttribute('data-href') || '';
    Array.prototype.forEach.call(u.querySelectorAll('li'), function (li) {
      LIBS.push([li.textContent.replace(/\s+/g, ' ').trim(), li.getAttribute('data-licence') || '']);
    });
    u.remove();
  })();

  // The project's key words, English, read once from the page.
  var WORDS = [];
  (function () {
    var w = document.querySelector('[data-carino-words]');
    if (!w) return;
    Array.prototype.forEach.call(w.querySelectorAll('li'), function (li) {
      var k = li.textContent.replace(/\s+/g, ' ').trim();
      if (k) WORDS.push(k);
    });
    w.remove();
  })();

  // The fonts this page declares (self-hosted, every one SIL OFL 1.1).
  function paintFonts(nav) {
    var line = nav.querySelector('.cn-fonts');
    if (!line || !document.fonts || !document.fonts.forEach) return;
    var fams = [];
    document.fonts.forEach(function (f) {
      var n = String(f.family).replace(/^["']|["']$/g, '');
      if (fams.indexOf(n) < 0) fams.push(n);
    });
    if (!fams.length) return;
    fams.sort();
    line.innerHTML = esc(tr('Fonts: {list}, under the SIL Open Font License 1.1.', { list: fams.join(', ') }))
      + ' <a href="https://openfontlicense.org/" target="_blank" rel="noopener">openfontlicense.org</a>';
    line.parentNode.hidden = false;
  }

  function about(nav) {
    var btn = nav.querySelector('#cnLegal');
    if (!btn) return;
    var ISSUES = 'https://github.com/MiguelCarino/' + (REPO || 'Carino-Systems') + '/issues';
    var howto = document.querySelector('[data-carino-howto]');
    var TABS = [
      ['about', 'About'],
      ['howto', 'How to use', !howto],
      ['contact', 'Contact'],
      ['licence', 'Licence'],
      ['language', 'Language', !window.CarinoLang && !document.querySelector('script[src*="carino-lang.js"]')],
      ['legal', 'Legal', ON_LEGAL]
    ];
    var panels = {
      about: '<h2 id="cnHelpTitle"></h2><p id="cnHelpLine"></p><div class="cn-bigmark" aria-hidden="true"></div>',
      howto: '<h3 data-cn-t="How to use"></h3>',
      contact: '<h3 data-cn-t="Contact"></h3><div class="cn-ways">' + way(LINKEDIN_URL, LI, 'LinkedIn', 'Write to me on LinkedIn.') + '</div>'
        + '<p class="cn-issues"><span data-cn-t="Found a problem or have an idea?"></span> '
        + '<a href="' + ISSUES + '" target="_blank" rel="noopener">' + svg('<path d="' + GH + '"></path>') + '<span data-cn-t="Open an issue on GitHub"></span></a></p>',
      licence: '<h3 data-cn-t="Licence"></h3>'
        + (LICENCE_SUMMARY ? '<p class="cn-lic-sum" data-cn-t="' + LICENCE_SUMMARY + '"></p>'
          + '<p class="cn-lic-note" data-cn-t="This is a summary. The full licence is what applies."></p>' : '')
        + '<div class="cn-ways">'
        + (LICENCE ? way(LICENCE_HOME, DOC, LICENCE, '', 'cnLicence') : '')
        + way(GH_URL, '<path d="' + GH + '"></path>', 'Source code', 'The source code and its history on GitHub.') + '</div>'
        + '<div class="cn-third-part"' + (LIBS.length ? '' : ' hidden') + '><h3 class="cn-third-h" data-cn-t="Third-party"></h3>'
        + (LIBS.length ? '<p class="cn-third"><b data-cn-t="Bundled libraries"></b></p><ul class="cn-libs">'
          + LIBS.map(function (l) { return '<li>' + esc(l[0]) + (l[1] ? '<small>' + esc(l[1]) + '</small>' : '') + '</li>'; }).join('') + '</ul>'
          + (LIBS_HREF ? '<p class="cn-third"><a href="' + esc(LIBS_HREF) + '" target="_blank" rel="noopener" data-cn-t="Their licence texts"></a></p>' : '') : '')
        + '<p class="cn-third cn-fonts"></p></div>',
      language: '<h3 data-cn-t="Language"></h3><div class="cn-langs" role="radiogroup"></div>'
        + (WORDS.length ? '<h3 class="cn-words-h" data-cn-t="Key words"></h3><div class="cn-float" aria-hidden="true">'
          + '<span class="cn-fl"><b></b><small lang="en"></small></span>'
          + (WORDS.length > 1 ? '<span class="cn-fl cn-fl2"><b></b><small lang="en"></small></span>' : '')
          + '</div><ul class="cn-words"></ul>' : ''),
      legal: '<h3 data-cn-t="Legal"></h3><ul class="cn-legal-list">'
        + LEGAL_LINES.map(function (l) { return '<li data-cn-t="' + l + '"></li>'; }).join('') + '</ul>'
        + '<div class="cn-ways">' + way(LEGAL_URL, SHIELD, 'Legal notice & privacy', 'The full notice: who runs this, what is stored, and cookies.') + '</div>'
    };
    var pop = document.createElement('div');
    pop.className = 'cn-help';
    pop.id = 'cnAbout';
    pop.hidden = true;
    pop.innerHTML = '<div class="cn-help-card" role="dialog" aria-modal="true" aria-labelledby="cnHelpTitle">'
      + '<button type="button" class="cn-x">' + svg(CLOSE) + '</button>'
      + '<div class="cn-abtabs" role="tablist" aria-orientation="vertical">'
      + TABS.map(function (t) {
        return '<button type="button" class="cn-tab" role="tab" id="cnTab-' + t[0] + '" aria-controls="cnPanel-' + t[0] + '" aria-selected="false" tabindex="-1"'
          + (t[2] ? ' hidden' : '') + ' data-cn-t="' + t[1] + '"></button>';
      }).join('')
      + '</div><div class="cn-panels">'
      + TABS.map(function (t) {
        return '<section class="cn-panel cn-p-' + t[0] + '" role="tabpanel" id="cnPanel-' + t[0] + '" aria-labelledby="cnTab-' + t[0] + '" hidden>' + (t[2] ? '' : panels[t[0]]) + '</section>';
      }).join('')
      + '</div></div>';
    // the page's own blocks, moved in: what it must say, and how to use it
    var credits = document.querySelector('[data-carino-licence]');
    if (credits) {
      credits.hidden = false;
      credits.classList.add('cn-lic-page');
      pop.querySelector('.cn-third-part').appendChild(credits);
      pop.querySelector('.cn-third-part').hidden = false;
    }
    var own = document.querySelector('[data-carino-about]');
    if (own) {
      own.hidden = false;
      own.classList.add('cn-ab-page');
      var lab = document.createElement('b');
      lab.className = 'cn-ab-label';
      lab.setAttribute('data-cn-t', 'Disclaimer:');
      own.insertBefore(lab, own.firstChild);
      pop.querySelector('.cn-p-about').appendChild(own);
    }
    // the version closes the About tab, under the disclaimer
    var ver = document.createElement('p');
    ver.className = 'cn-version';
    ver.id = 'cnVersion';
    pop.querySelector('.cn-p-about').appendChild(ver);
    if (CHANGELOG) {
      var cl = document.createElement('a');
      cl.className = 'cn-changelog';
      cl.href = CHANGELOG;
      cl.target = '_blank';
      cl.rel = 'noopener';
      cl.setAttribute('data-cn-t', 'Changelog');
      pop.querySelector('.cn-p-about').appendChild(cl);
    }
    if (howto) {
      howto.hidden = false;
      howto.classList.add('cn-howto');
      pop.querySelector('.cn-p-howto').appendChild(howto);
    }
    nav.appendChild(pop);

    var tabs = Array.prototype.slice.call(pop.querySelectorAll('.cn-tab'));
    var current = 'about';
    function show(id, focus) {
      var live = tabs.filter(function (x) { return !x.hidden; }).map(function (x) { return x.id.slice(6); });
      var dir = live.indexOf(id) - live.indexOf(current);
      current = id;
      tabs.forEach(function (t) {
        var on = t.id === 'cnTab-' + id;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = pop.querySelector('#' + t.getAttribute('aria-controls'));
        panel.hidden = !on;
        panel.classList.remove('cn-from-r', 'cn-from-l');
        if (on && dir) { void panel.offsetWidth; panel.classList.add(dir > 0 ? 'cn-from-r' : 'cn-from-l'); }
        if (on && focus) t.focus({ preventScroll: true });
        if (on && t.scrollIntoView && window.matchMedia('(max-width:640px)').matches) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
      pop.querySelector('.cn-panels').scrollTop = 0;
    }
    // a sideways swipe on the content moves to the next or previous tab
    var panelsEl = pop.querySelector('.cn-panels'), sx = null, sy = 0;
    panelsEl.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { sx = null; return; }
      var tg = e.target;
      // a control that scrolls sideways itself keeps the gesture
      if (tg.closest && tg.closest('input,select,textarea,pre,code,.cn-nos')) { sx = null; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    panelsEl.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      sx = null;
      if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      var live = tabs.filter(function (x) { return !x.hidden; });
      var i = live.map(function (x) { return x.id.slice(6); }).indexOf(current);
      var n = live[i + (dx < 0 ? 1 : -1)];
      if (n) show(n.id.slice(6), false);
    }, { passive: true });
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { show(t.id.slice(6), true); });
      t.addEventListener('keydown', function (e) {
        var live = tabs.filter(function (x) { return !x.hidden; });
        var i = live.indexOf(t), n = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = live[(i + 1) % live.length];
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = live[(i - 1 + live.length) % live.length];
        else if (e.key === 'Home') n = live[0];
        else if (e.key === 'End') n = live[live.length - 1];
        if (n) { e.preventDefault(); show(n.id.slice(6), true); }
      });
    });
    // each lane takes the next word as it finishes a rise, out of sight
    var fl = pop.querySelector('.cn-float');
    if (fl) fl.addEventListener('animationiteration', function (e) {
      if (!e.target.classList.contains('cn-fl')) return;
      wordText(e.target, WORDS[wordAt % WORDS.length]); wordAt++;
    });
    pop.querySelector('.cn-langs') && pop.querySelector('.cn-langs').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.cn-lang');
      if (!b || !window.CarinoLang) return;
      window.CarinoLang.set(b.getAttribute('data-lang'));
      renderLangs(nav);
      var again = pop.querySelector('.cn-lang[data-lang="' + b.getAttribute('data-lang') + '"]');
      if (again) again.focus({ preventScroll: true });
    });

    function open(on) {
      pop.hidden = !on;
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) {
        var menu = nav.querySelector('.cn-more-menu'); if (menu) menu.hidden = true;
        renderLangs(nav);
        paintMark(nav);
        paintFonts(nav);
        show('about', true);
      }
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(pop.hidden); });
    pop.querySelector('.cn-x').addEventListener('click', function () { open(false); btn.focus(); });
    // the scrim, not the card, closes it
    pop.addEventListener('click', function (e) { if (e.target === pop) open(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !pop.hidden) { e.preventDefault(); open(false); btn.focus(); }
    });
    // the mark follows the theme while the window is open
    window.addEventListener('carino:themechange', function () { setTimeout(function () { paintMark(nav); }, 0); });
    window.CarinoNav = window.CarinoNav || {};
    window.CarinoNav.version = function (v) {
      VERSION = String(v || '').replace(/^v/i, '');
      relabel();
    };
    // a site can open the window on a tab: CarinoNav.about('howto')
    window.CarinoNav.about = function (tab) {
      open(true);
      if (tab && pop.querySelector('#cnTab-' + tab + ':not([hidden])')) show(tab, true);
    };
  }

  // ---- fitting ----------------------------------------------------------
  // Stage 0: everything in the bar. Stage 1: the clock steps aside. Stage 2:
  // the app's controls fold, except the kept ones. Stage 3: the kept ones
  // fold as well (priority 2, then 1), since the brand comes first. Stage 4:
  // the product name gives way to an ellipsis. Each stage is tried from 0
  // upward and the first that fits wins.
  var fitting = false, fitQueued = false, fitPending = false, fitObserver = null;

  function ensureMore(nav) {
    var btn = nav.querySelector('.cn-more');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn cn-more';
    // An SVG like its neighbours, not a text glyph a site's font may lack.
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="5" cy="12" r="1.9"></circle><circle cx="12" cy="12" r="1.9"></circle><circle cx="19" cy="12" r="1.9"></circle></svg>';
    btn.hidden = true;
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'cnMoreMenu');
    var menu = document.createElement('div');
    menu.className = 'cn-more-menu';
    menu.id = 'cnMoreMenu';
    menu.hidden = true;
    var keep = document.createElement('div');
    // .cn-actions too, so an app's `#carinoNav .cn-actions …` rules still reach a kept control
    keep.className = 'cn-keep cn-actions';
    var right = nav.querySelector('.cn-right');
    right.appendChild(keep);
    right.appendChild(btn);
    nav.appendChild(menu);
    label(btn, tr('More'), true);
    function open(on) {
      menu.hidden = !on;
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(menu.hidden); });
    document.addEventListener('click', function (e) {
      if (menu.hidden || menu.contains(e.target)) return;
      open(false);
    });
    // A button or link inside the menu does its job and closes it; form
    // fields (selects, inputs) keep it open while they are in use.
    menu.addEventListener('click', function (e) {
      var hit = e.target.closest && e.target.closest('button,a');
      // a toggle for something nested (a dropdown, a disclosure) keeps it open
      if (hit && !hit.closest('select,label') && !hit.hasAttribute('aria-haspopup') && !hit.hasAttribute('aria-expanded')) {
        setTimeout(function () { open(false); }, 0);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { open(false); btn.focus(); }
    });
    return btn;
  }

  // Each moved node leaves a comment behind, so it returns to its exact spot.
  function park(node, dest) {
    if (!node || node.__cnHome) return;
    var mark = document.createComment('cn-home');
    node.parentNode.insertBefore(mark, node);
    node.__cnHome = mark;
    dest.appendChild(node);
  }
  function unpark(node) {
    var mark = node && node.__cnHome;
    if (!mark) return;
    if (mark.parentNode) mark.parentNode.insertBefore(node, mark), mark.remove();
    node.__cnHome = null;
  }

  function keptControls(actions) {
    var marked = actions.querySelectorAll('[data-priority="1"],[data-priority="2"]');
    if (marked.length) return Array.prototype.slice.call(marked);
    var first = actions.querySelector('.btn-primary,.primary,.cs-btn.primary');
    return first ? [first] : [];
  }

  function cramped(nav) {
    // Positions, not widths: an app may put its own button before the brand.
    var left = nav.querySelector('.cn-left').getBoundingClientRect();
    var brand = nav.querySelector('.cn-brand').getBoundingClientRect();
    if (brand.right > left.right + 1 || brand.right > window.innerWidth) return true;
    if (nav.scrollWidth > nav.clientWidth + 1) return true;
    var clock = nav.querySelector('.header-clock');
    if (clock && clock.offsetParent !== null && clock.clientWidth + 1 < clock.scrollWidth) return true;
    return false;
  }

  // Moving a field someone is typing in would drop the caret (and a phone's
  // keyboard resizes the window), so wait until focus leaves it.
  function typingInNav(nav) {
    var a = document.activeElement;
    return !!(a && nav.contains(a) && a.matches('input,select,textarea,[contenteditable="true"]'));
  }

  function fit() {
    var nav = document.getElementById('carinoNav');
    if (!nav || fitting) return;
    if (typingInNav(nav)) { fitPending = true; return; }
    fitting = true;
    try {
      var right = nav.querySelector('.cn-right');
      var more = ensureMore(nav);
      var menu = nav.querySelector('.cn-more-menu');
      var keep = right.querySelector('.cn-keep');
      var actions = nav.querySelector('.cn-actions:not(.cn-keep)');
      // An app that moved its controls out of the bar owns them now.
      var ownActions = actions && (actions.parentNode === right || actions.parentNode === menu);
      // Back to stage 0.
      Array.prototype.slice.call(keep.children).forEach(unpark);
      if (ownActions) unpark(actions);
      nav.classList.remove('cn-noclock', 'cn-squeeze');
      more.hidden = true;
      if (!cramped(nav)) { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); return; }
      // Stage 1.
      nav.classList.add('cn-noclock');
      if (!cramped(nav)) return;
      if (ownActions) {
        // Stage 2: the whole controls block folds, the kept controls stay out.
        more.hidden = false;
        keptControls(actions).forEach(function (el) { park(el, keep); });
        menu.insertBefore(actions, menu.firstChild);
        var mark = document.createComment('cn-home');
        right.insertBefore(mark, keep);
        actions.__cnHome = mark;
        // Stage 3: the brand comes before even the kept controls: priority 2
        // folds first, then priority 1.
        ['2', '1'].forEach(function (rank) {
          if (!cramped(nav)) return;
          Array.prototype.slice.call(keep.children).forEach(function (el) {
            if (el.getAttribute('data-priority') === rank || rank === '1') unpark(el);
          });
        });
      }
      // Stage 4.
      if (cramped(nav)) nav.classList.add('cn-squeeze');
    } finally {
      // The moves above are this function's own; don't let them refit again.
      if (fitObserver) fitObserver.takeRecords();
      fitting = false;
    }
  }

  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(function () { fitQueued = false; fit(); });
  }

  function watchFit(nav) {
    window.addEventListener('resize', queueFit);
    // carino-theme.js, carino-diag.js and the app add to the bar after this
    // runs, and apps show or hide their own controls; refit on any of it.
    // Only the right cluster, the brand and the menu are watched (the clock
    // ticks every second on the left), and text changes are ignored: a live
    // readout in an app's controls would otherwise refit on every update.
    if (window.MutationObserver) {
      ensureMore(nav);
      var menuEl = nav.querySelector('.cn-more-menu'), moreEl = nav.querySelector('.cn-more');
      fitObserver = new MutationObserver(function (records) {
        if (fitting) return;
        // opening and closing the menu is not a change in what has to fit
        for (var i = 0; i < records.length; i++) {
          if (records[i].target !== menuEl && records[i].target !== moreEl) { queueFit(); return; }
        }
      });
      var opts = { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] };
      fitObserver.observe(nav.querySelector('.cn-right'), opts);
      fitObserver.observe(nav.querySelector('.cn-brand'), { childList: true });
      fitObserver.observe(nav.querySelector('.cn-more-menu'), opts);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueFit);
    window.addEventListener('load', queueFit);
    nav.addEventListener('focusout', function () {
      if (fitPending) { fitPending = false; setTimeout(queueFit, 0); }
    });
    queueFit();
  }

  // ---- immersive -------------------------------------------------------
  function immersive(nav) {
    var enabled = !!(SCRIPT && SCRIPT.hasAttribute('data-immersive'));
    var delay = (SCRIPT && parseInt(SCRIPT.getAttribute('data-immersive'), 10)) || 3000;
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var timer = null, hidden = false;
    function set(h) {
      if (h === hidden) return;
      hidden = h;
      nav.classList.toggle('cn-immersed', h);
      try { window.dispatchEvent(new CustomEvent('carino:navbar', { detail: { hidden: h } })); } catch (e) {}
    }
    function busy() {
      var menu = nav.querySelector('.cn-more-menu'), pop = nav.querySelector('.cn-help');
      return nav.contains(document.activeElement) || (menu && !menu.hidden) || (pop && !pop.hidden) || nav.matches(':hover');
    }
    function arm() {
      clearTimeout(timer);
      if (!enabled || (coarse && !document.fullscreenElement)) return;
      timer = setTimeout(function () { if (!busy()) set(true); else arm(); }, document.fullscreenElement ? 1200 : delay);
    }
    function show() { set(false); arm(); }
    window.CarinoNav = window.CarinoNav || {};
    window.CarinoNav.immersive = function (on) {
      enabled = !!on;
      if (enabled) arm(); else { clearTimeout(timer); set(false); }
    };
    document.addEventListener('mousemove', function (e) {
      if (!enabled) return;
      if (e.clientY < 70) show(); else if (!hidden) arm();
    }, { passive: true });
    nav.addEventListener('focusin', function () { if (enabled) show(); });
    document.addEventListener('keydown', function (e) { if (enabled && e.key === 'Escape') show(); });
    document.addEventListener('fullscreenchange', function () {
      if (!enabled) return;
      if (document.fullscreenElement) arm(); else show();
    });
    arm();
  }

  function inject() {
    if (document.getElementById('carinoNav')) return;
    var style = document.createElement('style');
    style.id = 'carino-nav-style';
    style.textContent = CSS;
    document.head.appendChild(style);
    var wrap = document.createElement('div');
    wrap.innerHTML = MARKUP;
    var nav = wrap.firstElementChild;
    document.body.insertBefore(nav, document.body.firstChild);
    if (NAME) nav.querySelector('.cn-product').textContent = NAME;
    about(nav);
    relabel();
    relocateActions(nav);
    watchFit(nav);
    immersive(nav);
    loadClockModule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
