const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total <= 0) throw new Error('Gas concentrations must sum to a positive value.');

    const h2n = h2 / total;
    const ch4n = ch4 / total;
    const c2h6n = c2h6 / total;
    const c2h4n = c2h4 / total;
    const c2h2n = c2h2 / total;

    if (c2h2n > 0.35) return 'D1';
    if (c2h2n + c2h4n > 0.5 && c2h2n <= 0.35) return 'D2';
    if (c2h4n > 0.7) return 'T3';
    if (ch4n > 0.98) return 'PD';
    if (c2h6n > 0.4) return 'T1';
    
    return 'T2';
  },

  render(svg, sample) {
    const xmlns = "http://www.w3.org/2000/svg";
    const size = 600;
    const center = size / 2;
    const radius = 250;
    const gasLabels = ['H2', 'CH4', 'C2H6', 'C2H4', 'C2H2'];
    const zones = [
      { name: 'PD', points: [0, 0.98, 0.02, 0, 0], color: '#FFC0CB' },
      { name: 'T1', points: [0, 0.4, 0.6, 0, 0], color: '#ADD8E6' },
      { name: 'T2', points: [0, 0.02, 0.5, 0.48, 0], color: '#98FB98' },
      { name: 'T3', points: [0, 0, 0, 0.3, 0.7], color: '#FFFF00' },
      { name: 'D2', points: [0, 0, 0, 0.15, 0.5], color: '#FFA500' },
      { name: 'D1', points: [0, 0, 0, 0, 0.35], color: '#FF4500' }
    ];

    const toPolar = (angle, magnitude) => ({
      x: center + magnitude * radius * Math.cos(angle),
      y: center - magnitude * radius * Math.sin(angle)
    });
    
    // Draw background and axes
    svg.setAttributeNS(null, 'width', size);
    svg.setAttributeNS(null, 'height', size);

    const gAxis = document.createElementNS(xmlns, 'g');
    gasLabels.forEach((label, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI / 5);
      const outerPoint = toPolar(angle, 1);
      const labelPoint = toPolar(angle, 1.1);

      const axisLine = document.createElementNS(xmlns, 'line');
      axisLine.setAttributeNS(null, 'x1', center);
      axisLine.setAttributeNS(null, 'y1', center);
      axisLine.setAttributeNS(null, 'x2', outerPoint.x);
      axisLine.setAttributeNS(null, 'y2', outerPoint.y);
      axisLine.setAttributeNS(null, 'stroke', '#000');
      gAxis.appendChild(axisLine);

      const text = document.createElementNS(xmlns, 'text');
      text.setAttributeNS(null, 'x', labelPoint.x);
      text.setAttributeNS(null, 'y', labelPoint.y);
      text.setAttributeNS(null, 'text-anchor', 'middle');
      text.setAttributeNS(null, 'alignment-baseline', 'middle');
      text.setAttributeNS(null, 'font-size', '12');
      text.textContent = label;
      gAxis.appendChild(text);
    });
    svg.appendChild(gAxis);

    // Draw zones
    const gZones = document.createElementNS(xmlns, 'g');
    zones.forEach(zone => {
      const points = zone.points.map((v, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI / 5);
        const point = toPolar(angle, v);
        return `${point.x},${point.y}`;
      }).join(' ');

      const polygon = document.createElementNS(xmlns, 'polygon');
      polygon.setAttributeNS(null, 'points', points);
      polygon.setAttributeNS(null, 'fill', zone.color);
      polygon.setAttributeNS(null, 'stroke', '#000');
      polygon.setAttributeNS(null, 'stroke-width', '0.5');
      gZones.appendChild(polygon);

      const labelPoint = toPolar(-Math.PI / 2 + (zones.indexOf(zone) * 2 * Math.PI / 5), 0.5);
      const text = document.createElementNS(xmlns, 'text');
      text.setAttributeNS(null, 'x', labelPoint.x);
      text.setAttributeNS(null, 'y', labelPoint.y);
      text.setAttributeNS(null, 'text-anchor', 'middle');
      text.setAttributeNS(null, 'alignment-baseline', 'middle');
      text.setAttributeNS(null, 'font-size', '10');
      text.textContent = zone.name;
      gZones.appendChild(text);
    });
    svg.appendChild(gZones);

    // Plot the sample point
    if (sample) {
      const { h2, ch4, c2h6, c2h4, c2h2 } = sample;
      const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
      if (total <= 0) throw new Error('Gas concentrations must sum to a positive value.');

      const normalized = [
        h2 / total,
        ch4 / total,
        c2h6 / total,
        c2h4 / total,
        c2h2 / total
      ];

      let x = 0;
      let y = 0;
      normalized.forEach((value, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI / 5);
        x += value * Math.cos(angle);
        y -= value * Math.sin(angle); // SVG y-axis is inverted
      });

      x = center + x * radius;
      y = center + y * radius;

      const circle = document.createElementNS(xmlns, 'circle');
      circle.setAttributeNS(null, 'cx', x);
      circle.setAttributeNS(null, 'cy', y);
      circle.setAttributeNS(null, 'r', 6);
      circle.setAttributeNS(null, 'fill', '#FF0000');
      gZones.appendChild(circle);
    }
  }
};
