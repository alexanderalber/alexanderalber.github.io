const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total === 0) return "NORMAL";
    
    const x = c2h4 / total;
    const y = c2h2 / total;
    const z = ch4 / total;
    
    // Duval Triangle 1 zone classification
    // Based on normalized ternary coordinates
    
    if (y > 0.12) {
      if (y > 0.24) return "D2";
      if (x > 0.5) return "D1";
      return "D2";
    }
    
    if (y > 0.06) {
      if (x > 0.6) return "D1";
      return "D1";
    }
    
    if (x > 0.75) {
      return "PD";
    }
    
    if (x > 0.5) {
      if (z > 0.7) return "T1";
      return "T2";
    }
    
    if (z > 0.8) {
      return "T1";
    }
    
    return "T2";
  },
  
  render(svg, sample) {
    const width = 600;
    const height = 540;
    const ns = 'http://www.w3.org/2000/svg';
    
    svg.innerHTML = '';
    
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', width);
    bg.setAttribute('height', height);
    bg.setAttribute('fill', 'white');
    svg.appendChild(bg);
    
    const cx = width / 2;
    const cy = height / 2;
    const scale = 180;
    const h = scale * Math.sqrt(3) / 2;
    
    const v1 = { x: cx - scale, y: cy + h, label: 'CH₄', idx: 0 };
    const v2 = { x: cx + scale, y: cy + h, label: 'C₂H₄', idx: 1 };
    const v3 = { x: cx, y: cy - h, label: 'C₂H₂', idx: 2 };
    
    const ternaryToCartesian = (t1, t2, t3) => {
      const x = t2 * v2.x + t3 * v3.x + t1 * v1.x;
      const y = t2 * v2.y + t3 * v3.y + t1 * v1.y;
      return { x, y };
    };
    
    const drawTriangleBg = () => {
      const poly = document.createElementNS(ns, 'polygon');
      poly.setAttribute('points', `${v1.x},${v1.y} ${v2.x},${v2.y} ${v3.x},${v3.y}`);
      poly.setAttribute('fill', '#f5f5f5');
      poly.setAttribute('stroke', '#000');
      poly.setAttribute('stroke-width', '2');
      svg.appendChild(poly);
    };
    
    const drawZone = (vertices, color, opacity = 1) => {
      const poly = document.createElementNS(ns, 'polygon');
      const points = vertices.map(v => `${v.x},${v.y}`).join(' ');
      poly.setAttribute('points', points);
      poly.setAttribute('fill', color);
      poly.setAttribute('fill-opacity', opacity);
      poly.setAttribute('stroke', '#999');
      poly.setAttribute('stroke-width', '1');
      svg.appendChild(poly);
    };
    
    const drawText = (text, x, y, size = 12, weight = 'normal', fill = '#000') => {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', x);
      t.setAttribute('y', y);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', size);
      t.setAttribute('font-weight', weight);
      t.setAttribute('fill', fill);
      t.setAttribute('font-family', 'Arial, sans-serif');
      t.textContent = text;
      svg.appendChild(t);
    };
    
    drawTriangleBg();
    
    // Define zones approximately
    drawZone([
      ternaryToCartesian(0.8, 0.15, 0.05),
      ternaryToCartesian(0.7, 0.25, 0.05),
      ternaryToCartesian(0.5, 0.4, 0.1),
      ternaryToCartesian(0.6, 0.3, 0.1)
    ], '#ffe6e6', 0.7);
    drawText('PD', cx + 100, cy + 60, 16, 'bold');
    
    drawZone([
      ternaryToCartesian(0.9, 0.05, 0.05),
      ternaryToCartesian(0.8, 0.15, 0.05),
      ternaryToCartesian(0.75, 0.15, 0.1),
      ternaryToCartesian(0.85, 0.05, 0.1)
    ], '#e6f2ff', 0.7);
    drawText('T1', cx - 120, cy + 80, 16, 'bold');
    
    drawZone([
      ternaryToCartesian(0.6, 0.3, 0.1),
      ternaryToCartesian(0.5, 0.4, 0.1),
      ternaryToCartesian(0.4, 0.45, 0.15),
      ternaryToCartesian(0.5, 0.35, 0.15)
    ], '#fffacc', 0.7);
    drawText('T2', cx - 20, cy + 40, 16, 'bold');
    
    drawZone([
      ternaryToCartesian(0.4, 0.45, 0.15),
      ternaryToCartesian(0.3, 0.55, 0.15),
      ternaryToCartesian(0.25, 0.6, 0.15),
      ternaryToCartesian(0.5, 0.35, 0.15)
    ], '#e6ccff', 0.7);
    drawText('T3', cx + 50, cy - 20, 16, 'bold');
    
    drawZone([
      ternaryToCartesian(0.2, 0.5, 0.3),
      ternaryToCartesian(0.1, 0.6, 0.3),
      ternaryToCartesian(0.15, 0.55, 0.3),
      ternaryToCartesian(0.25, 0.45, 0.3)
    ], '#ffccff', 0.7);
    drawText('D1', cx - 60, cy - 80, 16, 'bold');
    
    drawZone([
      ternaryToCartesian(0.1, 0.3, 0.6),
      ternaryToCartesian(0.05, 0.25, 0.7),
      ternaryToCartesian(0.15, 0.35, 0.5),
      ternaryToCartesian(0.2, 0.4, 0.4)
    ], '#ff99ff', 0.7);
    drawText('D2', cx, cy - 140, 16, 'bold');
    
    // Draw axes
    const line = (x1, y1, x2, y2, width = 1, color = '#000') => {
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x1);
      l.setAttribute('y1', y1);
      l.setAttribute('x2', x2);
      l.setAttribute('y2', y2);
      l.setAttribute('stroke', color);
      l.setAttribute('stroke-width', width);
      svg.appendChild(l);
    };
    
    line(v1.x, v1.y, v2.x, v2.y);
    line(v1.x, v1.y, v3.x, v3.y);
    line(v2.x, v2.y, v3.x, v3.y);
    
    // Tick marks
    for (let i = 0; i <= 10; i++) {
      const r = i / 10;
      const p12_0 = ternaryToCartesian(1 - r, r, 0);
      const p12_1 = ternaryToCartesian(1 - r - 0.02, r + 0.02, 0);
      line(p12_0.x, p12_0.y, p12_1.x, p12_1.y, 0.5);
      
      const p13_0 = ternaryToCartesian(1 - r, 0, r);
      const p13_1 = ternaryToCartesian(1 - r - 0.02, 0.02, r);
      line(p13_0.x, p13_0.y, p13_1.x, p13_1.y, 0.5);
      
      const p23_0 = ternaryToCartesian(0, 1 - r, r);
      const p23_1 = ternaryToCartesian(0.02, 1 - r - 0.02, r);
      line(p23_0.x, p23_0.y, p23_1.x, p23_1.y, 0.5);
    }
    
    // Labels
    drawText(v1.label, v1.x - 25, v1.y + 25, 12, 'bold');
    drawText(v2.label, v2.x + 25, v2.y + 25, 12, 'bold');
    drawText(v3.label, v3.x, v3.y - 30, 12, 'bold');
    
    if (sample && sample.ch4 !== undefined && sample.c2h4 !== undefined && sample.c2h2 !== undefined) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const t1 = sample.ch4 / total;
        const t2 = sample.c2h4 / total;
        const t3 = sample.c2h2 / total;
        const pos = ternaryToCartesian(t1, t2, t3);
        
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', pos.x);
        circle.setAttribute('cy', pos.y);
        circle.setAttribute('r', '7');
        circle.setAttribute('fill', '#ff0000');
        circle.setAttribute('stroke', '#8b0000');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);
      }
    }
  }
};
