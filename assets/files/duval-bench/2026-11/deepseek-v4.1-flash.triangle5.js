const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total === 0) return 'T2';
    const ch4_p = (ch4 / total) * 100;
    const c2h4_p = (c2h4 / total) * 100;
    const c2h6_p = (c2h6 / total) * 100;

    if (ch4_p >= 98) return 'PD';
    if (c2h6_p >= 80) return 'T1';
    if (c2h4_p >= 80) return 'T3';
    if (c2h4_p <= 20 && c2h6_p <= 20) return 'D1';
    if (c2h4_p > 20 && c2h4_p <= 40 && c2h6_p <= 20) return 'D2';
    return 'T2';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';

    function create(tag, attrs) {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) {
        el.setAttribute(k, attrs[k]);
      }
      return el;
    }

    // Triangle vertices
    const V_CH4 = { x: 60, y: 480 };
    const V_C2H4 = { x: 300, y: 64.308 };
    const V_C2H6 = { x: 540, y: 480 };

    // Convert (x, y) percentages to SVG coordinates
    function toSVG(x, y) {
      const x_svg = 60 + 2.4 * x + 4.8 * y;
      const y_svg = 480 - 4.15692 * x;
      return { x: x_svg, y: y_svg };
    }

    // Draw triangle border
    const borderPoints = [
      `${V_CH4.x},${V_CH4.y}`,
      `${V_C2H4.x},${V_C2H4.y}`,
      `${V_C2H6.x},${V_C2H6.y}`
    ].join(' ');
    svg.appendChild(create('polygon', {
      points: borderPoints,
      fill: 'none',
      stroke: 'black',
      'stroke-width': 2
    }));

    // Zone definitions
    const zones = [
      { name: 'PD', points: [[0, 0], [2, 0], [0, 2]], fill: '#fdd' },
      { name: 'D1', points: [[2, 0], [20, 0], [20, 20], [0, 20], [0, 2]], fill: '#fdf' },
      { name: 'D2', points: [[20, 0], [40, 0], [40, 20], [20, 20]], fill: '#dff' },
      { name: 'T3', points: [[80, 0], [100, 0], [80, 20]], fill: '#ffd' },
      { name: 'T1', points: [[0, 80], [0, 100], [20, 80]], fill: '#fdd' },
      { name: 'T2', points: [[0, 20], [40, 20], [40, 0], [80, 0], [80, 20], [20, 80], [0, 80]], fill: '#eee' }
    ];

    // Draw zones and labels
    zones.forEach(zone => {
      const svgPoints = zone.points.map(p => {
        const pt = toSVG(p[0], p[1]);
        return `${pt.x},${pt.y}`;
      }).join(' ');
      svg.appendChild(create('polygon', {
        points: svgPoints,
        fill: zone.fill,
        stroke: 'black',
        'stroke-width': 1
      }));

      // Centroid for label
      let sumX = 0, sumY = 0;
      zone.points.forEach(p => {
        sumX += p[0];
        sumY += p[1];
      });
      const cx = sumX / zone.points.length;
      const cy = sumY / zone.points.length;
      const labelPos = toSVG(cx, cy);

      const text = create('text', {
        x: labelPos.x,
        y: labelPos.y,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': 'sans-serif',
        'font-size': '14',
        'font-weight': 'bold',
        fill: 'black'
      });
      text.textContent = zone.name;
      svg.appendChild(text);
    });

    // Draw gas names
    function addGasLabel(text, x, y, anchor) {
      const el = create('text', {
        x: x,
        y: y,
        'text-anchor': anchor,
        'font-family': 'sans-serif',
        'font-size': '16',
        'font-weight': 'bold',
        fill: 'black'
      });
      el.textContent = text;
      svg.appendChild(el);
    }

    addGasLabel('CH4', V_CH4.x - 10, V_CH4.y + 20, 'end');
    addGasLabel('C2H4', V_C2H4.x, V_C2H4.y - 10, 'middle');
    addGasLabel('C2H6', V_C2H6.x + 10, V_C2H6.y + 20, 'start');

    // Draw tick marks on edges
    function drawTicks(p1, p2) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;

      for (let p = 20; p <= 80; p += 20) {
        const t = p / 100;
        const x = p1.x + t * dx;
        const y = p1.y + t * dy;
        const tickLen = 8;
        const x1 = x - (px * tickLen) / 2;
        const y1 = y - (py * tickLen) / 2;
        const x2 = x + (px * tickLen) / 2;
        const y2 = y + (py * tickLen) / 2;
        svg.appendChild(create('line', {
          x1, y1, x2, y2,
          stroke: 'black',
          'stroke-width': 1
        }));
      }
    }

    drawTicks(V_CH4, V_C2H6);
    drawTicks(V_CH4, V_C2H4);
    drawTicks(V_C2H4, V_C2H6);

    // Draw sample point if provided
    if (sample) {
      const { ch4, c2h4, c2h6 } = sample;
      const total = ch4 + c2h4 + c2h6;
      if (total > 0) {
        const x = (c2h4 / total) * 100;
        const y = (c2h6 / total) * 100;
        const pt = toSVG(x, y);
        svg.appendChild(create('circle', {
          cx: pt.x,
          cy: pt.y,
          r: 5,
          fill: 'red',
          stroke: 'black',
          'stroke-width': 1
        }));
      }
    }
  }
};
