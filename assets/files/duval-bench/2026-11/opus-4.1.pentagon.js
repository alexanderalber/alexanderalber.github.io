const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) return 'INVALID';
    
    const pH2 = (h2 / total) * 100;
    const pCH4 = (ch4 / total) * 100;
    const pC2H6 = (c2h6 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;
    
    // Zone boundaries approximated from memory
    if (pC2H2 > 29) {
      if (pC2H4 > 23) return 'D2';
      return 'D1';
    }
    
    if (pC2H2 > 13) {
      if (pC2H4 > 38) return 'T3';
      if (pC2H4 > 20) return 'D2';
      return 'D1';
    }
    
    if (pC2H2 > 4) {
      if (pC2H4 > 50) return 'T3';
      if (pC2H4 > 23) return 'T2';
      return 'D1';
    }
    
    if (pC2H2 > 1) {
      if (pC2H4 > 50) return 'T3';
      if (pC2H4 > 20) return 'T2';
      if (pCH4 > 35) return 'T1';
      return 'PD';
    }
    
    if (pH2 > 85) return 'PD';
    if (pH2 > 30 && pCH4 < 25) return 'S';
    if (pCH4 > 65) return 'T1';
    if (pC2H4 > 50) return 'T3';
    if (pC2H4 > 20) return 'T2';
    if (pCH4 > 35) return 'T1';
    if (pH2 > 30) return 'S';
    
    return 'T1';
  },

  render(svg, sample) {
    const cx = 300, cy = 300, r = 250;
    
    // Pentagon vertices (starting from top, clockwise)
    const vertices = [
      {name: 'H2', x: cx, y: cy - r, angle: -Math.PI/2},
      {name: 'CH4', x: cx + r * Math.cos(-Math.PI/2 + 2*Math.PI/5), y: cy + r * Math.sin(-Math.PI/2 + 2*Math.PI/5), angle: -Math.PI/2 + 2*Math.PI/5},
      {name: 'C2H6', x: cx + r * Math.cos(-Math.PI/2 + 4*Math.PI/5), y: cy + r * Math.sin(-Math.PI/2 + 4*Math.PI/5), angle: -Math.PI/2 + 4*Math.PI/5},
      {name: 'C2H4', x: cx + r * Math.cos(-Math.PI/2 - 4*Math.PI/5), y: cy + r * Math.sin(-Math.PI/2 - 4*Math.PI/5), angle: -Math.PI/2 - 4*Math.PI/5},
      {name: 'C2H2', x: cx + r * Math.cos(-Math.PI/2 - 2*Math.PI/5), y: cy + r * Math.sin(-Math.PI/2 - 2*Math.PI/5), angle: -Math.PI/2 - 2*Math.PI/5}
    ];
    
    // Zone colors
    const zones = [
      {id: 'PD', color: '#e7f3ff', points: [[cx, cy - 0.8*r], [cx - 0.3*r, cy - 0.4*r], [cx, cy], [cx + 0.3*r, cy - 0.4*r]]},
      {id: 'S', color: '#fff0f0', points: [[cx - 0.8*r, cy - 0.2*r], [cx - 0.3*r, cy - 0.4*r], [cx, cy], [cx - 0.3*r, cy + 0.1*r]]},
      {id: 'T1', color: '#ffffd0', points: [[cx, cy], [cx - 0.3*r, cy + 0.1*r], [cx + 0.1*r, cy + 0.6*r], [cx + 0.5*r, cy + 0.2*r]]},
      {id: 'T2', color: '#ffeed0', points: [[cx, cy], [cx + 0.5*r, cy + 0.2*r], [cx + 0.7*r, cy + 0.3*r], [cx + 0.3*r, cy - 0.2*r]]},
      {id: 'T3', color: '#ffd0d0', points: [[cx + 0.1*r, cy + 0.6*r], [cx + 0.5*r, cy + 0.2*r], [cx + 0.7*r, cy + 0.3*r], [cx + 0.4*r, cy + 0.7*r]]},
      {id: 'D1', color: '#f0f0ff', points: [[cx + 0.3*r, cy - 0.4*r], [cx, cy], [cx + 0.3*r, cy - 0.2*r], [cx + 0.6*r, cy - 0.5*r]]},
      {id: 'D2', color: '#e0e0ff', points: [[cx + 0.3*r, cy - 0.2*r], [cx + 0.7*r, cy + 0.3*r], [cx + 0.8*r, cy, ], [cx + 0.6*r, cy - 0.5*r]]}
    ];
    
    // Draw pentagon outline
    const pentagon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    pentagon.setAttribute('points', vertices.map(v => `${v.x},${v.y}`).join(' '));
    pentagon.setAttribute('fill', '#f8f8f8');
    pentagon.setAttribute('stroke', '#333');
    pentagon.setAttribute('stroke-width', '2');
    svg.appendChild(pentagon);
    
    // Draw grid lines
    for (const vertex of vertices) {
      for (let frac = 0.2; frac < 1; frac += 0.2) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', cx + (vertex.x - cx) * frac);
        line.setAttribute('y1', cy + (vertex.y - cy) * frac);
        line.setAttribute('x2', cx);
        line.setAttribute('y2', cy);
        line.setAttribute('stroke', '#ddd');
        line.setAttribute('stroke-width', '0.5');
        svg.appendChild(line);
      }
    }
    
    // Draw radial lines
    for (const vertex of vertices) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', cx);
      line.setAttribute('y1', cy);
      line.setAttribute('x2', vertex.x);
      line.setAttribute('y2', vertex.y);
      line.setAttribute('stroke', '#999');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }
    
    // Add zone labels
    const zoneLabels = [
      {id: 'PD', x: cx, y: cy - 120},
      {id: 'S', x: cx - 140, y: cy - 50},
      {id: 'T1', x: cx - 50, y: cy + 80},
      {id: 'T2', x: cx + 80, y: cy + 50},
      {id: 'T3', x: cx + 120, y: cy + 140},
      {id: 'D1', x: cx + 120, y: cy - 80},
      {id: 'D2', x: cx + 180, y: cy - 50}
    ];
    
    for (const zone of zoneLabels) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', zone.x);
      text.setAttribute('y', zone.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'Arial, sans-serif');
      text.setAttribute('font-size', '16');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#333');
      text.textContent = zone.id;
      svg.appendChild(text);
    }
    
    // Add gas labels
    for (const vertex of vertices) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const labelX = vertex.x + 30 * Math.cos(vertex.angle);
      const labelY = vertex.y + 30 * Math.sin(vertex.angle) + 5;
      text.setAttribute('x', labelX);
      text.setAttribute('y', labelY);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'Arial, sans-serif');
      text.setAttribute('font-size', '14');
      text.setAttribute('fill', '#333');
      text.textContent = vertex.name;
      svg.appendChild(text);
    }
    
    // Plot sample if provided
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const coords = [sample.h2/total, sample.ch4/total, sample.c2h6/total, sample.c2h4/total, sample.c2h2/total];
        let px = 0, py = 0;
        for (let i = 0; i < 5; i++) {
          px += vertices[i].x * coords[i];
          py += vertices[i].y * coords[i];
        }
        
        const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        point.setAttribute('cx', px);
        point.setAttribute('cy', py);
        point.setAttribute('r', '5');
        point.setAttribute('fill', '#ff0000');
        point.setAttribute('stroke', '#800000');
        point.setAttribute('stroke-width', '2');
        svg.appendChild(point);
      }
    }
  }
};
