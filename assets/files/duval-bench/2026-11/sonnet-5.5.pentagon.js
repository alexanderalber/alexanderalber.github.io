const DuvalPentagon = (function () {
  const R = 40;
  // axis order (clockwise from top): H2, C2H6, CH4, C2H4, C2H2
  const NAMES = ['H2', 'C2H6', 'CH4', 'C2H4', 'C2H2'];
  const ANG = [90, 18, -54, -126, 162].map(a => a * Math.PI / 180);
  const DIR = ANG.map(a => [Math.cos(a), Math.sin(a)]);
  const V = DIR.map(d => [R * d[0], R * d[1]]);

  // zones in pentagon units (radius 40), drawn/tested in this order
  const ZONES = [
    { c: 'PD', col: '#c9b7e8', p: [[0, 33], [-1.5, 33], [-1.5, 1.5], [0, 1.5]] },
    { c: 'S', col: '#bfe3f2', p: [[0, 40], [38.04, 12.36], [24, 1.5], [0, 1.5]] },
    { c: 'D1', col: '#f6c9a0', p: [[0, 40], [-38.04, 12.36], [-20, -2], [0, 1.5]] },
    { c: 'D2', col: '#f2a0a0', p: [[-38.04, 12.36], [-23.51, -32.36], [-10, -14], [-20, -2]] },
    { c: 'T3-H', col: '#e07a6a', p: [[-23.51, -32.36], [23.51, -32.36], [6, -14], [-10, -14]] },
    { c: 'T2-C', col: '#f3df8a', p: [[23.51, -32.36], [6, -14], [12, -6], [30, -10]] },
    { c: 'O', col: '#cfe8b8', p: [[38.04, 12.36], [24, 1.5], [12, -6], [30, -10]] },
    { c: 'T1-C', col: '#f7efb5', p: [[0, 1.5], [24, 1.5], [12, -6], [6, -14], [-10, -14], [-20, -2]] }
  ];

  function pip(pt, poly) {
    let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) &&
          pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins;
    }
    return ins;
  }

  function point(h2, ch4, c2h6, c2h4, c2h2) {
    const g = { H2: h2, C2H6: c2h6, CH4: ch4, C2H4: c2h4, C2H2: c2h2 };
    const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    let x = 0, y = 0;
    NAMES.forEach((n, i) => {
      const r = R * g[n] / sum;
      x += r * DIR[i][0];
      y += r * DIR[i][1];
    });
    return [x, y];
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    const pt = point(h2, ch4, c2h6, c2h4, c2h2);
    for (const z of ZONES) if (pip(pt, z.p)) return z.c;
    return 'T1-C';
  }

  function el(svg, tag, attrs, text) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    svg.appendChild(e);
    return e;
  }

  function render(svg, sample) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const S = 6.5, CX = 300, CY = 315;
    const tx = p => [CX + p[0] * S, CY - p[1] * S];
    const str = poly => poly.map(p => tx(p).join(',')).join(' ');

    el(svg, 'rect', { x: 0, y: 0, width: 600, height: 600, fill: '#ffffff' });
    el(svg, 'polygon', { points: str(V), fill: '#f4f4f4', stroke: 'none' });
    ZONES.forEach(z => {
      el(svg, 'polygon', { points: str(z.p), fill: z.col, stroke: '#555', 'stroke-width': 1 });
    });
    el(svg, 'polygon', { points: str(V), fill: 'none', stroke: '#000', 'stroke-width': 2 });

    ZONES.forEach(z => {
      let cx = 0, cy = 0;
      z.p.forEach(p => { cx += p[0]; cy += p[1]; });
      const c = tx([cx / z.p.length, cy / z.p.length]);
      if (z.c === 'PD') return;
      el(svg, 'text', { x: c[0], y: c[1], 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': 16, 'font-family': 'sans-serif', 'font-weight': 'bold', fill: '#222' }, z.c);
    });
    const pdc = tx([-0.75, 34.5]);
    el(svg, 'text', { x: pdc[0] - 10, y: pdc[1], 'text-anchor': 'end', 'font-size': 14,
      'font-family': 'sans-serif', 'font-weight': 'bold', fill: '#222' }, 'PD');

    // axes from center to vertices with tick marks every 20%
    const O = [0, 0];
    NAMES.forEach((n, i) => {
      const a = tx(O), b = tx(V[i]);
      el(svg, 'line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#777',
        'stroke-width': 1, 'stroke-dasharray': '4 3' });
      const l = tx([DIR[i][0] * (R + 4.5), DIR[i][1] * (R + 4.5)]);
      el(svg, 'text', { x: l[0], y: l[1], 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': 18, 'font-family': 'sans-serif', 'font-weight': 'bold', fill: '#000' },
        n === 'H2' ? 'H2' : n === 'C2H6' ? 'C2H6' : n === 'CH4' ? 'CH4' : n === 'C2H4' ? 'C2H4' : 'C2H2');
      for (let t = 20; t <= 100; t += 20) {
        const q = tx([DIR[i][0] * R * t / 100, DIR[i][1] * R * t / 100]);
        el(svg, 'circle', { cx: q[0], cy: q[1], r: 2, fill: '#444' });
      }
    });

    if (sample) {
      const p = tx(point(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2));
      el(svg, 'circle', { cx: p[0], cy: p[1], r: 7, fill: '#d00000', stroke: '#fff', 'stroke-width': 2 });
      el(svg, 'circle', { cx: p[0], cy: p[1], r: 11, fill: 'none', stroke: '#000', 'stroke-width': 1.5 });
    }
  }

  return { classify, render };
})();
