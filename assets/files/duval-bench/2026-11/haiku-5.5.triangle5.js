/*
 * Duval Triangle 5 (DT5) for low-temperature faults in mineral-oil-filled transformers.
 *
 * Caveat: the zone boundaries below were written from memory and have not been checked
 * against the published DT5 figure or standard text. Treat them as unverified.
 *
 * Plain browser script, no modules. Defines the single global DuvalTriangle5.
 */
const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    const a = (100 * ch4) / total;
    const b = (100 * c2h4) / total;
    const c = (100 * c2h6) / total;
    if (b < 10) return 'S';
    if (a >= 50) return 'T1';
    if (c >= b) return 'T2';
    return 'T3';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    const SIDE = 460;
    const HEIGHT = (SIDE * Math.sqrt(3)) / 2;
    const BASE_Y = 470;
    const VERT = {
      CH4: { x: 300, y: BASE_Y - HEIGHT },
      C2H4: { x: 70, y: BASE_Y },
      C2H6: { x: 530, y: BASE_Y },
    };
    const COLORS = { S: '#bfe3f5', T1: '#fff1a8', T2: '#ffc878', T3: '#e8736b' };
    const ZONE_AT = {
      S: [50, 4, 46],
      T1: [70, 15, 15],
      T2: [25, 15, 60],
      T3: [25, 45, 30],
    };
    const ZONE_TEXT = {
      S: 'stray gassing',
      T1: 'methane rich',
      T2: 'ethane rich',
      T3: 'ethylene rich',
    };
    // One tick set per gas, on the edge where that gas has its 0 to 100 scale.
    const AXES = [
      { name: 'CH4', a: 'CH4', b: 'C2H4', third: 'C2H6', mk: (k) => [k, 100 - k, 0] },
      { name: 'C2H4', a: 'C2H4', b: 'C2H6', third: 'CH4', mk: (k) => [0, k, 100 - k] },
      { name: 'C2H6', a: 'C2H6', b: 'CH4', third: 'C2H4', mk: (k) => [100 - k, 0, k] },
    ];

    const toXY = (a, b, c) => ({
      x: (a * VERT.CH4.x + b * VERT.C2H4.x + c * VERT.C2H6.x) / 100,
      y: (a * VERT.CH4.y + b * VERT.C2H4.y + c * VERT.C2H6.y) / 100,
    });
    const make = (name, attrs, text) => {
      const node = document.createElementNS(NS, name);
      for (const key of Object.keys(attrs)) node.setAttribute(key, String(attrs[key]));
      if (text !== undefined) node.textContent = text;
      return node;
    };

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 600 540');
    svg.appendChild(make('rect', { x: 0, y: 0, width: 600, height: 540, fill: '#ffffff' }));

    const corners = [VERT.CH4, VERT.C2H4, VERT.C2H6];
    const outline = corners.map((v) => `${v.x},${v.y}`).join(' ');
    const clipId = 'dt5-clip-' + Math.random().toString(36).slice(2, 8);
    const defs = make('defs', {});
    const clip = make('clipPath', { id: clipId });
    clip.appendChild(make('polygon', { points: outline }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    // Zones: fill a 1 percent grid over the triangle, each cell coloured by classify().
    const STEP = SIDE / 100;
    const cell = STEP + 0.6;
    const zoneGroup = make('g', { 'clip-path': `url(#${clipId})` });
    for (let i = 0; i < 100; i++) {
      for (let j = 0; j < 100 - i; j++) {
        const a = i + 0.5;
        const b = j + 0.5;
        const c = 100 - i - j - 1;
        const zone = DuvalTriangle5.classify(a, b, c);
        const p = toXY(a, b, c);
        zoneGroup.appendChild(make('rect', {
          x: p.x - cell / 2,
          y: p.y - cell / 2,
          width: cell,
          height: cell,
          fill: COLORS[zone],
        }));
      }
    }
    svg.appendChild(zoneGroup);

    svg.appendChild(make('polygon', { points: outline, fill: 'none', stroke: '#333333', 'stroke-width': 1.5 }));

    // Zone labels.
    for (const zone of Object.keys(ZONE_AT)) {
      const p = toXY(...ZONE_AT[zone]);
      svg.appendChild(make('text', {
        x: p.x, y: p.y - 4, 'text-anchor': 'middle', 'font-family': 'sans-serif',
        'font-size': 17, 'font-weight': 'bold', fill: '#1e293b',
      }, zone));
      svg.appendChild(make('text', {
        x: p.x, y: p.y + 13, 'text-anchor': 'middle', 'font-family': 'sans-serif',
        'font-size': 11, fill: '#1e293b',
      }, ZONE_TEXT[zone]));
    }

    // Axes: ticks every 10 percent, axis title at the middle of each edge.
    for (const ax of AXES) {
      const P = VERT[ax.a];
      const Q = VERT[ax.b];
      const T = VERT[ax.third];
      const dx = Q.x - P.x;
      const dy = Q.y - P.y;
      const len = Math.hypot(dx, dy);
      let nx = dy / len;
      let ny = -dx / len;
      const midX = (P.x + Q.x) / 2;
      const midY = (P.y + Q.y) / 2;
      if (nx * (midX - T.x) + ny * (midY - T.y) < 0) {
        nx = -nx;
        ny = -ny;
      }
      for (let k = 10; k <= 90; k += 10) {
        const q = toXY(...ax.mk(k));
        svg.appendChild(make('line', {
          x1: q.x, y1: q.y, x2: q.x + 6 * nx, y2: q.y + 6 * ny,
          stroke: '#333333', 'stroke-width': 1,
        }));
        svg.appendChild(make('text', {
          x: q.x + 18 * nx, y: q.y + 18 * ny, 'text-anchor': 'middle',
          'dominant-baseline': 'middle', 'font-family': 'sans-serif', 'font-size': 12, fill: '#333333',
        }, String(k)));
      }
      svg.appendChild(make('text', {
        x: midX + 52 * nx, y: midY + 52 * ny, 'text-anchor': 'middle',
        'dominant-baseline': 'middle', 'font-family': 'sans-serif', 'font-size': 13,
        'font-weight': 'bold', fill: '#333333',
      }, `${ax.name} (%)`));
    }

    // Gas names at the corners.
    svg.appendChild(make('text', {
      x: VERT.CH4.x, y: 44, 'text-anchor': 'middle', 'font-family': 'sans-serif',
      'font-size': 14, 'font-weight': 'bold', fill: '#333333',
    }, 'CH4'));
    svg.appendChild(make('text', {
      x: VERT.C2H4.x - 6, y: 500, 'text-anchor': 'end', 'font-family': 'sans-serif',
      'font-size': 14, 'font-weight': 'bold', fill: '#333333',
    }, 'C2H4'));
    svg.appendChild(make('text', {
      x: VERT.C2H6.x + 6, y: 500, 'text-anchor': 'start', 'font-family': 'sans-serif',
      'font-size': 14, 'font-weight': 'bold', fill: '#333333',
    }, 'C2H6'));

    // Optional sample point.
    if (sample && typeof sample === 'object') {
      const s1 = Number(sample.ch4);
      const s2 = Number(sample.c2h4);
      const s3 = Number(sample.c2h6);
      const sum = s1 + s2 + s3;
      if (Number.isFinite(sum) && sum > 0) {
        const p = toXY((100 * s1) / sum, (100 * s2) / sum, (100 * s3) / sum);
        const code = DuvalTriangle5.classify(s1, s2, s3);
        svg.appendChild(make('circle', {
          cx: p.x, cy: p.y, r: 6, fill: '#111111', stroke: '#ffffff', 'stroke-width': 2,
        }));
        svg.appendChild(make('text', {
          x: p.x + 10, y: p.y - 10, 'font-family': 'sans-serif', 'font-size': 12,
          'font-weight': 'bold', fill: '#111111', stroke: '#ffffff', 'stroke-width': 3,
          'paint-order': 'stroke',
        }, `sample ${code}`));
      }
    }
  },
};
