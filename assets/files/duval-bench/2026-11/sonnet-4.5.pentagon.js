const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) return 'INVALID';
    
    const pH2 = (h2 / total) * 100;
    const pCH4 = (ch4 / total) * 100;
    const pC2H6 = (c2h6 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;
    
    // Zone classification based on percentage ranges
    // PD: Partial Discharge - high H2, low hydrocarbons
    if (pH2 > 50 && pC2H2 < 15) return 'PD';
    
    // D2: High energy discharge - high C2H2
    if (pC2H2 > 50) return 'D2';
    
    // D1: Low energy discharge - moderate C2H2
    if (pC2H2 > 15 && pC2H2 <= 50 && pC2H4 < 40) return 'D1';
    
    // T3: High temperature thermal fault - high C2H4
    if (pC2H4 > 50 && pC2H2 < 15) return 'T3';
    
    // T2: Medium temperature thermal fault
    if (pC2H4 > 20 && pC2H4 <= 50 && pC2H6 + pCH4 > 20 && pC2H2 < 15) return 'T2';
    
    // T1: Low temperature thermal fault - high CH4/C2H6
    if ((pCH4 + pC2H6) > 40 && pC2H4 < 30 && pC2H2 < 10) return 'T1';
    
    // DT: Mixed thermal and electrical
    if (pC2H2 > 10 && pC2H4 > 20) return 'DT';
    
    // Default cases
    if (pC2H2 < 10 && pC2H4 < 20 && pH2 < 50) return 'T1';
    
    return 'DT';
  },
  
  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    const cx = 300, cy = 300, radius = 220;
    
    // Pentagon vertices: C2H2 (top), C2H4, C2H6, CH4, H2
    const gases = ['C2H2', 'C2H4', 'C2H6', 'CH4', 'H2'];
    const vertices = [];
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI / 5);
      vertices.push({
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        gas: gases[i]
      });
    }
    
    // Helper to convert percentages to 2D point
    const percentToPoint = (pH2, pCH4, pC2H6, pC2H4, pC2H2) => {
      const percentages = [pC2H2, pC2H4, pC2H6, pCH4, pH2];
      let x = cx, y = cy;
      for (let i = 0; i < 5; i++) {
        const factor = percentages[i] / 100;
        x += (vertices[i].x - cx) * factor;
        y += (vertices[i].y - cy) * factor;
      }
      return { x, y };
    };
    
    // Draw zones with approximate boundaries
    const zones = [
      { name: 'PD', color: '#87CEEB', points: [
        percentToPoint(100, 0, 0, 0, 0),
        percentToPoint(60, 20, 10, 10, 0),
        percentToPoint(40, 30, 20, 10, 0),
        percentToPoint(30, 40, 20, 10, 0),
        percentToPoint(40, 40, 10, 0, 10),
        percentToPoint(60, 30, 0, 0, 10)
      ]},
      { name: 'D1', color: '#FFB6C1', points: [
        percentToPoint(40, 40, 10, 0, 10),
        percentToPoint(30, 40, 20, 10, 0),
        percentToPoint(20, 30, 20, 20, 10),
        percentToPoint(10, 20, 15, 30, 25),
        percentToPoint(15, 15, 10, 20, 40),
        percentToPoint(30, 20, 5, 10, 35)
      ]},
      { name: 'D2', color: '#FF69B4', points: [
        percentToPoint(30, 20, 5, 10, 35),
        percentToPoint(15, 15, 10, 20, 40),
        percentToPoint(5, 5, 5, 15, 70),
        percentToPoint(0, 0, 0, 20, 80),
        percentToPoint(0, 0, 0, 10, 90),
        percentToPoint(10, 10, 5, 5, 70)
      ]},
      { name: 'DT', color: '#DDA0DD', points: [
        percentToPoint(30, 40, 20, 10, 0),
        percentToPoint(20, 30, 20, 20, 10),
        percentToPoint(10, 20, 15, 30, 25),
        percentToPoint(5, 15, 20, 50, 10),
        percentToPoint(10, 20, 30, 40, 0),
        percentToPoint(20, 30, 30, 20, 0)
      ]},
      { name: 'T3', color: '#FFA500', points: [
        percentToPoint(10, 20, 15, 30, 25),
        percentToPoint(5, 15, 20, 50, 10),
        percentToPoint(0, 10, 20, 70, 0),
        percentToPoint(0, 5, 15, 80, 0),
        percentToPoint(5, 10, 15, 65, 5)
      ]},
      { name: 'T2', color: '#FFFF99', points: [
        percentToPoint(20, 30, 30, 20, 0),
        percentToPoint(10, 20, 30, 40, 0),
        percentToPoint(5, 15, 20, 50, 10),
        percentToPoint(0, 10, 20, 70, 0),
        percentToPoint(0, 20, 40, 40, 0),
        percentToPoint(5, 30, 45, 20, 0)
      ]},
      { name: 'T1', color: '#FFFFCC', points: [
        percentToPoint(30, 40, 20, 10, 0),
        percentToPoint(20, 30, 30, 20, 0),
        percentToPoint(5, 30, 45, 20, 0),
        percentToPoint(0, 20, 40, 40, 0),
        percentToPoint(0, 40, 40, 20, 0),
        percentToPoint(0, 50, 30, 20, 0),
        percentToPoint(10, 50, 25, 15, 0),
        percentToPoint(20, 45, 25, 10, 0)
      ]}
    ];
    
    // Draw zone polygons
    zones.forEach(zone => {
      const polygon = document.createElementNS(NS, 'polygon');
      const pointsStr = zone.points.map(p => `${p.x},${p.y}`).join(' ');
      polygon.setAttribute('points', pointsStr);
      polygon.setAttribute('fill', zone.color);
      polygon.setAttribute('stroke', '#666');
      polygon.setAttribute('stroke-width', '1');
      svg.appendChild(polygon);
    });
    
    // Draw pentagon outline
    const pentagonOutline = document.createElementNS(NS, 'polygon');
    const outlinePoints = vertices.map(v => `${v.x},${v.y}`).join(' ');
    pentagonOutline.setAttribute('points', outlinePoints);
    pentagonOutline.setAttribute('fill', 'none');
    pentagonOutline.setAttribute('stroke', '#000');
    pentagonOutline.setAttribute('stroke-width', '2');
    svg.appendChild(pentagonOutline);
    
    // Draw axes
    vertices.forEach(vertex => {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', cx);
      line.setAttribute('y1', cy);
      line.setAttribute('x2', vertex.x);
      line.setAttribute('y2', vertex.y);
      line.setAttribute('stroke', '#000');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    });
    
    // Label axes
    vertices.forEach((vertex, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI / 5);
      const labelRadius = radius + 25;
      const labelX = cx + labelRadius * Math.cos(angle);
      const labelY = cy + labelRadius * Math.sin(angle);
      
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', labelX);
      text.setAttribute('y', labelY);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', '14');
      text.setAttribute('font-weight', 'bold');
      text.textContent = vertex.gas;
      svg.appendChild(text);
    });
    
    // Label zones
    zones.forEach(zone => {
      const avgX = zone.points.reduce((sum, p) => sum + p.x, 0) / zone.points.length;
      const avgY = zone.points.reduce((sum, p) => sum + p.y, 0) / zone.points.length;
      
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', avgX);
      text.setAttribute('y', avgY);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', '16');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#000');
      text.textContent = zone.name;
      svg.appendChild(text);
    });
    
    // Plot sample if provided
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const pH2 = (sample.h2 / total) * 100;
        const pCH4 = (sample.ch4 / total) * 100;
        const pC2H6 = (sample.c2h6 / total) * 100;
        const pC2H4 = (sample.c2h4 / total) * 100;
        const pC2H2 = (sample.c2h2 / total) * 100;
        
        const point = percentToPoint(pH2, pCH4, pC2H6, pC2H4, pC2H2);
        
        const circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', point.x);
        circle.setAttribute('cy', point.y);
        circle.setAttribute('r', '6');
        circle.setAttribute('fill', 'red');
        circle.setAttribute('stroke', '#000');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);
      }
    }
  }
};
