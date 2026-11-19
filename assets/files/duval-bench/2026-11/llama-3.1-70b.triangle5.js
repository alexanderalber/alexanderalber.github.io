const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const sum = ch4 + c2h4 + c2h6;
    const normCh4 = ch4 / sum * 100;
    const normC2h4 = c2h4 / sum * 100;
    const normC2h6 = c2h6 / sum * 100;
    if (normCh4 > 0 && normCh4 <= 3 && normC2h4 >= 0 && normC2h4 <= 3 && normC2h6 >= 94 && normC2h6 <= 100) {
      return 'T1';
    } else if (normCh4 > 0 && normCh4 <= 3 && normC2h4 > 3 && normC2h4 <= 14 && normC2h6 > 83 && normC2h6 <= 97) {
      return 'T2';
    } else if (normCh4 > 0 && normCh4 <= 3 && normC2h4 > 14 && normC2h4 <= 30 && normC2h6 > 67 && normC2h6 <= 86) {
      return 'T3';
    } else if (normCh4 > 3 && normCh4 <= 10 && normC2h4 > 3 && normC2h4 <= 30 && normC2h6 > 60 && normC2h6 <= 94) {
      return 'T4';
    } else if (normCh4 > 10 && normCh4 <= 50 && normC2h4 > 3 && normC2h4 <= 50 && normC2h6 > 20 && normC2h6 <= 87) {
      return 'T5';
    } else if (normCh4 > 50 && normCh4 <= 100 && normC2h4 > 0 && normC2h4 <= 50 && normC2h6 > 0 && normC2h6 <= 50) {
      return 'T6';
    } else {
      return 'Unknown';
    }
  },
  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';
    const triangle = document.createElementNS(ns, 'polygon');
    triangle.setAttribute('points', '0,540 600,540 300,0');
    triangle.setAttribute('fill', 'none');
    triangle.setAttribute('stroke', 'black');
    svg.appendChild(triangle);
    const zones = [
      { x1: 0, y1: 540, x2: 300, y2: 0, fill: '#ff0000', label: 'T1' },
      { x1: 0, y1: 540, x2: 150, y2: 270, fill: '#ffff00', label: 'T2' },
      { x1: 150, y1: 270, x2: 300, y2: 0, fill: '#00ff00', label: 'T3' },
      { x1: 0, y1: 540, x2: 450, y2: 270, fill: '#00ffff', label: 'T4' },
      { x1: 150, y1: 270, x2: 450, y2: 270, fill: '#0000ff', label: 'T5' },
      { x1: 450, y1: 270, x2: 600, y2: 540, fill: '#ff00ff', label: 'T6' },
    ];
    for (const zone of zones) {
      const polygon = document.createElementNS(ns, 'polygon');
      polygon.setAttribute('points', `${zone.x1},${zone.y1} ${zone.x2},${zone.y2} 300,0`);
      polygon.setAttribute('fill', zone.fill);
      svg.appendChild(polygon);
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', (zone.x1 + zone.x2) / 2);
      text.setAttribute('y', (zone.y1 + zone.y2) / 2);
      text.setAttribute('fill', 'black');
      text.setAttribute('text-anchor', 'middle');
      text.textContent = zone.label;
      svg.appendChild(text);
    }
    const axes = [
      { x1: 0, y1: 540, x2: 600, y2: 540, label: 'CH4' },
      { x1: 300, y1: 0, x2: 300, y2: 540, label: 'C2H4' },
      { x1: 0, y1: 540, x2: 300, y2: 0, label: 'C2H6' },
    ];
    for (const axis of axes) {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', axis.x1);
      line.setAttribute('y1', axis.y1);
      line.setAttribute('x2', axis.x2);
      line.setAttribute('y2', axis.y2);
      line.setAttribute('stroke', 'black');
      svg.appendChild(line);
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', (axis.x1 + axis.x2) / 2);
      text.setAttribute('y', (axis.y1 + axis.y2) / 2);
      text.setAttribute('fill', 'black');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('transform', 'rotate(45)');
      text.textContent = axis.label;
      svg.appendChild(text);
    }
    if (sample) {
      const sum = sample.ch4 + sample.c2h4 + sample.c2h6;
      const normCh4 = sample.ch4 / sum * 100;
      const normC2h4 = sample.c2h4 / sum * 100;
      const normC2h6 = sample.c2h6 / sum * 100;
      const x = (normC2h4 + normCh4) / 2 * 600;
      const y = (100 - normC2h6) / 100 * 540;
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', 5);
      circle.setAttribute('fill', 'black');
      svg.appendChild(circle);
    }
  }
};
