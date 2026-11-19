const DuvalPentagon = {
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const total = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (total === 0) return "PD";
    
    const pH2 = 100 * h2 / total;
    const pCH4 = 100 * ch4 / total;
    const pC2H6 = 100 * c2h6 / total;
    const pC2H4 = 100 * c2h4 / total;
    const pC2H2 = 100 * c2h2 / total;
    
    // Duval Pentagon 1 zones based on triangular coordinates
    // The pentagon is mapped to a triangle with H2-CH4-C2H2 as corners
    // and C2H6, C2H4 on the CH4-C2H2 edge
    
    // Check for PD (partial discharge) - high H2, low hydrocarbons
    if (pH2 > 98 && pCH4 < 2 && pC2H2 < 2) return "PD";
    
    // Calculate position in the hydrocarbon triangle (CH4-C2H6-C2H4-C2H2)
    // Project to CH4-C2H2 baseline for analysis
    
    const hydrocarbonSum = pCH4 + pC2H6 + pC2H4 + pC2H2;
    if (hydrocarbonSum < 2) return "PD";
    
    // Normalize hydrocarbons
    const hCH4 = 100 * pCH4 / hydrocarbonSum;
    const hC2H6 = 100 * pC2H6 / hydrocarbonSum;
    const hC2H4 = 100 * pC2H4 / hydrocarbonSum;
    const hC2H2 = 100 * pC2H2 / hydrocarbonSum;
    
    // T1: Thermal fault low temperature (<300°C) - high CH4, C2H6
    // T2: Thermal fault medium temperature (300-700°C) - high C2H4
    // T3: Thermal fault high temperature (>700°C) - very high C2H4, some C2H2
    
    // D1: Low energy discharge - some C2H2, CH4
    // D2: High energy discharge - high C2H2
    
    // S: Stray gassing of mineral oil
    
    // DT: Mix of thermal and discharge
    
    // Check for S (stray gassing) - specific pattern with H2 and CH4
    if (pH2 > 20 && pH2 < 60 && pCH4 > 30 && pCH4 < 70 && pC2H2 < 5 && pC2H4 < 20) {
      // Additional check for S zone
      const ratio = pCH4 / (pC2H6 + 0.001);
      if (ratio > 3 && ratio < 10) return "S";
    }
    
    // Check thermal zones based on hydrocarbon ratios
    const ethaneRatio = hC2H6 / (hCH4 + hC2H6 + 0.001);
    const ethyleneRatio = hC2H4 / (hydrocarbonSum + 0.001);
    const acetyleneRatio = hC2H2 / (hydrocarbonSum + 0.001);
    
    // T3: High temperature thermal - C2H4 dominant, some C2H2
    if (hC2H4 > 50 && hC2H2 < 15) {
      if (hC2H2 > 3) return "DT";
      return "T3";
    }
    
    // T2: Medium temperature thermal - C2H4 significant, no C2H2
    if (hC2H4 > 30 && hC2H4 <= 60 && hC2H2 < 4) {
      return "T2";
    }
    
    // T1: Low temperature thermal - CH4 and C2H6 dominant
    if (hCH4 > 40 && hC2H6 > 20 && hC2H2 < 2 && hC2H4 < 30) {
      return "T1";
    }
    
    // D2: High energy discharge - high C2H2
    if (hC2H2 > 35) {
      return "D2";
    }
    
    // D1: Low energy discharge - moderate C2H2
    if (hC2H2 > 4 && hC2H2 <= 35) {
      // Check if mixed with thermal
      if (hC2H4 > 20) return "DT";
      return "D1";
    }
    
    // DT: Mixed thermal and discharge
    if (hC2H2 > 2 && hC2H4 > 30) {
      return "DT";
    }
    
    // Default classifications
    if (pH2 > 90) return "PD";
    if (hC2H4 > hCH4 && hC2H4 > hC2H6) {
      if (hC2H2 > 2) return "DT";
      return "T2";
    }
    if (hC2H2 > 2) return "D1";
    
    return "T1";
  },
  
  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const width = 600;
    const height = 600;
    
    // Pentagon geometry - regular pentagon centered
    const centerX = width / 2;
    const centerY = height / 2 + 20;
    const radius = 220;
    
    // Pentagon vertices (starting from top, going clockwise)
    // Order: H2 (top), CH4 (upper right), C2H2 (lower right), C2H4 (lower left), C2H6 (upper left)
    const vertices = [];
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / 5;
      vertices.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      });
    }
    
    const [vH2, vCH4, vC2H2, vC2H4, vC2H6] = vertices;
    
    // Helper to create polygon
    function createPolygon(points, fill, stroke, strokeWidth) {
      const poly = document.createElementNS(ns, "polygon");
      const pts = points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
      poly.setAttribute("points", pts);
      poly.setAttribute("fill", fill);
      poly.setAttribute("stroke", stroke);
      poly.setAttribute("stroke-width", strokeWidth);
      return poly;
    }
    
    // Helper to create text
    function createText(x, y, text, size, fill, anchor = "middle") {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", x);
      t.setAttribute("y", y);
      t.setAttribute("font-size", size);
      t.setAttribute("fill", fill);
      t.setAttribute("text-anchor", anchor);
      t.setAttribute("font-family", "Arial, sans-serif");
      t.textContent = text;
      return t;
    }
    
    // Helper to create line
    function createLine(x1, y1, x2, y2, stroke, width) {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", stroke);
      line.setAttribute("stroke-width", width);
      return line;
    }
    
    // Zone colors
    const colors = {
      PD: "#E6E6FA",  // Light purple
      S:  "#98FB98",  // Pale green
      T1: "#87CEEB",  // Sky blue
      T2: "#4682B4",  // Steel blue
      T3: "#191970",  // Midnight blue
      D1: "#F4A460",  // Sandy brown
      D2: "#FF4500",  // Orange red
      DT: "#DA70D6"   // Orchid
    };
    
    // Draw zone boundaries and fill zones
    // The pentagon is divided into zones based on gas ratios
    
    // Calculate internal points for zone boundaries
    // Center point
    const center = { x: centerX, y: centerY };
    
    // Points along edges for zone divisions
    function edgePoint(v1, v2, t) {
      return {
        x: v1.x + t * (v2.x - v1.x),
        y: v1.y + t * (v2.y - v1.y)
      };
    }
    
    // Key boundary points
    const midH2_CH4 = edgePoint(vH2, vCH4, 0.5);
    const midCH4_C2H2 = edgePoint(vCH4, vC2H2, 0.5);
    const midC2H2_C2H4 = edgePoint(vC2H2, vC2H4, 0.5);
    const midC2H4_C2H6 = edgePoint(vC2H4, vC2H6, 0.5);
    const midC2H6_H2 = edgePoint(vC2H6, vH2, 0.5);
    
    // Internal division points
    const innerRadius = radius * 0.4;
    const innerPoints = [];
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / 5;
      innerPoints.push({
        x: centerX + innerRadius * Math.cos(angle),
        y: centerY + innerRadius * Math.sin(angle)
      });
    }
    
    // PD zone - small region near H2 vertex
    const pdZone = [
      vH2,
      edgePoint(vH2, vCH4, 0.15),
      edgePoint(vH2, vC2H6, 0.15),
      center
    ];
    svg.appendChild(createPolygon(pdZone, colors.PD, "#333", 1));
    
    // S zone - between PD and thermal zones
    const sZone = [
      edgePoint(vH2, vCH4, 0.15),
      edgePoint(vH2, vCH4, 0.4),
      edgePoint(vH2, vC2H6, 0.4),
      edgePoint(vH2, vC2H6, 0.15)
    ];
    svg.appendChild(createPolygon(sZone, colors.S, "#333", 1));
    
    // T1 zone - CH4 rich area
    const t1Zone = [
      vCH4,
      edgePoint(vCH4, vC2H2, 0.3),
      edgePoint(vH2, vCH4, 0.4),
      edgePoint(vH2, vCH4, 0.15)
    ];
    svg.appendChild(createPolygon(t1Zone, colors.T1, "#333", 1));
    
    // T2 zone - middle thermal
    const t2Zone = [
      edgePoint(vH2, vCH4, 0.4),
      edgePoint(vCH4, vC2H2, 0.3),
      edgePoint(vC2H2, vC2H4, 0.3),
      edgePoint(vH2, vC2H4, 0.4),
      edgePoint(vH2, vC2H6, 0.4)
    ];
    // Adjust T2 to be proper shape
    const t2Proper = [
      edgePoint(vH2, vCH4, 0.4),
      edgePoint(vCH4, vC2H2, 0.3),
      { x: centerX + radius * 0.3 * Math.cos(Math.PI/2), y: centerY + radius * 0.3 * Math.sin(Math.PI/2) },
      edgePoint(vC2H2, vC2H4, 0.3),
      edgePoint(vH2, vC2H4, 0.4),
      edgePoint(vH2, vC2H6, 0.4)
    ];
    svg.appendChild(createPolygon(t2Proper, colors.T2, "#333", 1));
    
    // T3 zone - C2H4 rich, high temperature
    const t3Zone = [
      vC2H4,
      edgePoint(vC2H4, vC2H2, 0.4),
      edgePoint(vC2H4, vC2H6, 0.3),
      edgePoint(vH2, vC2H4, 0.4)
    ];
    svg.appendChild(createPolygon(t3Zone, colors.T3, "#333", 1));
    
    // D1 zone - low energy discharge
    const d1Zone = [
      vC2H2,
      edgePoint(vC2H2, vC2H4, 0.4),
      edgePoint(vCH4, vC2H2, 0.3)
    ];
    svg.appendChild(createPolygon(d1Zone, colors.D1, "#333", 1));
    
    // D2 zone - high energy discharge (corner)
    const d2Zone = [
      vC2H2,
      edgePoint(vC2H2, vC2H4, 0.7),
      edgePoint(vCH4, vC2H2, 0.7)
    ];
    // Actually D2 is a sub-zone of D1 corner
    const d2Proper = [
      vC2H2,
      edgePoint(vC2H2, vC2H4, 0.6),
      edgePoint(vCH4, vC2H2, 0.6)
    ];
    svg.appendChild(createPolygon(d2Proper, colors.D2, "#333", 1));
    
    // DT zone - mixed, between D and T
    const dtZone = [
      edgePoint(vC2H2, vC2H4, 0.4),
      edgePoint(vC2H2, vC2H4, 0.6),
      edgePoint(vCH4, vC2H2, 0.6),
      edgePoint(vCH4, vC2H2, 0.3)
    ];
    svg.appendChild(createPolygon(dtZone, colors.DT, "#333", 1));
    
    // Redraw main pentagon outline
    svg.appendChild(createPolygon(vertices, "none", "#000", 2));
    
    // Draw internal grid lines
    // Lines from center to edges
    for (let i = 0; i < 5; i++) {
      svg.appendChild(createLine(centerX, centerY, vertices[i].x, vertices[i].y, "#ccc", 0.5));
    }
    
    // Concentric pentagons
    for (let r = 0.2; r < 1; r += 0.2) {
      const innerVerts = [];
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + i * 2 * Math.PI / 5;
        innerVerts.push({
          x: centerX + r * radius * Math.cos(angle),
          y: centerY + r * radius * Math.sin(angle)
        });
      }
      svg.appendChild(createPolygon(innerVerts, "none", "#ccc", 0.5));
    }
    
    // Labels at vertices
    const labelOffset = 35;
    svg.appendChild(createText(vH2.x, vH2.y - labelOffset, "H₂", "16px", "#000"));
    svg.appendChild(createText(vCH4.x + labelOffset, vCH4.y - 10, "CH₄", "16px", "#000"));
    svg.appendChild(createText(vC2H2.x + labelOffset, vC2H2.y + labelOffset, "C₂H₂", "16px", "#000"));
    svg.appendChild(createText(vC2H4.x - labelOffset, vC2H4.y + labelOffset, "C₂H₄", "16px", "#000"));
    svg.appendChild(createText(vC2H6.x - labelOffset, vC2H6.y - 10, "C₂H₆", "16px", "#000"));
    
    // Zone labels
    svg.appendChild(createText(vH2.x, vH2.y + 40, "PD", "14px", "#333"));
    svg.appendChild(createText(vH2.x + 50, vH2.y + 80, "S", "14px", "#333"));
    svg.appendChild(createText(vCH4.x - 40, vCH4.y + 60, "T1", "14px", "#fff"));
    svg.appendChild(createText(centerX, centerY, "T2", "14px", "#fff"));
    svg.appendChild(createText(vC2H4.x + 30, vC2H4.y - 30, "T3", "14px", "#fff"));
    svg.appendChild(createText(vC2H2.x - 50, vC2H2.y - 40, "D1", "14px", "#333"));
    svg.appendChild(createText(vC2H2.x - 20, vC2H2.y - 70, "D2", "14px", "#fff"));
    svg.appendChild(createText(centerX + 80, centerY + 60, "DT", "14px", "#333"));
    
    // Title
    svg.appendChild(createText(centerX, 30, "Duval Pentagon 1", "18px", "#000"));
    
    // Render sample point if provided
    if (sample) {
      const total = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        // Calculate barycentric coordinates for pentagon
        // Normalize to percentages
        const p = [
          sample.h2 / total,
          sample.ch4 / total,
          sample.c2h6 / total,
          sample.c2h4 / total,
          sample.c2h2 / total
        ];
        
        // Calculate point using generalized barycentric coordinates
        let px = 0, py = 0;
        for (let i = 0; i < 5; i++) {
          px += p[i] * vertices[i].x;
          py += p[i] * vertices[i].y;
        }
        
        // Draw point
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", px);
        circle.setAttribute("cy", py);
        circle.setAttribute("r", 6);
        circle.setAttribute("fill", "red");
        circle.setAttribute("stroke", "black");
        circle.setAttribute("stroke-width", 2);
        svg.appendChild(circle);
        
        // Add classification label
        const zone = this.classify(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
        svg.appendChild(createText(px + 12, py - 8, zone, "12px", "red", "start"));
      }
    }
  }
};
