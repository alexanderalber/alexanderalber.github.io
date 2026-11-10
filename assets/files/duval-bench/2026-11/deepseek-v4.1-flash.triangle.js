const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total <= 0) return 'PD';
    const pCH4 = ch4 / total * 100;
    const pC2H4 = c2h4 / total * 100;
    const pC2H2 = c2h2 / total * 100;

    if (pCH4 >= 98) return 'PD';
    if (pC2H2 < 13) {
      if (pC2H4 < 23) return 'T1';
      if (pC2H4 < 38) return 'T2';
      return 'T3';
    }
    if (pC2H4 < 23) {
      if (pC2H2 < 29) return 'D1';
      return 'D2';
    }
    return 'DT';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';

    function create(tag, attrs) {
      const el = document.createElementNS(NS, tag);
      for (const key in attrs) {
        el.setAttribute(key, attrs[key]);
      }
      return el;
    }

    function toXY(pC2H4, pC2H2) {
      const pCH4 = 100 - pC2H4 - pC2H2;
      const x = (pCH4 * 300 + pC2H4 * 40 + pC2H2 * 560) / 100;
      const y = (pCH4 * 50 + pC2H4 * 500 + pC2H2 * 500) / 100;
      return { x, y };
    }

    const zones = [
      { name: 'PD', color: '#f8b4b4', vertices: [[0,0], [2,0], [0,2]] },
      { name: 'T1', color: '#f8e6b4', vertices: [[2,0], [0,2], [0,13], [23,13], [23,0]] },
      { name: 'T2', color: '#f8d4b4', vertices: [[23,0], [38,0], [38,13], [23,13]] },
      { name: 'T3', color: '#f8c4b4', vertices: [[38,0], [100,0], [87,13], [38,13]] },
      { name: 'D1', color: '#b4d8f8', vertices: [[0,13], [0,29], [23,29], [23,13]] },
      { name: 'D2', color: '#b4b4f8', vertices: [[0,29], [0,100], [23,77], [23,29]] },
      { name: 'DT', color: '#b4f8d8', vertices: [[23,13], [87,13], [23,77]] }
    ];

    zones.forEach(zone => {
      const points = zone.vertices.map(v => {
        const { x, y } = toXY(v[0], v[1]);
        return `${x},${y}`;
      }).join(' ');
      const poly = create('polygon', {
        points: points,
        fill: zone.color,
        stroke: '#333',
        'stroke-width': 1
      });
      svg.appendChild(poly);

      const avgX = zone.vertices.reduce((sum, v) => sum + v[0], 0) / zone.vertices.length;
      const avgY = zone.vertices.reduce((sum, v) => sum + v[1], 0) / zone.vertices.length;
      const { x, y } = toXY(avgX, avgY);
      const text = create('text', {
        x: x,
        y: y,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': 'Arial, sans-serif',
        'font-size': '14',
        'font-weight': 'bold',
        fill: '#000'
      });
      text.textContent = zone.name;
      svg.appendChild(text);
    });

    const triangle = create('polygon', {
      points: '300,50 40,500 560,500',
      fill: 'none',
      stroke: '#000',
      'stroke-width': 2
    });
    svg.appendChild(triangle);

    const tickColor = '#333';
    const tickLen = 8;

    [20, 40, 60, 80].forEach(p => {
      const x = 300 - 2.6 * p;
      const y = 50 + 4.5 * p;
      const dx = -0.866 * tickLen;
      const dy = -0.5 * tickLen;
      const line = create('line', {
        x1: x, y1: y, x2: x + dx, y2: y + dy,
        stroke: tickColor, 'stroke-width': 1
      });
      svg.appendChild(line);
      const text = create('text', {
        x: x - 18, y: y - 2,
        'text-anchor': 'end',
        'font-family': 'Arial, sans-serif',
        'font-size': '10',
        fill: '#000'
      });
      text.textContent = p + '%';
      svg.appendChild(text);
    });

    [20, 40, 60, 80].forEach(p => {
      const x = 300 + 2.6 * p;
      const y = 50 + 4.5 * p;
      const dx = 0.866 * tickLen;
      const dy = -0.5 * tickLen;
      const line = create('line', {
        x1: x, y1: y, x2: x + dx, y2: y + dy,
        stroke: tickColor, 'stroke-width': 1
      });
      svg.appendChild(line);
      const text = create('text', {
        x: x + 18, y: y - 2,
        'text-anchor': 'start',
        'font-family': 'Arial, sans-serif',
        'font-size': '10',
        fill: '#000'
      });
      text.textContent = p + '%';
      svg.appendChild(text);
    });

    [20, 40, 60, 80].forEach(p => {
      const x = 40 + 5.2 * p;
      const y = 500;
      const dx = 0;
      const dy = tickLen;
      const line = create('line', {
        x1: x, y1: y, x2: x + dx, y2: y + dy,
        stroke: tickColor, 'stroke-width': 1
      });
      svg.appendChild(line);
      const text = create('text', {
        x: x, y: y + 18,
        'text-anchor': 'middle',
        'font-family': 'Arial, sans-serif',
        'font-size': '10',
        fill: '#000'
      });
      text.textContent = p + '%';
      svg.appendChild(text);
    });

    const labels = [
      { text: 'CH4', x: 300, y: 30, anchor: 'middle' },
      { text: 'C2H4', x: 30, y: 525, anchor: 'middle' },
      { text: 'C2H2', x: 570, y: 525, anchor: 'middle' }
    ];
    labels.forEach(l => {
      const text = create('text', {
        x: l.x, y: l.y,
        'text-anchor': l.anchor,
        'font-family': 'Arial, sans-serif',
        'font-size': '16',
        'font-weight': 'bold',
        fill: '#000'
      });
      text.textContent = l.text;
      svg.appendChild(text);
    });

    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const pC2H4 = sample.c2h4 / total * 100;
        const pC2H2 = sample.c2h2 / total * 100;
        const { x, y } = toXY(pC2H4, pC2H2);
        const circle = create('circle', {
          cx: x, cy: y, r: 5,
          fill: 'red', stroke: '#000', 'stroke-width': 1
        });
        svg.appendChild(circle);
      }
    }
  }
};
