// Duval Triangle 1 (mineral oil, IEC 60599 / M. Duval), written from memory.
// Coordinates are relative percentages of CH4, C2H4, C2H2 (sum = 100).
const DuvalTriangle = (function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  // Geometry: CH4 apex on top, C2H4 bottom right, C2H2 bottom left.
  const TOP = { x: 300, y: 89 };
  const RIGHT = { x: 520, y: 470 };
  const LEFT = { x: 80, y: 470 };

  // Zone polygons as [CH4, C2H4, C2H2] percentage vertices.
  const ZONES = [
    { code: 'PD', name: 'Partial discharge', fill: '#b9e3f5',
      pts: [[100, 0, 0], [98, 2, 0], [98, 0, 2]] },
    { code: 'T1', name: 'Thermal fault < 300 °C', fill: '#ffe9a8',
      pts: [[98, 2, 0], [80, 20, 0], [76, 20, 4], [96, 0, 4], [98, 0, 2]],
      label: [87, 11, 2], small: true },
    { code: 'T2', name: 'Thermal fault 300 to 700 °C', fill: '#ffc670',
      pts: [[80, 20, 0], [50, 50, 0], [46, 50, 4], [76, 20, 4]],
      label: [63, 35, 2], small: true },
    { code: 'T3', name: 'Thermal fault > 700 °C', fill: '#f08a6b',
      pts: [[50, 50, 0], [0, 100, 0], [0, 85, 15], [35, 50, 15]],
      label: [19, 74, 7] },
    { code: 'DT', name: 'Mix of thermal and electrical faults', fill: '#d9c2ea',
      pts: [[96, 0, 4], [76, 20, 4], [46, 50, 4], [35, 50, 15], [0, 85, 15],
            [0, 71, 29], [31, 40, 29], [47, 40, 13], [87, 0, 13]],
      label: [24, 54, 22] },
    { code: 'D1', name: 'Discharges of low energy', fill: '#a9d8c3',
      pts: [[87, 0, 13], [0, 0, 100], [0, 23, 77], [64, 23, 13]],
      label: [34, 11, 55] },
    { code: 'D2', name: 'Discharges of high energy', fill: '#8fb5e6',
      pts: [[64, 23, 13], [0, 23, 77], [0, 71, 29], [31, 40, 29], [47, 40, 13]],
      label: [20, 42, 38] }
  ];

  function toXY(ch4, c2h4, c2h2) {
    const s = ch4 + c2h4 + c2h2;
    return {
      x: (ch4 * TOP.x + c2h4 * RIGHT.x + c2h2 * LEFT.x) / s,
      y: (ch4 * TOP.y + c2h4 * RIGHT.y + c2h2 * LEFT.y) / s
    };
  }

  function percentages(ch4, c2h4, c2h2) {
    const a = Math.max(0, Number(ch4) || 0);
    const b = Math.max(0, Number(c2h4) || 0);
    const c = Math.max(0, Number(c2h2) || 0);
    const s = a + b + c;
    if (!(s > 0) || !isFinite(s)) return null;
    return { ch4: 100 * a / s, c2h4: 100 * b / s, c2h2: 100 * c / s };
  }

  function classify(ch4, c2h4, c2h2) {
    const p = percentages(ch4, c2h4, c2h2);
    if (!p) return '';
    const m = p.ch4, e = p.c2h4, a = p.c2h2;
    if (m >= 98) return 'PD';
    if (a < 4) {
      if (e < 20) return 'T1';
      if (e < 50) return 'T2';
      return 'T3';
    }
    if (e >= 50 && a < 15) return 'T3';
    if (a >= 13 && e < 23) return 'D1';
    if ((a >= 13 && e < 40) || a >= 29) return 'D2';
    return 'DT';
  }

  function el(parent, tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    if (attrs) {
      for (const k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
      }
    }
    if (text != null) n.textContent = text;
    parent.appendChild(n);
    return n;
  }

  function f(v) { return (Math.round(v * 100) / 100).toString(); }

  function render(svg, sample) {
    const FONT = 'Arial, Helvetica, sans-serif';
    const g = el(svg, 'g', { 'font-family': FONT });

    el(g, 'text', { x: 16, y: 26, 'font-size': 16, 'font-weight': 'bold', fill: '#111' },
      'Duval Triangle 1');

    // Zones
    const zg = el(g, 'g', { stroke: '#333', 'stroke-width': 1, 'stroke-linejoin': 'round' });
    ZONES.forEach(function (z) {
      const pts = z.pts.map(function (p) {
        const q = toXY(p[0], p[1], p[2]);
        return f(q.x) + ',' + f(q.y);
      }).join(' ');
      const poly = el(zg, 'polygon', { points: pts, fill: z.fill });
      el(poly, 'title', null, z.code + ': ' + z.name);
    });

    // Light grid every 20 %
    const gg = el(g, 'g', { stroke: '#000', 'stroke-opacity': 0.12, 'stroke-width': 0.6 });
    for (let v = 20; v < 100; v += 20) {
      let a = toXY(v, 0, 100 - v), b = toXY(v, 100 - v, 0);
      el(gg, 'line', { x1: f(a.x), y1: f(a.y), x2: f(b.x), y2: f(b.y) });
      a = toXY(100 - v, v, 0); b = toXY(0, v, 100 - v);
      el(gg, 'line', { x1: f(a.x), y1: f(a.y), x2: f(b.x), y2: f(b.y) });
      a = toXY(0, 100 - v, v); b = toXY(100 - v, 0, v);
      el(gg, 'line', { x1: f(a.x), y1: f(a.y), x2: f(b.x), y2: f(b.y) });
    }

    // Outline
    el(g, 'polygon', {
      points: [TOP, RIGHT, LEFT].map(function (p) { return p.x + ',' + p.y; }).join(' '),
      fill: 'none', stroke: '#111', 'stroke-width': 1.6, 'stroke-linejoin': 'round'
    });

    // Zone labels
    const lg = el(g, 'g', { fill: '#111', 'font-weight': 'bold', 'text-anchor': 'middle' });
    ZONES.forEach(function (z) {
      if (!z.label) return;
      const q = toXY(z.label[0], z.label[1], z.label[2]);
      el(lg, 'text', { x: f(q.x), y: f(q.y + (z.small ? 3.5 : 5)), 'font-size': z.small ? 10 : 15 },
        z.code);
    });
    // PD is tiny: label outside with a leader line
    const pd = toXY(99.2, 0.4, 0.4);
    el(g, 'line', { x1: f(pd.x), y1: f(pd.y), x2: 268, y2: 74, stroke: '#111', 'stroke-width': 0.8 });
    el(g, 'circle', { cx: f(pd.x), cy: f(pd.y), r: 1.3, fill: '#111' });
    el(lg, 'text', { x: 256, y: 76, 'font-size': 13 }, 'PD');

    // Axes: ticks every 10 %, numbers every 20 %
    const tg = el(g, 'g', { stroke: '#111', 'stroke-width': 1 });
    const ng = el(g, 'g', { fill: '#111', 'font-size': 11, 'text-anchor': 'middle' });
    const S3 = Math.sqrt(3) / 2;
    const axes = [
      // CH4 on the left side, rising towards the apex; ticks follow the CH4 grid lines
      { pos: function (v) { return toXY(v, 0, 100 - v); }, dx: -1, dy: 0 },
      // C2H4 on the right side, rising towards the bottom right corner
      { pos: function (v) { return toXY(100 - v, v, 0); }, dx: 0.5, dy: -S3 },
      // C2H2 on the base, rising towards the bottom left corner
      { pos: function (v) { return toXY(0, 100 - v, v); }, dx: 0.5, dy: S3 }
    ];
    axes.forEach(function (ax) {
      for (let v = 0; v <= 100; v += 10) {
        const major = v % 20 === 0;
        const p = ax.pos(v);
        const len = major ? 8 : 5;
        el(tg, 'line', {
          x1: f(p.x), y1: f(p.y), x2: f(p.x + ax.dx * len), y2: f(p.y + ax.dy * len)
        });
        if (major) {
          el(ng, 'text', { x: f(p.x + ax.dx * 19), y: f(p.y + ax.dy * 19 + 4) }, String(v));
        }
      }
    });

    // Axis titles
    const ag = el(g, 'g', { fill: '#111', 'font-size': 14, 'font-weight': 'bold', 'text-anchor': 'middle' });
    el(ag, 'text', { transform: 'translate(140,250) rotate(-60)' }, '% CH₄  →');
    el(ag, 'text', { transform: 'translate(462,250) rotate(60)' }, '% C₂H₄  →');
    el(ag, 'text', { x: 300, y: 524 }, '←  % C₂H₂');

    // Corner gas names
    const cg = el(g, 'g', { fill: '#444', 'font-size': 12, 'text-anchor': 'middle' });
    el(cg, 'text', { x: 300, y: 62 }, 'CH₄ (methane)');
    el(cg, 'text', { x: 545, y: 505 }, 'C₂H₄ (ethylene)');
    el(cg, 'text', { x: 58, y: 505 }, 'C₂H₂ (acetylene)');

    // Sample
    if (sample) {
      const p = percentages(sample.ch4, sample.c2h4, sample.c2h2);
      if (p) {
        const q = toXY(p.ch4, p.c2h4, p.c2h2);
        const code = classify(sample.ch4, sample.c2h4, sample.c2h2);
        const sg = el(g, 'g', null);
        // projection lines to the three axes
        const proj = [toXY(p.ch4, 0, 100 - p.ch4), toXY(100 - p.c2h4, p.c2h4, 0), toXY(0, 100 - p.c2h2, p.c2h2)];
        proj.forEach(function (r) {
          el(sg, 'line', {
            x1: f(q.x), y1: f(q.y), x2: f(r.x), y2: f(r.y),
            stroke: '#c00000', 'stroke-width': 1, 'stroke-dasharray': '4 3'
          });
        });
        el(sg, 'circle', { cx: f(q.x), cy: f(q.y), r: 6, fill: '#e00000', stroke: '#fff', 'stroke-width': 2 });
        el(sg, 'circle', { cx: f(q.x), cy: f(q.y), r: 7, fill: 'none', stroke: '#600', 'stroke-width': 1 });
        const info = el(g, 'g', { fill: '#111', 'font-size': 12 });
        el(info, 'text', { x: 16, y: 48, 'font-weight': 'bold', fill: '#c00000' }, 'Sample: ' + code);
        el(info, 'text', { x: 16, y: 64 }, 'CH₄ ' + p.ch4.toFixed(1) + ' %');
        el(info, 'text', { x: 16, y: 79 }, 'C₂H₄ ' + p.c2h4.toFixed(1) + ' %');
        el(info, 'text', { x: 16, y: 94 }, 'C₂H₂ ' + p.c2h2.toFixed(1) + ' %');
      }
    }
  }

  return { classify: classify, render: render };
})();
