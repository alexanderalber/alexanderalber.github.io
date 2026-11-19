const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) return '';
    const c = ch4 / total * 100;
    const e = c2h4 / total * 100;
    const a = c2h2 / total * 100;
    if (a < 2) {
      if (e < 2) return 'PD';
      if (e < 20) return 'T1';
      if (e < 50) return 'T2';
      return 'T3';
    }
    if (a < 50) {
      if (e < 50) return 'D1';
      return 'DT';
    }
    return 'D2';
  },

  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';
    const V = { CH4: {x: 50, y: 500}, C2H2: {x: 550, y: 500}, C2H4: {x: 300, y: 67} };

    function pt(c, e, a) {
      return {
        x: (V.CH4.x * c + V.C2H2.x * a + V.C2H4.x * e) / 100,
        y: (V.CH4.y * c + V.C2H2.y * a + V.C2H4.y * e) / 100
      };
    }

    function create(tag, attrs) {
      const el = document.createElementNS(ns, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }

    svg.appendChild(create('rect', { x: 0, y: 0, width: 600, height: 540, fill: 'white' }));

    const zones = [
      { code: 'PD', fill: '#E0F7FA', pts: [[100,0,0],[98,2,0],[96,2,2],[98,0,2]] },
      { code: 'T1', fill: '#FFF9C4', pts: [[98,2,0],[80,20,0],[78,20,2],[96,2,2]] },
      { code: 'T2', fill: '#FFE0B2', pts: [[80,20,0],[50,50,0],[48,50,2],[78,20,2]] },
      { code: 'T3', fill: '#FFCDD2', pts: [[50,50,0],[0,100,0],[0,98,2],[48,50,2]] },
      { code: 'D1', fill: '#D1C4E9', pts: [[98,0,2],[96,2,2],[78,20,2],[48,50,2],[0,50,50],[50,0,50]] },
      { code: 'DT', fill: '#F8BBD0', pts: [[0,50,50],[48,50,2],[0,98,2]] },
      { code: 'D2', fill: '#B39DDB', pts: [[0,0,100],[50,0,50],[0,50,50]] }
    ];

    zones.forEach(z => {
      const points = z.pts.map(p => {
        const o = pt(p[0], p[1], p[2]);
        return o.x.toFixed(1) + ',' + o.y.toFixed(1);
      }).join(' ');
      svg.appendChild(create('polygon', { points: points, fill: z.fill, stroke: '#555', 'stroke-width': '1' }));

      let sc = 0, se = 0, sa = 0;
      z.pts.forEach(p => { sc += p[0]; se += p[1]; sa += p[2]; });
      const n = z.pts.length;
      const c = pt(sc / n, se / n, sa / n);
      const t = create('text', {
        x: c.x.toFixed(1),
        y: c.y.toFixed(1),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': '13',
        'font-weight': 'bold',
        fill: '#222'
      });
      t.textContent = z.code;
      svg.appendChild(t);
    });

    const axisAttrs = { stroke: '#000', 'stroke-width': '2' };
    svg.appendChild(create('line', { x1: V.CH4.x, y1: V.CH4.y, x2: V.C2H2.x, y2: V.C2H2.y, ...axisAttrs }));
    svg.appendChild(create('line', { x1: V.C2H2.x, y1: V.C2H2.y, x2: V.C2H4.x, y2: V.C2H4.y, ...axisAttrs }));
    svg.appendChild(create('line', { x1: V.C2H4.x, y1: V.C2H4.y, x2: V.CH4.x, y2: V.CH4.y, ...axisAttrs }));

    for (let i = 1; i <= 9; i++) {
      const t = i / 10;
      const x = V.CH4.x + (V.C2H2.x - V.CH4.x) * t;
      const y = V.CH4.y;
      svg.appendChild(create('line', { x1: x, y1: y, x2: x, y2: y - 6, stroke: '#000', 'stroke-width': '1' }));
      const num = create('text', { x: x, y: y + 14, 'text-anchor': 'middle', 'font-size': '9', fill: '#444' });
      num.textContent = String(i * 10);
      svg.appendChild(num);
    }

    const nLeft = { x: 0.8660254, y: 0.5 };
    for (let i = 1; i <= 9; i++) {
      const t = i / 10;
      const x = V.CH4.x + (V.C2H4.x - V.CH4.x) * t;
      const y = V.CH4.y + (V.C2H4.y - V.CH4.y) * t;
      svg.appendChild(create('line', { x1: x, y1: y, x2: x + nLeft.x * 6, y2: y + nLeft.y * 6, stroke: '#000', 'stroke-width': '1' }));
      const num = create('text', { x: x - nLeft.x * 14, y: y - nLeft.y * 14, 'text-anchor': 'middle', 'font-size': '9', fill: '#444' });
      num.textContent = String(i * 10);
      svg.appendChild(num);
    }

    const nRight = { x: -0.8660254, y: 0.5 };
    for (let i = 1; i <= 9; i++) {
      const t = i / 10;
      const x = V.C2H2.x + (V.C2H4.x - V.C2H2.x) * t;
      const y = V.C2H2.y + (V.C2H4.y - V.C2H2.y) * t;
      svg.appendChild(create('line', { x1: x, y1: y, x2: x + nRight.x * 6, y2: y + nRight.y * 6, stroke: '#000', 'stroke-width': '1' }));
      const num = create('text', { x: x - nRight.x * 14, y: y - nRight.y * 14, 'text-anchor': 'middle', 'font-size': '9', fill: '#444' });
      num.textContent = String(i * 10);
      svg.appendChild(num);
    }

    const lbl = { 'text-anchor': 'middle', 'font-size': '16', 'font-weight': 'bold', fill: '#000' };
    const ch4Lbl = create('text', { x: V.CH4.x, y: V.CH4.y + 26, ...lbl });
    ch4Lbl.textContent = 'CH\u2084';
    svg.appendChild(ch4Lbl);

    const c2h2Lbl = create('text', { x: V.C2H2.x, y: V.C2H2.y + 26, ...lbl });
    c2h2Lbl.textContent = 'C\u2082H\u2082';
    svg.appendChild(c2h2Lbl);

    const c2h4Lbl = create('text', { x: V.C2H4.x, y: V.C2H4.y - 16, ...lbl });
    c2h4Lbl.textContent = 'C\u2082H\u2084';
    svg.appendChild(c2h4Lbl);

    if (sample && typeof sample.ch4 === 'number' && typeof sample.c2h4 === 'number' && typeof sample.c2h2 === 'number') {
      const tot = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (tot > 0) {
        const c = sample.ch4 / tot * 100;
        const e = sample.c2h4 / tot * 100;
        const a = sample.c2h2 / tot * 100;
        const p = pt(c, e, a);
        svg.appendChild(create('circle', {
          cx: p.x.toFixed(2),
          cy: p.y.toFixed(2),
          r: 6,
          fill: '#000',
          stroke: '#fff',
          'stroke-width': 2
        }));
      }
    }
  }
};
