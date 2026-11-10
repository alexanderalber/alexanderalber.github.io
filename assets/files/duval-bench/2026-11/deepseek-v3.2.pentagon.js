const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total === 0) return 'NO_DATA';
    
    const pH2 = (h2 / total) * 100;
    const pCH4 = (ch4 / total) * 100;
    const pC2H6 = (c2h6 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;
    
    // Zone boundaries approximated from memory
    // PD: Partial discharge - high H2, moderate CH4
    if (pH2 > 25 && pCH4 > 10 && pC2H2 < 5 && pC2H4 < 10) {
      return 'PD';
    }
    
    // D1: Low energy discharge - elevated C2H2, high H2
    if (pC2H2 > 10 && pH2 > 25 && (pC2H2 / (pC2H2 + pC2H4)) > 0.5) {
      return 'D1';
    }
    
    // D2: High energy discharge - high C2H2, moderate H2
    if (pC2H2 > 15 && pH2 > 10 && (pC2H2 / (pC2H2 + pC2H4)) > 0.7) {
      return 'D2';
    }
    
    // DT: Thermal fault <300°C - high CH4, high C2H6
    if (pCH4 > 35 && pC2H6 > 25 && pC2H2 < 5 && pC2H4 < 15) {
      return 'DT';
    }
    
    // T1: Thermal fault 300-700°C - high C2H4, moderate C2H6
    if (pC2H4 > 30 && pC2H6 > 15 && pC2H2 < 5 && pH2 < 15) {
      return 'T1';
    }
    
    // T2: Thermal fault >700°C - very high C2H4
    if (pC2H4 > 50 && pC2H2 < 5 && pH2 < 10) {
      return 'T2';
    }
    
    // T3: Thermal fault >1000°C - extreme C2H4 with C2H6
    if (pC2H4 > 60 && pC2H6 > 10 && pC2H2 < 2) {
      return 'T3';
    }
    
    return 'UNKNOWN';
  },

  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';
    
    // Pentagon vertices (centered at 300,300 with radius 250)
    const centerX = 300, centerY = 300, radius = 250;
    const vertices = [];
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI/2 - (i * 2 * Math.PI / 5);
      vertices.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY - radius * Math.sin(angle)
      });
    }
    
    // Draw pentagon outline
    const pentagon = document.createElementNS(ns, 'polygon');
    pentagon.setAttribute('points', vertices.map(v => `${v.x},${v.y}`).join(' '));
    pentagon.setAttribute('fill', 'none');
    pentagon.setAttribute('stroke', '#000');
    pentagon.setAttribute('stroke-width', '2');
    svg.appendChild(pentagon);
    
    // Draw axes from center to vertices
    vertices.forEach(v => {
      const axis = document.createElementNS(ns, 'line');
      axis.setAttribute('x1', centerX);
      axis.setAttribute('y1', centerY);
      axis.setAttribute('x2', v.x);
      axis.setAttribute('y2', v.y);
      axis.setAttribute('stroke', '#ccc');
      axis.setAttribute('stroke-width', '1');
      svg.appendChild(axis);
    });
    
    // Gas labels at vertices
    const gasNames = ['H₂', 'CH₄', 'C₂H₆', 'C₂H₄', 'C₂H₂'];
    vertices.forEach((v, i) => {
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', v.x);
      text.setAttribute('y', v.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dy', v.y < centerY ? '1.2em' : '-0.5em');
      text.setAttribute('font-size', '20');
      text.setAttribute('font-weight', 'bold');
      text.textContent = gasNames[i];
      svg.appendChild(text);
    });
    
    // Zone polygons (approximate from memory)
    const zones = [
      { id: 'PD', color: '#a6cee3', points: [0, 0.3, 0.4, 0.1, 0.2] },
      { id: 'D1', color: '#b2df8a', points: [0.25, 0.1, 0.05, 0.1, 0.5] },
      { id: 'D2', color: '#33a02c', points: [0.15, 0.05, 0.02, 0.08, 0.7] },
      { id: 'DT', color: '#fb9a99', points: [0.05, 0.5, 0.35, 0.05, 0.05] },
      { id: 'T1', color: '#fdbf6f', points: [0.05, 0.2, 0.3, 0.4, 0.05] },
      { id: 'T2', color: '#ff7f00', points: [0.02, 0.08, 0.1, 0.75, 0.05] },
      { id: 'T3', color: '#e31a1c', points: [0.01, 0.04, 0.05, 0.85, 0.05] }
    ];
    
    zones.forEach(zone => {
      const polygon = document.createElementNS(ns, 'polygon');
      const points = zone.points.map((p, i) => {
        const angle = Math.PI/2 - (i * 2 * Math.PI / 5);
        const x = centerX + radius * p * Math.cos(angle);
        const y = centerY - radius * p * Math.sin(angle);
        return `${x},${y}`;
      }).join(' ');
      polygon.setAttribute('points', points);
      polygon.setAttribute('fill', zone.color);
      polygon.setAttribute('fill-opacity', '0.6');
      polygon.setAttribute('stroke', '#000');
      polygon.setAttribute('stroke-width', '1');
      svg.appendChild(polygon);
      
      // Zone label at centroid
      const centroid = zone.points.reduce((sum, p, i) => {
        const angle = Math.PI/2 - (i * 2 * Math.PI / 5);
        return {
          x: sum.x + p * Math.cos(angle),
          y: sum.y - p * Math.sin(angle)
        };
      }, { x: 0, y: 0 });
      
      const scale = 0.7;
      const labelX = centerX + radius * scale * centroid.x / zone.points.length;
      const labelY = centerY + radius * scale * centroid.y / zone.points.length;
      
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', labelX);
      text.setAttribute('y', labelY);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '16');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#000');
      text.textContent = zone.id;
      svg.appendChild(text);
    });
    
    // Draw sample point if provided
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const percentages = [
          sample.h2 / total,
          sample.ch4 / total,
          sample.c2h6 / total,
          sample.c2h4 / total,
          sample.c2h2 / total
        ];
        
        let pointX = centerX;
        let pointY = centerY;
        percentages.forEach((p, i) => {
          const angle = Math.PI/2 - (i * 2 * Math.PI / 5);
          pointX += radius * p * Math.cos(angle);
          pointY -= radius * p * Math.sin(angle);
        });
        
        const point = document.createElementNS(ns, 'circle');
        point.setAttribute('cx', pointX);
        point.setAttribute('cy', pointY);
        point.setAttribute('r', '8');
        point.setAttribute('fill', '#0000ff');
        point.setAttribute('stroke', '#000');
        point.setAttribute('stroke-width', '2');
        svg.appendChild(point);
        
        const classification = this.classify(
          sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2
        );
        
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', pointX + 12);
        label.setAttribute('y', pointY - 12);
        label.setAttribute('font-size', '14');
        label.setAttribute('font-weight', 'bold');
        label.setAttribute('fill', '#0000ff');
        label.textContent = classification;
        svg.appendChild(label);
      }
    }
  }
};
