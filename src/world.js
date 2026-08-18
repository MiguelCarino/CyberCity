/* CyberCity worlds — which place you are standing in.
 *
 * WHY THIS FILE IS FOUR FIELDS AND NOT A THEME ENGINE. Everything downstream of here already owns
 * its own tuning, and most of that tuning is measured rather than tasted — city.js's district
 * weights were fitted against a 1.44 M-cell census, surfaces.js's exposure bands against the print
 * histogram, market.js's lit budget against the muddy band. Hoisting all of that into one central
 * "theme object" would move six files' hard-won numbers into a table nobody can measure against,
 * and the first world that wanted a different road would have to bring the whole street with it.
 *
 * So this module carries the ANSWER TO ONE QUESTION — which world is live — and every other file
 * keeps its own data for both of them, right next to the numbers it already has. city.js holds two
 * district tables, weather_state.js holds two preset tables, surfaces.js delegates to surf_west.js,
 * and an element that belongs to one world says so on itself with `world: 'west'`. The registry is
 * therefore the only thing that has to be correct here; a world is otherwise defined by grepping
 * for its id, which is exactly how a reader will look for it.
 *
 * THE SWITCH REBUILDS. Changing world changes the heightmap, so main.js tears the city down and
 * builds a new one on the SAME seed — #42 is a place in both worlds, and flipping between them is
 * how you see what the seed actually means. Nothing here does the rebuild: this file records the
 * choice and calls back, because main.js owns the city and the element list and this file owns
 * neither.
 */
(function (CC) {
  'use strict';

  /* Order is the key order: LIST[0] is '1'. The id is what every other file compares against and
   * it is a string rather than an index for exactly that reason — `CC.World.id === 'west'` at a
   * call site says what it means, `w === 1` does not.
   *
   * LIST[0] IS THE URL DEFAULT. main.js's fragment() omits the prefix for it, so `#42` addresses
   * whatever sits at index 0 — which means a new world must be APPENDED and never prepended, or
   * every link anyone has ever shared silently re-addresses itself to somewhere else.
   *
   * `name` IS PRINTED THROUGH A 3x5 BITMAP FONT that covers A-Z, 0-9, '-', '/' and '.' and nothing
   * else (see elements/hud.js). A name with a lowercase letter, an apostrophe or an ampersand in it
   * renders as blanks with no warning, so the alphabet is a hard constraint on this table rather
   * than a style note.
   *
   * `aliases` live on the row rather than in a switch inside resolve(), so adding a world is one
   * table edit and two worlds claiming the same short form is visible in one place. */
  var LIST = [
    { id: 'cyber', name: 'CYBERCITY', aliases: ['city', 'cybercity', 'c'] },
    { id: 'west',  name: 'FRONTIER',  aliases: ['western', 'frontier', 'w'] },
    { id: 'moon',  name: 'MOONWALK',  aliases: ['moonwalk', 'lunar', 'apollo', 'm'] }
  ];

  var cur = 0;

  function indexOf(id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return i;
    return -1;
  }

  /* Accepts an id, an index, or a 1-based key number, because three callers want three of those:
   * control.js has a digit, main.js has a fragment, and the harness has whatever was typed. */
  function resolve(v) {
    if (typeof v === 'number') {
      var i = v | 0;
      /* 1-based first: the keyboard is the only place a number comes from in the browser, and a
       * viewer pressing 1 means the first world, not the second. Index 0 is still reachable from
       * code, which is what the `=== 0` case is for. */
      if (i >= 1 && i <= LIST.length) return i - 1;
      if (i === 0) return 0;
      return -1;
    }
    if (typeof v === 'string') {
      var s = v.toLowerCase();
      var k = indexOf(s);
      if (k >= 0) return k;
      /* Aliases, scanned off the rows. The fragment is a URL a person types, and 'western' is what
       * they will type. An id always wins over an alias because the id scan above runs first. */
      for (var i = 0; i < LIST.length; i++) {
        var a = LIST[i].aliases;
        if (!a) continue;
        for (var j = 0; j < a.length; j++) if (a[j] === s) return i;
      }
      if (/^\d+$/.test(s)) return resolve(parseInt(s, 10));
    }
    return -1;
  }

  var World = {
    LIST: LIST,
    /* The id every other file compares against, and the default every fallback should use rather
     * than repeating the literal 'cyber' — which main.js, headless.cjs and the element gate each
     * did in their own copy before this existed. */
    DEFAULT: LIST[0].id,
    id: LIST[0].id,
    name: LIST[0].name,
    index: 0,
    /* A GETTER, not a snapshot. Two input paths gate on it — the digit keys and the gamepad's
     * cycle button — and a number captured at module load is the kind of thing that is correct
     * until the day the roster is built rather than declared. */
    get count() { return LIST.length; },

    /* Does this element belong in world `id`? The ONE definition, shared by main.js's rebuild gate,
     * tools/headless.cjs, and the photosensitivity gates — because those three had three copies of
     * it and an offline reference frame rendered from a different element set than the browser's is
     * a reference frame that is not the frame the browser draws.
     *
     * `world` may be absent (every world), a string (exactly one), or an array (a named set). The
     * array form is what three worlds made necessary: with two, "one world" and "all worlds" were
     * the only sets there were. */
    inWorld: function (el, id) {
      var w = el && el.world;
      if (!w) return true;
      if (typeof w === 'string') return w === id;
      for (var i = 0; i < w.length; i++) if (w[i] === id) return true;
      return false;
    },

    is: function (id) { return World.id === id; },

    at: function (v) { var i = resolve(v); return i < 0 ? null : LIST[i]; },

    /* Returns 1 if the world actually changed, so a caller can skip a rebuild it does not need —
     * pressing 1 while already in the city must not restart the walk. */
    set: function (v) {
      var i = resolve(v);
      if (i < 0 || i === cur) return 0;
      cur = i;
      World.id = LIST[i].id; World.name = LIST[i].name; World.index = i;
      return 1;
    },

    /* Set with no callback and no change test — for the boot path and the offline harness, both of
     * which choose a world BEFORE anything exists to rebuild. */
    force: function (v) {
      var i = resolve(v);
      if (i < 0) return 0;
      cur = i;
      World.id = LIST[i].id; World.name = LIST[i].name; World.index = i;
      return 1;
    },

    /* The ONE cycling rule, and it now has a caller: control.js's gamepad button used to open-code
     * `index + 2 > count ? 1 : index + 2`, which was forward-only and correct for exactly two
     * worlds. An unused API next to a hand-rolled duplicate of it is how the third world would have
     * arrived with a pad button that needed two presses to come home. */
    cycle: function (dir) {
      return World.set(LIST[(cur + (dir < 0 ? LIST.length - 1 : 1)) % LIST.length].id);
    }
  };

  /* Published on CC as well, because the element gate is read by files that have no reason to know
   * about a registry — the two photosensitivity tools among them. */
  CC.inWorld = World.inWorld;

  CC.World = World;
  if (typeof module !== 'undefined') module.exports = World;
})(typeof CC !== 'undefined' ? CC : require('./core.js'));
