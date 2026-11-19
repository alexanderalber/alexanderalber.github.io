const DuvalPentagon = (() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const GASES = ['H2', 'CH4', 'C2H6', 'C2H4', 'C2H2'];

  // Normalized regular pentagon, y up, H2 at the top.
  const V = [
    [0, 1],                                          // H2
    [0.9510565162951535, 0.30901699437494745],       // CH4
    [0.5877852522924731, -0.8090169943749473],       // C2H6
    [-0.5877852522924731, -0.8090169943749473],      // C2H4
    [-0.9510565162951535, 0.30901699437494745]       // C2H2
  ];

  const VERTEX_ZONE = ['PD', 'T1', 'T2', 'T3', 'D2'];

  const COLOR = {
    PD: '#a9d6ff', T1: '#fff0a6', T2: '#ffc46b', T3: '#ff8a70',
    D1: '#b8e6a7', D2: '#ff7b7b', DT: '#d8d8d8'
  };

  const NAME = {
    PD: 'Partial discharges',
    T1: 'Thermal fault < 300 C',
    T2: 'Thermal fault 300-700 C',
    T3: 'Thermal fault > 700 C',
    D1: 'Low-energy discharges',
    D2: 'High-energy discharges',
    DT: 'Combined thermal and electrical'
  };

  // Boundary split points on the pentagon edges, clockwise.
  // Edge e goes from V[e] to V[(e+1)%5]; t is the fraction from V[e].
  const MDEF = [
    { e: 4, t: 0.87 },  // M0 on C2H2-H2, near H2: about C2H2 13%
    { e: 0, t: 0.30 },  // M1 on H2-CH4
    { e: 1, t: 0.55 },  // M2 on CH4-C2H6
    { e: 2, t: 0.50 },  // M3 on C2H6-C2H4
    { e: 3, t: 0.50 },  // M4 on C2H4-C2H2
    { e: 4, t: 0.71 }   // M5 on C2H2-H2, near C2H2: about C2H2 29%
  ];
  const ARC_CODE = ['PD', 'T1', 'T2', 'T3', 'D2', 'D1'];

  function lerp(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function bpoint(m) {
    return lerp(V[m.e], V[(m.e + 1) % 5], m.t);
  }

  function norm(p) {
    const l = Math.hypot(p[0], p[1]) || 1;
    return [p[0] / l, p[1] / l];
  }

  function outerPath(a, b) {
    const pa = bpoint(a), pb = bpoint(b);
    if (a.e === b.e) return [pa, pb];
    const pts = [pa];
    let k = a.e;
    while (k !== b.e) {
      k = (k + 1) % 5;
      pts.push(V[k]);
    }
    pts.push(pb);
    return pts;
  }

  function centroid(poly) {
    let x = 0, y = 0;
    for (const p of poly) { x += p[0]; y += p[1]; }
    return [x / poly.length, y / poly.length];
  }

  let zones = null;
  function getZones() {
    if (zones) return zones;
    const inner = MDEF.map(m => {
      const n = norm(bpoint(m));
      return [n[0] * 0.30, n[1] * 0.30];
    });
    zones = [];
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const poly = outerPath(MDEF[i], MDEF[j]).concat([inner[j], inner[i]]);
      const code = ARC_CODE[i];
      zones.push({ code, color: COLOR[code], polygon: poly, centroid: centroid(poly) });
    }
    zones.push({ code: 'DT', color: COLOR.DT, polygon: inner.slice(), centroid: centroid(inner) });
    return zones;
  }

  function pct(vals) {
    const n = vals.map(v => {
      const x = Number(v);
      return isFinite(x) && x > 0 ? x : 0;
    });
    const s = n.reduce((a, b) => a + b, 0);
    if (!isFinite(s) || s <= 0) return null;
    return n.map(v => v / s);
  }

  function point(p) {
    let x = 0, y = 0;
    for (let i = 0; i < 5; i++) {
      x += p[i] * V[i][0];
      y += p[i] * V[i][1];
    }
    return [x, y];
  }

  function onSeg(px, py, ax, ay, bx, by) {
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (Math.abs(cross) > 1e-9) return false;
    const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
    if (dot < -1e-9) return false;
    const len = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
    return dot <= len + 1e-9;
  }

  function inside(poly, x, y) {
    let insideFlag = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      if (onSeg(x, y, xi, yi, xj, yj)) return true;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        insideFlag = !insideFlag;
      }
    }
    return insideFlag;
  }

  function classifyImpl(vals) {
    const p = pct(vals);
    if (!p) return 'DT';
    let max = 0;
    for (let i = 1; i < 5; i++) if (p[i] > p[max]) max = i;
    if (p[max] > 0.999999) return VERTEX_ZONE[max];
    const pt = point(p);
    for (const z of getZones()) {
      if (inside(z.polygon, pt[0], pt[1])) return z.code;
    }
    return 'DT';
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function text(parent, x, y, str, attrs) {
    const a = { x: x, y: y, 'text-anchor': 'middle', 'dominant-baseline': 'middle' };
    if (attrs) for (const k in attrs) a[k] = attrs[k];
    const t = el('text', a, parent);
    t.textContent = str;
    return t;
  }

  return {
    classify(h2, ch4, c2h6, c2h4, c2h2) {
      return classifyImpl([h2, ch4, c2h6, c2h4, c2h2]);
    },

    render(svg, sample) {
      const C = 300, R = 250;
      const X = p => C + p[0] * R;
      const Y = p => C - p[1] * R;

      el('rect', { x: 0, y: 0, width: 600, height: 600, fill: '#ffffff' }, svg);

      for (const z of getZones()) {
        const pts = z.polygon.map(p => X(p).toFixed(2) + ',' + Y(p).toFixed(2)).join(' ');
        const pe = el('polygon', {
          points: pts,
          fill: z.color,
          stroke: '#666666',
          'stroke-width': 1,
          opacity: 0.88
        }, svg);
        const ti = el('title', {}, pe);
        ti.textContent = z.code + ' - ' + NAME[z.code];

        const c = z.centroid;
        text(svg, X(c), Y(c), z.code, {
          'font-size': z.code === 'DT' ? 18 : 20,
          'font-weight': 'bold',
          fill: '#202020'
        });
      }

      const outer = V.map(p => X(p).toFixed(2) + ',' + Y(p).toFixed(2)).join(' ');
      el('polygon', { points: outer, fill: 'none', stroke: '#111111', 'stroke-width': 2.5 }, svg);

      for (let i = 0; i < 5; i++) {
        el('line', {
          x1: C, y1: C,
          x2: X(V[i]), y2: Y(V[i]),
          stroke: '#999999',
          'stroke-width': 1.2,
          'stroke-dasharray': '4 3'
        }, svg);

        const n = norm(V[i]);
        const lr = R + 26;
        text(svg, C + n[0] * lr, C - n[1] * lr, GASES[i], {
          'font-size': 16,
          'font-weight': 'bold',
          fill: '#111111'
        });
      }

      if (sample) {
        const vals = [sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2];
        const p = pct(vals);
        if (p) {
          const pt = point(p);
          const cx = X(pt), cy = Y(pt);
          const code = classifyImpl(vals);
          el('circle', {
            cx: cx, cy: cy, r: 7,
            fill: '#e040fb',
            stroke: '#000000',
            'stroke-width': 1.5
          }, svg);
          text(svg, clamp(cx, 40, 560), clamp(cy - 14, 18, 580), code, {
            'font-size': 14,
            'font-weight': 'bold',
            fill: '#000000'
          });
        }
      }
    }
  };
})();
