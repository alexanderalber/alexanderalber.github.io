// Duval Pentagon 1 (mineral oil), written from memory.
// Axes: H2 (top), C2H6, CH4, C2H4, C2H2, counterclockwise, 72 degrees apart.
// Each gas's relative percentage is placed on its axis; the plotted point is
// the area centroid of the irregular pentagon formed by the five points.
const DuvalPentagon = (function () {
  const GASES = ['h2', 'c2h6', 'ch4', 'c2h4', 'c2h2'];
  const NAMES = { h2: 'H2', c2h6: 'C2H6', ch4: 'CH4', c2h4: 'C2H4', c2h2: 'C2H2' };
  const ANGLES = { h2: 90, c2h6: 162, ch4: 234, c2h4: 306, c2h2: 18 };

  const ZONES = [
    { code: 'PD', color: '#f9c74f', label: [3.2, 28.75],
      poly: [[0, 33], [-1, 33], [-1, 24.5], [0, 24.5]] },
    { code: 'D1', color: '#90caf9', label: [15, 14],
      poly: [[0, 40], [38, 12.4], [32, -6.1], [4, 16], [0, 1.5]] },
    { code: 'D2', color: '#5c9be0', label: [15, -10],
      poly: [[4, 16], [32, -6.1], [24.3, -30], [0, -3], [0, 1.5]] },
    { code: 'T3', color: '#e57373', label: [11, -25],
      poly: [[0, -3], [24.3, -30], [23.5, -32.4], [1, -32.4], [-6, -4]] },
    { code: 'T2', color: '#ffb74d', label: [-8, -25],
      poly: [[-6, -4], [1, -32.4], [-22.5, -32.4]] },
    { code: 'T1', color: '#ffe0b2', label: [-20, -12],
      poly: [[-6, -4], [-22.5, -32.4], [-23.5, -32.4], [-35, 3.1], [0, 1.5], [0, -3]] },
    { code: 'S', color: '#a5d6a7', label: [-18, 16],
      poly: [[0, 1.5], [-35, 3.1], [-38, 12.4], [0, 40], [0, 33], [-1, 33], [-1, 24.5], [0, 24.5]] }
  ];

  function unit(g) {
    const a = ANGLES[g] * Math.PI / 180;
    return [Math.cos(a), Math.sin(a)];
  }

  function point(s) {
    const vals = GASES.map(g => Math.max(0, Number(s[g]) || 0));
    const sum = vals.reduce((a, b) => a + b, 0);
    if (!(sum > 0)) return [0, 0];
    const pts = GASES.map((g, i) => {
      const p = 100 * vals[i] / sum, u = unit(g);
      return [p * u[0], p * u[1]];
    });
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < 5; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % 5];
      const c = x0 * y1 - x1 * y0;
      A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    A /= 2;
    if (Math.abs(A) < 1e-9) {
      // Degenerate pentagon (one or two gases only): use the mean of the points.
      let mx = 0, my = 0;
      pts.forEach(p => { mx += p[0]; my += p[1]; });
      return [mx / 5, my / 5];
    }
    return [cx / (6 * A), cy / (6 * A)];
  }

  function inside(pt, poly) {
    const [x, y] = pt;
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
    return Math.sqrt(x * x + y * y);
  }

  function classifyPoint(pt) {
    for (const z of ZONES) if (inside(pt, z.poly)) return z.code;
    // On a boundary or outside: nearest zone.
    let best = null, bd = Infinity;
    for (const z of ZONES) {
      for (let i = 0; i < z.poly.length; i++) {
        const d = segDist(pt, z.poly[i], z.poly[(i + 1) % z.poly.length]);
        if (d < bd) { bd = d; best = z.code; }
      }
    }
    return best;
  }

  const NS = 'http://www.w3.org/2000/svg';
  const C = 300, K = 6;
  const tx = x => C + K * x, ty = y => C - K * y;

  function el(svg, name, attrs, text) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    svg.appendChild(e);
    return e;
  }
  const pts = poly => poly.map(p => tx(p[0]).toFixed(2) + ',' + ty(p[1]).toFixed(2)).join(' ');

  return {
    classify(h2, ch4, c2h6, c2h4, c2h2) {
      return classifyPoint(point({ h2, ch4, c2h6, c2h4, c2h2 }));
    },

    render(svg, sample) {
      el(svg, 'rect', { x: 0, y: 0, width: 600, height: 600, fill: '#ffffff' });
      // Zones, PD last so it sits on top of S.
      const order = ZONES.slice(1).concat([ZONES[0]]);
      for (const z of order) {
        el(svg, 'polygon', { points: pts(z.poly), fill: z.color, stroke: '#333', 'stroke-width': 1 });
      }
      // Outer pentagon outline.
      const outer = GASES.map(g => { const u = unit(g); return [40 * u[0], 40 * u[1]]; });
      el(svg, 'polygon', { points: pts(outer), fill: 'none', stroke: '#000', 'stroke-width': 1.5 });
      // Axes and gas names.
      for (const g of GASES) {
        const u = unit(g);
        el(svg, 'line', { x1: tx(0), y1: ty(0), x2: tx(40 * u[0]), y2: ty(40 * u[1]),
          stroke: '#555', 'stroke-width': 0.8, 'stroke-dasharray': '4 3' });
        el(svg, 'text', { x: tx(44.5 * u[0]), y: ty(44.5 * u[1]) + 5, 'text-anchor': 'middle',
          'font-family': 'sans-serif', 'font-size': 16, 'font-weight': 'bold', fill: '#000' }, NAMES[g]);
      }
      // Zone labels.
      for (const z of ZONES) {
        el(svg, 'text', { x: tx(z.label[0]), y: ty(z.label[1]) + 5, 'text-anchor': 'middle',
          'font-family': 'sans-serif', 'font-size': z.code === 'PD' ? 12 : 18,
          'font-weight': 'bold', fill: '#111' }, z.code);
      }
      el(svg, 'text', { x: 300, y: 590, 'text-anchor': 'middle', 'font-family': 'sans-serif',
        'font-size': 13, fill: '#333' }, 'Duval Pentagon 1');
      if (sample) {
        const p = point(sample);
        const code = classifyPoint(p);
        el(svg, 'circle', { cx: tx(p[0]), cy: ty(p[1]), r: 6, fill: '#000', stroke: '#fff', 'stroke-width': 2 });
        el(svg, 'text', { x: tx(p[0]) + 9, y: ty(p[1]) - 8, 'font-family': 'sans-serif',
          'font-size': 13, 'font-weight': 'bold', fill: '#000' }, code);
      }
    }
  };
})();
