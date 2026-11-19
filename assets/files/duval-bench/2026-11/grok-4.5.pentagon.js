const DuvalPentagon = {
  _ready: false,
  _init() {
    if (this._ready) return;
    this.cx = 300;
    this.cy = 300;
    this.r = 240;
    this.gases = ['H2', 'C2H6', 'CH4', 'C2H4', 'C2H2'];
    this.vert = {};
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      this.vert[this.gases[i]] = {
        x: this.cx + this.r * Math.cos(a),
        y: this.cy + this.r * Math.sin(a)
      };
    }
    this.edge = (g1, g2, p) => {
      const v1 = this.vert[g1], v2 = this.vert[g2];
      return { x: p * v1.x + (1 - p) * v2.x, y: p * v1.y + (1 - p) * v2.y };
    };
    this.rad = (g, p) => {
      const v = this.vert[g];
      return { x: this.cx + p * (v.x - this.cx), y: this.cy + p * (v.y - this.cy) };
    };
    const E = this.edge.bind(this);
    const R = this.rad.bind(this);
    const V = this.vert;
    this.zoneDefs = [
      {
        code: 'PD',
        color: '#7ec8e3',
        label: R('H2', 0.88),
        points: [V.H2, E('H2', 'C2H2', 0.80), E('H2', 'C2H6', 0.80)]
      },
      {
        code: 'D1',
        color: '#90ee90',
        label: R('C2H2', 0.78),
        points: [V.C2H2, E('C2H2', 'C2H4', 0.38), R('C2H2', 0.42), E('H2', 'C2H2', 0.78)]
      },
      {
        code: 'T3',
        color: '#e07070',
        label: R('C2H4', 0.78),
        points: [V.C2H4, E('C2H4', 'CH4', 0.42), R('C2H4', 0.48), E('C2H4', 'C2H2', 0.58)]
      },
      {
        code: 'T1',
        color: '#ffe066',
        label: R('CH4', 0.78),
        points: [V.CH4, E('CH4', 'C2H6', 0.62), R('CH4', 0.48), E('CH4', 'C2H4', 0.55)]
      },
      {
        code: 'S',
        color: '#c8c8c8',
        label: R('C2H6', 0.72),
        points: [E('H2', 'C2H6', 0.80), V.C2H6, E('C2H6', 'CH4', 0.62), R('C2H6', 0.42), R('H2', 0.48)]
      },
      {
        code: 'D2',
        color: '#ff6b6b',
        label: { x: 220, y: 390 },
        points: [E('C2H4', 'C2H2', 0.58), E('C2H2', 'C2H4', 0.38), R('C2H2', 0.38), { x: 300, y: 300 }, R('C2H4', 0.38)]
      },
      {
        code: 'T2',
        color: '#ffb347',
        label: { x: 380, y: 390 },
        points: [E('CH4', 'C2H4', 0.55), E('C2H4', 'CH4', 0.42), R('C2H4', 0.35), { x: 300, y: 300 }, R('CH4', 0.35)]
      }
    ];
    this.dtColor = '#e8c4e8';
    this.dtLabel = { x: 300, y: 300 };
    this._ready = true;
  },
  _pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const inter = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (inter) inside = !inside;
    }
    return inside;
  },
  _coords(h2, ch4, c2h6, c2h4, c2h2) {
    const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (sum <= 0) return null;
    const p = { H2: h2 / sum, CH4: ch4 / sum, C2H6: c2h6 / sum, C2H4: c2h4 / sum, C2H2: c2h2 / sum };
    let x = 0, y = 0;
    for (const g of this.gases) {
      x += p[g] * this.vert[g].x;
      y += p[g] * this.vert[g].y;
    }
    return { x, y };
  },
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    this._init();
    const pt = this._coords(h2, ch4, c2h6, c2h4, c2h2);
    if (!pt) return 'ND';
    for (const z of this.zoneDefs) {
      if (this._pointInPoly(pt.x, pt.y, z.points)) return z.code;
    }
    return 'DT';
  },
  render(svg, sample) {
    this._init();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const ns = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => {
      const el = document.createElementNS(ns, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    };
    svg.appendChild(mk('rect', { x: 0, y: 0, width: 600, height: 600, fill: '#ffffff' }));
    const pent = this.gases.map(g => this.vert[g]);
    const pentStr = pent.map(p => p.x + ',' + p.y).join(' ');
    svg.appendChild(mk('polygon', { points: pentStr, fill: this.dtColor, stroke: '#333333', 'stroke-width': 2.5 }));
    for (const z of this.zoneDefs) {
      const pts = z.points.map(p => p.x + ',' + p.y).join(' ');
      svg.appendChild(mk('polygon', { points: pts, fill: z.color, stroke: '#444444', 'stroke-width': 1.2, opacity: 0.92 }));
    }
    for (const g of this.gases) {
      const v = this.vert[g];
      svg.appendChild(mk('line', { x1: this.cx, y1: this.cy, x2: v.x, y2: v.y, stroke: '#666666', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
    }
    svg.appendChild(mk('polygon', { points: pentStr, fill: 'none', stroke: '#222222', 'stroke-width': 2.5 }));
    const addLabel = (txt, pos, size, weight, col) => {
      const t = mk('text', {
        x: pos.x, y: pos.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': size, 'font-family': 'Arial, sans-serif', 'font-weight': weight || 'normal', fill: col || '#000000'
      });
      t.textContent = txt;
      svg.appendChild(t);
    };
    addLabel('DT', this.dtLabel, 16, 'bold', '#553355');
    for (const z of this.zoneDefs) addLabel(z.code, z.label, 15, 'bold', '#222222');
    for (const g of this.gases) {
      const pos = this.rad(g, 1.13);
      addLabel(g, pos, 16, 'bold', '#000000');
    }
    if (sample) {
      const pt = this._coords(sample.h2 || 0, sample.ch4 || 0, sample.c2h6 || 0, sample.c2h4 || 0, sample.c2h2 || 0);
      if (pt) {
        svg.appendChild(mk('circle', { cx: pt.x, cy: pt.y, r: 8, fill: '#ff0000', stroke: '#000000', 'stroke-width': 2 }));
        svg.appendChild(mk('circle', { cx: pt.x, cy: pt.y, r: 3, fill: '#ffffff' }));
      }
    }
  }
};
