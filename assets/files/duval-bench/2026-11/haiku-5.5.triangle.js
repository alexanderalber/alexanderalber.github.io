// Duval Triangle 1 (CH4, C2H4, C2H2) for mineral-oil DGA.
// Zone limits written from memory (Duval 2001 / IEC 60599 style), not checked against the published figure.
const DuvalTriangle = (function () {
  // SVG layout for viewBox 0 0 600 540: CH4 at top, C2H4 bottom-left, C2H2 bottom-right.
  var VERT = {
    ch4: [300, 70],
    c2h4: [70, 470],
    c2h2: [530, 470]
  };
  var CENTROID = [300, (70 + 470 + 470) / 3];
  var NS = 'http://www.w3.org/2000/svg';
  var COLORS = {
    PD: '#9be7ff',
    T1: '#ffe066',
    T2: '#ffb347',
    T3: '#ff7b54',
    DT: '#c9a0dc',
    D1: '#7fd1b9',
    D2: '#2a9d8f'
  };
  var ZONE_ORDER = ['PD', 'T1', 'T2', 'T3', 'DT', 'D1', 'D2'];

  // p = %CH4, e = %C2H4, a = %C2H2, summing to 100.
  function zoneOf(p, e, a) {
    if (p >= 98) return 'PD';            // partial discharge, CH4 corner
    if (a >= 13) {                        // electrical discharge side
      if (e < 23) return 'D1';            // low energy discharge
      return a >= 29 ? 'D2' : 'DT';       // high energy discharge / mixture
    }
    if (a >= 4) return e >= 50 ? 'T3' : 'DT';
    if (e >= 50) return 'T3';             // high temperature thermal fault
    if (e >= 20) return 'T2';             // medium temperature thermal fault
    return 'T1';                          // low temperature thermal fault
  }

  function classify(ch4, c2h4, c2h2) {
    var total = ch4 + c2h4 + c2h2;
    return zoneOf(ch4 / total * 100, c2h4 / total * 100, c2h2 / total * 100);
  }

  // Fractions (percent) to SVG coordinates.
  function xy(p, e, a) {
    return [
      (p * VERT.ch4[0] + e * VERT.c2h4[0] + a * VERT.c2h2[0]) / 100,
      (p * VERT.ch4[1] + e * VERT.c2h4[1] + a * VERT.c2h2[1]) / 100
    ];
  }

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function text(str, x, y, attrs, parent) {
    var node = el('text', Object.assign({
      x: x, y: y, 'font-family': 'sans-serif', 'font-size': 13, fill: '#222',
      'text-anchor': 'middle', 'dominant-baseline': 'middle'
    }, attrs || {}), parent);
    node.textContent = str;
    return node;
  }

  function render(svg, sample) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    el('rect', { x: 0, y: 0, width: 600, height: 540, fill: '#ffffff' }, svg);

    // Zone fills: 1 % lattice, each lattice cell split into two triangles.
    // Triangles are in (C2H2 %, C2H4 %) coordinates; CH4 = 100 - sum.
    var d = {}, sums = {}, counts = {};
    ZONE_ORDER.forEach(function (z) { d[z] = ''; sums[z] = [0, 0]; counts[z] = 0; });

    function addTri(corners, centre) {
      var z = zoneOf(100 - centre[0] - centre[1], centre[1], centre[0]);
      var q = corners.map(function (k) {
        var pt = xy(100 - k[0] - k[1], k[1], k[0]);
        return pt[0].toFixed(2) + ' ' + pt[1].toFixed(2);
      });
      d[z] += 'M' + q.join(' L') + ' Z ';
      var c = xy(100 - centre[0] - centre[1], centre[1], centre[0]);
      sums[z][0] += c[0];
      sums[z][1] += c[1];
      counts[z] += 1;
    }

    for (var a = 0; a < 100; a++) {
      for (var e = 0; a + e < 100; e++) {
        addTri([[a, e], [a + 1, e], [a, e + 1]], [a + 1 / 3, e + 1 / 3]);
        if (a + e + 2 <= 100) {
          addTri([[a + 1, e], [a + 1, e + 1], [a, e + 1]], [a + 2 / 3, e + 2 / 3]);
        }
      }
    }

    ZONE_ORDER.forEach(function (z) {
      if (!d[z]) return;
      el('path', {
        d: d[z], fill: COLORS[z], stroke: COLORS[z], 'stroke-width': 0.5,
        'stroke-linejoin': 'round'
      }, svg);
    });

    // Outline.
    el('polygon', {
      points: [VERT.ch4, VERT.c2h4, VERT.c2h2].map(function (v) { return v.join(','); }).join(' '),
      fill: 'none', stroke: '#222', 'stroke-width': 1.5
    }, svg);

    // Zone labels at the mean position of each zone's cells.
    ZONE_ORDER.forEach(function (z) {
      if (!counts[z]) return;
      text(z, sums[z][0] / counts[z], sums[z][1] / counts[z],
        { 'font-weight': 'bold', 'font-size': 14 }, svg);
    });

    // Ticks: CH4 on left edge, C2H4 on bottom edge, C2H2 on right edge.
    function tickPoint(gas, v) {
      if (gas === 'ch4') return xy(v, 100 - v, 0);
      if (gas === 'c2h4') return xy(0, v, 100 - v);
      return xy(100 - v, 0, v);
    }
    ['ch4', 'c2h4', 'c2h2'].forEach(function (gas) {
      for (var v = 10; v <= 90; v += 10) {
        var p = tickPoint(gas, v);
        var dx = p[0] - CENTROID[0], dy = p[1] - CENTROID[1];
        var len = Math.sqrt(dx * dx + dy * dy);
        dx /= len; dy /= len;
        el('line', {
          x1: p[0], y1: p[1], x2: p[0] + dx * 7, y2: p[1] + dy * 7,
          stroke: '#222', 'stroke-width': 1
        }, svg);
        text(String(v), p[0] + dx * 20, p[1] + dy * 20, { 'font-size': 11 }, svg);
      }
    });

    // Gas names at the vertices.
    text('CH4 (%)', 300, 40, { 'font-weight': 'bold', 'font-size': 15 }, svg);
    text('C2H4 (%)', 60, 500, { 'font-weight': 'bold', 'font-size': 15 }, svg);
    text('C2H2 (%)', 540, 500, { 'font-weight': 'bold', 'font-size': 15 }, svg);

    // Sample marker.
    if (sample) {
      var total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        var pp = sample.ch4 / total * 100;
        var ee = sample.c2h4 / total * 100;
        var aa = sample.c2h2 / total * 100;
        var pt = xy(pp, ee, aa);
        el('circle', {
          cx: pt[0], cy: pt[1], r: 6, fill: '#d00000', stroke: '#ffffff', 'stroke-width': 2
        }, svg);
        text('sample: ' + zoneOf(pp, ee, aa), pt[0] + 10, pt[1] - 12,
          { 'font-size': 12, 'font-weight': 'bold', 'text-anchor': 'start', fill: '#111' }, svg);
      }
    }
  }

  return { classify: classify, render: render };
})();
