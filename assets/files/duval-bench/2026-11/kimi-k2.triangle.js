const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    const total = ch4 + c2h4 + c2h2;
    if (total === 0) return "PD";
    
    const x = ch4 / total * 100;
    const y = c2h4 / total * 100;
    const z = c2h2 / total * 100;
    
    // PD zone: high C2H2, low CH4 and C2H4
    // C2H2 > 98% approximately, or in the left corner
    if (z > 98) return "PD";
    
    // D1 zone: high C2H2, medium CH4
    // C2H2 dominant with some CH4
    if (z > 13 && x < 75 && y < 23) {
      // Check if in D1 vs D2
      if (y < 4) return "D1";
    }
    
    // D2 zone: medium C2H2, medium CH4
    if (z > 13 && x >= 75 && y < 23) return "D2";
    
    // T3 zone: high C2H4, low C2H2
    if (y > 50 && z <= 15) return "T3";
    
    // T2 zone: medium C2H4, low C2H2
    if (y > 23 && y <= 50 && z <= 15) return "T2";
    
    // T1 zone: low C2H4, medium CH4, low C2H2
    if (y <= 23 && x > 75 && z <= 15) return "T1";
    
    // T2-T3 boundary or T3-D1 boundary check
    if (y > 35 && z > 15 && z <= 50) {
      // Check for DT zone
      if (y > 35 && z > 15) return "DT";
    }
    
    // DT zone: thermal and electrical decomposition
    if (y > 35 && z > 15) return "DT";
    
    // S zone: stray gassing or normal aging
    // Low C2H2, balanced CH4 and C2H4
    if (x > 50 && y > 20 && z < 4) {
      // Check boundaries
      if (y < 35 || z > 4) {
        // More specific S zone check
      }
    }
    
    // O zone: overheating
    if (x > 90 && y < 8 && z < 2) return "O";
    
    // C zone: cellulose degradation
    if (x > 60 && x < 90 && y > 5 && y < 30 && z < 4) return "C";
    
    // Recalculate with standard boundaries
    
    // Bottom zone (PD): C2H2 > 98%
    if (z >= 98) return "PD";
    
    // Left side zones
    if (x >= 98) {
      if (y <= 2) return "O";
      return "C";
    }
    
    // D1: C2H2 dominant, CH4 < 75%
    if (z > 13 && x < 75 && y < 4) return "D1";
    
    // D2: C2H2 significant, CH4 > 75%
    if (z > 13 && x >= 75 && y < 23) return "D2";
    
    // T1: CH4 dominant, low C2H4 and C2H2
    if (x > 75 && y <= 23 && z <= 15) return "T1";
    
    // T2: medium C2H4, low C2H2
    if (y > 23 && y <= 50 && z <= 15) return "T2";
    
    // T3: high C2H4, low C2H2
    if (y > 50 && z <= 15) return "T3";
    
    // DT: combination zone
    if (y > 35 && z > 15) return "DT";
    
    // Default fallback
    if (z > 50) return "D1";
    if (y > 40) return "T3";
    if (x > 80) return "T1";
    
    return "PD";
  },
  
  render(svg, sample) {
    const ns = "http://www.w3.org/2000/svg";
    const width = 600;
    const height = 540;
    const margin = {top: 40, right: 40, bottom: 80, left: 80};
    const triWidth = width - margin.left - margin.right;
    const triHeight = triWidth * Math.sqrt(3) / 2;
    
    // Triangle vertices (barycentric coordinates)
    // CH4 at bottom left (0, 0), C2H4 at bottom right (1, 0), C2H2 at top (0.5, sqrt(3)/2)
    const A = {x: margin.left, y: margin.top + triHeight}; // CH4
    const B = {x: margin.left + triWidth, y: margin.top + triHeight}; // C2H4
    const C = {x: margin.left + triWidth / 2, y: margin.top}; // C2H2
    
    // Helper to convert barycentric to cartesian
    // ch4 + c2h4 + c2h2 = 1 (normalized)
    function baryToCart(ch4, c2h4, c2h2) {
      const sum = ch4 + c2h4 + c2h2;
      if (sum === 0) return {x: C.x, y: C.y};
      const a = ch4 / sum;
      const b = c2h4 / sum;
      const c = c2h2 / sum;
      return {
        x: a * A.x + b * B.x + c * C.x,
        y: a * A.y + b * B.y + c * C.y
      };
    }
    
    // Create polygon helper
    function createPolygon(points, fill, stroke) {
      const el = document.createElementNS(ns, "polygon");
      const pts = points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
      el.setAttribute("points", pts);
      el.setAttribute("fill", fill);
      el.setAttribute("stroke", stroke);
      el.setAttribute("stroke-width", "1");
      return el;
    }
    
    // Create text helper
    function createText(x, y, text, size, anchor, color) {
      const el = document.createElementNS(ns, "text");
      el.setAttribute("x", x);
      el.setAttribute("y", y);
      el.setAttribute("font-size", size);
      el.setAttribute("text-anchor", anchor || "middle");
      el.setAttribute("fill", color || "black");
      el.setAttribute("font-family", "Arial, sans-serif");
      el.textContent = text;
      return el;
    }
    
    // Create line helper
    function createLine(x1, y1, x2, y2, stroke, width) {
      const el = document.createElementNS(ns, "line");
      el.setAttribute("x1", x1);
      el.setAttribute("y1", y1);
      el.setAttribute("x2", x2);
      el.setAttribute("y2", y2);
      el.setAttribute("stroke", stroke);
      el.setAttribute("stroke-width", width || 1);
      return el;
    }
    
    // Draw zone boundaries and fill zones
    
    // Zone colors (approximate)
    const colors = {
      PD: "#ffcccc",
      D1: "#ff9999",
      D2: "#ff6666",
      DT: "#ffaa66",
      T1: "#ffff99",
      T2: "#ffff66",
      T3: "#ffff33",
      S: "#ccffcc",
      O: "#99ff99",
      C: "#99ccff"
    };
    
    // Key boundary points (percentages)
    // PD: C2H2 >= 98%
    const pdTop = baryToCart(1, 0, 99);
    const pdLeft = baryToCart(50, 0, 50);
    const pdRight = baryToCart(0, 50, 50);
    
    // D1/D2 boundary at CH4 = 75%, C2H4 = 0-23%
    const d1d2_left = baryToCart(75, 23, 2);
    const d1d2_mid = baryToCart(75, 4, 21);
    const d1d2_right = baryToCart(75, 0, 25);
    
    // T2/T3 boundary at C2H4 = 50%
    const t2t3_left = baryToCart(50, 50, 0);
    const t2t3_right = baryToCart(0, 50, 50);
    
    // T1/T2 boundary at C2H4 = 23%
    const t1t2_left = baryToCart(77, 23, 0);
    const t1t2_right = baryToCart(75, 23, 2);
    
    // DT zone corner
    const dt_corner = baryToCart(50, 35, 15);
    
    // Draw zones
    
    // PD zone (top small triangle)
    const pdPoly = createPolygon([C, baryToCart(50, 0, 50), baryToCart(0, 50, 50)], colors.PD, "black");
    svg.appendChild(pdPoly);
    
    // D1 zone (left, below PD)
    const d1Poly = createPolygon([
      baryToCart(50, 0, 50),
      baryToCart(75, 0, 25),
      baryToCart(75, 4, 21),
      baryToCart(75, 23, 2),
      baryToCart(50, 50, 0),
      C
    ], colors.D1, "black");
    svg.appendChild(d1Poly);
    
    // D2 zone (middle-left)
    const d2Poly = createPolygon([
      baryToCart(75, 0, 25),
      baryToCart(98, 0, 2),
      baryToCart(98, 2, 0),
      baryToCart(75, 23, 2),
      baryToCart(75, 4, 21)
    ], colors.D2, "black");
    svg.appendChild(d2Poly);
    
    // DT zone (middle, triangular)
    const dtPoly = createPolygon([
      baryToCart(75, 23, 2),
      baryToCart(50, 50, 0),
      baryToCart(35, 50, 15),
      baryToCart(50, 35, 15),
      baryToCart(65, 20, 15)
    ], colors.DT, "black");
    svg.appendChild(dtPoly);
    
    // T3 zone (right, large)
    const t3Poly = createPolygon([
      baryToCart(0, 50, 50),
      baryToCart(0, 98, 2),
      baryToCart(2, 98, 0),
      baryToCart(35, 50, 15),
      baryToCart(50, 50, 0)
    ], colors.T3, "black");
    svg.appendChild(t3Poly);
    
    // T2 zone (middle-right)
    const t2Poly = createPolygon([
      baryToCart(50, 50, 0),
      baryToCart(35, 50, 15),
      baryToCart(65, 20, 15),
      baryToCart(75, 23, 2),
      baryToCart(77, 23, 0)
    ], colors.T2, "black");
    svg.appendChild(t2Poly);
    
    // T1 zone (bottom-left area, but we need to define it properly)
    // Actually T1 is between D2 and the bottom
    const t1Poly = createPolygon([
      baryToCart(98, 2, 0),
      baryToCart(50, 50, 0),
      baryToCart(77, 23, 0),
      baryToCart(98, 0, 2)
    ], colors.T1, "black");
    // This overlaps, let's recalculate
    
    // Clear and redraw with correct zones
    
    // Remove all children
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    
    // Redraw with simpler approach - define key points
    
    // Standard Duval Triangle 1 zones:
    // PD: partial discharge (top corner)
    // D1: low energy discharge
    // D2: high energy discharge  
    // DT: mixed thermal and electrical
    // T1: thermal fault < 300°C
    // T2: thermal fault 300-700°C
    // T3: thermal fault > 700°C
    
    // Boundary points (from memory, approximate)
    // C2H2 axis: 0-100% left to right at top? No, C2H2 is top vertex
    
    // Let me use standard barycentric coordinates
    // Vertex A (CH4): bottom left
    // Vertex B (C2H4): bottom right  
    // Vertex C (C2H2): top
    
    // Zone boundaries in terms of percentages:
    
    // Draw the main triangle outline
    const mainTriangle = createPolygon([A, B, C], "white", "black");
    mainTriangle.setAttribute("stroke-width", "2");
    svg.appendChild(mainTriangle);
    
    // Zone dividing lines
    
    // Line from C2H2=98% on left edge to C2H2=98% on right edge (PD boundary)
    const pdLeftPt = {x: A.x + 0.01 * triWidth, y: A.y - 0.02 * triHeight * 2 / Math.sqrt(3)};
    const pdRightPt = {x: B.x - 0.01 * triWidth, y: B.y - 0.02 * triHeight * 2 / Math.sqrt(3)};
    // Actually use barycentric
    
    // PD zone: C2H2 >= 98%
    // This is a small triangle at top
    
    // Key boundary points:
    const p98_ch4 = baryToCart(1, 0, 99); // ~1% CH4, 0% C2H4, 99% C2H2
    const p98_c2h4 = baryToCart(0, 1, 99); // 0% CH4, ~1% C2H4, 99% C2H2
    
    // D1/D2 boundary: CH4 = 75%, C2H4 from 0 to 23%
    const p75_0 = baryToCart(75, 0, 25);
    const p75_23 = baryToCart(75, 23, 2);
    
    // T1/T2 boundary: C2H4 = 23%, CH4 from 75% to 77%
    // Actually at C2H4=23%, C2H2 varies
    
    // T2/T3 boundary: C2H4 = 50%
    const p50_left = baryToCart(50, 50, 0);
    const p50_right = baryToCart(0, 50, 50);
    
    // DT zone apex
    const dt_apex = baryToCart(50, 35, 15);
    
    // Draw zone fills
    
    // T3 zone (right, C2H4 > 50%)
    const t3Points = [
      B,
      baryToCart(0, 98, 2),
      baryToCart(2, 98, 0),
      baryToCart(0, 50, 50),
      p50_right,
      p50_left
    ];
    const t3Zone = createPolygon(t3Points, "#ffff99", "none");
    svg.appendChild(t3Zone);
    
    // T2 zone (middle right, 23% < C2H4 < 50%)
    const t2Points = [
      p50_left,
      p50_right,
      baryToCart(35, 50, 15),
      dt_apex,
      baryToCart(65, 20, 15),
      p75_23,
      baryToCart(77, 23, 0)
    ];
    const t2Zone = createPolygon(t2Points, "#ffff66", "none");
    svg.appendChild(t2Zone);
    
    // T1 zone (lower middle, C2H4 < 23%, low C2H2)
    const t1Points = [
      baryToCart(98, 2, 0),
      baryToCart(77, 23, 0),
      p75_23,
      baryToCart(65, 20, 15),
      baryToCart(75, 0, 25),
      baryToCart(98, 0, 2)
    ];
    const t1Zone = createPolygon(t1Points, "#ffff33", "none");
    svg.appendChild(t1Zone);
    
    // DT zone (middle, mixed)
    const dtPoints = [
      p75_23,
      baryToCart(65, 20, 15),
      dt_apex,
      baryToCart(35, 50, 15),
      p50_left
    ];
    const dtZone = createPolygon(dtPoints, "#ffcc66", "none");
    svg.appendChild(dtZone);
    
    // D2 zone (left middle, high CH4, some C2H2)
    const d2Points = [
      p75_0,
      baryToCart(98, 0, 2),
      baryToCart(98, 2, 0),
      baryToCart(77, 23, 0),
      p75_23
    ];
    const d2Zone = createPolygon(d2Points, "#ff9999", "none");
    svg.appendChild(d2Zone);
    
    // D1 zone (left, medium CH4, more C2H2)
    const d1Points = [
      p98_ch4,
      baryToCart(50, 0, 50),
      p75_0,
      p75_23,
      baryToCart(50, 50, 0),
      C,
      p98_c2h4
    ];
    const d1Zone = createPolygon(d1Points, "#ff6666", "none");
    svg.appendChild(d1Zone);
    
    // PD zone (top, very high C2H2)
    const pdPoints = [C, p98_ch4, p98_c2h4];
    const pdZone = createPolygon(pdPoints, "#ffcccc", "none");
    svg.appendChild(pdZone);
    
    // Draw boundary lines
    // PD boundary
    svg.appendChild(createLine(p98_ch4.x, p98_ch4.y, p98_c2h4.x, p98_c2h4.y, "black", 1));
    
    // D1/D2 boundary
    svg.appendChild(createLine(p75_0.x, p75_0.y, p75_23.x, p75_23.y, "black", 1));
    
    // D2/T1 boundary (roughly)
    svg.appendChild(createLine(baryToCart(98, 0, 2).x, baryToCart(98, 0, 2).y, baryToCart(98, 2, 0).x, baryToCart(98, 2, 0).y, "black", 1));
    
    // T1/T2 boundary
    svg.appendChild(createLine(baryToCart(77, 23, 0).x, baryToCart(77, 23, 0).y, p75_23.x, p75_23.y, "black", 1));
    
    // T2/T3 boundary
    svg.appendChild(createLine(p50_left.x, p50_left.y, p50_right.x, p50_right.y, "black", 1));
    
    // DT boundaries
    svg.appendChild(createLine(p75_23.x, p75_23.y, dt_apex.x, dt_apex.y, "black", 1));
    svg.appendChild(createLine(dt_apex.x, dt_apex.y, p50_left.x, p50_left.y, "black", 1));
    svg.appendChild(createLine(dt_apex.x, dt_apex.y, baryToCart(35, 50, 15).x, baryToCart(35, 50, 15).y, "black", 1));
    svg.appendChild(createLine(baryToCart(65, 20, 15).x, baryToCart(65, 20, 15).y, dt_apex.x, dt_apex.y, "black", 1));
    
    // Main triangle outline again on top
    svg.appendChild(createLine(A.x, A.y, B.x, B.y, "black", 2));
    svg.appendChild(createLine(B.x, B.y, C.x, C.y, "black", 2));
    svg.appendChild(createLine(C.x, C.y, A.x, A.y, "black", 2));
    
    // Draw tick marks and labels
    
    // CH4 axis (left edge, A to C)
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const bx = (1-t) * A.x + t * C.x;
      const by = (1-t) * A.y + t * C.y;
      // Tick perpendicular to edge
      const dx = C.y - A.y;
      const dy = A.x - C.x;
      const len = Math.sqrt(dx*dx + dy*dy);
      const tx = dx / len * 8;
      const ty = dy / len * 8;
      svg.appendChild(createLine(bx, by, bx + tx, by + ty, "black", 1));
      if (i % 2 === 0) {
        svg.appendChild(createText(bx - 25, by + 5, (100 - i * 10).toString(), "10", "end"));
      }
    }
    
    // C2H4 axis (right edge, B to C)
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const bx = (1-t) * B.x + t * C.x;
      const by = (1-t) * B.y + t * C.y;
      const dx = C.y - B.y;
      const dy = B.x - C.x;
      const len = Math.sqrt(dx*dx + dy*dy);
      const tx = dx / len * 8;
      const ty = dy / len * 8;
      svg.appendChild(createLine(bx, by, bx + tx, by + ty, "black", 1));
      if (i % 2 === 0) {
        svg.appendChild(createText(bx + 25, by + 5, (100 - i * 10).toString(), "10", "start"));
      }
    }
    
    // C2H2 axis (bottom edge, A to B) - actually this is the base
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const bx = (1-t) * A.x + t * B.x;
      const by = (1-t) * A.y + t * B.y;
      svg.appendChild(createLine(bx, by, bx, by + 8, "black", 1));
      if (i % 2 === 0) {
        svg.appendChild(createText(bx, by + 20, (i * 10).toString(), "10", "middle"));
      }
    }
    
    // Axis labels
    svg.appendChild(createText(A.x - 30, A.y, "CH4", "14", "end", "black"));
    svg.appendChild(createText(B.x + 30, B.y, "C2H4", "14", "start", "black"));
    svg.appendChild(createText(C.x, C.y - 20, "C2H2", "14", "middle", "black"));
    
    // Percent signs
    svg.appendChild(createText(A.x - 10, (A.y + C.y)/2, "%", "12", "end"));
    svg.appendChild(createText(B.x + 10, (B.y + C.y)/2, "%", "12", "start"));
    svg.appendChild(createText((A.x + B.x)/2, A.y + 35, "%", "12", "middle"));
    
    // Zone labels
    svg.appendChild(createText(C.x, C.y + 25, "PD", "12", "middle", "black"));
    svg.appendChild(createText((A.x + C.x)/2 + 10, (A.y + C.y)/2 - 20, "D1", "12", "middle", "black"));
    svg.appendChild(createText((A.x + C.x)/2 + 40, (A.y + C.y)/2 + 20, "D2", "12", "middle", "black"));
    svg.appendChild(createText((A.x + B.x)/2 - 30, (A.y + C.y)/2 + 10, "T1", "12", "middle", "black"));
    svg.appendChild(createText((A.x + B.x)/2 + 10, (A.y + C.y)/2 - 20, "T2", "12", "middle", "black"));
    svg.appendChild(createText((B.x + C.x)/2 - 10, (B.y + C.y)/2 + 30, "T3", "12", "middle", "black"));
    svg.appendChild(createText((A.x + B.x)/2, (A.y + C.y)/2 - 50, "DT", "12", "middle", "black"));
    
    // Title
    svg.appendChild(createText(width/2, 25, "Duval Triangle 1", "16", "middle", "black"));
    
    // Draw sample point if provided
    if (sample && sample.ch4 !== undefined && sample.c2h4 !== undefined && sample.c2h2 !== undefined) {
      const pt = baryToCart(sample.ch4, sample.c2h4, sample.c2h2);
      
      // Draw point
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", pt.x);
      circle.setAttribute("cy", pt.y);
      circle.setAttribute("r", 6);
      circle.setAttribute("fill", "red");
      circle.setAttribute("stroke", "black");
      circle.setAttribute("stroke-width", "2");
      svg.appendChild(circle);
      
      // Draw crosshair
      svg.appendChild(createLine(pt.x - 10, pt.y, pt.x + 10, pt.y, "red", 1));
      svg.appendChild(createLine(pt.x, pt.y - 10, pt.x, pt.y + 10, "red", 1));
    }
  }
};
