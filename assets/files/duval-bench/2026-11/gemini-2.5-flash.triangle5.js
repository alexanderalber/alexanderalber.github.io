const DuvalTriangle5 = {
  /**
   * Classifies dissolved gas concentrations into a fault zone for Duval Triangle 5.
   * Based on C2H4, CH4, C2H6 percentages.
   * Prioritized classification rules based on memory.
   *
   * @param {number} ch4 Methane concentration in ppm (non-negative).
   * @param {number} c2h4 Ethylene concentration in ppm (non-negative).
   * @param {number} c2h6 Ethane concentration in ppm (non-negative).
   * @returns {string} The short code of the fault zone (e.g., "ND", "LTC", "D1", "LT", "T2").
   */
  classify(ch4, c2h4, c2h6) {
    const total = ch4 + c2h4 + c2h6;

    if (total === 0) {
      // Per problem statement, sum is greater than zero, but good practice to handle.
      // If sum is zero, it's undefined, or can be considered "Normal Degradation".
      return "ND"; 
    }

    const pCH4 = (ch4 / total) * 100;
    const pC2H4 = (c2h4 / total) * 100;
    const pC2H6 = (c2h6 / total) * 100;

    // Classification rules (ordered by priority):
    // 1. ND (Normal Degradation)
    if (pC2H6 > 90) {
      return "ND";
    }
    // 2. D1 (Low Energy Discharge)
    // This zone is typically characterized by a high C2H4 content.
    if (pC2H4 > 20) {
      return "D1";
    }
    // 3. LT (Low-Temperature Fault)
    // This zone typically has high CH4 content.
    if (pCH4 > 40) {
      return "LT";
    }
    // 4. LTC (Low-Temperature Condition)
    // High C2H6, low CH4.
    // At this point, pC2H6 <= 90, pC2H4 <= 20, pCH4 <= 40.
    if (pC2H6 > 70 && pCH4 < 10) {
      return "LTC";
    }
    // 5. T2 (Thermal fault < 300°C)
    // The default for other conditions.
    return "T2";
  },

  /**
   * Renders the Duval Triangle 5 into an SVG element, including zones, labels,
   * axes, and an optional sample point.
   *
   * @param {SVGElement} svg An empty <svg> element with viewBox="0 0 600 540".
   * @param {object|null} sample An object {ch4, c2h4, c2h6} in ppm, or null.
   */
  render(svg, sample) {
    const SVG_NS = "http://www.w3.org/2000/svg";

    // Clear existing content in SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Helper to create SVG elements
    const createSVGElement = (tag, attributes = {}) => {
      const el = document.createElementNS(SVG_NS, tag);
      for (const key in attributes) {
        el.setAttribute(key, attributes[key]);
      }
      return el;
    };

    // Triangle vertices (SVG coordinates)
    const V_C2H6 = { x: 300, y: 0 }; // Top
    const V_C2H4 = { x: 0, y: 540 };  // Bottom-left
    const V_CH4 = { x: 600, y: 540 }; // Bottom-right

    /**
     * Converts gas percentages (0-100) to SVG coordinates (x, y) for the triangle.
     * @param {number} pCH4 CH4 percentage.
     * @param {number} pC2H4 C2H4 percentage.
     * @param {number} pC2H6 C2H6 percentage.
     * @returns {{x: number, y: number}} SVG coordinates.
     */
    const toSVGCoords = (pCH4, pC2H4, pC2H6) => {
      // Using barycentric coordinates for the fixed vertices
      const x = (pC2H4 * V_C2H4.x + pCH4 * V_CH4.x + pC2H6 * V_C2H6.x) / 100;
      const y = (pC2H4 * V_C2H4.y + pCH4 * V_CH4.y + pC2H6 * V_C2H6.y) / 100;
      return { x, y };
    };

    /**
     * Helper to format a list of barycentric point definitions into a SVG 'points' string.
     * @param {Array<Object>} pointDefs Array of {pCH4, pC2H4, pC2H6} objects.
     * @returns {string} SVG points string.
     */
    const getPolygonPoints = (pointDefs) => {
      return pointDefs.map(def => {
        const coords = toSVGCoords(def.pCH4, def.pC2H4, def.pC2H6);
        return `${coords.x},${coords.y}`;
      }).join(' ');
    };

    // Define zone polygons and their colors.
    // Draw in order of largest to smallest or based on overlaps to ensure coverage.
    const zones = [
      {
        name: "T2",
        color: "#90EE90", // Light green
        points: getPolygonPoints([
          { pCH4: 0, pC2H4: 0, pC2H6: 100 }, // V_C2H6
          { pCH4: 0, pC2H4: 100, pC2H6: 0 }, // V_C2H4
          { pCH4: 100, pC2H4: 0, pC2H6: 0 }  // V_CH4
        ]),
        label: { pCH4: 30, pC2H4: 30, pC2H6: 40 } // Central point for label
      },
      {
        name: "D1",
        color: "#FFB6C1", // Light pink
        // pC2H4 > 20 region
        points: getPolygonPoints([
          { pCH4: 0, pC2H4: 100, pC2H6: 0 },  // V_C2H4
          { pCH4: 0, pC2H4: 20, pC2H6: 80 },  // on pC2H4=20 line, near C2H6 axis
          { pCH4: 80, pC2H4: 20, pC2H6: 0 },  // on pC2H4=20 line, near CH4 axis
          { pCH4: 100, pC2H4: 0, pC2H6: 0 }   // V_CH4
        ]),
        label: { pCH4: 40, pC2H4: 40, pC2H6: 20 }
      },
      {
        name: "LT",
        color: "#FFA500", // Orange
        // pCH4 > 40 region, excluding D1
        // This polygon is defined by: V_CH4, point on pCH4=40 with pC2H6=0,
        // point on pCH4=40 with pC2H4=20, point on pC2H4=20 with pCH4=80.
        points: getPolygonPoints([
          { pCH4: 100, pC2H4: 0, pC2H6: 0 },  // V_CH4
          { pCH4: 40, pC2H4: 0, pC2H6: 60 },  // on pCH4=40 line, near C2H6 axis
          { pCH4: 40, pC2H4: 20, pC2H6: 40 }, // intersection of pCH4=40 and pC2H4=20
          { pCH4: 80, pC2H4: 20, pC2H6: 0 }   // on pC2H4=20 line, near CH4 axis
        ]),
        label: { pCH4: 60, pC2H4: 10, pC2H6: 30 }
      },
      {
        name: "LTC",
        color: "#ADD8E6", // Light blue
        // pC2H6 > 70 && pCH4 < 10 region, excluding ND
        points: getPolygonPoints([
          { pCH4: 0, pC2H4: 10, pC2H6: 90 },  // bottom-left of ND
          { pCH4: 10, pC2H4: 0, pC2H6: 90 },  // bottom-right of ND
          { pCH4: 10, pC2H4: 20, pC2H6: 70 }, // intersection of pC2H6=70 and pCH4=10
          { pCH4: 0, pC2H4: 30, pC2H6: 70 }   // on pC2H6=70 line, near C2H4 axis
        ]),
        label: { pCH4: 5, pC2H4: 15, pC2H6: 80 }
      },
      {
        name: "ND",
        color: "#D3D3D3", // Light grey
        // pC2H6 > 90 region
        points: getPolygonPoints([
          { pCH4: 0, pC2H4: 0, pC2H6: 100 }, // V_C2H6
          { pCH4: 10, pC2H4: 0, pC2H6: 90 }, // on pC2H6=90 line, near CH4 axis
          { pCH4: 0, pC2H4: 10, pC2H6: 90 }  // on pC2H6=90 line, near C2H4 axis
        ]),
        label: { pCH4: 5, pC2H4: 5, pC2H6: 90 }
      }
    ];

    // Draw main triangle outline
    svg.appendChild(createSVGElement("polygon", {
      points: `${V_C2H6.x},${V_C2H6.y} ${V_C2H4.x},${V_C2H4.y} ${V_CH4.x},${V_CH4.y}`,
      fill: "none",
      stroke: "black",
      "stroke-width": 2
    }));

    // Draw and label zones
    zones.forEach(zone => {
      svg.appendChild(createSVGElement("polygon", {
        points: zone.points,
        fill: zone.color,
        stroke: "none" // Zone internal borders can be drawn later if needed
      }));

      const labelCoords = toSVGCoords(zone.label.pCH4, zone.label.pC2H4, zone.label.pC2H6);
      svg.appendChild(createSVGElement("text", {
        x: labelCoords.x,
        y: labelCoords.y,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": "16",
        "font-weight": "bold",
        fill: "#333"
      })).textContent = zone.name;
    });

    // Draw the internal zone boundary lines for clarity
    svg.appendChild(createSVGElement("polyline", {
      points: getPolygonPoints([{ pCH4: 10, pC2H4: 0, pC2H6: 90 }, { pCH4: 0, pC2H4: 10, pC2H6: 90 }]),
      stroke: "black", "stroke-width": 1, fill: "none"
    })); // ND boundary
    svg.appendChild(createSVGElement("polyline", {
      points: getPolygonPoints([{ pCH4: 0, pC2H4: 30, pC2H6: 70 }, { pCH4: 10, pC2H4: 20, pC2H6: 70 }]),
      stroke: "black", "stroke-width": 1, fill: "none"
    })); // LTC bottom boundary (part)
    svg.appendChild(createSVGElement("polyline", {
      points: getPolygonPoints([{ pCH4: 0, pC2H4: 20, pC2H6: 80 }, { pCH4: 80, pC2H4: 20, pC2H6: 0 }]),
      stroke: "black", "stroke-width": 1, fill: "none"
    })); // D1 upper boundary
    svg.appendChild(createSVGElement("polyline", {
      points: getPolygonPoints([{ pCH4: 40, pC2H4: 0, pC2H6: 60 }, { pCH4: 40, pC2H4: 20, pC2H6: 40 }]),
      stroke: "black", "stroke-width": 1, fill: "none"
    })); // LT left boundary (part)

    // Axis labels (gas names)
    svg.appendChild(createSVGElement("text", { x: V_C2H6.x, y: V_C2H6.y + 20, "text-anchor": "middle", "font-size": "20", "font-weight": "bold", fill: "black" })).textContent = "C2H6";
    svg.appendChild(createSVGElement("text", { x: V_C2H4.x + 30, y: V_C2H4.y - 10, "text-anchor": "start", "font-size": "20", "font-weight": "bold", fill: "black" })).textContent = "C2H4";
    svg.appendChild(createSVGElement("text", { x: V_CH4.x - 30, y: V_CH4.y - 10, "text-anchor": "end", "font-size": "20", "font-weight": "bold", fill: "black" })).textContent = "CH4";

    // Tick marks and percentage labels
    const tickLength = 8;
    for (let i = 10; i <= 90; i += 10) {
      // C2H6 axis (right side, CH4 scale)
      const p1 = toSVGCoords(i, 0, 100 - i); // On CH4-C2H6 side
      const p2 = toSVGCoords(i, 0, 100 - i); // Point for label
      svg.appendChild(createSVGElement("line", {
        x1: p1.x, y1: p1.y,
        x2: p1.x + tickLength * Math.cos(Math.PI / 6), y2: p1.y + tickLength * Math.sin(Math.PI / 6),
        stroke: "black", "stroke-width": 1
      }));
      svg.appendChild(createSVGElement("text", {
        x: p2.x + 20, y: p2.y + 10,
        "text-anchor": "start", "font-size": "12", fill: "black"
      })).textContent = `${i}%`;

      // C2H4 axis (left side, CH4 scale)
      const p3 = toSVGCoords(100 - i, i, 0); // On C2H4-CH4 side (base)
      const p4 = toSVGCoords(100 - i, i, 0); // Point for label
      svg.appendChild(createSVGElement("line", {
        x1: p3.x, y1: p3.y,
        x2: p3.x, y2: p3.y + tickLength,
        stroke: "black", "stroke-width": 1
      }));
      svg.appendChild(createSVGElement("text", {
        x: p4.x, y: p4.y + 20,
        "text-anchor": "middle", "font-size": "12", fill: "black"
      })).textContent = `${i}%`;

      // CH4 axis (left side, C2H4 scale)
      const p5 = toSVGCoords(0, i, 100 - i); // On C2H6-C2H4 side
      const p6 = toSVGCoords(0, i, 100 - i); // Point for label
      svg.appendChild(createSVGElement("line", {
        x1: p5.x, y1: p5.y,
        x2: p5.x - tickLength * Math.cos(Math.PI / 6), y2: p5.y + tickLength * Math.sin(Math.PI / 6),
        stroke: "black", "stroke-width": 1
      }));
      svg.appendChild(createSVGElement("text", {
        x: p6.x - 20, y: p6.y + 10,
        "text-anchor": "end", "font-size": "12", fill: "black"
      })).textContent = `${i}%`;
    }


    // Draw sample point if provided
    if (sample && (sample.ch4 + sample.c2h4 + sample.c2h6 > 0)) {
      const totalSample = sample.ch4 + sample.c2h4 + sample.c2h6;
      const pCH4 = (sample.ch4 / totalSample) * 100;
      const pC2H4 = (sample.c2h4 / totalSample) * 100;
      const pC2H6 = (sample.c2h6 / totalSample) * 100;

      const sampleCoords = toSVGCoords(pCH4, pC2H4, pC2H6);

      svg.appendChild(createSVGElement("circle", {
        cx: sampleCoords.x,
        cy: sampleCoords.y,
        r: 6,
        fill: "red",
        stroke: "black",
        "stroke-width": 1
      }));

      // Optionally, add a text label for the sample point (e.g., its fault zone)
      const faultZone = DuvalTriangle5.classify(sample.ch4, sample.c2h4, sample.c2h6);
      svg.appendChild(createSVGElement("text", {
        x: sampleCoords.x + 10,
        y: sampleCoords.y - 10,
        "font-size": "14",
        fill: "red",
        "font-weight": "bold"
      })).textContent = `Sample: ${faultZone}`;
    }
  }
};
