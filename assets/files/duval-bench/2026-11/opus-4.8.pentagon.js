const DuvalPentagon = (function () {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  const R = 40;          // data-space pentagon radius (100% reaches a vertex)
  const CX = 300, CY = 300, K = 5; // svg transform (center + scale)

  function vertex(deg) {
    const r = deg * Math.PI / 180;
    return [R * Math.cos(r), R * Math.sin(r)];
  }

  // Vertex directions of the five gas axes.
  const V = {
    H2:   vertex(90),    // top
    C2H2: vertex(18),    // upper right
    C2H4: vertex(-54),   // lower right  (=306)
    CH4:  vertex(234),   // lower left
    C2H6: vertex(162)    // upper left
  };

  // Clockwise order around the pentagon.
  const ORDER = ['H2', 'C2H2', 'C2H4', 'CH4', 'C2H6'];
  const vertAngles = [18, 90, 162, 234, 306];

  const EDGES = (function () {
    const e = [];
    for (let i = 0; i < 5; i++) e.push([V[ORDER[i]], V[ORDER[(i + 1) % 5]]]);
    return e;
  })();

  // Zones of Duval Pentagon 1, expressed as angular sectors (from centroid).
  const ZONES = [
    { code: 'D2', lo: 325, hi: 376, color: '#1f4e9c', text: '#ffffff' }, // wraps through 0
    { code: 'D1', lo: 16,  hi: 85,  color: '#5b9bd5', text: '#000000' },
    { code: 'PD', lo: 85,  hi: 100, color: '#c7e0f4', text: '#000000' },
    { code: 'S',  lo: 100, hi: 190, color: '#9ccc65', text: '#000000' },
    { code: 'T1', lo: 190, hi: 234, color: '#ffe0a3', text: '#000000' },
    { code: 'T2', lo: 234, hi: 285, color: '#ffb74d', text: '#000000' },
    { code: 'T3', lo: 285, hi: 325, color: '#e8731c', text: '#ffffff' }
  ];

  function rayToPerimeter(deg) {
    const a = deg * Math.PI / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = null, bestT = Infinity;
    for (const [A, B] of EDGES) {
      const ex = B[0] - A[0], ey = B[1] - A[1];
      const det = -dx * ey + ex * dy;
      if (Math.abs(det) < 1e-12) continue;
      const t = (-A[0] * ey + ex * A[1]) / det;
      const s = (dx * A[1] - dy * A[0]) / det;
      if (s >= -1e-6 && s <= 1 + 1e-6 && t > 1e-6 && t < bestT) {
        bestT = t;
        best = [dx * t, dy * t];
      }
    }
    return best || [0, 0];
  }

  function zonePolygon(lo, hi) {
    const angs = [lo];
    for (const v of vertAngles) {
      for (const vv of [v, v + 360]) {
        if (vv > lo + 1e-6 && vv < hi - 1e-6) angs.push(vv);
      }
    }
    angs.push(hi);
    angs.sort((a, b) => a - b);
    const pts = [[0, 0]];
    for (const a of angs) pts.push(rayToPerimeter(((a % 360) + 360) % 360));
    return pts;
  }

  function polyCentroid(pts) {
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      const cr = x0 * y1 - x1 * y0;
      A += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
    }
    A /= 2;
    if (Math.abs(A) < 1e-9) {
      let sx = 0, sy = 0;
      for (const p of pts) { sx += p[0]; sy += p[1]; }
      return [sx / pts.length, sy / pts.length];
    }
    return [cx / (6 * A), cy / (6 * A)];
  }

  function sc(v, f) { return [v[0] * f, v[1] * f]; }

  function samplePoint(h2, ch4, c2h6, c2h4, c2h2) {
    const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    const pts = [
      sc(V.H2,   h2 / sum),
      sc(V.C2H2, c2h2 / sum),
      sc(V.C2H4, c2h4 / sum),
      sc(V.CH4,  ch4 / sum),
      sc(V.C2H6, c2h6 / sum)
    ];
    return polyCentroid(pts);
  }

  function zoneForAngle(ang) {
    if (ang >= 325 || ang < 16) return 'D2';
    if (ang < 85)  return 'D1';
    if (ang < 100) return 'PD';
    if (ang < 190) return 'S';
    if (ang < 234) return 'T1';
    if (ang < 285) return 'T2';
    return 'T3';
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (!(sum > 0)) return null;
    const c = samplePoint(h2, ch4, c2h6, c2h4, c2h2);
    let ang = Math.atan2(c[1], c[0]) * 180 / Math.PI;
    if (ang < 0) ang += 360;
    return zoneForAngle(ang);
  }

  function T(p) { return [CX + p[0] * K, CY - p[1] * K]; }

  function el(name, attrs) {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function render(svg, sample) {
    // Zone fills + labels.
    for (const z of ZONES) {
      const poly = zonePolygon(z.lo, z.hi);
      const scr = poly.map(T);
      svg.appendChild(el('polygon', {
        points: scr.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' '),
        fill: z.color, stroke: '#ffffff', 'stroke-width': 1
      }));
      const c = polyCentroid(poly);
      const lc = T([c[0] * 1.15, c[1] * 1.15]);
      const label = el('text', {
        x: lc[0], y: lc[1], 'text-anchor': 'middle',
        'dominant-baseline': 'middle', 'font-family': 'sans-serif',
        'font-size': 16, 'font-weight': 'bold', fill: z.text
      });
      label.textContent = z.code;
      svg.appendChild(label);
    }

    // Pentagon outline.
    const outline = ORDER.map(k => T(V[k]));
    svg.appendChild(el('polygon', {
      points: outline.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' '),
      fill: 'none', stroke: '#000000', 'stroke-width': 2
    }));

    // Axes + gas names.
    const names = { H2: 'H2', C2H2: 'C2H2', C2H4: 'C2H4', CH4: 'CH4', C2H6: 'C2H6' };
    for (const k of ORDER) {
      const p = T(V[k]);
      svg.appendChild(el('line', {
        x1: CX, y1: CY, x2: p[0], y2: p[1],
        stroke: '#000000', 'stroke-width': 0.8, 'stroke-dasharray': '3,3'
      }));
      const lp = T([V[k][0] * 1.13, V[k][1] * 1.13]);
      const t = el('text', {
        x: lp[0], y: lp[1], 'text-anchor': 'middle',
        'dominant-baseline': 'middle', 'font-family': 'sans-serif',
        'font-size': 15, 'font-weight': 'bold', fill: '#000000'
      });
      t.textContent = names[k];
      svg.appendChild(t);
    }

    // Sample marker.
    if (sample) {
      const sum = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (sum > 0) {
        const c = samplePoint(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
        const sp = T(c);
        svg.appendChild(el('circle', {
          cx: sp[0], cy: sp[1], r: 6,
          fill: '#e6005c', stroke: '#000000', 'stroke-width': 1.5
        }));
        const code = classify(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
        const t = el('text', {
          x: sp[0] + 10, y: sp[1] - 8, 'font-family': 'sans-serif',
          'font-size': 14, 'font-weight': 'bold', fill: '#000000'
        });
        t.textContent = code;
        svg.appendChild(t);
      }
    }
  }

  return { classify, render };
})();
