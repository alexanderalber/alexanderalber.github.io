const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    // Prevent division by zero with minimum threshold
    const min = 0.1;
    h2 = Math.max(h2, min);
    ch4 = Math.max(ch4, min);
    c2h6 = Math.max(c2h6, min);
    c2h4 = Math.max(c2h4, min);
    c2h2 = Math.max(c2h2, min);

    // Calculate the five key logarithmic ratios
    const r1 = Math.log10(h2 / ch4);
    const r2 = Math.log10(ch4 / c2h6);
    const r3 = Math.log10(c2h6 / c2h4);
    const r4 = Math.log10(c2h4 / c2h2);
    const r5 = Math.log10(c2h2 / h2);

    // Decision boundaries for zone classification
    // These boundaries define the Duval Pentagon zones

    if (r5 > 1.0) {
      // High acetylene zone
      if (r4 < 0.4) return 'DT';
      return 'PD';
    }

    if (r4 > 1.0 && r3 < -0.5) {
      return 'T3';
    }

    if (r3 < -1.0) {
      if (r1 > 0.5) return 'T3';
      if (r1 < -0.5) return 'T2';
      return 'T2';
    }

    if (r2 > 1.0 && r5 < 0.5) {
      return 'PD';
    }

    if (r3 > 0) {
      return 'T1';
    }

    return 'T1';
  },

  render(svg, sample) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const centerX = 300;
    const centerY = 300;
    const radius = 180;

    // Five axes at equal angles, starting from top
    const angles = Array.from({ length: 5 }, (_, i) => 
      (i * 2 * Math.PI / 5) - Math.PI / 2
    );

    const vertices = angles.map(angle => ({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      angle: angle
    }));

    // Draw background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '600');
    bg.setAttribute('height', '600');
    bg.setAttribute('fill', 'white');
    svg.appendChild(bg);

    // Draw pentagon outline
    const pentagonPoints = vertices.map(v => `${v.x},${v.y}`).join(' ');
    const pentagon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    pentagon.setAttribute('points', pentagonPoints);
    pentagon.setAttribute('fill', '#f5f5f5');
    pentagon.setAttribute('stroke', '#333333');
    pentagon.setAttribute('stroke-width', '2');
    svg.appendChild(pentagon);

    // Zone colors
    const zoneColors = ['#ffe0e0', '#e0f0ff', '#e0ffe0', '#fff8e0', '#f0e0ff'];
    const zoneNames = ['PD', 'T1', 'T2', 'T3', 'DT'];

    // Draw zone polygons
    for (let i = 0; i < 5; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % 5];
      const zonePoints = [
        `${centerX},${centerY}`,
        `${v1.x},${v1.y}`,
        `${v2.x},${v2.y}`
      ].join(' ');

      const zone = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      zone.setAttribute('points', zonePoints);
      zone.setAttribute('fill', zoneColors[i]);
      zone.setAttribute('stroke', 'none');
      zone.setAttribute('opacity', '0.6');
      svg.appendChild(zone);
    }

    // Draw axes from center
    const gasNames = ['H2/CH4', 'CH4/C2H6', 'C2H6/C2H4', 'C2H4/C2H2', 'C2H2/H2'];
    for (let i = 0; i < 5; i++) {
      const v = vertices[i];
      const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      axis.setAttribute('x1', `${centerX}`);
      axis.setAttribute('y1', `${centerY}`);
      axis.setAttribute('x2', `${v.x}`);
      axis.setAttribute('y2', `${v.y}`);
      axis.setAttribute('stroke', '#999999');
      axis.setAttribute('stroke-width', '1');
      axis.setAttribute('stroke-dasharray', '3,3');
      svg.appendChild(axis);
    }

    // Draw axis labels
    for (let i = 0; i < 5; i++) {
      const v = vertices[i];
      const labelDist = radius + 30;
      const labelX = centerX + labelDist * Math.cos(v.angle);
      const labelY = centerY + labelDist * Math.sin(v.angle);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', `${labelX}`);
      label.setAttribute('y', `${labelY}`);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '13');
      label.setAttribute('font-weight', 'bold');
      label.setAttribute('fill', '#333333');
      label.textContent = gasNames[i];
      svg.appendChild(label);
    }

    // Draw zone labels
    for (let i = 0; i < 5; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % 5];
      const midAngle = (v1.angle + v2.angle) / 2;
      const labelRadius = radius * 0.55;
      const labelX = centerX + labelRadius * Math.cos(midAngle);
      const labelY = centerY + labelRadius * Math.sin(midAngle);

      const zLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      zLabel.setAttribute('x', `${labelX}`);
      zLabel.setAttribute('y', `${labelY}`);
      zLabel.setAttribute('text-anchor', 'middle');
      zLabel.setAttribute('dominant-baseline', 'middle');
      zLabel.setAttribute('font-size', '14');
      zLabel.setAttribute('font-weight', 'bold');
      zLabel.setAttribute('fill', '#000000');
      zLabel.textContent = zoneNames[i];
      svg.appendChild(zLabel);
    }

    // Mark sample point if provided
    if (sample) {
      const min = 0.1;
      const h2 = Math.max(sample.h2, min);
      const ch4 = Math.max(sample.ch4, min);
      const c2h6 = Math.max(sample.c2h6, min);
      const c2h4 = Math.max(sample.c2h4, min);
      const c2h2 = Math.max(sample.c2h2, min);

      const ratios = [
        Math.log10(h2 / ch4),
        Math.log10(ch4 / c2h6),
        Math.log10(c2h6 / c2h4),
        Math.log10(c2h4 / c2h2),
        Math.log10(c2h2 / h2)
      ];

      // Normalize ratios to radial distance (0 to 1)
      const minLog = -4, maxLog = 4;
      const normalized = ratios.map(r => 
        Math.max(0, Math.min(1, (r - minLog) / (maxLog - minLog)))
      );

      // Convert to Cartesian coordinates
      let pointX = 0, pointY = 0;
      for (let i = 0; i < 5; i++) {
        const dist = normalized[i] * radius;
        pointX += dist * Math.cos(vertices[i].angle);
        pointY += dist * Math.sin(vertices[i].angle);
      }
      pointX = centerX + pointX / 5;
      pointY = centerY + pointY / 5;

      // Draw sample point
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', `${pointX}`);
      circle.setAttribute('cy', `${pointY}`);
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', '#ff0000');
      circle.setAttribute('stroke', '#cc0000');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);
    }
  }
};
