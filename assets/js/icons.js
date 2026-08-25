/* icons.js -- the shared icon set for the alber.me tool buttons.
 *
 * ToolIcons.el(name, props)  -> a React element (needs React on the page)
 * ToolIcons.html(name, size) -> the same icon as an HTML string
 * ToolIcons.names()          -> the available names
 *
 * WHY INLINE SVG AND NOT EMOJI
 * An emoji is a bitmap the operating system supplies: a different picture on
 * Windows, macOS, Android and Linux, in a fixed colour, at a fixed weight. It
 * ignores hover, it ignores the disabled state, and in the grey skin -- which is
 * deliberately colourless, with outline carrying the whole hierarchy -- it is
 * the only saturated object on the screen. These icons are stroked in
 * `currentColor`, so they simply are whatever colour the button's text is, in
 * every skin and every state, for free.
 *
 * WHY A SHARED FILE
 * Same reason as canvas-text.js and marching-cubes.js: the alternative is the
 * same path data pasted into thirty HTML files, which is how the site ended up
 * with nine copies of one button. Everything is hosted here, so a page load
 * still makes no third-party request.
 *
 * THE CONVENTION
 * An icon goes on a button that performs an ACTION on something: download,
 * upload, copy, run, reset, remove, open elsewhere. Choices, filters, tabs and
 * next/previous stay bare. A row where every button has a picture is a wall of
 * pictograms and the icon stops carrying any signal at all.
 *
 * Geometry: a 24x24 viewBox, no fill, stroke-width 2, round caps and joins, so
 * the set reads as one family and matches the stroke weight of the tool UI.
 * Rendered at 14px inside .tool-btn, which supplies the gap.
 *
 * Plain script, no imports, nothing touched at module scope: it must run in the
 * page and under Node, where the test suite checks the path data.
 */
(function (root) {
  'use strict';

  /* Each entry is the inner markup of the <svg>, nothing else. Keeping the
     wrapper out of the table is what lets el() and html() share one source. */
  var PATHS = {
    /* arrow into a tray: the near-universal download glyph */
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    /* the same tray with the arrow reversed */
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 9l5-5 5 5"/><path d="M12 4v12"/>',
    /* two offset sheets */
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    /* a circular arrow, open at the top left where the arrowhead sits */
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    /* Removal is an X, not a waste bin: one symbol for getting rid of a thing,
       used at every scale from a chip's corner to "reset everything". A bin
       alongside an X would be two glyphs for one idea. */
    remove: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
    play: '<path d="M6 4l13 8-13 8z"/>',
    pause: '<path d="M8 4v16"/><path d="M16 4v16"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    /* box with an arrow leaving it: opens something outside this page */
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    /* a magnifier, for "search" / "inspect" triggers */
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    /* sliders, for "advanced" or "settings" triggers */
    tune: '<path d="M4 6h10"/><path d="M18 6h2"/><path d="M4 12h4"/><path d="M12 12h8"/><path d="M4 18h10"/><path d="M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>'
  };

  /* The attributes every icon shares. Spelled once, in both output forms. */
  var BASE = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };

  function names() { return Object.keys(PATHS); }

  function has(name) { return Object.prototype.hasOwnProperty.call(PATHS, name); }

  /* React element. dangerouslySetInnerHTML is the honest choice here: the path
     data is a literal in this file, never anything a user typed, and writing
     each <path> as createElement would triple the size of the table for no
     gain. props are merged last so a caller can override the size or add a
     className. */
  function el(name, props) {
    if (!has(name)) throw new Error('ToolIcons: unknown icon "' + name + '"');
    var R = root.React;
    if (!R) throw new Error('ToolIcons.el needs React on the page');
    var p = {
      width: 14,
      height: 14,
      viewBox: BASE.viewBox,
      fill: BASE.fill,
      stroke: BASE.stroke,
      strokeWidth: BASE.strokeWidth,
      strokeLinecap: BASE.strokeLinecap,
      strokeLinejoin: BASE.strokeLinejoin,
      'aria-hidden': 'true',
      focusable: 'false'
    };
    if (props) { for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) p[k] = props[k]; }
    p.dangerouslySetInnerHTML = { __html: PATHS[name] };
    return R.createElement('svg', p);
  }

  /* HTML string, for the prerendered SEO block inside #root and for the few
     places that build markup without React. */
  function htmlOf(name, size) {
    if (!has(name)) throw new Error('ToolIcons: unknown icon "' + name + '"');
    var s = size || 14;
    return '<svg width="' + s + '" height="' + s + '" viewBox="' + BASE.viewBox +
      '" fill="' + BASE.fill + '" stroke="' + BASE.stroke +
      '" stroke-width="' + BASE.strokeWidth +
      '" stroke-linecap="' + BASE.strokeLinecap +
      '" stroke-linejoin="' + BASE.strokeLinejoin +
      '" aria-hidden="true" focusable="false">' + PATHS[name] + '</svg>';
  }

  root.ToolIcons = { el: el, html: htmlOf, names: names, has: has, PATHS: PATHS, BASE: BASE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
