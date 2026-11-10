const DuvalTriangle5 = (function () {
  // Zones in (C2H4 %, C2H6 %) space; CH4 = 100 - C2H4 - C2H6.
  const ZONES = [
    { code: 'PD', color: '#c7b8f5', poly: [[0, 2], [1, 2], [1, 14], [0, 14]] },
    { code: 'S', color: '#a8d8f0', poly: [[0, 0], [10, 0], [10, 54], [0, 54], [0, 14], [1, 14], [1, 2], [0, 2]] },
    { code: 'O', color: '#cfe8b0', poly: [[0, 54], [10, 54], [10, 90], [0, 100]] },
    { code: 'T2', color: '#ffd28a', poly: [[10, 0], [35, 0], [35, 12], [10, 12]] },
    { code: 'T3', color: '#f59a8a', poly: [[35, 0], [100, 0], [70, 30], [70, 12], [35, 12]] },
    { code: 'C', color: '#d9b38c', poly: [[10, 12], [70, 12], [70, 30], [10, 90]] }
  ];

  function pct(ch4, c2h4, c2h6) {
    const s = ch4 + c2h4 + c2h6;
    return { a: 100 * ch4 / s, b: 100 * c2h4 / s, c: 100 * c2h6 / s };
  }

  function classify(ch4, c2h4, c2h6) {
    const p = pct(ch4, c2h4, c2h6);
    const b = p.b, c = p.c;
    if (b < 10) {
      if (b < 1 && c >= 2 && c < 14) return 'PD';
      if (c >= 54) return 'O';
      return 'S';
    }
    if (b < 35) return c < 12 ? 'T2' : 'C';
    if (b >= 70) return 'T3';
    return c < 12 ? 'T3' : 'C';
  }

  const TOP = [300, 60], BL = [70, 458], BR = [530, 458];
  function xy(b, c) {
    const a = 100 - b - c;
    return [
      (a * TOP[0] + b * BR[0] + c * BL[0]) / 100,
      (a * TOP[1] + b * BR[1] + c * BL[1]) / 100
    ];
  }

  function render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    function el(name, attrs, text) {
      const e = document.createElementNS(NS, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      svg.appendChild(e);
      return e;
    }
    function pts(list) { return list.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' '); }

    el('rect', { x: 0, y: 0, width: 600, height: 540, fill: '#ffffff' });
    el('text', { x: 300, y: 28, 'text-anchor': 'middle', 'font-family': 'sans-serif', 'font-size': 18, 'font-weight': 'bold', fill: '#222' }, 'Duval Triangle 5');

    ZONES.forEach(function (z) {
      el('polygon', { points: pts(z.poly.map(function (p) { return xy(p[0], p[1]); })), fill: z.color, stroke: '#333', 'stroke-width': 1 });
    });
    el('polygon', { points: pts([TOP, BR, BL]), fill: 'none', stroke: '#000', 'stroke-width': 2 });

    // Zone labels
    const labelPos = { S: [5, 30], O: [4, 72], T2: [22, 6], T3: [62, 5], C: [32, 35] };
    Object.keys(labelPos).forEach(function (k) {
      const p = xy(labelPos[k][0], labelPos[k][1]);
      el('text', { x: p[0], y: p[1] + 5, 'text-anchor': 'middle', 'font-family': 'sans-serif', 'font-size': 15, 'font-weight': 'bold', fill: '#111' }, k);
    });
    const pd = xy(0.5, 8);
    el('line', { x1: pd[0], y1: pd[1], x2: pd[0] - 40, y2: pd[1] - 18, stroke: '#111', 'stroke-width': 1 });
    el('text', { x: pd[0] - 44, y: pd[1] - 20, 'text-anchor': 'end', 'font-family': 'sans-serif', 'font-size': 13, 'font-weight': 'bold', fill: '#111' }, 'PD');

    // Axes ticks: CH4 on left edge, C2H4 on right edge, C2H6 on bottom edge
    for (let v = 0; v <= 100; v += 10) {
      // CH4 left edge: b = 0, c = 100 - v
      let p = xy(0, 100 - v);
      el('line', { x1: p[0], y1: p[1], x2: p[0] - 7, y2: p[1] - 4, stroke: '#000' });
      el('text', { x: p[0] - 10, y: p[1] + 0, 'text-anchor': 'end', 'font-family': 'sans-serif', 'font-size': 10, fill: '#333' }, String(v));
      // C2H4 right edge: c = 0, b = v
      p = xy(v, 0);
      el('line', { x1: p[0], y1: p[1], x2: p[0] + 7, y2: p[1] - 4, stroke: '#000' });
      el('text', { x: p[0] + 10, y: p[1] + 0, 'text-anchor': 'start', 'font-family': 'sans-serif', 'font-size': 10, fill: '#333' }, String(v));
      // C2H6 bottom edge: a = 0, c = v, b = 100 - v
      p = xy(100 - v, v);
      el('line', { x1: p[0], y1: p[1], x2: p[0], y2: p[1] + 7, stroke: '#000' });
      el('text', { x: p[0], y: p[1] + 19, 'text-anchor': 'middle', 'font-family': 'sans-serif', 'font-size': 10, fill: '#333' }, String(v));
    }
    el('text', { x: 135, y: 240, 'text-anchor': 'middle', 'font-family': 'sans-serif', 'font-size': 14, fill: '#000', transform: 'rotate(-60 135 240)' }, '% CH4');
    el('text', { x: 465, y: 240, 'text-anchor': 'middle', 'font-family': 'sans-serif', 'font-size': 14, fill: '#000', transform: 'rotate(60 465 240)' }, '% C2H4');
    el('text', { x: 300, y: 505, 'text-anchor': 'middle', 'font-family': 'sans-serif', 'font-size': 14, fill: '#000' }, '% C2H6');

    if (sample) {
      const s = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (s > 0) {
        const q = pct(sample.ch4, sample.c2h4, sample.c2h6);
        const p = xy(q.b, q.c);
        el('circle', { cx: p[0], cy: p[1], r: 5, fill: '#e00000', stroke: '#000', 'stroke-width': 1.5 });
        el('text', { x: 300, y: 528, 'text-anchor': 'middle', 'font-family': 'sans-serif', 'font-size': 12, fill: '#000' },
          'Sample: ' + classify(sample.ch4, sample.c2h4, sample.c2h6) +
          ' (CH4 ' + q.a.toFixed(1) + '%, C2H4 ' + q.b.toFixed(1) + '%, C2H6 ' + q.c.toFixed(1) + '%)');
      }
    }
  }

  return { classify: classify, render: render };
})();
