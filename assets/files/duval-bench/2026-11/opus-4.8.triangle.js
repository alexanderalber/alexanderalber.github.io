const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const a = (ch4 / total) * 100;   // % CH4
    const e = (c2h4 / total) * 100;  // % C2H4
    const y = (c2h2 / total) * 100;  // % C2H2

    if (a >= 98) return 'PD';
    if (e >= 50 && y < 15) return 'T3';
    if (y < 4) {
      return e < 20 ? 'T1' : 'T2';
    }
    if (y < 13) return 'DT';
    // y >= 13
    if (e < 23) return 'D1';
    if (e < 40) return 'D2';
    if (y >= 29) return 'D2';
    return 'DT';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    };
    const txt = (x, y, s, attrs) => {
      const el = mk('text', Object.assign({ x, y }, attrs || {}));
      el.textContent = s;
      return el;
    };

    // Triangle vertices (top = CH4, bottom-left = C2H2, bottom-right = C2H4)
    const T = { x: 300, y: 113.59 };
    const L = { x: 100, y: 460 };
    const R = { x: 500, y: 460 };
    const Cx = 300, Cy = (T.y + L.y + R.y) / 3;

    // (ch4, c2h2, c2h4) percentages -> cartesian
    const toXY = (ch4, c2h2, c2h4) => {
      const s = ch4 + c2h2 + c2h4;
      const a = ch4 / s, b = c2h2 / s, c = c2h4 / s;
      return { x: a * T.x + b * L.x + c * R.x, y: a * T.y + b * L.y + c * R.y };
    };
    const out = (p, d) => {
      const dx = p.x - Cx, dy = p.y - Cy, m = Math.hypot(dx, dy) || 1;
      return { x: p.x + dx / m * d, y: p.y + dy / m * d };
    };

    const zones = [
      { code: 'PD', color: '#9ec7e8', pts: [[100,0,0],[98,2,0],[98,0,2]] },
      { code: 'T1', color: '#fff4b0', pts: [[98,2,0],[96,4,0],[76,4,20],[80,0,20],[98,0,2]] },
      { code: 'T2', color: '#ffd37a', pts: [[80,0,20],[76,4,20],[46,4,50],[50,0,50]] },
      { code: 'T3', color: '#f4984e', pts: [[50,0,50],[0,0,100],[0,15,85],[35,15,50]] },
      { code: 'D1', color: '#f4a6a6', pts: [[87,13,0],[64,13,23],[0,77,23],[0,100,0]] },
      { code: 'D2', color: '#e86b6b', pts: [[64,13,23],[47,13,40],[31,29,40],[0,29,71],[0,77,23]] }
    ];

    // --- DT background (whole triangle); other zones overlay, leftover = DT ---
    const triPts = [T, L, R].map(p => `${p.x},${p.y}`).join(' ');
    svg.appendChild(mk('polygon', { points: triPts, fill: '#c9a0dc', stroke: 'none' }));

    // --- Zone polygons ---
    zones.forEach(z => {
      const pts = z.pts.map(p => {
        const q = toXY(p[0], p[1], p[2]);
        return `${q.x.toFixed(2)},${q.y.toFixed(2)}`;
      }).join(' ');
      svg.appendChild(mk('polygon', { points: pts, fill: z.color, stroke: '#ffffff', 'stroke-width': 1 }));
    });

    // --- Zone labels ---
    const labelAt = (code, ch4, c2h2, c2h4) => {
      const q = toXY(ch4, c2h2, c2h4);
      svg.appendChild(txt(q.x, q.y, code, {
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': 'sans-serif', 'font-size': 15, 'font-weight': 'bold', fill: '#222'
      }));
    };
    labelAt('PD', 98.7, 0.7, 0.6);
    labelAt('T1', 90, 3, 7);
    labelAt('T2', 66, 2.5, 31.5);
    labelAt('T3', 20, 6, 74);
    labelAt('D1', 25, 63, 12);
    labelAt('D2', 25, 45, 30);
    labelAt('DT', 50, 10, 40);

    // --- Outer border ---
    svg.appendChild(mk('polygon', { points: triPts, fill: 'none', stroke: '#000', 'stroke-width': 2 }));

    // --- Axes: ticks, numbers, gas names ---
    const drawAxis = (ternaryFn, name, namePos) => {
      for (let f = 0; f <= 100; f += 10) {
        const t = ternaryFn(f);
        const p = toXY(t[0], t[1], t[2]);
        const p1 = out(p, 8);
        svg.appendChild(mk('line', { x1: p.x, y1: p.y, x2: p1.x, y2: p1.y, stroke: '#000', 'stroke-width': 1 }));
        if (f % 20 === 0) {
          const p2 = out(p, 20);
          svg.appendChild(txt(p2.x, p2.y, String(f), {
            'text-anchor': 'middle', 'dominant-baseline': 'middle',
            'font-family': 'sans-serif', 'font-size': 10, fill: '#000'
          }));
        }
      }
      const mp = toXY(namePos[0], namePos[1], namePos[2]);
      const np = out(mp, 48);
      svg.appendChild(txt(np.x, np.y, name, {
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': 'sans-serif', 'font-size': 15, 'font-weight': 'bold', fill: '#000'
      }));
    };

    // Left edge (L->T): % CH4
    drawAxis(f => [f, 100 - f, 0], '% CH4', [50, 50, 0]);
    // Right edge (T->R): % C2H4
    drawAxis(f => [100 - f, 0, f], '% C2H4', [50, 0, 50]);
    // Bottom edge (R->L): % C2H2
    drawAxis(f => [0, f, 100 - f], '% C2H2', [0, 50, 50]);

    // --- Sample point ---
    if (sample) {
      const q = toXY(sample.ch4, sample.c2h2, sample.c2h4);
      const code = this.classify(sample.ch4, sample.c2h4, sample.c2h2);
      svg.appendChild(mk('circle', { cx: q.x, cy: q.y, r: 6, fill: '#000', stroke: '#fff', 'stroke-width': 2 }));
      svg.appendChild(txt(q.x + 10, q.y - 8, code, {
        'font-family': 'sans-serif', 'font-size': 14, 'font-weight': 'bold', fill: '#000',
        stroke: '#fff', 'stroke-width': 0.6, 'paint-order': 'stroke'
      }));
    }
  }
};
