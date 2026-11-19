const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total === 0) return 'N/A';
    
    const p1 = (h2 / total) * 100;
    const p2 = (ch4 / total) * 100;
    const p3 = (c2h6 / total) * 100;
    const p4 = (c2h4 / total) * 100;
    const p5 = (c2h2 / total) * 100;
    
    // Duval Pentagon 1 zones
    // The pentagon vertices: H2, CH4, C2H6, C2H4, C2H2 in clockwise order
    // Determine the position in the pentagon using barycentric coordinates
    
    // The point in the pentagon is determined by projecting the percentages
    // onto the 5 sides. We'll compute the coordinates in a regular pentagon.
    
    // Approximate decision boundaries based on memory of Duval Pentagon 1
    // The zones are: PD, D1, D2, T1, T2, T3, C
    
    // First, check for pure cases near vertices
    if (p1 > 75) return 'PD'; // High H2 - Partial Discharge
    if (p2 > 75) return 'C';  // High CH4 - Corona/low energy
    if (p3 > 75) return 'C';  // High C2H6 - Thermal < 300°C
    if (p4 > 75) return 'T3'; // High C2H4 - Thermal > 700°C
    if (p5 > 75) return 'T2'; // High C2H2 - Thermal 300-700°C
    
    // Check D1 (low energy discharge)
    if (p5 < 10 && p4 > p3 && p4 > p2 && p4 > 20 && p1 < 40) return 'D1';
    
    // Check D2 (high energy discharge)
    if (p5 > 10 && p5 > p4 && p5 > p2 && p1 < 50) return 'D2';
    
    // Thermal faults
    if (p3 > p2 && p3 > p5 && p3 > 20) return 'T1'; // Thermal < 300°C
    
    // T2: C2H2 significant, but not dominant
    if (p5 > 10 && p5 > p4 * 0.5 && p4 < 50) return 'T2';
    
    // T3: C2H4 dominant thermal
    if (p4 > 50 && p4 > p3 && p4 > p5) return 'T3';
    
    // If mostly CH4 and H2, could be C (corona)
    if (p2 > 40 && p1 > 30 && p4 < 20 && p5 < 10) return 'C';
    
    // D1: moderate C2H4, low C2H2
    if (p4 > 20 && p4 > p3 && p4 > p2 && p5 < 10 && p1 < 50) return 'D1';
    
    // If we're in the center, might be mixed
    if (p1 < 30 && p2 < 30 && p3 < 30 && p4 < 30 && p5 < 30) {
      // Most balanced - could be D1 or T1
      if (p4 > p3) return 'D1';
      if (p3 > p4) return 'T1';
    }
    
    // Default fallbacks based on dominant gas
    if (p4 >= p2 && p4 >= p3 && p4 >= p5) {
      if (p5 < 20) return 'D1';
      return 'T2';
    }
    if (p5 > p4 && p5 > p2) return 'D2';
    if (p3 > p2 && p3 > p4) return 'T1';
    if (p2 > p3 && p2 > p4) {
      if (p1 > 40) return 'C';
      return 'T1';
    }
    
    // Final fallback
    return 'N/A';
  },
  
  render(svg, sample) {
    // Clear the SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    
    const NS = 'http://www.w3.org/2000/svg';
    const width = 600;
    const height = 600;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 200;
    
    // Pentagon vertices (H2, CH4, C2H6, C2H4, C2H2) in clockwise order
    const vertices = [];
    const labels = ['H2', 'CH4', 'C2H6', 'C2H4', 'C2H2'];
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI / 2) - (2 * Math.PI * i / 5);
      vertices.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY - radius * Math.sin(angle),
        label: labels[i]
      });
    }
    
    // Draw pentagon outline
    const polygon = document.createElementNS(NS, 'polygon');
    polygon.setAttribute('points', vertices.map(v => `${v.x},${v.y}`).join(' '));
    polygon.setAttribute('fill', 'none');
    polygon.setAttribute('stroke', 'black');
    polygon.setAttribute('stroke-width', '2');
    svg.appendChild(polygon);
    
    // Draw radial lines from center to vertices
    for (let i = 0; i < 5; i++) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', centerX);
      line.setAttribute('y1', centerY);
      line.setAttribute('x2', vertices[i].x);
      line.setAttribute('y2', vertices[i].y);
      line.setAttribute('stroke', 'black');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      
      // Label the vertex
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', vertices[i].x + (vertices[i].x - centerX) * 0.1);
      label.setAttribute('y', vertices[i].y + (vertices[i].y - centerY) * 0.1);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '16');
      label.setAttribute('font-family', 'Arial');
      label.textContent = vertices[i].label;
      svg.appendChild(label);
      
      // Draw concentric pentagons for 20%, 40%, 60%, 80%, 100%
      for (let level = 0.2; level <= 1.0; level += 0.2) {
        const innerRadius = radius * level;
        const innerX = centerX + innerRadius * Math.cos((Math.PI / 2) - (2 * Math.PI * i / 5));
        const innerY = centerY - innerRadius * Math.sin((Math.PI / 2) - (2 * Math.PI * i / 5));
        
        if (level < 1.0) {
          const innerLine = document.createElementNS(NS, 'line');
          innerLine.setAttribute('x1', innerX);
          innerLine.setAttribute('y1', innerY);
          innerLine.setAttribute('x2', innerX + 10 * Math.cos((Math.PI / 2) - (2 * Math.PI * i / 5)));
          innerLine.setAttribute('y2', innerY - 10 * Math.sin((Math.PI / 2) - (2 * Math.PI * i / 5)));
          innerLine.setAttribute('stroke', 'black');
          innerLine.setAttribute('stroke-width', '1');
          svg.appendChild(innerLine);
        }
      }
    }
    
    // Draw concentric pentagons
    for (let level = 0.2; level <= 0.8; level += 0.2) {
      const points = [];
      for (let i = 0; i < 5; i++) {
        const angle = (Math.PI / 2) - (2 * Math.PI * i / 5);
        const x = centerX + radius * level * Math.cos(angle);
        const y = centerY - radius * level * Math.sin(angle);
        points.push(`${x},${y}`);
      }
      const concentric = document.createElementNS(NS, 'polygon');
      concentric.setAttribute('points', points.join(' '));
      concentric.setAttribute('fill', 'none');
      concentric.setAttribute('stroke', 'gray');
      concentric.setAttribute('stroke-width', '1');
      concentric.setAttribute('stroke-dasharray', '5,5');
      svg.appendChild(concentric);
      
      // Add percentage label
      const angle = (Math.PI / 2) - (2 * Math.PI * 0 / 5);
      const labelX = centerX + radius * level * Math.cos(angle);
      const labelY = centerY - radius * level * Math.sin(angle) - 15;
      const percentLabel = document.createElementNS(NS, 'text');
      percentLabel.setAttribute('x', labelX);
      percentLabel.setAttribute('y', labelY);
      percentLabel.setAttribute('text-anchor', 'middle');
      percentLabel.setAttribute('font-size', '12');
      percentLabel.setAttribute('fill', 'gray');
      percentLabel.textContent = `${Math.round(level * 100)}%`;
      svg.appendChild(percentLabel);
    }
    
    // Fill zones (approximate based on memory)
    // We'll create paths for each zone
    
    // Zone PD (near H2)
    const pdPath = document.createElementNS(NS, 'polygon');
    pdPath.setAttribute('points', [
      `${centerX},${centerY}`,
      `${vertices[0].x * 0.3 + centerX * 0.7},${vertices[0].y * 0.3 + centerY * 0.7}`,
      `${vertices[1].x * 0.3 + centerX * 0.7},${vertices[1].y * 0.3 + centerY * 0.7}`
    ].join(' '));
    pdPath.setAttribute('fill', '#ffcccc');
    pdPath.setAttribute('stroke', 'none');
    svg.appendChild(pdPath);
    
    // Label PD
    const pdLabel = document.createElementNS(NS, 'text');
    pdLabel.setAttribute('x', centerX + (vertices[0].x - centerX) * 0.2);
    pdLabel.setAttribute('y', centerY + (vertices[0].y - centerY) * 0.2);
    pdLabel.setAttribute('text-anchor', 'middle');
    pdLabel.setAttribute('font-size', '14');
    pdLabel.setAttribute('font-weight', 'bold');
    pdLabel.textContent = 'PD';
    svg.appendChild(pdLabel);
    
    // Zone C (near CH4 and C2H6)
    const cPath = document.createElementNS(NS, 'polygon');
    cPath.setAttribute('points', [
      `${centerX},${centerY}`,
      `${vertices[1].x * 0.4 + centerX * 0.6},${vertices[1].y * 0.4 + centerY * 0.6}`,
      `${vertices[2].x * 0.4 + centerX * 0.6},${vertices[2].y * 0.4 + centerY * 0.6}`
    ].join(' '));
    cPath.setAttribute('fill', '#ccffcc');
    cPath.setAttribute('stroke', 'none');
    svg.appendChild(cPath);
    
    // Label C
    const cLabel = document.createElementNS(NS, 'text');
    cLabel.setAttribute('x', centerX + (vertices[1].x + vertices[2].x - 2 * centerX) * 0.2);
    cLabel.setAttribute('y', centerY + (vertices[1].y + vertices[2].y - 2 * centerY) * 0.2);
    cLabel.setAttribute('text-anchor', 'middle');
    cLabel.setAttribute('font-size', '14');
    cLabel.setAttribute('font-weight', 'bold');
    cLabel.textContent = 'C';
    svg.appendChild(cLabel);
    
    // Zone T1 (near C2H6)
    const t1Path = document.createElementNS(NS, 'polygon');
    t1Path.setAttribute('points', [
      `${centerX},${centerY}`,
      `${vertices[2].x * 0.5 + centerX * 0.5},${vertices[2].y * 0.5 + centerY * 0.5}`,
      `${vertices[3].x * 0.3 + centerX * 0.7},${vertices[3].y * 0.3 + centerY * 0.7}`
    ].join(' '));
    t1Path.setAttribute('fill', '#ffffcc');
    t1Path.setAttribute('stroke', 'none');
    svg.appendChild(t1Path);
    
    // Label T1
    const t1Label = document.createElementNS(NS, 'text');
    t1Label.setAttribute('x', centerX + (vertices[2].x * 0.4 + vertices[3].x * 0.2 - centerX * 0.6));
    t1Label.setAttribute('y', centerY + (vertices[2].y * 0.4 + vertices[3].y * 0.2 - centerY * 0.6));
    t1Label.setAttribute('text-anchor', 'middle');
    t1Label.setAttribute('font-size', '14');
    t1Label.setAttribute('font-weight', 'bold');
    t1Label.textContent = 'T1';
    svg.appendChild(t1Label);
    
    // Zone T2 (near C2H2)
    const t2Path = document.createElementNS(NS, 'polygon');
    t2Path.setAttribute('points', [
      `${centerX},${centerY}`,
      `${vertices[4].x * 0.5 + centerX * 0.5},${vertices[4].y * 0.5 + centerY * 0.5}`,
      `${vertices[0].x * 0.3 + centerX * 0.7},${vertices[0].y * 0.3 + centerY * 0.7}`
    ].join(' '));
    t2Path.setAttribute('fill', '#ccccff');
    t2Path.setAttribute('stroke', 'none');
    svg.appendChild(t2Path);
    
    // Label T2
    const t2Label = document.createElementNS(NS, 'text');
    t2Label.setAttribute('x', centerX + (vertices[4].x * 0.4 + vertices[0].x * 0.2 - centerX * 0.6));
    t2Label.setAttribute('y', centerY + (vertices[4].y * 0.4 + vertices[0].y * 0.2 - centerY * 0.6));
    t2Label.setAttribute('text-anchor', 'middle');
    t2Label.setAttribute('font-size', '14');
    t2Label.setAttribute('font-weight', 'bold');
    t2Label.textContent = 'T2';
    svg.appendChild(t2Label);
    
    // Zone T3 (near C2H4)
    const t3Path = document.createElementNS(NS, 'polygon');
    t3Path.setAttribute('points', [
      `${centerX},${centerY}`,
      `${vertices[3].x * 0.6 + centerX * 0.4},${vertices[3].y * 0.6 + centerY * 0.4}`,
      `${vertices[4].x * 0.2 + centerX * 0.8},${vertices[4].y * 0.2 + centerY * 0.8}`
    ].join(' '));
    t3Path.setAttribute('fill', '#ffccff');
    t3Path.setAttribute('stroke', 'none');
    svg.appendChild(t3Path);
    
    // Label T3
    const t3Label = document.createElementNS(NS, 'text');
    t3Label.setAttribute('x', centerX + (vertices[3].x * 0.5 + vertices[4].x * 0.1 - centerX * 0.6));
    t3Label.setAttribute('y', centerY + (vertices[3].y * 0.5 + vertices[4].y * 0.1 - centerY * 0.6));
    t3Label.setAttribute('text-anchor', 'middle');
    t3Label.setAttribute('font-size', '14');
    t3Label.setAttribute('font-weight', 'bold');
    t3Label.textContent = 'T3';
    svg.appendChild(t3Label);
    
    // Zone D1 (between C2H6 and C2H4)
    const d1Path = document.createElementNS(NS, 'polygon');
    d1Path.setAttribute('points', [
      `${centerX + (vertices[2].x - centerX) * 0.3},${centerY + (vertices[2].y - centerY) * 0.3}`,
      `${centerX + (vertices[2].x - centerX) * 0.7},${centerY + (vertices[2].y - centerY) * 0.7}`,
      `${centerX + (vertices[3].x - centerX) * 0.7},${centerY + (vertices[3].y - centerY) * 0.7}`,
      `${centerX + (vertices[3].x - centerX) * 0.3},${centerY + (vertices[3].y - centerY) * 0.3}`
    ].join(' '));
    d1Path.setAttribute('fill', '#ccffff');
    d1Path.setAttribute('stroke', 'none');
    svg.appendChild(d1Path);
    
    // Label D1
    const d1Label = document.createElementNS(NS, 'text');
    d1Label.setAttribute('x', centerX + (vertices[2].x + vertices[3].x - 2 * centerX) * 0.5);
    d1Label.setAttribute('y', centerY + (vertices[2].y + vertices[3].y - 2 * centerY) * 0.5);
    d1Label.setAttribute('text-anchor', 'middle');
    d1Label.setAttribute('font-size', '14');
    d1Label.setAttribute('font-weight', 'bold');
    d1Label.textContent = 'D1';
    svg.appendChild(d1Label);
    
    // Zone D2 (between C2H4 and C2H2)
    const d2Path = document.createElementNS(NS, 'polygon');
    d2Path.setAttribute('points', [
      `${centerX + (vertices[3].x - centerX) * 0.4},${centerY + (vertices[3].y - centerY) * 0.4}`,
      `${centerX + (vertices[3].x - centerX) * 0.8},${centerY + (vertices[3].y - centerY) * 0.8}`,
      `${centerX + (vertices[4].x - centerX) * 0.8},${centerY + (vertices[4].y - centerY) * 0.8}`,
      `${centerX + (vertices[4].x - centerX) * 0.4},${centerY + (vertices[4].y - centerY) * 0.4}`
    ].join(' '));
    d2Path.setAttribute('fill', '#ffcc99');
    d2Path.setAttribute('stroke', 'none');
    svg.appendChild(d2Path);
    
    // Label D2
    const d2Label = document.createElementNS(NS, 'text');
    d2Label.setAttribute('x', centerX + (vertices[3].x + vertices[4].x - 2 * centerX) * 0.6);
    d2Label.setAttribute('y', centerY + (vertices[3].y + vertices[4].y - 2 * centerY) * 0.6);
    d2Label.setAttribute('text-anchor', 'middle');
    d2Label.setAttribute('font-size', '14');
    d2Label.setAttribute('font-weight', 'bold');
    d2Label.textContent = 'D2';
    svg.appendChild(d2Label);
    
    // Mark the sample point if provided
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        // Convert to percentages
        const p1 = (sample.h2 / total) * 100;
        const p2 = (sample.ch4 / total) * 100;
        const p3 = (sample.c2h6 / total) * 100;
        const p4 = (sample.c2h4 / total) * 100;
        const p5 = (sample.c2h2 / total) * 100;
        
        // Calculate point in pentagon using barycentric coordinates
        // Weighted average of vertices based on percentages
        let pointX = centerX;
        let pointY = centerY;
        
        // Each vertex contributes based on its percentage
        for (let i = 0; i < 5; i++) {
          const percentage = [p1, p2, p3, p4, p5][i];
          pointX += (vertices[i].x - centerX) * (percentage / 100);
          pointY += (vertices[i].y - centerY) * (percentage / 100);
        }
        
        // Draw the point
        const circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', pointX);
        circle.setAttribute('cy', pointY);
        circle.setAttribute('r', 6);
        circle.setAttribute('fill', 'red');
        circle.setAttribute('stroke', 'black');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);
        
        // Add a label with the fault type
        const faultType = this.classify(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
        const faultLabel = document.createElementNS(NS, 'text');
        faultLabel.setAttribute('x', pointX);
        faultLabel.setAttribute('y', pointY - 12);
        faultLabel.setAttribute('text-anchor', 'middle');
        faultLabel.setAttribute('font-size', '14');
        faultLabel.setAttribute('font-weight', 'bold');
        faultLabel.setAttribute('fill', 'red');
        faultLabel.textContent = faultType;
        svg.appendChild(faultLabel);
      }
    }
    
    // Add title
    const title = document.createElementNS(NS, 'text');
    title.setAttribute('x', centerX);
    title.setAttribute('y', 30);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '18');
    title.setAttribute('font-weight', 'bold');
    title.textContent = 'Duval Pentagon 1 - Transformer DGA';
    svg.appendChild(title);
  }
};
