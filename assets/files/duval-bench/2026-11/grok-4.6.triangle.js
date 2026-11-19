const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const s = ch4 + c2h4 + c2h2;
    const pCH4 = 100 * ch4 / s;
    const pC2H4 = 100 * c2h4 / s;
    const pC2H2 = 100 * c2h2 / s;
    if (pCH4 >= 98) return 'PD';
    if (pC2H2 <= 4 && pC2H4 <= 20) return 'T1';
    if (pC2H2 <= 4 && pC2H4 <= 50) return 'T2';
    if (pC2H2 <= 15 && pC2H4 >= 50) return 'T3';
    if (pC2H2 >= 13 && pC2H4 <= 23) return 'D1';
    if (pC2H2 >= 29 && pC2H4 >= 23) return 'D2';
    if (pC2H2 >= 15 && pC2H4 >= 40) return 'D2';
    return 'DT';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, text) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      svg.appendChild(e);
      return e;
    };

    const vCH4 = { x: 60, y: 500 };
    const vC2H4 = { x: 540, y: 500 };
    const vC2H2 = { x: 300, y: 500 - 480 * Math.sqrt(3) / 2 };
    const cx = (vCH4.x + vC2H4.x + vC2H2.x) / 3;
    const cy = (vCH4.y + vC2H4.y + vC2H2.y) / 3;

    const toXY = (c2h2, c2h4) => {
      const ch4 = 100 - c2h2 - c2h4;
      return [
        (ch4 * vCH4.x + c2h4 * vC2H4.x + c2h2 * vC2H2.x) / 100,
        (ch4 * vCH4.y + c2h4 * vC2H4.y + c2h2 * vC2H2.y) / 100
      ];
    };
    const pts = verts => verts.map(([a, b]) => toXY(a, b).join(',')).join(' ');

    el('rect', { x: 0, y: 0, width: 600, height: 540, fill: '#ffffff' });

    const zones = [
      { name: 'T3', color: '#e06666', verts: [[0, 50], [0, 100], [15, 85], [15, 50]], lab: [5, 72] },
      { name: 'T2', color: '#f4b183', verts: [[0, 20], [0, 50], [4, 50], [4, 20]], lab: [2, 35] },
      { name: 'T1', color: '#ffe599', verts: [[2, 0], [4, 0], [4, 20], [0, 20], [0, 2], [2, 0]], lab: [2, 10] },
      { name: 'DT', color: '#d5a6bd', verts: [[4, 0], [13, 0], [13, 23], [29, 23], [29, 40], [15, 40], [15, 50], [4, 50]], lab: [10, 28] },
      { name: 'D2', color: '#6fa8dc', verts: [[29, 23], [77, 23], [15, 85], [15, 40], [29, 40]], lab: [32, 48] },
      { name: 'D1', color: '#93c47d', verts: [[13, 0], [100, 0], [77, 23], [13, 23]], lab: [45, 8] },
      { name: 'PD', color: '#c27ba0', verts: [[0, 0], [2, 0], [0, 2]], lab: [3, 9] }
    ];

    for (const z of zones) {
      el('polygon', {
        points: pts(z.verts),
        fill: z.color,
        stroke: '#333333',
        'stroke-width': 1,
        'stroke-linejoin': 'round'
      });
    }

    for (const z of zones) {
      const [lx, ly] = toXY(z.lab[0], z.lab[1]);
      el('text', {
        x: lx, y: ly,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': 'Arial, sans-serif',
        'font-size': z.name === 'PD' ? 11 : 16,
        'font-weight': 'bold',
        fill: '#222222'
      }, z.name);
    }

    const tickLen = 8;
    const labelOff = 18;
    const placeTick = (c2h2, c2h4, label, anchor) => {
      const [x, y] = toXY(c2h2, c2h4);
      let nx = x - cx, ny = y - cy;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      el('line', {
        x1: x, y1: y,
        x2: x + nx * tickLen, y2: y + ny * tickLen,
        stroke: '#000000', 'stroke-width': 1
      });
      el('text', {
        x: x + nx * labelOff, y: y + ny * labelOff,
        'text-anchor': anchor,
        'dominant-baseline': 'middle',
        'font-family': 'Arial, sans-serif',
        'font-size': 10,
        fill: '#000000'
      }, String(label));
    };

    for (let i = 10; i <= 90; i += 10) {
      placeTick(0, 100 - i, i, 'middle');
      placeTick(i, 0, i, 'end');
      placeTick(100 - i, i, i, 'start');
    }

    el('text', {
      x: vCH4.x - 8, y: vCH4.y + 32,
      'text-anchor': 'middle',
      'font-family': 'Arial, sans-serif',
      'font-size': 16,
      'font-weight': 'bold',
      fill: '#000000'
    }, 'CH\u2084');
    el('text', {
      x: vC2H4.x + 8, y: vC2H4.y + 32,
      'text-anchor': 'middle',
      'font-family': 'Arial, sans-serif',
      'font-size': 16,
      'font-weight': 'bold',
      fill: '#000000'
    }, 'C\u2082H\u2084');
    el('text', {
      x: vC2H2.x, y: vC2H2.y - 18,
      'text-anchor': 'middle',
      'font-family': 'Arial, sans-serif',
      'font-size': 16,
      'font-weight': 'bold',
      fill: '#000000'
    }, 'C\u2082H\u2082');

    if (sample) {
      const s = sample.ch4 + sample.c2h4 + sample.c2h2;
      const pC2H2 = 100 * sample.c2h2 / s;
      const pC2H4 = 100 * sample.c2h4 / s;
      const [px, py] = toXY(pC2H2, pC2H4);
      el('circle', {
        cx: px, cy: py, r: 6,
        fill: '#000000',
        stroke: '#ffffff',
        'stroke-width': 2
      });
    }
  }
};
