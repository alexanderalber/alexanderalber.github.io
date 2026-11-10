const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    const pCH4 = (ch4 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;
    
    if (pCH4 >= 98) return 'PD';
    if (pC2H2 >= 29) return 'D2';
    if (pC2H2 >= 13 && pC2H4 >= 23) return 'D1';
    if (pC2H2 >= 13 && pC2H4 < 23) return 'D2';
    if (pC2H2 >= 4 && pC2H2 < 13 && pC2H4 >= 20 && pC2H4 < 50) return 'DT';
    if (pC2H2 < 4 && pC2H4 >= 50) return 'T3';
    if (pC2H2 < 4 && pC2H4 >= 20 && pC2H4 < 50) return 'T2';
    if (pC2H2 < 4 && pC2H4 < 20) return 'T1';
    return 'T1';
  },

  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';
    const width = 600;
    const height = 540;
    const margin = 60;
    const triHeight = height - 2 * margin;
    const triWidth = width - 2 * margin;
    const cx = width / 2;
    const cy = margin + triHeight * 0.577;
    
    function toCartesian(pCH4, pC2H4, pC2H2) {
      const x = margin + triWidth * (0.5 * pC2H4 / 100 + pC2H2 / 100);
      const y = margin + triHeight * (1 - pC2H4 / 100 * 0.866);
      return { x, y };
    }
    
    function createPath(points) {
      const path = document.createElementNS(ns, 'path');
      const d = 'M' + points.map(p => {
        const pt = toCartesian(p[0], p[1], p[2]);
        return `${pt.x},${pt.y}`;
      }).join(' L') + ' Z';
      path.setAttribute('d', d);
      return path;
    }
    
    // Triangle outline
    const triangle = document.createElementNS(ns, 'polygon');
    const p1 = toCartesian(100, 0, 0);
    const p2 = toCartesian(0, 100, 0);
    const p3 = toCartesian(0, 0, 100);
    triangle.setAttribute('points', `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`);
    triangle.setAttribute('fill', 'none');
    triangle.setAttribute('stroke', 'black');
    triangle.setAttribute('stroke-width', '2');
    svg.appendChild(triangle);
    
    // Zones
    const zones = [
      { points: [[100, 0, 0], [98, 2, 0], [98, 0, 2]], color: '#FFE5CC', label: 'PD' },
      { points: [[98, 2, 0], [98, 0, 2], [87, 0, 13], [76, 20, 4], [80, 20, 0]], color: '#FFD9B3', label: 'T1' },
      { points: [[80, 20, 0], [76, 20, 4], [50, 46, 4], [50, 50, 0]], color: '#FFB366', label: 'T2' },
      { points: [[50, 50, 0], [50, 46, 4], [0, 96, 4], [0, 100, 0]], color: '#FF8C1A', label: 'T3' },
      { points: [[87, 0, 13], [76, 20, 4], [50, 46, 4], [50, 37, 13], [64, 23, 13]], color: '#B3E5FF', label: 'DT' },
      { points: [[64, 23, 13], [50, 37, 13], [0, 71, 29], [0, 58, 42], [35, 23, 42], [35, 23, 29]], color: '#66C2FF', label: 'D1' },
      { points: [[64, 23, 13], [35, 23, 42], [35, 23, 29], [0, 71, 29], [50, 37, 13], [50, 46, 4], [0, 96, 4], [0, 0, 100], [87, 0, 13]], color: '#1A8CFF', label: 'D2' }
    ];
    
    zones.forEach(zone => {
      const path = createPath(zone.points);
      path.setAttribute('fill', zone.color);
      path.setAttribute('stroke', 'black');
      path.setAttribute('stroke-width', '1');
      svg.appendChild(path);
    });
    
    // Zone labels
    const labels = [
      { text: 'PD', pos: [98.5, 0.5, 1] },
      { text: 'T1', pos: [89, 10, 1] },
      { text: 'T2', pos: [65, 35, 0] },
      { text: 'T3', pos: [25, 75, 0] },
      { text: 'DT', pos: [70, 20, 10] },
      { text: 'D1', pos: [32, 45, 23] },
      { text: 'D2', pos: [20, 20, 60] }
    ];
    
    labels.forEach(lbl => {
      const pos = toCartesian(lbl.pos[0], lbl.pos[1], lbl.pos[2]);
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', pos.x);
      text.setAttribute('y', pos.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'Arial');
      text.setAttribute('font-size', '16');
      text.setAttribute('font-weight', 'bold');
      text.textContent = lbl.text;
      svg.appendChild(text);
    });
    
    // Axes labels
    const axisLabels = [
      { text: '%CH₄', x: p1.x - 40, y: p1.y + 20 },
      { text: '%C₂H₄', x: p2.x, y: p2.y - 20 },
      { text: '%C₂H₂', x: p3.x + 40, y: p3.y + 20 }
    ];
    
    axisLabels.forEach(lbl => {
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', lbl.x);
      text.setAttribute('y', lbl.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'Arial');
      text.setAttribute('font-size', '14');
      text.textContent = lbl.text;
      svg.appendChild(text);
    });
    
    // Grid lines and ticks
    for (let i = 10; i <= 90; i += 10) {
      // CH4 lines
      const ch4Line = document.createElementNS(ns, 'line');
      const ch4p1 = toCartesian(100 - i, i, 0);
      const ch4p2 = toCartesian(100 - i, 0, i);
      ch4Line.setAttribute('x1', ch4p1.x);
      ch4Line.setAttribute('y1', ch4p1.y);
      ch4Line.setAttribute('x2', ch4p2.x);
      ch4Line.setAttribute('y2', ch4p2.y);
      ch4Line.setAttribute('stroke', '#ddd');
      ch4Line.setAttribute('stroke-width', '0.5');
      svg.appendChild(ch4Line);
      
      // C2H4 lines
      const c2h4Line = document.createElementNS(ns, 'line');
      const c2h4p1 = toCartesian(i, 100 - i, 0);
      const c2h4p2 = toCartesian(0, 100 - i, i);
      c2h4Line.setAttribute('x1', c2h4p1.x);
      c2h4Line.setAttribute('y1', c2h4p1.y);
      c2h4Line.setAttribute('x2', c2h4p2.x);
      c2h4Line.setAttribute('y2', c2h4p2.y);
      c2h4Line.setAttribute('stroke', '#ddd');
      c2h4Line.setAttribute('stroke-width', '0.5');
      svg.appendChild(c2h4Line);
      
      // C2H2 lines
      const c2h2Line = document.createElementNS(ns, 'line');
      const c2h2p1 = toCartesian(i, 0, 100 - i);
      const c2h2p2 = toCartesian(0, i, 100 - i);
      c2h2Line.setAttribute('x1', c2h2p1.x);
      c2h2Line.setAttribute('y1', c2h2p1.y);
      c2h2Line.setAttribute('x2', c2h2p2.x);
      c2h2Line.setAttribute('y2', c2h2p2.y);
      c2h2Line.setAttribute('stroke', '#ddd');
      c2h2Line.setAttribute('stroke-width', '0.5');
      svg.appendChild(c2h2Line);
    }
    
    // Sample point
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      const pCH4 = (sample.ch4 / total) * 100;
      const pC2H4 = (sample.c2h4 / total) * 100;
      const pC2H2 = (sample.c2h2 / total) * 100;
      const pos = toCartesian(pCH4, pC2H4, pC2H2);
      
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', pos.x);
      circle.setAttribute('cy', pos.y);
      circle.setAttribute('r', '5');
      circle.setAttribute('fill', 'red');
      circle.setAttribute('stroke', 'darkred');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);
    }
  }
};
