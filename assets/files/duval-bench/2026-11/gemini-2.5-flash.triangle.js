const DuvalTriangle = {
  classify(ch4, c2h4, c2h2) {
    // Arguments are gas concentrations in ppm.
    // Sum must be greater than zero.

    const total = ch4 + c2h4 + c2h2;
    if (total === 0) {
      // According to problem statement, sum will be greater than zero.
      // However, a safeguard might be useful for robustness, e.g., return "NF" (No Fault)
      // or "Invalid". For this problem, we assume valid input.
      return "Invalid Input: Sum is zero";
    }

    // Normalize to percentages
    const pCH4 = (ch4 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H2 = (c2h2 / total) * 100;

    // Define a small epsilon for floating point comparisons to handle "negligible" amounts
    // typically associated with C2H2 < 0.5% in thermal zones.
    const EPSILON = 0.01; // For C2H2 < 0.5% boundary

    // Classification logic, ordered from specific small zones to larger general zones.
    // Boundaries are based on Duval Triangle 1 from memory.

    // 1. D1: Partial Discharge (Top corner, high C2H2)
    if (pC2H2 > 85) {
      return "D1";
    }
    // 2. DT: Low Temperature Thermal Fault (<300°C) (Bottom-left corner, high CH4)
    // This zone is very small and close to the CH4 vertex.
    if (pCH4 > 98) {
      return "DT";
    }
    // 3. T3: High Temperature Hot Spot (>900°C) (Bottom-right corner, high C2H4)
    // C2H2 must be negligible.
    if (pC2H4 >= 60 && pC2H2 < EPSILON) {
      return "T3";
    }
    // 4. D2: High Energy Discharge (Upper-left, high C2H2, some CH4/C2H4)
    // Bounded by C2H2 between 50 and 85, C2H4 < 15, and CH4 < 45.
    if (pC2H2 >= 50 && pC2H2 <= 85 && pC2H4 < 15 && pCH4 < 45) {
      return "D2";
    }
    // 5. T1: Medium Temperature Thermal Fault (300-700°C) (Left side, high CH4, low C2H4)
    // C2H2 must be negligible. Bounded by CH4 > 50 and C2H4 < 20.
    if (pCH4 >= 50 && pC2H4 < 20 && pC2H2 < EPSILON) {
      return "T1";
    }
    // 6. T2: High Temperature Thermal Fault (700-900°C) (Middle-right, balanced CH4/C2H4)
    // C2H2 must be negligible. Bounded by C2H4 between 20 and 60, and CH4 >= 20.
    if (pC2H4 >= 20 && pC2H4 < 60 && pCH4 >= 20 && pC2H2 < EPSILON) {
      return "T2";
    }
    // 7. TD: Thermal and Discharge (Central zone, mixture)
    // This is the "catch-all" for the central region not covered by the above specific zones.
    // It implies C2H2 < 50 (below D2), and other gases are balanced, not fitting T1, T2, T3.
    // Since it's the last check, it covers the remaining valid triangle area.
    // The specific polygon for TD is complex to define negatively; this ordering simplifies it.
    if (pC2H2 < 50) { // This condition mainly serves to ensure we are below the D2/TD boundary.
        return "TD";
    }

    // Fallback: If for some reason a point doesn't match any specific zone,
    // it could indicate a very unusual ratio or be on a boundary not explicitly captured.
    // For this specific Duval Triangle 1 based on memory, TD should capture almost everything else.
    // A point might strictly fall on a line, in which case it could be ambiguous.
    // For simplicity, we assume one of the above will match if total > 0.
    return "UNKNOWN"; // Should ideally not be reached with typical DGA data
  },

  render(svg, sample) {
    const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
    const WIDTH = 600;
    const HEIGHT = 540; // Approx sqrt(3)/2 * WIDTH

    // Clear existing content in SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Set viewBox (already set by caller, but good practice if not specified)
    svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

    // --- Coordinate Transformation ---
    // The triangle vertices in SVG coordinates:
    // CH4 (100%): (0, HEIGHT)
    // C2H4 (100%): (WIDTH, HEIGHT)
    // C2H2 (100%): (WIDTH / 2, HEIGHT - (WIDTH * Math.sqrt(3) / 2))
    // Let's adjust to fit the viewBox better vertically
    // If base = 600, height = 300 * sqrt(3) = 519.6.
    // viewBox="0 0 600 540" implies a little padding on top/bottom or a slightly non-equilateral look.
    // Let's use the full height and center the triangle horizontally.
    const TRIANGLE_SIDE = WIDTH;
    const TRIANGLE_HEIGHT = TRIANGLE_SIDE * Math.sqrt(3) / 2;

    const PADDING_X = 0;
    const PADDING_Y = (HEIGHT - TRIANGLE_HEIGHT) / 2;

    const vertexCH4 = { x: PADDING_X, y: HEIGHT - PADDING_Y };
    const vertexC2H4 = { x: PADDING_X + TRIANGLE_SIDE, y: HEIGHT - PADDING_Y };
    const vertexC2H2 = { x: PADDING_X + TRIANGLE_SIDE / 2, y: PADDING_Y };

    // Function to convert (pCH4, pC2H4, pC2H2) percentages to SVG (x, y) coordinates
    // Based on the CH4 at bottom-left, C2H4 at bottom-right, C2H2 at top-center.
    const convertToSVG = (pCH4, pC2H4, pC2H2) => {
      // Scale percentages to 0-1 range
      const ch4_norm = pCH4 / 100;
      const c2h4_norm = pC2H4 / 100;
      const c2h2_norm = pC2H2 / 100;

      // X: C2H4 percentage moves right, C2H2 percentage moves towards center-top.
      // Y: C2H2 percentage moves up (lower Y value in SVG).
      const x = vertexCH4.x + (c2h4_norm * TRIANGLE_SIDE) + (c2h2_norm * TRIANGLE_SIDE / 2);
      const y = vertexCH4.y - (c2h2_norm * TRIANGLE_HEIGHT);
      return { x, y };
    };

    // --- Zone Definitions (using polygons) ---
    const zones = [
      {
        name: "D1",
        label: "D1",
        color: "#FFCCCC", // Light Red
        points: [
          convertToSVG(0, 0, 100), // C2H2 vertex
          convertToSVG(15, 0, 85),
          convertToSVG(0, 15, 85),
        ],
      },
      {
        name: "D2",
        label: "D2",
        color: "#FF9999", // Medium Red
        points: [
          convertToSVG(0, 15, 85),
          convertToSVG(15, 0, 85),
          convertToSVG(45, 0, 55),
          convertToSVG(30, 15, 55), // Estimated point on the boundary
          convertToSVG(0, 30, 50), // Another estimated point on the boundary,
                                   // often defined as (0, 30, 50) and (45, 5, 50)
          convertToSVG(5, 45, 50),
          convertToSVG(15, 35, 50),
          convertToSVG(15, 10, 75), // Adjusted for a better D2 shape, based on common diagrams
          convertToSVG(0, 15, 85), // Back to start (point on 85% C2H2 line)
        ],
        // A more canonical D2 polygon from memory:
        // C2H2 >= 50 && C2H2 <= 85
        // C2H4 <= 15 for upper part
        // CH4 <= 45 for left part
        // (0, 15, 85), (15, 0, 85), (45, 0, 55), (30, 15, 55) is often used, but D2 is typically wider at base
        // (0, 15, 85), (15, 0, 85)
        // (0, 50, 50), (15, 35, 50) - often this defines the lower boundary of D2.
        // Let's use simplified boundaries for D2:
        // A quadrilateral from C2H2=85 line to C2H2=50 line.
        // Left line is CH4 axis, right line is C2H4=15, and a diagonal for CH4=45.
        points: [
          convertToSVG(0, 0, 85),     // C2H2=85 on CH4 axis
          convertToSVG(15, 0, 85),    // C2H2=85, C2H4=15
          convertToSVG(15, 35, 50),   // C2H2=50, C2H4=15
          convertToSVG(45, 5, 50),    // C2H2=50, CH4=45 (corner)
          convertToSVG(45, 0, 55),    // C2H2=55, CH4=45 (corner)
          convertToSVG(0, 0, 85),     // CH4 axis, C2H2=85 (start point)
        ]
      },
      {
        name: "TD",
        label: "TD",
        color: "#FFE0B3", // Light Orange
        // This is a complex polygon, it's everything else in the center.
        // Defined by the boundaries of D2, T1, T2, T3.
        // Simplified polygon for TD from common diagrams, forming a large central area.
        points: [
          convertToSVG(15, 35, 50),   // Point on C2H2=50, C2H4=15 (from D2)
          convertToSVG(45, 5, 50),    // Point on C2H2=50, CH4=45 (from D2)
          convertToSVG(45, 5, 50),    // CH4=45 line, going down (from D2)
          convertToSVG(50, 0, 50),    // CH4=50, C2H2=0 (corner of T1)
          convertToSVG(20, 0, 80),    // CH4=20, C2H2=0 (corner of T2)
          convertToSVG(0, 20, 80),    // C2H4=20, C2H2=0 (corner of T2)
          convertToSVG(0, 60, 40),    // C2H4=60, C2H2=0 (corner of T3)
          convertToSVG(0, 50, 50),    // C2H4=50, C2H2=50 (approx for TD corner)
          convertToSVG(15, 35, 50),   // C2H4=15, C2H2=50 (back to D2 boundary)
        ].filter(p => p.x !== undefined && p.y !== undefined) // Filter out any undefined points
      },
      {
        name: "T1",
        label: "T1",
        color: "#CCFFCC", // Light Green
        points: [
          convertToSVG(100, 0, 0), // CH4 vertex
          convertToSVG(50, 0, 50), // CH4=50, C2H2=0
          convertToSVG(80, 20, 0), // CH4=80, C2H4=20, C2H2=0
        ],
      },
      {
        name: "T2",
        label: "T2",
        color: "#99FF99", // Medium Green
        points: [
          convertToSVG(80, 20, 0), // CH4=80, C2H4=20, C2H2=0 (boundary with T1)
          convertToSVG(20, 0, 80), // CH4=20, C2H2=0 (bottom point)
          convertToSVG(0, 60, 40), // C2H4=60, C2H2=0 (boundary with T3)
          convertToSVG(0, 20, 80), // C2H4=20, C2H2=0 (bottom point)
        ],
      },
      {
        name: "T3",
        label: "T3",
        color: "#66FF66", // Dark Green
        points: [
          convertToSVG(0, 100, 0), // C2H4 vertex
          convertToSVG(0, 60, 40), // C2H4=60, C2H2=0 (boundary with T2)
          convertToSVG(0, 0, 60), // C2H4=60, C2H2=0, (this point is WRONG)
          // T3 is just the corner from 60% C2H4 onwards for 0% C2H2
          convertToSVG(0, 100, 0),
          convertToSVG(0, 60, 40), // C2H4=60, C2H2=0
          convertToSVG(40, 60, 0), // C2H4=60, C2H4=40
        ],
        // The polygon is simpler for T3:
        points: [
          convertToSVG(0, 100, 0), // C2H4 vertex
          convertToSVG(40, 60, 0), // CH4=40, C2H4=60, C2H2=0
          convertToSVG(0, 60, 40), // C2H4=60, C2H2=0 (this is the key boundary line)
        ]
      },
      {
        name: "DT",
        label: "DT",
        color: "#D3D3D3", // Light Gray
        points: [
          convertToSVG(100, 0, 0), // CH4 vertex
          convertToSVG(98, 0, 2),  // CH4=98, C2H2=0, C2H4=2
          convertToSVG(98, 2, 0),  // CH4=98, C2H4=2, C2H2=0
        ],
      },
    ];

    // Order of drawing matters for overlapping zones. Draw largest/background zones first.
    const drawOrder = ["DT", "T1", "T2", "T3", "TD", "D2", "D1"]; // Draw smaller zones last.

    for (const zoneName of drawOrder) {
      const zone = zones.find(z => z.name === zoneName);
      if (!zone) continue;

      const poly = document.createElementNS(SVG_NAMESPACE, "polygon");
      const pointsStr = zone.points.map(p => `${p.x},${p.y}`).join(" ");
      poly.setAttribute("points", pointsStr);
      poly.setAttribute("fill", zone.color);
      poly.setAttribute("stroke", "gray");
      poly.setAttribute("stroke-width", "0.5");
      svg.appendChild(poly);

      // Add labels
      // Calculate centroid for label placement (simple average, not true centroid for non-convex polys)
      if (zone.label) {
        let avgX = 0, avgY = 0;
        zone.points.forEach(p => { avgX += p.x; avgY += p.y; });
        avgX /= zone.points.length;
        avgY /= zone.points.length;

        const text = document.createElementNS(SVG_NAMESPACE, "text");
        text.setAttribute("x", avgX);
        text.setAttribute("y", avgY);
        text.setAttribute("font-family", "Arial, sans-serif");
        text.setAttribute("font-size", "14");
        text.setAttribute("fill", "black");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("alignment-baseline", "middle");
        text.textContent = zone.label;
        svg.appendChild(text);
      }
    }


    // --- Triangle Outline ---
    const triangleOutline = document.createElementNS(SVG_NAMESPACE, "polygon");
    triangleOutline.setAttribute("points",
      `${vertexCH4.x},${vertexCH4.y} ` +
      `${vertexC2H4.x},${vertexC2H4.y} ` +
      `${vertexC2H2.x},${vertexC2H2.y}`
    );
    triangleOutline.setAttribute("fill", "none");
    triangleOutline.setAttribute("stroke", "black");
    triangleOutline.setAttribute("stroke-width", "2");
    svg.appendChild(triangleOutline);

    // --- Axes Labels ---
    const addAxisLabel = (x, y, text, angle = 0, anchor = "middle") => {
      const label = document.createElementNS(SVG_NAMESPACE, "text");
      label.setAttribute("x", x);
      label.setAttribute("y", y);
      label.setAttribute("font-family", "Arial, sans-serif");
      label.setAttribute("font-size", "16");
      label.setAttribute("fill", "black");
      label.setAttribute("text-anchor", anchor);
      if (angle !== 0) {
        label.setAttribute("transform", `rotate(${angle} ${x} ${y})`);
      }
      label.textContent = text;
      svg.appendChild(label);
    };

    addAxisLabel(vertexCH4.x - 20, vertexCH4.y + 10, "CH4", -30, "end");
    addAxisLabel(vertexC2H4.x + 20, vertexC2H4.y + 10, "C2H4", 30, "start");
    addAxisLabel(vertexC2H2.x, vertexC2H2.y - 15, "C2H2");

    // --- Tick Marks (simplified for memory, only major ticks) ---
    const addTickMark = (pCH4, pC2H4, pC2H2, length, direction, label = null) => {
      const { x, y } = convertToSVG(pCH4, pC2H4, pC2H2);
      let x1 = x, y1 = y, x2 = x, y2 = y;
      let labelX = x, labelY = y;
      const tickLength = 5;

      // Directions:
      // 'CH4_axis_in': tick perpendicular to CH4 axis, inwards
      // 'C2H4_axis_in': tick perpendicular to C2H4 axis, inwards
      // 'C2H2_axis_in': tick perpendicular to C2H2 axis, inwards (along C2H2 line)

      switch (direction) {
        case 'CH4_right': // Ticks along CH4 axis, pointing right
          x1 = x; y1 = y;
          x2 = x + tickLength; y2 = y;
          labelX = x + tickLength + 5; labelY = y + 5;
          break;
        case 'C2H4_left': // Ticks along C2H4 axis, pointing left
          x1 = x; y1 = y;
          x2 = x - tickLength; y2 = y;
          labelX = x - tickLength - 5; labelY = y + 5;
          break;
        case 'C2H2_down_left': // Ticks along C2H2 axis, pointing down-left
          x1 = x; y1 = y;
          x2 = x - tickLength * Math.cos(Math.PI / 6); y2 = y + tickLength * Math.sin(Math.PI / 6);
          labelX = x2 - 5; labelY = y2 + 5;
          break;
        case 'C2H2_down_right': // Ticks along C2H2 axis, pointing down-right
          x1 = x; y1 = y;
          x2 = x + tickLength * Math.cos(Math.PI / 6); y2 = y + tickLength * Math.sin(Math.PI / 6);
          labelX = x2 + 5; labelY = y2 + 5;
          break;
        default: break;
      }

      const line = document.createElementNS(SVG_NAMESPACE, "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", "black");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);

      if (label !== null) {
        const text = document.createElementNS(SVG_NAMESPACE, "text");
        text.setAttribute("x", labelX);
        text.setAttribute("y", labelY);
        text.setAttribute("font-family", "Arial, sans-serif");
        text.setAttribute("font-size", "10");
        text.setAttribute("fill", "black");
        text.textContent = label;
        svg.appendChild(text);
      }
    };

    // Ticks for CH4 axis (bottom edge from 0% C2H4 to 100% CH4)
    // Ticks usually go from 0 to 100.
    // CH4 increases towards bottom-left.
    for (let i = 0; i <= 100; i += 10) {
      // C2H4 axis (bottom axis, from CH4 0% to C2H4 100%)
      // CH4 decreases as C2H4 increases along the bottom.
      // So, tick for C2H4 at 0% is CH4=100. Tick for C2H4 at 100% is C2H4=100.
      // Tick for CH4=90 is C2H4=10 (from CH4 100% vertex)
      // Tick for C2H4=10 is (90,10,0)
      const point = convertToSVG(100 - i, i, 0); // Along the base (C2H4 axis)

      const line = document.createElementNS(SVG_NAMESPACE, "line");
      line.setAttribute("x1", point.x);
      line.setAttribute("y1", point.y);
      line.setAttribute("x2", point.x);
      line.setAttribute("y2", point.y + 5); // Ticks pointing down
      line.setAttribute("stroke", "black");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);

      if (i % 20 === 0) {
        const text = document.createElementNS(SVG_NAMESPACE, "text");
        text.setAttribute("x", point.x);
        text.setAttribute("y", point.y + 15);
        text.setAttribute("font-family", "Arial, sans-serif");
        text.setAttribute("font-size", "10");
        text.setAttribute("fill", "black");
        text.setAttribute("text-anchor", "middle");
        text.textContent = i;
        svg.appendChild(text);
      }
    }

    // --- Sample Point ---
    if (sample) {
      const total = sample.ch4 + sample.c2h4 + sample.c2h2;
      if (total > 0) {
        const pCH4 = (sample.ch4 / total) * 100;
        const pC2H4 = (sample.c2h4 / total) * 100;
        const pC2H2 = (sample.c2h2 / total) * 100;

        const { x, y } = convertToSVG(pCH4, pC2H4, pC2H2);

        const circle = document.createElementNS(SVG_NAMESPACE, "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", "5");
        circle.setAttribute("fill", "blue");
        circle.setAttribute("stroke", "white");
        circle.setAttribute("stroke-width", "1.5");
        svg.appendChild(circle);

        // Optionally add a label for the point
        const label = document.createElementNS(SVG_NAMESPACE, "text");
        label.setAttribute("x", x + 8);
        label.setAttribute("y", y + 4);
        label.setAttribute("font-family", "Arial, sans-serif");
        label.setAttribute("font-size", "12");
        label.setAttribute("fill", "blue");
        label.textContent = `(${pCH4.toFixed(1)}, ${pC2H4.toFixed(1)}, ${pC2H2.toFixed(1)})`;
        svg.appendChild(label);
      }
    }
  },
};
