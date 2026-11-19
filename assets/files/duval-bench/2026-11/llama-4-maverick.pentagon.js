const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    const p = [h2 / total, ch4 / total, c2h6 / total, c2h4 / total, c2h2 / total];
    const x = 100 * (p[4] * Math.sin(Math.PI / 5) + p[0] * Math.sin(Math.PI * 2 / 5) + p[1] * 0 - p[2] * Math.sin(Math.PI * 2 / 5) - p[3] * Math.sin(Math.PI / 5));
    const y = 100 * (-p[4] * Math.cos(Math.PI / 5) + p[0] * Math.cos(Math.PI * 2 / 5) - p[1] - p[2] * Math.cos(Math.PI * 2 / 5) + p[3] * Math.cos(Math.PI / 5));
    const r = Math.sqrt(x * x + y * y);

    if (r < 5) return 'N';
    if (y > 13.8 * x + 62.3) return 'T1';
    if (y > -17.3 * x + 62.3) {
      if (y > -7.1 * x + 31.8) return 'T2';
      return 'PD';
    }
    if (y > -7.1 * x + 31.8) return 'T3';
    if (x > 0) return 'D1';
    return 'D2';
  },

  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';

    // Draw zones
    let path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M 300,500 L 500,300 L 300,100 L 100,300 Z');
    path.setAttribute('fill', '#C9E4CA');
    svg.appendChild(path);
    path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M 300,500 L 500,300 L 388,300 L 300,412 Z');
    path.setAttribute('fill', '#F7D2C4');
    svg.appendChild(path);
    path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M 300,412 L 388,300 L 300,300 L 212,300 Z');
    path.setAttribute('fill', '#F2C464');
    svg.appendChild(path);
    path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M 300,300 L 388,300 L 430,190 L 300,190 Z');
    path.setAttribute('fill', '#D9B3C2');
    svg.appendChild(path);
    path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M 300,190 L 430,190 L 300,100 L 170,190 Z');
    path.setAttribute('fill', '#C5CAE9');
    svg.appendChild(path);
    path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M 300,100 L 170,190 L 212,300 L 300,300 Z');
    path.setAttribute('fill', '#87CEEB');
    svg.appendChild(path);

    // Label zones
    let text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 300);
    text.setAttribute('y', 450);
    text.textContent = 'PD';
    text.setAttribute('text-anchor', 'middle');
    svg.appendChild(text);
    text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 450);
    text.setAttribute('y', 340);
    text.textContent = 'D1';
    svg.appendChild(text);
    text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 340);
    text.setAttribute('y', 240);
    text.textContent = 'D2';
    svg.appendChild(text);
    text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 300);
    text.setAttribute('y', 140);
    text.textContent = 'T1';
    text.setAttribute('text-anchor', 'middle');
    svg.appendChild(text);
    text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 230);
    text.setAttribute('y', 240);
    text.textContent = 'T2';
    svg.appendChild(text);
    text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 150);
    text.setAttribute('y', 340);
    text.textContent = 'T3';
    svg.appendChild(text);

    // Draw axes and labels
    let line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', 300);
    line.setAttribute('y1', 500);
    line.setAttribute('x2', 300);
    line.setAttribute('y2', 100);
    svg.appendChild(line);
    text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 320);
    text.setAttribute('y', 90);
    text.textContent = 'CH4';
    svg.appendChild(text);
    line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', 300);
    line.setAttribute('y1', 500);
    line.setAttribute('x2', 500);
    line.setAttribute('y2', 300);
    svg.appendChild(line);
    text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 510);
    text.setAttribute('y', 290);
    text.textContent = 'C2H4';
    svg.appendChild(text);
    line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', 300);
    line.setAttribute('y1', 500);
    line.setAttribute('x2', 100);
    line.setAttribute('y2', 300);
    svg.appendChild(line);
    text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 90);
    text.setAttribute('y', 290);
    text.textContent = 'C2H6';
    svg.appendChild(text);
    line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', 300);
    line.setAttribute('y1', 100);
    line.setAttribute('x2', 430);
    line.setAttribute('y2', 190);
    svg.appendChild(line);
    text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 440);
    text.setAttribute('y', 200);
    text.textContent = 'C2H2';
    svg.appendChild(text);
    line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', 300);
    line.setAttribute('y1', 100);
    line.setAttribute('x2', 170);
    line.setAttribute('y2', 190);
    svg.appendChild(line);
    text = document.createElementNS(ns, 'text');
    text.setAttribute('x', 160);
    text.setAttribute('y', 200);
    text.textContent = 'H2';
    svg.appendChild(text);

    // Plot sample
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      const p = [sample.h2 / total, sample.ch4 / total, sample.c2h6 / total, sample.c2h4 / total, sample.c2h2 / total];
      const x = 200 * (p[4] * Math.sin(Math.PI / 5) + p[0] * Math.sin(Math.PI * 2 / 5) + p[1] * 0 - p[2] * Math.sin(Math.PI * 2 / 5) - p[3] * Math.sin(Math.PI / 5));
      const y = 200 * (-p[4] * Math.cos(Math.PI / 5) + p[0] * Math.cos(Math.PI * 2 / 5) - p[1] - p[2] * Math.cos(Math.PI * 2 / 5) + p[3] * Math.cos(Math.PI / 5));
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', 300 + x);
      circle.setAttribute('cy', 300 - y);
      circle.setAttribute('r', 5);
      circle.setAttribute('fill', 'black');
      svg.appendChild(circle);
    }
  }
};
