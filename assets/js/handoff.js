/* Shared one-shot file handoff between tools via IndexedDB.
 *
 * A source tool stores a Blob under a well-known key, then opens the target
 * tool with a ?from= parameter; the target picks the file up on load. Used by
 * erosion-simulator -> heightmap-to-stl (key 'eroded-heightmap') today,
 * further image tools follow (e.g. key 'heightmap').
 *
 * Semantics: one slot per key (put overwrites), take reads AND deletes the
 * entry in a single readwrite transaction, so a handoff is consumed exactly
 * once. put(key, blob, name) rejects on IndexedDB errors; take(key) never
 * rejects, it resolves with a File or null. Plain script, no module system:
 * include with <script src="/assets/js/handoff.js"></script>. */
(function () {
  'use strict';

  var DB_NAME = 'alber-handoff';
  var STORE = 'files';

  function openDb(onsuccess, onerror) {
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
    req.onerror = function () { onerror(req.error); };
    req.onsuccess = function () { onsuccess(req.result); };
    return req;
  }

  window.AlberHandoff = {
    /* Stores {blob, name} under key. -> Promise<void>, rejects on error. */
    put: function (key, blob, name) {
      return new Promise(function (resolve, reject) {
        openDb(function (db) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put({ blob: blob, name: name }, key);
          tx.oncomplete = function () { db.close(); resolve(); };
          tx.onerror = function () { db.close(); reject(tx.error); };
        }, reject);
      });
    },

    /* Reads and deletes the entry under key in one readwrite transaction.
       -> Promise<File|null>, never rejects. */
    take: function (key) {
      return new Promise(function (resolve) {
        try {
          openDb(function (db) {
            var tx = db.transaction(STORE, 'readwrite');
            var store = tx.objectStore(STORE);
            var get = store.get(key);
            get.onsuccess = function () { store.delete(key); };
            tx.oncomplete = function () {
              db.close();
              var e = get.result;
              resolve(e && e.blob
                ? new File([e.blob], e.name || 'handoff', { type: e.blob.type || 'image/png' })
                : null);
            };
            tx.onerror = function () { db.close(); resolve(null); };
          }, function () { resolve(null); });
        } catch (err) {
          resolve(null);
        }
      });
    }
  };
})();
