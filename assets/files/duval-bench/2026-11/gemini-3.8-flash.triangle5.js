const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const sum = Number(ch4) + Number(c2h4) + Number(c2h6);
    if (!sum || sum <= 0) return 'ND';

    const y = (Number(ch4) / sum) * 100;   // %CH4
    const x = (Number(c2h4) / sum) * 100;  // %C2H4
    const z = (Number(c2h6) / sum) * 100;  // %C2H6

    if (y >= 98) return 'PD';
    if (x >= 50) return 'T3';
    if (x < 14) {
      if (z >= 35) return 'O';
      return 'T1';
    }
    // 14 <= x < 50
    if (z >= 25) return 'C';
    if (z >= 10) return 'T2';
    return 'ND';
  },

  render(svg, sample) {
    const svgNS = 'http://www.w3.org/2000/svg';

    function el(tag, attrs, text) {
      const elem = document.createElementNS(svgNS, tag);
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
          elem.setAttribute(k, v);
        }
      }
      if (text !== undefined && text !== null) {
        elem.textContent = text;
      }
      return elem;
    }

    // Clear any existing children
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Geometry of the ternary plot
    const Ax = 300, Ay = 48;       // 100% CH4 (Top)
    const Bx = 75,  By = 438;      // 100% C2H4 (Bottom-Left)
    const Cx = 525, Cy = 438;      // 100% C2H6 (Bottom-Right)

    function toXY(ch4, c2h4, c2h6) {
      const x = (ch4 * Ax + c2h4 * Bx + c2h6 * Cx) / 100;
      const y = (ch4 * Ay + c2h4 * By + c2h6 * Cy) / 100;
      return [x, y];
    }

    function pointsToString(pts) {
      return pts.map(([ch4, c2h4, c2h6]) => {
        const [px, py] = toXY(ch4, c2h4, c2h6);
        return `${px.toFixed(2)},${py.toFixed(2)}`;
      }).join(' ');
    }

    // Definitions of the 7 zones for Duval Triangle 5
    const zones = [
      {
        id: 'PD',
        name: 'Partial Discharge',
        color: '#B3E5FC',
        textPos: [98.8, 0.6, 0.6],
        pts: [
          [100, 0, 0],
          [98, 2, 0],
          [98, 0, 2]
        ]
      },
      {
        id: 'T1',
        name: 'Thermal Fault < 300 °C',
        color: '#FFF59D',
        textPos: [78, 6, 16],
        pts: [
          [98, 2, 0],
          [86, 14, 0],
          [51, 14, 35],
          [65, 0, 35],
          [98, 0, 2]
        ]
      },
      {
        id: 'O',
        name: 'Overheating < 250 °C',
        color: '#C8E6C9',
        textPos: [24, 6, 70],
        pts: [
          [65, 0, 35],
          [51, 14, 35],
          [0, 14, 86],
          [0, 0, 100]
        ]
      },
      {
        id: 'ND',
        name: 'Not Determined',
        color: '#E1BEE7',
        textPos: [63, 32, 5],
        pts: [
          [86, 14, 0],
          [50, 50, 0],
          [40, 50, 10],
          [76, 14, 10]
        ]
      },
      {
        id: 'T2',
        name: 'Thermal Fault 300–700 °C',
        color: '#FFE0B2',
        textPos: [50, 32, 18],
        pts: [
          [76, 14, 10],
          [40, 50, 10],
          [25, 50, 25],
          [61, 14, 25]
        ]
      },
      {
        id: 'C',
        name: 'Carbonization of Paper',
        color: '#D7CCC8',
        textPos: [21, 32, 47],
        pts: [
          [61, 14, 25],
          [25, 50, 25],
          [0, 50, 50],
          [0, 14, 86]
        ]
      },
      {
        id: 'T3',
        name: 'Thermal Fault > 700 °C',
        color: '#FFAB91',
        textPos: [16, 68, 16],
        pts: [
          [50, 50, 0],
          [0, 100, 0],
          [0, 50, 50]
        ]
      }
    ];

    // Background
    svg.appendChild(el('rect', {
      x: '0',
      y: '0',
      width: '600',
      height: '540',
      fill: '#FFFFFF'
    }));

    // Title
    svg.appendChild(el('text', {
      x: '300',
      y: '22',
      'text-anchor': 'middle',
      'font-family': 'sans-serif',
      'font-size': '15',
      'font-weight': 'bold',
      fill: '#212121'
    }, 'Duval Triangle 5 — Low-Temperature Faults'));

    // Subtitle
    svg.appendChild(el('text', {
      x: '300',
      y: '36',
      'text-anchor': 'middle',
      'font-family': 'sans-serif',
      'font-size': '10',
      fill: '#616161'
    }, 'Dissolved Gas Analysis (Mineral Oil)'));

    // Internal Grid Lines (20%, 40%, 60%, 80%)
    const gridGroup = el('g', {
      stroke: '#E0E0E0',
      'stroke-width': '0.7',
      'stroke-dasharray': '3,3'
    });

    for (let v = 20; v <= 80; v += 20) {
      // Lines of constant %CH4 (horizontal)
      const [p1x, p1y] = toXY(v, 100 - v, 0);
      const [p2x, p2y] = toXY(v, 0, 100 - v);
      gridGroup.appendChild(el('line', { x1: p1x, y1: p1y, x2: p2x, y2: p2y }));

      // Lines of constant %C2H4
      const [q1x, q1y] = toXY(100 - v, v, 0);
      const [q2x, q2y] = toXY(0, v, 100 - v);
      gridGroup.appendChild(el('line', { x1: q1x, y1: q1y, x2: q2x, y2: q2y }));

      // Lines of constant %C2H6
      const [r1x, r1y] = toXY(100 - v, 0, v);
      const [r2x, r2y] = toXY(0, 100 - v, v);
      gridGroup.appendChild(el('line', { x1: r1x, y1: r1y, x2: r2x, y2: r2y }));
    }
    svg.appendChild(gridGroup);

    // Render Filled Zones
    const zonesGroup = el('g', { id: 'fault-zones' });
    zones.forEach(zone => {
      const polygon = el('polygon', {
        points: pointsToString(zone.pts),
        fill: zone.color,
        stroke: '#424242',
        'stroke-width': '1',
        'stroke-linejoin': 'round'
      });
      zonesGroup.appendChild(polygon);
    });
    svg.appendChild(zonesGroup);

    // Zone Labels
    const labelsGroup = el('g', {
      'font-family': 'sans-serif',
      'font-weight': 'bold',
      'text-anchor': 'middle',
      'dominant-baseline': 'central'
    });

    zones.forEach(zone => {
      const [px, py] = toXY(...zone.textPos);
      const fontSize = zone.id === 'PD' ? '9' : '12';
      labelsGroup.appendChild(el('text', {
        x: px.toFixed(1),
        y: py.toFixed(1),
        'font-size': fontSize,
        fill: '#263238'
      }, zone.id));
    });
    svg.appendChild(labelsGroup);

    // Triangle Outer Border
    svg.appendChild(el('polygon', {
      points: `${Ax},${Ay} ${Bx},${By} ${Cx},${Cy}`,
      fill: 'none',
      stroke: '#212121',
      'stroke-width': '1.8'
    }));

    // Axis Tick Marks and Labels
    const ticksGroup = el('g', {
      stroke: '#424242',
      'stroke-width': '1'
    });
    const tickTextsGroup = el('g', {
      'font-family': 'sans-serif',
      'font-size': '9',
      fill: '#424242'
    });

    for (let v = 20; v <= 80; v += 20) {
      // 1. %CH4 scale along right edge CA (increasing bottom to top)
      const [cx1, cy1] = toXY(v, 0, 100 - v);
      const nx1 = 0.866, ny1 = -0.5; // outward normal
      ticksGroup.appendChild(el('line', {
        x1: cx1,
        y1: cy1,
        x2: cx1 + nx1 * 6,
        y2: cy1 + ny1 * 6
      }));
      tickTextsGroup.appendChild(el('text', {
        x: (cx1 + nx1 * 16).toFixed(1),
        y: (cy1 + ny1 * 16).toFixed(1),
        'text-anchor': 'start',
        'dominant-baseline': 'central'
      }, `${v}`));

      // 2. %C2H4 scale along left edge AB (increasing top to bottom)
      const [bx1, by1] = toXY(100 - v, v, 0);
      const nx2 = -0.866, ny2 = -0.5; // outward normal
      ticksGroup.appendChild(el('line', {
        x1: bx1,
        y1: by1,
        x2: bx1 + nx2 * 6,
        y2: by1 + ny2 * 6
      }));
      tickTextsGroup.appendChild(el('text', {
        x: (bx1 + nx2 * 16).toFixed(1),
        y: (by1 + ny2 * 16).toFixed(1),
        'text-anchor': 'end',
        'dominant-baseline': 'central'
      }, `${v}`));

      // 3. %C2H6 scale along bottom edge BC (increasing left to right)
      const [ax1, ay1] = toXY(0, 100 - v, v);
      ticksGroup.appendChild(el('line', {
        x1: ax1,
        y1: ay1,
        x2: ax1,
        y2: ay1 + 6
      }));
      tickTextsGroup.appendChild(el('text', {
        x: ax1.toFixed(1),
        y: (ay1 + 16).toFixed(1),
        'text-anchor': 'middle'
      }, `${v}`));
    }

    svg.appendChild(ticksGroup);
    svg.appendChild(tickTextsGroup);

    // Axis Titles and Gas Names
    const titlesGroup = el('g', {
      'font-family': 'sans-serif',
      'font-weight': 'bold'
    });

    // Vertex A: %CH4 (Top)
    titlesGroup.appendChild(el('text', {
      x: Ax,
      y: Ay - 12,
      'text-anchor': 'middle',
      'font-size': '13',
      fill: '#1565C0'
    }, '% CH₄'));

    // Vertex B: %C2H4 (Bottom-Left)
    titlesGroup.appendChild(el('text', {
      x: Bx - 14,
      y: By + 18,
      'text-anchor': 'end',
      'font-size': '13',
      fill: '#C62828'
    }, '% C₂H₄'));

    // Vertex C: %C2H6 (Bottom-Right)
    titlesGroup.appendChild(el('text', {
      x: Cx + 14,
      y: Cy + 18,
      'text-anchor': 'start',
      'font-size': '13',
      fill: '#2E7D32'
    }, '% C₂H₆'));

    // Axis Direction Labels
    titlesGroup.appendChild(el('text', {
      x: (Ax + Cx) / 2 + 32,
      y: (Ay + Cy) / 2 - 10,
      'text-anchor': 'middle',
      'font-size': '10',
      fill: '#1565C0',
      transform: `rotate(60, ${(Ax + Cx) / 2 + 32}, ${(Ay + Cy) / 2 - 10})`
    }, '% CH₄ →'));

    titlesGroup.appendChild(el('text', {
      x: (Ax + Bx) / 2 - 32,
      y: (Ay + By) / 2 - 10,
      'text-anchor': 'middle',
      'font-size': '10',
      fill: '#C62828',
      transform: `rotate(-60, ${(Ax + Bx) / 2 - 32}, ${(Ay + By) / 2 - 10})`
    }, '← % C₂H₄'));

    titlesGroup.appendChild(el('text', {
      x: (Bx + Cx) / 2,
      y: By + 32,
      'text-anchor': 'middle',
      'font-size': '10',
      fill: '#2E7D32'
    }, '% C₂H₆ →'));

    svg.appendChild(titlesGroup);

    // Compact Legend at Bottom
    const legendGroup = el('g', {
      'font-family': 'sans-serif',
      'font-size': '9',
      fill: '#37474F'
    });

    const legendItems = [
      { id: 'PD', label: 'PD: Partial discharge' },
      { id: 'T1', label: 'T1: Thermal < 300 °C' },
      { id: 'T2', label: 'T2: 300–700 °C' },
      { id: 'T3', label: 'T3: Thermal > 700 °C' },
      { id: 'C',  label: 'C: Carbonization of paper' },
      { id: 'O',  label: 'O: Overheating < 250 °C' },
      { id: 'ND', label: 'ND: Not determined' }
    ];

    // Row 1 (4 items)
    const row1 = legendItems.slice(0, 4);
    row1.forEach((item, i) => {
      const x = 50 + i * 135;
      const y = 494;
      const zone = zones.find(z => z.id === item.id);
      legendGroup.appendChild(el('rect', {
        x: x,
        y: y - 8,
        width: '10',
        height: '10',
        fill: zone.color,
        stroke: '#424242',
        'stroke-width': '0.8'
      }));
      legendGroup.appendChild(el('text', {
        x: x + 15,
        y: y,
        'dominant-baseline': 'central'
      }, item.label));
    });

    // Row 2 (3 items)
    const row2 = legendItems.slice(4);
    row2.forEach((item, i) => {
      const x = 80 + i * 165;
      const y = 512;
      const zone = zones.find(z => z.id === item.id);
      legendGroup.appendChild(el('rect', {
        x: x,
        y: y - 8,
        width: '10',
        height: '10',
        fill: zone.color,
        stroke: '#424242',
        'stroke-width': '0.8'
      }));
      legendGroup.appendChild(el('text', {
        x: x + 15,
        y: y,
        'dominant-baseline': 'central'
      }, item.label));
    });

    svg.appendChild(legendGroup);

    // Plot Sample Point (if provided)
    if (sample && typeof sample === 'object') {
      const ch4 = Number(sample.ch4) || 0;
      const c2h4 = Number(sample.c2h4) || 0;
      const c2h6 = Number(sample.c2h6) || 0;
      const sum = ch4 + c2h4 + c2h6;

      if (sum > 0) {
        const pCH4 = (ch4 / sum) * 100;
        const pC2H4 = (c2h4 / sum) * 100;
        const pC2H6 = (c2h6 / sum) * 100;
        const [sx, sy] = toXY(pCH4, pC2H4, pC2H6);
        const fault = this.classify(ch4, c2h4, c2h6);

        const sampleGroup = el('g', { id: 'sample-point' });

        // Outer Glow/Ring
        sampleGroup.appendChild(el('circle', {
          cx: sx.toFixed(2),
          cy: sy.toFixed(2),
          r: '7',
          fill: '#D50000',
          stroke: '#FFFFFF',
          'stroke-width': '2'
        }));

        // Inner Dot
        sampleGroup.appendChild(el('circle', {
          cx: sx.toFixed(2),
          cy: sy.toFixed(2),
          r: '3.5',
          fill: '#FFEB3B'
        }));

        // Callout Tag
        const tagText = `${fault} (${pCH4.toFixed(1)}%, ${pC2H4.toFixed(1)}%, ${pC2H6.toFixed(1)}%)`;
        const tagX = sx > 300 ? sx - 8 : sx + 8;
        const tagAnchor = sx > 300 ? 'end' : 'start';
        const tagY = sy < 100 ? sy + 18 : sy - 12;

        sampleGroup.appendChild(el('text', {
          x: tagX.toFixed(1),
          y: tagY.toFixed(1),
          'font-family': 'sans-serif',
          'font-size': '10',
          'font-weight': 'bold',
          'text-anchor': tagAnchor,
          fill: '#B71C1C'
        }, tagText));

        svg.appendChild(sampleGroup);
      }
    }
  }
};
