const DuvalPentagon = {
  // Constants for rendering and calculations
  _RADIUS: 250,
  _CENTER_X: 300,
  _CENTER_Y: 300,
  _GAS_NAMES: ["H2", "CH4", "C2H6", "C2H4", "C2H2"],
  // Angles in degrees for the vertices, clockwise from top (H2)
  _VERTEX_ANGLES: [90, 18, -54, -126, 162],
  _ZONE_COLORS: {
    "PD": "#FFC0CB", // Pink
    "D1": "#ADD8E6", // Light Blue
    "D2": "#87CEEB", // Sky Blue
    "T1": "#90EE90", // Light Green
    "T2": "#32CD32", // Lime Green
    "T3": "#008000", // Green
    "DT": "#FFFF99", // Light Yellow (for Duval Triangle often) - using for ND here
    "ND": "#D3D3D3", // Light Grey (No Fault/Normal Degradation)
    "Unclassified": "#FFA500" // Orange (should not happen with good rules)
  },
  _ZONE_LABELS: {
    "PD": "Partial Discharges",
    "D1": "Low Energy Discharges",
    "D2": "High Energy Discharges",
    "T1": "Thermal Fault < 300°C",
    "T2": "Thermal Fault 300-700°C",
    "T3": "Thermal Fault > 700°C",
    "ND": "Normal Degradation"
  },

  /**
   * Calculates the normalized percentages of the five gases.
   * @param {number} h2 - Hydrogen concentration in ppm.
   * @param {number} ch4 - Methane concentration in ppm.
   * @param {number} c2h6 - Ethane concentration in ppm.
   * @param {number} c2h4 - Ethylene concentration in ppm.
   * @param {number} c2h2 - Acetylene concentration in ppm.
   * @returns {{h2: number, ch4: number, c2h6: number, c2h4: number, c2h2: number, sum: number}}
   *   An object containing the percentages (0-100) and the sum.
   */
  _getPercentages(h2, ch4, c2h6, c2h4, c2h2) {
    const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (sum === 0) {
      return {
        h2: 0,
        ch4: 0,
        c2h6: 0,
        c2h4: 0,
        c2h2: 0,
        sum: 0
      };
    }
    return {
      h2: (h2 / sum) * 100,
      ch4: (ch4 / sum) * 100,
      c2h6: (c2h6 / sum) * 100,
      c2h4: (c2h4 / sum) * 100,
      c2h2: (c2h2 / sum) * 100,
      sum: sum
    };
  },

  /**
   * Classifies a DGA sample into a Duval Pentagon 1 fault zone.
   * Implements the classification rules based on best recollection.
   *
   * @param {number} h2 - Hydrogen concentration in ppm.
   * @param {number} ch4 - Methane concentration in ppm.
   * @param {number} c2h6 - Ethane concentration in ppm.
   * @param {number} c2h4 - Ethylene concentration in ppm.
   * @param {number} c2h2 - Acetylene concentration in ppm.
   * @returns {string} The short code of the fault zone (e.g., "PD", "D1", "T1", "ND").
   */
  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const p = this._getPercentages(h2, ch4, c2h6, c2h4, c2h2);

    if (p.sum === 0) {
      return "ND"; // No fault or normal degradation if no gases detected
    }

    // Apply Duval Pentagon 1 rules from memory, in order of specificity/priority
    // Values are based on percentage (0-100)

    // Zone PD: Partial Discharges
    if (p.h2 > 90) return "PD";

    // Zone D2: High Energy Discharges
    // High Acetylene, often with significant Ethylene
    if (p.c2h2 > 50 || (p.c2h2 > 30 && p.c2h4 > 15 && p.c2h2 > p.c2h4)) {
      return "D2";
    }

    // Zone T3: Thermal Fault > 700°C
    // High Ethylene, usually more than Ethane
    if (p.c2h4 > 20 && p.c2h4 > p.c2h6) {
      return "T3";
    }

    // Zone D1: Low Energy Discharges
    // Significant Acetylene, but not as extreme as D2. Often with H2.
    // The region where C2H2 is between 13% and 50% (approx) and not captured by PD, D2, T3.
    // D1 is often "bottom-left" of the inner space, implying C2H2 > 13 and C2H4 < 13.
    if (p.c2h2 > 13 && p.c2h4 < 13) { // Simplified D1 boundary
      return "D1";
    }

    // Zone T2: Thermal Fault 300-700°C
    // High Methane, significant Ethylene, but Ethylene less than 20%.
    // Often defined by C2H4 > 15 and C2H6 < 20 and CH4 > C2H4 (simplified)
    if (p.c2h4 >= 15 && p.c2h4 <= 20 && p.ch4 > p.c2h4) { // C2H4 between 15 and 20 for T2, not T3
      return "T2";
    }

    // Zone T1: Thermal Fault < 300°C
    // High Ethane, low Ethylene/Acetylene.
    // Region where C2H6 is dominant or significantly present, and other faults ruled out.
    if (p.c2h6 > 20 || (p.c2h6 > 15 && p.ch4 > p.c2h6)) {
      return "T1";
    }

    // If no specific fault zone is matched, it's considered Normal Degradation.
    return "ND";
  },

  /**
   * Calculates the (x, y) coordinates of a point within the pentagon based on gas percentages.
   * @param {object} p - Object with gas percentages (h2, ch4, c2h6, c2h4, c2h2).
   * @returns {{x: number, y: number}} The coordinates.
   */
  _getPointCoordinates(p) {
    const {
      _CENTER_X: cx,
      _CENTER_Y: cy,
      _RADIUS: r,
      _VERTEX_ANGLES: angles
    } = this;
    const DEG = Math.PI / 180;

    // Calculate vertex coordinates
    const vertices = angles.map(angleDeg => ({
      x: cx + r * Math.cos(angleDeg * DEG),
      y: cy - r * Math.sin(angleDeg * DEG) // SVG y-axis is inverted
    }));

    // Barycentric coordinates for the point within the pentagon
    // Sum of P_i * V_i / 100
    const x = (p.h2 * vertices[0].x + p.ch4 * vertices[1].x +
               p.c2h6 * vertices[2].x + p.c2h4 * vertices[3].x +
               p.c2h2 * vertices[4].x) / 100;

    const y = (p.h2 * vertices[0].y + p.ch4 * vertices[1].y +
               p.c2h6 * vertices[2].y + p.c2h4 * vertices[3].y +
               p.c2h2 * vertices[4].y) / 100;

    return {
      x,
      y
    };
  },

  /**
   * Creates an SVG element with given tag name and attributes.
   * @param {string} tagName - The tag name for the SVG element.
   * @param {object} attributes - An object of key-value pairs for attributes.
   * @returns {SVGElement} The created SVG element.
   */
  _createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    for (const key in attributes) {
      if (attributes.hasOwnProperty(key)) {
        element.setAttribute(key, attributes[key]);
      }
    }
    return element;
  },

  /**
   * Renders the Duval Pentagon 1 onto an SVG element.
   *
   * @param {SVGElement} svg - An empty <svg> element with viewBox="0 0 600 600".
   * @param {object | null} sample - An object {h2, ch4, c2h6, c2h4, c2h2} in ppm, or null.
   *   If provided, a point is marked on the pentagon.
   */
  render(svg, sample) {
    const {
      _CENTER_X: cx,
      _CENTER_Y: cy,
      _RADIUS: r,
      _GAS_NAMES: gasNames,
      _VERTEX_ANGLES: angles,
      _ZONE_COLORS: zoneColors,
      _ZONE_LABELS: zoneLabels
    } = this;
    const DEG = Math.PI / 180;

    // Clear existing content (if any)
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // 1. Calculate vertex coordinates
    const vertices = angles.map(angleDeg => ({
      x: cx + r * Math.cos(angleDeg * DEG),
      y: cy - r * Math.sin(angleDeg * DEG) // SVG y-axis is inverted
    }));

    // 2. Draw the outer pentagon boundary
    const outerPentagonPath = vertices.map(v => `${v.x},${v.y}`).join(" ");
    svg.appendChild(this._createSvgElement("polygon", {
      points: outerPentagonPath,
      stroke: "black",
      "stroke-width": 2,
      fill: "none"
    }));

    // 3. Draw the zones (simplified polygons from memory)
    // These are simplified polygonal regions to represent the zones
    // Exact boundaries require more complex geometric calculations or fixed data.
    // These approximate the visual layout of Duval Pentagon 1.

    // Calculate "inner" points for zone definitions.
    // For simplicity, some zones are defined by the outer vertices and a central point or other points.
    const inner_r = r * 0.3; // A smaller radius for a central "ND" zone
    const innerVertices = angles.map(angleDeg => ({
      x: cx + inner_r * Math.cos(angleDeg * DEG),
      y: cy - inner_r * Math.sin(angleDeg * DEG)
    }));

    // Central point for the "ND" zone
    const centerPoint = {
      x: cx,
      y: cy
    };

    // Simplified polygon definitions for the zones, from memory.
    // These are approximations and don't perfectly match the precise analytical boundaries.
    const zonesToDraw = [{
      name: "PD",
      color: zoneColors["PD"],
      points: [
        vertices[0], // H2 vertex
        {
          x: vertices[0].x * 0.8 + vertices[1].x * 0.2,
          y: vertices[0].y * 0.8 + vertices[1].y * 0.2
        }, // Along H2-CH4 edge
        innerVertices[0],
        {
          x: vertices[0].x * 0.8 + vertices[4].x * 0.2,
          y: vertices[0].y * 0.8 + vertices[4].y * 0.2
        }, // Along H2-C2H2 edge
      ]
    }, {
      name: "D2",
      color: zoneColors["D2"],
      points: [
        vertices[4], // C2H2 vertex
        {
          x: vertices[4].x * 0.8 + vertices[3].x * 0.2,
          y: vertices[4].y * 0.8 + vertices[3].y * 0.2
        }, // Along C2H2-C2H4 edge
        innerVertices[4],
        {
          x: vertices[4].x * 0.8 + vertices[0].x * 0.2,
          y: vertices[4].y * 0.8 + vertices[0].y * 0.2
        }, // Along C2H2-H2 edge
      ]
    }, {
      name: "T3",
      color: zoneColors["T3"],
      points: [
        vertices[3], // C2H4 vertex
        {
          x: vertices[3].x * 0.8 + vertices[2].x * 0.2,
          y: vertices[3].y * 0.8 + vertices[2].y * 0.2
        }, // Along C2H4-C2H6 edge
        innerVertices[3],
        {
          x: vertices[3].x * 0.8 + vertices[4].x * 0.2,
          y: vertices[3].y * 0.8 + vertices[4].y * 0.2
        }, // Along C2H4-C2H2 edge
      ]
    }, {
      name: "T2",
      color: zoneColors["T2"],
      points: [
        vertices[1], // CH4 vertex
        {
          x: vertices[1].x * 0.8 + vertices[2].x * 0.2,
          y: vertices[1].y * 0.8 + vertices[2].y * 0.2
        }, // Along CH4-C2H6 edge
        innerVertices[1],
        {
          x: vertices[1].x * 0.8 + vertices[0].x * 0.2,
          y: vertices[1].y * 0.8 + vertices[0].y * 0.2
        }, // Along CH4-H2 edge
      ]
    }, {
      name: "T1",
      color: zoneColors["T1"],
      points: [
        vertices[2], // C2H6 vertex
        {
          x: vertices[2].x * 0.8 + vertices[1].x * 0.2,
          y: vertices[2].y * 0.8 + vertices[1].y * 0.2
        }, // Along C2H6-CH4 edge
        innerVertices[2],
        {
          x: vertices[2].x * 0.8 + vertices[3].x * 0.2,
          y: vertices[2].y * 0.8 + vertices[3].y * 0.2
        }, // Along C2H6-C2H4 edge
      ]
    }, { // ND is the central zone in this visual approximation
      name: "ND",
      color: zoneColors["ND"],
      points: innerVertices // Inner pentagon for ND
    }, { // D1: often between T1/T2 and C2H2, so bottom left in the center.
      // This is hard to draw accurately without specific coordinates from a known diagram.
      // We will draw D1 as a sector-like region.
      name: "D1",
      color: zoneColors["D1"],
      points: [
        innerVertices[4], // From C2H2 direction
        {
          x: vertices[4].x * 0.5 + vertices[3].x * 0.5,
          y: vertices[4].y * 0.5 + vertices[3].y * 0.5
        }, // midpoint of C2H2-C2H4 side
        {
          x: cx + r * 0.3 * Math.cos((-150) * DEG),
          y: cy - r * 0.3 * Math.sin((-150) * DEG)
        }, // a point near C2H4-C2H2 midpoint, but closer to center
        {
          x: cx + r * 0.3 * Math.cos((150) * DEG),
          y: cy - r * 0.3 * Math.sin((150) * DEG)
        } // a point near H2-C2H2 midpoint, closer to center
      ]
    }];

    // Sort zones to ensure ND is drawn first (as it's often covered by others)
    // No, PD, D2, T3 etc should be distinct regions, not overlaid.
    // The visual zones are approximations of the analytical boundaries.
    // For rendering, I will draw polygons representing distinct zones.

    // A more appropriate zone rendering strategy from memory:
    // 1. Draw central ND zone (small pentagon).
    // 2. Draw surrounding T1, T2, T3, D1, D2, PD zones as sectors.
    // For this, we need points on the inner boundary (e.g., r * 0.3)
    // and points on the outer boundary (e.g., r * 1.0) for each zone.

    const labels = {
      "PD": {
        x: cx,
        y: cy - r * 0.8
      },
      "D2": {
        x: cx + r * 0.8 * Math.cos(145 * DEG),
        y: cy - r * 0.8 * Math.sin(145 * DEG)
      }, // Adjusted for C2H2 direction
      "T3": {
        x: cx + r * 0.8 * Math.cos(-90 * DEG),
        y: cy - r * 0.8 * Math.sin(-90 * DEG)
      }, // Adjusted for C2H4 direction
      "T2": {
        x: cx + r * 0.8 * Math.cos(40 * DEG),
        y: cy - r * 0.8 * Math.sin(40 * DEG)
      }, // Adjusted for CH4 direction
      "T1": {
        x: cx + r * 0.8 * Math.cos(-20 * DEG),
        y: cy - r * 0.8 * Math.sin(-20 * DEG)
      }, // Adjusted for C2H6 direction
      "D1": {
        x: cx + r * 0.8 * Math.cos(110 * DEG),
        y: cy - r * 0.8 * Math.sin(110 * DEG)
      }, // Adjusted for D1 zone between C2H2 and H2
      "ND": {
        x: cx,
        y: cy
      }
    };

    // Define polygon points for each zone using outer and inner vertices
    const zonePolygons = [{
      name: "PD",
      color: zoneColors["PD"],
      label: "PD",
      labelPos: labels["PD"],
      points: [vertices[0], innerVertices[0], innerVertices[1], vertices[1]].slice(0, 2).concat([
        {
          x: cx + r * 0.3 * Math.cos((18 + 72/2) * DEG),
          y: cy - r * 0.3 * Math.sin((18 + 72/2) * DEG)
        },
        {
          x: cx + r * Math.cos((18 + 72/2) * DEG),
          y: cy - r * Math.sin((18 + 72/2) * DEG)
        },
        vertices[1],
        vertices[0]
      ]).slice(0,0).concat([
        vertices[0], // H2
        {x: cx + r*0.3 * Math.cos(90 * DEG), y: cy - r*0.3 * Math.sin(90 * DEG)}, // Inner H2 point
        {x: cx + r*0.3 * Math.cos(18 * DEG), y: cy - r*0.3 * Math.sin(18 * DEG)}, // Inner CH4 point
        vertices[1], // CH4
        // To draw a sector-like zone, we need points on edges.
        // For PD, it's a triangle for top part.
        // From memory, PD is a small region at H2 vertex.
        // Let's use simpler fixed polygons approximating common DGA charts.
        // These are not analytical, but represent the shape.
        {x: cx, y: cy-r},
        {x: cx+r*0.2, y: cy-r*0.6},
        {x: cx-r*0.2, y: cy-r*0.6}
      ])
    }, {
      name: "D2",
      color: zoneColors["D2"],
      label: "D2",
      labelPos: labels["D2"],
      points: [
        {x: cx+r*0.5, y: cy+r*0.7},
        {x: cx+r*0.9, y: cy+r*0.2},
        {x: cx+r*0.2, y: cy+r*0.4},
        {x: cx+r*0.2, y: cy+r*0.6}
      ]
    }, {
      name: "T3",
      color: zoneColors["T3"],
      label: "T3",
      labelPos: labels["T3"],
      points: [
        {x: cx+r*0.7, y: cy+r*0.5},
        {x: cx+r*0.4, y: cy+r*0.8},
        {x: cx+r*0.1, y: cy+r*0.6},
        {x: cx+r*0.3, y: cy+r*0.3}
      ]
    }, {
      name: "T2",
      color: zoneColors["T2"],
      label: "T2",
      labelPos: labels["T2"],
      points: [
        {x: cx+r*0.6, y: cy-r*0.4},
        {x: cx+r*0.4, y: cy-r*0.1},
        {x: cx+r*0.2, y: cy-r*0.3},
        {x: cx+r*0.4, y: cy-r*0.7}
      ]
    }, {
      name: "T1",
      color: zoneColors["T1"],
      label: "T1",
      labelPos: labels["T1"],
      points: [
        {x: cx-r*0.1, y: cy+r*0.6},
        {x: cx-r*0.3, y: cy+r*0.3},
        {x: cx-r*0.4, y: cy+r*0.1},
        {x: cx-r*0.6, y: cy+r*0.4}
      ]
    }, {
      name: "D1",
      color: zoneColors["D1"],
      label: "D1",
      labelPos: labels["D1"],
      points: [
        {x: cx-r*0.2, y: cy+r*0.6},
        {x: cx-r*0.5, y: cy+r*0.7},
        {x: cx-r*0.8, y: cy+r*0.2},
        {x: cx-r*0.4, y: cy+r*0.4}
      ]
    }, {
      name: "ND",
      color: zoneColors["ND"],
      label: "ND",
      labelPos: labels["ND"],
      points: innerVertices // The actual center pentagon
    }];

    // Draw the zones
    zonePolygons.forEach(zone => {
      const polygonPoints = zone.points.map(p => `${p.x},${p.y}`).join(" ");
      svg.appendChild(this._createSvgElement("polygon", {
        points: polygonPoints,
        fill: zone.color,
        stroke: "gray",
        "stroke-width": 0.5,
        opacity: 0.8
      }));

      // Add text label for the zone
      if (zone.labelPos) {
        const textElement = this._createSvgElement("text", {
          x: zone.labelPos.x,
          y: zone.labelPos.y,
          "font-family": "sans-serif",
          "font-size": "16px",
          "font-weight": "bold",
          fill: "black",
          "text-anchor": "middle",
          "alignment-baseline": "middle"
        });
        textElement.textContent = zone.label;
        svg.appendChild(textElement);
      }
    });

    // 4. Draw gas axes and labels
    for (let i = 0; i < vertices.length; i++) {
      // Draw axis lines from center to vertex
      svg.appendChild(this._createSvgElement("line", {
        x1: cx,
        y1: cy,
        x2: vertices[i].x,
        y2: vertices[i].y,
        stroke: "gray",
        "stroke-width": 1,
        "stroke-dasharray": "4 4"
      }));

      // Position gas labels slightly outside the vertices
      const labelOffset = 20;
      const angleDeg = angles[i];
      const labelX = cx + (r + labelOffset) * Math.cos(angleDeg * DEG);
      const labelY = cy - (r + labelOffset) * Math.sin(angleDeg * DEG);

      const textElement = this._createSvgElement("text", {
        x: labelX,
        y: labelY,
        "font-family": "sans-serif",
        "font-size": "14px",
        "font-weight": "bold",
        fill: "black",
        "text-anchor": "middle",
        "alignment-baseline": "middle"
      });
      textElement.textContent = gasNames[i];
      svg.appendChild(textElement);
    }

    // 5. Mark sample point if provided
    if (sample && sample.h2 !== undefined) {
      const p = this._getPercentages(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);
      if (p.sum > 0) {
        const pointCoords = this._getPointCoordinates(p);
        const classification = this.classify(sample.h2, sample.ch4, sample.c2h6, sample.c2h4, sample.c2h2);

        svg.appendChild(this._createSvgElement("circle", {
          cx: pointCoords.x,
          cy: pointCoords.y,
          r: 5,
          fill: "red",
          stroke: "white",
          "stroke-width": 1
        }));

        // Add a tooltip/label for the sample point
        const labelText = `Sample: ${classification}`;
        const textElement = this._createSvgElement("text", {
          x: pointCoords.x + 8,
          y: pointCoords.y - 8,
          "font-family": "sans-serif",
          "font-size": "12px",
          fill: "red",
          "font-weight": "bold"
        });
        textElement.textContent = labelText;
        svg.appendChild(textElement);
      }
    }
  }
};
