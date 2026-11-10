const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const sum = ch4 + c2h4 + c2h2;
    if (sum <= 0) return 'PD';
    const u = (ch4 / sum) * 100;  // %CH4
    const v = (c2h4 / sum) * 100; // %C2H4
    const w = (c2h2 / sum) * 100; // %C2H2

    if (u >= 98) return 'PD';
    if (w < 4) {
      if (v < 20) return 'T1';
      if (v < 50) return 'T2';
      return 'T3';
    }
    if (v < 23) return 'D1';
    if (v >= 50 && w < 15) return 'T3';
    if (v < 40 && w < 13) return 'DT';
    if (v >= 40 && w < 29) return 'DT';
    return 'D2';
  },

  render(svg, sample) {
    const svgNS = 'http://www.w3.org/2000/svg';

    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    function create(tag, attrs, text) {
      const el = document.createElementNS(svgNS, tag);
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
          el.setAttribute(k, v);
        }
      }
      if (text !== undefined && text !== null) {
        el.textContent = text;
      }
      return el;
    }

    const Ax = 300, Ay = 50;       // Apex: 100% CH4
    const Bx = 80,  By = 431.05;   // Bottom-left: 100% C2H2
    const Cx = 520, Cy = 431.05;   // Bottom-right: 100% C2H4

    function toXY(u, v, w) {
      const x = (u * Ax + v * Cx + w * Bx) / 100;
      const y = (u * Ay + v * Cy + w * By) / 100;
      return [x, y];
    }

    function pointsStr(pts) {
      return pts.map(([u, v, w]) => {
        const [x, y] = toXY(u, v, w);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      }).join(' ');
    }

    // White background
    svg.appendChild(create('rect', {
      x: '0',
      y: '0',
      width: '600',
      height: '540',
      fill: '#ffffff'
    }));

    // Zone polygons: [u (%CH4), v (%C2H4), w (%C2H2)]
    const zones = [
      {
        id: 'PD',
        name: 'PD',
        fill: '#b3e5fc',
        pts: [
          [100, 0, 0],
          [98, 2, 0],
          [98, 0, 2]
        ],
        labelPos: [98.8, 0.6, 0.6]
      },
      {
        id: 'T1',
        name: 'T1',
        fill: '#fff9c4',
        pts: [
          [98, 0, 2],
          [98, 2, 0],
          [80, 20, 0],
          [76, 20, 4],
          [96, 0, 4]
        ],
        labelPos: [86, 11, 3]
      },
      {
        id: 'T2',
        name: 'T2',
        fill: '#ffe082',
        pts: [
          [80, 20, 0],
          [50, 50, 0],
          [46, 50, 4],
          [76, 20, 4]
        ],
        labelPos: [63, 35, 2]
      },
      {
        id: 'T3',
        name: 'T3',
        fill: '#ffab91',
        pts: [
          [50, 50, 0],
          [0, 100, 0],
          [0, 85, 15],
          [35, 50, 15]
        ],
        labelPos: [24, 70, 6]
      },
      {
        id: 'D1',
        name: 'D1',
        fill: '#e1bee7',
        pts: [
          [98, 0, 2],
          [96, 0, 4],
          [76, 20, 4],
          [73, 23, 4],
          [0, 23, 77],
          [0, 0, 100]
        ],
        labelPos: [52, 9, 39]
      },
      {
        id: 'D2',
        name: 'D2',
        fill: '#c5cae9',
        pts: [
          [64, 23, 13],
          [47, 40, 13],
          [31, 40, 29],
          [0, 71, 29],
          [0, 23, 77]
        ],
        labelPos: [18, 36, 46]
      },
      {
        id: 'DT',
        name: 'DT',
        fill: '#c8e6c9',
        pts: [
          [73, 23, 4],
          [46, 50, 4],
          [35, 50, 15],
          [0, 85, 15],
          [0, 71, 29],
          [31, 40, 29],
          [47, 40, 13],
          [64, 23, 13]
        ],
        labelPos: [34, 46, 20]
      }
    ];

    const zonesGroup = create('g', { id: 'zones' });
    for (const z of zones) {
      zonesGroup.appendChild(create('polygon', {
        points: pointsStr(z.pts),
        fill: z.fill,
        stroke: '#455a64',
        'stroke-width': '1',
        'stroke-linejoin': 'round'
      }));
    }
    svg.appendChild(zonesGroup);

    // Zone Labels
    const labelsGroup = create('g', {
      id: 'zone-labels',
      'font-family': 'Helvetica, Arial, sans-serif',
      'font-size': '12',
      'font-weight': 'bold',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      fill: '#263238'
    });
    for (const z of zones) {
      const [lx, ly] = toXY(...z.labelPos);
      const textEl = create('text', { x: lx.toFixed(1), y: ly.toFixed(1) }, z.name);
      if (z.id === 'PD') {
        textEl.setAttribute('font-size', '9');
      }
      labelsGroup.appendChild(textEl);
    }
    svg.appendChild(labelsGroup);

    // Outer Triangle Outline
    svg.appendChild(create('polygon', {
      points: `${Ax},${Ay} ${Bx},${By} ${Cx},${Cy}`,
      fill: 'none',
      stroke: '#212121',
      'stroke-width': '2'
    }));

    // Grid Ticks and Values
    const ticksGroup = create('g', {
      id: 'ticks',
      'font-family': 'Helvetica, Arial, sans-serif',
      'font-size': '10',
      fill: '#424242'
    });

    for (let p = 10; p < 100; p += 10) {
      // 1. %CH4 axis (Left edge AB, values increase B -> A)
      const [lx1, ly1] = toXY(p, 0, 100 - p);
      const lx2 = lx1 - 6 * 0.866;
      const ly2 = ly1 - 6 * 0.5;
      ticksGroup.appendChild(create('line', {
        x1: lx1.toFixed(1), y1: ly1.toFixed(1),
        x2: lx2.toFixed(1), y2: ly2.toFixed(1),
        stroke: '#212121', 'stroke-width': '1'
      }));
      const ltext = create('text', {
        x: (lx1 - 10 * 0.866).toFixed(1),
        y: (ly1 - 10 * 0.5 + 3).toFixed(1),
        'text-anchor': 'end'
      }, String(p));
      ticksGroup.appendChild(ltext);

      // 2. %C2H4 axis (Right edge AC, values increase A -> C)
      const [rx1, ry1] = toXY(100 - p, p, 0);
      const rx2 = rx1 + 6 * 0.866;
      const ry2 = ry1 - 6 * 0.5;
      ticksGroup.appendChild(create('line', {
        x1: rx1.toFixed(1), y1: ry1.toFixed(1),
        x2: rx2.toFixed(1), y2: ry2.toFixed(1),
        stroke: '#212121', 'stroke-width': '1'
      }));
      const rtext = create('text', {
        x: (rx1 + 10 * 0.866).toFixed(1),
        y: (ry1 - 10 * 0.5 + 3).toFixed(1),
        'text-anchor': 'start'
      }, String(p));
      ticksGroup.appendChild(rtext);

      // 3. %C2H2 axis (Bottom edge CB, values increase C -> B)
      const [bx1, by1] = toXY(0, 100 - p, p);
      const bx2 = bx1;
      const by2 = by1 + 6;
      ticksGroup.appendChild(create('line', {
        x1: bx1.toFixed(1), y1: by1.toFixed(1),
        x2: bx2.toFixed(1), y2: by2.toFixed(1),
        stroke: '#212121', 'stroke-width': '1'
      }));
      const btext = create('text', {
        x: bx1.toFixed(1),
        y: (by1 + 17).toFixed(1),
        'text-anchor': 'middle'
      }, String(p));
      ticksGroup.appendChild(btext);
    }
    svg.appendChild(ticksGroup);

    // Axis Titles and Corners
    const titlesGroup = create('g', {
      'font-family': 'Helvetica, Arial, sans-serif',
      'font-weight': 'bold',
      fill: '#1a237e'
    });

    // % CH4 Axis Label (aligned along left side)
    const ch4Label = create('text', {
      x: '170',
      y: '225',
      'font-size': '14',
      'text-anchor': 'middle',
      transform: 'rotate(-60 170 225)'
    }, '% CH4 →');
    titlesGroup.appendChild(ch4Label);

    // % C2H4 Axis Label (aligned along right side)
    const c2h4Label = create('text', {
      x: '430',
      y: '225',
      'font-size': '14',
      'text-anchor': 'middle',
      transform: 'rotate(60 430 225)'
    }, '← % C2H4');
    titlesGroup.appendChild(c2h4Label);

    // % C2H2 Axis Label (bottom)
    const c2h2Label = create('text', {
      x: '300',
      y: '475',
      'font-size': '14',
      'text-anchor': 'middle'
    }, '← % C2H2');
    titlesGroup.appendChild(c2h2Label);

    // Vertex gas titles
    titlesGroup.appendChild(create('text', {
      x: '300',
      y: '28',
      'font-size': '13',
      'text-anchor': 'middle',
      fill: '#0d47a1'
    }, '100% CH4'));

    titlesGroup.appendChild(create('text', {
      x: '45',
      y: '450',
      'font-size': '13',
      'text-anchor': 'middle',
      fill: '#0d47a1'
    }, '100% C2H2'));

    titlesGroup.appendChild(create('text', {
      x: '555',
      y: '450',
      'font-size': '13',
      'text-anchor': 'middle',
      fill: '#0d47a1'
    }, '100% C2H4'));

    svg.appendChild(titlesGroup);

    // Plot sample if provided
    if (sample && typeof sample === 'object') {
      const ch4 = Number(sample.ch4) || 0;
      const c2h4 = Number(sample.c2h4) || 0;
      const c2h2 = Number(sample.c2h2) || 0;
      const total = ch4 + c2h4 + c2h2;

      if (total > 0) {
        const u = (ch4 / total) * 100;
        const v = (c2h4 / total) * 100;
        const w = (c2h2 / total) * 100;
        const [sx, sy] = toXY(u, v, w);
        const zone = this.classify(ch4, c2h4, c2h2);

        const sampleGroup = create('g', { id: 'sample-marker' });

        sampleGroup.appendChild(create('circle', {
          cx: sx.toFixed(1),
          cy: sy.toFixed(1),
          r: '7',
          fill: '#ff1744',
          'fill-opacity': '0.3',
          stroke: '#d50000',
          'stroke-width': '1.5'
        }));

        sampleGroup.appendChild(create('circle', {
          cx: sx.toFixed(1),
          cy: sy.toFixed(1),
          r: '3.5',
          fill: '#d50000',
          stroke: '#ffffff',
          'stroke-width': '1'
        }));

        const tagText = `${zone} (${u.toFixed(1)}%, ${v.toFixed(1)}%, ${w.toFixed(1)}%)`;
        const textOffset = sx > 400 ? -8 : 8;
        const anchor = sx > 400 ? 'end' : 'start';

        sampleGroup.appendChild(create('text', {
          x: (sx + textOffset).toFixed(1),
          y: (sy - 8).toFixed(1),
          'font-family': 'Helvetica, Arial, sans-serif',
          'font-size': '11',
          'font-weight': 'bold',
          fill: '#b71c1c',
          'text-anchor': anchor
        }, tagText));

        svg.appendChild(sampleGroup);
      }
    }
  }
};
