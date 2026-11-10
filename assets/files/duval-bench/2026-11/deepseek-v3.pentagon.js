const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total === 0) return 'ND';
    
    const h2_pct = h2 / total * 100;
    const ch4_pct = ch4 / total * 100;
    const c2h6_pct = c2h6 / total * 100;
    const c2h4_pct = c2h4 / total * 100;
    const c2h2_pct = c2h2 / total * 100;
    
    // PD - Partial discharge
    if (h2_pct > 98) return 'PD';
    
    // T1 - Thermal fault <300°C
    if (c2h6_pct > 20 && c2h4_pct < 20 && c2h2_pct < 5) return 'T1';
    
    // T2 - Thermal fault 300-700°C
    if (c2h4_pct > 20 && c2h4_pct < 50 && c2h2_pct < 15) return 'T2';
    
    // T3 - Thermal fault >700°C
    if (c2h4_pct > 50 && c2h2_pct < 15) return 'T3';
    
    // D1 - Low energy discharge
    if (c2h2_pct > 15 && c2h2_pct < 35) return 'D1';
    
    // D2 - High energy discharge
    if (c2h2_pct > 35) return 'D2';
    
    // S - Stray gassing
    if (ch4_pct > 90) return 'S';
    
    // If none of the above, return ND (not determined)
    return 'ND';
  },

  render(svg, sample) {
    // Clear SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    
    // Pentagon vertices (centered at 300,300 with radius ~250)
    const center = { x: 300, y: 300 };
    const radius = 250;
    const vertices = [
      { x: center.x, y: center.y - radius },                     // H2 (top)
      { x: center.x + radius * Math.sin(2 * Math.PI / 5),        // CH4 (top-right)
        y: center.y - radius * Math.cos(2 * Math.PI / 5) },
      { x: center.x + radius * Math.sin(4 * Math.PI / 5),        // C2H6 (bottom-right)
        y: center.y - radius * Math.cos(4 * Math.PI / 5) },
      { x: center.x + radius * Math.sin(6 * Math.PI / 5),        // C2H2 (bottom-left)
        y: center.y - radius * Math.cos(6 * Math.PI / 5) },
      { x: center.x + radius * Math.sin(8 * Math.PI / 5),        // C2H4 (top-left)
        y: center.y - radius * Math.cos(8 * Math.PI / 5) }
    ];
    
    // Zone boundaries (approximate)
    const zonePoints = {
      PD: [
        vertices[0],
        { x: center.x, y: center.y - radius * 0.1 },
        { x: center.x + radius * 0.1, y: center.y },
        { x: center.x - radius * 0.1, y: center.y },
        vertices[0]
      ],
      T1: [
        vertices[1],
        { x: center.x + radius * 0.3, y: center.y - radius * 0.1 },
        { x: center.x + radius * 0.1, y: center.y + radius * 0.1 },
        vertices[2],
        vertices[1]
      ],
      T2: [
        { x: center.x + radius * 0.3, y: center.y - radius * 0.1 },
        { x: center.x + radius * 0.1, y: center.y + radius * 0.1 },
        { x: center.x - radius * 0.1, y: center.y + radius * 0.1 },
        { x: center.x - radius * 0.3, y: center.y - radius * 0.1 },
        { x: center.x + radius * 0.3, y: center.y - radius * 0.1 }
      ],
      T3: [
        { x: center.x - radius * 0.1, y: center.y + radius * 0.1 },
        { x: center.x - radius * 0.3, y: center.y - radius * 0.1 },
        vertices[4],
        vertices[3],
        { x: center.x - radius * 0.1, y: center.y + radius * 0.1 }
      ],
      D1: [
        vertices[3],
        { x: center.x - radius * 0.1, y: center.y + radius * 0.3 },
        { x: center.x + radius * 0.1, y: center.y + radius * 0.3 },
        vertices[2],
        vertices[3]
      ],
      D2: [
        { x: center.x - radius * 0.1, y: center.y + radius * 0.3 },
        { x: center.x + radius * 0.1, y: center.y + radius * 0.3 },
        center,
        { x: center.x - radius * 0.1, y: center.y + radius * 0.3 }
      ],
      S: [
        vertices[1],
        { x: center.x + radius * 0.1, y: center.y },
        { x: center.x, y: center.y - radius * 0.1 },
        vertices[0],
        vertices[1]
      ]
    };
    
    // Zone colors and labels
    const zones = [
      { id: 'PD', name: 'PD', color: '#FFCCCC', labelPos: { x: center.x, y: center.y - radius * 0.5 } },
      { id: 'T1', name: 'T1', color: '#CCFFCC', labelPos: { x: center.x + radius * 0.4, y: center.y - radius * 0.2 } },
      { id: 'T2', name: 'T2', color: '#CCFF99', labelPos: { x: center.x, y: center.y } },
      { id: 'T3', name: 'T3', color: '#99FF99', labelPos: { x: center.x - radius * 0.4, y: center.y - radius * 0.2 } },
      { id: 'D1', name: 'D1', color: '#CCCCFF', labelPos: { x: center.x - radius * 0.2, y: center.y + radius * 0.3 } },
      { id: 'D2', name: 'D2', color: '#9999FF', labelPos: { x: center.x, y: center.y + radius * 0.2 } },
      { id: 'S', name: 'S', color: '#FFCCFF', labelPos: { x: center.x + radius * 0.2, y: center.y - radius * 0.3 } }
    ];
    
    // Draw zones
    zones.forEach(zone => {
      const points = zonePoints[zone.id].map(p => `${p.x},${p.y}`).join(' ');
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', points);
      polygon.setAttribute('fill', zone.color);
      polygon.setAttribute('stroke', '#000000');
      polygon.setAttribute('stroke-width', '1');
      svg.appendChild(polygon);
      
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', zone.labelPos.x);
      text.setAttribute('y', zone.labelPos.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '24');
      text.setAttribute('font-weight', 'bold');
      text.textContent = zone.name;
      svg.appendChild(text);
    });
    
    // Draw axes and labels
    const gasLabels = ['H₂', 'CH₄', 'C₂H₆', 'C₂H₂', 'C₂H₄'];
    vertices.forEach((vertex, i) => {
      // Axis line
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', center.x);
      line.setAttribute('y1', center.y);
      line.setAttribute('x2', vertex.x);
      line.setAttribute('y2', vertex.y);
      line.setAttribute('stroke', '#000000');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      
      // Gas label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', vertex.x + (vertex.x - center.x) * 0.1);
      text.setAttribute('y', vertex.y + (vertex.y - center.y) * 0.1);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '20');
      text.textContent = gasLabels[i];
      svg.appendChild(text);
    });
    
    // Draw sample point if provided
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const h2_pct = sample.h2 / total;
        const ch4_pct = sample.ch4 / total;
        const c2h6_pct = sample.c2h6 / total;
        const c2h4_pct = sample.c2h4 / total;
        const c2h2_pct = sample.c2h2 / total;
        
        // Calculate point position using pentagon coordinates
        const x = center.x + 
          radius * (0.5 * c2h4_pct * Math.sin(8 * Math.PI / 5) +
                    0.5 * c2h2_pct * Math.sin(6 * Math.PI / 5) +
                    0.5 * c2h6_pct * Math.sin(4 * Math.PI / 5) +
                    0.5 * ch4_pct * Math.sin(2 * Math.PI / 5) +
                    h2_pct * 0);
        
        const y = center.y - 
          radius * (0.5 * c2h4_pct * Math.cos(8 * Math.PI / 5) +
                    0.5 * c2h2_pct * Math.cos(6 * Math.PI / 5) +
                    0.5 * c2h6_pct * Math.cos(4 * Math.PI / 5) +
                    0.5 * ch4_pct * Math.cos(2 * Math.PI / 5) +
                    h2_pct * 1);
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '8');
        circle.setAttribute('fill', 'red');
        circle.setAttribute('stroke', 'black');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);
      }
    }
  }
};
