/* ============================================================
   carino-navbar.js — the shared Carino navbar, self-injecting.
   ------------------------------------------------------------
   Drop this file into any Carino Systems project and include it:

     <script src="carino-navbar.js" data-app="AppName" data-repo="RepoName" defer></script>

   data-app is the little tag next to the brand; data-repo is the
   GitHub repository the header's GitHub button points at. They
   differ on the few sites whose repo name is longer than the tag
   (Netplan/NetplanConfig, Setup/SimpleSetup, Software/
   SoftwareCatalog, SyncSubs/SyncSubsStudio), so data-repo falls
   back to data-app and, failing that, to the profile page.

   It injects its own (scoped) styles + the canonical top-header
   markup and runs the greeting. The live CLOCK (Local/UTC/Epoch/
   TAI/.beats + click-to-cycle) lives in the companion file
   carino-clock.js, which this script loads from the SAME site — both
   files ship together in every project, so there is no external/CDN
   dependency and each site works standalone/offline. To change the
   clock, edit carino-clock.js and re-copy it to each site (see
   propagate.sh). All styles are scoped under #carinoNav so nothing
   leaks into (or clashes with) the app.

   The Status diagnostics dropdown lives only on carino.systems
   itself — every sub-project's navbar omits it.

   The bar stays on screen: it sticks to the top of the page at every
   width, so anything else a page makes sticky sits under it, at
   top: var(--nav-h) (carino-ui.css), never at top: 0.

   Brand links: "Carino" goes to the hub (carino.systems); the
   app-tag next to it links to the app's own root — clicking it
   acts as a fresh reload of the current site.

   Right-cluster order is fixed by CSS `order`, not by DOM
   position, because four different scripts insert into it and
   none of them can rely on the others having run yet. Read it
   from the right edge inwards — the socials anchor the row and
   language sits immediately beside them:
     1  the app's own controls (.cn-actions)
     2  status     (carino-diag.js, or an app's own toggle)
     3  language   (carino-lang.js)
     4  About + GitHub + LinkedIn — always last

   The labelled About button that leads that last group opens the about
   popup (after the hub's help pane). Sites
   carry no footer: whatever a page must say (a data credit, a "not
   advice" line, a trademark notice, which outside services it calls, its
   licence and version, a changelog or manual link) goes in a
   <div data-carino-about hidden> anywhere in the page. That node is moved
   (not cloned) into the popup, so ids, handlers and data-i18n survive and
   a script may keep rewriting a line in it. The popup opens with the
   site's own description, then that block, then how to get in touch and
   carino.systems/legal.html, the one legal notice, privacy and cookie
   page for every site. The navbar names the button itself; carino-lang.js
   only translates the tooltip of a bespoke header's plain shield link.
   The legal page itself leaves the shield out.

   Fitting. The brand must never be squeezed out and the clock must stay
   readable, at any width. When the right cluster would do either, items
   fold into a generated "⋯" menu, in this order: first the legal/GitHub/
   LinkedIn row; then the clock steps aside (as it already does below
   900px), because an app's controls matter more than the time; last, the
   app's own controls. Controls marked
   data-priority="1" stay in the bar (an app's one main action), and
   data-priority="2" ones too while there is room (a Live page's source
   badge); without any mark, the first .btn-primary / .primary control
   stays. If even those squeeze the brand, priority 2 folds, then 1. The real
   nodes move (never clones) and return when there is room again, and the
   menu sits inside #carinoNav, so `#carinoNav .cn-actions …` rules still
   apply. If an app has moved .cn-actions somewhere else itself (Topo's
   drawer), it is left alone.

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

   Language. The bar's own words (tooltips, aria-labels, the greeting,
   "More") come from a small dictionary in this file for es, pt-BR, ja
   and ru, picked by CarinoLang.current (or <html lang>), so a site with
   no i18n.js of its own still gets them. A site's window.t wins when it
   has the string. They re-render on carino:langchange, one tick late so
   the site's own handler has switched its dictionary first.
   ============================================================ */
(function () {
  'use strict';

  var SCRIPT = document.currentScript;
  var TAG = (SCRIPT && SCRIPT.getAttribute('data-app')) || '';
  // The GitHub button points at THIS project's repository, not the profile.
  var REPO = (SCRIPT && SCRIPT.getAttribute('data-repo')) || TAG;
  var GH_URL = 'https://github.com/MiguelCarino' + (REPO ? '/' + REPO : '');
  // The repo's licence as its SPDX id (data-license="AGPL-3.0"); the About
  // popup links it to the licence's own home, not to a copy. None, no card.
  var LICENCE = (SCRIPT && SCRIPT.getAttribute('data-license')) || '';
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

  var CSS = ''
    + '#carinoNav{--cn-accent:#eab308;--cn-bg:#050505;--cn-border:#262626;--cn-text:#fff;--cn-muted:#8a8a8a;'
    + '--cn-mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;'
    + '--cn-sans:"IBM Plex Sans",system-ui,-apple-system,sans-serif;'
    + 'height:60px;flex-shrink:0;box-sizing:border-box;background:linear-gradient(180deg,#0f0f0f 0%,#050505 100%);'
    + 'border-bottom:1px solid var(--cn-border);display:flex;align-items:center;justify-content:space-between;'
    + 'gap:16px;padding:0 20px;position:sticky;top:0;z-index:2147483000;font-family:var(--cn-sans);}'
    + '#carinoNav *,#carinoNav *::before,#carinoNav *::after{box-sizing:border-box;}'
    + '#carinoNav .cn-left{display:flex;align-items:center;gap:18px;min-width:0;flex:1 1 auto;overflow:hidden;}'
    + '#carinoNav .cn-right{display:flex;align-items:center;gap:10px;flex-shrink:0;}'
    + '#carinoNav .brand-name{font-family:"Red Hat Display",var(--cn-sans);font-weight:900;font-size:1.5rem;line-height:1;'
    + 'background:linear-gradient(130deg,#fef08a 0%,#eab308 50%,#b45309 100%);-webkit-background-clip:text;background-clip:text;'
    + '-webkit-text-fill-color:transparent;text-decoration:none;white-space:nowrap;cursor:pointer;}'
    + '#carinoNav .cn-brand{display:flex;align-items:center;flex-shrink:0;}'
    + '#carinoNav .app-tag{-webkit-text-fill-color:var(--cn-accent);color:var(--cn-accent);font-family:var(--cn-mono);'
    + 'font-size:.6rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;border:1px solid var(--cn-border);'
    + 'border-radius:4px;padding:3px 6px;margin-left:10px;text-decoration:none;transition:.2s;}'
    + '#carinoNav .app-tag:hover{border-color:var(--cn-accent);background:rgba(234,179,8,.12);}'
    + '#carinoNav .app-tag:empty{display:none;}'
    + '#carinoNav .header-clock{display:flex;align-items:baseline;gap:8px;border-left:1px solid var(--cn-border);padding-left:18px;min-width:0;overflow:hidden;cursor:pointer;user-select:none;}'
    + '#carinoNav .header-clock:hover .clock-tz{filter:brightness(1.12);}'
    + '#carinoNav .clock-time{font-family:var(--cn-mono);font-size:1.05rem;font-weight:700;color:var(--cn-text);flex-shrink:0;}'
    + '#carinoNav .clock-tz{font-family:var(--cn-mono);font-size:.58rem;font-weight:700;color:#050505;background:var(--cn-accent);padding:2px 5px;border-radius:3px;flex-shrink:0;}'
    + '#carinoNav .brand-greeting{font-family:var(--cn-mono);font-size:.68rem;color:var(--cn-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}'
    + '#carinoNav .social-row{display:flex;gap:8px;}'
    + '#carinoNav .icon-btn{width:32px;height:32px;border:1px solid var(--cn-border);border-radius:4px;display:flex;'
    + 'align-items:center;justify-content:center;color:var(--cn-muted);transition:.2s;text-decoration:none;background:transparent;cursor:pointer;}'
    + '#carinoNav .icon-btn:hover{border-color:var(--cn-accent);color:#050505;background:var(--cn-accent);transform:translateY(-2px);box-shadow:0 4px 12px rgba(234,179,8,.18);}'
    + '#carinoNav .icon-btn svg{width:15px;height:15px;}'
    + '#carinoNav .cn-right{gap:12px;min-width:0;}'
    + '#carinoNav .cn-actions{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0;}'
    // Slot order, independent of which script inserted what first.
    + '#carinoNav .cn-right > *{order:1;}'
    + '#carinoNav .cn-right > #cnDiagBtn,#carinoNav .cn-right > .status-toggle{order:2;}'
    + '#carinoNav .cn-right > #cnLangBtn{order:3;}'
    + '#carinoNav .cn-right > .social-row{order:4;}'
    // The divider only makes sense when something sits to the left of it;
    // :only-child covers the sites that ship neither language nor actions.
    + '#carinoNav .cn-right > .social-row:not(:only-child){border-left:1px solid var(--cn-border);padding-left:12px;}'
    + '@media(max-width:900px){#carinoNav .header-clock{display:none;}}'
    + '@media(max-width:640px){#carinoNav .app-tag{display:none;}}'
    // Fitting: the "⋯" button and the menu the folded items move into.
    + '#carinoNav .cn-right > .cn-keep{order:1;display:flex;align-items:center;gap:8px;}'
    + '#carinoNav .cn-right > .cn-more{order:5;}'
    + '#carinoNav .cn-more[hidden],#carinoNav .cn-keep:empty{display:none;}'
    + '#carinoNav.cn-noclock .header-clock{display:none;}'
    + '#carinoNav .cn-more[aria-expanded="true"]:not(:hover){border-color:var(--cn-accent);color:var(--cn-accent);}'
    + '#carinoNav .cn-more-menu{position:absolute;top:calc(100% + 6px);right:12px;z-index:3;display:flex;flex-direction:column;'
    + 'align-items:stretch;gap:12px;min-width:220px;max-width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 80px);overflow:auto;'
    + 'padding:12px;background:#0b0b0b;border:1px solid rgba(234,179,8,.3);border-radius:8px;box-shadow:0 18px 40px rgba(0,0,0,.7);}'
    + '#carinoNav .cn-more-menu[hidden]{display:none;}'
    + '#carinoNav .cn-more-menu .cn-actions{flex-wrap:wrap;overflow:visible;gap:8px;}'
    + '#carinoNav .cn-more-menu .social-row{border:0;padding:0;margin:0;justify-content:flex-start;}'
    + '#carinoNav .cn-more-menu .social-row:not(:first-child){border-top:1px solid var(--cn-border);padding-top:12px;}'
    // About: a labelled button, and the popup it opens (the hub's help pane,
    // in the bar's own colours): a scrim under the bar, one centred card.
    + '#carinoNav .cn-help-btn{width:auto;gap:6px;padding:0 10px;font-family:var(--cn-mono);font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap;}'
    + '#carinoNav .cn-help-btn svg{width:15px;height:15px;flex:none;}'
    // never folds into "⋯": on a phone it keeps its place, as its icon
    + '#carinoNav .cn-right > .cn-help-btn{order:4;}'
    + '@media(max-width:640px){#carinoNav .cn-help-btn{width:32px;padding:0;}#carinoNav .cn-help-btn .lbl{display:none;}}'
    + '#carinoNav .cn-help{position:fixed;inset:60px 0 0 0;z-index:5;display:flex;align-items:center;justify-content:center;'
    + 'padding:clamp(12px,3vh,40px) 16px;background:rgba(0,0,0,.66);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:cn-fade .25s ease both;}'
    + '#carinoNav .cn-help[hidden]{display:none;}'
    + '#carinoNav .cn-help-card{position:relative;width:min(100%,760px);max-height:100%;overflow-y:auto;overscroll-behavior:contain;'
    + 'border-radius:22px;border:1px solid var(--cn-border);background:linear-gradient(180deg,#161616,#0b0b0b);'
    + 'box-shadow:0 30px 80px rgba(0,0,0,.7);color:var(--cn-text);font-family:var(--cn-sans);animation:cn-rise .42s cubic-bezier(.16,1,.3,1) both;}'
    + '#carinoNav .cn-help-txt{padding:clamp(22px,4vh,36px) clamp(20px,4vw,44px) 0;text-align:center;}'
    + '#carinoNav .cn-help-txt h2{margin:0;font-family:"Red Hat Display",var(--cn-sans);font-weight:900;letter-spacing:-.02em;font-size:clamp(1.4rem,1rem + 1.4vh,2rem);line-height:1.15;}'
    + '#carinoNav .cn-help-txt p{margin:10px auto 0;max-width:52ch;color:var(--cn-muted);font-size:1rem;line-height:1.5;}'
    + '#carinoNav .cn-ways{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;padding:clamp(18px,3vh,26px) clamp(20px,4vw,44px) 0;}'
    + '#carinoNav .cn-way{display:flex;align-items:center;gap:14px;padding:15px 18px;border-radius:16px;text-decoration:none;color:var(--cn-text);'
    + 'border:1px solid var(--cn-border);background:rgba(255,255,255,.025);transition:border-color .2s ease,transform .35s cubic-bezier(.16,1,.3,1),background .2s ease;}'
    + '#carinoNav .cn-way svg{width:26px;height:26px;flex:none;color:var(--cn-accent);}'
    + '#carinoNav .cn-way b{display:block;font-family:"Red Hat Display",var(--cn-sans);font-weight:800;font-size:1.02rem;}'
    + '#carinoNav .cn-way small{display:block;margin-top:2px;color:var(--cn-muted);font-size:.84rem;line-height:1.4;}'
    + '#carinoNav .cn-way:hover,#carinoNav .cn-way:focus-visible{border-color:var(--cn-accent);background:rgba(234,179,8,.08);transform:translateY(-2px);outline:none;}'
    // what the page must say: a highlighted box in the accent
    + '#carinoNav .cn-ab-page{max-width:60ch;margin:16px auto 0;padding:12px 16px;text-align:center;border-radius:12px;'
    + 'background:rgba(234,179,8,.1);border:1px solid rgba(234,179,8,.35);}'
    + '#carinoNav .cn-ab-page p{margin:0 0 8px;max-width:none;width:auto;text-align:center;color:var(--cn-text);font-size:.9rem;line-height:1.55;}'
    + '#carinoNav .cn-ab-page p:last-child{margin-bottom:0;}'
    + '#carinoNav .cn-ab-page a{color:var(--cn-accent);}'
    + '#carinoNav .cn-ab-page .cn-ab-meta{font-family:var(--cn-mono);font-size:.72rem;color:var(--cn-muted);}'
    + '#carinoNav .cn-issues{margin:clamp(14px,2.4vh,20px) clamp(20px,4vw,44px) 0;text-align:center;color:var(--cn-muted);font-size:.88rem;line-height:1.5;}'
    + '#carinoNav .cn-issues a{display:inline-flex;align-items:center;gap:6px;color:var(--cn-accent);font-weight:600;text-decoration:none;}'
    + '#carinoNav .cn-issues a:hover,#carinoNav .cn-issues a:focus-visible{text-decoration:underline;outline:none;}'
    + '#carinoNav .cn-issues svg{width:15px;height:15px;}'
    + '#carinoNav .cn-help-back{display:flex;justify-content:center;padding:clamp(16px,2.6vh,24px) 20px clamp(18px,3vh,28px);}'
    + '#carinoNav .cn-pill{display:inline-flex;align-items:center;gap:8px;height:46px;padding:0 20px 0 14px;border-radius:999px;cursor:pointer;'
    + 'border:1px solid var(--cn-accent);background:transparent;color:var(--cn-text);font:inherit;font-weight:700;font-size:1rem;}'
    + '#carinoNav .cn-pill svg{width:18px;height:18px;}'
    + '#carinoNav .cn-pill:hover,#carinoNav .cn-pill:focus-visible{background:rgba(234,179,8,.08);outline:none;}'
    + '@keyframes cn-fade{from{opacity:0}to{opacity:1}}'
    + '@keyframes cn-rise{from{opacity:0;transform:translate3d(0,18px,0) scale(.975)}to{opacity:1;transform:none}}'
    + '@media(max-width:640px){#carinoNav .cn-help{align-items:flex-end;padding:10px 10px calc(10px + env(safe-area-inset-bottom,0px));}}'
    + '@media(prefers-reduced-motion:reduce){#carinoNav .cn-help,#carinoNav .cn-help-card{animation:none;}#carinoNav .cn-way{transition:none;}}'
    // Immersive: collapse the bar's own height so the stage below takes it.
    + '#carinoNav{transition:margin-top .25s ease,opacity .25s ease;}'
    // Back in the flow while hidden, or sticking would hold it at the top.
    + '#carinoNav.cn-immersed{position:relative;margin-top:-60px;opacity:0;pointer-events:none;}'
    + '@media(prefers-reduced-motion:reduce){#carinoNav{transition:none;}}';

  var GH = 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22';
  var LI = 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z';
  var SHIELD = 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z';
  // an i in a circle: the About button
  var INFO = '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>';
  var DOC = '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M9 13h6"></path><path d="M9 17h6"></path>';
  var LEGAL_URL = 'https://carino.systems/legal.html';
  var LEGAL = 'Legal notice & privacy';

  var L10N = {
    es: {
      'Carino Systems — back to hub': 'Carino Systems — volver al hub',
      '{app} — reload': '{app} — recargar',
      '{repo} on GitHub': '{repo} en GitHub',
      'LinkedIn profile': 'Perfil en LinkedIn',
      'About': 'Acerca de',
      'Licence': 'Licencia',
      '{licence}: read the full terms.': '{licence}: lee los términos completos.',
      'GitHub project': 'Proyecto en GitHub',
      'The source code and its history.': 'El código fuente y su historial.',
      'Found a problem or have an idea?': '¿Encontraste un problema o tienes una idea?',
      'Open an issue on GitHub': 'Abre un issue en GitHub',
      'Close': 'Cerrar',
      'Contact': 'Contacto',
      'Write to me on LinkedIn.': 'Escríbeme en LinkedIn.',
      'Legal notice & privacy': 'Aviso legal y privacidad',
      'Who runs this, what is stored, and cookies.': 'Quién lo opera, qué se guarda y las cookies.',
      'More': 'Más',
      'Ready.': 'Listo.',
      'Late shift.': 'Turno nocturno.',
      'Good morning.': 'Buenos días.',
      'Good afternoon.': 'Buenas tardes.',
      'Good evening.': 'Buenas noches.',
    },
    'pt-BR': {
      'Carino Systems — back to hub': 'Carino Systems — voltar ao hub',
      '{app} — reload': '{app} — recarregar',
      '{repo} on GitHub': '{repo} no GitHub',
      'LinkedIn profile': 'Perfil no LinkedIn',
      'About': 'Sobre',
      'Licence': 'Licença',
      '{licence}: read the full terms.': '{licence}: leia os termos completos.',
      'GitHub project': 'Projeto no GitHub',
      'The source code and its history.': 'O código-fonte e seu histórico.',
      'Found a problem or have an idea?': 'Encontrou um problema ou tem uma ideia?',
      'Open an issue on GitHub': 'Abra uma issue no GitHub',
      'Close': 'Fechar',
      'Contact': 'Contato',
      'Write to me on LinkedIn.': 'Escreva-me no LinkedIn.',
      'Legal notice & privacy': 'Aviso legal e privacidade',
      'Who runs this, what is stored, and cookies.': 'Quem mantém, o que é guardado e os cookies.',
      'More': 'Mais',
      'Ready.': 'Pronto.',
      'Late shift.': 'Turno da noite.',
      'Good morning.': 'Bom dia.',
      'Good afternoon.': 'Boa tarde.',
      'Good evening.': 'Boa noite.',
    },
    ja: {
      'Carino Systems — back to hub': 'Carino Systems — ハブに戻る',
      '{app} — reload': '{app} — 再読み込み',
      '{repo} on GitHub': 'GitHub の {repo}',
      'LinkedIn profile': 'LinkedIn プロフィール',
      'About': '概要',
      'Licence': 'ライセンス',
      '{licence}: read the full terms.': '{licence}：条文の全文を読む。',
      'GitHub project': 'GitHub プロジェクト',
      'The source code and its history.': 'ソースコードとその履歴。',
      'Found a problem or have an idea?': '問題を見つけた、またはアイデアがありますか？',
      'Open an issue on GitHub': 'GitHub で Issue を作成',
      'Close': '閉じる',
      'Contact': 'お問い合わせ',
      'Write to me on LinkedIn.': 'LinkedIn でご連絡ください。',
      'Legal notice & privacy': '法的事項とプライバシー',
      'Who runs this, what is stored, and cookies.': '運営者、保存される情報、Cookie について。',
      'More': 'その他',
      'Ready.': '準備完了。',
      'Late shift.': '夜勤お疲れさま。',
      'Good morning.': 'おはようございます。',
      'Good afternoon.': 'こんにちは。',
      'Good evening.': 'こんばんは。',
    },
    ru: {
      'Carino Systems — back to hub': 'Carino Systems — вернуться в хаб',
      '{app} — reload': '{app} — перезагрузить',
      '{repo} on GitHub': '{repo} на GitHub',
      'LinkedIn profile': 'Профиль в LinkedIn',
      'About': 'О сайте',
      'Licence': 'Лицензия',
      '{licence}: read the full terms.': '{licence}: полный текст лицензии.',
      'GitHub project': 'Проект на GitHub',
      'The source code and its history.': 'Исходный код и его история.',
      'Found a problem or have an idea?': 'Нашли проблему или есть идея?',
      'Open an issue on GitHub': 'Откройте issue на GitHub',
      'Close': 'Закрыть',
      'Contact': 'Связаться',
      'Write to me on LinkedIn.': 'Напишите мне в LinkedIn.',
      'Legal notice & privacy': 'Правовая информация и конфиденциальность',
      'Who runs this, what is stored, and cookies.': 'Кто ведёт сайт, что хранится и cookie.',
      'More': 'Ещё',
      'Ready.': 'Готово.',
      'Late shift.': 'Ночная смена.',
      'Good morning.': 'Доброе утро.',
      'Good afternoon.': 'Добрый день.',
      'Good evening.': 'Добрый вечер.',
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

  var MARKUP = ''
    + '<header class="top-header" id="carinoNav">'
    + '<div class="cn-left">'
    + '<span class="cn-brand">'
    + '<a class="brand-name" href="https://carino.systems/">Carino</a>'
    + '<a class="app-tag" href="./"></a>'
    + '</span>'
    + '<div class="header-clock">'
    + '<span class="clock-time">00:00:00</span>'
    + '<span class="clock-tz">LOCAL</span>'
    + '<span class="brand-greeting" id="cnGreeting">Ready.</span>'
    + '</div></div>'
    + '<div class="cn-right">'
    + '<button type="button" class="icon-btn cn-help-btn" id="cnLegal" aria-haspopup="dialog" aria-expanded="false" aria-controls="cnAbout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + INFO + '</svg><span class="lbl" data-cn-t="About"></span></button>'
    + '<div class="social-row">'
    + '<a href="' + GH_URL + '" target="_blank" rel="noopener" class="icon-btn" id="cnGitHub"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="' + GH + '"></path></svg></a>'
    + '<a href="https://www.linkedin.com/in/miguelcarino94/" target="_blank" rel="noopener" class="icon-btn" id="cnLinkedIn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="' + LI + '"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg></a>'
    + '</div>'
    + '</div>'
    + '</header>';

  function set(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  // Greeting stays local to the navbar; the clock is owned by carino-clock.js.
  // Routed through window.t so the greeting follows the fleet language.
  // i18n.js is deferred and may not have run yet, hence the guard; the
  // langchange listener re-renders it when the visitor switches language.
  function greet() {
    var h = new Date().getHours();
    var s = h < 5 ? 'Late shift.' : h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.';
    set('cnGreeting', tr(s));
  }

  // Tooltips and aria-labels. The app tag's visible text is the app's name
  // and stays as it is.
  function relabel() {
    var nav = document.getElementById('carinoNav');
    if (!nav) return;
    label(nav.querySelector('.brand-name'), tr('Carino Systems — back to hub'));
    if (TAG) label(nav.querySelector('.app-tag'), tr('{app} — reload', { app: TAG }));
    label(nav.querySelector('#cnGitHub'), REPO ? tr('{repo} on GitHub', { repo: REPO }) : 'GitHub', true);
    label(nav.querySelector('#cnLinkedIn'), tr('LinkedIn profile'), true);
    label(nav.querySelector('#cnLegal'), tr('About'), true);
    var ht = nav.querySelector('#cnHelpTitle');
    if (ht) ht.textContent = PRODUCT;
    var lc = nav.querySelector('#cnLicence small');
    if (lc) lc.textContent = tr('{licence}: read the full terms.', { licence: LICENCE });
    var hl = nav.querySelector('#cnHelpLine');
    if (hl) hl.textContent = pageLine();
    var ab = nav;
    if (ab) {
      Array.prototype.forEach.call(ab.querySelectorAll('[data-cn-t]'), function (el) { el.textContent = tr(el.getAttribute('data-cn-t')); });
    }
    var more = nav.querySelector('.cn-more');
    if (more) label(more, tr('More'), true);
  }

  // carino-navbar.js is deferred and executes BEFORE carino-lang.js and the
  // site's i18n.js, so neither the language nor window.t exists yet when
  // inject() first renders. Each site's i18n.js adopts the fleet locale in its
  // own DOMContentLoaded or carino:langchange handler, registered after this
  // one, so re-render on a timeout, once every handler has finished; the
  // refit waits one tick more, for carino-clock.js to repaint its label too.
  function rerender() {
    setTimeout(function () { relabel(); greet(); setTimeout(queueFit, 0); }, 0);
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
      right.insertBefore(actions, right.querySelector('.social-row'));
    }
    if (strip && strip !== actions && strip.parentNode) strip.remove();
  }

  // ---- about -----------------------------------------------------------
  // The About button's popup, after the hub's help pane: the product's name
  // and description (in the visitor's language), what this page must say
  // ([data-carino-about]), then the licence, contact, the GitHub project and
  // the legal page, and under them where to open an issue. A child of the
  // bar, not of the "⋯" menu.
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
  // The product's name: "Carino" and the app tag, unless the tag has it.
  var PRODUCT = /^carino\b/i.test(TAG) ? TAG : 'Carino' + (TAG ? ' ' + TAG : ' Systems');
  function about(nav) {
    var btn = nav.querySelector('#cnLegal');
    if (!btn) return;
    var svg = function (body) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>'; };
    var WAYS = [
      LICENCE && [LICENCE_HOME, svg(DOC), 'Licence', '', 'cnLicence'],
      ['https://www.linkedin.com/in/miguelcarino94/', svg('<path d="' + LI + '"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle>'), 'Contact', 'Write to me on LinkedIn.'],
      [GH_URL, svg('<path d="' + GH + '"></path>'), 'GitHub project', 'The source code and its history.'],
      [LEGAL_URL, svg('<path d="' + SHIELD + '"></path>'), 'Legal notice & privacy', 'Who runs this, what is stored, and cookies.']
    ].filter(Boolean);
    var ISSUES = 'https://github.com/MiguelCarino/' + (REPO || 'Carino-Systems') + '/issues';
    var pop = document.createElement('div');
    pop.className = 'cn-help';
    pop.id = 'cnAbout';
    pop.hidden = true;
    pop.innerHTML = '<div class="cn-help-card" role="dialog" aria-modal="true" aria-labelledby="cnHelpTitle">'
      + '<div class="cn-help-txt"><h2 id="cnHelpTitle"></h2><p id="cnHelpLine"></p></div>'
      + '<nav class="cn-ways">' + WAYS.map(function (w) {
        var ext = w[0] === LEGAL_URL ? '' : ' target="_blank" rel="noopener"';
        return '<a class="cn-way" href="' + w[0] + '"' + ext + (w[4] ? ' id="' + w[4] + '"' : '') + '>' + w[1]
          + '<span><b data-cn-t="' + w[2] + '"></b><small' + (w[3] ? ' data-cn-t="' + w[3] + '"' : '') + '></small></span></a>';
      }).join('') + '</nav>'
      + '<p class="cn-issues"><span data-cn-t="Found a problem or have an idea?"></span> '
      + '<a href="' + ISSUES + '" target="_blank" rel="noopener">' + svg('<path d="' + GH + '"></path>') + '<span data-cn-t="Open an issue on GitHub"></span></a></p>'
      + '<div class="cn-help-back"><button type="button" class="cn-pill">' + svg('<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>') + '<span data-cn-t="Close"></span></button></div>'
      + '</div>';
    var own = document.querySelector('[data-carino-about]');
    if (own) {
      own.hidden = false;
      own.classList.add('cn-ab-page');
      pop.querySelector('.cn-help-txt').appendChild(own);
    }
    nav.appendChild(pop);
    var back = pop.querySelector('.cn-pill');
    function open(on) {
      pop.hidden = !on;
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) {
        var menu = nav.querySelector('.cn-more-menu'); if (menu) menu.hidden = true;
        back.focus({ preventScroll: true });
      }
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(pop.hidden); });
    back.addEventListener('click', function () { open(false); btn.focus(); });
    // the scrim, not the card, closes it
    pop.addEventListener('click', function (e) { if (e.target === pop) open(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !pop.hidden) { open(false); btn.focus(); }
    });
  }

  // ---- fitting ----------------------------------------------------------
  // Stage 0: everything in the bar. Stage 1: the socials row folds into the
  // menu. Stage 2: the clock steps aside. Stage 3: the app's controls fold
  // too, except the kept ones. Stage 4: the kept ones fold as well, since
  // the brand comes first. Each stage is tried from 0 upward and the first
  // that fits wins.
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
    if (clock && clock.offsetParent !== null && clock.clientWidth + 1 < clock.scrollWidth) {
      // the clock may give up its greeting, but never the time itself
      var time = clock.querySelector('.clock-time'), tz = clock.querySelector('.clock-tz');
      var need = (time ? time.offsetWidth : 0) + (tz ? tz.offsetWidth : 0) + 26;
      if (clock.clientWidth < need) return true;
    }
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
      var socials = nav.querySelector('.social-row');
      var actions = nav.querySelector('.cn-actions:not(.cn-keep)');
      // An app that moved its controls out of the bar owns them now.
      var ownActions = actions && (actions.parentNode === right || actions.parentNode === menu);
      // Back to stage 0.
      Array.prototype.slice.call(keep.children).forEach(unpark);
      if (ownActions) unpark(actions);
      unpark(socials);
      nav.classList.remove('cn-noclock');
      more.hidden = true;
      if (!cramped(nav)) { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); return; }
      // Stage 1.
      more.hidden = false;
      park(socials, menu);
      if (!cramped(nav)) return;
      // Stage 2.
      nav.classList.add('cn-noclock');
      if (!cramped(nav) || !ownActions) return;
      // Stage 3: the whole controls block folds, the kept controls stay out.
      keptControls(actions).forEach(function (el) { park(el, keep); });
      menu.insertBefore(actions, menu.firstChild);
      var mark = document.createComment('cn-home');
      right.insertBefore(mark, keep);
      actions.__cnHome = mark;
      // Stage 4: the brand comes before even the kept controls: priority 2
      // folds first, then priority 1.
      ['2', '1'].forEach(function (rank) {
        if (!cramped(nav)) return;
        Array.prototype.slice.call(keep.children).forEach(function (el) {
          if (el.getAttribute('data-priority') === rank || rank === '1') unpark(el);
        });
      });
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
    // carino-lang.js, carino-diag.js and the app add to the bar after this
    // runs, and apps show or hide their own controls; refit on any of it.
    // Only the right cluster and the menu are watched (the clock ticks every
    // second on the left), and text changes are ignored: a live readout in
    // an app's controls would otherwise refit on every update.
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
      var menu = nav.querySelector('.cn-more-menu');
      return nav.contains(document.activeElement) || (menu && !menu.hidden) || nav.matches(':hover');
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
    if (TAG) { var t = nav.querySelector('.app-tag'); if (t) t.textContent = TAG; }
    // On the legal page itself the shield would only link back to this page.
    if (/\/legal(\.html)?$/.test(location.pathname)) {
      var legal = nav.querySelector('#cnLegal');
      if (legal) legal.remove();
    }
    about(nav);
    relabel();
    relocateActions(nav);
    watchFit(nav);
    immersive(nav);
    greet();
    setInterval(greet, 60000);
    loadClockModule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
