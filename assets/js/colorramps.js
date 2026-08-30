/* colorramps.js -- the sequential colormaps the rock tools shade with.
 *
 * Lifted out of the alcore block of asteroid-lab.html on 2026-08-30, when
 * asteroid-corridor wanted the same maps and CLAUDE.md rules out the copy.
 * The tables are the product of notes/dev/asteroid-ramps.py and are not to be
 * retyped from memory; the reasoning is in the comment below, which came
 * along unchanged.
 *
 * Nothing here touches the DOM, three.js or any import, so the module runs in
 * the page and under Node, where the test suites evaluate the file as a
 * string. Everything hangs on globalThis.ColorRamps.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- *
   * Colormaps
   *
   * Four sequential maps out of matplotlib plus one hand-built neutral rock
   * ramp. Sampled at nine stops each, exactly the way ripple-tank holds its
   * sequential maps, and produced by notes/dev/asteroid-ramps.py from the
   * segment tables in matplotlib 3.11.1's _cm.py. NOT written from memory:
   * bone and copper are piecewise-linear tables with kinks at 23/63 and
   * 17/21, and an eyeballed version of either is a different map that merely
   * looks similar in a swatch.
   *
   * These are SEQUENTIAL and deliberately not shared with the site's
   * diverging set. A diverging scale on a quantity that only goes up, here
   * the amount of light reaching a facet, spends its strongest contrast on a
   * middle that means nothing.
   *
   * Values are sRGB in 0..1, which is the space they are used in: the shading
   * is a scalar and the colour is a lookup, so no light arithmetic ever
   * happens in a colour space where it would be wrong.
   * ---------------------------------------------------------------- */
  var RAMPS = [
    { id: 'neutral', name: 'Neutral', stops: [
      /* hand-built, the rock colour of the first draft spread into a ramp */
      [0.055, 0.051, 0.047], [0.129, 0.117, 0.105], [0.220, 0.199, 0.178],
      [0.322, 0.293, 0.262], [0.435, 0.397, 0.357], [0.553, 0.508, 0.459],
      [0.675, 0.625, 0.570], [0.800, 0.750, 0.692], [0.925, 0.884, 0.831]
    ] },
    { id: 'gray', name: 'Gray', stops: [
      [0.000, 0.000, 0.000], [0.125, 0.125, 0.125], [0.250, 0.250, 0.250],
      [0.375, 0.375, 0.375], [0.500, 0.500, 0.500], [0.625, 0.625, 0.625],
      [0.750, 0.750, 0.750], [0.875, 0.875, 0.875], [1.000, 1.000, 1.000]
    ] },
    { id: 'bone', name: 'Bone', stops: [
      [0.000, 0.000, 0.000], [0.109, 0.109, 0.152], [0.219, 0.219, 0.304],
      [0.328, 0.331, 0.453], [0.438, 0.482, 0.562], [0.547, 0.632, 0.672],
      [0.658, 0.781, 0.781], [0.829, 0.891, 0.891], [1.000, 1.000, 1.000]
    ] },
    { id: 'copper', name: 'Copper', stops: [
      [0.000, 0.000, 0.000], [0.154, 0.098, 0.062], [0.309, 0.195, 0.124],
      [0.463, 0.293, 0.187], [0.618, 0.391, 0.249], [0.772, 0.488, 0.311],
      [0.926, 0.586, 0.373], [1.000, 0.684, 0.435], [1.000, 0.781, 0.497]
    ] },
    { id: 'pink', name: 'Pink', stops: [
      [0.118, 0.000, 0.000], [0.454, 0.289, 0.289], [0.632, 0.408, 0.408],
      [0.764, 0.508, 0.500], [0.816, 0.672, 0.577], [0.866, 0.803, 0.645],
      [0.913, 0.913, 0.711], [0.957, 0.957, 0.868], [1.000, 1.000, 1.000]
    ] }
  ];

  function rampById(id) {
    for (var i = 0; i < RAMPS.length; i++) if (RAMPS[i].id === id) return RAMPS[i];
    return RAMPS[0];
  }

  /* The colormap as RGBA bytes for a width-by-1 texture, linearly
     interpolated between the nine stops.
   *
   * 256 texels and a linear filter, and the toon banding does NOT come from
   * the texture. Quantising the SHADING VALUE before the lookup gives exact
   * bands whatever the sampler does, which removes the classic trap where a
   * single LinearFilter turns the bands back into a gradient with no error
   * anywhere to find. The filter setting is then merely a quality choice for
   * the continuous case instead of being load-bearing. */
  function rampTexels(stops, width) {
    var n = isFinite(width) ? Math.max(2, Math.round(width)) : 256;
    var k = stops.length - 1;
    var out = new Uint8Array(n * 4);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * k;
      var lo = Math.min(k, Math.floor(x));
      var hi = Math.min(k, lo + 1);
      var t = x - lo;
      for (var c = 0; c < 3; c++) {
        var v = stops[lo][c] + t * (stops[hi][c] - stops[lo][c]);
        out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  /* The same stops as a CSS gradient, for the swatch in the panel. */
  function rampCss(stops) {
    var parts = [];
    for (var i = 0; i < stops.length; i++) {
      var s = stops[i];
      parts.push('rgb(' + Math.round(s[0] * 255) + ',' + Math.round(s[1] * 255) +
        ',' + Math.round(s[2] * 255) + ') ' + (100 * i / (stops.length - 1)).toFixed(1) + '%');
    }
    return 'linear-gradient(90deg, ' + parts.join(', ') + ')';
  }

  globalThis.ColorRamps = {
    RAMPS: RAMPS, rampById: rampById, rampTexels: rampTexels, rampCss: rampCss
  };
})();
