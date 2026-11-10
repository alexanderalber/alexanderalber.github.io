const DuvalTriangle5 = {
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;
    const p1 = (ch4 / total) * 100;
    const p2 = (c2h4 / total) * 100;
    const p3 = (c2h6 / total) * 100;

    if (p1 > 98) return 'PD';
    if (p2 < 4 && p3 < 20) return 'T1';
    if (p2 < 4 && p3 >= 20) return 'T2';
    if (p2 >= 4 && p2 < 20 && p3 < 20) return 'T2';
    if (p2 >= 4 && p2 < 20 && p3 >= 20) return 'T3';
    if (p2 >= 20 && p3 < 20) return 'T3';
    if (p2 >= 20 && p3 >= 20) return 'O';
    return 'PD'; // default if none of the above
  },

  render(svg, sample) {
    // Clear SVG
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Define triangle points (equilateral triangle)
    const height = 520;
    const top = { x: 300, y: 10 };
    const left = { x: 50, y: 510 };
    const right = { x: 550, y: 510 };

    // Draw triangle outline
    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    outline.setAttribute('points', `${top.x},${top.y} ${left.x},${left.y} ${right.x},${right.y}`);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', 'black');
    outline.setAttribute('stroke-width', '2');
    svg.appendChild(outline);

    // Define zones
    const zones = [
      { points: [top, {x: 300, y: 170}, {x: 170, y: 340}, left], code: 'PD', color: '#FFCCCC', name: 'PD' },
      { points: [top, {x: 300, y: 170}, {x: 170, y: 340}, {x: 300, y: 340}, {x: 430, y: 340}, right], code: 'T1', color: '#CCFFCC', name: 'T1' },
      { points: [{x: 300, y: 170}, {x: 170, y: 340}, {x: 300, y: 340}, {x: 430, y: 340}, {x: 300, y: 340}], code: 'T2', color: '#CCCCFF', name: 'T2' },
      { points: [{x: 170, y: 340}, {x: 300, y: 340}, {x: 430, y: 340}, left, right], code: 'T3', color: '#FFFFCC', name: 'T3' },
      { points: [{x: 300, y: 170}, {x: 430, y: 340}, right, {x: 300, y: 340}], code: 'O', color: '#FFCCFF', name: 'O' }
    ];

    // Draw zones
    zones.forEach(zone => {
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const pointsStr = zone.points.map(p => `${p.x},${p.y}`).join(' ');
      polygon.setAttribute('points', pointsStr);
      polygon.setAttribute('fill', zone.color);
      polygon.setAttribute('stroke', 'black');
      polygon.setAttribute('stroke-width', '1');
      svg.appendChild(polygon);

      // Add zone label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const centroid = this._getCentroid(zone.points);
      label.setAttribute('x', centroid.x);
      label.setAttribute('y', centroid.y);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '24');
      label.textContent = zone.name;
      svg.appendChild(label);
    });

    // Draw axes labels
    const labels = [
      { text: 'CH₄', x: top.x, y: top.y - 20, anchor: 'middle' },
      { text: 'C₂H₄', x: right.x + 30, y: right.y, anchor: 'start' },
      { text: 'C₂H₆', x: left.x - 30, y: left.y, anchor: 'end' }
    ];

    labels.forEach(label => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', label.x);
      text.setAttribute('y', label.y);
      text.setAttribute('text-anchor', label.anchor);
      text.setAttribute('font-size', '20');
      text.textContent = label.text;
      svg.appendChild(text);
    });

    // Draw tick marks and percentages
    const ticks = [
      { axis: 'CH4', pos: 0.2, x: 170, y: 340, label: '20%' },
      { axis: 'CH4', pos: 0.4, x: 300, y: 170, label: '40%' },
      { axis: 'C2H4', pos: 0.2, x: 430, y: 340, label: '20%' },
      { axis: 'C2H6', pos: 0.2, x: 170, y: 340, label: '20%' }
    ];

    ticks.forEach(tick => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      // Simplified tick marks - would need proper calculation for exact positions
      line.setAttribute('x1', tick.x - 10);
      line.setAttribute('y1', tick.y - 10);
      line.setAttribute('x2', tick.x + 10);
      line.setAttribute('y2', tick.y + 10);
      line.setAttribute('stroke', 'black');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', tick.x + 15);
      text.setAttribute('y', tick.y + 15);
      text.setAttribute('font-size', '14');
      text.textContent = tick.label;
      svg.appendChild(text);
    });

    // Plot sample point if provided
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h6;
      const p1 = sample.ch4 / total;
      const p2 = sample.c2h4 / total;
      const p3 = sample.c2h6 / total;

      // Convert to barycentric coordinates
      const x = left.x * p3 + right.x * p2 + top.x * p1;
      const y = left.y * p3 + right.y * p2 + top.y * p1;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', 8);
      circle.setAttribute('fill', 'red');
      circle.setAttribute('stroke', 'black');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);
    }
  },

  _getCentroid(points) {
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    return { x, y };
  }
};
