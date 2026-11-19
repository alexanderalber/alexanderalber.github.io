const DuvalPentagon = {
  // Helper to create SVG elements
  _createSVGElement(tag, attributes) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attributes) {
      for (const key in attributes) {
        el.setAttribute(key, attributes[key]);
      }
    }
    return el;
  },

  // Helper to calculate coordinates for a vertex on the pentagon
  // angle in degrees, 0 at top, clockwise
  _getVertex(angle, radius = 1) {
    const rad = (angle - 90) * (Math.PI / 180);
    return {
      x: Math.cos(rad) * radius,
      y: Math.sin(rad) * radius
    };
  },

  // Helper to check if a point is inside a polygon
  _isInside(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  classify(h2, ch4, c2h6, c2h4, c2h2) {
    const sum = h2 + ch4 + c2h6 + c2h4 + c2h2;
    if (sum === 0) return null;

    // Percentages
    const p = {
      h2: h2 / sum,
      c2h2: c2h2 / sum,
      c2h4: c2h4 / sum,
      c2h6: c2h6 / sum,
      ch4: ch4 / sum
    };

    // Vertices angles (0 at top, clockwise)
    // H2: 0, C2H2: 72, C2H4: 144, C2H6: 216, CH4: 288
    const angles = { h2: 0, c2h2: 72, c2h4: 144, c2h6: 216, ch4: 288 };
    
    // Calculate point coordinates (weighted average of vertices)
    let x = 0, y = 0;
    for (const gas in p) {
      const v = this._getVertex(angles[gas]);
      x += p[gas] * v.x;
      y += p[gas] * v.y;
    }

    // Determine Zone
    // Distance from center
    const dist = Math.sqrt(x * x + y * y);
    // Angle (0 at top, clockwise)
    let angle = Math.atan2(y, x) * (180 / Math.PI);
    angle += 90; 
    if (angle < 0) angle += 360;

    // Zone Definitions based on best recollection of Duval Pentagon 1
    // M: Center (dist < 0.25)
    // PD: Top (H2)
    // D1: H2-C2H2 edge
    // D2: C2H2 vertex
    // T3: C2H2-C2H4 edge
    // T2: C2H4 vertex
    // T1: C2H6 vertex
    // S: C2H6-CH4 edge

    if (dist < 0.22) return "M";

    // Angle ranges (approximate)
    if (angle >= 330 || angle < 30) return "PD";       // H2
    if (angle >= 30 && angle < 60) return "D1";        // H2-C2H2
    if (angle >= 60 && angle < 85) return "D2";        // C2H2
    if (angle >= 85 && angle < 130) return "T3";       // C2H2-C2H4
    if (angle >= 130 && angle < 155) return "T2";      // C2H4
    if (angle >= 155 && angle < 205) return "T1";      // C2H6
    return "S";                                        // C2H6-CH4-H2 (Left side)
  },

  render(svg, sample) {
    // Clear SVG
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    svg.setAttribute("viewBox", "0 0 600 600");
    
    const cx = 300, cy = 300, r = 200;
    
    // Helper to map logical coords to SVG
    const toSVG = (p) => ({
      x: cx + p.x * r,
      y: cy - p.y * r // Invert Y for SVG
    });

    // Define Vertices
    const vertices = [
      this._getVertex(0),    // H2
      this._getVertex(72),   // C2H2
      this._getVertex(144),  // C2H4
      this._getVertex(216),  // C2H6
      this._getVertex(288)   // CH4
    ];
    const labels = ["H₂", "C₂H₂", "C₂H₄", "C₂H₆", "CH₄"];

    // Draw Outer Pentagon
    const outerPath = vertices.map((v, i) => {
      const p = toSVG(v);
      return (i === 0 ? "M" : "L") + `${p.x},${p.y}`;
    }).join(" ") + "Z";
    
    const outerPoly = this._createSVGElement("path", {
      d: outerPath,
      fill: "none",
      stroke: "#000",
      "stroke-width": 2
    });
    svg.appendChild(outerPoly);

    // Draw Axes
    vertices.forEach((v, i) => {
      const p = toSVG(v);
      const line = this._createSVGElement("line", {
        x1: cx, y1: cy, x2: p.x, y2: p.y,
        stroke: "#ccc", "stroke-width": 1
      });
      svg.appendChild(line);

      // Labels
      const labelPos = toSVG({ x: v.x * 1.15, y: v.y * 1.15 });
      const text = this._createSVGElement("text", {
        x: labelPos.x, y: labelPos.y,
        "text-anchor": "middle", "dominant-baseline": "middle",
        "font-size": "14px", "font-weight": "bold"
      });
      text.textContent = labels[i];
      svg.appendChild(text);
    });

    // Draw Zones (Approximated Polygons)
    // Center M
    const innerR = 0.22;
    const innerVerts = vertices.map(v => ({ x: v.x * innerR, y: v.y * innerR }));
    const mPath = innerVerts.map((v, i) => {
      const p = toSVG(v);
      return (i === 0 ? "M" : "L") + `${p.x},${p.y}`;
    }).join(" ") + "Z";
    
    const mPoly = this._createSVGElement("path", {
      d: mPath, fill: "#f0f0f0", stroke: "#999", "stroke-width": 1
    });
    svg.appendChild(mPoly);
    const mText = this._createSVGElement("text", {
      x: cx, y: cy, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": "12px"
    });
    mText.textContent = "M";
    svg.appendChild(mText);

    // Zone Colors & Definitions
    // Using radial slices for simplicity in generation
    const zones = [
      { id: "PD", color: "#FFFFCC", range: [330, 360], label: "PD" },
      { id: "PD", color: "#FFFFCC", range: [0, 30], label: "" }, // Split PD
      { id: "D1", color: "#FFCC99", range: [30, 60], label: "D1" },
      { id: "D2", color: "#FF9999", range: [60, 85], label: "D2" },
      { id: "T3", color: "#CC99FF", range: [85, 130], label: "T3" },
      { id: "T2", color: "#99CCFF", range: [130, 155], label: "T2" },
      { id: "T1", color: "#99FF99", range: [155, 205], label: "T1" },
      { id: "S", color: "#CCCCCC", range: [205, 330], label: "S" }
    ];

    zones.forEach(zone => {
      if (zone.range[0] >= zone.range[1]) return; // Skip split parts for simple drawing logic if needed, but here we draw slices
      const startAngle = zone.range[0];
      const endAngle = zone.range[1];
      
      const p1 = toSVG({ x: vertices[0].x * innerR, y: vertices[0].y * innerR }); // Start inner (approx)
      // We need precise inner points based on angle
      const vStartInner = this._getVertex(startAngle, innerR);
      const vEndInner = this._getVertex(endAngle, innerR);
      const vStartOuter = this._getVertex(startAngle, 1);
      const vEndOuter = this._getVertex(endAngle, 1);

      const spI = toSVG(vStartInner);
      const epI = toSVG(vEndInner);
      const spO = toSVG(vStartOuter);
      const epO = toSVG(vEndOuter);

      const pathStr = `M ${spI.x},${spI.y} L ${spO.x},${spO.y} L ${epO.x},${epO.y} L ${epI.x},${epI.y} Z`;
      
      const poly = this._createSVGElement("path", {
        d: pathStr, fill: zone.color, stroke: "#fff", "stroke-width": 1, opacity: 0.8
      });
      svg.appendChild(poly);

      // Label
      const midAngle = (startAngle + endAngle) / 2;
      const vMid = this._getVertex(midAngle, 0.6);
      const pMid = toSVG(vMid);
      const text = this._createSVGElement("text", {
        x: pMid.x, y: pMid.y, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": "10px", "font-weight": "bold"
      });
      text.textContent = zone.label;
      svg.appendChild(text);
    });

    // Draw Sample
    if (sample) {
      const sum = sample.h2 + sample.ch4 + sample.c2h6 + sample.c2h4 + sample.c2h2;
      if (sum > 0) {
        const p = {
          h2: sample.h2 / sum,
          c2h2: sample.c2h2 / sum,
          c2h4: sample.c2h4 / sum,
          c2h6: sample.c2h6 / sum,
          ch4: sample.ch4 / sum
        };
        const angles = { h2: 0, c2h2: 72, c2h4: 144, c2h6: 216, ch4: 288 };
        let x = 0, y = 0;
        for (const gas in p) {
          const v = this._getVertex(angles[gas]);
          x += p[gas] * v.x;
          y += p[gas] * v.y;
        }
        const svgPoint = toSVG({ x, y });
        const circle = this._createSVGElement("circle", {
          cx: svgPoint.x, cy: svgPoint.y, r: 6, fill: "#000", stroke: "#fff", "stroke-width": 2
        });
        svg.appendChild(circle);
      }
    }
  }
};
