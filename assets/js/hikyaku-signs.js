/* hikyaku-signs.js -- the neon sign text atlas for Hikyaku.
 *
 * The city's signs show real Japanese words from a prerendered atlas
 * (assets/files/hikyaku-signs.png + .json, made by
 * notes/dev/make-sign-atlas.mjs). The atlas carries no hue:
 *
 *   R  intensity, glow included      G  saturation (0 white tube core, 1 hue)
 *   B  mix of first / second colour  A  coverage (panel 1, glass ~0.6, glow 0)
 *
 * The hue comes per sign from a small global palette (default the two
 * accents of the page, cyan and magenta; paletteN up to 8 makes the egg
 * louder). Blending is premultiplied: out = emit + dst * (1 - A), so the
 * glow adds and the panels cover.
 *
 * Two layers, like the other Hikyaku modules:
 *
 *   - Pure layer, no three.js, no DOM: pick() chooses an entry for a sign
 *     rect, fit() sizes it, instance() computes the per-instance data,
 *     mixTexel() is the shader's colour formula in JS (for tests and
 *     previews).
 *   - Visual layer: loadAtlas(THREE) fetches the two files, create(THREE,
 *     atlas, opts) builds ONE instanced mesh for all signs; set(list) fills
 *     it. THREE is a parameter, never an import. Fog through fog.inject
 *     (hikyaku-city.js makeFog) when given.
 *
 * UV convention: the JSON rects are top-left origin and the texture is
 * uploaded with flipY = false, so v grows downwards in the atlas.
 *
 * Everything hangs on globalThis.HikyakuSigns.
 */
(function () {
  'use strict';

  /* cyan and magenta are the page's accents (hikyaku-city.js accentColors);
     the rest only appear when paletteN is raised */
  var PALETTE = [0x2ee8ff, 0xff3fa4, 0xffb02e, 0x5dff8a, 0x9b6bff, 0xfff15a, 0x3d8bff, 0xff5a3d];
  var MAX_PAL = 8;
  /* anim codes: 0 steady, 1 flicker, 2 failing (mostly dark, sputters) */
  var ANIM = { steady: 0, flicker: 1, failing: 2 };
  var ANIM_P = { flicker: 0.12, failing: 0.04 };

  function hexRGB(x) { return [((x >> 16) & 255) / 255, ((x >> 8) & 255) / 255, (x & 255) / 255]; }
  function palette(n, list) {
    var src = list || PALETTE;
    n = Math.max(1, Math.min(MAX_PAL, Math.round(n == null ? 2 : n), src.length));
    return src.slice(0, n);
  }
  /* a sign's colour value u in [0,1) -> palette indices, shared by the
     shader so the city can colour a sign's glow billboard to match */
  function colourIndex(u, n) {
    n = Math.max(1, n | 0);
    var i = Math.min(n - 1, Math.floor(u * n));
    return [i, (i + 1) % n];
  }
  /* the u that selects palette index i of n (city: hue 0/1 -> u) */
  function colourU(i, n) { return (i + 0.5) / Math.max(1, n); }

  function hash(a, b) {
    var h = Math.imul((a * 2654435761) ^ (b * 40503 + 0x9e3779b9), 0x85ebca6b) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function seedInt(seed) { return seed < 1 && seed >= 0 ? Math.floor(seed * 4294967296) : (seed | 0); }

  /* Shader colour formula in JS. t = [r, g, b, a] in 0..1, c1/c2 colours
     (sRGB numbers 0..1), o.gain, o.sat, o.live. Returns the premultiplied
     emit [r, g, b] and the coverage a. */
  function mixTexel(t, c1, c2, o) {
    o = o || {};
    var gain = o.gain == null ? 1.6 : o.gain, sat = o.sat == null ? 1 : o.sat, live = o.live == null ? 1 : o.live;
    var I = t[0], S = t[1] * sat, B = t[2], k = I * I * gain * live, out = [0, 0, 0];
    for (var q = 0; q < 3; q++) {
      var hc = c1[q] * (1 - B) + c2[q] * B;
      out[q] = (1 + (hc - 1) * S) * k;
    }
    return { rgb: out, a: t[3] };
  }

  /* entries of one orientation ('v' tall, 'h' wide) */
  function entriesOf(meta, orient) {
    return meta.entries.filter(function (e) { return !orient || e.orient === orient; });
  }
  /* Pick an entry for a sign rect of w x h metres. Orientation follows the
     rect (tall -> 'v'); entries whose aspect is near w/h are preferred (a
     log-normal weight of width o.spread, default 0.6), so short words go on
     squat signs and long words on long blades, but every word still turns
     up. The home entry (飛脚) gets o.homeWeight (default 1, i.e. no bonus).
     Deterministic in seed (integer, or a float in [0,1) as the city's
     accents carry). */
  function pick(meta, w, h, seed, o) {
    o = o || {};
    var orient = o.orient || (h >= w ? 'v' : 'h');
    var list = entriesOf(meta, orient), want = Math.log(w / h), sp = o.spread == null ? 0.6 : o.spread;
    var hw = o.homeWeight == null ? 1 : o.homeWeight, tot = 0, ws = [];
    for (var i = 0; i < list.length; i++) {
      var d = Math.log(list[i].aspect) - want;
      var wt = Math.exp(-d * d / (2 * sp * sp)) * (list[i].term === meta.home ? hw : 1);
      ws.push(wt); tot += wt;
    }
    var r = hash(seedInt(seed), 17) * tot;
    for (i = 0; i < list.length; i++) { r -= ws[i]; if (r < 0) return list[i]; }
    return list[list.length - 1];
  }
  /* Largest body of the entry's aspect inside w x h metres. Returns the
     body size (bw, bh), the full quad incl. glow margin (qw, qh) and the
     scale k in metres per atlas pixel. The body is centred in the cell, so
     the quad shares the sign's centre. */
  function fit(entry, w, h) {
    var bw = entry.body[2], bh = entry.body[3];
    var k = Math.min(w / bw, h / bh);
    return { bw: bw * k, bh: bh * k, qw: entry.px[2] * k, qh: entry.px[3] * k, k: k };
  }
  /* Animation by seed: mostly steady, some flicker, a few failing. */
  function animOf(seed) {
    var r = hash(seedInt(seed), 29);
    return r < ANIM_P.failing ? ANIM.failing : r < ANIM_P.failing + ANIM_P.flicker ? ANIM.flicker : ANIM.steady;
  }

  /* Per-instance data for one sign.
     s = { p: [x,y,z] centre, n: [x,y,z] facing (horizontal unit vector, the
     side the text reads correctly from; the back face mirrors back so it
     reads from there too), w, h (metres, the rect the sign may fill),
     seed, entry? (else pick), u? (colour value, else from seed), hue?
     (palette index, overrides u), anim? }
     o = { paletteN (for hue -> u), pick options }.
     Returns { entry, pos, right, up, uv, sign: [u, seed01, anim, 0], fit }
     with right/up the HALF extents of the quad as vectors. */
  function instance(meta, s, o) {
    o = o || {};
    var e = s.entry || pick(meta, s.w, s.h, s.seed, o);
    var f = fit(e, s.w, s.h), n = s.n;
    var ln = Math.hypot(n[0], n[2]) || 1, nx = n[0] / ln, nz = n[2] / ln;
    /* right = up x n, the same as the city's quads */
    var right = [nz * f.qw / 2, 0, -nx * f.qw / 2], up = [0, f.qh / 2, 0];
    var nPal = o.paletteN == null ? 2 : o.paletteN;
    var u = s.hue != null ? colourU(s.hue, nPal) : s.u != null ? s.u : hash(seedInt(s.seed), 41);
    var anim = s.anim != null ? s.anim : animOf(s.seed);
    return { entry: e, pos: s.p.slice(), right: right, up: up, uv: e.uv.slice(),
      sign: [u, hash(seedInt(s.seed), 53), anim, 0], fit: f };
  }

  /* ------------------------------------------------------------ visual */
  function makeTexture(THREE, img) {
    var tex = new THREE.Texture(img);
    tex.flipY = false; tex.premultiplyAlpha = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true; tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }
  /* Fetch JSON and PNG. createImageBitmap with premultiplyAlpha 'none' is
     what keeps the glow: its texels have A = 0 and a premultiplying decoder
     would zero their RGB. Fallback: an <img>, which WebGL uploads
     unpremultiplied as well (UNPACK_PREMULTIPLY_ALPHA false). */
  function loadAtlas(THREE, o) {
    o = o || {};
    var base = o.base || '/assets/files/hikyaku-signs';
    return Promise.all([
      fetch(base + '.json').then(function (r) { return r.json(); }),
      fetch(base + '.png').then(function (r) { return r.blob(); })
    ]).then(function (res) {
      var meta = res[0], blob = res[1];
      var img = typeof createImageBitmap === 'function'
        ? createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
        : new Promise(function (ok, bad) {
          var im = new Image(); im.onload = function () { ok(im); }; im.onerror = bad; im.src = URL.createObjectURL(blob);
        });
      return img.then(function (im) { return { meta: meta, texture: makeTexture(THREE, im) }; });
    });
  }

  var VS = [
    'attribute vec3 iPos; attribute vec3 iRight; attribute vec3 iUp; attribute vec4 iUv; attribute vec4 iSign;',
    'uniform float uTime; uniform float uAnim; uniform float uFogK;',
    '/*CG_FOG*/',
    'varying vec2 vUv; flat varying vec2 vU; flat varying float vCol; varying float vLive; varying float vFog; varying vec3 vFogC;',
    'float h11(float x){ return fract(sin(x * 127.1 + 3.7) * 43758.5453); }',
    'void main(){',
    /* PlaneGeometry(1,1): position in [-0.5,0.5], uv (0,0) bottom left;
       atlas v0 is the top edge */
    '  vUv = vec2(mix(iUv.x, iUv.z, uv.x), mix(iUv.w, iUv.y, uv.y));',
    '  vU = iUv.xz; vCol = iSign.x;',
    '  float s = iSign.y * 1000.0, a = iSign.z * uAnim, g = 1.0;',
    '  if (a > 0.5 && a < 1.5) {',
    '    float burst = step(0.7, h11(floor(uTime * 0.8 + s)));',
    '    float off = step(0.45, h11(floor(uTime * 14.0) + s * 1.3));',
    '    g = (1.0 - burst * off * 0.88) * (0.95 + 0.05 * sin(uTime * 110.0 + s));',
    '  } else if (a > 1.5) {',
    '    float on = step(0.82, h11(floor(uTime * 0.5 + s))) * step(0.5, h11(floor(uTime * 11.0) + s));',
    '    g = 0.12 + 0.88 * on;',
    '  }',
    '  vLive = g;',
    '  vec3 w = iPos + iRight * (position.x * 2.0) + iUp * (position.y * 2.0);',
    '  vec4 wp = modelMatrix * vec4(w, 1.0);',
    '#ifdef HKS_FOG',
    '  vFog = cgFogAmt(wp.xyz, uFogK); vFogC = cgFogColor(wp.xyz);',
    '#else',
    '  vFog = 0.0; vFogC = vec3(0.0);',
    '#endif',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'].join('\n');
  var FS = [
    'uniform sampler2D uMap; uniform vec3 uPal[' + MAX_PAL + ']; uniform float uPalN; uniform float uGain; uniform float uSat;',
    'varying vec2 vUv; flat varying vec2 vU; flat varying float vCol; varying float vLive; varying float vFog; varying vec3 vFogC;',
    'void main(){',
    '  vec2 uv = vUv;',
    '  if (!gl_FrontFacing) uv.x = vU.x + vU.y - uv.x;',
    '  vec4 t = texture2D(uMap, uv);',
    '  int n = int(max(uPalN, 1.0));',
    '  int i1 = min(n - 1, int(floor(vCol * float(n))));',
    '  int i2 = i1 + 1; if (i2 >= n) i2 = 0;',
    '  vec3 hc = mix(uPal[i1], uPal[i2], t.b);',
    '  vec3 col = mix(vec3(1.0), hc, t.g * uSat) * t.r * t.r * uGain * vLive;',
    '  col = mix(col, vFogC * t.a, vFog);',
    '  gl_FragColor = vec4(col, t.a);',
    '}'].join('\n');

  /* create(THREE, atlas, opts) -> { mesh, material, set(list), setPalette(hexes, n),
     count, dispose }. atlas = { meta, texture } from loadAtlas. opts: fog (the
     city's makeFog object; default HikyakuCity.makeFog if present), palette
     (hex list), paletteN (default 2), gain (1.6), sat (1), fogK (0.55),
     max (instance capacity, default 2048, grows on demand). */
  function create(THREE, atlas, opts) {
    var o = opts || {};
    var fog = o.fog === undefined ? (globalThis.HikyakuCity && globalThis.HikyakuCity.makeFog ? globalThis.HikyakuCity.makeFog(THREE) : null) : o.fog;
    var pal = [];
    for (var i = 0; i < MAX_PAL; i++) pal.push(new THREE.Vector3());
    var uniforms = {
      uMap: { value: atlas.texture }, uTime: { value: 0 }, uAnim: { value: 1 },
      uPal: { value: pal }, uPalN: { value: 2 }, uGain: { value: o.gain == null ? 1.6 : o.gain },
      uSat: { value: o.sat == null ? 1 : o.sat }, uFogK: { value: o.fogK == null ? 0.55 : o.fogK }
    };
    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: VS, fragmentShader: FS,
      defines: fog ? { HKS_FOG: 1 } : {},
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      /* flat signs hang 0.3 m off the facade, like the old sign layer */
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    if (fog) fog.inject(mat);
    else mat.vertexShader = mat.vertexShader.replace('/*CG_FOG*/', '');

    var quad = new THREE.PlaneGeometry(1, 1);
    var cap = 0, geo = null, A = null;
    var mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.name = 'hikyaku-signs'; mesh.frustumCulled = false; mesh.renderOrder = 2;
    function alloc(n) {
      if (geo) geo.dispose();
      cap = n;
      geo = new THREE.InstancedBufferGeometry();
      geo.index = quad.index;
      geo.setAttribute('position', quad.getAttribute('position'));
      geo.setAttribute('uv', quad.getAttribute('uv'));
      A = {};
      [['iPos', 3], ['iRight', 3], ['iUp', 3], ['iUv', 4], ['iSign', 4]].forEach(function (d) {
        var at = new THREE.InstancedBufferAttribute(new Float32Array(n * d[1]), d[1]);
        at.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute(d[0], at); A[d[0]] = at;
      });
      geo.instanceCount = 0;
      mesh.geometry = geo;
    }
    alloc(o.max || 2048);

    function setPalette(hexes, n) {
      var src = hexes || o.palette || PALETTE;
      for (var k = 0; k < MAX_PAL; k++) {
        var c = hexRGB(src[Math.min(k, src.length - 1)]);
        pal[k].set(c[0], c[1], c[2]);
      }
      uniforms.uPalN.value = Math.max(1, Math.min(MAX_PAL, src.length, n == null ? (o.paletteN || 2) : n));
    }
    setPalette();

    /* list: instance() results */
    function set(list) {
      if (list.length > cap) alloc(Math.max(list.length, cap * 2));
      for (var k = 0; k < list.length; k++) {
        var q = list[k];
        A.iPos.setXYZ(k, q.pos[0], q.pos[1], q.pos[2]);
        A.iRight.setXYZ(k, q.right[0], q.right[1], q.right[2]);
        A.iUp.setXYZ(k, q.up[0], q.up[1], q.up[2]);
        A.iUv.setXYZW(k, q.uv[0], q.uv[1], q.uv[2], q.uv[3]);
        A.iSign.setXYZW(k, q.sign[0], q.sign[1], q.sign[2], q.sign[3]);
      }
      for (var key in A) A[key].needsUpdate = true;
      geo.instanceCount = list.length;
      api.count = list.length;
    }
    function dispose() {
      if (mesh.parent) mesh.parent.remove(mesh);
      geo.dispose(); quad.dispose(); mat.dispose();
    }
    var api = { mesh: mesh, material: mat, uniforms: uniforms, set: set, setPalette: setPalette, dispose: dispose, count: 0,
      capacity: function () { return cap; } };
    return api;
  }

  globalThis.HikyakuSigns = {
    PALETTE: PALETTE, MAX_PAL: MAX_PAL, ANIM: ANIM, ANIM_P: ANIM_P, VS: VS, FS: FS,
    hexRGB: hexRGB, palette: palette, colourIndex: colourIndex, colourU: colourU, mixTexel: mixTexel,
    entriesOf: entriesOf, pick: pick, fit: fit, animOf: animOf, instance: instance,
    makeTexture: makeTexture, loadAtlas: loadAtlas, create: create
  };
})();
