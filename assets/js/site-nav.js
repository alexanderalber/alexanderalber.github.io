/* Shared header controls for alber.me. Loaded right after the <header> on every
   page that has the breadcrumb nav; the FOUC-critical one-liners (initial theme,
   initial lang, nav-misc label) stay inline in each page. */
(function () {
  'use strict';
  var el = document.documentElement;

  /* Theme switcher. A click flips data-theme right away and sets .theme-morph,
     so the colours travel over half a second. Pages carrying data-theme-live
     stay put and get a `themechange` event on window (canvas/WebGL tools re-read
     the palette on it); pages without the flag reload once the morph has landed. */
  (function () {
    var cur = el.dataset.theme, def = el.dataset.themeDefault || 'dark';
    var live = el.hasAttribute('data-theme-live');
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var segs = document.querySelectorAll('.theme-seg');
    var mark = function (v) {
      segs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-theme-set') === v); });
    };
    mark(cur);
    segs.forEach(function (btn) {
      btn.onclick = function () {
        var v = btn.getAttribute('data-theme-set');
        if (v === cur) return;
        try { localStorage.setItem('theme', v); } catch (e) {}
        var url = new URL(location.href);
        if (v === def) url.searchParams.delete('theme'); else url.searchParams.set('theme', v);
        var apply = function () {
          el.dataset.theme = v;
          el.style.colorScheme = v;
          cur = v;
          mark(v);
        };
        if (live) {
          history.replaceState(null, '', url.href);
          if (!still && document.startViewTransition) {
            // GPU cross-fade of two page snapshots. The .theme-morph fallback
            // transitions every element instead, which janks on DOM-heavy
            // pages (Namenfinder); duration lives in custom.css.
            document.startViewTransition(function () {
              apply();
              window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: v } }));
            });
          } else {
            if (!still) el.classList.add('theme-morph');
            apply();
            window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: v } }));
            setTimeout(function () { el.classList.remove('theme-morph'); }, 600);
          }
        } else {
          if (!still) el.classList.add('theme-morph');
          apply();
          setTimeout(function () { location.replace(url.href); }, still ? 0 : 500);
        }
      };
    });
  })();

  /* Staggered swap for a live language switch. React updates the text nodes in
     place, so the elements survive the re-render and we can diff them: snapshot
     every leaf element's own text before the switch, compare afterwards, and
     touch only what actually changed.

     React swaps all of it in one commit, which is exactly what we do not want,
     so the new text is taken away again right after the diff and each element
     is put back to its old wording. Every element then gets its own timer, its
     delay taken from its position on screen: it fades out, its text is set at
     the trough of the fade, it fades back in. The new wording therefore washes
     down the page over roughly a second instead of appearing at once. The
     mutation is invisible to React: its own vdom already holds the new text,
     so it will not fight us for the nodes, and our timers converge on the same
     state a beat later.

     Nested matches are dropped (the outermost animated ancestor covers them),
     and a very large changed set is left to switch hard rather than animating
     thousands of nodes. */
  var LANG_FADE_MAX = 500;   // above this the stagger is skipped entirely
  var LANG_SPREAD = 420;     // ms between the first element and the last
  var LANG_TROUGH = 168;     // ms from an element's start to its text swap;
                             // must match the 0% -> 40% leg of @keyframes lang-swap
                             // (40% of its 0.42s), where the element is blank
  var langGen = 0, langTimers = [];

  function langLeaves() {
    var out = [], all = document.body.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) {
      var e = all[i], t = e.tagName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'CANVAS' || t === 'OPTION') continue;
      var nodes = [], vals = [], any = false;
      for (var n = e.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 3) continue;
        nodes.push(n); vals.push(n.nodeValue);
        if (!any && n.nodeValue.trim()) any = true;
      }
      if (any) out.push({ el: e, nodes: nodes, vals: vals, key: vals.join('\u0000') });
    }
    return out;
  }
  function langSnapshot() {
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return null;
    var leaves = langLeaves();
    if (leaves.length > 4000) return null;
    var m = new Map();
    leaves.forEach(function (p) { m.set(p.el, p); });
    return m;
  }
  /* A second click while the wave is still running: run every pending swap now,
     so nothing is left holding text from the language before last. */
  function langFlush() {
    langGen++;
    langTimers.forEach(function (t) { clearTimeout(t.id); t.done(); });
    langTimers = [];
    document.querySelectorAll('.lang-swap').forEach(function (e) {
      e.classList.remove('lang-swap');
      e.style.animationDelay = '';
    });
  }
  /* When the DOM is ready to diff depends on the tool: React usually commits a
     click-triggered setState in a microtask, but a tool that defers its own
     work needs one more beat. Retry until something changed, then stop. */
  function langFadeSoon(before) {
    if (!before) return;
    var tries = 0;
    var attempt = function () {
      if (langFade(before)) return;
      if (++tries === 1) requestAnimationFrame(attempt);
      else if (tries < 4) setTimeout(attempt, 40);
    };
    Promise.resolve().then(attempt);
  }
  function langFade(before) {
    if (!before) return false;
    var changed = langLeaves().filter(function (p) {
      var old = before.get(p.el);
      return old && old.key !== p.key && old.nodes.length === p.nodes.length;
    });
    if (!changed.length) return false;
    if (changed.length > LANG_FADE_MAX) return true;

    var set = new Set(changed.map(function (p) { return p.el; }));
    var top = changed.filter(function (p) {
      for (var a = p.el.parentElement; a; a = a.parentElement) { if (set.has(a)) return false; }
      return true;
    });

    /* Read all geometry before writing anything back, so this costs one layout
       rather than one per element. */
    var h = window.innerHeight || 800;
    var delays = top.map(function (p) {
      var r = p.el.getBoundingClientRect();
      return Math.round(Math.min(1, Math.max(0, r.top / h)) * LANG_SPREAD);
    });

    var gen = ++langGen;
    top.forEach(function (p, i) {
      var old = before.get(p.el);
      for (var k = 0; k < p.nodes.length; k++) p.nodes[k].nodeValue = old.vals[k];
      p.el.style.animationDelay = delays[i] + 'ms';
      p.el.classList.add('lang-swap');
      var done = function () {
        for (var k = 0; k < p.nodes.length; k++) p.nodes[k].nodeValue = p.vals[k];
      };
      langTimers.push({ id: setTimeout(function () {
        if (gen === langGen) done();
      }, delays[i] + LANG_TROUGH), done: done });
    });
    setTimeout(function () {
      if (gen !== langGen) return;
      langTimers = [];
      top.forEach(function (p) { p.el.classList.remove('lang-swap'); p.el.style.animationDelay = ''; });
    }, LANG_SPREAD + 500);
    return true;
  }

  /* The channel split, as a post effect on the finished page rather than on the
     text. A view transition hands us the old and the new page as two textures;
     the old one is put through an SVG filter that shifts its red channel one
     way and its green and blue the other, and the new one wipes down over it.
     Everything on the page comes apart, not just the glyphs: rules, cards,
     charts, images.

     The displacement is not applied to the whole snapshot but to a band, and
     the band travels with the wipe. A filter has no notion of where the wipe
     currently is, so the position has to live inside the filter: each one
     carries its own band, and the keyframes step through them. Splitting the
     entire page uniformly, which is what a single filter does, reads as three
     separate events instead of one wave: everything comes apart, the edge
     crosses, everything closes up.

     `filter` interpolates discretely between two url()s, so a step is all a
     keyframe can do anyway. Enough steps and a band soft enough to overlap
     between them, and it passes for a moving band. Driving one filter's
     parameters per frame would be truly continuous, but it would also re-filter
     a full-page texture sixty times a second, which is the one thing here that
     could actually stutter.

     Injected once, on first use, into a zero-sized inert svg. */
  var LANG_SPLIT_PX = 10;    // px of channel offset inside the band
  var LANG_BAND = 0.1;      // half height of the band, in viewport heights,
                             // before the blur widens it further
  var LANG_BLUR = 100;        // px of blur on the band's edges
  var LANG_STEPS = 20;       // positions the band is stepped through
  var LANG_TRAVEL = [-0.12, 1.12];  // where the band starts and ends, in the
                                    // same units as the wipe's mask-position

  /* The band is a flooded rectangle in its own subregion, blurred soft. The
     obvious way to draw it, feImage with a generated gradient, is the way not
     to: feImage fetches its image asynchronously, and until it arrives the
     filtered element does not render at all. With two dozen of them the whole
     transition sat there showing nothing and then snapped. feFlood needs
     nothing from outside and is there on the first frame.

     The blur's own subregion has to be stated. A primitive's default subregion
     is the union of its inputs', which for the blur is the band rectangle: the
     softness would be clipped away at exactly the edges it is meant to soften. */
  function langBandDefs(c, pad) {
    var top = c - LANG_BAND, bot = c + LANG_BAND;
    var y = Math.min(1, Math.max(0, top)), h = Math.min(1, Math.max(0, bot)) - y;
    if (h <= 0) return '<feFlood flood-opacity="0" result="band"/>';
    // The blur only needs the band plus the reach of the blur itself, not the
    // whole page. Everything outside is transparent and blurs to transparent,
    // and a gaussian costs its area: on a large screen this is most of the work
    // of the whole chain, and most of it would be spent on nothing.
    var by = Math.max(0, y - pad), bh = Math.min(1 - by, h + 2 * pad);
    return '<feFlood flood-color="#fff" flood-opacity="1" x="-5%" width="110%"' +
      ' y="' + (y * 100).toFixed(2) + '%" height="' + (h * 100).toFixed(2) + '%" result="raw"/>' +
      '<feGaussianBlur in="raw" stdDeviation="' + LANG_BLUR + '"' +
      ' x="-5%" width="110%" y="' + (by * 100).toFixed(2) + '%"' +
      ' height="' + (bh * 100).toFixed(2) + '%" result="band"/>';
  }

  function langFilters() {
    if (document.getElementById('lang-split-defs')) return;
    var i, svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'lang-split-defs';
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';

    /* How much of the chain a machine has to do is set here, not by the machine.
       Each step is one full-page evaluation of the filter per snapshot, so the
       work scales with steps times device pixels. A 3090 at 1440p does not care;
       an integrated chip on a dense laptop screen, or a browser that puts SVG
       reference filters on the CPU, very much does. So the step count is bought
       against the pixel count: full detail up to about 1440p, down to a floor of
       ten on a 5K screen, where each step costs seven times as much. Ten steps
       through a band this soft still overlap, they just march a little more
       visibly. */
    var dpr = window.devicePixelRatio || 1;
    var area = (window.innerWidth || 1200) * (window.innerHeight || 800) * dpr * dpr;
    var steps = Math.max(10, Math.min(LANG_STEPS, Math.round(LANG_STEPS * 4.2e6 / area)));
    var pad = Math.min(0.4, 3 * LANG_BLUR / (window.innerHeight || 800));

    var defs = '', d = LANG_SPLIT_PX;
    for (i = 0; i < steps; i++) {
      var c = LANG_TRAVEL[0] + (LANG_TRAVEL[1] - LANG_TRAVEL[0]) * (i + 0.5) / steps;
      // Two copies with disjoint channels, screened back together: where one
      // operand is 0 in a channel, screen returns the other unchanged, so this
      // recombines rather than brightens. sRGB, or the detour through linear
      // light would shift every colour on the page. Then the split is composited
      // into the band and the untouched page into everything else, so an empty
      // band leaves the page whole rather than blank.
      // The region is widened sideways to give the offset copies room, but not
      // vertically: the band's subregion is in percentages of this region, so
      // slack at the top and bottom would shift it away from the wipe's edge.
      defs += '<filter id="lang-wave-' + i + '" x="-5%" y="0%" width="110%" height="100%"' +
        ' color-interpolation-filters="sRGB">' +
        langBandDefs(c, pad) +
        '<feOffset in="SourceGraphic" dx="' + d + '" dy="0" result="a"/>' +
        '<feOffset in="SourceGraphic" dx="' + (-d) + '" dy="0" result="b"/>' +
        '<feColorMatrix in="a" type="matrix" result="ar" values="' +
          '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/>' +
        '<feColorMatrix in="b" type="matrix" result="bgb" values="' +
          '0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/>' +
        '<feBlend in="ar" in2="bgb" mode="screen" result="split"/>' +
        '<feComposite in="split" in2="band" operator="in" result="inband"/>' +
        '<feComposite in="SourceGraphic" in2="band" operator="out" result="whole"/>' +
        '<feMerge><feMergeNode in="whole"/><feMergeNode in="inband"/></feMerge>' +
        '</filter>';
    }
    svg.innerHTML = defs;
    document.body.appendChild(svg);

    /* The matching walk. One keyframe per band position, evenly spaced, so the
       band moves at the same steady rate as the wipe and stays with it. Kept
       next to the filters rather than in custom.css, where it would have to be
       rewritten by hand every time LANG_STEPS changes. */
    var kf = '';
    for (i = 0; i < steps; i++) {
      kf += (100 * i / steps).toFixed(2) + '%{filter:url(#lang-wave-' + i + ')}';
    }
    kf += '100%{filter:none}';   // the band has left the screen by then anyway,
                                 // but this way the run ends on an unfiltered
                                 // frame rather than on the last step's
    var st = document.createElement('style');
    st.textContent = '@keyframes lang-vt-wave{' + kf + '}';
    document.head.appendChild(st);
  }

  /* Language switcher, bilingual pages only (they carry data-lang-default on
     <html>). By default a click reloads with the new lang. A page that wants to
     switch live registers window.__setLang(lang) — the React app re-renders from
     it, and everything the app does not own (breadcrumb, footer) is relabelled
     here. See llm-detector for the reference implementation. */
  (function () {
    var def = el.dataset.langDefault;
    var segs = document.querySelectorAll('.lang-seg[data-lang]');
    if (!def || !segs.length) return;
    var urlLang = new URLSearchParams(location.search).get('lang');
    if (urlLang === 'en' || urlLang === 'de') { try { localStorage.setItem('lang', urlLang); } catch (e) {} }
    var l = urlLang;
    if (l !== 'en' && l !== 'de') { try { l = localStorage.getItem('lang') || def; } catch (e) { l = def; } }
    el.lang = l;
    var mark = function (v) {
      segs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-lang') === v); });
    };
    /* Everything outside the app that carries both wordings inline: the
       breadcrumb crumbs (site-wide "Miscellaneous"/"Sonstiges" plus the tool's
       category) and anything else a page tags with data-en/data-de. The crumb
       is relabelled at init too, not just on a click: this script is loaded
       synchronously right after </header>, so the crumbs are parsed and the
       swap lands before the first paint. Only the header exists at that point,
       which is the intended scope; page content brings its own strings. */
    var relabel = function (v) {
      document.querySelectorAll('[data-en][data-de]').forEach(function (e) {
        e.textContent = v === 'en' ? e.dataset.en : e.dataset.de;
      });
      var back = document.getElementById('nav-misc');
      // fallback for a page that has not been given the data attributes yet
      if (back && !back.dataset.en) back.textContent = v === 'en' ? 'Miscellaneous' : 'Sonstiges';
      var pl = document.querySelector('footer a[href="/datenschutz.html"]');
      if (pl) pl.textContent = v === 'en' ? 'Privacy' : 'Datenschutz';
    };
    mark(l);
    relabel(l);
    segs.forEach(function (btn) {
      btn.onclick = function () {
        var lang = btn.getAttribute('data-lang');
        if (lang === el.lang) return;
        try { localStorage.setItem('lang', lang); } catch (e) {}
        var url = new URL(location.href);
        if (lang === def) url.searchParams.delete('lang'); else url.searchParams.set('lang', lang);
        if (window.__setLang) {
          history.replaceState(null, '', url.href);
          var swap = function () {
            el.lang = lang;
            mark(lang);
            relabel(lang);
            window.__setLang(lang);
          };
          var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!still && document.startViewTransition) {
            langFilters();
            el.classList.add('lang-vt');   // scopes the transition CSS, so the
                                           // theme sweep's rules do not apply
            var vt = document.startViewTransition(function () {
              swap();
              // React commits the re-render off the click, not during it, and
              // the transition captures the new page as soon as this resolves.
              // A short timer is the one wait that is guaranteed to fire while
              // the transition holds the frame.
              return new Promise(function (res) { setTimeout(res, 30); });
            });
            var clear = function () { el.classList.remove('lang-vt'); };
            if (vt && vt.finished && vt.finished.then) vt.finished.then(clear, clear);
            else setTimeout(clear, 1200);
          } else if (still) {
            swap();
          } else {
            // No view transitions: the per-element wave does the same job by
            // hand, holding each element's old wording until its turn.
            langFlush();
            var before = langSnapshot();
            swap();
            langFadeSoon(before);
          }
        } else {
          location.replace(url.href);
        }
      };
    });
  })();
})();
