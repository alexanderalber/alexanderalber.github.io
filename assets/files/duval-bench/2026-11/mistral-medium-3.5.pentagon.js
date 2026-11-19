const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const safeDiv = (a, b) => b === 0 ? (a > 0 ? Infinity : 0) : (a / b);
    const r1 = safeDiv(c2h2, c2h4);
    const r2 = safeDiv(ch4, h2);
    const r3 = safeDiv(c2h6, ch4);
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    
    if (r1 > 1.5 && r2 < 0.1) return 'T3';
    if (r1 > 1.5 && r3 > 0.4) return 'T2';
    if (r1 > 1.5) return 'D2';
    if (r2 > 1.0 && r3 > 0.4) return 'T1';
    if (r2 > 1.0) return 'D1';
    if (h2 > 0.8 * total) return 'PD';
    return 'DT';
  },
  
  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';
    const center = { x: 300, y: 300 };
    const radius = 250;
    const gases = ['H2', 'CH4', 'C2H6', 'C2H4', 'C2H2'];
    const angles = [0, 72, 144, 216, 288];
    
    const perimPoints = angles.map(angle => {
      const rad = angle * Math.PI / 180;
      return {
        x: center.x + radius * Math.sin(rad),
        y: center.y - radius * Math.cos(rad)
      };
    });
    
    gases.forEach((gas, i) => {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', center.x);
      line.setAttribute('y1', center.y);
      line.setAttribute('x2', perimPoints[i].x);
      line.setAttribute('y2', perimPoints[i].y);
      line.setAttribute('stroke', 'black');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', perimPoints[i].x);
      text.setAttribute('y', perimPoints[i].y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', '14');
      text.textContent = gas;
      svg.appendChild(text);
    });
    
    const zones = [
      { code: 'PD', color: '#e6f3ff', path: 'M 300,50 L 340,150 L 260,150 Z', lx: 300, ly: 100 },
      { code: 'D1', color: '#ffffcc', path: 'M 340,150 L 450,200 L 400,300 L 300,250 Z', lx: 370, ly: 225 },
      { code: 'T1', color: '#ccffcc', path: 'M 400,300 L 480,400 L 380,450 L 300,400 Z', lx: 400, ly: 375 },
      { code: 'T2', color: '#99ff99', path: 'M 300,400 L 220,450 L 180,400 L 250,300 Z', lx: 250, ly: 375 },
      { code: 'T3', color: '#66ff66', path: 'M 250,300 L 150,200 L 180,150 L 300,250 Z', lx: 225, ly: 225 },
      { code: 'D2', color: '#ffcc99', path: 'M 180,150 L 100,100 L 150,200 Z', lx: 150, ly: 150 },
      { code: 'DT', color: '#f0f0f0', path: 'M 300,250 L 400,300 L 380,450 L 220,450 L 250,300 Z', lx: 300, ly: 350 }
    ];
    
    zones.forEach(zone => {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', zone.path);
      path.setAttribute('fill', zone.color);
      path.setAttribute('stroke', 'black');
      path.setAttribute('stroke-width', '0.5');
      svg.appendChild(path);
      
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', zone.lx);
      text.setAttribute('y', zone.ly);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', '16');
      text.setAttribute('font-weight', 'bold');
      text.textContent = zone.code;
      svg.appendChild(text);
    });
    
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      const p = {
        h2: sample.h2 / total * 100,
        ch4: sample.ch4 / total * 100,
        c2h6: sample.c2h6 / total * 100,
        c2h4: sample.c2h4 / total * 100,
        c2h2: sample.c2h2 / total * 100
      };
      const percents = [p.h2, p.ch4, p.c2h6, p.c2h4, p.c2h2];
      
      let x = center.x;
      let y = center.y;
      for (let i = 0; i < 5; i++) {
        const angle = angles[i] * Math.PI / 180;
        x += radius * Math.sin(angle) * percents[i] / 100;
        y -= radius * Math.cos(angle) * percents[i] / 100;
      }
      
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', 'red');
      circle.setAttribute('stroke', 'black');
      circle.setAttribute('stroke-width', '1');
      svg.appendChild(circle);
    }
  }
};
