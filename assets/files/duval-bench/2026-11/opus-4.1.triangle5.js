const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    const pctCH4 = (ch4 / total) * 100;
    const pctC2H4 = (c2h4 / total) * 100;
    const pctC2H6 = (c2h6 / total) * 100;
    
    if (pctCH4 > 98) return 'PD';
    if (pctC2H6 > 23) return 'S';
    if (pctC2H4 > 20) return 'T2';
    return 'T1';
  },

  render(svg, sample) {
    const ns = 'http://www.w3.org/2000/svg';
    
    // Triangle vertices
    const top = {x: 300, y: 30};
    const left = {x: 30, y: 510};
    const right = {x: 570, y: 510};
    
    // Convert percentages to x,y coordinates
    function toXY(pctCH4, pctC2H4, pctC2H6) {
      const x = left.x * (pctC2H4/100) + right.x * (pctC2H6/100) + top.x * (pctCH4/100);
      const y = left.y * (pctC2H4/100) + right.y * (pctC2H6/100) + top.y * (pctCH4/100);
      return {x, y};
    }
    
    // Draw zone fills
    const zones = [
      {code: 'PD', color: '#ffcccc', points: [
        toXY(98, 2, 0),
        toXY(98, 0, 2),
        toXY(100, 0, 0)
      ]},
      {code: 'S', color: '#ccffcc', points: [
        toXY(77, 0, 23),
        toXY(0, 77, 23),
        toXY(0, 0, 100),
        toXY(98, 0, 2)
      ]},
      {code: 'T2', color: '#ccccff', points: [
        toXY(0, 100, 0),
        toXY(0, 77, 23),
        toXY(77, 0, 23),
        toXY(80, 20, 0)
      ]},
      {code: 'T1', color: '#ffffcc', points: [
        toXY(98, 2, 0),
        toXY(77, 0, 23),
        toXY(80, 20, 0)
      ]}
    ];
    
    zones.forEach(zone => {
      const polygon = document.createElementNS(ns, 'polygon');
      polygon.setAttribute('points', zone.points.map(p => `${p.x},${p.y}`).join(' '));
      polygon.setAttribute('fill', zone.color);
      polygon.setAttribute('stroke', '#333');
      polygon.setAttribute('stroke-width', '1');
      svg.appendChild(polygon);
    });
    
    // Draw triangle outline
    const outline = document.createElementNS(ns, 'polygon');
    outline.setAttribute('points', `${top.x},${top.y} ${left.x},${left.y} ${right.x},${right.y}`);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', '#000');
    outline.setAttribute('stroke-width', '2');
    svg.appendChild(outline);
    
    // Draw grid lines
    for (let i = 10; i <= 90; i += 10) {
      // CH4 lines (horizontal)
      const ch4Line = document.createElementNS(ns, 'line');
      const p1 = toXY(i, 100-i, 0);
      const p2 = toXY(i, 0, 100-i);
      ch4Line.setAttribute('x1', p1.x);
      ch4Line.setAttribute('y1', p1.y);
      ch4Line.setAttribute('x2', p2.x);
      ch4Line.setAttribute('y2', p2.y);
      ch4Line.setAttribute('stroke', '#ccc');
      ch4Line.setAttribute('stroke-width', '0.5');
      svg.appendChild(ch4Line);
      
      // C2H4 lines (from left vertex)
      const c2h4Line = document.createElementNS(ns, 'line');
      const p3 = toXY(100-i, i, 0);
      const p4 = toXY(0, i, 100-i);
      c2h4Line.setAttribute('x1', p3.x);
      c2h4Line.setAttribute('y1', p3.y);
      c2h4Line.setAttribute('x2', p4.x);
      c2h4Line.setAttribute('y2', p4.y);
      c2h4Line.setAttribute('stroke', '#ccc');
      c2h4Line.setAttribute('stroke-width', '0.5');
      svg.appendChild(c2h4Line);
      
      // C2H6 lines (from right vertex)
      const c2h6Line = document.createElementNS(ns, 'line');
      const p5 = toXY(100-i, 0, i);
      const p6 = toXY(0, 100-i, i);
      c2h6Line.setAttribute('x1', p5.x);
      c2h6Line.setAttribute('y1', p5.y);
      c2h6Line.setAttribute('x2', p6.x);
      c2h6Line.setAttribute('y2', p6.y);
      c2h6Line.setAttribute('stroke', '#ccc');
      c2h6Line.setAttribute('stroke-width', '0.5');
      svg.appendChild(c2h6Line);
    }
    
    // Add tick marks and labels
    for (let i = 0; i <= 100; i += 20) {
      // Left side ticks (C2H6)
      const leftTick = toXY(100-i, 0, i);
      const leftMark = document.createElementNS(ns, 'line');
      leftMark.setAttribute('x1', leftTick.x - 5);
      leftMark.setAttribute('y1', leftTick.y);
      leftMark.setAttribute('x2', leftTick.x + 5);
      leftMark.setAttribute('y2', leftTick.y);
      leftMark.setAttribute('stroke', '#000');
      leftMark.setAttribute('stroke-width', '1');
      svg.appendChild(leftMark);
      
      // Right side ticks (C2H4)
      const rightTick = toXY(100-i, i, 0);
      const rightMark = document.createElementNS(ns, 'line');
      rightMark.setAttribute('x1', rightTick.x - 5);
      rightMark.setAttribute('y1', rightTick.y);
      rightMark.setAttribute('x2', rightTick.x + 5);
      rightMark.setAttribute('y2', rightTick.y);
      rightMark.setAttribute('stroke', '#000');
      rightMark.setAttribute('stroke-width', '1');
      svg.appendChild(rightMark);
      
      // Bottom ticks (CH4)
      const bottomTick = toXY(0, 100-i, i);
      const bottomMark = document.createElementNS(ns, 'line');
      bottomMark.setAttribute('x1', bottomTick.x);
      bottomMark.setAttribute('y1', bottomTick.y - 5);
      bottomMark.setAttribute('x2', bottomTick.x);
      bottomMark.setAttribute('y2', bottomTick.y + 5);
      bottomMark.setAttribute('stroke', '#000');
      bottomMark.setAttribute('stroke-width', '1');
      svg.appendChild(bottomMark);
    }
    
    // Add gas labels
    const ch4Label = document.createElementNS(ns, 'text');
    ch4Label.setAttribute('x', top.x);
    ch4Label.setAttribute('y', top.y - 10);
    ch4Label.setAttribute('text-anchor', 'middle');
    ch4Label.setAttribute('font-size', '14');
    ch4Label.setAttribute('font-weight', 'bold');
    ch4Label.textContent = 'CH₄ (%)';
    svg.appendChild(ch4Label);
    
    const c2h4Label = document.createElementNS(ns, 'text');
    c2h4Label.setAttribute('x', left.x - 10);
    c2h4Label.setAttribute('y', left.y + 20);
    c2h4Label.setAttribute('text-anchor', 'middle');
    c2h4Label.setAttribute('font-size', '14');
    c2h4Label.setAttribute('font-weight', 'bold');
    c2h4Label.textContent = 'C₂H₄ (%)';
    svg.appendChild(c2h4Label);
    
    const c2h6Label = document.createElementNS(ns, 'text');
    c2h6Label.setAttribute('x', right.x + 10);
    c2h6Label.setAttribute('y', right.y + 20);
    c2h6Label.setAttribute('text-anchor', 'middle');
    c2h6Label.setAttribute('font-size', '14');
    c2h6Label.setAttribute('font-weight', 'bold');
    c2h6Label.textContent = 'C₂H₆ (%)';
    svg.appendChild(c2h6Label);
    
    // Add zone labels
    const zoneLabels = [
      {code: 'PD', x: 300, y: 60},
      {code: 'T1', x: 240, y: 200},
      {code: 'T2', x: 150, y: 350},
      {code: 'S', x: 400, y: 350}
    ];
    
    zoneLabels.forEach(label => {
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', label.x);
      text.setAttribute('y', label.y);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '18');
      text.setAttribute('font-weight', 'bold');
      text.textContent = label.code;
      svg.appendChild(text);
    });
    
    // Plot sample point if provided
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      const pctCH4 = (sample.ch4 / total) * 100;
      const pctC2H4 = (sample.c2h4 / total) * 100;
      const pctC2H6 = (sample.c2h6 / total) * 100;
      const point = toXY(pctCH4, pctC2H4, pctC2H6);
      
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', point.x);
      circle.setAttribute('cy', point.y);
      circle.setAttribute('r', '5');
      circle.setAttribute('fill', 'red');
      circle.setAttribute('stroke', '#000');
      circle.setAttribute('stroke-width', '1');
      svg.appendChild(circle);
    }
  }
};
