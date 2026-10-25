/* CyberCity — the fleet chrome around the city: the help overlay and the pause button.
 *
 * Not part of the bundle (build.js never sees it) and it never touches CC: it talks to main.js
 * through window events, so the city stays a closed IIFE that leaks nothing.
 *   cybercity:help    in   H or ? was pressed on the stage; toggle the overlay
 *   cybercity:paused  in   photo mode changed, detail {paused}
 *   cybercity:pause   out  set photo mode, detail {paused}
 *   cybercity:modal   out  the overlay opened or closed, detail {open}
 * Opening help pauses the city, and closing it resumes only a pause help itself made. */
(function () {
  'use strict';
  var scrim = document.getElementById('ccHelp');
  var helpBtn = document.getElementById('ccHelpBtn');
  var pauseBtn = document.getElementById('ccPause');
  var resumeBtn = document.getElementById('ccResume');
  var fullBtn = document.getElementById('ccFull');
  var closeX = document.getElementById('ccHelpX');
  if (!scrim) return;
  var paused = false, pausedByHelp = false, lastFocus = null;

  function tr(s) { return typeof window.t === 'function' ? window.t(s) : s; }
  function emit(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail: detail })); }

  function paint() {
    if (pauseBtn) {
      pauseBtn.textContent = paused ? tr('Resume') : tr('Pause');
      pauseBtn.setAttribute('aria-pressed', String(paused));
    }
    if (closeX) closeX.setAttribute('aria-label', tr('Close'));
  }

  function open() {
    if (!scrim.hidden) return;
    lastFocus = document.activeElement;
    scrim.hidden = false;
    emit('cybercity:modal', { open: true });
    if (!paused) { pausedByHelp = true; emit('cybercity:pause', { paused: true }); }
    if (resumeBtn) resumeBtn.focus();
  }

  function close(resume) {
    if (scrim.hidden) return;
    scrim.hidden = true;
    emit('cybercity:modal', { open: false });
    if (pausedByHelp || resume) emit('cybercity:pause', { paused: false });
    pausedByHelp = false;
    if (lastFocus && lastFocus.focus && lastFocus !== document.body) lastFocus.focus();
  }

  function toggleFullscreen() {
    var d = document, e = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
      return;
    }
    var fn = e.requestFullscreen || e.webkitRequestFullscreen;
    if (!fn) return;
    try { var p = fn.call(e); if (p && p.catch) p.catch(function () {}); } catch (err) {}
  }

  window.addEventListener('cybercity:help', function () { if (scrim.hidden) open(); else close(); });
  window.addEventListener('cybercity:paused', function (e) { paused = !!(e.detail && e.detail.paused); paint(); });

  if (helpBtn) helpBtn.addEventListener('click', open);
  if (pauseBtn) pauseBtn.addEventListener('click', function () {
    emit('cybercity:pause', { paused: !paused });
  });
  if (resumeBtn) resumeBtn.addEventListener('click', function () { close(true); });
  if (closeX) closeX.addEventListener('click', function () { close(); });
  if (fullBtn) fullBtn.addEventListener('click', function () { close(true); toggleFullscreen(); });
  scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });

  /* While the overlay is open main.js ignores the keyboard, so its keys are handled here, and
     stopped: the window listener would otherwise see H again once the overlay has closed. */
  document.addEventListener('keydown', function (e) {
    if (scrim.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    e.stopPropagation();
    var k = e.key;
    if (k === 'Escape' || k === '?' || k === 'h' || k === 'H') { e.preventDefault(); close(); }
    else if (k === 'p' || k === 'P') { e.preventDefault(); close(true); }
    else if (k === 'f' || k === 'F') { e.preventDefault(); close(true); toggleFullscreen(); }
  });

  window.addEventListener('carino:langchange', paint);
  document.addEventListener('DOMContentLoaded', paint);
  paint();
})();
