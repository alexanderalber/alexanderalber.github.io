/* spacenav.js -- 3Dconnexion SpaceNavigator over WebHID (Chromium only).
 *
 * Shared device layer for every tool that wants 3D-mouse input: pcb-designer
 * today, the 3D tools later. Two halves, deliberately separated:
 *
 *   - Pure functions (parseReport, shape, norm, panZoom): raw HID bytes to
 *     normalized axes to a 2D pan/zoom view update. No DOM, no navigator, so
 *     the Node tests in notes/dev/spacenav.test.mjs cover the whole mapping
 *     without a device.
 *   - The controller (create): WebHID plumbing. Permission prompt, silent
 *     reopen of an already-granted device on page load, unplug handling and
 *     one requestAnimationFrame loop that hands the caller normalized axes
 *     with a real dt. Framework-free; a React tool wraps it in a useEffect,
 *     a plain-canvas tool calls it directly.
 *
 * Report layout of the classic SpaceNavigator (VID 0x046D PID 0xC626), from
 * its HID descriptor: report 1 = translation, report 2 = rotation, each three
 * little-endian int16 axes at roughly +-350 full scale; report 3 = one button
 * byte. Newer firmware packs translation AND rotation into a single 12-byte
 * report 1, so that shape is accepted too. The device must run WITHOUT the
 * 3DxWare driver: when the driver is installed it claims the HID interface
 * and open() fails; that failure is surfaced through onStatus.
 *
 * Axis signs are a calibration knob (invertX/Y/Zoom in the options), to be
 * settled live with the device, not taken from a datasheet.
 */
var SpaceNav = (function () {
  'use strict';

  var DEFAULTS = {
    vendorId: 0x046d,
    productId: 0xc626,
    fullScale: 350,
    deadzone: 0.06,  /* fraction of full scale: the cap never rests at exactly zero */
    curve: 1.7,      /* response exponent, precision near the centre */
    panSpeed: 1.1,   /* visible board widths per second at full deflection */
    zoomSpeed: 1.5   /* zoom doublings per second at full deflection */
  };

  function opt(opts, key) {
    return opts && opts[key] != null ? opts[key] : DEFAULTS[key];
  }

  /* One HID input report to a partial axis update the controller merges into
     its current axis state. data is the report's DataView WITHOUT the id
     byte, exactly as WebHID hands it over. */
  function parseReport(reportId, data) {
    var n = data.byteLength;
    var rd = function (o) { return o + 2 <= n ? data.getInt16(o, true) : 0; };
    if (reportId === 1 && n >= 12) {
      return { tx: rd(0), ty: rd(2), tz: rd(4), rx: rd(6), ry: rd(8), rz: rd(10) };
    }
    if (reportId === 1) return { tx: rd(0), ty: rd(2), tz: rd(4) };
    if (reportId === 2) return { rx: rd(0), ry: rd(2), rz: rd(4) };
    if (reportId === 3) return { buttons: n >= 1 ? data.getUint8(0) : 0 };
    return null;
  }

  /* Deadzone plus response curve on one raw axis, -1..1 out. */
  function shape(v, opts) {
    var fs = opt(opts, 'fullScale');
    var dz = opt(opts, 'deadzone');
    var cu = opt(opts, 'curve');
    var x = Math.max(-1, Math.min(1, (v || 0) / (fs > 0 ? fs : DEFAULTS.fullScale)));
    var a = Math.abs(x);
    if (a <= dz) return 0;
    return (x < 0 ? -1 : 1) * Math.pow((a - dz) / (1 - dz), cu);
  }

  /* The shaped inputs a view mapping consumes, or null while the cap is at
     rest (callers then skip their state update entirely). x/y come from the
     lateral translation; z, the zoom axis, from pushing the cap down with
     the twist as an equivalent alternative. The two tilt axes have no
     meaning in a 2D view and stay unused; a 3D tool can read them from the
     raw axes the controller also passes along. */
  function norm(axes, opts) {
    var px = shape(axes.tx, opts);
    var py = shape(axes.ty, opts);
    var pz = Math.max(-1, Math.min(1, shape(axes.tz, opts) + shape(axes.rz, opts)));
    if (!px && !py && !pz) return null;
    return { x: px, y: py, z: pz };
  }

  /* Is the cap deflected on ANY of the six axes? norm() cannot answer this: it
     describes the 2D mapping and ignores the two tilt axes on purpose, so a cap
     that is only tilted looks to it exactly like a cap at rest. That made the
     promise above ("a 3D tool can read them from the raw axes") impossible to
     keep, because the controller gated onFrame on norm() alone and a pure tilt
     therefore delivered no frame to read anything from. This is the gate; the
     2D mapping is unchanged and still returns null for a tilt. */
  function awake(axes, opts) {
    if (!axes) return false;
    return !!(shape(axes.tx, opts) || shape(axes.ty, opts) || shape(axes.tz, opts)
      || shape(axes.rx, opts) || shape(axes.ry, opts) || shape(axes.rz, opts));
  }

  /* One animation frame of 3D-mouse motion applied to a shared 2D view state
     of the form { z, cx, cy } (z a factor on the fitted scale, cx/cy the
     content point at the canvas centre, as in pcb-designer). Pan speed scales
     with the visible extent (content width over z), so the cap moves the
     picture at the same apparent speed at every zoom; zoom is exponential and
     clamps to the caller's wheel limits. mirror flips x for mirrored views so
     "cap to the right" stays "view to the right". */
  function panZoom(view, n, dt, widthMm, mirror, opts) {
    var o = opts || {};
    var pan = opt(o, 'panSpeed');
    var zsp = opt(o, 'zoomSpeed');
    var zMin = o.zMin == null ? 0.5 : o.zMin;
    var zMax = o.zMax == null ? 20 : o.zMax;
    var ix = o.invertX ? -1 : 1;
    var iy = o.invertY ? -1 : 1;
    var iz = o.invertZoom ? -1 : 1;
    var z0 = view && view.z > 0 ? view.z : 1;
    var z = Math.min(zMax, Math.max(zMin, z0 * Math.pow(2, iz * n.z * zsp * dt)));
    var mmPerSec = pan * (widthMm > 0 ? widthMm : 70) / z;
    var s = mirror ? -1 : 1;
    return {
      z: z,
      cx: (view && isFinite(view.cx) ? view.cx : 0) + s * ix * n.x * mmPerSec * dt,
      cy: (view && isFinite(view.cy) ? view.cy : 0) + iy * n.y * mmPerSec * dt
    };
  }

  function supported() {
    return typeof navigator !== 'undefined' && !!navigator.hid;
  }

  /* The WebHID controller. handlers:
       onFrame(n, dt, axes)   each animation frame WHILE the cap is deflected on
                              ANY of the six axes; n is norm()'s output (all
                              zero for a pure tilt, which the 2D mapping does
                              not describe), axes the raw merged state (tx..rz)
                              for tools that want the tilt axes too.
       onButtons(bits, prev)  on every button report; bit 0 = left, 1 = right.
       onStatus(s)            s = { connected: productName|null, error: string|null }.
       opts                   shaping overrides passed to norm().
     Methods: init() (reopen a granted device, watch for unplug), connect()
     (permission prompt, needs a user gesture), disconnect(), destroy(),
     connected(). An idle connected mouse costs one rAF tick per frame and
     nothing else. */
  function create(handlers) {
    var h = handlers || {};
    var st = null;       /* { device, axes, buttons, raf, last } while attached */
    var disposed = false;

    function status(name, err) {
      if (h.onStatus) h.onStatus({ connected: name, error: err || null });
    }

    function step(ts) {
      if (!st) return;
      var dt = st.last ? Math.min(0.1, (ts - st.last) / 1000) : 0;
      st.last = ts;
      var n = norm(st.axes, h.opts);
      /* awake() and not n: see there. A consumer that only wants the flat axes
         now has to check n itself, because a pure tilt delivers a frame with
         all three of them at zero. */
      if (dt && h.onFrame && (n || awake(st.axes, h.opts))) {
        h.onFrame(n || { x: 0, y: 0, z: 0 }, dt, st.axes);
      }
      st.raf = requestAnimationFrame(step);
    }

    function onReport(e) {
      if (!st || e.target !== st.device) return;
      var upd = parseReport(e.reportId, e.data);
      if (!upd) return;
      if (upd.buttons != null) {
        var prev = st.buttons;
        st.buttons = upd.buttons;
        if (h.onButtons) h.onButtons(upd.buttons, prev);
        return;
      }
      for (var k in upd) st.axes[k] = upd[k];
    }

    function attach(device) {
      st = { device: device, axes: {}, buttons: 0, raf: 0, last: 0 };
      device.addEventListener('inputreport', onReport);
      st.raf = requestAnimationFrame(step);
      status(device.productName || 'SpaceNavigator', null);
    }

    function open(device) {
      var p = device.opened ? Promise.resolve() : device.open();
      return p.then(function () {
        if (!disposed && !st) attach(device);
        else if (!st) device.close();
      });
    }

    function matches(d) {
      return d.vendorId === opt(h.opts, 'vendorId') && d.productId === opt(h.opts, 'productId');
    }

    function connect() {
      if (!supported()) return Promise.resolve(false);
      if (st) return Promise.resolve(true);
      return navigator.hid.requestDevice({
        filters: [{ vendorId: opt(h.opts, 'vendorId'), productId: opt(h.opts, 'productId') }]
      }).then(function (devs) {
        var dev = devs && devs[0];
        if (!dev) return false;
        return open(dev).then(function () { return !!st; });
      }).catch(function (err) {
        status(null, String((err && err.message) || err));
        return false;
      });
    }

    function disconnect() {
      if (!st) return;
      var d = st.device;
      cancelAnimationFrame(st.raf);
      d.removeEventListener('inputreport', onReport);
      st = null;
      try { d.close(); } catch (e) { /* already gone */ }
      status(null, null);
    }

    function onHidDisconnect(e) {
      if (st && e.device === st.device) disconnect();
    }

    function init() {
      if (!supported()) return;
      navigator.hid.addEventListener('disconnect', onHidDisconnect);
      /* A device the user granted once reopens silently on the next load;
         failures here stay quiet (most commonly: 3DxWare holds the device). */
      navigator.hid.getDevices().then(function (devs) {
        var dev = (devs || []).filter(matches)[0];
        if (dev && !st && !disposed) open(dev).catch(function () {});
      }).catch(function () {});
    }

    function destroy() {
      disposed = true;
      if (supported()) navigator.hid.removeEventListener('disconnect', onHidDisconnect);
      disconnect();
    }

    return {
      supported: supported,
      init: init,
      connect: connect,
      disconnect: disconnect,
      destroy: destroy,
      connected: function () { return st ? (st.device.productName || 'SpaceNavigator') : null; }
    };
  }

  return {
    DEFAULTS: DEFAULTS,
    parseReport: parseReport,
    shape: shape,
    norm: norm,
    awake: awake,
    panZoom: panZoom,
    supported: supported,
    create: create
  };
})();
if (typeof globalThis !== 'undefined') globalThis.SpaceNav = SpaceNav;
