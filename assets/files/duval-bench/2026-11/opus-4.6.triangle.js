const DuvalTriangle = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  // Equilateral triangle vertices in SVG space
  const A = [50, 490];   // 100 % CH4
  const B = [550, 490];  // 100 % C2H4
  const C = [300, 57];   // 100 % C2H2

  // Ternary percentages → SVG (x, y)
  function xy(ch4, c2h4, c2h2) {
    const a = ch4 / 100, b = c2h4 / 100, c = c2h2 / 100;
    return [
      a * A[0] + b * B[0] + c * C[0],
      a * A[1] + b * B[1] + c * C[1]
    ];
  }

  // Zone polygons defined in (% CH4, % C2H4, % C2H2)
  var ZONES = [
    { code: 'PD',  fill: '#9dc3e6',
      v: [[100,0,0],[98,2,0],[98,0,2]] },
    { code: 'T1',  fill: '#b6d7a8',
      v: [[98,2,0],[80,20,0],[76,20,4],[96,0,4],[98,0,2]] },
    { code: 'T2',  fill: '#6aa84f',
      v: [[80,20,0],[50,50,0],[46,50,4],[76,20,4]] },
    { code: 'T3',  fill: '#38761d',
      v: [[50,50,0],[0,100,0],[0,96,4],[46,50,4]] },
    { code: 'DT',  fill: '#ffe066',
      v: [[96,0,4],[87,0,13],[0,87,13],[0,96,4]] },
    { code: 'D1',  fill: '#f6b26b',
      v: [[87,0,13],[0,0,100],[0,23,77],[64,23,13]] },
    { code: 'D2',  fill: '#e06030',
      v: [[64,23,13],[0,87,13],[0,23,77]] }
  ];

  // ── classify ───────────────────────────────────────────────
  function classify(ch4, c2h4, c2h2) {
    var t = ch4 + c2h4 + c2h2;
    var m = ch4 / t * 100;      // % CH4
    var e = c2h4 / t * 100;     // % C2H4
    var a = c2h2 / t * 100;     // % C2H2

    if (m >= 98)  return 'PD';
    if (a >= 13)  return e < 23 ? 'D1' : 'D2';
    if (a >= 4)   return 'DT';
    if (e < 20)   return 'T1';
    if (e < 50)   return 'T2';
    return 'T3';
  }

  // ── render ─────────────────────────────────────────────────
  function render(svg, sample) {
    function el(tag, attrs) {
      var e = document.createElementNS(NS, tag);
      if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
      return e;
    }
    function txt(x, y, str, size, anchor, extra) {
      var t = el('text', Object.assign({
        x: x, y: y,
        'font-size': size || 12,
        'font-family': 'Arial,Helvetica,sans-serif',
        'text-anchor': anchor || 'middle',
        'dominant-baseline': 'central'
      }, extra || {}));
      t.textContent = str;
      return t;
    }

    // white background
    svg.appendChild(el('rect', { x: 0, y: 0, width: 600, height: 540, fill: '#fff' }));

    // zone fills
    var i, z, pts, cx, cy, poly;
    for (i = 0; i < ZONES.length; i++) {
      z = ZONES[i];
      pts = z.v.map(function (v) { return xy(v[0], v[1], v[2]); });
      poly = el('polygon', {
        points: pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '),
        fill: z.fill,
        stroke: '#555',
        'stroke-width': '0.75'
      });
      svg.appendChild(poly);
    }

    // triangle outline
    svg.appendChild(el('polygon', {
      points: [A, B, C].map(function (p) { return p[0] + ',' + p[1]; }).join(' '),
      fill: 'none', stroke: '#000', 'stroke-width': '2'
    }));

    // ── tick marks & labels ──────────────────────────────────
    var pct, p, nx, ny;

    // left edge  A → C :  %C₂H₂ increasing 0 → 100
    // outward normal ≈ (−6.93, −4)
    for (pct = 10; pct <= 90; pct += 10) {
      p = xy(100 - pct, 0, pct);
      nx = -6.93; ny = -4;
      svg.appendChild(el('line', {
        x1: p[0], y1: p[1], x2: p[0] + nx, y2: p[1] + ny,
        stroke: '#000', 'stroke-width': '1'
      }));
      if (pct % 20 === 0) {
        svg.appendChild(txt(p[0] + nx * 3, p[1] + ny * 3, pct, 10, 'end'));
      }
    }

    // bottom edge  A → B :  %C₂H₄ increasing 0 → 100
    for (pct = 10; pct <= 90; pct += 10) {
      p = xy(100 - pct, pct, 0);
      svg.appendChild(el('line', {
        x1: p[0], y1: p[1], x2: p[0], y2: p[1] + 8,
        stroke: '#000', 'stroke-width': '1'
      }));
      if (pct % 20 === 0) {
        svg.appendChild(txt(p[0], p[1] + 18, pct, 10, 'middle'));
      }
    }

    // right edge  C → B :  %C₂H₄ increasing 0 → 100
    // outward normal ≈ (6.93, −4)
    for (pct = 10; pct <= 90; pct += 10) {
      p = xy(0, pct, 100 - pct);
      nx = 6.93; ny = -4;
      svg.appendChild(el('line', {
        x1: p[0], y1: p[1], x2: p[0] + nx, y2: p[1] + ny,
        stroke: '#000', 'stroke-width': '1'
      }));
    }

    // ── axis labels at vertices ──────────────────────────────
    svg.appendChild(txt(A[0] - 5, A[1] + 25, '%CH\u2084', 14, 'middle', { 'font-weight': 'bold' }));
    svg.appendChild(txt(B[0] + 5, B[1] + 25, '%C\u2082H\u2084', 14, 'middle', { 'font-weight': 'bold' }));
    svg.appendChild(txt(C[0], C[1] - 18, '%C\u2082H\u2082', 14, 'middle', { 'font-weight': 'bold' }));

    // ── zone labels ──────────────────────────────────────────
    // compute centroid of each zone polygon; special-case the tiny PD zone
    for (i = 0; i < ZONES.length; i++) {
      z = ZONES[i];
      pts = z.v.map(function (v) { return xy(v[0], v[1], v[2]); });
      cx = pts.reduce(function (s, p) { return s + p[0]; }, 0) / pts.length;
      cy = pts.reduce(function (s, p) { return s + p[1]; }, 0) / pts.length;

      if (z.code === 'PD') {
        // tiny zone – offset the label with a leader line
        var lx = cx + 28, ly = cy - 22;
        svg.appendChild(el('line', {
          x1: cx, y1: cy, x2: lx, y2: ly,
          stroke: '#000', 'stroke-width': '0.8'
        }));
        svg.appendChild(txt(lx + 2, ly, 'PD', 13, 'start', { 'font-weight': 'bold' }));
      } else {
        svg.appendChild(txt(cx, cy, z.code, 15, 'middle', {
          'font-weight': 'bold',
          fill: z.code === 'T3' ? '#fff' : '#000'
        }));
      }
    }

    // ── sample marker ────────────────────────────────────────
    if (sample) {
      var t = sample.ch4 + sample.c2h4 + sample.c2h2;
      var sp = xy(sample.ch4 / t * 100, sample.c2h4 / t * 100, sample.c2h2 / t * 100);
      svg.appendChild(el('circle', {
        cx: sp[0], cy: sp[1], r: 6,
        fill: '#e00', stroke: '#000', 'stroke-width': '2'
      }));
      var code = classify(sample.ch4, sample.c2h4, sample.c2h2);
      svg.appendChild(txt(sp[0] + 12, sp[1] - 10, code, 12, 'start', {
        fill: '#e00', 'font-weight': 'bold'
      }));
    }
  }

  return { classify: classify, render: render };
})();