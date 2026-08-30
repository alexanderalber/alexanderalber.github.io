/* Service worker for walking-tour.html, and for nothing else.

   Why it lives here and not in /assets/js/: a service worker's scope cannot
   reach above its own directory unless the server sends Service-Worker-Allowed,
   which GitHub Pages does not. So the file has to sit in the directory it is
   meant to cover. It is registered with an explicitly NARROWER scope than that
   directory (the tool's own URL prefix), so it controls exactly one page and no
   other tool on this site can be affected by a bug in here.

   Two further safety rails, both deliberate:

   - The fetch handler answers only from an allowlist of prefixes AND only for
     things already in the cache. Everything else returns without calling
     respondWith, which leaves the browser's normal network path untouched.
   - Nothing is cached silently. The page has to send a 'cache' message, which
     the user triggers with a visible button. A visit does not quietly freeze a
     copy of the site.

   Bump CACHE when the tool or its data changes: activate deletes every other
   tour-* cache, so the old copy cannot survive on someone's phone.
*/

var CACHE = 'tour-v1';

var ALLOW = [
  '/miscellaneous/tools/walking-tour.html',
  '/miscellaneous/tools/tour-sw.js',
  '/assets/files/tours/',
  '/assets/js/react.production.min.js',
  '/assets/js/react-dom.production.min.js',
  '/assets/js/htm.js',
  '/assets/js/site-nav.js',
  '/assets/js/icons.js',
  '/assets/css/pico.min.css',
  '/assets/css/custom.css',
  '/assets/img/favicon.svg'
];

function allowed(url) {
  if (url.origin !== self.location.origin) return false;
  for (var i = 0; i < ALLOW.length; i++) {
    if (url.pathname.indexOf(ALLOW[i]) === 0) return true;
  }
  return false;
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return (k !== CACHE && k.indexOf('tour-') === 0) ? caches.delete(k) : null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (x) { return; }
  if (!allowed(url)) return;

  // Cache first, but only for things already stored. A miss falls through to
  // the network exactly as it would without a service worker, so an online
  // visit always sees the current file.
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(url.pathname).then(function (hit) {
        return hit || fetch(req);
      });
    })
  );
});

self.addEventListener('message', function (e) {
  var msg = e.data || {};
  var reply = function (payload) {
    if (e.source) e.source.postMessage(payload);
  };

  if (msg.type === 'cache') {
    var paths = (msg.paths || []).filter(function (p) {
      try { return allowed(new URL(p, self.location.origin)); } catch (x) { return false; }
    });
    e.waitUntil(
      caches.open(CACHE).then(function (c) {
        return Promise.all(paths.map(function (p) {
          // One request per path rather than c.addAll, because addAll rejects
          // the whole batch on a single 404 and then nothing is saved at all.
          return fetch(p, { cache: 'reload' })
            .then(function (r) { return r.ok ? c.put(p, r) : null; })
            .catch(function () { return null; });
        }));
      })
        .then(function () { return caches.open(CACHE); })
        .then(function (c) { return c.keys(); })
        .then(function (keys) { reply({ type: 'cached', count: keys.length }); })
        .catch(function (err) { reply({ type: 'error', message: String(err) }); })
    );
    return;
  }

  if (msg.type === 'clear') {
    e.waitUntil(
      caches.delete(CACHE)
        .then(function () { reply({ type: 'cached', count: 0 }); })
        .catch(function (err) { reply({ type: 'error', message: String(err) }); })
    );
    return;
  }

  if (msg.type === 'status') {
    e.waitUntil(
      caches.open(CACHE)
        .then(function (c) { return c.keys(); })
        .then(function (keys) { reply({ type: 'cached', count: keys.length }); })
        .catch(function () { reply({ type: 'cached', count: 0 }); })
    );
  }
});
