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
  var LANG_TROUGH = 130;     // ms from an element's start to its text swap;
                             // must match the 0% -> 40% leg of @keyframes lang-swap
  var langGen = 0, langTimers = [], langSweepEl = null;

  /* The sweeping edge. An element's delay depends on its y alone, so everything
     switching at the same moment lies on a horizontal line and the overlay is a
     plain top-to-bottom gradient whose bright band sits on that line. Letting x
     weigh in too would tilt the band, which the theme sweep does but which
     reads worse on running text: a line of prose would then change from one end
     to the other. */
  function langSweep() {
    var d = document.createElement('div');
    d.className = 'lang-sweep';
    document.body.appendChild(d);
    langSweepEl = d;
    var gone = function () { if (d.parentNode) d.parentNode.removeChild(d); if (langSweepEl === d) langSweepEl = null; };
    d.addEventListener('animationend', gone);
    setTimeout(gone, 1400);  // in case the animation never runs at all
  }

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
    if (langSweepEl && langSweepEl.parentNode) langSweepEl.parentNode.removeChild(langSweepEl);
    langSweepEl = null;
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
    langSweep();
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
    var relabel = function (v) {
      var back = document.getElementById('nav-misc');
      if (back) back.textContent = v === 'en' ? 'Miscellaneous' : 'Sonstiges';
      var pl = document.querySelector('footer a[href="/datenschutz.html"]');
      if (pl) pl.textContent = v === 'en' ? 'Privacy' : 'Datenschutz';
    };
    mark(l);
    segs.forEach(function (btn) {
      btn.onclick = function () {
        var lang = btn.getAttribute('data-lang');
        if (lang === el.lang) return;
        try { localStorage.setItem('lang', lang); } catch (e) {}
        var url = new URL(location.href);
        if (lang === def) url.searchParams.delete('lang'); else url.searchParams.set('lang', lang);
        if (window.__setLang) {
          history.replaceState(null, '', url.href);
          langFlush();
          var before = langSnapshot();
          el.lang = lang;
          mark(lang);
          relabel(lang);
          window.__setLang(lang);
          langFadeSoon(before);
        } else {
          location.replace(url.href);
        }
      };
    });
  })();
})();
