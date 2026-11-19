const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    const h2p = h2 / total * 100;
    const ch4p = ch4 / total * 100;
    const c2h6p = c2h6 / total * 100;
    const c2h4p = c2h4 / total * 100;
    const c2h2p = c2h2 / total * 100;

    if (c2h2p > 0.1) return 'D1';
    if (c2h4p > 2) return 'D2';
    if (c2h6p > 3 && c2h6p / c2h4p > 1) return 'T1';
    if (c2h6p > 3 && c2h6p / c2h4p <= 1) return 'T2';
    if (ch4p > 12) return 'D3';
    if (h2p > 720 && ch4p < 12) return 'D3';
    if (h2p > 100 && ch4p < 12) return 'T3';
    return 'Normal';
  },
  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';
    const pentagon = document.createElementNS(ns, 'polygon');
    pentagon.setAttribute('points', '300,0 600,300 300,600 0,600 0,300');
    pentagon.setAttribute('fill', 'none');
    pentagon.setAttribute('stroke', 'black');
    svg.appendChild(pentagon);

    const zones = [
      { x: 100, y: 100, label: 'Normal' },
      { x: 200, y: 200, label: 'T1' },
      { x: 250, y: 300, label: 'T2' },
      { x: 400, y: 200, label: 'T3' },
      { x: 500, y: 100, label: 'D1' },
      { x: 450, y: 300, label: 'D2' },
      { x: 300, y: 500, label: 'D3' },
    ];

    zones.forEach((zone) => {
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', zone.x - 20);
      rect.setAttribute('y', zone.y - 20);
      rect.setAttribute('width', 40);
      rect.setAttribute('height', 40);
      rect.setAttribute('fill', 'lightgray');
      svg.appendChild(rect);

      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', zone.x);
      text.setAttribute('y', zone.y + 5);
      text.setAttribute('text-anchor', 'middle');
      text.textContent = zone.label;
      svg.appendChild(text);
    });

    const axes = [
      { x1: 300, y1: 0, x2: 300, y2: 600, label: 'H2' },
      { x1: 0, y1: 300, x2: 600, y2: 300, label: 'CH4' },
      { x1: 0, y1: 0, x2: 600, y2: 600, label: 'C2H6' },
      { x1: 0, y1: 600, x2: 600, y2: 0, label: 'C2H4' },
      { x1: 300, y1: 300, x2: 0, y2: 0, label: 'C2H2' },
    ];

    axes.forEach((axis) => {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', axis.x1);
      line.setAttribute('y1', axis.y1);
      line.setAttribute('x2', axis.x2);
      line.setAttribute('y2', axis.y2);
      line.setAttribute('stroke', 'black');
      svg.appendChild(line);

      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', axis.x2);
      text.setAttribute('y', axis.y2 + 20);
      text.setAttribute('text-anchor', 'middle');
      text.textContent = axis.label;
      svg.appendChild(text);
    });

    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      const h2p = sample.h2 / total * 100;
      const ch4p = sample.ch4 / total * 100;
      const c2h6p = sample.c2h6 / total * 100;
      const c2h4p = sample.c2h4 / total * 100;
      const c2h2p = sample.c2h2 / total * 100;

      const x = 300 + (c2h6p - c2h4p) * 2;
      const y = 300 + (h2p - ch4p) * 2;

      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', 10);
      circle.setAttribute('fill', 'red');
      svg.appendChild(circle);
    }
  }
};
