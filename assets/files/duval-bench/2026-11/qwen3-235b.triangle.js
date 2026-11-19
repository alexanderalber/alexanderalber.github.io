const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total === 0) return 'ND'; // No Dissolved gas
    
    const pCh4 = (ch4 / total) * 100;
    const pC2h4 = (c2h4 / total) * 100;
    const pC2h2 = (c2h2 / total) * 100;
    
    // Duval Triangle 1 zone boundaries (in percent)
    // Based on memory of the standard triangle with CH4 at top, C2H2 at bottom left, C2H4 at bottom right
    
    // Check PD (Partial Discharge) zone - near C2H2 corner
    if (pC2h2 > 65) return 'PD';
    
    // Check D1 (Slow Discharge) zone
    if (pC2h2 > 18 && pC2h2 <= 65 && pCh4 < 35 && pC2h4 < 45) return 'D1';
    
    // Check D2 (High Energy Discharge) zone
    if (pC2h2 > 45 && pCh4 < 25) return 'D2';
    
    // Check T1/T2/T3 (Thermal) zones - low temp < 300C, medium 300-700C, high >700C
    // These are primarily in CH4 and C2H4 rich areas
    if (pCh4 > 40 && pC2h2 < 10) return 'T1';
    if (pC2h4 > 40 && pC2h2 < 10 && pCh4 < 40) return 'T2';
    if (pC2h4 > 40 && pC2h2 >= 10 && pC2h2 < 45) return 'T3';
    
    // Check T2/T3 boundary zone
    if (pC2h4 > 55 && pC2h2 >= 10 && pC2h2 <= 18) return 'T3';
    
    // Mixed or boundary zones
    if (pC2h2 >= 10 && pC2h2 <= 18 && pCh4 >= 35 && pC2h4 <= 45) return 'D1';
    
    // If not clearly in other zones and C2H4 dominant, likely T2 or T3
    if (pC2h4 > 50 && pC2h2 < 10) return 'T2';
    
    // Final fallbacks based on dominant gas
    if (pC2h4 >= 50) return 'T2';
    if (pCh4 >= 50) return 'T1';
    if (pC2h2 >= 18 && pC2h2 <= 45) return 'D1';
    if (pC2h2 > 45) return 'D2';
    
    // Default for ambiguous cases
    return 'T2';
  },
  
  render(svg, sample) {
    // Clear the SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    
    const NS = "http://www.w3.org/2000/svg";
    
    // Define triangle dimensions
    const width = 600;
    const height = 540;
    const margin = 40;
    const triangleSize = Math.min(width - 2 * margin, height - 2 * margin);
    
    // Calculate coordinates for equilateral triangle
    const centerX = width / 2;
    const topY = margin;
    const bottomY = margin + triangleSize;
    const baseHalfWidth = triangleSize * Math.sqrt(3) / 2 / 2;
    
    const A = { x: centerX, y: topY };           // CH4 top
    const B = { x: centerX - baseHalfWidth, y: bottomY };  // C2H2 bottom left
    const C = { x: centerX + baseHalfWidth, y: bottomY };  // C2H4 bottom right
    
    // Create path for the main triangle
    const trianglePath = document.createElementNS(NS, "path");
    trianglePath.setAttribute("d", `M ${A.x} ${A.y} L ${B.x} ${B.y} L ${C.x} ${C.y} Z`);
    trianglePath.setAttribute("fill", "none");
    trianglePath.setAttribute("stroke", "black");
    trianglePath.setAttribute("stroke-width", "2");
    svg.appendChild(trianglePath);
    
    // Zone boundaries (simplified approximation based on memory)
    // T1 zone - near CH4 (A)
    const t1Polygon = document.createElementNS(NS, "polygon");
    t1Polygon.setAttribute("points", 
      `${A.x},${A.y} ` +
      `${centerX - 30},${topY + 80} ` +
      `${centerX + 30},${topY + 80}`);
    t1Polygon.setAttribute("fill", "#d0f0d0");
    t1Polygon.setAttribute("stroke", "black");
    t1Polygon.setAttribute("stroke-width", "1");
    svg.appendChild(t1Polygon);
    
    // T2 zone - right side, near C2H4
    const t2Polygon = document.createElementNS(NS, "polygon");
    t2Polygon.setAttribute("points", 
      `${centerX + 30},${topY + 80} ` +
      `${C.x},${C.y} ` +
      `${centerX + baseHalfWidth * 0.7},${bottomY - 40} ` +
      `${centerX},${bottomY - 80}`);
    t2Polygon.setAttribute("fill", "#f0d0d0");
    t2Polygon.setAttribute("stroke", "black");
    t2Polygon.setAttribute("stroke-width", "1");
    svg.appendChild(t2Polygon);
    
    // T3 zone - upper right, between T1 and T2
    const t3Polygon = document.createElementNS(NS, "polygon");
    t3Polygon.setAttribute("points", 
      `${centerX - 30},${topY + 80} ` +
      `${centerX + 30},${topY + 80} ` +
      `${centerX},${bottomY - 80} ` +
      `${centerX - baseHalfWidth * 0.3},${bottomY - 40}`);
    t3Polygon.setAttribute("fill", "#f0f0d0");
    t3Polygon.setAttribute("stroke", "black");
    t3Polygon.setAttribute("stroke-width", "1");
    svg.appendChild(t3Polygon);
    
    // D1 zone - left side, near C2H2
    const d1Polygon = document.createElementNS(NS, "polygon");
    d1Polygon.setAttribute("points", 
      `${B.x},${B.y} ` +
      `${centerX - baseHalfWidth * 0.7},${bottomY - 40} ` +
      `${centerX - baseHalfWidth * 0.3},${bottomY - 40} ` +
      `${centerX},${bottomY - 80}`);
    d1Polygon.setAttribute("fill", "#d0d0f0");
    d1Polygon.setAttribute("stroke", "black");
    d1Polygon.setAttribute("stroke-width", "1");
    svg.appendChild(d1Polygon);
    
    // D2 zone - small region near C2H2
    const d2Polygon = document.createElementNS(NS, "polygon");
    d2Polygon.setAttribute("points", 
      `${B.x},${B.y} ` +
      `${B.x + 30},${B.y - 30} ` +
      `${B.x + 60},${B.y}`);
    d2Polygon.setAttribute("fill", "#f0d0f0");
    d2Polygon.setAttribute("stroke", "black");
    d2Polygon.setAttribute("stroke-width", "1");
    svg.appendChild(d2Polygon);
    
    // PD zone - very near C2H2 corner
    const pdPolygon = document.createElementNS(NS, "polygon");
    pdPolygon.setAttribute("points", 
      `${B.x},${B.y} ` +
      `${B.x + 15},${B.y - 15} ` +
      `${B.x + 30},${B.y}`);
    pdPolygon.setAttribute("fill", "#ffffff");
    pdPolygon.setAttribute("stroke", "black");
    pdPolygon.setAttribute("stroke-width", "1");
    svg.appendChild(pdPolygon);
    
    // Add zone labels
    const addLabel = (text, x, y) => {
      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", x);
      label.setAttribute("y", y);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "14");
      label.setAttribute("font-family", "Arial");
      label.textContent = text;
      svg.appendChild(label);
    };
    
    addLabel("T1", centerX, topY + 40);
    addLabel("T2", centerX + baseHalfWidth * 0.6, bottomY - 60);
    addLabel("T3", centerX, bottomY - 100);
    addLabel("D1", centerX - baseHalfWidth * 0.5, bottomY - 60);
    addLabel("D2", B.x + 40, B.y - 20);
    addLabel("PD", B.x + 30, B.y - 35);
    
    // Add gas labels at vertices
    const gasLabel = document.createElementNS(NS, "text");
    gasLabel.setAttribute("x", A.x);
    gasLabel.setAttribute("y", A.y - 10);
    gasLabel.setAttribute("text-anchor", "middle");
    gasLabel.setAttribute("font-size", "16");
    gasLabel.setAttribute("font-weight", "bold");
    gasLabel.textContent = "CH₄";
    svg.appendChild(gasLabel);
    
    const gasLabel2 = document.createElementNS(NS, "text");
    gasLabel2.setAttribute("x", B.x - 10);
    gasLabel2.setAttribute("y", B.y + 20);
    gasLabel2.setAttribute("text-anchor", "end");
    gasLabel2.setAttribute("font-size", "16");
    gasLabel2.setAttribute("font-weight", "bold");
    gasLabel2.textContent = "C₂H₂";
    svg.appendChild(gasLabel2);
    
    const gasLabel3 = document.createElementNS(NS, "text");
    gasLabel3.setAttribute("x", C.x + 10);
    gasLabel3.setAttribute("y", C.y + 20);
    gasLabel3.setAttribute("text-anchor", "start");
    gasLabel3.setAttribute("font-size", "16");
    gasLabel3.setAttribute("font-weight", "bold");
    gasLabel3.textContent = "C₂H₄";
    svg.appendChild(gasLabel3);
    
    // Add percentage scale along the edges (tick marks)
    const addTicks = (start, end, label, isHorizontal) => {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const x = start.x * (1 - t) + end.x * t;
        const y = start.y * (1 - t) + end.y * t;
        
        // Perpendicular tick
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const perpAngle = angle + Math.PI / 2;
        const tickLength = 6;
        
        const x1 = x + Math.cos(perpAngle) * tickLength;
        const y1 = y + Math.sin(perpAngle) * tickLength;
        const x2 = x - Math.cos(perpAngle) * tickLength;
        const y2 = y - Math.sin(perpAngle) * tickLength;
        
        const tick = document.createElementNS(NS, "line");
        tick.setAttribute("x1", x1);
        tick.setAttribute("y1", y1);
        tick.setAttribute("x2", x2);
        tick.setAttribute("y2", y2);
        tick.setAttribute("stroke", "black");
        svg.appendChild(tick);
        
        // Add percentage label
        if (i % 2 === 0) {
          const labelEl = document.createElementNS(NS, "text");
          labelEl.setAttribute("x", x - Math.cos(perpAngle) * 15);
          labelEl.setAttribute("y", y - Math.sin(perpAngle) * 15);
          labelEl.setAttribute("text-anchor", "middle");
          labelEl.setAttribute("font-size", "12");
          labelEl.textContent = `${i * 10}%`;
          svg.appendChild(labelEl);
        }
      }
    };
    
    // Add ticks on all three sides
    addTicks(B, C, "C₂H₄ %", true);  // Bottom edge
    addTicks(A, B, "C₂H₂ %", false); // Left edge
    addTicks(A, C, "CH₄ %", false);  // Right edge
    
    // Mark the sample point if provided
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const pCh4 = (sample.ch4 / total) * 100;
        const pC2h4 = (sample.c2h4 / total) * 100;
        const pC2h2 = (sample.c2h2 / total) * 100;
        
        // Convert percentages to coordinates in the triangle
        // Barycentric coordinates
        const x = A.x * (pCh4 / 100) + B.x * (pC2h2 / 100) + C.x * (pC2h4 / 100);
        const y = A.y * (pCh4 / 100) + B.y * (pC2h2 / 100) + C.y * (pC2h4 / 100);
        
        // Draw the point
        const point = document.createElementNS(NS, "circle");
        point.setAttribute("cx", x);
        point.setAttribute("cy", y);
        point.setAttribute("r", 5);
        point.setAttribute("fill", "red");
        point.setAttribute("stroke", "black");
        point.setAttribute("stroke-width", "2");
        svg.appendChild(point);
      }
    }
  }
};
