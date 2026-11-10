/*
 * Duval Pentagon 1 (H2, CH4, C2H6, C2H4, C2H2), written from memory.
 * The zone limits are a best reconstruction, not checked against the published
 * figure or IEC 60599 tables. Treat every boundary as unverified.
 *
 * Shares are percentages of the five-gas total (CO and CO2 are not used).
 * The 2D picture maps a share vector to the sum of share * vertex, so distinct
 * share vectors can land on the same point. render() therefore colours each
 * projected cell by the zone that most sampled share vectors give there.
 */
const DuvalPentagon = (() => {
  const CX = 300;
  const CY = 300;
  const R = 200;          // radius of the pentagon (100 % of one gas)
  const CELL = 5;         // pixel size of the colour grid
  const N = 600 / CELL;   // grid cells per side
  const SAMPLES = 200000; // share vectors sampled for the colour map
  const LABELS = ['H₂', 'CH₄', 'C₂H₆', 'C₂H₄', 'C₂H₂'];
  const NS = 'http://www.w3.org/2000/svg';
  const ZONE_FILL = {
    PD: '#7fb3ff',
    D1: '#e0463c',
    D2: '#8b1a1a',
    DT: '#b35bd1',
    T1: '#ffe27a',
    T2: '#ffb347',
    T3: '#ff7a3d',
    S: '#b5e3a0'
  };
  let clipSeq = 0;

  // Vertex i of the regular pentagon, gas order H2, CH4, C2H6, C2H4, C2H2, clockwise from the top.
  function vertex(i, r) {
    const a = (-90 + 72 * i) * Math.PI / 180;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  }

  // Share vector (percent, sums to 100) -> point in the pentagon.
  function project(p) {
    let x = CX;
    let y = CY;
    for (let i = 0; i < 5; i++) {
      const [vx, vy] = vertex(i, R);
      const f = p[i] / 100;
      x += f * (vx - CX);
      y += f * (vy - CY);
    }
    return [x, y];
  }

  function shares(v) {
    const total = v[0] + v[1] + v[2] + v[3] + v[4];
    return v.map((x) => (100 * x) / total);
  }

  // p = [H2, CH4, C2H6, C2H4, C2H2] in percent of the five-gas total.
  function zone(p) {
    const h2 = p[0];
    const c2h4 = p[3];
    const c2h2 = p[4];
    if (h2 >= 90) return 'PD';
    if (c2h2 >= 13) {
      if (c2h4 >= 23) return 'DT';
      return c2h2 >= 29 ? 'D2' : 'D1';
    }
    if (c2h4 < 5 && c2h2 < 5 && h2 < 50) return 'S';
    if (c2h4 >= 50) return 'T3';
    if (c2h4 >= 20) return 'T2';
    return 'T1';
  }

  function classify(h2, ch4, c2h6, c2h4, c2h2) {
    return zone(shares([h2, ch4, c2h6, c2h4, c2h2]));
  }

  // Small seeded PRNG so the colour map is the same on every call.
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function svgEl(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }

  function clampIdx(i) {
    return Math.max(0, Math.min(N - 1, i));
  }

  function render(svg, sample) {
    const ring = [];
    for (let i = 0; i < 5; i++) ring.push(vertex(i, R).join(','));
    const ringPts = ring.join(' ');

    svgEl('rect', { x: 0, y: 0, width: 600, height: 600, fill: '#ffffff' }, svg);

    const defs = svgEl('defs', {}, svg);
    const clipId = 'duval-p1-clip-' + (++clipSeq);
    const clip = svgEl('clipPath', { id: clipId }, defs);
    svgEl('polygon', { points: ringPts }, clip);

    // Colour map: sample uniform share vectors, bin them by projected position,
    // and remember the zone counts per cell and the centroid of each zone.
    const rng = mulberry32(20261110);
    const cellZone = new Array(N * N);
    const lab = {};
    for (let s = 0; s < SAMPLES; s++) {
      const e = [];
      let tot = 0;
      for (let i = 0; i < 5; i++) {
        const v = -Math.log(1 - rng()); // exponential, normalised below gives uniform on the simplex
        e.push(v);
        tot += v;
      }
      const p = e.map((v) => (100 * v) / tot);
      const z = zone(p);
      const q = project(p);
      const ci = clampIdx(Math.floor(q[0] / CELL));
      const cj = clampIdx(Math.floor(q[1] / CELL));
      const k = cj * N + ci;
      if (!cellZone[k]) cellZone[k] = {};
      cellZone[k][z] = (cellZone[k][z] || 0) + 1;
      if (!lab[z]) lab[z] = { x: 0, y: 0, n: 0 };
      lab[z].x += q[0];
      lab[z].y += q[1];
      lab[z].n += 1;
    }

    const zoneLayer = svgEl('g', { 'clip-path': 'url(#' + clipId + ')' }, svg);
    for (let k = 0; k < N * N; k++) {
      const c = cellZone[k];
      if (!c) continue;
      let best = null;
      let bestN = -1;
      for (const z in c) {
        if (c[z] > bestN) {
          bestN = c[z];
          best = z;
        }
      }
      svgEl('rect', {
        x: (k % N) * CELL,
        y: Math.floor(k / N) * CELL,
        width: CELL + 0.5,
        height: CELL + 0.5,
        fill: ZONE_FILL[best]
      }, zoneLayer);
    }

    svgEl('polygon', { points: ringPts, fill: 'none', stroke: '#222222', 'stroke-width': 1.5 }, svg);

    // Axes with gas names.
    for (let i = 0; i < 5; i++) {
      const [vx, vy] = vertex(i, R);
      svgEl('line', { x1: CX, y1: CY, x2: vx, y2: vy, stroke: '#444444', 'stroke-width': 1 }, svg);
      const [lx, ly] = vertex(i, R + 26);
      const anchor = lx < CX - 5 ? 'end' : (lx > CX + 5 ? 'start' : 'middle');
      const t = svgEl('text', {
        x: lx, y: ly, 'text-anchor': anchor, 'dominant-baseline': 'middle',
        'font-family': 'sans-serif', 'font-size': 16, 'font-weight': 'bold', fill: '#111111'
      }, svg);
      t.textContent = LABELS[i];
    }

    // Zone labels at the centroid of each zone's sampled points.
    for (const z in lab) {
      const L = lab[z];
      if (L.n < 50) continue;
      const t = svgEl('text', {
        x: L.x / L.n, y: L.y / L.n, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': 'sans-serif', 'font-size': 14, 'font-weight': 'bold', fill: '#111111',
        stroke: '#ffffff', 'stroke-width': 3, 'paint-order': 'stroke'
      }, svg);
      t.textContent = z;
    }

    // Sample marker.
    if (sample && typeof sample === 'object') {
      const v = [sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2].map(Number);
      const total = v[0] + v[1] + v[2] + v[3] + v[4];
      if (total > 0) {
        const p = shares(v);
        const q = project(p);
        svgEl('circle', { cx: q[0], cy: q[1], r: 7, fill: '#000000', stroke: '#ffffff', 'stroke-width': 2 }, svg);
        const t = svgEl('text', {
          x: q[0] + 11, y: q[1] - 11, 'font-family': 'sans-serif', 'font-size': 14,
          'font-weight': 'bold', fill: '#111111', stroke: '#ffffff', 'stroke-width': 3, 'paint-order': 'stroke'
        }, svg);
        t.textContent = zone(p);
      }
    }
  }

  return { classify, render };
})();
