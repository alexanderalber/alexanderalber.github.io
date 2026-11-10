// Duval Pentagon 1 for dissolved gas analysis of mineral-oil-filled transformers.
// Written from memory (Duval and Lamarre, 2014). Coordinates are in "percent units":
// each gas is plotted on its own axis at its relative percentage, the pentagon
// itself is clipped at 40 %, and the sample point is the centroid of the irregular
// polygon spanned by the five axis points.
const DuvalPentagon = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // Axis order counterclockwise, starting at the top: H2, C2H6, CH4, C2H4, C2H2.
  var AXES = [
    { key: 'h2', label: 'H2', sub: 'H₂', deg: 90 },
    { key: 'c2h6', label: 'C2H6', sub: 'C₂H₆', deg: 162 },
    { key: 'ch4', label: 'CH4', sub: 'CH₄', deg: 234 },
    { key: 'c2h4', label: 'C2H4', sub: 'C₂H₄', deg: 306 },
    { key: 'c2h2', label: 'C2H2', sub: 'C₂H₂', deg: 18 }
  ];

  var ZONES = [
    { code: 'PD', color: '#a78bfa', name: 'Partial discharges',
      pts: [[0, 33], [-1, 33], [-1, 24.5], [0, 24.5]], lab: [-7, 29] },
    { code: 'D1', color: '#7dd3fc', name: 'Discharges of low energy',
      pts: [[0, 40], [38, 12.4], [32, -6.1], [4, 16], [0, 1.5]], lab: [15, 19] },
    { code: 'D2', color: '#60a5fa', name: 'Discharges of high energy',
      pts: [[4, 16], [32, -6.1], [24.3, -30], [0, -3], [0, 1.5]], lab: [15, -7] },
    { code: 'T3', color: '#f87171', name: 'Thermal fault > 700 °C',
      pts: [[0, -3], [24.3, -30], [23.5, -32.4], [1, -32.4], [-6, -4]], lab: [9, -24] },
    { code: 'T2', color: '#fb923c', name: 'Thermal fault 300 to 700 °C',
      pts: [[-6, -4], [1, -32.4], [-22.5, -32.4]], lab: [-9, -25] },
    { code: 'T1', color: '#fde047', name: 'Thermal fault < 300 °C',
      pts: [[-6, -4], [-22.5, -32.4], [-23.5, -32.4], [-35, 3.1], [0, 1.5], [0, -3]], lab: [-19, -9] },
    { code: 'S', color: '#86efac', name: 'Stray gassing',
      pts: [[0, 1.5], [-35, 3.1], [-38, 12.4], [0, 40], [0, 33], [-1, 33], [-1, 24.5], [0, 24.5]], lab: [-17, 14] }
  ];

  function num(v) {
    v = Number(v);
    return isFinite(v) && v > 0 ? v : 0;
  }

  // Centroid of the polygon spanned by the five axis points, in percent units.
  function point(h2, ch4, c2h6, c2h4, c2h2) {
    var g = { h2: num(h2), ch4: num(ch4), c2h6: num(c2h6), c2h4: num(c2h4), c2h2: num(c2h2) };
    var sum = g.h2 + g.ch4 + g.c2h6 + g.c2h4 + g.c2h2;
    if (!(sum > 0)) return null;
    var p = [], i;
    for (i = 0; i < 5; i++) {
      var r = 100 * g[AXES[i].key] / sum;
      var a = AXES[i].deg * Math.PI / 180;
      p.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    var A = 0, cx = 0, cy = 0;
    for (i = 0; i < 5; i++) {
      var q = p[(i + 1) % 5];
      var cr = p[i][0] * q[1] - q[0] * p[i][1];
      A += cr;
      cx += (p[i][0] + q[0]) * cr;
      cy += (p[i][1] + q[1]) * cr;
    }
    A /= 2;
    if (Math.abs(A) < 1e-9) {
      // Degenerate polygon (one gas, or two non-adjacent ones): fall back to the vertex mean.
      var mx = 0, my = 0;
      for (i = 0; i < 5; i++) { mx += p[i][0]; my += p[i][1]; }
      return [mx / 5, my / 5];
    }
    return [cx / (6 * A), cy / (6 * A)];
  }

  function inside(pts, x, y) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  function segDist(x, y, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var l2 = dx * dx + dy * dy;
    var t = l2 > 0 ? ((x - a[0]) * dx + (y - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    var px = a[0] + t * dx - x, py = a[1] + t * dy - y;
    return Math.sqrt(px * px + py * py);
  }

  function polyDist(pts, x, y) {
    var d = Infinity;
    for (var i = 0; i < pts.length; i++) {
      d = Math.min(d, segDist(x, y, pts[i], pts[(i + 1) % pts.length]));
    }
    return d;
  }

  function zoneAt(x, y) {
    var i;
    for (i = 0; i < ZONES.length; i++) {
      if (inside(ZONES[i].pts, x, y)) return ZONES[i].code;
    }
    // On a boundary or marginally outside: take the nearest zone.
    var best = ZONES[0].code, bd = Infinity;
    for (i = 0; i < ZONES.length; i++) {
      var d = polyDist(ZONES[i].pts, x, y);
      if (d < bd) { bd = d; best = ZONES[i].code; }
    }
    return best;
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    var p = point(h2, ch4, c2h6, c2h4, c2h2);
    if (!p) return '';
    return zoneAt(p[0], p[1]);
  }

  // ---- rendering ----
  var CX = 300, CY = 318, SC = 6.1;

  function sx(x) { return CX + x * SC; }
  function sy(y) { return CY - y * SC; }
  function f(v) { return (Math.round(v * 100) / 100).toString(); }

  function el(parent, tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  }

  function ptsAttr(pts) {
    var s = [];
    for (var i = 0; i < pts.length; i++) s.push(f(sx(pts[i][0])) + ',' + f(sy(pts[i][1])));
    return s.join(' ');
  }

  function render(svg, sample) {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var i, a, z;
    var FONT = 'Helvetica, Arial, sans-serif';

    el(svg, 'text', { x: 300, y: 26, 'text-anchor': 'middle', 'font-family': FONT,
      'font-size': 17, 'font-weight': 'bold', fill: '#111827' }, 'Duval Pentagon 1');

    // Zones
    var gz = el(svg, 'g', { 'stroke-linejoin': 'round' });
    for (i = 0; i < ZONES.length; i++) {
      z = ZONES[i];
      var poly = el(gz, 'polygon', { points: ptsAttr(z.pts), fill: z.color,
        stroke: '#1f2937', 'stroke-width': 1 });
      el(poly, 'title', {}, z.code + ': ' + z.name);
    }

    // Axes: from the centre to each vertex (40 %), with ticks every 10 %.
    var ga = el(svg, 'g', { stroke: '#374151', 'stroke-width': 0.8, fill: 'none' });
    for (i = 0; i < AXES.length; i++) {
      a = AXES[i].deg * Math.PI / 180;
      var ux = Math.cos(a), uy = Math.sin(a);
      el(ga, 'line', { x1: f(sx(0)), y1: f(sy(0)), x2: f(sx(40 * ux)), y2: f(sy(40 * uy)),
        'stroke-dasharray': '4 3', 'stroke-opacity': 0.75 });
      for (var t = 10; t <= 40; t += 10) {
        var tx = t * ux, ty = t * uy, nx = -uy * 0.9, ny = ux * 0.9;
        el(ga, 'line', { x1: f(sx(tx - nx)), y1: f(sy(ty - ny)), x2: f(sx(tx + nx)), y2: f(sy(ty + ny)) });
      }
    }

    // Outline of the pentagon
    var outline = [];
    for (i = 0; i < AXES.length; i++) {
      a = AXES[i].deg * Math.PI / 180;
      outline.push([40 * Math.cos(a), 40 * Math.sin(a)]);
    }
    el(svg, 'polygon', { points: ptsAttr(outline), fill: 'none', stroke: '#111827',
      'stroke-width': 1.8, 'stroke-linejoin': 'round' });

    // Gas names at the vertices
    var gl = el(svg, 'g', { 'font-family': FONT, 'font-size': 16, 'font-weight': 'bold', fill: '#111827' });
    for (i = 0; i < AXES.length; i++) {
      a = AXES[i].deg * Math.PI / 180;
      var lx = sx(44.5 * Math.cos(a)), ly = sy(44.5 * Math.sin(a));
      var c = Math.cos(a);
      var anchor = c > 0.3 ? 'start' : (c < -0.3 ? 'end' : 'middle');
      if (AXES[i].deg === 234) anchor = 'end';
      if (AXES[i].deg === 306) anchor = 'start';
      el(gl, 'text', { x: f(lx), y: f(ly + 5), 'text-anchor': anchor }, AXES[i].sub);
    }
    el(svg, 'text', { x: f(sx(1.5)), y: f(sy(40) + 4), 'font-family': FONT, 'font-size': 10,
      fill: '#374151' }, '');

    // Zone labels
    var gt = el(svg, 'g', { 'font-family': FONT, 'font-size': 17, 'font-weight': 'bold',
      fill: '#111827', 'text-anchor': 'middle' });
    for (i = 0; i < ZONES.length; i++) {
      z = ZONES[i];
      if (z.code === 'PD') {
        el(svg, 'line', { x1: f(sx(-4.6)), y1: f(sy(29)), x2: f(sx(-0.5)), y2: f(sy(29)),
          stroke: '#111827', 'stroke-width': 1 });
        el(gt, 'text', { x: f(sx(z.lab[0])), y: f(sy(z.lab[1]) + 5), 'font-size': 14 }, z.code);
      } else {
        el(gt, 'text', { x: f(sx(z.lab[0])), y: f(sy(z.lab[1]) + 6) }, z.code);
      }
    }

    // Legend
    var gg = el(svg, 'g', { 'font-family': FONT, 'font-size': 10.5, fill: '#374151' });
    var lx0 = 12, ly0 = 520;
    for (i = 0; i < ZONES.length; i++) {
      z = ZONES[i];
      var col = i < 4 ? 0 : 1, row = i < 4 ? i : i - 4;
      var x0 = col === 0 ? lx0 : 422, y0 = ly0 + row * 17;
      el(gg, 'rect', { x: x0, y: y0, width: 11, height: 11, fill: z.color, stroke: '#1f2937', 'stroke-width': 0.6 });
      el(gg, 'text', { x: x0 + 16, y: y0 + 9.5 }, z.code + '  ' + z.name);
    }

    // Sample point
    if (sample && typeof sample === 'object') {
      var p = point(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
      if (p) {
        var code = zoneAt(p[0], p[1]);
        var px = sx(p[0]), py = sy(p[1]);
        var gs = el(svg, 'g', {});
        el(gs, 'line', { x1: f(px - 11), y1: f(py), x2: f(px + 11), y2: f(py), stroke: '#111827', 'stroke-width': 1.2 });
        el(gs, 'line', { x1: f(px), y1: f(py - 11), x2: f(px), y2: f(py + 11), stroke: '#111827', 'stroke-width': 1.2 });
        var dot = el(gs, 'circle', { cx: f(px), cy: f(py), r: 5.5, fill: '#dc2626', stroke: '#ffffff', 'stroke-width': 1.8 });
        el(dot, 'title', {}, 'Sample: ' + code + ' (x ' + p[0].toFixed(1) + ', y ' + p[1].toFixed(1) + ')');
        var right = px < 480;
        el(gs, 'text', { x: f(px + (right ? 10 : -10)), y: f(py - 9), 'text-anchor': right ? 'start' : 'end',
          'font-family': FONT, 'font-size': 13, 'font-weight': 'bold', fill: '#111827',
          stroke: '#ffffff', 'stroke-width': 3, 'paint-order': 'stroke' }, 'Sample: ' + code);
      }
    }
  }

  return { classify: classify, render: render };
})();
