const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const s = ch4 + c2h4 + c2h2;
    const m = 100 * ch4 / s, e = 100 * c2h4 / s, a = 100 * c2h2 / s;
    if (m >= 98) return 'PD';
    if (a < 4) {
      if (e < 20) return 'T1';
      if (e < 50) return 'T2';
      return 'T3';
    }
    if (a >= 13) {
      if (e < 23) return 'D1';
      if (e < 40 || a >= 29) return 'D2';
      if (e >= 50 && a < 15) return 'T3';
      return 'DT';
    }
    if (e >= 50) return 'T3';
    return 'DT';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    const TOP = [300, 64.3], BL = [60, 480], BR = [540, 480];
    // p(e, a): e = %C2H4, a = %C2H2, CH4 = remainder
    const p = (e, a) => {
      const m = 100 - e - a;
      return [(m * TOP[0] + a * BL[0] + e * BR[0]) / 100,
              (m * TOP[1] + a * BL[1] + e * BR[1]) / 100];
    };
    const mk = (name, attrs, parent, text) => {
      const el = document.createElementNS(NS, name);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      if (text !== undefined) el.textContent = text;
      (parent || svg).appendChild(el);
      return el;
    };
    const f = n => n.toFixed(2);
    const poly = pts => pts.map(q => { const c = p(q[0], q[1]); return f(c[0]) + ',' + f(c[1]); }).join(' ');

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    mk('rect', { x: 0, y: 0, width: 600, height: 540, fill: '#ffffff' });

    const zones = [
      ['PD', '#d9b3ff', [[2, 0], [0, 2], [0, 0]], null],
      ['T1', '#ffe599', [[2, 0], [20, 0], [20, 4], [0, 4], [0, 2]], [10, 1.8]],
      ['T2', '#f6b26b', [[20, 0], [50, 0], [50, 4], [20, 4]], [35, 1.8]],
      ['T3', '#e06666', [[50, 0], [100, 0], [85, 15], [50, 15]], [72, 5.5]],
      ['DT', '#b6d7a8', [[0, 4], [50, 4], [50, 15], [85, 15], [71, 29], [40, 29], [40, 13], [23, 13], [0, 13]], [45, 21]],
      ['D1', '#9fc5e8', [[0, 13], [23, 13], [23, 77], [0, 100]], [9, 45]],
      ['D2', '#6d9eeb', [[23, 13], [40, 13], [40, 29], [71, 29], [23, 77]], [36, 40]]
    ];
    for (const z of zones) {
      mk('polygon', { points: poly(z[2]), fill: z[1], stroke: '#333', 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
    }
    for (const z of zones) {
      let x, y;
      if (z[3]) { const c = p(z[3][0], z[3][1]); x = c[0]; y = c[1]; }
      else { x = TOP[0] - 26; y = TOP[1] + 10; }
      mk('text', { x: f(x), y: f(y + 4), 'text-anchor': 'middle', 'font-family': 'sans-serif',
        'font-size': 13, 'font-weight': 'bold', fill: '#111' }, null, z[0]);
    }
    // PD leader
    const pd = p(1, 1);
    mk('line', { x1: f(TOP[0] - 14), y1: f(TOP[1] + 12), x2: f(pd[0] - 1), y2: f(pd[1] + 1), stroke: '#333', 'stroke-width': 0.8 });

    // outline
    mk('polygon', { points: [TOP, BL, BR].map(q => f(q[0]) + ',' + f(q[1])).join(' '),
      fill: 'none', stroke: '#000', 'stroke-width': 2 });

    // ticks and tick labels
    const font = { 'font-family': 'sans-serif', 'font-size': 11, fill: '#222' };
    for (let v = 10; v <= 90; v += 10) {
      // left edge: %CH4 (e=0, a=100-v), tick horizontal to the left
      let c = p(0, 100 - v);
      mk('line', { x1: f(c[0]), y1: f(c[1]), x2: f(c[0] - 8), y2: f(c[1]), stroke: '#000', 'stroke-width': 1.2 });
      mk('text', Object.assign({ x: f(c[0] - 11), y: f(c[1] + 4), 'text-anchor': 'end' }, font), null, String(v));
      // bottom edge: %C2H2 (m=0, a=v at left end decreasing to the right: a = 100 - e)
      c = p(100 - v, v);
      mk('line', { x1: f(c[0]), y1: f(c[1]), x2: f(c[0] + 4), y2: f(c[1] + 7), stroke: '#000', 'stroke-width': 1.2 });
      mk('text', Object.assign({ x: f(c[0] + 6), y: f(c[1] + 19), 'text-anchor': 'middle' }, font), null, String(v));
      // right edge: %C2H4 (a=0, e=v), tick up-right
      c = p(v, 0);
      mk('line', { x1: f(c[0]), y1: f(c[1]), x2: f(c[0] + 4), y2: f(c[1] - 7), stroke: '#000', 'stroke-width': 1.2 });
      mk('text', Object.assign({ x: f(c[0] + 8), y: f(c[1] - 7), 'text-anchor': 'start' }, font), null, String(v));
    }

    // axis titles
    const tf = { 'font-family': 'sans-serif', 'font-size': 14, 'font-weight': 'bold', fill: '#000', 'text-anchor': 'middle' };
    const lm = p(0, 50), bm = p(50, 50), rm = p(50, 0);
    mk('text', Object.assign({ transform: 'translate(' + f(lm[0] - 52) + ',' + f(lm[1]) + ') rotate(-60)' }, tf), null, '% CH4');
    mk('text', Object.assign({ x: f(bm[0]), y: f(bm[1] + 46) }, tf), null, '% C2H2');
    mk('text', Object.assign({ transform: 'translate(' + f(rm[0] + 52) + ',' + f(rm[1] - 6) + ') rotate(60)' }, tf), null, '% C2H4');
    mk('text', Object.assign({ x: 300, y: 28 }, tf, { 'font-size': 16 }), null, 'Duval Triangle 1');

    // sample
    if (sample) {
      const s = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (s > 0) {
        const c = p(100 * sample.c2h4 / s, 100 * sample.c2h2 / s);
        mk('circle', { cx: f(c[0]), cy: f(c[1]), r: 6, fill: '#fff', stroke: '#000', 'stroke-width': 2 });
        mk('circle', { cx: f(c[0]), cy: f(c[1]), r: 2.5, fill: '#000' });
      }
    }
  }
};
