// Duval Triangle 1 (mineral oil), written from memory.
// Coordinates: relative percentages of CH4, C2H4, C2H2.
const DuvalTriangle = (function () {
  const NS = 'http://www.w3.org/2000/svg';

  function norm(ch4, c2h4, c2h2) {
    const s = ch4 + c2h4 + c2h2;
    return { ch4: 100 * ch4 / s, c2h4: 100 * c2h4 / s, c2h2: 100 * c2h2 / s };
  }

  function classify(ch4, c2h4, c2h2) {
    const p = norm(+ch4 || 0, +c2h4 || 0, +c2h2 || 0);
    const m = p.ch4, e = p.c2h4, a = p.c2h2;
    if (m >= 98) return 'PD';
    if (a >= 13 && e < 23) return 'D1';
    if ((a >= 13 && e >= 23 && e < 40) || (a >= 29 && e >= 40)) return 'D2';
    if (a < 4 && e < 20) return 'T1';
    if (a < 4 && e >= 20 && e < 50) return 'T2';
    if (a < 15 && e >= 50) return 'T3';
    return 'DT';
  }

  // Vertices: CH4 top, C2H4 bottom right, C2H2 bottom left.
  const A = [300, 80], B = [520, 461], C = [80, 461];
  const G = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];

  // point from (c2h4, c2h2) percentages, ch4 = 100 - rest
  function pt(e, a) {
    const m = 100 - e - a;
    return [(m * A[0] + e * B[0] + a * C[0]) / 100, (m * A[1] + e * B[1] + a * C[1]) / 100];
  }

  const ZONES = [
    { code: 'PD', fill: '#c7d7f0', poly: [[0, 0], [2, 0], [0, 2]] },
    { code: 'T1', fill: '#fbe3a6', poly: [[0, 2], [2, 0], [20, 0], [20, 4], [0, 4]] },
    { code: 'T2', fill: '#f8c58a', poly: [[20, 0], [50, 0], [50, 4], [20, 4]] },
    { code: 'T3', fill: '#f29a7a', poly: [[50, 0], [100, 0], [85, 15], [50, 15]] },
    { code: 'D1', fill: '#bfe3c0', poly: [[0, 13], [23, 13], [23, 77], [0, 100]] },
    { code: 'D2', fill: '#8fcfa0', poly: [[23, 13], [40, 13], [40, 29], [71, 29], [40, 60], [23, 77]] },
    { code: 'DT', fill: '#d9c2e6', poly: [[0, 4], [50, 4], [50, 15], [85, 15], [71, 29], [40, 29], [40, 13], [0, 13]] }
  ];

  function el(svg, name, attrs, text) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    svg.appendChild(n);
    return n;
  }

  function centroid(points) {
    let ax = 0, ay = 0, ar = 0;
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
      const c = x0 * y1 - x1 * y0;
      ar += c; ax += (x0 + x1) * c; ay += (y0 + y1) * c;
    }
    return [ax / (3 * ar), ay / (3 * ar)];
  }

  function outward(P, Q) {
    const dx = Q[0] - P[0], dy = Q[1] - P[1], L = Math.hypot(dx, dy);
    let nx = -dy / L, ny = dx / L;
    const mx = (P[0] + Q[0]) / 2 - G[0], my = (P[1] + Q[1]) / 2 - G[1];
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    return [nx, ny];
  }

  function render(svg, sample) {
    el(svg, 'rect', { x: 0, y: 0, width: 600, height: 540, fill: '#ffffff' });
    el(svg, 'text', { x: 300, y: 28, 'text-anchor': 'middle', 'font-family': 'sans-serif',
      'font-size': 17, 'font-weight': 'bold', fill: '#222' }, 'Duval Triangle 1');

    // zones
    for (const z of ZONES) {
      const pts = z.poly.map(p => pt(p[0], p[1]));
      el(svg, 'polygon', { points: pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' '),
        fill: z.fill, stroke: '#333', 'stroke-width': 1, 'stroke-linejoin': 'round' });
      z.pts = pts;
    }
    // labels
    for (const z of ZONES) {
      if (z.code === 'PD') {
        const tip = pt(0.7, 0.7);
        el(svg, 'line', { x1: tip[0], y1: tip[1], x2: tip[0] + 40, y2: tip[1] - 6, stroke: '#333', 'stroke-width': 0.8 });
        el(svg, 'text', { x: tip[0] + 44, y: tip[1] - 2, 'font-family': 'sans-serif', 'font-size': 13,
          'font-weight': 'bold', fill: '#222' }, 'PD');
        continue;
      }
      let c = centroid(z.pts);
      if (z.code === 'T1') c = pt(10, 2.2);
      if (z.code === 'T2') c = pt(35, 2);
      if (z.code === 'DT') c = pt(30, 8.5);
      const small = z.code === 'T1' || z.code === 'T2';
      el(svg, 'text', { x: c[0], y: c[1], 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': 'sans-serif', 'font-size': small ? 11 : 15, 'font-weight': 'bold', fill: '#222' }, z.code);
    }

    // outline
    el(svg, 'polygon', { points: [A, B, C].map(p => p.join(',')).join(' '), fill: 'none',
      stroke: '#000', 'stroke-width': 1.8, 'stroke-linejoin': 'round' });

    // axes: [from, to, gas] where value increases from 'from' to 'to'
    const axes = [
      { P: C, Q: A, gas: '% CH4' },     // left side, CH4 0 at C2H2 corner, 100 at top
      { P: A, Q: B, gas: '% C2H4' },    // right side, C2H4 0 at top, 100 at bottom right
      { P: B, Q: C, gas: '% C2H2' }     // bottom, C2H2 0 at bottom right, 100 at bottom left
    ];
    for (const ax of axes) {
      const n = outward(ax.P, ax.Q);
      for (let v = 0; v <= 100; v += 10) {
        const x = ax.P[0] + (ax.Q[0] - ax.P[0]) * v / 100;
        const y = ax.P[1] + (ax.Q[1] - ax.P[1]) * v / 100;
        el(svg, 'line', { x1: x, y1: y, x2: x + n[0] * 7, y2: y + n[1] * 7, stroke: '#000', 'stroke-width': 1 });
        el(svg, 'text', { x: x + n[0] * 18, y: y + n[1] * 18, 'text-anchor': 'middle',
          'dominant-baseline': 'central', 'font-family': 'sans-serif', 'font-size': 10, fill: '#333' }, String(v));
      }
      const mx = (ax.P[0] + ax.Q[0]) / 2 + n[0] * 42, my = (ax.P[1] + ax.Q[1]) / 2 + n[1] * 42;
      let ang = Math.atan2(ax.Q[1] - ax.P[1], ax.Q[0] - ax.P[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      const arrow = (ax.Q[0] - ax.P[0]) >= 0 ? ' →' : '← ';
      const label = (ax.Q[0] - ax.P[0]) >= 0 ? ax.gas + arrow : arrow + ax.gas;
      el(svg, 'text', { x: mx, y: my, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        transform: 'rotate(' + ang.toFixed(2) + ' ' + mx.toFixed(2) + ' ' + my.toFixed(2) + ')',
        'font-family': 'sans-serif', 'font-size': 13, 'font-weight': 'bold', fill: '#000' }, label);
    }
    // corner names
    el(svg, 'text', { x: A[0], y: A[1] - 12, 'text-anchor': 'middle', 'font-family': 'sans-serif',
      'font-size': 12, fill: '#000' }, 'CH4');
    el(svg, 'text', { x: B[0] + 10, y: B[1] + 18, 'text-anchor': 'start', 'font-family': 'sans-serif',
      'font-size': 12, fill: '#000' }, 'C2H4');
    el(svg, 'text', { x: C[0] - 10, y: C[1] + 18, 'text-anchor': 'end', 'font-family': 'sans-serif',
      'font-size': 12, fill: '#000' }, 'C2H2');

    // sample
    if (sample && (sample.ch4 + sample.c2h4 + sample.c2h2) > 0) {
      const p = norm(+sample.ch4 || 0, +sample.c2h4 || 0, +sample.c2h2 || 0);
      const q = pt(p.c2h4, p.c2h2);
      const code = classify(sample.ch4, sample.c2h4, sample.c2h2);
      el(svg, 'circle', { cx: q[0], cy: q[1], r: 6, fill: '#d00', stroke: '#fff', 'stroke-width': 1.5 });
      el(svg, 'circle', { cx: q[0], cy: q[1], r: 9, fill: 'none', stroke: '#d00', 'stroke-width': 1 });
      el(svg, 'text', { x: 300, y: 522, 'text-anchor': 'middle', 'font-family': 'sans-serif', 'font-size': 12, fill: '#222' },
        'Sample: CH4 ' + p.ch4.toFixed(1) + ' %, C2H4 ' + p.c2h4.toFixed(1) + ' %, C2H2 ' + p.c2h2.toFixed(1) + ' %  → ' + code);
    }
  }

  return { classify: classify, render: render };
})();
