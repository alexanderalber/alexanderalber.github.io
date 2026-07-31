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
          el.lang = lang;
          mark(lang);
          relabel(lang);
          window.__setLang(lang);
        } else {
          location.replace(url.href);
        }
      };
    });
  })();
})();
