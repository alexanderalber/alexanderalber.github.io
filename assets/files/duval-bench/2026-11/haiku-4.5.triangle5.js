const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    if (total === 0) return "unknown";
    
    const p_ch4 = 100 * ch4 / total;
    const p_c2h4 = 100 * c2h4 / total;
    const p_c2h6 = 100 * c2h6 / total;
    
    // Duval Triangle 5 zone classification
    if (p_c2h4 > 50) {
      return "PD";
    }
    if (p_c2h6 > 70) {
      return "T3";
    }
    if (p_ch4 > 65 && p_c2h4 < 25) {
      return "T1";
    }
    if (p_ch4 > 60 && p_c2h6 < 15) {
      return "T1";
    }
    if (p_c2h4 > 35 && p_c2h6 > 20) {
      return "D2";
    }
    if (p_c2h4 > 20 && p_c2h4 <= 35) {
      return "D1";
    }
    return "T2";
  },
  
  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    
    const width = 600;
    const height = 540;
    const margin = 50;
    
    const x1 = margin;
    const y1 = height - margin;
    const x2 = width - margin;
    const y2 = height - margin;
    const x3 = width / 2;
    const y3 = margin;
    
    const ternaryToCart = (pch4, pc2h4, pc2h6) => {
      const f_ch4 = pch4 / 100;
      const f_c2h4 = pc2h4 / 100;
      const f_c2h6 = pc2h6 / 100;
      
      const x = x1 * f_ch4 + x2 * f_c2h6 + x3 * f_c2h4;
      const y = y1 * f_ch4 + y2 * f_c2h6 + y3 * f_c2h4;
      
      return {x, y};
    };
    
    const zones = [
      {name: "PD", color: "#ff6666", bounds: [[0,100,0], [50,50,0], [30,50,20], [0,70,30], [0,100,0]]},
      {name: "T1", color: "#6699ff", bounds: [[100,0,0], [70,15,15], [60,20,20], [80,5,15], [100,0,0]]},
      {name: "T2", color: "#ffcc66", bounds: [[60,20,20], [70,15,15], [50,30,20], [40,30,30], [60,20,20]]},
      {name: "T3", color: "#cc99ff", bounds: [[30,10,60], [50,10,40], [30,0,70], [20,5,75], [30,10,60]]},
      {name: "D1", color: "#99ff99", bounds: [[40,30,30], [50,35,15], [60,30,10], [50,30,20], [40,30,30]]},
      {name: "D2", color: "#ffff99", bounds: [[0,50,50], [30,50,20], [40,35,25], [20,60,20], [0,70,30], [0,50,50]]}
    ];
    
    zones.forEach(zone => {
      const pts = zone.bounds.map(([pch4, pc2h4, pc2h6]) => {
        const p = ternaryToCart(pch4, pc2h4, pc2h6);
        return `${p.x},${p.y}`;
      }).join(' ');
      
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', pts);
      poly.setAttribute('fill', zone.color);
      poly.setAttribute('stroke', '#333');
      poly.setAttribute('stroke-width', '1');
      poly.setAttribute('opacity', '0.75');
      svg.appendChild(poly);
    });
    
    const border = document.createElementNS(NS, 'polygon');
    border.setAttribute('points', `${x1},${y1} ${x2},${y2} ${x3},${y3}`);
    border.setAttribute('fill', 'none');
    border.setAttribute('stroke', '#000');
    border.setAttribute('stroke-width', '2');
    svg.appendChild(border);
    
    const drawAxisLabel = (text, x, y) => {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x);
      t.setAttribute('y', y);
      t.setAttribute('font-size', '14');
      t.setAttribute('font-weight', 'bold');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('pointer-events', 'none');
      t.textContent = text;
      svg.appendChild(t);
    };
    
    drawAxisLabel('CH4', x1 - 30, y1 + 20);
    drawAxisLabel('C2H6', x2 + 30, y2 + 20);
    drawAxisLabel('C2H4', x3, y3 - 20);
    
    const zoneLabelPos = [
      {zone: "PD", pch4: 15, pc2h4: 65, pc2h6: 20},
      {zone: "T1", pch4: 85, pc2h4: 8, pc2h6: 7},
      {zone: "T2", pch4: 55, pc2h4: 25, pc2h6: 20},
      {zone: "T3", pch4: 10, pc2h4: 5, pc2h6: 85},
      {zone: "D1", pch4: 50, pc2h4: 30, pc2h6: 20},
      {zone: "D2", pch4: 15, pc2h4: 55, pc2h6: 30}
    ];
    
    zoneLabelPos.forEach(z => {
      const p = ternaryToCart(z.pch4, z.pc2h4, z.pc2h6);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', p.x);
      t.setAttribute('y', p.y);
      t.setAttribute('font-size', '13');
      t.setAttribute('font-weight', 'bold');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('pointer-events', 'none');
      t.textContent = z.zone;
      svg.appendChild(t);
    });
    
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      if (total > 0) {
        const p_ch4 = 100 * sample.ch4 / total;
        const p_c2h4 = 100 * sample.c2h4 / total;
        const p_c2h6 = 100 * sample.c2h6 / total;
        
        const pos = ternaryToCart(p_ch4, p_c2h4, p_c2h6);
        
        const circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', pos.x);
        circle.setAttribute('cy', pos.y);
        circle.setAttribute('r', '5');
        circle.setAttribute('fill', '#000');
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);
      }
    }
  }
};
