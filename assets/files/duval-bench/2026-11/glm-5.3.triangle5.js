const DuvalTriangle5 = (function () {
  // ---- Geometry: equilateral triangle in viewBox 0 0 600 540 ----
  var OX = 60, OY = 480, L = 480, H = L * Math.sqrt(3) / 2;

  function toXY(p1, p2, p3) { // p1=CH4, p2=C2H4, p3=C2H6 percentages
    p1 /= 100; p2 /= 100; p3 /= 100;
    return [OX + L * (p1 + 0.5 * p2), OY - H * p2];
  }

  // Half-plane clip in (CH4%, C2H4%) space.
  // f(v) must be >= 0 inside the kept region.
  function clip(poly, f) {
    var out = [], n = poly.length;
    for (var i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n];
      var fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        var t = fa / (fa - fb);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return out;
  }

  var TRI = [[0, 100], [100, 0], [0, 0]]; // pure C2H4, pure CH4, pure C2H6 (in CH4/C2H4 coords)

  // Duval Triangle 5 (low-temperature faults): zones S, C, T
  // Boundary at %CH4 = 25 (S/C on the left, T on the right);
  // within the left part, S if %C2H4 <= 4, C otherwise.
  var ZONES = [
    { code: 'S', color: '#d6f5d6', test: function (m) { return m.ch4 <= 25 && m.c2h4 <= 4; }, poly: clip(clip(TRI, function (v) { return 25 - v[0]; }), function (v) { return 4 - v[1]; }) },
    { code: 'C', color: '#ffe6b3', test: function (m) { return m.ch4 <= 25 && m.c2h4 > 4; }, poly: clip(clip(TRI, function (v) { return 25 - v[0]; }), function (v) { return v[1] - 4; }) },
    { code: 'T', color: '#f5c8c8', test: function (m) { return m.ch4 > 25; }, poly: clip(TRI, function (v) { return v[0] - 25; }) }
  ];

  function normalize(ch4, c2h4, c2h6) {
    var s = ch4 + c2h4 + c2h6;
    if (!(s > 0)) s = 1;
    return { ch4: 100 * ch4 / s, c2h4: 100 * c2h4 / s, c2h6: 100 * c2h6 / s };
  }

  function classify(ch4, c2h4, c2h6) {
    var m = normalize(ch4, c2h4, c2h6);
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i].test(m)) return ZONES[i].code;
    return 'T';
  }

  function el(svg, tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    svg.appendChild(e);
    return e;
  }

  function render(svg, sample) {
    var NS = 'http://www.w3.org/2000/svg';
    function E(tag, attrs, text) {
      var e = el(svg, tag, attrs);
      if (text !== undefined) e.textContent = text;
      return e;
    }

    // Title
    E('text', { x: 300, y: 24, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 'bold', fill: '#222' }, 'Duval Triangle 5 (low-temperature faults)');

    // Zones
    var g = E('g', {});
    ZONES.forEach(function (z) {
      var pts = z.poly.map(function (v) {
        var p = toXY(v[0], v[1], 100 - v[0] - v[1]);
        return p[0].toFixed(2) + ',' + p[1].toFixed(2);
      }).join(' ');
      E('polygon', { points: pts, fill: z.color, stroke: '#333', 'stroke-width': 1 });

      // centroid for label
      var cx = 0, cy = 0;
      z.poly.forEach(function (v) { var p = toXY(v[0], v[1], 100 - v[0] - v[1]); cx += p[0]; cy += p[1]; });
      cx /= z.poly.length; cy /= z.poly.length;
      E('text', { x: cx, y: cy + 5, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 'bold', fill: '#222' }, z.code + ' (' + z.code + ')');
    });

    // Triangle outline
    var A = toXY(0, 0, 100), B = toXY(100, 0, 0), C = toXY(0, 100, 0);
    E('polygon', { points: A + ',' + B + ',' + C, fill: 'none', stroke: '#000', 'stroke-width': 2 });

    // Ticks: every 10% along each edge
    var i, t, p, q;
    for (i = 10; i < 100; i += 10) {
      // C2H6 axis: bottom edge (CH4 from 0..100 left->right)
      p = toXY(i, 0, 100 - i);
      el(svg, 'line', { x1: p[0], y1: p[1], x2: p[0], y2: p[1] + 8, stroke: '#000', 'stroke-width': 1 });
      E('text', { x: p[0], y: p[1] + 22, 'text-anchor': 'middle', 'font-size': 9, fill: '#444' }, String(i));
      // CH4 axis: right edge (B->A), CH4 = i
      t = i / 100;
      p = toXY(i, 0, 100 - i); q = toXY(i - 1, 0, 101 - i);
      // interpolate point along right edge at fraction (100-i)/100 from B
      var px = B[0] + (A[0] - B[0]) * (100 - i) / 100, py = B[1] + (A[1] - B[1]) * (100 - i) / 100;
      var dx = A[0] - B[0], dy = A[1] - B[1], len = Math.sqrt(dx * dx + dy * dy);
      var nx = -dy / len, ny = dx / len; // outward normal
      el(svg, 'line', { x1: px, y1: py, x2: px + 8 * nx, y2: py + 8 * ny, stroke: '#000', 'stroke-width': 1 });
      E('text', { x: px + 16 * nx, y: py + 16 * ny + 3, 'text-anchor': 'middle', 'font-size': 9, fill: '#444' }, String(i));
      // C2H4 axis: left edge (A->C), C2H4 = i
      var qx = C[0] + (A[0] - C[0]) * i / 100, qy = C[1] + (A[1] - C[1]) * i / 100;
      var dx2 = A[0] - C[0], dy2 = A[1] - C[1], len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      var nx2 = -dy2 / len2, ny2 = dx2 / len2;
      el(svg, 'line', { x1: qx, y1: qy, x2: qx + 8 * nx2, y2: qy + 8 * ny2, stroke: '#000', 'stroke-width': 1 });
      E('text', { x: qx + 16 * nx2, y: qy + 16 * ny2 + 3, 'text-anchor': 'middle', 'font-size': 9, fill: '#444' }, String(i));
    }

    // Axis names
    E('text', { x: 300, y: 505, 'text-anchor': 'middle', 'font-size': 13, fill: '#000' }, '% CH4');
    E('text', { x: 555, y: 250, 'text-anchor': 'middle', 'font-size': 13, fill: '#000', transform: 'rotate(60 555 250)' }, '% C2H4');
    E('text', { x: 45, y: 250, 'text-anchor': 'middle', 'font-size': 13, fill: '#000', transform: 'rotate(-60 45 250)' }, '% C2H6');

    // Sample marker
    if (sample) {
      var m = normalize(sample.ch4, sample.c2h4, sample.c2h6);
      var pt = toXY(m.ch4, m.c2h4, m.c2h6);
      E('circle', { cx: pt[0], cy: pt[1], r: 7, fill: '#d00', stroke: '#000', 'stroke-width': 1.5 });
      E('text', { x: pt[0] + 10, y: pt[1] - 8, 'font-size': 12, fill: '#900', 'font-weight': 'bold' }, 'Zone: ' + classify(sample.ch4, sample.c2h4, sample.c2h6));
    }
  }

  return { classify: classify, render: render };
})();
