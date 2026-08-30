/* dust.js -- the drifting motes that make speed visible.
 *
 * Lifted out of the app block of spaceship-6dof.html on 2026-08-30, when
 * asteroid-corridor needed the same field and CLAUDE.md rules out the copy.
 * The reasoning below came along unchanged; the one thing that grew is the
 * room test, which used to be a single half-size for a cube and is now three
 * half-extents, because a corridor is not a cube.
 *
 * It exists because speed is not visible in an empty room. Optic flow, the
 * angular rate at which texture crosses the eye, is v divided by the distance
 * to whatever is being looked at, so a wall a kilometre away moves forty times
 * more slowly than a mote twenty five metres away at the very same speed.
 * Adding close-up clutter does not decorate the problem, it supplies the only
 * channel that carries the quantity at all.
 *
 * The module takes THREE as an argument rather than importing it, so that it
 * stays a plain script with no imports and the pure half (the lattice fold and
 * the shader sources) can be evaluated under Node, where
 * notes/dev/dust.test.mjs reads the file as a string. Everything hangs on
 * globalThis.Dust.
 */
(function () {
  'use strict';

  var DEFAULTS = {
    count: 6000,
    far: 350,          /* range in metres: the fade distance AND half the cell */
    sizeNear: 5, sizeFar: 2.5,
    opNear: 1, opFar: 0.3,
    edge: 0.25,
    color: [0.44, 0.52, 0.64],
    seed: 0x5eed
  };

  /* Points, not streaks. A streak along the velocity is honest motion blur and
     it looked like an arcade warp effect, which is worse than the problem it
     solved; it also lies as soon as the ship is rotating, because then the
     apparent motion of a mote is not along v at all.

     Size and opacity both ramp with distance from the camera, which is why
     this is a shader and not a PointsMaterial: there the size is a uniform,
     one number for the whole field, and the ramp is per point. Everything is
     computed in the vertex shader from the position the CPU already wrote, so
     the per-frame cost stays what it was, one fold per mote.

     Nothing is left for a colour attribute to do. The room test is a
     comparison against three numbers, the distance ramp is the ramp, and both
     are cheaper in the shader than in a Float32Array. */
  var VS = [
    'uniform float uFar, uSizeNear, uSizeFar, uOpNear, uOpFar, uEdge, uPix;',
    'uniform vec3 uHalf;',
    'varying float vAlpha;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  float t = clamp(length(mv.xyz) / uFar, 0.0, 1.0);',
    '  gl_PointSize = mix(uSizeNear, uSizeFar, t) * uPix;',
    /* The straight line from the eye to the range is what the two opacity
       sliders say, and it is kept. On top of it sits a smoothstep window that
       takes the last uEdge of the range down to nothing, because that is where
       the lattice folds and a mote that is still visible there reappears on
       the other side in one frame.

       A window, not a bend in the ramp itself: the interesting part of the
       curve is the near end, where the eye reads speed off the motes going
       past, and a curve that changed there to buy a smooth far edge would be
       paying in the wrong currency. smoothstep and not a linear taper because
       its derivative is zero at BOTH ends, so neither the start of the fade
       nor the vanishing point is a visible crease. */
    '  float e = max(uEdge, 1e-4);',
    '  float fade = 1.0 - smoothstep(1.0 - e, 1.0, t);',
    /* The motes are meant to be drifting inside the room, not hanging beyond
       it, and the lattice does not know where the walls are. */
    '  float inside = step(abs(position.x), uHalf.x) * step(abs(position.y), uHalf.y)',
    '    * step(abs(position.z), uHalf.z);',
    '  vAlpha = mix(uOpNear, uOpFar, t) * fade * inside;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  /* Round, because a mote at six pixels is visibly a square otherwise. The cut
     is hard rather than feathered: at one or two pixels a feathered edge is
     the entire point and would just dim it. */
  var FS = [
    'precision mediump float;',
    'uniform vec3 uColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec2 c = gl_PointCoord - 0.5;',
    '  if (vAlpha <= 0.0 || dot(c, c) > 0.25) discard;',
    '  gl_FragColor = vec4(uColor, vAlpha);',
    '}'
  ].join('\n');

  /* Where a point of a repeating lattice sits relative to a centre, folded
     into the one cell that surrounds that centre. This is what keeps motes
     near the eye wherever the eye happens to be, instead of scattering a fixed
     set through a two kilometre box and leaving the pilot in an empty patch of
     it.

     Identical to SixDOF.wrapRel, and repeated here rather than depended on:
     dust.js has no business requiring the flight dynamics to be loaded, and
     one line of modulo arithmetic is not shared code worth a dependency. The
     sixdof test asserts the same thing on its own copy. */
  function wrapRel(b, c, S) {
    var d = b - c;
    return d - S * Math.floor(d / S + 0.5);
  }

  /* The per-frame job: fold every mote of the unit lattice into the cell round
     the centre. base holds cell FRACTIONS, not metres, so changing the range
     rescales the lattice instead of rebuilding it. Writes into out and returns
     it, so the caller can hand a BufferAttribute array straight in. */
  function fold(base, out, n, center, S) {
    for (var i = 0; i < n; i++) {
      var k = i * 3;
      out[k] = center[0] + wrapRel(base[k] * S, center[0], S);
      out[k + 1] = center[1] + wrapRel(base[k + 1] * S, center[1], S);
      out[k + 2] = center[2] + wrapRel(base[k + 2] * S, center[2], S);
    }
    return out;
  }

  /* mulberry32, so a field is the same field on every reload and in every
     test run. Copied from asteroid.js for the same reason wrapRel is copied. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Build the drawable field. THREE is passed in; the module imports nothing. */
  function makeField(THREE, opts) {
    var o = opts || {};
    var n = Math.max(0, Math.round(o.count == null ? DEFAULTS.count : o.count));
    var col = o.color || DEFAULTS.color;
    var rnd = rng(o.seed == null ? DEFAULTS.seed : o.seed);
    var base = new Float32Array(n * 3);
    for (var i = 0; i < n * 3; i++) base[i] = rnd();
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    var obj = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: {
        uFar: { value: DEFAULTS.far },
        uSizeNear: { value: DEFAULTS.sizeNear }, uSizeFar: { value: DEFAULTS.sizeFar },
        uOpNear: { value: DEFAULTS.opNear }, uOpFar: { value: DEFAULTS.opFar },
        uEdge: { value: DEFAULTS.edge }, uPix: { value: 1 },
        uHalf: { value: new THREE.Vector3(1e9, 1e9, 1e9) },
        uColor: { value: new THREE.Color(col[0], col[1], col[2]) }
      },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false
    }));
    /* The lattice is folded around the camera, so the object's own bounding
       box is meaningless and culling it would be culling the whole field. */
    obj.frustumCulled = false;
    return { obj: obj, geo: geo, base: base, n: n };
  }

  /* One call per frame: push the settings into the uniforms and fold the
     lattice around the given centre, which is the CAMERA and not the ship.
     That distinction was a real bug once: the camera sits some three hull
     lengths behind the hull, i.e. outside the cell that was being folded
     around the ship, so a mote reaching the far edge of that cell was twenty
     metres from the lens rather than three hundred metres away, and it winked
     out right in the pilot's face.

     The range is the fade distance AND half the cell, in one number on
     purpose: a mote reaches zero exactly when it wraps to the other side, so
     the fold can never pop. The edge window is what enforces that whatever the
     two opacity sliders are set to. */
  function update(field, center, params) {
    if (!field || !field.n) return field;
    var u = field.obj.material.uniforms;
    var far = Math.max(1, params.far);
    u.uFar.value = far;
    u.uSizeNear.value = params.sizeNear;
    u.uSizeFar.value = params.sizeFar;
    u.uOpNear.value = params.opNear;
    u.uOpFar.value = params.opFar;
    u.uEdge.value = params.edge;
    /* gl_PointSize counts device pixels, so a slider in CSS pixels has to be
       scaled or the whole field halves on a retina screen. This is the one
       thing PointsMaterial does for you that a shader does not. */
    u.uPix.value = params.pix == null ? 1 : params.pix;
    var h = params.half;
    if (h) u.uHalf.value.set(h[0], h[1], h[2]);
    fold(field.base, field.geo.attributes.position.array, field.n, center, 2 * far);
    field.geo.attributes.position.needsUpdate = true;
    return field;
  }

  /* Motes per hundred metre cube, which is the number that says whether a
     count is thin or soupy at the range it is spread over. */
  function density(count, far) {
    var side = 2 * far / 100;
    if (!(side > 0)) return 0;
    return count / (side * side * side);
  }

  globalThis.Dust = {
    DEFAULTS: DEFAULTS, VS: VS, FS: FS,
    wrapRel: wrapRel, fold: fold, rng: rng,
    makeField: makeField, update: update, density: density
  };
})();
