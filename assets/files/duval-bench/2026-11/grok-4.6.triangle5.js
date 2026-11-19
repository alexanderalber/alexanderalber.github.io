const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const tot = ch4 + c2h4 + c2h6;
    const pCH4 = 100 * ch4 / tot;
    const pC2H4 = 100 * c2h4 / tot;
    const pC2H6 = 100 * c2h6 / tot;
    if (pCH4 >= 98) return 'PD';
    if (pC2H4 >= 40) return 'T3';
    if (pC2H4 >= 24) return 'T2';
    if (pC2H6 >= 50) return 'O';
    if (pC2H4 <= 10 && pC2H6 >= 36) return 'O';
    if (pC2H4 <= 10) return 'S';
    if (pC2H6 <= 12) return 'T2';
    return 'C';
  },
  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    const side = 480;
    const h = side * Math.sqrt(3) / 2;
    const bl = [60, 480];
    const br = [540, 480];
    const top = [300, 480 - h];
    function toXY(pCH4, pC2H4, pC2H6) {
      return [
        (pCH4 / 100) * bl[0] + (pC2H4 / 100) * br[0] + (pC2H6 / 100) * top[0],
        (pCH4 / 100) * bl[1] + (pC2H4 / 100) * br[1] + (pC2H6 / 100) * top[1]
      ];
    }
    function el(name, attrs) {
      const e = document.createElementNS(NS, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      svg.appendChild(e);
      return e;
    }
    el('rect', { x: 0, y: 0, width: 600, height: 540, fill: '#ffffff' });
    const zones = [
      { code: 'PD', color: '#ffb3d9', pts: [[100, 0, 0], [98, 2, 0], [98, 0, 2]] },
      { code: 'S', color: '#ffffa0', pts: [[98, 2, 0], [90, 10, 0], [54, 10, 36], [64, 0, 36], [98, 0, 2]] },
      { code: 'O', color: '#ffd9b3', pts: [[64, 0, 36], [0, 0, 100], [0, 24, 76], [26, 24, 50], [40, 10, 50], [54, 10, 36]] },
      { code: 'C', color: '#d2b48c', pts: [[78, 10, 12], [64, 24, 12], [26, 24, 50], [40, 10, 50]] },
      { code: 'T2', color: '#ff7f7f', pts: [[90, 10, 0], [60, 40, 0], [0, 40, 60], [0, 24, 76], [64, 24, 12], [78, 10, 12]] },
      { code: 'T3', color: '#e74c3c', pts: [[0, 100, 0], [60, 40, 0], [0, 40, 60]] }
    ];
    for (const z of zones) {
      const points = z.pts.map(p => toXY(p[0], p[1], p[2]).join(',')).join(' ');
      el('polygon', { points: points, fill: z.color, stroke: '#444444', 'stroke-width': '0.9' });
    }
    for (const z of zones) {
      let cx = 0, cy = 0;
      for (const p of z.pts) {
        const xy = toXY(p[0], p[1], p[2]);
        cx += xy[0];
        cy += xy[1];
      }
      cx /= z.pts.length;
      cy /= z.pts.length;
      if (z.code === 'PD') { cx += 20; cy -= 12; }
      const t = el('text', {
        x: cx, y: cy + 5,
        'text-anchor': 'middle',
        'font-size': z.code === 'PD' ? '11' : '16',
        'font-family': 'sans-serif',
        'font-weight': 'bold',
        fill: '#222222'
      });
      t.textContent = z.code;
    }
    const gStyle = { 'font-size': '18', 'font-family': 'sans-serif', 'font-weight': 'bold', fill: '#000000' };
    const tCH4 = el('text', Object.assign({ x: 55, y: 518, 'text-anchor': 'middle' }, gStyle));
    tCH4.textContent = 'CH4';
    const tC2H4 = el('text', Object.assign({ x: 545, y: 518, 'text-anchor': 'middle' }, gStyle));
    tC2H4.textContent = 'C2H4';
    const tC2H6 = el('text', Object.assign({ x: 300, y: 40, 'text-anchor': 'middle' }, gStyle));
    tC2H6.textContent = 'C2H6';
    const sq3_2 = Math.sqrt(3) / 2;
    function addTick(xy, ou, ov, lab) {
      const len = 7;
      el('line', {
        x1: xy[0], y1: xy[1],
        x2: xy[0] + ou * len, y2: xy[1] + ov * len,
        stroke: '#000000', 'stroke-width': '1'
      });
      if (lab) {
        const te = el('text', {
          x: xy[0] + ou * 16,
          y: xy[1] + ov * 16 + 3,
          'font-size': '10',
          'font-family': 'sans-serif',
          'text-anchor': 'middle',
          fill: '#333333'
        });
        te.textContent = lab;
      }
    }
    for (let t = 10; t <= 90; t += 10) {
      addTick(toXY(100 - t, t, 0), 0, 1, t % 20 === 0 ? String(t) : null);
    }
    for (let t = 10; t <= 90; t += 10) {
      addTick(toXY(0, 100 - t, t), sq3_2, -0.5, t % 20 === 0 ? String(t) : null);
    }
    for (let t = 10; t <= 90; t += 10) {
      addTick(toXY(t, 0, 100 - t), -sq3_2, -0.5, t % 20 === 0 ? String(t) : null);
    }
    if (sample) {
      const tot = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (tot > 0) {
        const xy = toXY(100 * sample.ch4 / tot, 100 * sample.c2h4 / tot, 100 * sample.c2h6 / tot);
        el('circle', { cx: xy[0], cy: xy[1], r: 5, fill: '#000000', stroke: '#ffffff', 'stroke-width': '2' });
      }
    }
  }
};
