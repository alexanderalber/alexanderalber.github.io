const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const sum = ch4 + c2h4 + c2h6;
    const pCH4 = 100 * ch4 / sum;
    const pC2H4 = 100 * c2h4 / sum;
    if (pC2H4 <= 1 && pCH4 >= 98) return 'PD';
    if (pC2H4 <= 15 && pCH4 >= 40) return 'S';
    if (pC2H4 <= 15) return 'O';
    if (pC2H4 <= 30 && pCH4 <= 40) return 'C';
    if (pC2H4 <= 50) return 'T2';
    return 'T3';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    const side = 500;
    const h = side * Math.sqrt(3) / 2;
    const x0 = 50;
    const y0 = 480;

    function toXY(pCH4, pC2H4) {
      const x = x0 + (pC2H4 + pCH4 * 0.5) * side / 100;
      const y = y0 - pCH4 * h / 100;
      return [x, y];
    }

    function el(name, attrs, parent) {
      const e = document.createElementNS(NS, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    }

    function poly(pts, fill, stroke, sw, parent) {
      const points = pts.map(p => {
        const [x, y] = toXY(p[0], p[1]);
        return x + ',' + y;
      }).join(' ');
      return el('polygon', {
        points,
        fill,
        stroke: stroke || '#333',
        'stroke-width': sw || 1.2,
        'stroke-linejoin': 'round'
      }, parent);
    }

    function txt(x, y, s, size, anchor, weight, fill, parent) {
      const t = el('text', {
        x, y,
        'font-family': 'Arial, sans-serif',
        'font-size': size || 14,
        'text-anchor': anchor || 'middle',
        'font-weight': weight || 'normal',
        fill: fill || '#000'
      }, parent);
      t.textContent = s;
      return t;
    }

    // background
    el('rect', { x: 0, y: 0, width: 600, height: 540, fill: '#fff' }, svg);

    // title
    txt(300, 28, 'Duval Triangle 5', 20, 'middle', 'bold', '#222', svg);

    // zone polygons (CH4%, C2H4%)
    // PD
    poly([[100, 0], [98, 0], [98, 1], [99, 1]], '#ffb3d9', '#333', 1.2, svg);
    // S
    poly([[98, 0], [40, 0], [40, 15], [85, 15], [99, 1], [98, 1]], '#ffff99', '#333', 1.2, svg);
    // O
    poly([[40, 0], [0, 0], [0, 15], [40, 15]], '#ffcc99', '#333', 1.2, svg);
    // C
    poly([[40, 15], [0, 15], [0, 30], [40, 30]], '#a8e6a8', '#333', 1.2, svg);
    // T2
    poly([[40, 15], [85, 15], [50, 50], [0, 50], [0, 30], [40, 30]], '#a8d4ff', '#333', 1.2, svg);
    // T3
    poly([[0, 50], [0, 100], [50, 50]], '#d9b3ff', '#333', 1.2, svg);

    // outer triangle outline
    poly([[100, 0], [0, 0], [0, 100]], 'none', '#111', 2.5, svg);

    // zone labels at interior points
    const labels = [
      { p: [99.0, 0.4], t: 'PD' },
      { p: [70, 6], t: 'S' },
      { p: [18, 6], t: 'O' },
      { p: [18, 22], t: 'C' },
      { p: [28, 38], t: 'T2' },
      { p: [12, 72], t: 'T3' }
    ];
    labels.forEach(L => {
      const [x, y] = toXY(L.p[0], L.p[1]);
      txt(x, y + 5, L.t, 16, 'middle', 'bold', '#222', svg);
    });

    // axis ticks and numbers
    // bottom axis (C2H6): CH4=0, C2H4 = 100 - C2H6
    for (let i = 0; i <= 10; i++) {
      const pC2H6 = i * 10;
      const pC2H4 = 100 - pC2H6;
      const [x, y] = toXY(0, pC2H4);
      el('line', { x1: x, y1: y, x2: x, y2: y + 8, stroke: '#111', 'stroke-width': 1.5 }, svg);
      txt(x, y + 22, String(pC2H6), 11, 'middle', 'normal', '#000', svg);
    }
    // left axis (CH4): C2H4=0
    for (let i = 0; i <= 10; i++) {
      const pCH4 = i * 10;
      const [x, y] = toXY(pCH4, 0);
      // outward tick approx perpendicular (left-down)
      const dx = -7;
      const dy = 4;
      el('line', { x1: x, y1: y, x2: x + dx, y2: y + dy, stroke: '#111', 'stroke-width': 1.5 }, svg);
      txt(x + dx - 10, y + dy + 4, String(pCH4), 11, 'middle', 'normal', '#000', svg);
    }
    // right axis (C2H4): C2H6=0 => pCH4 + pC2H4 = 100
    for (let i = 0; i <= 10; i++) {
      const pC2H4 = i * 10;
      const pCH4 = 100 - pC2H4;
      const [x, y] = toXY(pCH4, pC2H4);
      const dx = 7;
      const dy = 4;
      el('line', { x1: x, y1: y, x2: x + dx, y2: y + dy, stroke: '#111', 'stroke-width': 1.5 }, svg);
      txt(x + dx + 12, y + dy + 4, String(pC2H4), 11, 'middle', 'normal', '#000', svg);
    }

    // gas names
    // CH4 (left side)
    {
      const [x, y] = toXY(55, 0);
      const t = txt(x - 48, y + 5, 'CH\u2084', 16, 'middle', 'bold', '#000', svg);
      t.setAttribute('transform', 'rotate(-60 ' + (x - 48) + ' ' + (y + 5) + ')');
    }
    // C2H4 (right side)
    {
      const [x, y] = toXY(55, 45);
      const t = txt(x + 48, y + 5, 'C\u2082H\u2084', 16, 'middle', 'bold', '#000', svg);
      t.setAttribute('transform', 'rotate(60 ' + (x + 48) + ' ' + (y + 5) + ')');
    }
    // C2H6 (bottom)
    txt(300, 525, 'C\u2082H\u2086', 16, 'middle', 'bold', '#000', svg);

    // sample point
    if (sample && sample.ch4 != null && sample.c2h4 != null && sample.c2h6 != null) {
      const sum = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (sum > 0) {
        const pCH4 = 100 * sample.ch4 / sum;
        const pC2H4 = 100 * sample.c2h4 / sum;
        const [x, y] = toXY(pCH4, pC2H4);
        el('circle', { cx: x, cy: y, r: 9, fill: 'none', stroke: '#c00', 'stroke-width': 2 }, svg);
        el('circle', { cx: x, cy: y, r: 5, fill: '#f00', stroke: '#600', 'stroke-width': 1 }, svg);
      }
    }
  }
};
