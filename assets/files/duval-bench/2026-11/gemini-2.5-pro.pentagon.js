const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total === 0) {
      return 'ND'; // Not determinable or No Fault
    }

    const p = {
      h2: 100 * h2 / total,
      ch4: 100 * ch4 / total,
      c2h6: 100 * c2h6 / total,
      c2h4: 100 * c2h4 / total,
      c2h2: 100 * c2h2 / total,
    };

    // This classification logic is from memory and represents a common interpretation.
    // The order of these checks is important.

    // PD - Partial Discharges
    // Characterized by very high relative H2, with almost nothing else.
    if (p.h2 > 98) {
      return 'PD';
    }

    // D2 - High energy discharges (arcing)
    // Characterized by high C2H2.
    if (p.c2h2 > 29 && p.c2h4 < 20) {
      return 'D2';
    }

    // D1 - Low energy discharges (sparking)
    // Characterized by significant C2H2.
    if (p.c2h2 >= 13 && p.c2h2 <= 29) {
      return 'D1';
    }
    
    // T3 - Thermal fault > 700 °C
    // Characterized by high C2H4.
    if (p.c2h4 >= 50 && p.c2h2 < 4) {
      return 'T3';
    }

    // T2 - Thermal fault, 300-700 °C
    // Characterized by moderate C2H4 and C2H6.
    if (p.c2h4 >= 20 && p.c2h4 < 50 && p.c2h2 < 4) {
      return 'T2';
    }

    // T1 - Thermal fault < 300 °C
    // Characterized by CH4 and C2H6, low C2H4.
    if (p.c2h4 < 20 && p.c2h2 < 4 && p.ch4 > 40) {
        return 'T1';
    }

    // DT - Mix of thermal and electrical faults
    // This is the central catch-all region.
    return 'DT';
  },

  render(svg, sample) {
    const NS = 'http://www.w3.org/2000/svg';
    const W = 600, H = 600;
    const cx = W / 2, cy = H / 2;
    const R = 270;

    const createEl = (name, attributes) => {
      const el = document.createElementNS(NS, name);
      for (const key in attributes) {
        el.setAttribute(key, attributes[key]);
      }
      return el;
    };

    // Gas definitions (vertices of the pentagon)
    const gases = [
      { name: 'H₂',   key: 'h2',   angle: 90 },
      { name: 'CH₄',  key: 'ch4',  angle: 18 },
      { name: 'C₂H₆', key: 'c2h6', angle: -54 },
      { name: 'C₂H₄', key: 'c2h4', angle: -126 },
      { name: 'C₂H₂', key: 'c2h2', angle: -198 }
    ];

    gases.forEach(g => {
      const rad = g.angle * Math.PI / 180;
      g.vx = cx + R * Math.cos(rad);
      g.vy = cy - R * Math.sin(rad);
    });

    const toXY = (percentages) => {
      const total = Object.values(percentages).reduce((a, b) => a + b, 0);
      if (total === 0) return { x: cx, y: cy };

      let x = 0, y = 0;
      gases.forEach(g => {
        const p = percentages[g.key] / total;
        x += p * g.vx;
        y += p * g.vy;
      });
      return { x, y };
    };

    // Clear SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Zone definitions (polygons) based on recalled visual geometry
    // The points are defined in percentage space and then converted to XY.
    const zones = [
      { name: 'PD', color: '#a7d9ef', points: [ {h2: 95, c2h2: 5}, {h2: 100}, {h2: 95, ch4: 5} ] },
      { name: 'D1', color: '#f5c2e0', points: [ {h2: 50, c2h2: 50}, {h2: 85, c2h2: 15}, {h2: 95, c2h2: 5}, {h2: 40, c2h4: 30, ch4:30} ] },
      { name: 'D2', color: '#d987c8', points: [ {c2h2: 100}, {h2: 50, c2h2: 50}, {h2: 40, c2h4: 30, ch4:30}, {c2h4: 50, c2h2: 50} ] },
      { name: 'T3', color: '#ff6961', points: [ {c2h4: 100}, {c2h6: 50, c2h4: 50}, {ch4: 10, c2h6: 20, c2h4: 40, c2h2: 2}, {c2h4: 50, c2h2: 50} ] },
      { name: 'T2', color: '#ffb347', points: [ {c2h6: 50, c2h4: 50}, {c2h6: 100}, {ch4: 50, c2h6: 50}, {ch4:60, c2h6:20, c2h4:20}, {ch4: 10, c2h6: 20, c2h4: 40, c2h2: 2} ] },
      { name: 'T1', color: '#fdfd96', points: [ {ch4: 50, c2h6: 50}, {ch4: 100}, {h2: 95, ch4: 5}, {h2: 40, ch4: 40, c2h2: 1, c2h4: 1, c2h6: 18}, {ch4:60, c2h6:20, c2h4:20} ] },
      { name: 'DT', color: '#d3d3d3', points: [ {h2: 40, ch4: 40, c2h2: 1, c2h4: 1, c2h6: 18}, {h2: 40, c2h4: 30, ch4:30}, {ch4: 10, c2h6: 20, c2h4: 40, c2h2: 2}, {ch4:60, c2h6:20, c2h4:20} ] }
    ];
    
    // Draw zones
    zones.forEach(zone => {
      const xyPoints = zone.points.map(p => toXY(p));
      const pointsAttr = xyPoints.map(p => `${p.x},${p.y}`).join(' ');
      const polygon = createEl('polygon', {
        points: pointsAttr,
        fill: zone.color,
        stroke: 'gray',
        'stroke-width': '0.5'
      });
      svg.appendChild(polygon);

      // Add zone labels
      let labelX = xyPoints.reduce((sum, p) => sum + p.x, 0) / xyPoints.length;
      let labelY = xyPoints.reduce((sum, p) => sum + p.y, 0) / xyPoints.length;
      
      const label = createEl('text', {
        x: labelX,
        y: labelY,
        'font-family': 'sans-serif',
        'font-size': zone.name === 'DT' ? '24' : '20',
        'text-anchor': 'middle',
        'alignment-baseline': 'middle',
        fill: 'black',
        'pointer-events': 'none'
      });
      label.textContent = zone.name;
      svg.appendChild(label);
    });

    // Draw axes and gas labels
    gases.forEach(g => {
      const axis = createEl('line', {
        x1: cx, y1: cy, x2: g.vx, y2: g.vy,
        stroke: 'black',
        'stroke-width': '1',
        'stroke-dasharray': '4 2'
      });
      svg.appendChild(axis);
      
      const labelRad = g.angle * Math.PI / 180;
      const labelR = R + 25;
      const label = createEl('text', {
        x: cx + labelR * Math.cos(labelRad),
        y: cy - labelR * Math.sin(labelRad),
        'font-family': 'sans-serif',
        'font-size': '20',
        'text-anchor': 'middle',
        'alignment-baseline': 'middle'
      });
      label.textContent = g.name;
      svg.appendChild(label);
    });
    
    // Draw pentagon outline
    const outlinePoints = gases.map(g => `${g.vx},${g.vy}`).join(' ');
    const outline = createEl('polygon', {
      points: outlinePoints,
      fill: 'none',
      stroke: 'black',
      'stroke-width': '2'
    });
    svg.appendChild(outline);

    // Draw sample point
    if (sample) {
      const total = Object.values(sample).reduce((a, b) => a + b, 0);
      if (total > 0) {
        const p = toXY(sample);
        const marker = createEl('circle', {
          cx: p.x,
          cy: p.y,
          r: '7',
          fill: 'red',
          stroke: 'white',
          'stroke-width': '2'
        });
        svg.appendChild(marker);
      }
    }
  }
};
