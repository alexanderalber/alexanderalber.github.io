const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const x = c2h2 / total;
    const y = c2h4 / total;
    const z = ch4 / total;
    if (x < 0.13 && y < 0.23) return 'T1';
    if (x < 0.13) return 'T2';
    if (y < 0.23 && z < 0.98 * (1 - x) - 0.05) return 'T3';
    if (x > 0.5) return 'D1';
    if (y > 0.5) return 'D2';
    return 'PD';
  },
  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';
    const drawPolygon = (points, cls) => {
      const poly = document.createElementNS(ns, 'polygon');
      poly.setAttribute('points', points.map(([x, y]) => `${x},${y}`).join(' '));
      poly.classList.add(cls);
      svg.appendChild(poly);
    };
    const drawText = (x, y, text) => {
      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', x);
      txt.setAttribute('y', y);
      txt.textContent = text;
      svg.appendChild(txt);
    };
    const drawLine = (x1, y1, x2, y2) => {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      svg.appendChild(line);
    };
    const drawTick = (x, y, dx, dy) => {
      drawLine(x, y, x + dx, y + dy);
    };

    // Zones
    drawPolygon([[520, 40], [300, 260], [40, 500]], 'pd');
    drawPolygon([[300, 260], [230, 310], [40, 500]], 'd2');
    drawPolygon([[230, 310], [130, 410], [40, 500]], 't3');
    drawPolygon([[130, 410], [40, 500]], 't2');
    drawPolygon([[40, 500], [520, 40]], 't1');
    drawPolygon([[300, 260], [370, 170], [520, 40]], 'd1');

    // Labels
    drawText(450, 70, 'D1');
    drawText(350, 280, 'D2');
    drawText(80, 520, 'T3');
    drawText(120, 440, 'T2');
    drawText(280, 380, 'T1');
    drawText(480, 240, 'PD');

    // Axes and ticks
    drawLine(40, 500, 520, 40);
    drawLine(40, 500, 300, 260);
    drawLine(300, 260, 520, 40);
    for (let i = 1; i < 10; i++) {
      const x = 40 + (480 * i) / 10;
      const y = 500 - (460 * i) / 10;
      drawTick(x, y, i % 2 ? 0 : 6, i % 2 ? -6 : 0);
    }
    for (let i = 1; i < 5; i++) {
      const x = 40 + (260 * i) / 5;
      const y = 500 - (240 * i) / 5;
      drawTick(x, y, i % 2 ? -4 : 4, i % 2 ? 4 : -4);
    }
    for (let i = 1; i < 5; i++) {
      const x = 300 + (220 * i) / 5;
      const y = 260 - (220 * i) / 5;
      drawTick(x, y, i % 2 ? 4 : -4, i % 2 ? 4 : -4);
    }

    // Axis labels
    drawText(560, 40, 'C2H2');
    drawText(20, 520, 'CH4');
    drawText(300, 240, 'C2H4');

    // Sample point
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const x = 40 + 480 * sample.c2h2 / total;
        const y = 500 - 460 * sample.c2h4 / total;
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', 5);
        svg.appendChild(circle);
      }
    }
  }
};
