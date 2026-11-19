const DuvalPentagon = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const SIN72 = Math.sin(Math.PI * 72 / 180);
  const COS72 = Math.cos(Math.PI * 72 / 180);
  const SIN144 = Math.sin(Math.PI * 144 / 180);
  const COS144 = Math.cos(Math.PI * 144 / 180);
  const verts = [
    [0, 1],
    [SIN72, COS72],
    [SIN144, COS144],
    [-SIN144, COS144],
    [-SIN72, COS72]
  ];
  function lerp(a, b, t) {
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  }
  const p_pd_d1 = lerp(verts[0], verts[1], 0.16);
  const p_s_pd = lerp(verts[0], verts[4], 0.16);
  const p_d1_d2 = lerp(verts[1], verts[2], 0.30);
  const p_d2_t3 = lerp(verts[1], verts[2], 0.65);
  const p_t3_t2 = lerp(verts[2], verts[3], 0.30);
  const p_t2_t1 = lerp(verts[2], verts[3], 0.58);
  const p_t1_s = lerp(verts[3], verts[4], 0.38);
  const v_pd_d1 = [0.09, 0.78];
  const v_s_pd = [-0.09, 0.78];
  const v_d1_d2 = [0.52, 0.18];
  const v_d2_t3 = [0.42, -0.22];
  const v_t3_t2 = [0.10, -0.50];
  const v_t2_t1 = [-0.16, -0.50];
  const v_t1_s = [-0.50, 0.05];
  const zones = {
    PD: [verts[0], p_pd_d1, v_pd_d1, v_s_pd, p_s_pd],
    D1: [p_pd_d1, verts[1], p_d1_d2, v_d1_d2, v_pd_d1],
    D2: [p_d1_d2, p_d2_t3, v_d2_t3, v_d1_d2],
    T3: [p_d2_t3, verts[2], p_t3_t2, v_t3_t2, v_d2_t3],
    T2: [p_t3_t2, p_t2_t1, v_t2_t1, v_t3_t2],
    T1: [p_t2_t1, verts[3], p_t1_s, v_t1_s, v_t2_t1],
    S: [p_t1_s, verts[4], p_s_pd, v_s_pd, v_t1_s],
    DT: [v_pd_d1, v_d1_d2, v_d2_t3, v_t3_t2, v_t2_t1, v_t1_s, v_s_pd]
  };
  const colors = {
    PD: '#FFF59D',
    S: '#C5E1A5',
    T1: '#FFCC80',
    T2: '#FFAB91',
    T3: '#EF9A9A',
    D2: '#CE93D8',
    D1: '#90CAF9',
    DT: '#BCAAA4'
  };
  const zoneOrder = ['PD', 'D1', 'D2', 'T3', 'T2', 'T1', 'S', 'DT'];
  function bary(h2, ch4, c2h6, c2h4, c2h2) {
    const tot = h2 + ch4 + c2h6 + c2h4 + c2h2;
    const ps = [h2 / tot, c2h2 / tot, c2h4 / tot, ch4 / tot, c2h6 / tot];
    let x = 0, y = 0;
    for (let i = 0; i < 5; i++) {
      x += ps[i] * verts[i][0];
      y += ps[i] * verts[i][1];
    }
    return [x, y];
  }
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi || 1e-15) + xi))
        inside = !inside;
    }
    return inside;
  }
  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    const [x, y] = bary(h2, ch4, c2h6, c2h4, c2h2);
    for (let i = 0; i < zoneOrder.length; i++) {
      if (pointInPoly(x, y, zones[zoneOrder[i]])) return zoneOrder[i];
    }
    return 'DT';
  }
  function render(svg, sample) {
    const cx = 300, cy = 300, sc = 200;
    function toSvg(p) {
      return [cx + p[0] * sc, cy - p[1] * sc];
    }
    function el(tag, attrs) {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, String(attrs[k]));
      return e;
    }
    svg.appendChild(el('rect', { x: 0, y: 0, width: 600, height: 600, fill: '#ffffff' }));
    const drawOrder = ['DT', 'S', 'T1', 'T2', 'T3', 'D2', 'D1', 'PD'];
    for (let i = 0; i < drawOrder.length; i++) {
      const z = drawOrder[i];
      const pts = zones[z].map(p => toSvg(p).join(',')).join(' ');
      svg.appendChild(el('polygon', {
        points: pts,
        fill: colors[z],
        stroke: '#333333',
        'stroke-width': 1.2
      }));
    }
    const outer = verts.map(p => toSvg(p).join(',')).join(' ');
    svg.appendChild(el('polygon', {
      points: outer,
      fill: 'none',
      stroke: '#111111',
      'stroke-width': 2
    }));
    for (let i = 0; i < 5; i++) {
      const p = toSvg(verts[i]);
      svg.appendChild(el('line', {
        x1: cx, y1: cy, x2: p[0], y2: p[1],
        stroke: '#555555',
        'stroke-width': 0.9,
        'stroke-dasharray': '5 4'
      }));
    }
    const gasNames = ['H₂', 'C₂H₂', 'C₂H₄', 'CH₄', 'C₂H₆'];
    for (let i = 0; i < 5; i++) {
      const p = toSvg([verts[i][0] * 1.24, verts[i][1] * 1.24]);
      const t = el('text', {
        x: p[0], y: p[1],
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-size': 17,
        'font-family': 'sans-serif',
        'font-weight': 'bold',
        fill: '#000000'
      });
      t.textContent = gasNames[i];
      svg.appendChild(t);
    }
    for (const z of zoneOrder) {
      const poly = zones[z];
      let sx = 0, sy = 0;
      for (let i = 0; i < poly.length; i++) {
        sx += poly[i][0];
        sy += poly[i][1];
      }
      const p = toSvg([sx / poly.length, sy / poly.length]);
      const t = el('text', {
        x: p[0], y: p[1],
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-size': z === 'PD' ? 11 : 13,
        'font-family': 'sans-serif',
        'font-weight': 'bold',
        fill: '#222222'
      });
      t.textContent = z;
      svg.appendChild(t);
    }
    if (sample) {
      const b = bary(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
      const p = toSvg(b);
      svg.appendChild(el('circle', {
        cx: p[0], cy: p[1], r: 6,
        fill: '#dd0000',
        stroke: '#000000',
        'stroke-width': 1.5
      }));
    }
  }
  return { classify, render };
})();
