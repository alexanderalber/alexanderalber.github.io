const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const sum = ch4 + c2h4 + c2h2;
    if (sum <= 0) return 'N/A';
    
    const pCH4 = (ch4 / sum) * 100;
    const pC2H4 = (c2h4 / sum) * 100;
    const pC2H2 = (c2h2 / sum) * 100;

    if (pCH4 >= 98) return 'PD';
    if (pC2H2 < 4 && pC2H4 < 20) return 'T1';
    if (pC2H2 < 4 && pC2H4 >= 20 && pC2H4 < 50) return 'T2';
    if (pC2H2 < 15 && pC2H4 >= 50) return 'T3';
    if (pC2H2 >= 4 && pC2H2 < 13 && pC2H4 >= 23 && pC2H4 < 50) return 'DT';
    if (pC2H2 >= 13 && pC2H4 >= 23 && pC2H4 < 50) return 'D2';
    if (pC2H2 >= 15 && pC2H4 >= 50) return 'D2';
    return 'D1';
  },

  render(svg, sample) {
    const SVG_NS = "http://www.w3.org/2000/svg";
    svg.innerHTML = '';
    
    // Triangle vertices
    const TOP = { x: 300, y: 40 };
    const BR = { x: 550, y: 473 };
    const BL = { x: 50, y: 473 };

    // Coordinate mapping (barycentric)
    // %CH4 -> TOP, %C2H4 -> Bottom Right, %C2H2 -> Bottom Left
    function getPoint(c2h2, c2h4) {
      const ch4 = 100 - c2h2 - c2h4;
      const x = (ch4 * TOP.x + c2h4 * BR.x + c2h2 * BL.x) / 100;
      const y = (ch4 * TOP.y + c2h4 * BR.y + c2h2 * BL.y) / 100;
      return `${x},${y}`;
    }

    const zones = [
      {
        id: 'PD',
        color: '#ffcccc',
        points: [
          getPoint(0, 0), getPoint(2, 0), getPoint(0, 2)
        ],
        label: { c2h2: 0.5, c2h4: 0.5 }
      },
      {
        id: 'T1',
        color: '#ffe6cc',
        points: [
          getPoint(2, 0), getPoint(4, 0), getPoint(4, 20), getPoint(0, 20), getPoint(0, 2)
        ],
        label: { c2h2: 2, c2h4: 10 }
      },
      {
        id: 'T2',
        color: '#fff2cc',
        points: [
          getPoint(0, 20), getPoint(4, 20), getPoint(4, 50), getPoint(0, 50)
        ],
        label: { c2h2: 2, c2h4: 35 }
      },
      {
        id: 'T3',
        color: '#d9ead3',
        points: [
          getPoint(0, 50), getPoint(15, 50), getPoint(15, 85), getPoint(0, 100)
        ],
        label: { c2h2: 5, c2h4: 70 }
      },
      {
        id: 'D1',
        color: '#cfe2f3',
        points: [
          getPoint(4, 0), getPoint(100, 0), getPoint(77, 23), getPoint(4, 23)
        ],
        label: { c2h2: 40, c2h4: 10 }
      },
      {
        id: 'DT',
        color: '#ead1dc',
        points: [
          getPoint(4, 23), getPoint(13, 23), getPoint(13, 50), getPoint(4, 50)
        ],
        label: { c2h2: 8, c2h4: 35 }
      },
      {
        id: 'D2',
        color: '#c9daf8',
        points: [
          getPoint(13, 23), getPoint(77, 23), getPoint(15, 85), getPoint(15, 50), getPoint(13, 50)
        ],
        label: { c2h2: 30, c2h4: 40 }
      }
    ];

    // Draw Zones
    zones.forEach(zone => {
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', zone.points.join(' '));
      poly.setAttribute('fill', zone.color);
      poly.setAttribute('stroke', '#333');
      poly.setAttribute('stroke-width', '1');
      svg.appendChild(poly);

      // Label
      const text = document.createElementNS(SVG_NS, 'text');
      const center = getPoint(zone.label.c2h2, zone.label.c2h4).split(',');
      text.setAttribute('x', center[0]);
      text.setAttribute('y', center[1]);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-family', 'sans-serif');
      text.setAttribute('font-size', '14');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#333');
      text.textContent = zone.id;
      svg.appendChild(text);
    });

    // Outer frame
    const frame = document.createElementNS(SVG_NS, 'polygon');
    frame.setAttribute('points', `${TOP.x},${TOP.y} ${BR.x},${BR.y} ${BL.x},${BL.y}`);
    frame.setAttribute('fill', 'none');
    frame.setAttribute('stroke', '#000');
    frame.setAttribute('stroke-width', '2');
    svg.appendChild(frame);

    // Axes Labels
    const labels = [
      { text: '% CH4', x: 300, y: 20 },
      { text: '% C2H4', x: 570, y: 485 },
      { text: '% C2H2', x: 30, y: 485 }
    ];
    labels.forEach(l => {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', l.x);
      text.setAttribute('y', l.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'sans-serif');
      text.setAttribute('font-size', '16');
      text.setAttribute('font-weight', 'bold');
      text.textContent = l.text;
      svg.appendChild(text);
    });

    // Helper for tick marks
    function drawTick(p1, p2, label, anchor, dx, dy) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', p1[0]);
      line.setAttribute('y1', p1[1]);
      line.setAttribute('x2', p2[0]);
      line.setAttribute('y2', p2[1]);
      line.setAttribute('stroke', '#000');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      if (label) {
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', parseFloat(p2[0]) + dx);
        text.setAttribute('y', parseFloat(p2[1]) + dy);
        text.setAttribute('text-anchor', anchor);
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('font-family', 'sans-serif');
        text.setAttribute('font-size', '10');
        text.textContent = label;
        svg.appendChild(text);
      }
    }

    for (let i = 10; i < 100; i += 10) {
      // CH4 axis (Left)
      const ch4Pt = getPoint(100 - i, 0).split(',');
      const ch4Tick = [parseFloat(ch4Pt[0]) - 8, parseFloat(ch4Pt[1]) - 4];
      drawTick(ch4Pt, ch4Tick, i.toString(), 'end', -2, 0);

      // C2H4 axis (Right)
      const c2h4Pt = getPoint(0, i).split(',');
      const c2h4Tick = [parseFloat(c2h4Pt[0]) + 8, parseFloat(c2h4Pt[1]) - 4];
      drawTick(c2h4Pt, c2h4Tick, i.toString(), 'start', 2, 0);

      // C2H2 axis (Bottom)
      const c2h2Pt = getPoint(i, 100 - i).split(',');
      const c2h2Tick = [parseFloat(c2h2Pt[0]), parseFloat(c2h2Pt[1]) + 8];
      drawTick(c2h2Pt, c2h2Tick, i.toString(), 'middle', 0, 8);
    }

    // Mark sample
    if (sample && typeof sample.ch4 === 'number' && typeof sample.c2h4 === 'number' && typeof sample.c2h2 === 'number') {
      const sum = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (sum > 0) {
        const pC2H2 = (sample.c2h2 / sum) * 100;
        const pC2H4 = (sample.c2h4 / sum) * 100;
        const pt = getPoint(pC2H2, pC2H4).split(',');

        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', pt[0]);
        circle.setAttribute('cy', pt[1]);
        circle.setAttribute('r', '6');
        circle.setAttribute('fill', '#ff0000');
        circle.setAttribute('stroke', '#000000');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);
      }
    }
  }
};
