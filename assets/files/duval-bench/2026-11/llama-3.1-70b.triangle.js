const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    if (ch4 + c2h4 + c2h2 === 0) return 'No Fault';
    const norm = ch4 + c2h4 + c2h2;
    const ch4p = ch4 / norm * 100;
    const c2h4p = c2h4 / norm * 100;
    const c2h2p = c2h2 / norm * 100;
    if (c2h2p > 0.5) return 'D1';
    if (c2h4p > 3) return 'D2';
    if (ch4p > 0.1 * c2h4p + 10) return 'T1';
    if (ch4p > 0.4 * c2h4p + 2) return 'T2';
    if (ch4p > 0.2 * c2h4p + 1) return 'T3';
    return 'Normal';
  },
  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    svg.appendChild(g);
    const zones = [
      {x: 0, y: 0, width: 600, height: 540, fill: '#C0C0C0', label: 'Normal', xLabel: 300, yLabel: 520},
      {x: 0, y: 0, width: 200, height: 540, fill: '#FFFF00', label: 'T1', xLabel: 100, yLabel: 520},
      {x: 200, y: 0, width: 200, height: 400, fill: '#FFFF00', label: 'T2', xLabel: 300, yLabel: 380},
      {x: 400, y: 0, width: 200, height: 280, fill: '#FFFF00', label: 'T3', xLabel: 500, yLabel: 260},
      {x: 0, y: 400, width: 200, height: 140, fill: '#00FFFF', label: 'D2', xLabel: 100, yLabel: 460},
      {x: 0, y: 540, width: 600, height: 60, fill: '#00FFFF', label: 'D1', xLabel: 300, yLabel: 580},
    ];
    zones.forEach(zone => {
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', zone.x);
      rect.setAttribute('y', zone.y);
      rect.setAttribute('width', zone.width);
      rect.setAttribute('height', zone.height);
      rect.setAttribute('fill', zone.fill);
      g.appendChild(rect);
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', zone.xLabel);
      text.setAttribute('y', zone.yLabel);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '24');
      text.textContent = zone.label;
      g.appendChild(text);
    });
    const axes = [
      {x1: 0, y1: 540, x2: 600, y2: 540, label: 'CH4'},
      {x1: 600, y1: 540, x2: 600, y2: 0, label: 'C2H4'},
      {x1: 0, y1: 540, x2: 0, y2: 0, label: 'C2H2'},
    ];
    axes.forEach(axis => {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', axis.x1);
      line.setAttribute('y1', axis.y1);
      line.setAttribute('x2', axis.x2);
      line.setAttribute('y2', axis.y2);
      line.setAttribute('stroke', 'black');
      line.setAttribute('stroke-width', '2');
      g.appendChild(line);
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', axis.x2);
      text.setAttribute('y', axis.y2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '24');
      text.textContent = axis.label;
      g.appendChild(text);
    });
    if (sample) {
      const x = sample.ch4 / (sample.ch4 + sample.c2h4 + sample.c2h2) * 600;
      const y = sample.c2h4 / (sample.ch4 + sample.c2h4 + sample.c2h2) * 540;
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '10');
      circle.setAttribute('fill', 'red');
      g.appendChild(circle);
    }
  }
};
