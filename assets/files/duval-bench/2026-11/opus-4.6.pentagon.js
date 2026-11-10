const DuvalPentagon = (() => {
  const CX = 300, CY = 300, R = 240;
  const NS = 'http://www.w3.org/2000/svg';
  const LABELS = ['H\u2082', 'CH\u2084', 'C\u2082H\u2086', 'C\u2082H\u2084', 'C\u2082H\u2082'];

  // Vertices clockwise from top: H2, CH4, C2H6, C2H4, C2H2
  const V = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
    V.push([CX + R * Math.cos(a), CY + R * Math.sin(a)]);
  }
  const CC = [CX, CY];

  function lerp(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function toPoint(h2, ch4, c2h6, c2h4, c2h2) {
    const s = h2 + ch4 + c2h6 + c2h4 + c2h2;
    const p = [h2 / s, ch4 / s, c2h6 / s, c2h4 / s, c2h2 / s];
    let x = 0, y = 0;
    for (let i = 0; i < 5; i++) { x += p[i] * V[i][0]; y += p[i] * V[i][1]; }
    return [x, y];
  }

  function pip(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      if ((yi > pt[1]) !== (yj > pt[1]) &&
          pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }

  function centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p[0]; y += p[1]; }
    return [x / pts.length, y / pts.length];
  }

  // Zone boundary points
  const pd1 = lerp(V[0], V[1], 0.15);   // PD corner on H2–CH4 edge
  const pd2 = lerp(V[0], V[4], 0.15);   // PD corner on H2–C2H2 edge
  const sp  = lerp(V[0], V[1], 0.60);   // S / T1 split on H2–CH4 edge

  // Edge midpoints (sector boundaries converging at centre)
  const M01 = lerp(V[0], V[1], 0.50);
  const M12 = lerp(V[1], V[2], 0.50);
  const M23 = lerp(V[2], V[3], 0.50);
  const M34 = lerp(V[3], V[4], 0.50);
  const M40 = lerp(V[4], V[0], 0.50);

  // Zone definitions: code, polygon vertices, fill colour, label nudge
  const ZONES = [
    { code: 'PD', poly: [V[0], pd1, pd2],                   color: '#b3e5fc' },
    { code: 'D1', poly: [pd1, M01, CC, M40, pd2],           color: '#fff9c4' },
    { code: 'S',  poly: [M01, sp, CC],                       color: '#e1bee7' },
    { code: 'T1', poly: [sp, V[1], M12, CC],                 color: '#dcedc8' },
    { code: 'T2', poly: [M12, V[2], M23, CC],                color: '#a5d6a7' },
    { code: 'T3', poly: [M23, V[3], M34, CC],                color: '#81c784' },
    { code: 'D2', poly: [M34, V[4], M40, CC],                color: '#ffcc80' },
  ];

  // ── classify ───────────────────────────────────────────────
  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    const pt = toPoint(h2, ch4, c2h6, c2h4, c2h2);
    for (const z of ZONES) {
      if (pip(pt, z.poly)) return z.code;
    }
    // Fallback: nearest zone centroid (handles exact-boundary edge cases)
    let best = 'ND', bestD = Infinity;
    for (const z of ZONES) {
      const c = centroid(z.poly);
      const d = (pt[0] - c[0]) ** 2 + (pt[1] - c[1]) ** 2;
      if (d < bestD) { bestD = d; best = z.code; }
    }
    return best;
  }

  // ── render ─────────────────────────────────────────────────
  function render(svg, sample) {
    function el(tag, attrs) {
      const e = document.createElementNS(NS, tag);
      if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
      return e;
    }

    function text(x, y, str, size, opts) {
      const t = el('text', Object.assign({
        x: x, y: y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': 'Arial, Helvetica, sans-serif',
        'font-size': size,
        fill: '#333'
      }, opts || {}));
      t.textContent = str;
      return t;
    }

    // Title
    svg.appendChild(text(CX, 22, 'Duval Pentagon 1', 18, { 'font-weight': 'bold', fill: '#222' }));

    // Zone fills
    for (const z of ZONES) {
      const pts = z.poly.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      svg.appendChild(el('polygon', {
        points: pts,
        fill: z.color,
        stroke: '#666',
        'stroke-width': '0.8',
        'stroke-linejoin': 'round'
      }));
    }

    // Zone labels
    for (const z of ZONES) {
      const c = centroid(z.poly);
      svg.appendChild(text(c[0], c[1], z.code, 14, { 'font-weight': 'bold' }));
    }

    // Pentagon outline
    svg.appendChild(el('polygon', {
      points: V.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '),
      fill: 'none',
      stroke: '#333',
      'stroke-width': '2',
      'stroke-linejoin': 'round'
    }));

    // Axes: dashed lines from centre to each vertex
    for (let i = 0; i < 5; i++) {
      svg.appendChild(el('line', {
        x1: CX, y1: CY,
        x2: V[i][0], y2: V[i][1],
        stroke: '#999',
        'stroke-width': '0.7',
        'stroke-dasharray': '5,4'
      }));
    }

    // Gas name labels outside each vertex
    const LR = R + 28;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      const lx = CX + LR * Math.cos(a);
      const ly = CY + LR * Math.sin(a);
      svg.appendChild(text(lx, ly, LABELS[i], 13, { fill: '#000', 'font-weight': '600' }));
    }

    // Zone-description legend (bottom)
    const legend = [
      ['PD', 'Partial Discharges'],
      ['D1', 'Low-Energy Discharges'],
      ['D2', 'High-Energy Discharges'],
      ['T1', 'Thermal < 300 \u00b0C'],
      ['T2', 'Thermal 300\u2013700 \u00b0C'],
      ['T3', 'Thermal > 700 \u00b0C'],
      ['S',  'Stray Gassing'],
    ];
    const cols = 2, rowH = 16, startY = 568, startX = 60;
    for (let i = 0; i < legend.length; i++) {
      const col = i < 4 ? 0 : 1;
      const row = i < 4 ? i : i - 4;
      const x = startX + col * 280;
      const y = startY + row * rowH - (legend.length <= 4 ? 0 : 20);
      const z = ZONES.find(z => z.code === legend[i][0]);
      svg.appendChild(el('rect', {
        x: x, y: y - 6, width: 12, height: 12, rx: 2,
        fill: z ? z.color : '#eee', stroke: '#888', 'stroke-width': '0.5'
      }));
      svg.appendChild(text(x + 20, y, legend[i][0] + ' \u2013 ' + legend[i][1], 10.5, {
        'text-anchor': 'start', fill: '#444', 'font-weight': 'normal'
      }));
    }

    // Sample point
    if (sample) {
      const pt = toPoint(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
      svg.appendChild(el('circle', {
        cx: pt[0].toFixed(1), cy: pt[1].toFixed(1), r: 7,
        fill: '#d32f2f', stroke: '#fff', 'stroke-width': '2'
      }));
      svg.appendChild(el('circle', {
        cx: pt[0].toFixed(1), cy: pt[1].toFixed(1), r: 3,
        fill: '#fff'
      }));
    }
  }

  return { classify: classify, render: render };
})();