/* Duval Triangle 1 — DGA of mineral-oil-filled transformers
   Zones: PD, T1, T2, T3, D1, D2, DT
   Coordinates below are given as [%CH4, %C2H4, %C2H2] and sum to 100. */

const DuvalTriangle = (function () {
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ---- triangle geometry in the 600 x 540 viewBox --------------------- */
  const SIDE = 500;
  const BL = { x: 60, y: 470 };                       // 100 % C2H2  (left)
  const BR = { x: BL.x + SIDE, y: 470 };              // 100 % C2H4  (right)
  const AP = { x: BL.x + SIDE / 2, y: 470 - SIDE * Math.sqrt(3) / 2 }; // 100 % CH4

  /* barycentric -> cartesian ; inputs are percentages */
  function pt(ch4, c2h4, c2h2) {
    const a = ch4 / 100, b = c2h4 / 100, c = c2h2 / 100;
    return {
      x: AP.x * a + BR.x * b + BL.x * c,
      y: AP.y * a + BR.y * b + BL.y * c
    };
  }

  /* ---- zone polygons -------------------------------------------------- */
  const ZONES = [
    { code: 'PD', fill: '#cfe4f7', pts: [[98, 2, 0], [100, 0, 0], [98, 0, 2]],
      label: [99, 0.5, 0.5] },
    { code: 'T1', fill: '#f7e9c6', pts: [[98, 2, 0], [98, 0, 2], [96, 0, 4], [76, 20, 4], [80, 20, 0]],
      label: [88, 10, 2] },
    { code: 'T2', fill: '#f2c48d', pts: [[80, 20, 0], [76, 20, 4], [46, 50, 4], [50, 50, 0]],
      label: [65, 33, 2] },
    { code: 'T3', fill: '#e08a5a', pts: [[50, 50, 0], [35, 50, 15], [0, 85, 15], [0, 100, 0]],
      label: [20, 72, 8] },
    { code: 'D1', fill: '#d9c6e8', pts: [[87, 0, 13], [64, 23, 13], [0, 23, 77], [0, 0, 100]],
      label: [40, 8, 52] },
    { code: 'D2', fill: '#e8a0b4', pts: [[64, 23, 13], [47, 40, 13], [31, 40, 29], [0, 71, 29], [0, 23, 77]],
      label: [25, 38, 37] },
    { code: 'DT', fill: '#bfe0bf', pts: [[96, 0, 4], [46, 50, 4], [35, 50, 15], [0, 85, 15],
                                         [0, 71, 29], [31, 40, 29], [47, 40, 13], [64, 23, 13], [87, 0, 13]],
      label: [55, 37, 8] }
  ];

  const LEGEND = [
    ['PD', 'partial discharge'],
    ['D1', 'low-energy discharge'],
    ['D2', 'high-energy discharge'],
    ['T1', 'thermal fault < 300 \u00B0C'],
    ['T2', 'thermal fault 300\u2013700 \u00B0C'],
    ['T3', 'thermal fault > 700 \u00B0C'],
    ['DT', 'mixture of thermal & electrical']
  ];

  /* ---- small DOM helpers ---------------------------------------------- */
  function el(parent, name, attrs) {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function txt(parent, x, y, s, attrs) {
    const t = el(parent, 'text', Object.assign({
      x: x, y: y, 'font-family': 'Helvetica, Arial, sans-serif',
      'font-size': 13, fill: '#111'
    }, attrs || {}));
    t.appendChild(document.createTextNode(s));
    return t;
  }
  function poly(parent, triple, attrs) {
    const p = triple.map(function (v) {
      const q = pt(v[0], v[1], v[2]);
      return q.x.toFixed(2) + ',' + q.y.toFixed(2);
    }).join(' ');
    return el(parent, 'polygon', Object.assign({ points: p }, attrs || {}));
  }

  /* ---- classification -------------------------------------------------- */
  function classify(ch4, c2h4, c2h2) {
    const a = Math.max(0, Number(ch4) || 0);
    const b = Math.max(0, Number(c2h4) || 0);
    const c = Math.max(0, Number(c2h2) || 0);
    const s = a + b + c;
    if (!(s > 0)) return null;

    const CH4 = 100 * a / s, C2H4 = 100 * b / s, C2H2 = 100 * c / s;

    if (CH4 >= 98) return 'PD';

    if (C2H2 < 4) {                       // purely thermal side
      if (C2H4 < 20) return 'T1';
      if (C2H4 < 50) return 'T2';
      return 'T3';
    }

    if (C2H2 < 13) {                      // DT band / T3 above 50 % C2H4
      if (C2H4 >= 50) return 'T3';
      return 'DT';
    }

    /* C2H2 >= 13 : discharges */
    if (C2H4 <= 23) return 'D1';
    if (C2H2 < 15 && C2H4 >= 50) return 'T3';
    if (C2H2 >= 29) return 'D2';
    if (C2H4 <= 40) return 'D2';
    return 'DT';
  }

  /* ---- rendering -------------------------------------------------------- */
  function render(svg, sample) {
    if (!svg) return;

    const root = el(svg, 'g', {});

    /* zones */
    ZONES.forEach(function (z) {
      poly(root, z.pts, { fill: z.fill, stroke: '#444', 'stroke-width': 1,
                          'stroke-linejoin': 'round' });
    });

    /* outer triangle */
    poly(root, [[100, 0, 0], [0, 100, 0], [0, 0, 100]],
      { fill: 'none', stroke: '#000', 'stroke-width': 2, 'stroke-linejoin': 'round' });

    /* ---- ticks ---------------------------------------------------------- */
    const L = { x: -Math.sqrt(3) / 2, y: -0.5 };   // outward normal, left side
    const R = { x: Math.sqrt(3) / 2, y: -0.5 };    // outward normal, right side
    const B = { x: 0, y: 1 };                      // outward normal, bottom

    function tick(p, n, len) {
      el(root, 'line', {
        x1: p.x.toFixed(2), y1: p.y.toFixed(2),
        x2: (p.x + n.x * len).toFixed(2), y2: (p.y + n.y * len).toFixed(2),
        stroke: '#000', 'stroke-width': 1.2
      });
    }

    for (let v = 0; v <= 100; v += 10) {
      const major = (v % 20 === 0);
      const len = major ? 11 : 6;

      /* left side : % CH4 (0 at bottom-left vertex, 100 at apex) */
      const pL = pt(v, 0, 100 - v);
      tick(pL, L, len);
      if (major) txt(root, pL.x + L.x * 20, pL.y + L.y * 20 + 4, String(v),
        { 'text-anchor': 'end', 'font-size': 11, fill: '#333' });

      /* right side : % C2H4 (0 at apex, 100 at bottom-right vertex) */
      const pR = pt(100 - v, v, 0);
      tick(pR, R, len);
      if (major) txt(root, pR.x + R.x * 20, pR.y + R.y * 20 + 4, String(v),
        { 'text-anchor': 'start', 'font-size': 11, fill: '#333' });

      /* bottom side : % C2H2 (0 at bottom-right vertex, 100 at bottom-left) */
      const pB = pt(0, 100 - v, v);
      tick(pB, B, len);
      if (major) txt(root, pB.x, pB.y + 26, String(v),
        { 'text-anchor': 'middle', 'font-size': 11, fill: '#333' });
    }

    /* ---- axis names ------------------------------------------------------ */
    const midL = pt(50, 0, 50), midR = pt(50, 50, 0), midB = pt(0, 50, 50);
    txt(root, midL.x - 62, midL.y - 32, '% CH4',
      { 'font-size': 15, 'font-weight': 'bold', 'text-anchor': 'middle',
        transform: 'rotate(-60 ' + (midL.x - 62) + ' ' + (midL.y - 32) + ')' });
    txt(root, midR.x + 62, midR.y - 32, '% C2H4',
      { 'font-size': 15, 'font-weight': 'bold', 'text-anchor': 'middle',
        transform: 'rotate(60 ' + (midR.x + 62) + ' ' + (midR.y - 32) + ')' });
    txt(root, midB.x, midB.y + 50, '% C2H2',
      { 'font-size': 15, 'font-weight': 'bold', 'text-anchor': 'middle' });

    /* ---- zone labels ------------------------------------------------------ */
    ZONES.forEach(function (z) {
      const p = pt(z.label[0], z.label[1], z.label[2]);
      if (z.code === 'PD') {
        /* apex zone is tiny : label it outside with a leader line */
        el(root, 'line', {
          x1: p.x.toFixed(2), y1: p.y.toFixed(2),
          x2: (p.x + 46).toFixed(2), y2: (p.y - 20).toFixed(2),
          stroke: '#333', 'stroke-width': 1
        });
        txt(root, p.x + 50, p.y - 22, 'PD',
          { 'font-size': 14, 'font-weight': 'bold', 'text-anchor': 'start' });
      } else {
        txt(root, p.x, p.y + 5, z.code,
          { 'font-size': 15, 'font-weight': 'bold', 'text-anchor': 'middle' });
      }
    });

    /* ---- legend ----------------------------------------------------------- */
    txt(root, 8, 18, 'Duval Triangle 1',
      { 'font-size': 14, 'font-weight': 'bold' });
    LEGEND.forEach(function (row, i) {
      txt(root, 8, 36 + i * 14, row[0] + ' \u2013 ' + row[1],
        { 'font-size': 11, fill: '#333' });
    });

    /* ---- sample point ------------------------------------------------------ */
    if (sample) {
      const a = Math.max(0, Number(sample.ch4) || 0);
      const b = Math.max(0, Number(sample.c2h4) || 0);
      const c = Math.max(0, Number(sample.c2h2) || 0);
      const s = a + b + c;
      if (s > 0) {
        const CH4 = 100 * a / s, C2H4 = 100 * b / s, C2H2 = 100 * c / s;
        const code = classify(a, b, c);
        const p = pt(CH4, C2H4, C2H2);

        el(root, 'circle', {
          cx: p.x.toFixed(2), cy: p.y.toFixed(2), r: 6,
          fill: '#000', stroke: '#fff', 'stroke-width': 2
        });
        el(root, 'line', {
          x1: (p.x - 12).toFixed(2), y1: p.y.toFixed(2),
          x2: (p.x + 12).toFixed(2), y2: p.y.toFixed(2),
          stroke: '#000', 'stroke-width': 1
        });
        el(root, 'line', {
          x1: p.x.toFixed(2), y1: (p.y - 12).toFixed(2),
          x2: p.x.toFixed(2), y2: (p.y + 12).toFixed(2),
          stroke: '#000', 'stroke-width': 1
        });
        txt(root, p.x + 12, p.y - 12, code,
          { 'font-size': 14, 'font-weight': 'bold', fill: '#000' });

        txt(root, 592, 18,
          'Sample: CH4 ' + CH4.toFixed(1) + '%  C2H4 ' + C2H4.toFixed(1) +
          '%  C2H2 ' + C2H2.toFixed(1) + '%  \u2192 ' + code,
          { 'font-size': 12, 'text-anchor': 'end', fill: '#111' });
      }
    }
  }

  return { classify: classify, render: render };
})();
